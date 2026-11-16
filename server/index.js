import "dotenv/config";
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { CARD, renderCard, validateCard } from "../shared/cards.js";
import {
  authClient,
  authUrl,
  clearTokens,
  findImage,
  imageBytes,
  isConfigured,
  loadCatalog,
  oauth,
  readTokens,
  saveRecipe,
  saveTokens,
  uploadImage,
  withRevisions,
} from "./google.js";

const app = express();
const port = Number(process.env.PORT || 4173);
const states = new Map();
const csrf = crypto.randomBytes(24).toString("hex");
let imageCatalogCache = null;
function imageCatalog(auth) {
  if (imageCatalogCache && Date.now() - imageCatalogCache.at < 30_000)
    return imageCatalogCache.promise;
  const promise = loadCatalog(auth).catch((error) => {
    imageCatalogCache = null;
    throw error;
  });
  imageCatalogCache = { at: Date.now(), promise };
  return promise;
}
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
}
function sameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
    return res.status(403).json({ error: "Otillåtet ursprung." });
  if (req.method !== "GET" && req.get("x-matrika-csrf") !== csrf)
    return res
      .status(403)
      .json({ error: "Säkerhetsnyckel saknas. Ladda om sidan." });
  next();
}
app.get("/api/status", (req, res) =>
  res.json({
    configured: isConfigured(),
    authenticated: Boolean(readTokens()),
    driveConfigured: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID),
    csrf,
  }),
);
app.get("/auth/login", (req, res, next) => {
  try {
    const state = crypto.randomBytes(24).toString("hex");
    const referer = req.get("referer") || "";
    let returnTo = `http://127.0.0.1:${port}/`;
    try {
      const origin = new URL(referer).origin;
      if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) returnTo = `${origin}/`;
    } catch {}
    states.set(state, returnTo);
    setTimeout(() => states.delete(state), 10 * 60_000).unref();
    res.redirect(authUrl(state));
  } catch (error) {
    next(error);
  }
});
app.get(
  "/auth/callback",
  asyncRoute(async (req, res) => {
    const target = states.get(String(req.query.state || ""));
    if (!target)
      throw Object.assign(
        new Error("OAuth state är ogiltigt eller har löpt ut."),
        { status: 403 },
      );
    states.delete(String(req.query.state));
    if (req.query.error)
      throw new Error(`Google-inloggning avbröts: ${req.query.error}`);
    const { tokens } = await oauth().getToken(String(req.query.code || ""));
    saveTokens(tokens);
    res.redirect(target);
  }),
);
app.post("/auth/logout", sameOrigin, (req, res) => {
  clearTokens();
  res.json({ ok: true });
});
app.get(
  "/api/catalog",
  sameOrigin,
  asyncRoute(async (req, res) => {
    const catalog = withRevisions(await loadCatalog(authClient()));
    res.set("Cache-Control", "no-store");
    res.json({
      recipes: catalog.recipes,
      ingredientOptions: catalog.ingredientOptions,
      preparationOptions: catalog.preparationOptions,
      schema: catalog.schema,
    });
  }),
);
app.put(
  "/api/recipes/:id",
  sameOrigin,
  asyncRoute(async (req, res) => {
    if (req.params.id !== req.body.id)
      throw Object.assign(new Error("Rätt-ID kan inte ändras."), {
        status: 422,
      });
    const result = await saveRecipe(authClient(), req.params.id, req.body);
    imageCatalogCache = null;
    res.json(result);
  }),
);
app.get(
  "/api/recipes/:id/image",
  sameOrigin,
  asyncRoute(async (req, res) => {
    const auth = authClient();
    const recipe = (await imageCatalog(auth)).recipes.find(
      (r) => r.id === req.params.id,
    );
    if (!recipe) return res.sendStatus(404);
    const fileId = await findImage(auth, recipe);
    if (!fileId) return res.sendStatus(404);
    const bytes = await imageBytes(auth, fileId);
    const info = await sharp(bytes).metadata();
    res.set({
      "Content-Type": `image/${info.format === "jpeg" ? "jpeg" : info.format || "jpeg"}`,
      "Cache-Control": "private, no-store",
    });
    res.send(bytes);
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
  },
});
app.post(
  "/api/recipes/:id/image",
  sameOrigin,
  upload.single("image"),
  asyncRoute(async (req, res) => {
    if (!req.file)
      throw Object.assign(
        new Error("Välj en JPEG-, PNG- eller WebP-bild (max 15 MB)."),
        { status: 422 },
      );
    await sharp(req.file.buffer).metadata();
    const auth = authClient();
    const recipe = (await loadCatalog(auth)).recipes.find(
      (r) => r.id === req.params.id,
    );
    if (!recipe) return res.sendStatus(404);
    const imageId = await uploadImage(auth, recipe, req.file);
    imageCatalogCache = null;
    res.json({ imageId });
  }),
);
async function exportRecipe(req) {
  const recipe = req.body;
  if (!recipe?.id || !recipe?.name)
    throw Object.assign(new Error("Recept saknas."), { status: 422 });
  const auth = authClient();
  const fileId = await findImage(auth, recipe);
  if (fileId) {
    const bytes = await imageBytes(auth, fileId);
    const meta = await sharp(bytes).metadata();
    recipe.imageDataUrl = `data:image/${meta.format === "jpeg" ? "jpeg" : meta.format};base64,${bytes.toString("base64")}`;
  }
  const issues = validateCard(recipe);
  if (issues.some((x) => x.level === "error"))
    throw Object.assign(
      new Error(
        issues
          .filter((x) => x.level === "error")
          .map((x) => x.message)
          .join(" "),
      ),
      { status: 422 },
    );
  return recipe;
}
async function png(recipe, side) {
  return sharp(Buffer.from(renderCard(recipe, side)), { density: CARD.dpi })
    .resize(CARD.widthPx, CARD.heightPx)
    .png()
    .toBuffer();
}
app.post(
  "/api/export/png/:side",
  sameOrigin,
  asyncRoute(async (req, res) => {
    if (!["front", "back"].includes(req.params.side))
      return res.sendStatus(404);
    const recipe = await exportRecipe(req);
    res.set({
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${recipe.id}-${req.params.side}.png"`,
      "Cache-Control": "no-store",
    });
    res.send(await png(recipe, req.params.side));
  }),
);
app.post(
  "/api/export/proof",
  sameOrigin,
  asyncRoute(async (req, res) => {
    const recipe = await exportRecipe(req);
    const [front, back] = await Promise.all([
      png(recipe, "front"),
      png(recipe, "back"),
    ]);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const width = (CARD.widthMm * 72) / 25.4,
      height = (CARD.heightMm * 72) / 25.4;
    const y = 841.89 - 90 - height;
    const x1 = 65,
      x2 = 595.28 - 65 - width;
    page.drawImage(await pdf.embedPng(front), { x: x1, y, width, height });
    page.drawImage(await pdf.embedPng(back), { x: x2, y, width, height });
    for (const [x, label] of [
      [x1, "Framsida"],
      [x2, "Baksida"],
    ]) {
      page.drawText(label, {
        x,
        y: y - 20,
        size: 10,
        font,
        color: rgb(0.25, 0.3, 0.26),
      });
      page.drawRectangle({
        x: x + (3 * 72) / 25.4,
        y: y + (3 * 72) / 25.4,
        width: (63 * 72) / 25.4,
        height: (88 * 72) / 25.4,
        borderWidth: 0.4,
        borderColor: rgb(0.6, 0.6, 0.6),
        opacity: 0,
      });
    }
    page.drawText(
      `${recipe.id} · 69 × 94 mm inkl. 3 mm utfall · 300 dpi · skriv ut i 100 %`,
      { x: 65, y: 42, size: 9, font },
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${recipe.id}-proof.pdf"`,
      "Cache-Control": "no-store",
    });
    res.send(Buffer.from(await pdf.save()));
  }),
);
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}
app.use((error, req, res, next) => {
  const status = error.status || (error.code === 401 ? 401 : 500);
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(status).json({
    error:
      status >= 500
        ? `Google eller serverfel: ${error.message}`
        : error.message,
  });
});
app.listen(port, "127.0.0.1", () =>
  console.log(`Matrika API på http://127.0.0.1:${port}`),
);

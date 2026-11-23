import "dotenv/config";
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { FRONT_STYLES, renderCard, validateCard } from "../shared/cards.js";
import {
  DEFAULT_PRINT_PROFILE,
  resolvePrintProfile,
} from "../shared/print-profile.js";
import {
  authClient,
  authUrl,
  clearTokens,
  findImage,
  findImageFile,
  imageBytes,
  isConfigured,
  loadCatalog,
  oauth,
  readTokens,
  saveRecipe,
  saveImageVariant,
  saveTokens,
  uploadImage,
  withRevisions,
} from "./google.js";
import { cachedImage, imageEtag, invalidateImage } from "./image-cache.js";
import { normalizeCrop } from "../shared/image-crop.js";
import { recipeForProfile } from "../shared/image-variants.js";
import {
  photoQualityRule,
  photoQualityCheck,
} from "../shared/photo-quality.js";
import { renderSvgPng } from "./render-card-png.js";

const app = express();
const port = Number(process.env.PORT || 4173);
const states = new Map();
const csrf = crypto.randomBytes(24).toString("hex");
const deckJobs = new Map();
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
  if (req.method !== "GET" && req.get("x-matrik-csrf") !== csrf)
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
    imageCatalogCache = { at: Date.now(), promise: Promise.resolve(catalog) };
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
    const file = await findImageFile(auth, recipe);
    if (!file) return res.sendStatus(404);
    res.set({
      "Content-Type": file.mimeType,
      "Cache-Control": "private, no-cache",
      ETag: imageEtag(file),
    });
    if (req.fresh) return res.status(304).end();
    const bytes = await cachedImage(file, async () => {
      const data = await imageBytes(auth, file.id);
      await sharp(data).metadata();
      return data;
    });
    res.send(bytes);
  }),
);
app.get(
  "/api/recipes/:id/images/:variantId",
  sameOrigin,
  asyncRoute(async (req, res) => {
    const auth = authClient();
    const recipe = (await imageCatalog(auth)).recipes.find(
      (r) => r.id === req.params.id,
    );
    const variant = recipe?.imageVariants.find(
      (v) => v.id === req.params.variantId,
    );
    if (!variant) return res.sendStatus(404);
    const file = await findImageFile(auth, { imageId: variant.fileId });
    if (!file) return res.sendStatus(404);
    res.set({
      "Content-Type": file.mimeType,
      "Cache-Control": "private, no-cache",
      ETag: imageEtag(file),
    });
    if (req.fresh) return res.status(304).end();
    res.send(await cachedImage(file, () => imageBytes(auth, file.id)));
  }),
);
app.put(
  "/api/recipes/:id/images/:variantId",
  sameOrigin,
  asyncRoute(async (req, res) => {
    const recipe = await saveImageVariant(authClient(), req.params.id, {
      ...req.body,
      id: req.params.variantId,
    });
    imageCatalogCache = null;
    res.json(recipe);
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
    await invalidateImage(imageId);
    const meta = await sharp(req.file.buffer).metadata();
    const updated = await saveImageVariant(auth, recipe.id, {
      id: crypto.randomUUID(),
      fileId: imageId,
      width: meta.width,
      height: meta.height,
      selected: true,
      description: req.body.description || "",
    });
    imageCatalogCache = null;
    res.json({ imageId, recipe: updated });
  }),
);
async function exportRecipe(req) {
  const recipe = req.body;
  if (!recipe?.id || !recipe?.name)
    throw Object.assign(new Error("Recept saknas."), { status: 422 });
  recipe.frontStyle ||= "panel";
  if (!FRONT_STYLES.some((style) => style.id === recipe.frontStyle))
    throw Object.assign(new Error("Okänd framsidesvariant."), { status: 422 });
  recipe.printProfile ||= DEFAULT_PRINT_PROFILE;
  try {
    resolvePrintProfile(recipe.printProfile);
  } catch (error) {
    throw Object.assign(error, { status: 422 });
  }
  const auth = authClient();
  const selectedRecipe = (await loadCatalog(auth)).recipes.find(
    (r) => r.id === recipe.id,
  );
  if (!selectedRecipe)
    throw Object.assign(new Error("Recept saknas."), { status: 404 });
  recipe.imageId = selectedRecipe.imageId;
  recipe.imageCrop =
    recipe.selectedImageVariantId === selectedRecipe.selectedImageVariantId
      ? recipe.imageCrop
      : recipeForProfile(selectedRecipe, recipe.printProfile).imageCrop;
  recipe.imageWidth = selectedRecipe.imageWidth;
  recipe.imageHeight = selectedRecipe.imageHeight;
  const file = await findImageFile(auth, recipe);
  if (file) {
    const bytes = await cachedImage(file, async () => {
      const data = await imageBytes(auth, file.id);
      await sharp(data).metadata();
      return data;
    });
    const meta = await sharp(bytes).metadata();
    if (
      !meta.width ||
      !meta.height ||
      !photoQualityCheck(
        recipe,
        recipe.printProfile,
        meta.width,
        meta.height,
        recipe.imageCrop,
      ).possible
    )
      throw Object.assign(
        new Error(
          "Bilden har för låg originalupplösning för vald tryckprofil.",
        ),
        { status: 422 },
      );
    if (recipe.imageCrop)
      recipe.imageCrop = normalizeCrop(
        recipe.imageCrop,
        meta.width,
        meta.height,
        photoQualityRule(recipe, recipe.printProfile, meta.width, meta.height)
          .profile,
      );
    recipe.imageWidth = meta.width;
    recipe.imageHeight = meta.height;
    recipe.imageDataUrl = `data:image/${meta.format === "jpeg" ? "jpeg" : meta.format};base64,${bytes.toString("base64")}`;
  }
  const issues = validateCard(recipe, recipe.printProfile);
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
  return renderSvgPng(
    renderCard(recipe, side, {
      frontStyle: recipe.frontStyle,
      printProfile: recipe.printProfile,
    }),
    recipe.printProfile,
  );
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
      "Content-Disposition": `attachment; filename="${recipe.id}-${recipe.printProfile.id}-${req.params.side}.png"`,
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
    const profile = resolvePrintProfile(recipe.printProfile);
    const [front, back] = await Promise.all([
      png(recipe, "front"),
      png(recipe, "back"),
    ]);
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const width = (profile.widthMm * 72) / 25.4,
      height = (profile.heightMm * 72) / 25.4;
    if (width > 595.28 - 84 || height > 841.89 - 120)
      throw Object.assign(
        new Error("Tryckprofilen är för stor för A4 proof."),
        {
          status: 422,
        },
      );
    const y = 841.89 - 70 - height;
    const bothFit = 2 * width + 130 <= 595.28;
    const frontImage = await pdf.embedPng(front);
    const backImage = await pdf.embedPng(back);
    for (const [index, image, label] of [
      [0, frontImage, "Framsida"],
      [1, backImage, "Baksida"],
    ]) {
      const page =
        index === 0 || !bothFit
          ? pdf.addPage([595.28, 841.89])
          : pdf.getPages()[0];
      const x = bothFit
        ? index === 0
          ? 65
          : 595.28 - 65 - width
        : (595.28 - width) / 2;
      page.drawImage(image, { x, y, width, height });
      page.drawText(label, {
        x,
        y: y - 20,
        size: 10,
        font,
        color: rgb(0.25, 0.3, 0.26),
      });
      if (index === 1 || !bothFit)
        page.drawText(
          `${recipe.id} - ${profile.widthMm} x ${profile.heightMm} mm inklusive utfall - ${profile.dpi} dpi - skriv ut i 100 %`,
          { x: 42, y: 30, size: 9, font },
        );
    }
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${recipe.id}-proof.pdf"`,
      "Cache-Control": "no-store",
    });
    res.send(Buffer.from(await pdf.save()));
  }),
);
app.post("/api/export/deck", sameOrigin, (req, res) => {
  if (!readTokens())
    return res.status(401).json({ error: "Logga in hos Google först." });
  const format = req.body?.format;
  if (!["poker", "tarot"].includes(format))
    return res.status(422).json({ error: "Välj poker eller tarot." });
  if ([...deckJobs.values()].some((item) => item.status === "running"))
    return res.status(409).json({ error: "En kortlek exporteras redan." });
  const id = crypto.randomUUID();
  const out = path.resolve(
    ".local",
    "print",
    `${format}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${id.slice(0, 8)}`,
  );
  const job = {
    id,
    format,
    out,
    status: "running",
    progress: "Startar…",
    error: "",
  };
  deckJobs.set(id, job);
  const child = spawn(
    process.execPath,
    ["scripts/export-print-deck.js", "--format", format, "--out", out],
    { cwd: process.cwd(), env: process.env },
  );
  child.stdout.on("data", (chunk) => {
    job.progress = String(chunk).trim().split("\n").at(-1);
  });
  child.stderr.on("data", (chunk) => {
    job.error = (job.error + String(chunk)).slice(-4000);
  });
  child.on("error", (error) => {
    job.status = "error";
    job.error = error.message;
  });
  child.on("close", (code) => {
    if (job.status !== "running") return;
    job.status = code === 0 ? "done" : "error";
    if (code !== 0 && !job.error) job.error = `Exporten avbröts (${code}).`;
  });
  res.status(202).json(job);
});
app.get("/api/export/deck/:id", sameOrigin, (req, res) => {
  const job = deckJobs.get(req.params.id);
  if (!job) return res.sendStatus(404);
  res.set("Cache-Control", "no-store").json(job);
});
app.get("/api/export/deck/:id/zip", sameOrigin, (req, res) => {
  const job = deckJobs.get(req.params.id);
  if (!job || job.status !== "done") return res.sendStatus(404);
  res.set({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="matrik-${job.format}-${job.id.slice(0, 8)}.zip"`,
    "Cache-Control": "no-store",
  });
  const child = spawn(
    "zip",
    ["-q", "-r", "-", "cards", "manifest.json", "checklista.csv"],
    { cwd: job.out },
  );
  child.stdout.pipe(res);
  child.stderr.on("data", (chunk) => console.error(String(chunk)));
  child.on("error", (error) => {
    console.error(error);
    if (!res.headersSent) res.status(500).end("ZIP kunde inte skapas.");
    else res.destroy(error);
  });
  res.on("close", () => child.kill());
});
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
  console.log(`Matrik API på http://127.0.0.1:${port}`),
);

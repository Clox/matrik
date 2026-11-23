import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import {
  authClient,
  findImageFile,
  imageBytes,
  loadCatalog,
} from "../server/google.js";
import { cachedImage } from "../server/image-cache.js";
import { renderSvgPng } from "../server/render-card-png.js";
import { renderCard, validateCard } from "../shared/cards.js";
import { normalizeCrop } from "../shared/image-crop.js";
import { recipeForProfile } from "../shared/image-variants.js";
import {
  photoQualityRule,
  photoQualityCheck,
} from "../shared/photo-quality.js";
import { currentRecipes } from "../shared/recipe-status.js";
import {
  PRINT_PROFILES,
  resolvePrintProfile,
} from "../shared/print-profile.js";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const format = option("--format", "poker");
if (!["poker", "tarot"].includes(format))
  throw new Error("--format måste vara poker eller tarot.");
const selectedProfile = PRINT_PROFILES.find(
  (item) => item.id === `mpc-${format}`,
);
const profile = resolvePrintProfile(selectedProfile);
const out = path.resolve(
  option(
    "--out",
    `.local/print/${format}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
  ),
);
const expectedOption = option("--expected", null);
const expected = expectedOption === null ? null : Number(expectedOption);
const privateRoot = path.resolve(".local") + path.sep;
if (!out.startsWith(privateRoot))
  throw new Error("Tryckfiler måste sparas under .local.");
if (expected !== null && (!Number.isSafeInteger(expected) || expected < 1))
  throw new Error("Ogiltigt --expected.");
const cardsDir = path.join(out, "cards");
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const sortKey = (recipe) => [
  recipe.id.startsWith("M") ? 0 : 1,
  Number(recipe.id.slice(1)),
];

const auth = authClient();
const catalog = await loadCatalog(auth);
const recipes = currentRecipes(catalog.recipes).sort((a, b) => {
  const x = sortKey(a),
    y = sortKey(b);
  return x[0] - y[0] || x[1] - y[1];
});
if (expected !== null && recipes.length !== expected)
  throw new Error(`Väntade ${expected} recept, fick ${recipes.length}.`);
if (new Set(recipes.map((r) => r.id)).size !== recipes.length)
  throw new Error("Dubbla recept-ID:n.");
if (recipes.some((r) => !/^[MD]\d{3}$/.test(r.id)))
  throw new Error("Ogiltigt recept-ID.");

const existingCards = await fs.readdir(cardsDir).catch((error) => {
  if (error.code === "ENOENT") return [];
  throw error;
});
if (existingCards.length)
  throw new Error(
    "Utdatamappen innehåller redan kort. Välj en ny --out-katalog.",
  );
await fs.mkdir(cardsDir, { recursive: true, mode: 0o700 });
const entries = [];
for (const [index, sourceRecipe] of recipes.entries()) {
  const recipe = recipeForProfile(sourceRecipe, selectedProfile);
  const file = await findImageFile(auth, recipe);
  if (!file)
    throw new Error(
      `${recipe.id}: Bildlänken pekar inte på en giltig bild i Drive-mappen.`,
    );
  const image = await cachedImage(file, () => imageBytes(auth, file.id));
  const imageMeta = await sharp(image).metadata();
  if (!["jpeg", "png", "webp"].includes(imageMeta.format))
    throw new Error(
      `${recipe.id}: Bildformatet ${imageMeta.format} kan inte tryckgranskas.`,
    );
  if (
    !imageMeta.width ||
    !imageMeta.height ||
    !photoQualityCheck(
      recipe,
      selectedProfile,
      imageMeta.width,
      imageMeta.height,
      recipe.imageCrop,
    ).possible
  )
    throw new Error(
      `${recipe.id}: Bildens originalpixlar räcker inte för minsta foto-PPI efter beskärning.`,
    );
  if (
    recipe.imageWidth &&
    (recipe.imageWidth !== imageMeta.width ||
      recipe.imageHeight !== imageMeta.height)
  )
    throw new Error(
      `${recipe.id}: lagrade originalmått stämmer inte med Drive-filen.`,
    );
  if (recipe.imageCrop)
    normalizeCrop(
      recipe.imageCrop,
      imageMeta.width,
      imageMeta.height,
      photoQualityRule(
        recipe,
        selectedProfile,
        imageMeta.width,
        imageMeta.height,
      ).profile,
    );
  const card = {
    ...recipe,
    imageDataUrl: `data:image/${imageMeta.format === "jpeg" ? "jpeg" : imageMeta.format};base64,${image.toString("base64")}`,
    imageWidth: imageMeta.width,
    imageHeight: imageMeta.height,
  };
  const issues = validateCard(card, selectedProfile);
  const errors = issues.filter((issue) => issue.level === "error");
  if (errors.length)
    throw new Error(
      `${recipe.id}: ${errors.map((issue) => issue.message).join(" ")}`,
    );
  const prefix = `${format}_${String(index + 1).padStart(3, "0")}_${recipe.id}`;
  const sides = {};
  for (const side of ["front", "back"]) {
    const name = `${prefix}_${side}.png`;
    const target = path.join(cardsDir, name);
    const svg = renderCard(card, side, {
      frontStyle: "panel",
      printProfile: selectedProfile,
    });
    const png = await renderSvgPng(svg, selectedProfile);
    const meta = await sharp(png).metadata();
    if (
      meta.width !== profile.widthPx ||
      meta.height !== profile.heightPx ||
      Math.abs((meta.density || 0) - profile.dpi) > 1
    )
      throw new Error(`${recipe.id}: Fel exportmått eller DPI på ${side}.`);
    await fs.writeFile(target, png, { mode: 0o600 });
    if (side === "front") {
      const { stdout } = await exec("zbarimg", ["--quiet", "--raw", target], {
        maxBuffer: 1024 * 1024,
      });
      if (stdout.trim() !== recipe.id)
        throw new Error(`${recipe.id}: QR-koden avkodas som ${stdout.trim()}.`);
    }
    sides[side] = {
      file: `cards/${name}`,
      sha256: sha256(png),
      bytes: png.length,
    };
  }
  entries.push({
    order: index + 1,
    id: recipe.id,
    name: recipe.name,
    shortName: recipe.shortName || "",
    type: recipe.type,
    status: recipe.status,
    imageSha256: sha256(image),
    imageWidthPx: imageMeta.width,
    imageHeightPx: imageMeta.height,
    imageVariantId: recipe.selectedImageVariantId || "original",
    imageCrop: recipe.imageCrop || null,
    effectivePhotoPpi: Number(
      photoQualityCheck(
        recipe,
        selectedProfile,
        imageMeta.width,
        imageMeta.height,
        recipe.imageCrop,
      ).ppi.toFixed(1),
    ),
    photoQualityException: photoQualityRule(
      recipe,
      selectedProfile,
      imageMeta.width,
      imageMeta.height,
    ).exception,
    ingredientCount: recipe.ingredients.length,
    warnings: [
      ...(photoQualityRule(
        recipe,
        selectedProfile,
        imageMeta.width,
        imageMeta.height,
      ).exception
        ? [
            `Tarotundantag: källfotot har ${photoQualityCheck(recipe, selectedProfile, imageMeta.width, imageMeta.height, recipe.imageCrop).ppi.toFixed(1)} effektiv ppi (normalt krav 300).`,
          ]
        : []),
      ...issues
        .filter((issue) => issue.level === "warning")
        .map((issue) => issue.message),
      ...(!recipe.imageId
        ? ["Bildfilen väljs via recept-ID eftersom explicit bildlänk saknas."]
        : []),
    ],
    ...sides,
  });
  process.stdout.write(
    `${String(index + 1).padStart(2, "0")}/${recipes.length} ${recipe.id}\n`,
  );
}

// Detect edits during export, so every pair belongs to one coherent Sheet snapshot.
const current = await loadCatalog(auth);
const sourceFingerprint = (items) =>
  sha256(
    Buffer.from(
      JSON.stringify(
        items.map((r) => ({
          id: r.id,
          name: r.name,
          shortName: r.shortName,
          status: r.status,
          type: r.type,
          servings: r.servings,
          activeTime: r.activeTime,
          totalTime: r.totalTime,
          cardRecipe: r.cardRecipe,
          imageId: r.imageId,
          imageVariantId: r.selectedImageVariantId,
          imageCrop: r.imageCrop,
          imageCropTarot: r.imageCropTarot,
          ingredients: r.ingredients,
        })),
      ),
    ),
  );
if (
  sourceFingerprint(recipes) !==
  sourceFingerprint(
    currentRecipes(current.recipes).sort((a, b) => {
      const x = sortKey(a),
        y = sortKey(b);
      return x[0] - y[0] || x[1] - y[1];
    }),
  )
)
  throw new Error(
    "Google Sheet ändrades under exporten; paketet måste skapas om.",
  );

const manifest = {
  generatedAt: new Date().toISOString(),
  source: "Google Sheets och kopplade Google Drive-bilder",
  profile: selectedProfile,
  format,
  frontStyle: "panel",
  recipeCount: entries.length,
  sideCount: entries.length * 2,
  sourceFingerprint: sourceFingerprint(recipes),
  cards: entries,
};
await fs.writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  { mode: 0o600 },
);
await fs.writeFile(
  path.join(out, "checklista.csv"),
  [
    [
      "Ordning",
      "ID",
      "Namn",
      "Kortnamn",
      "Typ",
      "Framsida",
      "Baksida",
      "Varningar",
    ]
      .map(csv)
      .join(","),
    ...entries.map((entry) =>
      [
        entry.order,
        entry.id,
        entry.name,
        entry.shortName,
        entry.type,
        entry.front.file,
        entry.back.file,
        entry.warnings.join("; "),
      ]
        .map(csv)
        .join(","),
    ),
  ].join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    out,
    cards: entries.length,
    files: entries.length * 2,
    warnings: entries.filter((entry) => entry.warnings.length).length,
  }),
);

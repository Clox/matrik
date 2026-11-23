import { normalizeCrop } from "./image-crop.js";
import { DEFAULT_PRINT_PROFILE } from "./print-profile.js";
import { photoQualityRule } from "./photo-quality.js";

export const IMAGE_SHEET = "Rätt-bilder";
export const IMAGE_HEADERS = [
  "Rätt-ID",
  "Variant-ID",
  "Drive-fil-ID",
  "Vald",
  "Bredd px",
  "Höjd px",
  "Beskärning JSON",
  "Beskrivning",
];
export const TAROT_CROP_HEADER = "Beskärning tarot JSON";

export function cropForProfile(variant, profile) {
  return profile?.id === "mpc-tarot"
    ? variant?.tarotCrop || null
    : variant?.crop || null;
}

export function recipeForProfile(recipe, profile) {
  if (!recipe) return recipe;
  return {
    ...recipe,
    imageCrop:
      profile?.id === "mpc-tarot"
        ? (recipe.imageCropTarot ?? null)
        : recipe.imageCrop,
  };
}

export function updatedVariantCrops(existing, input, recipe, width, height) {
  const tarotWrite =
    input.crop !== undefined && input.printProfile?.id === "mpc-tarot";
  const pokerCrop =
    tarotWrite || input.crop === undefined
      ? existing?.crop || null
      : input.crop
        ? normalizeCrop(
            input.crop,
            width,
            height,
            input.printProfile || DEFAULT_PRINT_PROFILE,
          )
        : null;
  const tarotCrop = !tarotWrite
    ? existing?.tarotCrop || null
    : input.crop
      ? normalizeCrop(
          input.crop,
          width,
          height,
          photoQualityRule(recipe, input.printProfile, width, height).profile,
        )
      : null;
  return { pokerCrop, tarotCrop, tarotWrite };
}

export function driveId(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("http")) return text;
  try {
    const url = new URL(text);
    if (!["drive.google.com", "docs.google.com"].includes(url.hostname))
      return "";
    return (
      /\/d\/([^/]+)/.exec(url.pathname)?.[1] || url.searchParams.get("id") || ""
    );
  } catch {
    return "";
  }
}

export function attachImageVariants(catalog, values = []) {
  const byRecipe = new Map();
  if (values.length) {
    if (
      JSON.stringify(values[0].slice(0, IMAGE_HEADERS.length)) !==
        JSON.stringify(IMAGE_HEADERS) ||
      (values[0].length > IMAGE_HEADERS.length &&
        values[0][8] !== TAROT_CROP_HEADER)
    )
      throw new Error(`${IMAGE_SHEET} har oväntade kolumner.`);
    values.slice(1).forEach((cells, index) => {
      const [
        recipeId,
        id,
        fileId,
        selected,
        width,
        height,
        cropJson,
        description,
        tarotCropJson,
      ] = cells;
      if (!recipeId || !id || !fileId) return;
      let crop = null;
      if (cropJson) {
        try {
          crop = JSON.parse(cropJson);
        } catch {
          throw new Error(
            `${IMAGE_SHEET} rad ${index + 2} har ogiltig beskärning.`,
          );
        }
      }
      let tarotCrop = null;
      if (tarotCropJson) {
        try {
          tarotCrop = JSON.parse(tarotCropJson);
        } catch {
          throw new Error(
            `${IMAGE_SHEET} rad ${index + 2} har ogiltig tarotbeskärning.`,
          );
        }
      }
      const variant = {
        id,
        fileId: driveId(fileId),
        selected: selected === "Ja",
        width: Number(width) || 0,
        height: Number(height) || 0,
        crop,
        tarotCrop,
        description: description || "",
        rowNumber: index + 2,
      };
      const list = byRecipe.get(recipeId) || [];
      if (list.some((x) => x.id === id))
        throw new Error(`Dubbelt bildvariant-ID för ${recipeId}.`);
      list.push(variant);
      byRecipe.set(recipeId, list);
    });
  }
  for (const recipe of catalog.recipes) {
    const variants = byRecipe.get(recipe.id) || [];
    if (!variants.length && recipe.imageId)
      variants.push({
        id: "original",
        fileId: driveId(recipe.imageId),
        selected: true,
        width: 0,
        height: 0,
        crop: null,
        tarotCrop: null,
        description: "Befintlig bild",
      });
    if (variants.filter((x) => x.selected).length > 1)
      throw new Error(`Flera valda bilder för ${recipe.id}.`);
    const selected = variants.find((x) => x.selected) || variants[0];
    recipe.imageVariants = variants;
    recipe.selectedImageVariantId = selected?.id || "";
    if (selected) {
      recipe.imageId = selected.fileId;
      recipe.imageCrop = selected.crop;
      recipe.imageCropTarot = selected.tarotCrop;
      recipe.imageWidth = selected.width;
      recipe.imageHeight = selected.height;
    }
  }
  return catalog;
}

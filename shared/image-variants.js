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
export const TAROT_SELECTED_HEADER = "Vald tarot";

export function selectedVariantForProfile(recipe, profile) {
  const variants = recipe?.imageVariants || [];
  const id =
    profile?.id === "mpc-tarot"
      ? recipe.selectedImageVariantIdTarot || recipe.selectedImageVariantId
      : recipe?.selectedImageVariantId;
  return variants.find((variant) => variant.id === id) || variants[0] || null;
}

export function cropForProfile(variant, profile) {
  return profile?.id === "mpc-tarot"
    ? variant?.tarotCrop || null
    : variant?.crop || null;
}

export function recipeForProfile(recipe, profile) {
  if (!recipe) return recipe;
  const variant = selectedVariantForProfile(recipe, profile);
  const tarot = profile?.id === "mpc-tarot";
  return {
    ...recipe,
    imageId: variant?.fileId || recipe.imageId,
    selectedImageVariantId: variant?.id || recipe.selectedImageVariantId,
    imageWidth: variant?.width || recipe.imageWidth,
    imageHeight: variant?.height || recipe.imageHeight,
    imageCrop: tarot
      ? (recipe.imageCropTarot ?? variant?.tarotCrop ?? null)
      : recipe.imageCrop,
    imageDataUrl:
      recipe.loadedImageVariantId && recipe.loadedImageVariantId !== variant?.id
        ? null
        : recipe.imageDataUrl,
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
        values[0][8] !== TAROT_CROP_HEADER) ||
      (values[0].length > 9 && values[0][9] !== TAROT_SELECTED_HEADER)
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
        selectedTarot,
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
        selectedTarot: selectedTarot === "Ja",
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
    if (variants.filter((x) => x.selectedTarot).length > 1)
      throw new Error(`Flera valda tarotbilder för ${recipe.id}.`);
    const selected = variants.find((x) => x.selected) || variants[0];
    const tarotSelected = variants.find((x) => x.selectedTarot);
    recipe.imageVariants = variants;
    recipe.selectedImageVariantId = selected?.id || "";
    recipe.selectedImageVariantIdTarot = tarotSelected?.id || "";
    if (selected) {
      recipe.imageId = selected.fileId;
      recipe.imageCrop = selected.crop;
      recipe.imageCropTarot = (tarotSelected || selected).tarotCrop;
      recipe.imageWidth = selected.width;
      recipe.imageHeight = selected.height;
    }
  }
  return catalog;
}

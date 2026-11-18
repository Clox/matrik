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
    if (JSON.stringify(values[0]) !== JSON.stringify(IMAGE_HEADERS))
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
      const variant = {
        id,
        fileId: driveId(fileId),
        selected: selected === "Ja",
        width: Number(width) || 0,
        height: Number(height) || 0,
        crop,
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
      recipe.imageWidth = selected.width;
      recipe.imageHeight = selected.height;
    }
  }
  return catalog;
}

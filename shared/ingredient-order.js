import { replacementFor } from "./shopping-list.js";

// Presentation order is independent of the relation's position in Sheets.
// Keep the original index so editing and weekly choices retain their identity.
export function displayIngredientEntries(lines = []) {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const orderA = Number(a.line.displayOrder);
      const orderB = Number(b.line.displayOrder);
      const validA = Number.isSafeInteger(orderA) && orderA > 0;
      const validB = Number.isSafeInteger(orderB) && orderB > 0;
      if (validA && validB) return orderA - orderB || a.index - b.index;
      if (validA) return -1;
      if (validB) return 1;
      return a.index - b.index;
    });
}

export function standardCardIngredients(recipe) {
  return displayIngredientEntries(recipe.ingredients || [])
    .map(({ line }) => line)
    .filter(
      (line) =>
        line.cardVisibility !== "Dölj" &&
        !(!line.required && replacementFor(recipe, line)),
    );
}

export function validateDisplayOrder(lines = []) {
  const used = new Set();
  for (const line of lines) {
    const value = String(line.displayOrder ?? "").trim();
    if (!value) continue;
    const order = Number(value);
    if (!Number.isSafeInteger(order) || order < 1 || used.has(order))
      throw new Error("Visningsordning måste vara unika positiva heltal.");
    used.add(order);
  }
}

export const RECIPE_TYPES = ["Maträtt", "Dessert"];

export function recipeType(recipe) {
  const explicit = String(recipe?.type || "")
    .trim()
    .toLowerCase();
  if (explicit === "dessert") return "Dessert";
  if (explicit === "maträtt" || explicit === "matratt") return "Maträtt";
  return /^D\d+$/i.test(String(recipe?.id || "")) ? "Dessert" : "Maträtt";
}

export function recipePrefix(type) {
  return type === "Dessert" ? "D" : "M";
}

export function filterRecipes(recipes, type = "Alla") {
  return type === "Alla"
    ? recipes
    : recipes.filter((recipe) => recipeType(recipe) === type);
}

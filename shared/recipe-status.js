export const ARCHIVED_STATUS = "Arkiverad";

export function isArchived(recipe) {
  return (
    String(recipe?.status || "")
      .trim()
      .toLowerCase() === ARCHIVED_STATUS.toLowerCase()
  );
}

export function currentRecipes(recipes = []) {
  return recipes.filter((recipe) => !isArchived(recipe));
}

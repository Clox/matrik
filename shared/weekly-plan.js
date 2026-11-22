export const WEEK_DAYS = [
  ["monday", "Måndag"],
  ["tuesday", "Tisdag"],
  ["wednesday", "Onsdag"],
  ["thursday", "Torsdag"],
  ["friday", "Fredag"],
  ["saturday", "Lördag"],
  ["sunday", "Söndag"],
];
export const UNSCHEDULED = "unscheduled";
const validDays = new Set([UNSCHEDULED, ...WEEK_DAYS.map(([id]) => id)]);

export function planDay(day) {
  return validDays.has(day) ? day : UNSCHEDULED;
}

export function dayLabel(day) {
  return WEEK_DAYS.find(([id]) => id === day)?.[1] || "Ej schemalagt";
}

export function normalizeWeekPlan(saved, createId = () => crypto.randomUUID()) {
  if (!Array.isArray(saved)) return [];
  const ids = new Set();
  return saved
    .filter((entry) => entry && typeof entry.recipeId === "string")
    .map((entry) => {
      let id = typeof entry.id === "string" && entry.id ? entry.id : createId();
      while (ids.has(id)) id = createId();
      ids.add(id);
      return {
        ...entry,
        id,
        day: planDay(entry.day),
        choices:
          entry.choices && typeof entry.choices === "object"
            ? entry.choices
            : {},
      };
    });
}

// One-time migration when the historical M039 was removed and Kåldolmar M051
// took its ID. Old M039 selections must never silently become Kåldolmar.
export function migrateM039Reassignment(saved) {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((entry) => entry?.recipeId !== "M039")
    .map((entry) =>
      entry?.recipeId === "M051" ? { ...entry, recipeId: "M039" } : entry,
    );
}

export function addPlanEntry(
  plan,
  recipe,
  day,
  createId = () => crypto.randomUUID(),
) {
  return [
    ...plan,
    {
      id: createId(),
      recipeId: recipe.id,
      day: planDay(day),
      servings: recipe.servings || 4,
      choices: {},
    },
  ];
}

export function updatePlanEntry(plan, id, patch) {
  return plan.map((entry) =>
    entry.id === id
      ? { ...entry, ...patch, day: planDay(patch.day ?? entry.day) }
      : entry,
  );
}

export function replacePlanEntry(plan, id, recipe) {
  return updatePlanEntry(plan, id, {
    recipeId: recipe.id,
    servings: recipe.servings || 4,
    choices: {},
  });
}

export function removePlanEntry(plan, id) {
  return plan.filter((entry) => entry.id !== id);
}

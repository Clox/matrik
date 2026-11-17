import { normalize } from "./schema.js";

const UNIT = {
  g: ["mass", 1],
  kg: ["mass", 1000],
  ml: ["volume", 1],
  cl: ["volume", 10],
  dl: ["volume", 100],
  l: ["volume", 1000],
  tsk: ["volume", 5],
  msk: ["volume", 15],
};
const number = (value) => Number(String(value ?? "").replace(",", "."));
const neat = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
export const formatAmount = (value) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(
    neat(value),
  );

export function ingredientChoices(line) {
  const match = /(?:^|;\s*)Alternativ:\s*([^;]+)/i.exec(
    String(line.note || ""),
  );
  const fromNote = match
    ? match[1]
        .split(/\s*\/\s*/)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const fromName =
    !fromNote.length && String(line.name || "").includes("/")
      ? line.name
          .split(/\s*\/\s*/)
          .map((x) => x.trim())
          .filter(Boolean)
      : [line.name];
  return [...new Set([...fromName, ...fromNote])];
}

export function lineKey(line, index) {
  return line.ingredientId ? String(line.ingredientId) : `row:${index}`;
}

export function replacementFor(recipe, line) {
  const match = /i stället för\s+([^.;]+)/i.exec(
    String(line.purchaseNote || ""),
  );
  if (!match) return null;
  const target = normalize(match[1]);
  const found = recipe.ingredients.find(
    (other) => normalize(other.name) === target,
  );
  return found?.ingredientId || null;
}

export function applyIngredientChoice(entry, recipe, index, patch) {
  const line = recipe.ingredients[index];
  const key = lineKey(line, index);
  const choices = {
    ...entry.choices,
    [key]: { ...entry.choices?.[key], ...patch },
  };
  if (patch.included === true) {
    const replaces = replacementFor(recipe, line);
    recipe.ingredients.forEach((other, otherIndex) => {
      if (
        other.ingredientId === replaces ||
        replacementFor(recipe, other) === line.ingredientId
      ) {
        const otherKey = lineKey(other, otherIndex);
        choices[otherKey] = { ...choices[otherKey], included: false };
      }
    });
  }
  return { ...entry, choices };
}

export function scaledAmount(line, servings, baseServings = 4) {
  const base = number(line.quantity);
  if (!Number.isFinite(base) || base < 0) return 0;
  const scale = String(line.scaling || "").toLowerCase();
  if (scale.includes("fast") || scale.includes("person")) return base;
  const result = (base * servings) / (number(baseServings) || 4);
  if (
    scale.includes("hela") ||
    String(line.rounding || "")
      .toLowerCase()
      .includes("upp")
  )
    return Math.ceil(result);
  const step = number(line.rounding);
  return neat(
    Number.isFinite(step) && step > 0
      ? Math.round(result / step) * step
      : result,
  );
}

function measure(unit) {
  const text = String(unit || "")
    .trim()
    .toLowerCase();
  const converted = UNIT[text];
  return converted
    ? { family: converted[0], factor: converted[1] }
    : { family: `unit:${text}`, factor: 1 };
}

function display(total, family, sourceUnits, purchaseUnits) {
  if (family === "mass") {
    if (purchaseUnits.includes("kg"))
      return { amount: neat(total / 1000), unit: "kg" };
    return { amount: neat(total), unit: "g" };
  }
  if (family === "volume") {
    const unique = [...new Set(sourceUnits)];
    if (unique.length === 1)
      return {
        amount: neat(total / measure(unique[0]).factor),
        unit: unique[0],
      };
    return total >= 100
      ? { amount: neat(total / 100), unit: "dl" }
      : { amount: neat(total), unit: "ml" };
  }
  return { amount: neat(total), unit: sourceUnits[0] || "" };
}

function packageCount(group) {
  const sizes = [
    ...new Set(
      group.sources.map((source) => source.packageSize).filter(Boolean),
    ),
  ];
  if (sizes.length !== 1) return null;
  const match = /^(?:ca\s+)?(\d+(?:[,.]\d+)?)\s*([a-zåäö]+)$/.exec(
    sizes[0].trim().toLowerCase(),
  );
  if (!match) return null;
  const pack = number(match[1]);
  const unit = measure(match[2]);
  if (!pack || unit.family !== group.family) return null;
  return {
    count: Math.ceil(group.total / (pack * unit.factor)),
    size: sizes[0],
  };
}

export function shoppingList(recipes, plan) {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const groups = new Map();
  for (const entry of plan) {
    const recipe = byId.get(entry.recipeId);
    const servings = number(entry.servings);
    if (
      !recipe ||
      !Number.isInteger(servings) ||
      servings < 1 ||
      servings > 100
    )
      continue;
    for (const [index, line] of recipe.ingredients.entries()) {
      const choice = entry.choices?.[lineKey(line, index)] || {};
      if (
        choice.included === false ||
        (choice.included === undefined && !line.required)
      )
        continue;
      const options = ingredientChoices(line);
      const name = options.includes(choice.name) ? choice.name : options[0];
      if (!name) continue;
      const unit = String(line.unit || "")
        .trim()
        .toLowerCase();
      const metric = measure(unit);
      const amount = scaledAmount(line, servings, recipe.servings);
      const key = `${normalize(name)}|${metric.family}`;
      if (!groups.has(key))
        groups.set(key, {
          key,
          name,
          family: metric.family,
          total: 0,
          sources: [],
        });
      const group = groups.get(key);
      group.total += amount * metric.factor;
      group.sources.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        servings,
        amount,
        unit,
        purchaseUnit: line.purchaseUnit || "",
        packageSize: line.packageSize || "",
        purchaseNote: line.purchaseNote || "",
      });
    }
  }
  return [...groups.values()]
    .map((group) => {
      const sourceUnits = group.sources.map((source) => source.unit);
      const purchaseUnits = group.sources.map((source) =>
        source.purchaseUnit.toLowerCase(),
      );
      const shown = display(
        group.total,
        group.family,
        sourceUnits,
        purchaseUnits,
      );
      return {
        ...group,
        ...shown,
        packages: packageCount(group),
        purchaseUnits: [
          ...new Set(
            group.sources.map((source) => source.purchaseUnit).filter(Boolean),
          ),
        ],
        notes: [
          ...new Set(
            group.sources.map((source) => source.purchaseNote).filter(Boolean),
          ),
        ],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "sv-SE"));
}

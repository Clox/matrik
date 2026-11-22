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
  return ingredientOptions(line).map((option) => option.name);
}

export function ingredientOptions(line) {
  const standard = {
    ...line,
    name: String(line.name || "")
      .split(/\s*\/\s*/)[0]
      .trim(),
  };
  return [
    standard,
    ...(line.alternatives || []).filter(
      (option) =>
        option.ingredientId &&
        option.name &&
        option.unit &&
        option.scaling &&
        Number.isFinite(number(option.quantity)) &&
        number(option.quantity) >= 0,
    ),
  ];
}

export function selectedIngredient(line, choice = {}) {
  const options = ingredientOptions(line);
  return (
    (choice.ingredientId &&
      options.find((option) => option.ingredientId === choice.ingredientId)) ||
    (choice.name && options.find((option) => option.name === choice.name)) ||
    options[0]
  );
}

// The two remaining Smör/olja relations use legacy ID 7 for Smör.
// This reviewed, relation-specific alias is intentionally not a name match.
// It lets M009's check-at-home Smör join ID 47 used by the potato mash.
export function shoppingIngredientId(recipe, line, selected) {
  if (
    (recipe.id === "M009" || recipe.id === "M010") &&
    line.ingredientId === "7" &&
    selected.ingredientId === "7" &&
    selected.name === "Smör" &&
    recipe.ingredients.some(
      (other) => other.ingredientId === "47" && other.name === "Smör",
    )
  )
    return "47";
  return selected.ingredientId || "";
}

export function effectivePurchaseMode(line) {
  if (line.purchaseMode === "Utelämna") return "Utelämna";
  if (line.quantityMode === "Ungefärlig" || line.quantityMode === "Ingen")
    return "Kontrollera hemma";
  return line.purchaseMode === "Kontrollera hemma"
    ? "Kontrollera hemma"
    : "Beräkna";
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

export function canToggleIngredient(recipe, line) {
  return (
    !line.required ||
    Boolean(line.canExclude) ||
    recipe.ingredients.some(
      (other) => replacementFor(recipe, other) === line.ingredientId,
    )
  );
}

// A selected optional ingredient can require a separate pantry item. Keep the
// association by stable ingredient IDs so unrelated recipes and similar names
// cannot acquire the companion accidentally.
const companionRules = {
  M013: [{ sourceId: "26", companionId: "140" }],
};

function companionSource(recipe, line) {
  return (companionRules[recipe.id] || []).find(
    (rule) => rule.companionId === line.ingredientId,
  )?.sourceId;
}

export function applyIngredientChoice(entry, recipe, index, patch) {
  const line = recipe.ingredients[index];
  if (patch.included === false && !canToggleIngredient(recipe, line))
    return entry;
  const key = lineKey(line, index);
  const choices = {
    ...entry.choices,
    [key]: { ...entry.choices?.[key], ...patch },
  };
  const changed = new Set([key]);
  if (patch.included === true) {
    const replaces = replacementFor(recipe, line);
    recipe.ingredients.forEach((other, otherIndex) => {
      if (
        other.ingredientId === replaces ||
        replacementFor(recipe, other) === line.ingredientId
      ) {
        const otherKey = lineKey(other, otherIndex);
        choices[otherKey] = { ...choices[otherKey], included: false };
        changed.add(otherKey);
      }
    });
  }
  for (const rule of companionRules[recipe.id] || []) {
    const source = recipe.ingredients.find(
      (item) => item.ingredientId === rule.sourceId,
    );
    const companion = recipe.ingredients.find(
      (item) => item.ingredientId === rule.companionId,
    );
    if (!source || !companion || !changed.has(rule.sourceId)) continue;
    const included = choices[rule.sourceId]?.included === true;
    choices[rule.companionId] = { ...choices[rule.companionId], included };
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
  const checks = new Map();
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
      const sourceId = companionSource(recipe, line);
      const included =
        (canToggleIngredient(recipe, line) ? choice.included : undefined) ??
        (sourceId ? entry.choices?.[sourceId]?.included : undefined) ??
        line.required;
      if (!included) continue;
      const selected = selectedIngredient(line, choice);
      const name = selected.name;
      if (!name) continue;
      const mode = effectivePurchaseMode(line);
      if (mode === "Utelämna") continue;
      const ingredientId = shoppingIngredientId(recipe, line, selected);
      // Without a stable ingredient ID, keep the relation separate. Names alone
      // cannot establish that two shopping items are the same product.
      const identity =
        ingredientId || `row:${recipe.id}:${lineKey(line, index)}`;
      if (mode === "Kontrollera hemma") {
        if (!checks.has(identity))
          checks.set(identity, {
            key: `check:${identity}`,
            identity,
            ingredientId,
            name,
            checkOnly: true,
            amount: null,
            unit: "",
            family: "",
            total: null,
            sources: [],
            purchaseUnits: [],
            notes: [],
            packages: null,
          });
        checks.get(identity).sources.push({
          entryId: entry.id,
          day: entry.day || "unscheduled",
          recipeId: recipe.id,
          recipeName: recipe.name,
          servings,
          amount: null,
          unit: "",
          checkOnly: true,
          purchaseNote: selected.purchaseNote || "",
        });
        continue;
      }
      const unit = String(selected.unit || "")
        .trim()
        .toLowerCase();
      const metric = measure(unit);
      const amount = scaledAmount(selected, servings, recipe.servings);
      const key = `${identity}|${metric.family}`;
      if (!groups.has(key))
        groups.set(key, {
          key,
          identity,
          ingredientId,
          name,
          family: metric.family,
          total: 0,
          sources: [],
        });
      const group = groups.get(key);
      group.total += amount * metric.factor;
      group.sources.push({
        entryId: entry.id,
        day: entry.day || "unscheduled",
        recipeId: recipe.id,
        recipeName: recipe.name,
        servings,
        amount,
        unit,
        purchaseUnit: selected.purchaseUnit || "",
        packageSize: selected.packageSize || "",
        purchaseNote: selected.purchaseNote || "",
        preparation: selected.preparation || "",
      });
    }
  }
  const measured = [...groups.values()].map((group) => {
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
  });
  for (const check of checks.values()) {
    const measuredForItem = measured.find(
      (item) => item.identity === check.identity,
    );
    if (measuredForItem) {
      measuredForItem.checkSources = check.sources;
      measuredForItem.sources.push(...check.sources);
      measuredForItem.notes = [
        ...new Set([
          ...measuredForItem.notes,
          "Kontrollera också hemma för användning efter behov.",
        ]),
      ];
    } else measured.push(check);
  }
  return measured.sort((a, b) => a.name.localeCompare(b.name, "sv-SE"));
}

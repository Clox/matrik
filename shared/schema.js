import { recipeType } from "./recipe-type.js";

export const SHEETS = {
  dishes: "Rätter",
  ingredients: "Ingredienser",
  links: "Rätt-ingredienser",
  tags: "Taggar",
  preparations: "Rätt-förberedelser",
};
export const ALTERNATIVE_SHEET = "Rätt-ingrediensalternativ";

export const FIELDS = {
  dishes: {
    id: ["rätt-id", "rättid", "id", "mat-id"],
    name: ["namn", "rätt", "rättnamn", "titel"],
    shortName: ["kortnamn", "kort namn", "korttitel"],
    type: ["recepttyp", "korttyp"],
    servings: ["basportioner", "portioner", "antal portioner"],
    activeTime: ["aktiv tid", "aktiv tid min", "aktiv tid (min)", "aktivtid"],
    totalTime: ["total tid", "total tid min", "total tid (min)", "totaltid"],
    recipe: [
      "recept",
      "fullständigt recept",
      "instruktion",
      "instruktioner",
      "instruktion/recept",
      "beskrivning",
    ],
    cardRecipe: ["kortrecept", "kort recept", "kortinstruktion"],
    status: ["status", "läge"],
    tags: ["taggar", "tags", "kategori"],
    imageId: [
      "bild-id",
      "bildid",
      "drive-id",
      "drive file id",
      "bild",
      "bildlänk",
    ],
    hasPreparations: ["har förberedelser"],
  },
  ingredients: {
    id: ["ingrediens-id", "ingrediensid", "id"],
    name: ["namn", "ingrediens", "ingrediensnamn"],
    defaultUnit: ["enhet", "standardenhet"],
    purchaseUnit: ["inköpsenhet"],
    packageSize: ["förpackningsstorlek"],
    purchaseNote: ["inköpsnotering"],
  },
  links: {
    dishId: ["rätt-id", "rättid", "mat-id", "rätt"],
    ingredientId: ["ingrediens-id", "ingrediensid", "ingrediens"],
    quantity: ["basmängd", "mängd", "antal"],
    unit: ["enhet"],
    required: ["obligatorisk", "måste med"],
    note: ["förberedelse", "anmärkning", "notering", "förberedelse/anmärkning"],
    scaling: ["skalningstyp", "skalning"],
    rounding: ["avrundning"],
    purchaseUnit: ["inköpsenhet"],
    packageSize: ["förpackningsstorlek"],
    purchaseNote: ["inköpsnotering"],
  },
  tags: {
    dishId: ["rätt-id", "rättid", "mat-id"],
    name: ["tagg", "namn", "taggar"],
  },
  preparations: {
    id: ["förberedelse-id"],
    dishId: ["rätt-id"],
    type: ["typ"],
    leadMinutes: ["ledtid (min)"],
    timingType: ["tidpunktstyp"],
    instruction: ["instruktion"],
    condition: ["villkor"],
    priority: ["prioritet"],
    active: ["aktiv"],
    note: ["anteckning"],
  },
  alternatives: {
    dishId: ["rätt-id"],
    standardIngredientId: ["standard-ingrediens-id"],
    ingredientId: ["alternativ-ingrediens-id"],
    quantity: ["basmängd"],
    unit: ["enhet"],
    scaling: ["skalningstyp"],
    rounding: ["avrundning"],
    purchaseUnit: ["inköpsenhet"],
    packageSize: ["förpackningsstorlek"],
    purchaseNote: ["inköpsnotering"],
    preparation: ["tillagningsanpassning"],
    enabled: ["valbar"],
  },
};

export function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
export function columnMap(headers, kind) {
  const normalized = headers.map(normalize);
  return Object.fromEntries(
    Object.entries(FIELDS[kind]).map(([key, aliases]) => [
      key,
      normalized.findIndex((x) => aliases.some((a) => normalize(a) === x)),
    ]),
  );
}
export function sheetRows(values = [], kind) {
  const headers = values[0] || [];
  const columns = columnMap(headers, kind);
  const rows = values.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    cells,
    ...Object.fromEntries(
      Object.keys(FIELDS[kind]).map((key) => [
        key,
        columns[key] < 0 ? "" : String(cells[columns[key]] ?? ""),
      ]),
    ),
  }));
  return { headers, columns, rows };
}
export function parseNumber(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && String(value ?? "").trim() !== "" ? n : fallback;
}
export function parseBool(value) {
  return ["ja", "yes", "true", "1", "x"].includes(normalize(value));
}
export function makeCatalog(data) {
  const dishes = sheetRows(data.dishes, "dishes");
  const ingredients = sheetRows(data.ingredients, "ingredients");
  const links = sheetRows(data.links, "links");
  const tags = sheetRows(data.tags, "tags");
  const preparations = sheetRows(data.preparations, "preparations");
  const alternatives = data.alternatives?.length
    ? sheetRows(data.alternatives, "alternatives")
    : null;
  if (
    alternatives &&
    Object.values(alternatives.columns).some((column) => column < 0)
  )
    throw new Error(
      "Fliken Rätt-ingrediensalternativ saknar nödvändiga kolumner.",
    );
  if (dishes.columns.id < 0 || dishes.columns.name < 0)
    throw new Error("Fliken Rätter behöver kolumner för Rätt-ID och Namn.");
  const recipeIds = dishes.rows.map((row) => row.id).filter(Boolean);
  if (new Set(recipeIds).size !== recipeIds.length)
    throw new Error("Fliken Rätter innehåller dubbla recept-ID:n.");
  if (dishes.columns.hasPreparations < 0)
    throw new Error("Fliken Rätter saknar kolumnen Har förberedelser.");
  if (ingredients.columns.id < 0 || ingredients.columns.name < 0)
    throw new Error(
      "Fliken Ingredienser behöver kolumner för Ingrediens-ID och Namn.",
    );
  if (links.columns.dishId < 0 || links.columns.ingredientId < 0)
    throw new Error(
      "Fliken Rätt-ingredienser behöver kolumner för Rätt-ID och Ingrediens-ID.",
    );
  if (Object.values(preparations.columns).some((column) => column < 0))
    throw new Error(
      "Fliken Rätt-förberedelser saknar en eller flera av sina tio kolumner.",
    );
  const ingredientById = new Map(ingredients.rows.map((row) => [row.id, row]));
  const linkKeys = new Set(
    links.rows
      .filter((row) => row.dishId && row.ingredientId)
      .map((row) => `${row.dishId}:${row.ingredientId}`),
  );
  const alternativeKeys = new Set();
  for (const option of alternatives?.rows || []) {
    if (!parseBool(option.enabled)) continue;
    const key = `${option.dishId}:${option.standardIngredientId}`;
    const unique = `${key}:${option.ingredientId}`;
    if (
      !linkKeys.has(key) ||
      !option.ingredientId ||
      option.ingredientId === option.standardIngredientId
    )
      throw new Error(`Ogiltig alternativrelation på rad ${option.rowNumber}.`);
    if (alternativeKeys.has(unique))
      throw new Error(
        `Dubbelt ingrediensalternativ på rad ${option.rowNumber}.`,
      );
    alternativeKeys.add(unique);
    if (
      !ingredientById.has(option.ingredientId) ||
      !Number.isFinite(parseNumber(option.quantity, NaN)) ||
      parseNumber(option.quantity, NaN) < 0 ||
      !option.unit ||
      !option.scaling
    )
      throw new Error(
        `Ofullständigt ingrediensalternativ på rad ${option.rowNumber}.`,
      );
  }
  const recipes = dishes.rows
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      type: recipeType(row),
      servings: parseNumber(row.servings, 4),
      activeTime: row.activeTime,
      totalTime: row.totalTime,
      recipe: row.recipe,
      cardRecipe: row.cardRecipe,
      status: row.status,
      tags: [
        ...new Set(
          [
            ...row.tags.split(/[,;]+/),
            ...tags.rows.filter((t) => t.dishId === row.id).map((t) => t.name),
          ]
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
      imageId: row.imageId,
      hasPreparations: parseBool(row.hasPreparations),
      preparations: preparations.rows
        .filter(
          (preparation) => preparation.dishId === row.id && preparation.id,
        )
        .map((preparation) => ({
          id: preparation.id,
          type: preparation.type,
          leadMinutes: parseNumber(preparation.leadMinutes),
          timingType: preparation.timingType,
          instruction: preparation.instruction,
          condition: preparation.condition,
          priority: preparation.priority,
          active: parseBool(preparation.active),
          note: preparation.note,
        })),
      ingredients: links.rows
        .filter((link) => link.dishId === row.id && link.ingredientId)
        .map((link) => {
          const ingredient = ingredientById.get(link.ingredientId);
          return {
            ingredientId: link.ingredientId,
            name: ingredient?.name || `Ingrediens ${link.ingredientId}`,
            quantity: parseNumber(link.quantity),
            unit: link.unit || ingredient?.defaultUnit || "",
            required: parseBool(link.required),
            note: link.note,
            scaling: link.scaling || "Proportionell",
            rounding: link.rounding,
            purchaseUnit: link.purchaseUnit || ingredient?.purchaseUnit || "",
            packageSize: link.packageSize || ingredient?.packageSize || "",
            purchaseNote: link.purchaseNote || ingredient?.purchaseNote || "",
            alternatives: (alternatives?.rows || [])
              .filter(
                (option) =>
                  option.dishId === row.id &&
                  option.standardIngredientId === link.ingredientId &&
                  parseBool(option.enabled),
              )
              .map((option) => {
                const item = ingredientById.get(option.ingredientId);
                if (
                  !item ||
                  !Number.isFinite(parseNumber(option.quantity, NaN))
                )
                  throw new Error(
                    `${row.id}: ogiltigt ingrediensalternativ ${option.ingredientId}.`,
                  );
                return {
                  ingredientId: option.ingredientId,
                  name: item.name,
                  quantity: parseNumber(option.quantity),
                  unit: option.unit,
                  scaling: option.scaling,
                  rounding: option.rounding,
                  purchaseUnit: option.purchaseUnit || item.purchaseUnit,
                  packageSize: option.packageSize || item.packageSize,
                  purchaseNote: option.purchaseNote || item.purchaseNote,
                  preparation: option.preparation,
                };
              }),
          };
        }),
    }));
  return {
    recipes,
    ingredientOptions: ingredients.rows
      .filter((row) => row.id)
      .map((row) => ({
        id: row.id,
        name: row.name,
        defaultUnit: row.defaultUnit,
      })),
    schema: {
      dishes: dishes.columns,
      ingredients: ingredients.columns,
      links: links.columns,
      preparations: preparations.columns,
      ...(alternatives ? { alternatives: alternatives.columns } : {}),
    },
    raw: {
      dishes,
      ingredients,
      links,
      tags,
      preparations,
      ...(alternatives ? { alternatives } : {}),
    },
  };
}
export function columnLetter(index) {
  let n = index + 1,
    out = "";
  while (n > 0) {
    n--;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}
export function a1(sheet, row, column) {
  return `'${sheet.replaceAll("'", "''")}'!${columnLetter(column)}${row}`;
}

import crypto from "node:crypto";
import { a1, normalize } from "./schema.js";
import { validateCard } from "./cards.js";
import { alternativeNote, ingredientListLine } from "./ingredient-label.js";

const SCALING = new Set([
  "Proportionell",
  "Hela enheter",
  "Fast",
  "Personspecifik",
]);
const ROUNDING = new Set(["Normal", "Uppåt", "Ingen"]);
const STATUS = new Set(["Utkast", "Behöver recept", "Aktiv"]);
const PREPARATION_TYPE = new Set([
  "Tina",
  "Marinera",
  "Jäsa",
  "Blötlägg",
  "Starta långkok",
  "Förbered deg",
  "Övrigt",
]);
const PREPARATION_TIMING = new Set([
  "Före servering",
  "Kvällen innan",
  "Morgonen samma dag",
  "Fast tid",
]);
const PREPARATION_PRIORITY = new Set(["Info", "Viktig", "Kritisk"]);

const cell = (row, column) => String(row?.cells?.[column] ?? "");
const number = (value) => Number(String(value ?? "").replace(",", "."));
const comparable = (value) => String(value ?? "").trim();
const filled = (value) => comparable(value) !== "";
const idNumber = (id, prefix) => {
  const match = new RegExp(`^${prefix}(\\d+)$`, "i").exec(String(id || ""));
  return match ? Number(match[1]) : null;
};
const nextId = (used, prefix, width) => {
  let n = Math.max(0, ...[...used].map((id) => idNumber(id, prefix) || 0)) + 1;
  let id = `${prefix}${String(n).padStart(width, "0")}`;
  while (used.has(id)) {
    n++;
    id = `${prefix}${String(n).padStart(width, "0")}`;
  }
  used.add(id);
  return id;
};

function nameSimilarity(a, b) {
  const x = new Set(
    String(a)
      .toLowerCase()
      .split(/[^a-zåäö0-9]+/)
      .filter(Boolean),
  );
  const y = new Set(
    String(b)
      .toLowerCase()
      .split(/[^a-zåäö0-9]+/)
      .filter(Boolean),
  );
  const overlap = [...x].filter((word) => y.has(word)).length;
  return overlap / Math.max(x.size, y.size, 1);
}

export function buildImportPlan(catalog, source) {
  if (source?.version !== 1 || !Array.isArray(source.recipes))
    throw new Error("Importfilen behöver version 1 och en receptlista.");
  const raw = catalog.raw;
  const changes = [];
  const conflicts = [];
  const warnings = [];
  const assignments = [];
  const reserved = new Map();
  const usedDishes = new Set(
    raw.dishes.rows.map((row) => row.id).filter(Boolean),
  );
  const usedIngredients = new Set(
    raw.ingredients.rows.map((row) => row.id).filter(Boolean),
  );
  const usedPreparations = new Set(
    raw.preparations.rows.map((row) => row.id).filter(Boolean),
  );
  const dishByName = new Map(
    raw.dishes.rows
      .filter((row) => row.id)
      .map((row) => [normalize(row.name), row]),
  );
  const ingredientByName = new Map(
    raw.ingredients.rows
      .filter((row) => row.id)
      .map((row) => [normalize(row.name), row]),
  );
  const column = Object.fromEntries(
    Object.entries(raw).map(([kind, sheet]) => [kind, { ...sheet.columns }]),
  );
  const shortRecipeColumn =
    column.dishes.cardRecipe >= 0
      ? column.dishes.cardRecipe
      : raw.dishes.headers.length;
  column.dishes.cardRecipe = shortRecipeColumn;
  const nextRow = Object.fromEntries(
    Object.entries(raw).map(([kind, sheet]) => [kind, sheet.rows.length + 2]),
  );

  function add(kind, rowNumber, key, value, context, { replace = false } = {}) {
    const index = column[kind][key];
    if (index === undefined || index < 0) {
      conflicts.push(`${context}: kolumnen ${key} saknas i ${kind}.`);
      return;
    }
    const row = raw[kind].rows[rowNumber - 2];
    const before =
      rowNumber === 1 ? raw[kind].headers[index] || "" : cell(row, index);
    const after = String(value ?? "");
    if (comparable(before) === comparable(after)) return;
    if (filled(before) && !replace) {
      conflicts.push(
        `${context}: ${a1(rawSheetName(kind), rowNumber, index)} har redan ett annat värde.`,
      );
      return;
    }
    const range = a1(rawSheetName(kind), rowNumber, index);
    if (reserved.has(range)) {
      if (reserved.get(range) !== after)
        conflicts.push(
          `${context}: två förslag vill skriva olika värden till ${range}.`,
        );
      return;
    }
    reserved.set(range, after);
    changes.push({
      kind,
      range,
      row: rowNumber,
      column: index,
      before,
      after,
      writeValue: typeof value === "number" ? value : after,
      context,
    });
  }

  function rawSheetName(kind) {
    return {
      dishes: "Rätter",
      ingredients: "Ingredienser",
      links: "Rätt-ingredienser",
      tags: "Taggar",
      preparations: "Rätt-förberedelser",
    }[kind];
  }

  if (raw.dishes.columns.cardRecipe < 0) {
    if (raw.dishes.headers.length >= 26)
      conflicts.push("Rätter saknar ledig kolumn för Kortrecept.");
    else add("dishes", 1, "cardRecipe", "Kortrecept", "Schema: Kortrecept");
  }

  const seenProposals = new Set();
  for (const [proposalIndex, recipe] of source.recipes.entries()) {
    const context = `Förslag ${proposalIndex + 1}: ${recipe?.name || "namnlös"}`;
    if (!recipe || typeof recipe !== "object" || !filled(recipe.name)) {
      conflicts.push(`${context}: namn saknas.`);
      continue;
    }
    const normalizedName = normalize(recipe.name);
    if (seenProposals.has(normalizedName)) {
      conflicts.push(
        `${context}: samma rätt förekommer flera gånger i importfilen.`,
      );
      continue;
    }
    seenProposals.add(normalizedName);
    const existing = dishByName.get(normalizedName);
    if (!existing) {
      const possible = raw.dishes.rows.find(
        (row) =>
          row.id &&
          (normalize(row.name).includes(normalizedName) ||
            normalizedName.includes(normalize(row.name)) ||
            nameSimilarity(row.name, recipe.name) >= 0.55),
      );
      if (possible) {
        conflicts.push(
          `${context}: möjlig dubblett av ${possible.id} (${possible.name}); granska namnmatchningen.`,
        );
        continue;
      }
    }
    const id = existing?.id || nextId(usedDishes, "M", 3);
    const row = existing?.rowNumber || nextRow.dishes++;
    const isNew = !existing;
    const mode = recipe.mode === "replace" ? "replace" : "fill-empty";
    assignments.push({
      name: recipe.name,
      id,
      action: isNew ? "create" : "update",
      mode,
    });
    const baseServings = number(recipe.servings ?? 4);
    const active = number(recipe.activeTime);
    const total = number(recipe.totalTime);
    if (
      !Number.isInteger(baseServings) ||
      baseServings < 1 ||
      baseServings > 30
    )
      conflicts.push(`${context}: basportioner måste vara 1–30.`);
    if (
      !Number.isInteger(active) ||
      active < 1 ||
      !Number.isInteger(total) ||
      total < active
    )
      conflicts.push(`${context}: aktiv/total tid är ogiltig.`);
    if (!filled(recipe.recipe) || !filled(recipe.cardRecipe))
      conflicts.push(`${context}: fullständigt recept och Kortrecept krävs.`);
    if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length)
      conflicts.push(`${context}: ingredienser saknas.`);
    if (recipe.tags && !Array.isArray(recipe.tags))
      conflicts.push(`${context}: taggar måste vara en lista.`);
    if (recipe.preparations && !Array.isArray(recipe.preparations))
      conflicts.push(`${context}: förberedelser måste vara en lista.`);
    if (recipe.status && !STATUS.has(recipe.status))
      conflicts.push(`${context}: ogiltig status.`);
    const allFields = {
      ...(isNew
        ? { id, name: recipe.name, status: recipe.status || "Utkast" }
        : {}),
      ...(recipe.shortName ? { shortName: recipe.shortName } : {}),
      servings: baseServings,
      activeTime: active,
      totalTime: total,
      recipe: recipe.recipe,
      cardRecipe: recipe.cardRecipe,
    };
    for (const [key, value] of Object.entries(allFields))
      add("dishes", row, key, value, context, { replace: mode === "replace" });
    if (!isNew && recipe.status)
      add("dishes", row, "status", recipe.status, context, {
        replace:
          mode === "replace" ||
          (existing.status === "Behöver recept" && recipe.status === "Utkast"),
      });

    const proposedLines = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
      : [];
    const oldLinks = raw.links.rows.filter(
      (link) => link.dishId === id && link.ingredientId,
    );
    const ingredientById = new Map(
      raw.ingredients.rows.map((ingredient) => [ingredient.id, ingredient]),
    );
    const linksAlreadyMatch =
      oldLinks.length > 0 &&
      oldLinks.length === proposedLines.length &&
      oldLinks.every((old, index) => {
        const line = proposedLines[index];
        return (
          line && normalize(ingredientById.get(old.ingredientId)?.name) ===
            normalize(line.name) &&
          number(old.quantity) === number(line.quantity) &&
          comparable(old.unit) === comparable(line.unit) &&
          comparable(old.required) ===
            (line.required === false ? "Nej" : "Ja") &&
          comparable(old.note) === alternativeNote(line) &&
          comparable(old.scaling) === comparable(line.scaling) &&
          comparable(old.rounding) === comparable(line.rounding) &&
          comparable(old.purchaseUnit) === comparable(line.purchaseUnit) &&
          comparable(old.packageSize) === comparable(line.packageSize) &&
          comparable(old.purchaseNote) === comparable(line.purchaseNote)
        );
      });
    const canReplaceLinks =
      mode === "replace" &&
      oldLinks.length <= proposedLines.length &&
      oldLinks.every(
        (old, index) =>
          normalize(ingredientById.get(old.ingredientId)?.name) ===
          normalize(proposedLines[index]?.name),
      );
    if (oldLinks.length && !linksAlreadyMatch && !canReplaceLinks) {
      conflicts.push(
        `${context}: befintliga ingrediensrelationer skiljer sig från förslaget. Använd replace för samma ingrediensordning; borttagning eller namnbyte kräver manuell granskning.`,
      );
      continue;
    }
    const seenLines = new Set();
    for (const [lineIndex, line] of proposedLines.entries()) {
      const lineContext = `${context}, ingrediens ${lineIndex + 1}`;
      if (!line || !filled(line.name)) {
        conflicts.push(`${lineContext}: namn saknas.`);
        continue;
      }
      const normalized = normalize(line.name);
      if (seenLines.has(normalized)) {
        conflicts.push(`${lineContext}: ingrediensen förekommer två gånger.`);
        continue;
      }
      seenLines.add(normalized);
      const quantity = number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || !filled(line.unit))
        conflicts.push(`${lineContext}: positiv mängd och enhet krävs.`);
      if (!SCALING.has(line.scaling) || !ROUNDING.has(line.rounding))
        conflicts.push(`${lineContext}: ogiltig skalning eller avrundning.`);
      if (line.alternatives && !Array.isArray(line.alternatives))
        conflicts.push(`${lineContext}: alternativ måste vara en lista.`);
      if (linksAlreadyMatch) continue;
      let ingredient = ingredientByName.get(normalized);
      if (!ingredient) {
        const possible = raw.ingredients.rows.find(
          (row) => row.id && nameSimilarity(row.name, line.name) >= 0.65,
        );
        if (possible) {
          conflicts.push(
            `${lineContext}: möjlig dubblett av ingrediens ${possible.id} (${possible.name}).`,
          );
          continue;
        }
        const ingredientId = nextId(usedIngredients, "", 1);
        const ingredientRow = nextRow.ingredients++;
        ingredient = {
          id: ingredientId,
          name: line.name,
          rowNumber: ingredientRow,
        };
        ingredientByName.set(normalized, ingredient);
        for (const [key, value] of Object.entries({
          id: ingredientId,
          name: line.name,
          defaultUnit: line.unit,
        }))
          add("ingredients", ingredientRow, key, value, lineContext);
        const headers = raw.ingredients.headers;
        for (const [header, value] of [
          ["Normaliserat namn", normalized],
          ["Inköpskategori", line.category],
          ["Basvara?", line.baseGood ? "Ja" : "Nej"],
        ]) {
          const index = headers.indexOf(header);
          if (index < 0 || !filled(value))
            conflicts.push(
              `${lineContext}: ${header} saknas eller har inget värde.`,
            );
          else {
            const range = a1("Ingredienser", ingredientRow, index);
            reserved.set(range, String(value));
            changes.push({
              kind: "ingredients",
              range,
              row: ingredientRow,
              column: index,
              before: "",
              after: String(value),
              writeValue: String(value),
              context: lineContext,
            });
          }
        }
      }
      const linkRow = canReplaceLinks && oldLinks[lineIndex]
        ? oldLinks[lineIndex].rowNumber
        : nextRow.links++;
      const values = {
        dishId: id,
        ingredientId: ingredient.id,
        quantity,
        unit: line.unit,
        required: line.required === false ? "Nej" : "Ja",
        note: alternativeNote(line),
        scaling: line.scaling,
        rounding: line.rounding,
        purchaseUnit: line.purchaseUnit || "",
        packageSize: line.packageSize || "",
        purchaseNote: line.purchaseNote || "",
      };
      for (const [key, value] of Object.entries(values))
        if (filled(value))
          add("links", linkRow, key, value, lineContext, {
            replace: canReplaceLinks && Boolean(oldLinks[lineIndex]),
          });
    }
    const existingTags = new Set(
      raw.tags.rows
        .filter((tag) => tag.dishId === id)
        .map((tag) => normalize(tag.name)),
    );
    for (const tag of Array.isArray(recipe.tags) ? recipe.tags : []) {
      if (!filled(tag) || existingTags.has(normalize(tag))) continue;
      existingTags.add(normalize(tag));
      const tagRow = nextRow.tags++;
      add("tags", tagRow, "dishId", id, context);
      add("tags", tagRow, "name", tag, context);
    }
    for (const preparation of Array.isArray(recipe.preparations)
      ? recipe.preparations
      : []) {
      const prepContext = `${context}, förberedelse`;
      const existingPreparation = raw.preparations.rows.find(
        (row) =>
          row.dishId === id &&
          comparable(row.type) === comparable(preparation.type) &&
          comparable(row.instruction) === comparable(preparation.instruction),
      );
      if (existingPreparation) {
        if (
          number(existingPreparation.leadMinutes) !==
            number(preparation.leadMinutes) ||
          comparable(existingPreparation.timingType) !==
            comparable(preparation.timingType) ||
          comparable(existingPreparation.priority) !==
            comparable(preparation.priority || "Info") ||
          comparable(existingPreparation.active) !==
            (preparation.active === false ? "Nej" : "Ja") ||
          comparable(existingPreparation.condition) !==
            comparable(preparation.condition) ||
          comparable(existingPreparation.note) !== comparable(preparation.note)
        )
          conflicts.push(
            `${prepContext}: befintlig förberedelse skiljer sig från förslaget.`,
          );
        continue;
      }
      if (
        !PREPARATION_TYPE.has(preparation.type) ||
        !PREPARATION_TIMING.has(preparation.timingType) ||
        !PREPARATION_PRIORITY.has(preparation.priority || "Info") ||
        !filled(preparation.instruction) ||
        !Number.isInteger(number(preparation.leadMinutes)) ||
        number(preparation.leadMinutes) < 0
      )
        conflicts.push(
          `${prepContext}: ogiltig typ, tidpunkt, prioritet, ledtid eller instruktion.`,
        );
      const preparationId = nextId(usedPreparations, "F", 3);
      const preparationRow = nextRow.preparations++;
      for (const [key, value] of Object.entries({
        id: preparationId,
        dishId: id,
        type: preparation.type,
        leadMinutes: preparation.leadMinutes,
        timingType: preparation.timingType,
        instruction: preparation.instruction,
        condition: preparation.condition || "",
        priority: preparation.priority || "Info",
        active: preparation.active === false ? "Nej" : "Ja",
        note: preparation.note || "",
      }))
        if (filled(value))
          add("preparations", preparationRow, key, value, prepContext);
    }
    const previewRecipe = {
      id,
      name: recipe.name,
      shortName: recipe.shortName || existing?.shortName || recipe.name,
      servings: baseServings,
      activeTime: active,
      totalTime: total,
      recipe: recipe.recipe,
      cardRecipe: recipe.cardRecipe,
      ingredients: proposedLines.map((line) => ({
        ...line,
        note: alternativeNote(line),
      })),
    };
    for (const issue of validateCard(previewRecipe)) {
      const message = `${context}: ${issue.message}`;
      if (issue.level === "error") conflicts.push(message);
      else warnings.push(message);
    }
  }

  const plan = { version: 1, assignments, changes, conflicts, warnings };
  plan.hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ assignments, changes, conflicts, warnings }))
    .digest("hex")
    .slice(0, 16);
  return plan;
}

export function planMarkdown(plan) {
  const lines = [
    "# Matrik – dry-run för receptimport",
    "",
    `Plan-ID: \`${plan.hash}\``,
    `Ändrade celler: **${plan.changes.length}** · Konflikter: **${plan.conflicts.length}** · Varningar: **${plan.warnings.length}**`,
    "",
    "## Rätter",
    "",
    ...plan.assignments.map(
      (item) =>
        `- ${item.action === "create" ? "Skapa" : "Komplettera"} **${item.id} ${item.name}** (${item.mode})`,
    ),
    "",
    "## Konflikter",
    "",
    ...(plan.conflicts.length
      ? plan.conflicts.map((item) => `- ${item}`)
      : ["- Inga."]),
    "",
    "## Varningar",
    "",
    ...(plan.warnings.length
      ? plan.warnings.map((item) => `- ${item}`)
      : ["- Inga."]),
    "",
    "## Alla föreslagna celländringar",
    "",
    "| Flik/cell | Före | Efter | Orsak |",
    "| --- | --- | --- | --- |",
    ...plan.changes.map(
      (change) =>
        `| ${escapeMarkdown(change.range)} | ${escapeMarkdown(change.before)} | ${escapeMarkdown(change.after)} | ${escapeMarkdown(change.context)} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

export function proposalMarkdown(source, plan) {
  const lines = [
    "# Matrik – receptförslag för granskning",
    "",
    `Plan-ID: \`${plan.hash}\` · **Endast förslag; inget har importerats.**`,
    "",
  ];
  for (const [index, recipe] of source.recipes.entries()) {
    const assignment = plan.assignments.find(
      (item) => normalize(item.name) === normalize(recipe?.name),
    );
    if (!recipe || typeof recipe !== "object") continue;
    lines.push(
      `## ${assignment?.id || `Förslag ${index + 1}`} ${recipe.name}`,
      "",
      `**${recipe.servings || 4} portioner · ${recipe.activeTime} min aktiv tid · ${recipe.totalTime} min totalt**`,
      "",
      `Taggar: ${Array.isArray(recipe.tags) ? recipe.tags.join(", ") || "inga" : "ogiltig lista"}`,
      "",
      "### Ingredienser",
      "",
      ...(Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map(
        (item) => `- ${ingredientListLine(item)}`,
      ),
      "",
      "### Fullständigt recept",
      "",
      recipe.recipe,
      "",
      "### Kortrecept",
      "",
      recipe.cardRecipe,
      "",
    );
  }
  return lines.join("\n");
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>")
    .replaceAll("\r", "");
}

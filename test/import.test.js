import assert from "node:assert/strict";
import test from "node:test";
import { makeCatalog } from "../shared/schema.js";
import { buildImportPlan, planMarkdown } from "../shared/import-plan.js";
import {
  cardUnit,
  ingredientDisplayName,
  ingredientListLine,
} from "../shared/ingredient-label.js";
import { renderCard, scaledQuantity } from "../shared/cards.js";

const data = {
  dishes: [
    [
      "Rätt-ID",
      "Namn",
      "Kortnamn",
      "Basportioner",
      "Aktiv tid (min)",
      "Total tid (min)",
      "Instruktion/recept",
      "Bildlänk",
      "QR-innehåll",
      "Status",
      "Anteckning",
      "Har förberedelser",
    ],
    [
      "M001",
      "Mustig gryta",
      "Gryta",
      "4",
      "",
      "",
      "",
      "",
      "M001",
      "Behöver recept",
      "",
      "Nej",
    ],
    [
      "M007",
      "Tacos",
      "Tacos",
      "4",
      "20",
      "25",
      "Befintligt recept",
      "bildlänk",
      "M007",
      "Aktiv",
      "bevara",
      "Nej",
    ],
  ],
  ingredients: [
    [
      "Ingrediens-ID",
      "Namn",
      "Normaliserat namn",
      "Inköpskategori",
      "Basvara?",
      "Standard-enhet",
      "Anteckning",
    ],
    ["1", "Fläskkarré", "flaskkarre", "Kött", "Nej", "g", ""],
  ],
  links: [
    [
      "Rätt-ID",
      "Ingrediens-ID",
      "Basmängd",
      "Enhet",
      "Förberedelse/anmärkning",
      "Obligatorisk?",
      "4 port",
      "6 port",
      "8 port",
      "Skalning",
      "Avrundning",
      "Inköpsenhet",
      "Förpackningsstorlek",
      "Inköpsnotering",
    ],
    [
      "M007",
      "1",
      "500",
      "g",
      "",
      "Ja",
      "500",
      "750",
      "1000",
      "Proportionell",
      "Normal",
      "",
      "",
      "",
    ],
  ],
  tags: [
    ["Rätt-ID", "Tagg"],
    ["M007", "fredag"],
  ],
  preparations: [
    [
      "Förberedelse-ID",
      "Rätt-ID",
      "Typ",
      "Ledtid (min)",
      "Tidpunktstyp",
      "Instruktion",
      "Villkor",
      "Prioritet",
      "Aktiv",
      "Anteckning",
    ],
  ],
};

const line = (name, quantity, unit, extra = {}) => ({
  name,
  quantity,
  unit,
  scaling: "Proportionell",
  rounding: "Normal",
  category: "Frukt & grönt",
  ...extra,
});
const proposal = {
  version: 1,
  recipes: [
    {
      name: "Mustig gryta",
      servings: 4,
      activeTime: 20,
      totalTime: 90,
      status: "Utkast",
      recipe: "Bryn köttet och sjud tills mört. Servera varmt.",
      cardRecipe: "Bryn köttet. Sjud tills mört. Servera.",
      tags: ["gryta"],
      ingredients: [
        line("Fläskkarré", 700, "g", {
          alternatives: ["picnicbog", "fläskbog"],
        }),
      ],
    },
    {
      name: "Morotssoppa",
      shortName: "Morotssoppa",
      servings: 4,
      activeTime: 15,
      totalTime: 30,
      recipe: "Koka morötter i buljong och mixa slätt.",
      cardRecipe: "Koka morötter. Mixa soppan.",
      tags: ["soppa"],
      ingredients: [line("Morötter", 500, "g")],
      preparations: [
        {
          type: "Tina",
          leadMinutes: 60,
          timingType: "Före servering",
          instruction: "Tina morötterna",
          priority: "Info",
        },
      ],
    },
  ],
};

function appliedCatalog(plan) {
  const values = structuredClone(data);
  for (const change of plan.changes) {
    const rows = values[change.kind];
    while (rows.length < change.row) rows.push([]);
    rows[change.row - 1][change.column] = change.after;
  }
  return makeCatalog(values);
}

test("dry-run tilldelar nya ID:n och visar varje arkcell utan att röra befintliga värden eller formelkolumner", () => {
  const plan = buildImportPlan(makeCatalog(data), proposal);
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(
    plan.assignments.map(({ id, action }) => [id, action]),
    [
      ["M001", "update"],
      ["M008", "create"],
    ],
  );
  assert.ok(
    plan.changes.some(
      (change) =>
        change.range === "'Rätter'!M1" && change.after === "Kortrecept",
    ),
  );
  assert.ok(plan.changes.some((change) => change.range === "'Rätter'!M2"));
  assert.ok(
    plan.changes.some(
      (change) => change.range === "'Rätter'!J2" && change.after === "Utkast",
    ),
  );
  assert.ok(plan.changes.some((change) => change.kind === "preparations"));
  assert.ok(
    plan.changes.some(
      (change) => change.kind === "ingredients" && change.after === "Morötter",
    ),
  );
  assert.ok(
    plan.changes.every(
      (change) =>
        !/('Rätter'!L|('Rätt-ingredienser'![GHI]))\d+/.test(change.range),
    ),
  );
  assert.ok(
    plan.changes.every(
      (change) => change.row !== 3 || change.kind !== "dishes",
    ),
  );
  assert.match(planMarkdown(plan), /Alla föreslagna celländringar/);
});

test("samma import en gång till ger inga ändringar eller dubbletter", () => {
  const first = buildImportPlan(makeCatalog(data), proposal);
  const second = buildImportPlan(appliedCatalog(first), proposal);
  assert.equal(second.conflicts.length, 0);
  assert.equal(second.changes.length, 0);
  assert.deepEqual(
    second.assignments.map((item) => item.id),
    ["M001", "M008"],
  );
});

test("dessert får nästa lediga D-ID utan att ändra befintliga M-recept", () => {
  const dessert = {
    ...proposal.recipes[1],
    id: "D001",
    type: "Dessert",
    name: "Kladdkaka",
    shortName: "Kladdkaka",
    recipe: "Vispa smeten. Grädda och låt svalna.",
    cardRecipe: "Vispa. Grädda. Låt svalna.",
    ingredients: [line("Mjölk", 1, "dl")],
    preparations: [],
  };
  const plan = buildImportPlan(makeCatalog(data), {
    version: 1,
    recipes: [dessert],
  });
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.assignments[0].id, "D001");
  assert.equal(plan.assignments[0].action, "create");
  assert.equal(
    plan.changes.some(
      (change) => change.row > 1 && change.row <= 3 && change.kind === "dishes",
    ),
    false,
  );
  assert.equal(
    plan.changes.some((change) => change.after === "Recepttyp"),
    false,
  );
  const imported = appliedCatalog(plan);
  assert.equal(
    imported.recipes.find((recipe) => recipe.id === "D001").type,
    "Dessert",
  );
  assert.equal(
    imported.recipes.find((recipe) => recipe.id === "M007").type,
    "Maträtt",
  );
  const repeat = buildImportPlan(imported, { version: 1, recipes: [dessert] });
  assert.deepEqual(repeat.conflicts, []);
  assert.equal(repeat.changes.length, 0);
  const withColumn = structuredClone(data);
  withColumn.dishes[0].push("Recepttyp");
  const typedPlan = buildImportPlan(makeCatalog(withColumn), {
    version: 1,
    recipes: [dessert],
  });
  assert.ok(
    typedPlan.changes.some(
      (change) => change.kind === "dishes" && change.after === "Dessert",
    ),
  );
});

test("dessertimport stoppar ID-krock och felaktig recepttyp", () => {
  const dessert = {
    ...proposal.recipes[1],
    id: "M007",
    type: "Dessert",
    name: "Kladdkaka",
    ingredients: [line("Mjölk", 1, "dl")],
    preparations: [],
  };
  const plan = buildImportPlan(makeCatalog(data), {
    version: 1,
    recipes: [dessert],
  });
  assert.ok(plan.conflicts.some((message) => message.includes("angivet ID")));
  const mismatch = buildImportPlan(makeCatalog(data), {
    version: 1,
    recipes: [{ ...dessert, id: "D001", name: "Tacos" }],
  });
  assert.ok(
    mismatch.conflicts.some((message) => message.includes("recepttyp")),
  );
});

test("receptregistret stoppar dubbla ID:n", () => {
  const duplicate = structuredClone(data);
  duplicate.dishes[2][0] = "M001";
  assert.throws(() => makeCatalog(duplicate), /dubbla recept-ID/);
});

test("befintligt recept och befintliga ingrediensrelationer skyddas mot överskrivning", () => {
  const changed = structuredClone(data);
  changed.dishes[1][6] = "Redan skrivet recept";
  const plan = buildImportPlan(makeCatalog(changed), proposal);
  assert.ok(
    plan.conflicts.some((message) =>
      message.includes("har redan ett annat värde"),
    ),
  );
  const added = appliedCatalog(buildImportPlan(makeCatalog(data), proposal));
  const modified = structuredClone(proposal);
  modified.recipes[0].ingredients[0].quantity = 800;
  const second = buildImportPlan(added, modified);
  assert.ok(
    second.conflicts.some((message) =>
      message.includes("ingrediensrelationer skiljer sig"),
    ),
  );
});

test("replace kan uppdatera en befintlig relation utan att skapa en dubblett", () => {
  const replacement = {
    version: 1,
    recipes: [
      {
        name: "Tacos",
        mode: "replace",
        servings: 4,
        activeTime: 20,
        totalTime: 25,
        recipe: "Befintligt recept",
        cardRecipe: "Befintligt kortrecept",
        ingredients: [line("Fläskkarré", 600, "g")],
      },
    ],
  };
  const first = buildImportPlan(makeCatalog(data), replacement);
  assert.equal(first.conflicts.length, 0);
  assert.ok(
    first.changes.some(
      (change) =>
        change.range === "'Rätt-ingredienser'!C2" && change.after === "600",
    ),
  );
  assert.equal(
    first.changes.filter(
      (change) => change.kind === "links" && change.column === 1,
    ).length,
    0,
  );
  const second = buildImportPlan(appliedCatalog(first), replacement);
  assert.equal(second.conflicts.length, 0);
  assert.equal(second.changes.length, 0);
});

test("möjlig dubblett och ogiltig skalning stoppar import", () => {
  const similar = structuredClone(proposal);
  similar.recipes[1].name = "Tacos med köttfärs";
  const plan = buildImportPlan(makeCatalog(data), similar);
  assert.ok(
    plan.conflicts.some((message) => message.includes("möjlig dubblett")),
  );
  const invalid = structuredClone(proposal);
  invalid.recipes[0].ingredients[0].scaling = "Gissad";
  assert.ok(
    buildImportPlan(makeCatalog(data), invalid).conflicts.some((message) =>
      message.includes("ogiltig skalning"),
    ),
  );
});

test("granskad liknande rätt kan skapas separat bara när befintligt ID anges", () => {
  const similar = structuredClone(proposal);
  similar.recipes[1].name = "Tacos med köttfärs";
  similar.recipes[1].distinctFrom = ["M007"];
  const plan = buildImportPlan(makeCatalog(data), similar);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.assignments[1].action, "create");
  assert.notEqual(plan.assignments[1].id, "M007");
  assert.ok(
    plan.warnings.some((message) => message.includes("separat rätt från M007")),
  );
  similar.recipes[1].distinctFrom = ["M999"];
  assert.ok(buildImportPlan(makeCatalog(data), similar).conflicts.length > 0);
});

test("kortet visar endast standardråvaran medan redigeraren visar alternativen", () => {
  const recipe = appliedCatalog(buildImportPlan(makeCatalog(data), proposal))
    .recipes[0];
  const ingredient = recipe.ingredients[0];
  assert.equal(
    ingredientDisplayName(ingredient),
    "Fläskkarré / picnicbog / fläskbog",
  );
  assert.equal(scaledQuantity(ingredient, 6, 4), "1050");
  assert.match(renderCard(recipe, "back"), /Fläskkarré/);
  assert.doesNotMatch(renderCard(recipe, "back"), /picnicbog/);
  assert.equal(
    ingredientDisplayName({ name: "Frysta wokgrönsaker", required: false }),
    "Frysta wokgrönsaker (valfri)",
  );
  assert.equal(
    scaledQuantity({ quantity: 2, scaling: "Hela enheter" }, 6, 4),
    "3",
  );
  assert.equal(
    ingredientListLine({ name: "Färdig currysås", quantity: 2, unit: "burk" }),
    "2 burkar färdig currysås",
  );
  assert.equal(
    ingredientListLine({ name: "Morötter", quantity: 1, unit: "st" }),
    "1 morot",
  );
  assert.equal(
    ingredientListLine({
      name: "Pizzakit med deg och tomatsås",
      quantity: 2,
      unit: "kit",
    }),
    "2 pizzakit med deg och tomatsås",
  );
  assert.equal(
    cardUnit({ name: "Färdig currysås", unit: "burk" }, ["2", "3", "4"]),
    "burkar",
  );
  assert.equal(
    cardUnit({ name: "Pizzakit med deg och tomatsås", unit: "kit" }, [
      "2",
      "3",
      "4",
    ]),
    "",
  );
});

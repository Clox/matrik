import test from "node:test";
import assert from "node:assert/strict";
import { makeCatalog } from "../shared/schema.js";
import { renderCard, scaledQuantity } from "../shared/cards.js";
import { backCardMarkdown } from "../shared/card-copy.js";
import { shoppingList } from "../shared/shopping-list.js";

const line = (ingredientId, name, quantity, unit, extra = {}) => ({
  ingredientId,
  name,
  quantity,
  unit,
  required: true,
  scaling: "Proportionell",
  ...extra,
});
const recipe = (id, ingredients) => ({
  id,
  name: id,
  servings: 4,
  activeTime: 20,
  totalTime: 30,
  cardRecipe: "Stek och servera.",
  ingredients,
});
const entry = (id, servings = 4, choices = {}) => ({
  id: `plan-${id}`,
  recipeId: id,
  servings,
  choices,
});

test("valfria Sheet-kolumner har bakåtkompatibla standardvärden", () => {
  const catalog = makeCatalog({
    dishes: [
      ["Rätt-ID", "Namn", "Har förberedelser"],
      ["M001", "Prov", "Nej"],
    ],
    ingredients: [
      ["Ingrediens-ID", "Namn"],
      ["1", "Rapsolja"],
    ],
    links: [
      ["Rätt-ID", "Ingrediens-ID", "Basmängd", "Enhet", "Obligatorisk"],
      ["M001", "1", "1", "msk", "Ja"],
    ],
    tags: [["Rätt-ID", "Tagg"]],
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
  });
  assert.deepEqual(
    (({ cardVisibility, quantityMode, purchaseMode }) => [
      cardVisibility,
      quantityMode,
      purchaseMode,
    ])(catalog.recipes[0].ingredients[0]),
    ["Visa", "Exakt", "Beräkna"],
  );
  assert.equal(shoppingList(catalog.recipes, [entry("M001")])[0].amount, 1);
});

test("nya Sheet-fält läses per relation och Ingen tillåter tom mängd", () => {
  const catalog = makeCatalog({
    dishes: [
      ["Rätt-ID", "Namn", "Har förberedelser"],
      ["M001", "Prov", "Nej"],
    ],
    ingredients: [
      ["Ingrediens-ID", "Namn"],
      ["1", "Rapsolja"],
    ],
    links: [
      [
        "Rätt-ID",
        "Ingrediens-ID",
        "Basmängd",
        "Enhet",
        "Obligatorisk",
        "Kortvisning",
        "Mängdläge",
        "Inköpsläge",
      ],
      ["M001", "1", "", "", "Ja", "Dölj", "Ingen", "Kontrollera hemma"],
    ],
    tags: [["Rätt-ID", "Tagg"]],
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
  });
  const ingredient = catalog.recipes[0].ingredients[0];
  assert.equal(ingredient.quantity, "");
  assert.equal(ingredient.cardVisibility, "Dölj");
  assert.equal(ingredient.quantityMode, "Ingen");
  assert.equal(ingredient.purchaseMode, "Kontrollera hemma");
  assert.equal(
    shoppingList(catalog.recipes, [entry("M001")])[0].checkOnly,
    true,
  );
});

test("dold rad finns kvar i receptdata och inköpskontroll men inte på kortet", () => {
  const fat = line("10", "Rapsolja", 2, "msk", {
    displayName: "Matfett",
    cardVisibility: "Dölj",
    quantityMode: "Ungefärlig",
    purchaseMode: "Kontrollera hemma",
  });
  const r = recipe("M001", [line("20", "Potatis", 800, "g"), fat]);
  assert.equal(r.ingredients.length, 2);
  assert.doesNotMatch(renderCard(r, "back"), /Matfett|Rapsolja/);
  assert.doesNotMatch(backCardMarkdown(r), /Matfett|Rapsolja/);
  for (const servings of [4, 6, 8]) {
    const result = shoppingList([r], [entry("M001", servings)]);
    assert.equal(
      result.find((item) => item.name === "Potatis").amount,
      (800 * servings) / 4,
    );
    const check = result.find((item) => item.name === "Rapsolja");
    assert.equal(check.checkOnly, true);
    assert.equal(check.amount, null);
    assert.equal(check.sources[0].servings, servings);
  }
});

test("ungefärlig historisk mängd räknas aldrig som exakt inköpsbehov", () => {
  const r = recipe("M001", [
    line("10", "Rapsolja", 2, "msk", {
      quantityMode: "Ungefärlig",
      purchaseMode: "Beräkna",
    }),
  ]);
  for (const servings of [4, 6, 8]) {
    const result = shoppingList([r], [entry("M001", servings)]);
    assert.equal(result.length, 1);
    assert.equal(result[0].amount, null);
    assert.equal(result[0].checkOnly, true);
  }
  assert.equal(
    scaledQuantity({ quantity: "", quantityMode: "Ingen" }, 4, 4),
    "",
  );
});

test("samma konkreta grundvara ger en kontrollrad och exakta mängder bevaras", () => {
  const checkFat = line("10", "Rapsolja", 2, "msk", {
    quantityMode: "Ungefärlig",
    purchaseMode: "Kontrollera hemma",
  });
  const exactFat = line("10", "Rapsolja", 3, "msk");
  const a = recipe("M001", [checkFat]);
  const b = recipe("M002", [checkFat]);
  const c = recipe("M003", [exactFat]);
  const result = shoppingList(
    [a, b, c],
    [entry("M001", 4), entry("M002", 6), entry("M003", 8)],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].amount, 6);
  assert.equal(result[0].sources.length, 3);
  assert.equal(result[0].checkSources.length, 2);
});

test("M009:s granskade legacy-ID kopplas till Smör 47 utan namnbaserad sammanblandning", () => {
  const mash = line("47", "Smör", 25, "g");
  const fry = line("7", "Smör/olja", 1, "msk", {
    quantityMode: "Ungefärlig",
    purchaseMode: "Kontrollera hemma",
    alternatives: [line("10", "Rapsolja", 1, "msk")],
  });
  const r = recipe("M009", [mash, fry]);
  let result = shoppingList([r], [entry("M009")]);
  assert.equal(result.length, 1);
  assert.equal(result[0].amount, 25);
  assert.equal(result[0].checkSources.length, 1);
  result = shoppingList([r], [entry("M009", 6, { 7: { ingredientId: "10" } })]);
  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.name === "Rapsolja").checkOnly, true);
  assert.equal(result.find((item) => item.name === "Smör").amount, 37.5);

  const unrelated = recipe("M011", [line("999", "Smör", 10, "g")]);
  result = shoppingList([r, unrelated], [entry("M009"), entry("M011")]);
  assert.equal(result.filter((item) => item.name === "Smör").length, 2);
});

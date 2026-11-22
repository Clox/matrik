import test from "node:test";
import assert from "node:assert/strict";
import { makeCatalog } from "../shared/schema.js";
import { cardIngredientName } from "../shared/ingredient-label.js";
import { ingredientChoices, shoppingList } from "../shared/shopping-list.js";
import { renderCard } from "../shared/cards.js";

const data = {
  dishes: [
    ["Rätt-ID", "Namn", "Har förberedelser"],
    ["M032", "Bakad potatis med kyckling", "Nej"],
  ],
  ingredients: [
    ["Ingrediens-ID", "Namn", "Enhet"],
    ["28", "Kycklingfilé", "g"],
    ["140", "Färdiglagad kyckling", "g"],
  ],
  links: [
    [
      "Rätt-ID",
      "Ingrediens-ID",
      "Basmängd",
      "Enhet",
      "Obligatorisk",
      "Skalningstyp",
    ],
    ["M032", "28", "600", "g", "Ja", "Proportionell"],
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
  alternatives: [
    [
      "Rätt-ID",
      "Standard-ingrediens-ID",
      "Alternativ-ingrediens-ID",
      "Basmängd",
      "Enhet",
      "Skalningstyp",
      "Avrundning",
      "Inköpsenhet",
      "Förpackningsstorlek",
      "Inköpsnotering",
      "Tillagningsanpassning",
      "Valbar",
    ],
    [
      "M032",
      "28",
      "140",
      "500",
      "g",
      "Proportionell",
      "",
      "",
      "",
      "Värm enligt förpackningen",
      "Hoppa över råkycklingstekningen",
      "Ja",
    ],
  ],
};

test("Sheets-alternativ kopplas till exakt receptrelation och skalar egen mängd", () => {
  const recipe = makeCatalog(data).recipes[0];
  const line = recipe.ingredients[0];
  assert.deepEqual(ingredientChoices(line), [
    "Kycklingfilé",
    "Färdiglagad kyckling",
  ]);
  for (const [servings, expected] of [
    [4, 500],
    [6, 750],
    [8, 1000],
  ]) {
    const list = shoppingList(
      [recipe],
      [
        {
          id: "one",
          recipeId: recipe.id,
          servings,
          choices: { 28: { ingredientId: "140" } },
        },
      ],
    );
    assert.equal(list[0].name, "Färdiglagad kyckling");
    assert.equal(list[0].amount, expected);
    assert.equal(
      list[0].sources[0].preparation,
      "Hoppa över råkycklingstekningen",
    );
  }
  assert.equal(cardIngredientName(line), "Kycklingfilé");
  assert.doesNotMatch(renderCard(recipe, "back"), /Färdiglagad kyckling/);
});

test("valfritt relationsfält gör standardingrediens bortvalbar utan att ändra äldre rader", () => {
  const withField = structuredClone(data);
  withField.links[0].push("Kan väljas bort");
  withField.links[1].push("Ja");
  assert.equal(
    makeCatalog(withField).recipes[0].ingredients[0].canExclude,
    true,
  );
  assert.equal(makeCatalog(data).recipes[0].ingredients[0].canExclude, false);
});

test("ofullständiga eller lösa alternativ stoppas vid inläsning", () => {
  const missing = structuredClone(data);
  missing.alternatives[1][1] = "999";
  assert.throws(() => makeCatalog(missing), /Ogiltig alternativrelation/);
  const incomplete = structuredClone(data);
  incomplete.alternatives[1][3] = "";
  assert.throws(
    () => makeCatalog(incomplete),
    /Ofullständigt ingrediensalternativ/,
  );
});

test("receptspecifikt Visningsnamn syns på kort men inköpslistan behåller vald råvara", () => {
  const fixture = structuredClone(data);
  fixture.ingredients[1][1] = "Rapsolja";
  fixture.ingredients[2][1] = "Smör";
  fixture.links[1][2] = "2";
  fixture.links[1][3] = "msk";
  fixture.alternatives[1][3] = "2";
  fixture.alternatives[1][4] = "msk";
  fixture.links[0].push("Visningsnamn");
  fixture.links[1].push("Matfett");
  const recipe = makeCatalog(fixture).recipes[0];
  const line = recipe.ingredients[0];
  assert.equal(cardIngredientName(line), "Matfett");
  assert.match(renderCard(recipe, "back"), /Matfett/);
  for (const servings of [4, 6, 8]) {
    const list = shoppingList(
      [recipe],
      [{ id: "one", recipeId: recipe.id, servings, choices: {} }],
    );
    assert.equal(list[0].name, "Rapsolja");
    assert.equal(list[0].amount, (2 * servings) / 4);
    const alternative = shoppingList(
      [recipe],
      [
        {
          id: "one",
          recipeId: recipe.id,
          servings,
          choices: { 28: { ingredientId: "140" } },
        },
      ],
    );
    assert.equal(alternative[0].name, "Smör");
    assert.equal(alternative[0].amount, (2 * servings) / 4);
  }
});

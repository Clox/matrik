import test from "node:test";
import assert from "node:assert/strict";
import {
  displayIngredientEntries,
  standardCardIngredients,
  validateDisplayOrder,
} from "../shared/ingredient-order.js";

test("visningsordning sorterar presentationen men bevarar relationsindex", () => {
  const lines = [
    { ingredientId: "a", displayOrder: "2" },
    { ingredientId: "b", displayOrder: "" },
    { ingredientId: "c", displayOrder: "1" },
  ];
  assert.deepEqual(
    displayIngredientEntries(lines).map(({ index }) => index),
    [2, 0, 1],
  );
  assert.deepEqual(
    lines.map((line) => line.ingredientId),
    ["a", "b", "c"],
  );
  assert.doesNotThrow(() => validateDisplayOrder(lines));
  assert.throws(() =>
    validateDisplayOrder([{ displayOrder: "1" }, { displayOrder: "1" }]),
  );
  assert.throws(() => validateDisplayOrder([{ displayOrder: "1.5" }]));
});

test("standardkortet döljer ett valfritt ersättningstillbehör utan att ta bort relationen", () => {
  const recipe = {
    ingredients: [
      {
        ingredientId: "57",
        name: "Frysta pommes",
        required: true,
        displayOrder: "1",
      },
      {
        ingredientId: "26",
        name: "Potatis",
        required: false,
        purchaseNote: "i stället för Frysta pommes",
        displayOrder: "2",
      },
      {
        ingredientId: "140",
        name: "Rapsolja",
        required: false,
        cardVisibility: "Dölj",
        displayOrder: "3",
      },
    ],
  };
  assert.deepEqual(
    standardCardIngredients(recipe).map((x) => x.ingredientId),
    ["57"],
  );
  assert.equal(recipe.ingredients.length, 3);
});

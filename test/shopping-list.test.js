import test from "node:test";
import assert from "node:assert/strict";
import {
  applyIngredientChoice,
  ingredientChoices,
  lineKey,
  shoppingList,
} from "../shared/shopping-list.js";

const recipe = (id, ingredients) => ({
  id,
  name: `Rätt ${id}`,
  servings: 4,
  ingredients,
});
const line = (ingredientId, name, quantity, unit, extra = {}) => ({
  ingredientId,
  name,
  quantity,
  unit,
  required: true,
  scaling: "Proportionell",
  ...extra,
});
const entry = (recipeId, servings = 4, choices = {}) => ({
  id: `plan-${recipeId}`,
  recipeId,
  servings,
  choices,
});

test("samlar alla ingredienser utan niogradersgräns och visar ursprungsrätter", () => {
  const r = recipe(
    "M001",
    Array.from({ length: 14 }, (_, i) =>
      line(String(i + 1), `Vara ${i + 1}`, 100, "g"),
    ),
  );
  const result = shoppingList([r], [entry("M001")]);
  assert.equal(result.length, 14);
  assert.deepEqual(
    result[0].sources.map((s) => s.recipeId),
    ["M001"],
  );
});

test("summera samma vara efter individuell skalning 4, 6 och 8 portioner", () => {
  const a = recipe("M001", [line("1", "Potatis", 400, "g")]);
  const b = recipe("M002", [line("1", "Potatis", 0.5, "kg")]);
  const result = shoppingList([a, b], [entry("M001", 6), entry("M002", 8)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].amount, 1600);
  assert.equal(result[0].unit, "g");
  assert.deepEqual(
    result[0].sources.map((s) => s.amount),
    [600, 1],
  );
});

test("hela enheter avrundas per recept och förpackningar efter totalen", () => {
  const a = recipe("M001", [
    line("1", "Ägg", 1, "st", { scaling: "Hela enheter", packageSize: "6 st" }),
  ]);
  const b = recipe("M002", [
    line("1", "Ägg", 1, "st", { scaling: "Hela enheter", packageSize: "6 st" }),
  ]);
  const result = shoppingList([a, b], [entry("M001", 6), entry("M002", 8)]);
  assert.equal(result[0].amount, 4);
  assert.deepEqual(result[0].packages, { count: 1, size: "6 st" });
});

test("blandade volymenheter räknas om men olika sorters enhet hålls isär", () => {
  const a = recipe("M001", [
    line("1", "Mjölk", 1, "dl"),
    line("2", "Citron", 1, "st"),
  ]);
  const b = recipe("M002", [
    line("1", "Mjölk", 50, "ml"),
    line("2", "Citron", 2, "msk"),
  ]);
  const result = shoppingList([a, b], [entry("M001"), entry("M002")]);
  assert.equal(result.find((x) => x.name === "Mjölk").amount, 1.5);
  assert.equal(result.find((x) => x.name === "Mjölk").unit, "dl");
  assert.equal(result.filter((x) => x.name === "Citron").length, 2);
});

test("alternativ ersätter råvaran och valfria ingredienser kan väljas till", () => {
  const r = recipe("M001", [
    line("1", "Fläskkarré", 500, "g", {
      note: "Alternativ: picnicbog / fläskbog",
    }),
    line("2", "Svamp", 200, "g", { required: false }),
  ]);
  assert.deepEqual(ingredientChoices(r.ingredients[0]), [
    "Fläskkarré",
    "picnicbog",
    "fläskbog",
  ]);
  let plan = entry("M001");
  assert.deepEqual(
    shoppingList([r], [plan]).map((x) => x.name),
    ["Fläskkarré"],
  );
  plan = applyIngredientChoice(plan, r, 0, { name: "picnicbog" });
  plan = applyIngredientChoice(plan, r, 1, { included: true });
  assert.deepEqual(
    shoppingList([r], [plan]).map((x) => x.name),
    ["picnicbog", "Svamp"],
  );
});

test("M013-liknande tillbehör väljer pommes eller rå potatis, aldrig båda", () => {
  const r = recipe("M013", [
    line("57", "Frysta pommes", 600, "g"),
    line("26", "Potatis", 700, "g", {
      required: false,
      purchaseNote: "Köp i stället för frysta pommes.",
    }),
  ]);
  let plan = entry("M013");
  assert.deepEqual(
    shoppingList([r], [plan]).map((x) => x.name),
    ["Frysta pommes"],
  );
  plan = applyIngredientChoice(plan, r, 1, { included: true });
  assert.equal(plan.choices[lineKey(r.ingredients[0], 0)].included, false);
  assert.deepEqual(
    shoppingList([r], [plan]).map((x) => x.name),
    ["Potatis"],
  );
  plan = applyIngredientChoice(plan, r, 0, { included: true });
  assert.equal(plan.choices[lineKey(r.ingredients[1], 1)].included, false);
  assert.deepEqual(
    shoppingList([r], [plan]).map((x) => x.name),
    ["Frysta pommes"],
  );
});

test("inköpsenhet utan förpackningsstorlek ger ingen påhittad förpackningsmängd", () => {
  const r = recipe("M007", [
    line("1", "Tortillabröd", 8, "st", { purchaseUnit: "förp" }),
  ]);
  const result = shoppingList([r], [entry("M007")]);
  assert.equal(result[0].amount, 8);
  assert.equal(result[0].packages, null);
  assert.deepEqual(result[0].purchaseUnits, ["förp"]);
});

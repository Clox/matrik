import assert from "node:assert/strict";
import test from "node:test";
import { filterRecipes, recipeType } from "../shared/recipe-type.js";
import {
  applyIngredientChoice,
  shoppingList,
} from "../shared/shopping-list.js";
import {
  addPlanEntry,
  normalizeWeekPlan,
  removePlanEntry,
  replacePlanEntry,
  updatePlanEntry,
} from "../shared/weekly-plan.js";

const ingredient = (id, name, quantity, unit, extra = {}) => ({
  ingredientId: id,
  name,
  quantity,
  unit,
  required: true,
  scaling: "Proportionell",
  ...extra,
});
const food = {
  id: "M001",
  name: "Middag",
  servings: 4,
  ingredients: [
    ingredient("1", "Mjölk", 2, "dl"),
    ingredient("2", "Lök", 1, "st", { required: false }),
  ],
};
const dessert = {
  id: "D001",
  name: "Kladdkaka",
  servings: 4,
  ingredients: [
    ingredient("1", "Mjölk", 1, "dl"),
    ingredient("3", "Ägg", 2, "st"),
  ],
};

test("M utan typ och D utan typ filtreras rätt utan att ändra 47 maträtter", () => {
  const meals = Array.from({ length: 47 }, (_, index) => ({
    id: `M${String(index + 1).padStart(3, "0")}`,
  }));
  const all = [...meals, dessert];
  assert.equal(recipeType(food), "Maträtt");
  assert.equal(recipeType(dessert), "Dessert");
  assert.equal(filterRecipes(all, "Maträtt").length, 47);
  assert.deepEqual(filterRecipes(all, "Dessert"), [dessert]);
  assert.equal(filterRecipes(all, "Alla").length, 48);
});

test("upprepade maträtter och desserter samma dag summeras per förekomst", () => {
  let sequence = 0;
  const id = () => `entry-${++sequence}`;
  let plan = [];
  plan = addPlanEntry(plan, food, "monday", id);
  plan = addPlanEntry(plan, food, "monday", id);
  plan = addPlanEntry(plan, dessert, "monday", id);
  plan = addPlanEntry(plan, dessert, "monday", id);
  plan = addPlanEntry(plan, food, "thursday", id);
  plan = updatePlanEntry(plan, "entry-2", { servings: 6 });
  plan = updatePlanEntry(plan, "entry-4", { servings: 8 });
  const chosen = applyIngredientChoice(plan[1], food, 1, { included: true });
  plan = updatePlanEntry(plan, "entry-2", { choices: chosen.choices });
  const list = shoppingList([food, dessert], plan);
  const milk = list.find((item) => item.name === "Mjölk");
  assert.equal(milk.total, 1000);
  assert.equal(milk.sources.length, 5);
  assert.equal(new Set(milk.sources.map((source) => source.entryId)).size, 5);
  assert.equal(
    list.find((item) => item.name === "Lök").sources[0].entryId,
    "entry-2",
  );
  plan = removePlanEntry(plan, "entry-2");
  assert.equal(
    shoppingList([food, dessert], plan).find((item) => item.name === "Mjölk")
      .total,
    700,
  );
  assert.equal(
    shoppingList([food, dessert], plan).some((item) => item.name === "Lök"),
    false,
  );
  assert.equal(plan.length, 4);
});

test("flytt och byte påverkar bara vald förekomst", () => {
  let plan = addPlanEntry([], food, "monday", () => "a");
  plan = addPlanEntry(plan, food, "monday", () => "b");
  plan = updatePlanEntry(plan, "b", { day: "friday", servings: 8 });
  plan = replacePlanEntry(plan, "b", dessert);
  assert.deepEqual(
    plan.map((entry) => [entry.id, entry.recipeId, entry.day, entry.servings]),
    [
      ["a", "M001", "monday", 4],
      ["b", "D001", "friday", 4],
    ],
  );
  assert.deepEqual(plan[1].choices, {});
  assert.equal(
    shoppingList([food, dessert], plan).find((item) => item.name === "Mjölk")
      .total,
    300,
  );
});

test("alternativa varor väljs separat för två tillfällen av samma recept", () => {
  const choiceRecipe = {
    ...food,
    ingredients: [
      ingredient("4", "Mjölk", 2, "dl", { note: "Alternativ: havremjölk" }),
    ],
  };
  let plan = addPlanEntry([], choiceRecipe, "saturday", () => "first");
  plan = addPlanEntry(plan, choiceRecipe, "saturday", () => "second");
  const secondChoice = applyIngredientChoice(plan[1], choiceRecipe, 0, {
    name: "havremjölk",
  });
  plan = updatePlanEntry(plan, "second", { choices: secondChoice.choices });
  const list = shoppingList([choiceRecipe], plan);
  assert.deepEqual(
    list.map((item) => item.name),
    ["havremjölk", "Mjölk"],
  );
  assert.deepEqual(
    list.map((item) => item.sources[0].entryId),
    ["second", "first"],
  );
});

test("äldre sparade planer behåller innehåll och får dag utan att förlora val", () => {
  const old = [
    {
      id: "old",
      recipeId: "M001",
      servings: 6,
      choices: { "1:0": { included: false } },
    },
  ];
  const plan = normalizeWeekPlan(old);
  assert.equal(plan[0].id, "old");
  assert.equal(plan[0].day, "unscheduled");
  assert.deepEqual(plan[0].choices, old[0].choices);
  assert.equal(plan[0].servings, 6);
});

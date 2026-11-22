import test from "node:test";
import assert from "node:assert/strict";
import {
  applyIngredientChoice,
  canToggleIngredient,
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

test("förvalt bacon kan väljas bort utan att öppna andra obligatoriska rader", () => {
  const r = recipe("M048", [
    line("111", "Bacon", 300, "g", { canExclude: true }),
    line("40", "Ägg", 4, "st", { scaling: "Hela enheter" }),
  ]);
  assert.equal(canToggleIngredient(r, r.ingredients[0]), true);
  assert.equal(canToggleIngredient(r, r.ingredients[1]), false);
  const plan = applyIngredientChoice(entry("M048"), r, 0, { included: false });
  for (const servings of [4, 6, 8]) {
    const result = shoppingList([r], [{ ...plan, servings }]);
    assert.equal(
      result.some((item) => item.ingredientId === "111"),
      false,
    );
    assert.equal(
      result.find((item) => item.ingredientId === "40").amount,
      servings,
    );
  }
  // Ett äldre eller manipulerat sparat val kan inte ta bort ett låst ägg.
  const tampered = entry("M048", 4, { 40: { included: false } });
  assert.equal(
    shoppingList([r], [tampered]).find((item) => item.ingredientId === "40")
      .amount,
    4,
  );
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
      alternatives: [
        line("2", "Picnicbog, benfri", 650, "g", {
          preparation: "Sjud tills köttet är mört.",
        }),
      ],
    }),
    line("3", "Svamp", 200, "g", { required: false }),
  ]);
  assert.deepEqual(ingredientChoices(r.ingredients[0]), [
    "Fläskkarré",
    "Picnicbog, benfri",
  ]);
  let plan = entry("M001");
  assert.deepEqual(
    shoppingList([r], [plan]).map((x) => x.name),
    ["Fläskkarré"],
  );
  plan = applyIngredientChoice(plan, r, 0, { ingredientId: "2" });
  plan = applyIngredientChoice(plan, r, 1, { included: true });
  assert.deepEqual(
    shoppingList([r], [plan]).map((x) => x.name),
    ["Picnicbog, benfri", "Svamp"],
  );
  for (const [servings, expected] of [
    [4, 650],
    [6, 975],
    [8, 1300],
  ]) {
    const result = shoppingList([r], [{ ...plan, servings }]);
    assert.equal(
      result.find((item) => item.name === "Picnicbog, benfri").amount,
      expected,
    );
  }
});

test("osäkra fritextalternativ väljs inte automatiskt", () => {
  const r = recipe("M003", [
    line("10", "Currysås", 2, "burk", {
      note: "Alternativ: sötsur sås",
    }),
  ]);
  assert.deepEqual(ingredientChoices(r.ingredients[0]), ["Currysås"]);
  const plan = entry("M003", 4, { 10: { name: "sötsur sås" } });
  assert.equal(shoppingList([r], [plan])[0].name, "Currysås");
});

test("smör i gram och matskedar hålls åtskilt", () => {
  const r = recipe("M005", [
    line("47", "Smör", 30, "g"),
    line("7", "Smör/olja", 1, "msk"),
  ]);
  const list = shoppingList([r], [entry("M005")]);
  assert.equal(list.filter((item) => item.name === "Smör").length, 2);
});

test("burksås får egen nettomängd utan att ärva standardens burkantal", () => {
  const r = recipe("M003", [
    line("30", "Färdig currysås", 2, "burk", {
      scaling: "Hela enheter",
      alternatives: [line("141", "Färdig sötsur sås", 800, "g")],
    }),
  ]);
  const choices = { 30: { ingredientId: "141" } };
  for (const [servings, amount] of [
    [4, 800],
    [6, 1200],
    [8, 1600],
  ]) {
    const list = shoppingList([r], [entry("M003", servings, choices)]);
    assert.deepEqual(
      [list[0].name, list[0].amount, list[0].unit],
      ["Färdig sötsur sås", amount, "g"],
    );
  }
});

test("hotdog kan vara styck i en rätt och gram i en annan", () => {
  const a = recipe("M009", [
    line("46", "Grillkorv", 8, "st", {
      scaling: "Hela enheter",
      alternatives: [
        line("142", "Hotdog", 8, "st", { scaling: "Hela enheter" }),
      ],
    }),
  ]);
  const b = recipe("M041", [
    line("46", "Grillkorv", 600, "g", {
      alternatives: [line("142", "Hotdog", 600, "g")],
    }),
  ]);
  const list = shoppingList(
    [a, b],
    [
      entry("M009", 6, { 46: { ingredientId: "142" } }),
      entry("M041", 8, { 46: { ingredientId: "142" } }),
    ],
  );
  assert.deepEqual(
    list
      .map((item) => [item.amount, item.unit])
      .sort((x, y) => x[1].localeCompare(y[1])),
    [
      [1200, "g"],
      [12, "st"],
    ],
  );
});

test("avrunnen vikt för bönalternativ summeras som massa", () => {
  const r = recipe("M031", [
    line("92", "Kidneybönor", 2, "burkar", {
      scaling: "Hela enheter",
      alternatives: [line("143", "Svarta bönor, avrunna", 460, "g")],
    }),
  ]);
  const list = shoppingList(
    [r],
    [entry("M031", 6, { 92: { ingredientId: "143" } })],
  );
  assert.equal(list[0].amount, 690);
  assert.equal(list[0].unit, "g");
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

test("M013 klyftpotatis kopplar rapsolja som kontrollvara, men pommes gör det inte", () => {
  const r = recipe("M013", [
    line("57", "Frysta pommes", 1000, "g"),
    line("26", "Potatis", 1000, "g", {
      required: false,
      purchaseNote: "Köp i stället för frysta pommes.",
    }),
    line("140", "Rapsolja", 1, "msk", {
      required: false,
      quantityMode: "Ungefärlig",
      purchaseMode: "Kontrollera hemma",
    }),
  ]);
  for (const servings of [4, 6, 8]) {
    let plan = entry("M013", servings);
    assert.deepEqual(
      shoppingList([r], [plan]).map((x) => x.name),
      ["Frysta pommes"],
    );
    plan = applyIngredientChoice(plan, r, 1, { included: true });
    const wedges = shoppingList([r], [plan]);
    assert.equal(
      wedges.some((x) => x.name === "Frysta pommes"),
      false,
    );
    assert.equal(
      wedges.find((x) => x.name === "Potatis").amount,
      (1000 * servings) / 4,
    );
    assert.equal(wedges.find((x) => x.name === "Rapsolja").checkOnly, true);
    plan = applyIngredientChoice(plan, r, 0, { included: true });
    const fries = shoppingList([r], [plan]);
    assert.equal(
      fries.some((x) => x.name === "Rapsolja"),
      false,
    );
    assert.deepEqual(
      fries.map((x) => x.name),
      ["Frysta pommes"],
    );
    const olderSavedChoice = entry("M013", servings, {
      26: { included: true },
    });
    assert.equal(
      shoppingList([r], [olderSavedChoice]).find((x) => x.name === "Rapsolja")
        ?.checkOnly,
      true,
    );
  }
  const other = recipe("M999", r.ingredients);
  const chosen = applyIngredientChoice(entry("M999"), other, 1, {
    included: true,
  });
  assert.equal(
    shoppingList([other], [chosen]).some((x) => x.name === "Rapsolja"),
    false,
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

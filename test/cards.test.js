import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  CARD,
  FRONT_STYLES,
  renderCard,
  scaledQuantity,
  validateCard,
} from "../shared/cards.js";
import { makeCatalog } from "../shared/schema.js";

const fixture = {
  dishes: [
    [
      "Rätt-ID",
      "Namn",
      "Basportioner",
      "Instruktion/recept",
      "Bildlänk",
      "Har förberedelser",
    ],
    ["M007", "Provrätt", "4", "Blanda och servera.", "", "Ja"],
  ],
  ingredients: [
    ["Ingrediens-ID", "Namn", "Enhet"],
    ["1", "Ingrediens A", "g"],
    ["2", "Ingrediens B", "st"],
  ],
  links: [
    ["Rätt-ID", "Ingrediens-ID", "Basmängd", "Enhet", "Skalningstyp"],
    ["M007", "1", "500", "g", "Proportionell"],
    ["M007", "2", "3", "st", "Hela enheter"],
  ],
  tags: [
    ["Rätt-ID", "Tagg"],
    ["M007", "Vardag"],
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
    [
      "F001",
      "M007",
      "Tina",
      "720",
      "Före servering",
      "Ta fram ingrediensen.",
      "Om fryst",
      "Viktig",
      "Ja",
      "",
    ],
  ],
};
test("Sheet-kolumner kopplas till relationellt recept", () => {
  const { recipes } = makeCatalog(fixture);
  assert.equal(recipes[0].id, "M007");
  assert.equal(recipes[0].recipe, "Blanda och servera.");
  assert.equal(recipes[0].ingredients[0].name, "Ingrediens A");
  assert.deepEqual(recipes[0].tags, ["Vardag"]);
  assert.equal(recipes[0].hasPreparations, true);
  assert.deepEqual(recipes[0].preparations, [
    {
      id: "F001",
      type: "Tina",
      leadMinutes: 720,
      timingType: "Före servering",
      instruction: "Ta fram ingrediensen.",
      condition: "Om fryst",
      priority: "Viktig",
      active: true,
      note: "",
    },
  ]);
});
test("skalning och avrundning för kortets tre portionstal", () => {
  assert.equal(
    scaledQuantity({ quantity: 500, scaling: "Proportionell" }, 6, 4),
    "750",
  );
  assert.equal(
    scaledQuantity({ quantity: 3, scaling: "Hela enheter" }, 6, 4),
    "5",
  );
  assert.equal(
    scaledQuantity({ quantity: 1, scaling: "Personspecifik" }, 8, 4),
    "1",
  );
});
test("samma SVG kan renderas i preview och export i tryckstorlek", async () => {
  const recipe = makeCatalog(fixture).recipes[0];
  const svg = renderCard(recipe, "back");
  assert.match(svg, /Ingrediens A/);
  assert.match(svg, />750</);
  const png = await sharp(Buffer.from(svg), { density: CARD.dpi })
    .resize(CARD.widthPx, CARD.heightPx)
    .png()
    .toBuffer();
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 815);
  assert.equal(meta.height, 1110);
});
test("framsidesvarianterna behåller bilden utanför textytan", async () => {
  const recipe = makeCatalog(fixture).recipes[0];
  const sourceColor = [160, 195, 90];
  const photo = await sharp({
    create: {
      width: 690,
      height: 940,
      channels: 3,
      background: { r: sourceColor[0], g: sourceColor[1], b: sourceColor[2] },
    },
  })
    .png()
    .toBuffer();
  recipe.imageDataUrl = `data:image/png;base64,${photo.toString("base64")}`;
  const samples = {};
  for (const style of FRONT_STYLES) {
    const svg = renderCard(recipe, "front", { frontStyle: style.id });
    assert.match(svg, /MATRIK · M007/);
    const { data, info } = await sharp(Buffer.from(svg), { density: CARD.dpi })
      .resize(CARD.widthPx, CARD.heightPx)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, CARD.widthPx);
    assert.equal(info.height, CARD.heightPx);
    const pixel = (x, y) => [
      ...data.subarray(
        (y * info.width + x) * info.channels,
        (y * info.width + x) * info.channels + 3,
      ),
    ];
    assert.deepEqual(pixel(700, 700), sourceColor);
    samples[style.id] = pixel(120, 800);
  }
  assert.deepEqual(samples.direct, sourceColor);
  assert.notDeepEqual(samples.panel, samples.direct);
  assert.notDeepEqual(samples.fade, samples.direct);
});
test("layoutfel rapporteras före export", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  recipe.ingredients = Array.from({ length: 15 }, (_, i) => ({
    name: `Rad ${i}`,
    quantity: 1,
  }));
  assert.ok(validateCard(recipe).some((issue) => issue.level === "error"));
});

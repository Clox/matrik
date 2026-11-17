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
import {
  DEFAULT_PRINT_PROFILE,
  printProfileErrors,
  resolvePrintProfile,
} from "../shared/print-profile.js";
import { previewDimensions, printZonesSvg } from "../src/preview-image.js";

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
  assert.equal(meta.width, 822);
  assert.equal(meta.height, 1122);
});
test("MPC-profilen har 1/8 tum bleed och safe area samt minst 822 × 1122 px", () => {
  const profile = resolvePrintProfile(DEFAULT_PRINT_PROFILE);
  assert.equal(profile.trimWidthMm, 63);
  assert.equal(profile.trimHeightMm, 88);
  assert.equal(profile.bleedMm, 3.175);
  assert.equal(profile.safeMm, 3.175);
  assert.equal(profile.dpi, 300);
  assert.equal(profile.widthMm, 69.35);
  assert.equal(profile.heightMm, 94.35);
  assert.equal(profile.widthPx, 822);
  assert.equal(profile.heightPx, 1122);
  assert.ok(
    printProfileErrors({
      ...DEFAULT_PRINT_PROFILE,
      exportWidthPx: 821,
    }).length,
  );
});
test("framsidans panel och QR-ruta ligger helt innanför safe area", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  const profile = resolvePrintProfile(DEFAULT_PRINT_PROFILE);
  const safe = (profile.bleedMm + profile.safeMm) * 10;
  for (const title of ["Tacos", "Kyckling med curry"]) {
    recipe.shortName = title;
    recipe.activeTime = 20;
    const svg = renderCard(recipe, "front");
    const transform = svg.match(
      /<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)"><g transform="translate\(([-\d.]+) ([-\d.]+)\)">/,
    );
    assert.ok(transform);
    const [, x, y, scale, dx, dy] = transform.map(Number);
    const panel = svg.match(
      /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="12"/,
    );
    const qr = svg.match(
      /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="10" fill="white"/,
    );
    for (const rect of [panel, qr]) {
      assert.ok(rect);
      const [, left, top, width, height] = rect.map(Number);
      assert.ok(x + (dx + left) * scale >= safe);
      assert.ok(y + (dy + top) * scale >= safe);
      assert.ok(x + (dx + left + width) * scale <= profile.widthUnits - safe);
      assert.ok(y + (dy + top + height) * scale <= profile.heightUnits - safe);
    }
    assert.doesNotMatch(svg, /print-zones-overlay|trim-guide|safe-guide/);
  }
});
test("lång korttitel bryts innan den når QR-rutan", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  recipe.id = "M013";
  recipe.shortName = "Hamburgare med pommes";
  const svg = renderCard(recipe, "front");
  assert.match(svg, />Hamburgare<\/text>/);
  assert.match(svg, />med pommes<\/text>/);
  assert.doesNotMatch(svg, />Hamburgare med<\/text>/);
});
test("previewns tryckzoner är en separat bild och följer valt PNG-läge", () => {
  const profile = resolvePrintProfile(DEFAULT_PRINT_PROFILE);
  const clean = previewDimensions(profile, false);
  const marked = previewDimensions(profile, true);
  assert.equal(clean.width, 747);
  assert.equal(clean.height, 1043);
  assert.deepEqual(marked, { width: 822, height: 1122 });
  const overlay = printZonesSvg(profile);
  assert.match(overlay, /fill-rule="evenodd"/);
  assert.match(overlay, /x="31\.75" y="31\.75"/);
  assert.match(overlay, /x="63\.5" y="63\.5"/);
  assert.doesNotMatch(
    renderCard(makeCatalog(fixture).recipes[0], "front"),
    /fill-rule="evenodd"/,
  );
});
test("egen tryckprofil styr SVG-mått och kräver tillräcklig upplösning", () => {
  const custom = {
    ...DEFAULT_PRINT_PROFILE,
    id: "custom",
    name: "Provprofil",
    trimWidthMm: 70,
    trimHeightMm: 100,
    exportWidthPx: 1000,
    exportHeightPx: 1300,
  };
  const profile = resolvePrintProfile(custom);
  assert.equal(profile.widthMm, 76.35);
  assert.equal(profile.heightMm, 106.35);
  const svg = renderCard(makeCatalog(fixture).recipes[0], "back", {
    printProfile: custom,
  });
  assert.match(svg, /width="76\.35mm" height="106\.35mm"/);
  assert.ok(printProfileErrors({ ...custom, exportWidthPx: 800 }).length);
});
test("baksidan har kompakt rubrik och inga tryckta trimmarkeringar", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  recipe.shortName = "Tacos";
  recipe.activeTime = 20;
  recipe.totalTime = 25;
  const svg = renderCard(recipe, "back");
  assert.match(svg, /Tacos · M007<\/text>/);
  assert.match(svg, /20 min aktiv · 25 min totalt/);
  assert.doesNotMatch(svg, /MATRIK/);
  assert.doesNotMatch(svg, /<rect x="30" y="30"/);
  assert.match(svg, /<text x="66" y="168"[^>]*>INGREDIENSER/);
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
    samples[style.id] = pixel(120, 900);
  }
  assert.deepEqual(samples.direct, sourceColor);
  assert.notDeepEqual(samples.panel, samples.direct);
  assert.notDeepEqual(samples.fade, samples.direct);
});
test("layoutfel rapporteras före export", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  recipe.ingredients = Array.from({ length: 16 }, (_, i) => ({
    name: `Rad ${i}`,
    quantity: 1,
  }));
  assert.ok(validateCard(recipe).some((issue) => issue.level === "error"));
});

test("femton korta ingrediensrader ryms med ett kompakt Kortrecept", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  recipe.shortName = "Köttfärslimpa";
  recipe.cardRecipe =
    "Forma limpan. Grädda tills genomstekt. Koka potatis och gör sås.";
  recipe.ingredients = Array.from({ length: 15 }, (_, i) => ({
    name: `Ingrediens ${i + 1}`,
    quantity: 1,
    unit: "st",
  }));
  assert.equal(
    validateCard(recipe).filter((issue) => issue.level === "error").length,
    0,
  );
});

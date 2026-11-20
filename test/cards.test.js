import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  CARD,
  FRONT_STYLES,
  cardTheme,
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
import { previewDimensions, printLinesSvg } from "../src/preview-image.js";
import { backCardLayout, cardTextWidth } from "../shared/card-layout.js";

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
test("hela kortnamnet visas även när två smala rader inte räcker", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  recipe.id = "M002";
  recipe.shortName = "Fläskkarré med klyftpotatis";
  const svg = renderCard(recipe, "front");
  assert.match(svg, />Fläskkarré med<\/text>/);
  assert.match(svg, />klyftpotatis<\/text>/);
});
test("bleed och trycklinjer är separata för trim- och exportvyn", () => {
  const profile = resolvePrintProfile(DEFAULT_PRINT_PROFILE);
  assert.deepEqual(previewDimensions(profile, false), {
    width: 747,
    height: 1043,
  });
  assert.deepEqual(previewDimensions(profile, true), {
    width: 822,
    height: 1122,
  });
  const trimLines = printLinesSvg(profile, false);
  const bleedLines = printLinesSvg(profile, true);
  assert.match(trimLines, /viewBox="0 0 630 880"/);
  assert.match(trimLines, /x="1\.5" y="1\.5" width="627" height="877"/);
  assert.match(trimLines, /x="31\.75" y="31\.75"/);
  assert.match(bleedLines, /viewBox="0 0 693\.5 943\.5"/);
  assert.match(bleedLines, /x="31\.75" y="31\.75" width="630" height="880"/);
  assert.match(bleedLines, /x="63\.5" y="63\.5"/);
  for (const lines of [trimLines, bleedLines]) {
    assert.match(lines, /fill="none"/);
    assert.doesNotMatch(lines, /fill-opacity|fill-rule|<path/);
  }
  assert.doesNotMatch(
    renderCard(makeCatalog(fixture).recipes[0], "front"),
    /print-lines-overlay/,
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
  assert.match(svg, /<text x="69" y="169"[^>]*>INGREDIENSER/);
  assert.doesNotMatch(svg, /GÖR SÅ HÄR/);
  assert.match(svg, /<circle cx="73" cy="131" r="7"/);
});
test("baksidans text använder safe area och långa instruktioner klipps inte", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  recipe.shortName = "Hamburgare med pommes";
  recipe.cardRecipe = Array.from({ length: 120 }, (_, i) => `Steg ${i + 1} ska synas.`).join(" ");
  const profile = resolvePrintProfile(DEFAULT_PRINT_PROFILE);
  const layout = backCardLayout(recipe, profile, scaledQuantity);
  assert.equal(layout.safe, 63.5);
  assert.equal(layout.titleRows.length, 2);
  assert.ok(layout.timesY - layout.titleRows.at(-1).y >= 30);
  assert.ok(cardTextWidth("Steg 120 ska synas.", 19) > 0);
  assert.ok(layout.errors.some((message) => message.includes("safe area")));
  assert.match(renderCard(recipe, "back"), /Steg 120 ska synas/);
  assert.ok(validateCard(recipe).some((issue) => issue.level === "error"));
});
test("framsidan visar aktiv och total tid med klocka", () => {
  const recipe = makeCatalog(fixture).recipes[0];
  recipe.activeTime = 30;
  recipe.totalTime = 155;
  const svg = renderCard(recipe, "front");
  assert.match(svg, /30 min aktivt · 155 min totalt/);
  assert.match(svg, /<circle cx="76" cy="/);
});
test("recepttyp väljer korttema utan att ändra maträttens färger", () => {
  const food = {
    ...makeCatalog(fixture).recipes[0],
    shortName: "Tacos",
    activeTime: 20,
  };
  const dessert = {
    ...food,
    id: "D001",
    type: "Dessert",
    shortName: "Kladdkaka",
  };
  assert.equal(food.type, "Maträtt");
  assert.equal(cardTheme(food).icon, "utensils");
  assert.equal(cardTheme(dessert).icon, "ice-cream-bowl");
  const foodFront = renderCard(food, "front");
  const dessertFront = renderCard(dessert, "front");
  assert.match(foodFront, /data-category-icon="utensils"/);
  assert.match(foodFront, /fill="#14221a" fill-opacity="\.54"/);
  assert.match(foodFront, /rx="10" fill="white"/);
  assert.match(dessertFront, /data-category-icon="ice-cream-bowl"/);
  const foodIcon = foodFront.match(
    /data-category-icon="utensils" transform="translate\((\d+) (\d+)\)" fill="white"/,
  );
  const dessertIcon = dessertFront.match(
    /data-category-icon="ice-cream-bowl" transform="translate\((\d+) (\d+)\) scale\(1\.7\)" fill="none" stroke="white"/,
  );
  assert.ok(foodIcon && dessertIcon);
  assert.equal(foodIcon[1], dessertIcon[1]);
  assert.ok(Number(foodIcon[1]) + 38 < 435);
  assert.ok(Number(dessertIcon[1]) + 24 * 1.7 < 435);
  assert.match(dessertFront, /M12 17c5 0 8-2\.69 8-6H4c0 3\.31 3 6 8 6/);
  assert.match(dessertFront, /M15\.5 6\.5a3\.5 3\.5 0 1 0-7 0/);
  assert.match(dessertFront, /fill="#B74379" fill-opacity="\.94"/);
  assert.match(dessertFront, /rx="10" fill="#fff5f9"/);
  assert.match(dessertFront, /<g fill="#4d1f3b">/);
  assert.doesNotMatch(dessertFront, /data-category-icon="cake"/);
  assert.match(renderCard(food, "back"), /fill="#f9f7f0"/);
  const dessertBack = renderCard(dessert, "back");
  assert.match(dessertBack, /fill="#fff7fa"/);
  assert.match(dessertBack, /stroke="#d9a8bf"/);
  assert.doesNotMatch(dessertBack, /print-zones-overlay|trim-guide|safe-guide/);
});
test("recepttyp kan läsas från en framtida valfri Sheet-kolumn", () => {
  const data = structuredClone(fixture);
  data.dishes[0].push("Recepttyp");
  data.dishes[1].push("Dessert");
  assert.equal(makeCatalog(data).recipes[0].type, "Dessert");
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

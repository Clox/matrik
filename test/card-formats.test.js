import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import sharp from "sharp";
import { renderCard, validateCard, scaledQuantity } from "../shared/cards.js";
import { backCardLayout } from "../shared/card-layout.js";
import {
  PRINT_PROFILES,
  resolvePrintProfile,
} from "../shared/print-profile.js";
import {
  IMAGE_HEADERS,
  TAROT_CROP_HEADER,
  TAROT_SELECTED_HEADER,
  attachImageVariants,
  recipeForProfile,
  updatedVariantCrops,
} from "../shared/image-variants.js";
import { photoQualityCheck } from "../shared/photo-quality.js";
import { renderSvgPng } from "../server/render-card-png.js";

const poker = PRINT_PROFILES[0];
const tarot = PRINT_PROFILES[1];

test("tarot kan välja en annan bild utan att ändra pokerbild eller pokerbeskärning", () => {
  const recipe = { ...sample(), imageId: "poker-file" };
  const pokerCrop = { x: 0, y: 0, width: 0.8, height: 0.8 };
  const tarotCrop = { x: 0.1, y: 0.1, width: 0.75, height: 0.75 };
  attachImageVariants({ recipes: [recipe] }, [
    [...IMAGE_HEADERS, TAROT_CROP_HEADER, TAROT_SELECTED_HEADER],
    [
      recipe.id,
      "poker",
      "poker-file",
      "Ja",
      "2000",
      "3000",
      JSON.stringify(pokerCrop),
      "",
      "",
      "Nej",
    ],
    [
      recipe.id,
      "tarot",
      "tarot-file",
      "Nej",
      "1024",
      "1536",
      "",
      "",
      JSON.stringify(tarotCrop),
      "Ja",
    ],
  ]);
  const pokerCard = recipeForProfile(recipe, poker);
  const tarotCard = recipeForProfile(recipe, tarot);
  assert.equal(pokerCard.imageId, "poker-file");
  assert.equal(tarotCard.imageId, "tarot-file");
  assert.deepEqual(pokerCard.imageCrop, pokerCrop);
  assert.deepEqual(tarotCard.imageCrop, tarotCrop);
  assert.equal(recipe.imageId, "poker-file");
  assert.deepEqual(recipe.imageCrop, pokerCrop);
});
const sample = () => ({
  id: "M777",
  name: "Provgryta med champinjoner",
  shortName: "Provgryta",
  type: "Maträtt",
  activeTime: 20,
  totalTime: 90,
  servings: 4,
  cardRecipe:
    "Bryn köttet. Fräs löken och sjud tills mört. Servera med potatis.",
  ingredients: [
    { name: "Kött", quantity: 600, unit: "g", scaling: "Proportionell" },
    { name: "Potatis", quantity: 800, unit: "g", scaling: "Proportionell" },
  ],
});

test("poker-SVG är bitvis identisk med versionen före tarotstödet", () => {
  const hash = (side) =>
    crypto
      .createHash("sha256")
      .update(renderCard(sample(), side))
      .digest("hex");
  assert.equal(
    hash("front"),
    "397eec51e90691ea22fe0a95f8554b27e4024f87cf1093e0262242187bb10b28",
  );
  assert.equal(
    hash("back"),
    "b2cb5a4bd4d7d6930edf6903fc66d9b019abbb87362e49503cdc78dad44be08e",
  );
});

test("tarot har MPC:s exakta format, större text och egna exportpixlar", async () => {
  const profile = resolvePrintProfile(tarot);
  assert.equal(profile.trimWidthMm, 69.85);
  assert.equal(profile.trimHeightMm, 120.65);
  assert.ok(Math.abs(profile.widthMm - 76.2) < 1e-9);
  assert.equal(profile.heightMm, 127);
  assert.equal(profile.widthPx, 2400);
  assert.equal(profile.heightPx, 4000);
  const recipe = sample();
  const layout = backCardLayout(recipe, profile, scaledQuantity);
  assert.equal(layout.geometry.ingredientSize, 22);
  assert.equal(layout.geometry.instructionSize, 24);
  assert.deepEqual(layout.errors, []);
  assert.equal(
    validateCard(recipe, tarot).filter((item) => item.level === "error").length,
    0,
  );
  const png = await renderSvgPng(
    renderCard(recipe, "back", { printProfile: tarot }),
    tarot,
  );
  const meta = await sharp(png).metadata();
  assert.deepEqual([meta.width, meta.height], [2400, 4000]);
});

test("poker- och tarotbeskärning läses från skilda Sheet-kolumner", () => {
  const pokerCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const tarotCrop = { x: 0.2, y: 0.05, width: 0.6, height: 0.9 };
  const recipe = sample();
  attachImageVariants({ recipes: [recipe] }, [
    [...IMAGE_HEADERS, TAROT_CROP_HEADER],
    [
      recipe.id,
      "original",
      "file",
      "Ja",
      "2000",
      "3000",
      JSON.stringify(pokerCrop),
      "Original",
      JSON.stringify(tarotCrop),
    ],
  ]);
  assert.deepEqual(recipeForProfile(recipe, poker).imageCrop, pokerCrop);
  assert.deepEqual(recipeForProfile(recipe, tarot).imageCrop, tarotCrop);
  assert.deepEqual(recipe.imageCrop, pokerCrop);
});

test("tarot kräver minst 300 äkta foto-ppi för alla bildvarianter", () => {
  const recipe = { id: "D003", selectedImageVariantId: "original" };
  const tooSmall = photoQualityCheck(recipe, tarot, 1199, 1312, null);
  assert.equal(tooSmall.exception, false);
  assert.equal(tooSmall.possible, false);
  assert.ok(tooSmall.ppi < 300);
  const adequate = photoQualityCheck(recipe, tarot, 1024, 1536, null);
  assert.equal(adequate.exception, false);
  assert.equal(adequate.possible, true);
  assert.ok(adequate.ppi >= 300);
});

test("byte av bild i tarotläge kan inte skriva om pokerbeskärningen", () => {
  const old = {
    crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.7 },
    tarotCrop: null,
  };
  const recipe = { id: "M777", selectedImageVariantId: "original" };
  const selection = updatedVariantCrops(
    old,
    { selected: true, printProfile: tarot },
    recipe,
    2000,
    3000,
  );
  assert.deepEqual(selection.pokerCrop, old.crop);
  assert.equal(selection.tarotCrop, null);
  const editing = updatedVariantCrops(
    old,
    { crop: { height: 0.9, x: 0.1, y: 0.05 }, printProfile: tarot },
    recipe,
    2000,
    3000,
  );
  assert.deepEqual(editing.pokerCrop, old.crop);
  assert.ok(editing.tarotCrop);
  assert.equal(editing.tarotWrite, true);
});

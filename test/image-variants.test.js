import test from "node:test";
import assert from "node:assert/strict";
import {
  attachImageVariants,
  IMAGE_HEADERS,
} from "../shared/image-variants.js";
import {
  centeredCrop,
  cropLimits,
  effectiveDpi,
  minimumSourcePixels,
  normalizeCrop,
} from "../shared/image-crop.js";
import { renderCard } from "../shared/cards.js";
import { DEFAULT_PRINT_PROFILE as profile } from "../shared/print-profile.js";

const recipe = () => ({
  id: "M013",
  name: "Hamburgare",
  type: "Maträtt",
  imageId: "old-file",
  ingredients: [],
  imageDataUrl: "data:image/png;base64,AAAA",
});

test("äldre Bildlänk blir första vald variant utan att bilden eller SVG-beskärningen ändras", () => {
  const item = recipe();
  const before = renderCard(item, "front");
  attachImageVariants({ recipes: [item] });
  assert.equal(item.selectedImageVariantId, "original");
  assert.equal(item.imageId, "old-file");
  assert.equal(renderCard(item, "front"), before);
});

test("separata bildrader väljer rätt bild och bevarar äldre variant", () => {
  const item = recipe();
  attachImageVariants({ recipes: [item] }, [
    IMAGE_HEADERS,
    ["M013", "original", "old-file", "Nej", "2048", "3072", "", "Gammal"],
    ["M013", "new", "new-file", "Ja", "2048", "3072", "", "Ny"],
  ]);
  assert.equal(item.imageVariants.length, 2);
  assert.equal(item.imageId, "new-file");
  assert.equal(item.imageVariants[0].fileId, "old-file");
});

test("beskärningsramen täcker bleed, har rätt proportion och kan inte lämna bilden", () => {
  for (const [w, h] of [
    [2048, 3072],
    [4096, 2048],
  ]) {
    const crop = normalizeCrop({ x: 4, y: -3, height: 0.8 }, w, h, profile);
    assert.ok(crop.x >= 0 && crop.y >= 0);
    assert.ok(crop.x + crop.width <= 1.000001);
    assert.ok(crop.y + crop.height <= 1.000001);
    assert.ok(
      Math.abs(
        (crop.width * w) / (crop.height * h) -
          (profile.trimWidthMm + 2 * profile.bleedMm) /
            (profile.trimHeightMm + 2 * profile.bleedMm),
      ) < 1e-9,
    );
    assert.ok(effectiveDpi(crop, w, h, profile) >= 300);
    const narrower = normalizeCrop({ ...crop, height: 0.001 }, w, h, profile);
    assert.ok(effectiveDpi(narrower, w, h, profile) >= 300);
  }
  assert.equal(cropLimits(800, 1100, profile).possible, false);
});

test("exportens upplösning påverkar inte fotots beskärningsgräns", () => {
  const at800 = { ...profile };
  const at600 = {
    ...profile,
    id: "custom",
    dpi: 600,
    exportWidthPx: 1640,
    exportHeightPx: 2230,
  };
  assert.deepEqual(minimumSourcePixels(at800), minimumSourcePixels(at600));
  assert.equal(cropLimits(1000, 1400, at800).possible, true);
  assert.equal(
    cropLimits(1000, 1400, { ...at800, id: "custom", minPhotoPpi: 400 })
      .possible,
    false,
  );
  const source = { x: 0.11, y: 0.08, width: 0.7, height: 0.7 };
  assert.deepEqual(
    normalizeCrop(source, 2048, 3072, at800),
    normalizeCrop(source, 2048, 3072, at600),
  );
  assert.ok(
    effectiveDpi(
      normalizeCrop({ height: 0.001 }, 2048, 3072, at800),
      2048,
      3072,
      at800,
    ) >= 300,
  );
});

test("förhandsvisning och tryckrendering använder exakt samma bildtransform", () => {
  const item = recipe();
  item.imageWidth = 2048;
  item.imageHeight = 3072;
  item.imageCrop = normalizeCrop(
    { ...centeredCrop(2048, 3072, profile), y: 0.1 },
    2048,
    3072,
    profile,
  );
  const full = renderCard(item, "front");
  const photoOnly = renderCard(item, "front", { showCardGraphics: false });
  const image = full.match(/<image [^>]+\/>/)?.[0];
  assert.equal(photoOnly.match(/<image [^>]+\/>/)?.[0], image);
  assert.match(full, /MATRIK · M013/);
  assert.match(full, /<g fill=/);
  assert.doesNotMatch(photoOnly, /MATRIK · M013|<g fill=/);
  assert.equal(renderCard(item, "front"), full);
});

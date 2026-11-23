import { cropLimits, centeredCrop, effectiveDpi } from "./image-crop.js";
import { resolvePrintProfile } from "./print-profile.js";

// Explicit tarot-only exceptions for the 2026-11-23 selected source images.
// Source dimensions AND immutable variant ID are checked, so a different
// selected image does not inherit an exception. Poker stays at 300 ppi.
const exceptions = new Map([
  ..."M002 M004 M008 M009 M011 M012 M014 M015 M016 M017 M019 M021 M022 M023 M024 M025 M026 M027"
    .split(" ")
    .map((id) => [id, [1060, 1484, 296.5, "original"]]),
  ..."M001 M005 M007 M010 M020 M032 M033 M036 M041 M042 M043"
    .split(" ")
    .map((id) => [id, [1060, 1484, 296.5, "zoomout-20261119"]]),
  ["M038", [1060, 1484, 296.5, "card-v1-m038"]],
  ["M018", [1063, 1480, 295.5, "original"]],
  ..."M028 M030 M031 M034 M037 M045 D007"
    .split(" ")
    .map((id) => [id, [1086, 1448, 289.3, "original"]]),
  ..."D003 D010".split(" ").map((id) => [id, [1199, 1312, 262.1, "original"]]),
]);

export function photoQualityRule(recipe, profileInput, width, height) {
  const profile = profileInput?.widthPx
    ? profileInput
    : resolvePrintProfile(profileInput);
  const item = profile.id === "mpc-tarot" ? exceptions.get(recipe?.id) : null;
  const minimum =
    item &&
    item[0] === width &&
    item[1] === height &&
    item[3] === recipe?.selectedImageVariantId
      ? item[2]
      : profile.minPhotoPpi;
  return {
    minimumPpi: minimum,
    exception: minimum < profile.minPhotoPpi,
    profile:
      minimum < profile.minPhotoPpi
        ? { ...profile, minPhotoPpi: minimum }
        : profile,
  };
}

export function photoQualityCheck(recipe, profileInput, width, height, crop) {
  const rule = photoQualityRule(recipe, profileInput, width, height);
  const limits = cropLimits(width, height, rule.profile);
  const usedCrop =
    crop ||
    (limits.possible ? centeredCrop(width, height, rule.profile) : null);
  const ppi = usedCrop
    ? effectiveDpi(usedCrop, width, height, rule.profile)
    : 0;
  return {
    ...rule,
    ppi,
    possible: limits.possible && ppi + 0.01 >= rule.minimumPpi,
  };
}

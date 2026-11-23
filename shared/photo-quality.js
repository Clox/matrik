import { cropLimits, centeredCrop, effectiveDpi } from "./image-crop.js";
import { resolvePrintProfile } from "./print-profile.js";

export function photoQualityRule(recipe, profileInput, width, height) {
  const profile = profileInput?.widthPx
    ? profileInput
    : resolvePrintProfile(profileInput);
  return {
    minimumPpi: profile.minPhotoPpi,
    exception: false,
    profile,
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

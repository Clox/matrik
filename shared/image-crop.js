import { resolvePrintProfile } from "./print-profile.js";
const profileOf = (input) =>
  input?.widthPx && input?.heightPx ? input : resolvePrintProfile(input);

export function minimumSourcePixels(profileInput) {
  const profile = profileOf(profileInput);
  return {
    width: Math.ceil((profile.widthMm * profile.minPhotoPpi) / 25.4),
    height: Math.ceil((profile.heightMm * profile.minPhotoPpi) / 25.4),
  };
}

// Crop coordinates are fractions of the original image. A missing crop keeps
// the historical centred SVG cover behaviour unchanged.
export function cropLimits(width, height, profileInput) {
  const profile = profileOf(profileInput);
  const ratio = profile.widthMm / profile.heightMm;
  const required = minimumSourcePixels(profileInput);
  const maxHeight = Math.min(height, width / ratio);
  const minHeight = Math.max(required.height, required.width / ratio);
  return { ratio, minHeight, maxHeight, possible: minHeight <= maxHeight };
}

export function centeredCrop(width, height, profileInput) {
  const { ratio, maxHeight } = cropLimits(width, height, profileInput);
  const cropWidth = maxHeight * ratio;
  return {
    x: (width - cropWidth) / (2 * width),
    y: (height - maxHeight) / (2 * height),
    width: cropWidth / width,
    height: maxHeight / height,
  };
}

export function normalizeCrop(crop, width, height, profileInput) {
  const limits = cropLimits(width, height, profileInput);
  if (!limits.possible)
    throw new Error(
      "Originalbilden är för liten för tryckprofilens minsta foto-PPI.",
    );
  const requestedHeight = Number(crop?.height) * height;
  const cropHeight = Math.max(
    limits.minHeight,
    Math.min(limits.maxHeight, requestedHeight || limits.maxHeight),
  );
  const cropWidth = cropHeight * limits.ratio;
  const requestedX = Number(crop?.x) * width;
  const requestedY = Number(crop?.y) * height;
  return {
    x:
      Math.max(
        0,
        Math.min(
          width - cropWidth,
          Number.isFinite(requestedX) ? requestedX : (width - cropWidth) / 2,
        ),
      ) / width,
    y:
      Math.max(
        0,
        Math.min(
          height - cropHeight,
          Number.isFinite(requestedY) ? requestedY : (height - cropHeight) / 2,
        ),
      ) / height,
    width: cropWidth / width,
    height: cropHeight / height,
  };
}

export function effectiveDpi(crop, width, height, profileInput) {
  const profile = profileOf(profileInput);
  return Math.min(
    (crop.width * width * 25.4) / profile.widthMm,
    (crop.height * height * 25.4) / profile.heightMm,
  );
}

export function cropImageSvg(imageDataUrl, crop, width, height, profileInput) {
  const profile = profileOf(profileInput);
  if (!crop)
    return `<image href="${imageDataUrl}" x="0" y="0" width="${profile.widthUnits}" height="${profile.heightUnits}" preserveAspectRatio="xMidYMid slice"/>`;
  const safe = normalizeCrop(crop, width, height, profileInput);
  return `<image href="${imageDataUrl}" x="${(-safe.x / safe.width) * profile.widthUnits}" y="${(-safe.y / safe.height) * profile.heightUnits}" width="${profile.widthUnits / safe.width}" height="${profile.heightUnits / safe.height}" preserveAspectRatio="none"/>`;
}

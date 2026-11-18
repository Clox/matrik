export function previewDimensions(profile, showBleed) {
  if (showBleed) return { width: profile.widthPx, height: profile.heightPx };
  const width = Math.round(
    (profile.widthPx * profile.trimWidthMm) / profile.widthMm,
  );
  return {
    width,
    height: Math.round((width * profile.trimHeightMm) / profile.trimWidthMm),
  };
}

export function printLinesSvg(profile, showBleed) {
  const trimWidth = profile.trimWidthMm * 10;
  const trimHeight = profile.trimHeightMm * 10;
  const bleed = showBleed ? profile.bleedMm * 10 : 0;
  const safe = bleed + profile.safeMm * 10;
  const width = showBleed ? profile.widthUnits : trimWidth;
  const height = showBleed ? profile.heightUnits : trimHeight;
  const dimensions = previewDimensions(profile, showBleed);
  // Keep the trim stroke inside the cropped image when bleed is hidden.
  const trimStrokeInset = showBleed ? 0 : 1.5;
  const trim = bleed + trimStrokeInset;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><rect x="${trim}" y="${trim}" width="${trimWidth - 2 * trimStrokeInset}" height="${trimHeight - 2 * trimStrokeInset}" fill="none" stroke="#9b5932" stroke-width="3" stroke-dasharray="6 4"/><rect x="${safe}" y="${safe}" width="${trimWidth - 2 * profile.safeMm * 10}" height="${trimHeight - 2 * profile.safeMm * 10}" fill="none" stroke="#2e6b52" stroke-width="2" stroke-dasharray="1 4"/></svg>`;
}

export function printLinesUrl(profile, showBleed) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(printLinesSvg(profile, showBleed))}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Kunde inte läsa kortbilden."));
    image.src = url;
  });
}

export async function previewPng(url, profile, showBleed, showPrintLines) {
  const [image, lines] = await Promise.all([
    loadImage(url),
    showPrintLines
      ? loadImage(printLinesUrl(profile, showBleed))
      : Promise.resolve(null),
  ]);
  const dimensions = previewDimensions(profile, showBleed);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kunde inte skapa PNG-bilden.");
  if (showBleed) {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    context.drawImage(
      image,
      (image.naturalWidth * profile.bleedMm) / profile.widthMm,
      (image.naturalHeight * profile.bleedMm) / profile.heightMm,
      (image.naturalWidth * profile.trimWidthMm) / profile.widthMm,
      (image.naturalHeight * profile.trimHeightMm) / profile.heightMm,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }
  if (lines) context.drawImage(lines, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Kunde inte skapa PNG-bilden.")),
      "image/png",
    );
  });
}

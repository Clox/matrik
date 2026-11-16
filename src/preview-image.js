export function previewDimensions(profile, showPrintZones) {
  if (showPrintZones)
    return { width: profile.widthPx, height: profile.heightPx };
  const width = Math.round(
    (profile.widthPx * profile.trimWidthMm) / profile.widthMm,
  );
  return {
    width,
    height: Math.round((width * profile.trimHeightMm) / profile.trimWidthMm),
  };
}

export function printZonesSvg(profile) {
  const width = profile.widthUnits;
  const height = profile.heightUnits;
  const trim = profile.bleedMm * 10;
  const safe = (profile.bleedMm + profile.safeMm) * 10;
  const trimWidth = width - 2 * trim;
  const trimHeight = height - 2 * trim;
  const safeWidth = width - 2 * safe;
  const safeHeight = height - 2 * safe;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.widthPx}" height="${profile.heightPx}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="M0 0H${width}V${height}H0Z M${trim} ${trim}h${trimWidth}v${trimHeight}h-${trimWidth}Z" fill="#203c36" fill-opacity=".4" fill-rule="evenodd"/><rect x="${trim}" y="${trim}" width="${trimWidth}" height="${trimHeight}" fill="none" stroke="#9b5932" stroke-width="3" stroke-dasharray="6 4"/><rect x="${safe}" y="${safe}" width="${safeWidth}" height="${safeHeight}" fill="none" stroke="#2e6b52" stroke-width="2" stroke-dasharray="1 4"/></svg>`;
}

export function printZonesUrl(profile) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(printZonesSvg(profile))}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Kunde inte läsa kortbilden."));
    image.src = url;
  });
}

export async function previewPng(url, profile, showPrintZones) {
  const [image, zones] = await Promise.all([
    loadImage(url),
    showPrintZones ? loadImage(printZonesUrl(profile)) : Promise.resolve(null),
  ]);
  const dimensions = previewDimensions(profile, showPrintZones);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kunde inte skapa PNG-bilden.");
  if (showPrintZones) {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.drawImage(zones, 0, 0, canvas.width, canvas.height);
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

export const PRINT_PROFILES = [
  {
    id: "mpc-poker",
    name: "MakePlayingCards - 63 × 88 mm",
    trimWidthMm: 63,
    trimHeightMm: 88,
    bleedMm: 3.175,
    safeMm: 3.175,
    dpi: 300,
    exportWidthPx: 822,
    exportHeightPx: 1122,
  },
];

export const DEFAULT_PRINT_PROFILE = PRINT_PROFILES[0];

export function printProfileErrors(profile) {
  const errors = [];
  if (!profile || typeof profile !== "object") return ["Tryckprofil saknas."];
  if (!String(profile.name || "").trim() || String(profile.name).length > 80)
    errors.push("Profilnamnet måste vara 1–80 tecken.");
  for (const [key, label, min, max] of [
    ["trimWidthMm", "Trim width", 40, 150],
    ["trimHeightMm", "Trim height", 40, 220],
    ["bleedMm", "Bleed", 0, 15],
    ["safeMm", "Safe area", 0, 20],
    ["dpi", "DPI", 150, 1200],
  ]) {
    const value = Number(profile[key]);
    if (!Number.isFinite(value) || value < min || value > max)
      errors.push(`${label} måste vara mellan ${min} och ${max}.`);
  }
  for (const [key, label] of [
    ["exportWidthPx", "Export width"],
    ["exportHeightPx", "Export height"],
  ]) {
    const value = Number(profile[key]);
    if (!Number.isInteger(value) || value < 1 || value > 8000)
      errors.push(`${label} måste vara ett heltal mellan 1 och 8000 px.`);
  }
  if (errors.length) return errors;
  if (
    Number(profile.safeMm) * 2 >=
    Math.min(Number(profile.trimWidthMm), Number(profile.trimHeightMm))
  )
    errors.push("Safe area lämnar ingen yta för kortets innehåll.");
  const widthMm = Number(profile.trimWidthMm) + 2 * Number(profile.bleedMm);
  const heightMm = Number(profile.trimHeightMm) + 2 * Number(profile.bleedMm);
  const minWidth = Math.ceil((widthMm * Number(profile.dpi)) / 25.4);
  const minHeight = Math.ceil((heightMm * Number(profile.dpi)) / 25.4);
  if (Number(profile.exportWidthPx) < minWidth)
    errors.push(
      `Export width måste vara minst ${minWidth} px för mått och DPI.`,
    );
  if (Number(profile.exportHeightPx) < minHeight)
    errors.push(
      `Export height måste vara minst ${minHeight} px för mått och DPI.`,
    );
  if (profile.id === DEFAULT_PRINT_PROFILE.id) {
    if (
      ["trimWidthMm", "trimHeightMm", "bleedMm", "safeMm", "dpi"].some(
        (key) => Number(profile[key]) !== DEFAULT_PRINT_PROFILE[key],
      )
    )
      errors.push("Välj Egen profil för att ändra MPC:s standardmått.");
    if (
      Number(profile.exportWidthPx) < 822 ||
      Number(profile.exportHeightPx) < 1122
    )
      errors.push("MPC-profilen kräver minst 822 × 1122 px.");
  }
  return errors;
}

export function resolvePrintProfile(profile = DEFAULT_PRINT_PROFILE) {
  const errors = printProfileErrors(profile);
  if (errors.length) throw new Error(errors.join(" "));
  const trimWidthMm = Number(profile.trimWidthMm);
  const trimHeightMm = Number(profile.trimHeightMm);
  const bleedMm = Number(profile.bleedMm);
  const safeMm = Number(profile.safeMm);
  const dpi = Number(profile.dpi);
  const widthMm = trimWidthMm + 2 * bleedMm;
  const heightMm = trimHeightMm + 2 * bleedMm;
  return {
    id: String(profile.id || "custom"),
    name: String(profile.name).trim(),
    trimWidthMm,
    trimHeightMm,
    bleedMm,
    safeMm,
    dpi,
    widthMm,
    heightMm,
    widthPx: Number(profile.exportWidthPx),
    heightPx: Number(profile.exportHeightPx),
    widthUnits: widthMm * 10,
    heightUnits: heightMm * 10,
  };
}

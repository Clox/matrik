import QRCode from "qrcode";

export const CARD = {
  widthMm: 69,
  heightMm: 94,
  trimWidthMm: 63,
  trimHeightMm: 88,
  bleedMm: 3,
  dpi: 300,
  widthPx: 815,
  heightPx: 1110,
};
export const FRONT_STYLES = [
  {
    id: "panel",
    label: "Semitransparent panel",
    description: "Lugn mörk yta bakom texten",
  },
  {
    id: "direct",
    label: "Text på bilden",
    description: "Bild ända fram till bokstäverna",
  },
  {
    id: "fade",
    label: "Svag lokal toning",
    description: "Mjuk toning bara bakom texten",
  },
];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const asNumber = (value) => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (number) =>
  Number.isInteger(number)
    ? String(number)
    : String(Math.round(number * 10) / 10).replace(".", ",");
const BACK_TABLE_Y = 242;
export function scaledQuantity(line, portions, baseServings) {
  const base = asNumber(line.quantity);
  const kind = String(line.scaling || "").toLowerCase();
  if (kind.includes("fast") || kind.includes("person")) return fmt(base);
  const result = (base * portions) / (asNumber(baseServings) || 4);
  if (kind.includes("hela")) return fmt(Math.ceil(result));
  const step = asNumber(line.rounding);
  return fmt(step > 0 ? Math.round(result / step) * step : result);
}
function wrap(text, maxChars) {
  const out = [];
  for (const paragraph of String(text || "").split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if ((line + " " + word).trim().length > maxChars && line) {
        out.push(line);
        line = word;
      } else line = (line + " " + word).trim();
    }
    if (line) out.push(line);
  }
  return out;
}
export function validateCard(recipe) {
  const issues = [];
  const title = recipe.shortName || recipe.name || "";
  if (!title)
    issues.push({ level: "error", message: "Kortet behöver en titel." });
  if (title.length > 30)
    issues.push({
      level: "error",
      message: "Titeln är för lång för kortets säkra yta. Ange ett kortnamn.",
    });
  else if (title.length > 22)
    issues.push({
      level: "warning",
      message: "Titeln är lång. Kontrollera att den ryms på båda sidor.",
    });
  if ((recipe.ingredients || []).length > 14)
    issues.push({
      level: "error",
      message: "Fler än 14 ingrediensrader får inte plats på baksidan.",
    });
  if ((recipe.ingredients || []).some((x) => String(x.name).length > 31))
    issues.push({
      level: "warning",
      message: "Ett ingrediensnamn är långt och kan behöva förkortas.",
    });
  const lines = wrap(recipe.cardRecipe || recipe.recipe, 57);
  const rowHeight = (recipe.ingredients || []).length > 10 ? 31 : 37;
  const tableEnd = BACK_TABLE_Y + (recipe.ingredients || []).length * rowHeight;
  const instructionY = Math.max(tableEnd + 70, 630);
  const available = Math.floor((880 - instructionY - 36) / 25) + 1;
  if (lines.length > available)
    issues.push({
      level: "error",
      message: "Instruktionerna får inte plats. Skriv ett kortrecept.",
    });
  if (!recipe.cardRecipe && !recipe.recipe)
    issues.push({ level: "warning", message: "Kortet saknar instruktioner." });
  if (!recipe.imageDataUrl)
    issues.push({ level: "warning", message: "Framsidan saknar matbild." });
  return issues;
}
const svgStart =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="69mm" height="94mm" viewBox="0 0 690 940">';
export function renderCard(recipe, side, { frontStyle = "panel" } = {}) {
  const id = esc(recipe.id || "");
  const title = esc(recipe.shortName || recipe.name || "Namnlös rätt");
  if (side === "front") {
    const qr = QRCode.create(recipe.id || "M000", {
      errorCorrectionLevel: "M",
    }).modules;
    const size = qr.size,
      dot = 150 / size;
    let qrDots = "";
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (qr.get(x, y))
          qrDots += `<rect x="${460 + x * dot}" y="${720 + y * dot}" width="${dot + 0.08}" height="${dot + 0.08}"/>`;
    const photo = recipe.imageDataUrl
      ? `<image href="${esc(recipe.imageDataUrl)}" x="0" y="0" width="690" height="940" preserveAspectRatio="xMidYMid slice"/>`
      : "";
    const variant = FRONT_STYLES.some((style) => style.id === frontStyle)
      ? frontStyle
      : "panel";
    const titleParts = wrap(
      recipe.shortName || recipe.name || "Namnlös rätt",
      15,
    ).slice(0, 2);
    const panelHasTwoLines = variant === "panel" && titleParts.length > 1;
    const layout =
      variant === "panel"
        ? panelHasTwoLines
          ? {
              panelY: 680,
              panelHeight: recipe.activeTime ? 210 : 170,
              idY: 716,
              titleY: 762,
              titleStep: 48,
              timeY: 852,
            }
          : {
              panelY: 710,
              panelHeight: recipe.activeTime ? 155 : 115,
              idY: 738,
              titleY: 789,
              titleStep: 48,
              timeY: 828,
            }
        : { idY: 660, titleY: 728, titleStep: 54, timeY: 850 };
    const titleLines = titleParts
      .map(
        (line, i) =>
          `<text x="66" y="${layout.titleY + i * layout.titleStep}" fill="white" font-family="sans-serif" font-size="43" font-weight="700" ${variant === "direct" ? 'stroke="#17251b" stroke-opacity=".65" stroke-width="5" stroke-linejoin="round" paint-order="stroke fill"' : ""}>${esc(line)}</text>`,
      )
      .join("");
    const textOutline =
      variant === "direct"
        ? 'stroke="#17251b" stroke-opacity=".7" stroke-width="3" stroke-linejoin="round" paint-order="stroke fill"'
        : "";
    const textBackground =
      variant === "panel"
        ? `<rect x="44" y="${layout.panelY}" width="384" height="${layout.panelHeight}" rx="12" fill="#14221a" fill-opacity=".54"/>`
        : variant === "fade"
          ? '<rect x="28" y="590" width="425" height="310" fill="url(#textFade)"/>'
          : "";
    return `${svgStart}<defs><linearGradient id="bg" x2=".8" y2="1"><stop stop-color="#c78b52"/><stop offset="1" stop-color="#3c4738"/></linearGradient><radialGradient id="textFade"><stop stop-color="#14221a" stop-opacity=".66"/><stop offset=".68" stop-color="#14221a" stop-opacity=".38"/><stop offset="1" stop-color="#14221a" stop-opacity="0"/></radialGradient></defs><rect width="690" height="940" fill="url(#bg)"/>${photo}${textBackground}<text x="66" y="${layout.idY}" fill="white" font-family="sans-serif" font-size="22" letter-spacing="4" ${textOutline}>MATRIK · ${id}</text>${titleLines}<text x="66" y="${layout.timeY}" fill="white" font-family="sans-serif" font-size="19" ${textOutline}>${esc(recipe.activeTime ? `${recipe.activeTime} min aktiv tid` : "")}</text><rect x="445" y="705" width="180" height="180" rx="10" fill="white"/><g fill="#17251b">${qrDots}</g></svg>`;
  }
  const lines = recipe.ingredients || [];
  const rowHeight = lines.length > 10 ? 31 : 37;
  const tableY = BACK_TABLE_Y;
  const rows = lines
    .map((item, index) => {
      const y = tableY + index * rowHeight;
      const name = esc(
        item.name.length > 31 ? item.name.slice(0, 29) + "…" : item.name,
      );
      const cells = [4, 6, 8]
        .map(
          (portions, i) =>
            `<text x="${424 + i * 76}" y="${y + 24}" text-anchor="end" font-size="18" font-weight="600">${esc(scaledQuantity(item, portions, recipe.servings))}</text>`,
        )
        .join("");
      return `<rect x="55" y="${y}" width="580" height="${rowHeight}" fill="${index % 2 ? "#f4f1e9" : "white"}"/><text x="66" y="${y + 24}" font-size="18">${name}</text><text x="338" y="${y + 24}" font-size="17" fill="#617162">${esc(item.unit)}</text>${cells}`;
    })
    .join("");
  const endY = tableY + lines.length * rowHeight;
  const instructionY = Math.max(endY + 70, 630);
  const instructions = wrap(recipe.cardRecipe || recipe.recipe, 57)
    .slice(0, Math.max(0, Math.floor((880 - instructionY - 36) / 25) + 1))
    .map(
      (line, i) =>
        `<text x="60" y="${instructionY + 36 + i * 25}" font-size="19">${esc(line)}</text>`,
    )
    .join("");
  return `${svgStart}<rect width="690" height="940" fill="#f9f7f0"/><rect x="30" y="30" width="630" height="880" fill="none" stroke="#e3ded1" stroke-width="2"/><text x="60" y="100" font-family="sans-serif" font-size="20" letter-spacing="4" fill="#657261">MATRIK · ${id}</text><text x="60" y="156" font-family="sans-serif" font-size="${title.length > 22 ? 33 : 43}" font-weight="700" fill="#1e3327">${title}</text><text x="60" y="197" font-family="sans-serif" font-size="17" fill="#657261">${esc(recipe.activeTime ? `${recipe.activeTime} min aktiv` : "")} ${esc(recipe.totalTime ? `· ${recipe.totalTime} min totalt` : "")}</text><line x1="55" y1="208" x2="635" y2="208" stroke="#b9c3b6"/><g font-family="sans-serif" fill="#243a2b"><text x="66" y="232" font-size="14" fill="#657261">INGREDIENSER</text><text x="424" y="232" text-anchor="end" font-size="16">4</text><text x="500" y="232" text-anchor="end" font-size="16">6</text><text x="576" y="232" text-anchor="end" font-size="16">8</text>${rows}<text x="60" y="${instructionY}" font-size="20" font-weight="700">GÖR SÅ HÄR</text>${instructions}</g></svg>`;
}

import QRCode from "qrcode";
import { DEFAULT_PRINT_PROFILE, resolvePrintProfile } from "./print-profile.js";
import { cardUnit, ingredientDisplayName } from "./ingredient-label.js";

export const CARD = resolvePrintProfile(DEFAULT_PRINT_PROFILE);
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
const CARD_THEMES = {
  maträtt: {
    icon: "utensils",
    panel: "#14221a",
    panelOpacity: ".54",
    qrPaper: "white",
    qrInk: "#17251b",
    back: {
      paper: "#f9f7f0",
      title: "#1e3327",
      body: "#243a2b",
      muted: "#657261",
      rule: "#b9c3b6",
      stripe: "#f4f1e9",
      row: "white",
      unit: "#617162",
      accent: "#657261",
      heading: "#243a2b",
    },
  },
  dessert: {
    icon: "ice-cream-bowl",
    panel: "#B74379",
    panelOpacity: ".94",
    qrPaper: "#fff5f9",
    qrInk: "#4d1f3b",
    back: {
      paper: "#fff7fa",
      title: "#4e2340",
      body: "#462d3c",
      muted: "#79596e",
      rule: "#d9a8bf",
      stripe: "#fbe9f0",
      row: "#fffdfd",
      unit: "#79596e",
      accent: "#a43d70",
      heading: "#a43d70",
    },
  },
};
export function cardTheme(recipe) {
  return String(recipe.type || "")
    .trim()
    .toLowerCase() === "dessert"
    ? CARD_THEMES.dessert
    : CARD_THEMES.maträtt;
}
function categoryIcon(theme, y) {
  if (theme.icon === "ice-cream-bowl") {
    // Lucide ice-cream-bowl, original 24 × 24 geometry (ISC license).
    // https://github.com/lucide-icons/lucide/blob/main/icons/ice-cream-bowl.svg
    return `<g data-category-icon="ice-cream-bowl" transform="translate(382 ${y}) scale(1.7)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17c5 0 8-2.69 8-6H4c0 3.31 3 6 8 6m-4 4h8m-4-3v3M5.14 11a3.5 3.5 0 1 1 6.71 0"/><path d="M12.14 11a3.5 3.5 0 1 1 6.71 0"/><path d="M15.5 6.5a3.5 3.5 0 1 0-7 0"/></g>`;
  }
  return `<g data-category-icon="utensils" transform="translate(382 ${y})" fill="white"><path d="M5 1h3v11h2V1h3v11h2V1h3v12a7 7 0 0 1-5 6.7V38h-4V19.7A7 7 0 0 1 4 13V1zM28 1c5 0 7 5 7 12v12h-5v13h-4V1z"/></g>`;
}
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
const BACK_TABLE_Y = 178;
const backInstructionY = (ingredientCount, rowHeight) =>
  Math.max(BACK_TABLE_Y + ingredientCount * rowHeight + 48, 330);
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
function fitText(text, fontSize, maxWidth) {
  const approximateWidth =
    [...text].reduce((width, char) => {
      if ("WMÅÄÖ@%".includes(char)) return width + 0.95;
      if ("ilI.,:;!| ".includes(char)) return width + 0.3;
      return width + 0.62;
    }, 0) * fontSize;
  return approximateWidth > maxWidth
    ? `textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"`
    : "";
}
export function validateCard(recipe, profile = DEFAULT_PRINT_PROFILE) {
  resolvePrintProfile(profile);
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
  if (wrap(title, 15).length > 2)
    issues.push({
      level: "error",
      message: "Titeln behöver ett kortnamn som ryms på högst två rader.",
    });
  if ((recipe.ingredients || []).length > 15)
    issues.push({
      level: "error",
      message: "Fler än 15 ingrediensrader får inte plats på baksidan.",
    });
  if (
    (recipe.ingredients || []).some((x) => ingredientDisplayName(x).length > 31)
  )
    issues.push({
      level: "warning",
      message: "Ett ingrediensnamn är långt och kan behöva förkortas.",
    });
  const lines = wrap(recipe.cardRecipe || recipe.recipe, 57);
  const rowHeight = (recipe.ingredients || []).length > 10 ? 31 : 37;
  const instructionY = backInstructionY(
    (recipe.ingredients || []).length,
    rowHeight,
  );
  const available = Math.floor((860 - instructionY - 36) / 25) + 1;
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
function svgStart(profile) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${profile.widthMm}mm" height="${profile.heightMm}mm" viewBox="0 0 ${profile.widthUnits} ${profile.heightUnits}" preserveAspectRatio="none">`;
}
function contentTransform(profile) {
  const contentEdge = (profile.bleedMm + profile.safeMm) * 10 + 10;
  const safeWidth = profile.widthUnits - 2 * contentEdge;
  const safeHeight = profile.heightUnits - 2 * contentEdge;
  const scale = Math.min(safeWidth / (625 - 62), safeHeight / (873 - 55));
  const x = contentEdge - 62 * scale + (safeWidth - (625 - 62) * scale) / 2;
  const y = contentEdge - 55 * scale + (safeHeight - (873 - 55) * scale) / 2;
  return `translate(${x} ${y}) scale(${scale})`;
}
export function renderCard(
  recipe,
  side,
  { frontStyle = "panel", printProfile = DEFAULT_PRINT_PROFILE } = {},
) {
  const profile = resolvePrintProfile(printProfile);
  const theme = cardTheme(recipe);
  const id = esc(recipe.id || "");
  const rawTitle = recipe.shortName || recipe.name || "Namnlös rätt";
  const title = esc(rawTitle);
  if (side === "front") {
    const qr = QRCode.create(recipe.id || "M000", {
      errorCorrectionLevel: "M",
    }).modules;
    const size = qr.size,
      dot = 150 / size;
    const qrY = 694;
    let qrDots = "";
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (qr.get(x, y))
          qrDots += `<rect x="${446 + x * dot}" y="${qrY + 15 + y * dot}" width="${dot + 0.08}" height="${dot + 0.08}"/>`;
    const photo = recipe.imageDataUrl
      ? `<image href="${esc(recipe.imageDataUrl)}" x="0" y="0" width="${profile.widthUnits}" height="${profile.heightUnits}" preserveAspectRatio="xMidYMid slice"/>`
      : "";
    const variant =
      theme === CARD_THEMES.dessert
        ? "panel"
        : FRONT_STYLES.some((style) => style.id === frontStyle)
          ? frontStyle
          : "panel";
    const frontTitle = recipe.shortName || recipe.name || "Namnlös rätt";
    const compactTitleParts = wrap(frontTitle, variant === "panel" ? 12 : 15);
    const titleParts = (
      variant === "panel" && compactTitleParts.length > 2
        ? wrap(frontTitle, 16)
        : compactTitleParts
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
    const dessertOutline =
      theme === CARD_THEMES.dessert
        ? 'stroke="#55263d" stroke-opacity=".82" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke fill"'
        : "";
    const titleLines = titleParts
      .map(
        (line, i) =>
          `<text x="66" y="${layout.titleY + i * layout.titleStep}" fill="white" font-family="sans-serif" font-size="43" font-weight="700" ${fitText(line, 43, variant === "panel" ? 340 : 540)} ${variant === "direct" ? 'stroke="#17251b" stroke-opacity=".65" stroke-width="5" stroke-linejoin="round" paint-order="stroke fill"' : dessertOutline}>${esc(line)}</text>`,
      )
      .join("");
    const textOutline =
      variant === "direct"
        ? 'stroke="#17251b" stroke-opacity=".7" stroke-width="3" stroke-linejoin="round" paint-order="stroke fill"'
        : theme === CARD_THEMES.dessert
          ? dessertOutline
          : "";
    const textBackground =
      variant === "panel"
        ? `<rect x="44" y="${layout.panelY}" width="384" height="${layout.panelHeight}" rx="12" fill="${theme.panel}" fill-opacity="${theme.panelOpacity}"/>`
        : variant === "fade"
          ? '<rect x="28" y="590" width="425" height="310" fill="url(#textFade)"/>'
          : "";
    const icon = categoryIcon(
      theme,
      variant === "panel" ? layout.panelY + 8 : 645,
    );
    return `${svgStart(profile)}<defs><linearGradient id="bg" x2=".8" y2="1"><stop stop-color="#c78b52"/><stop offset="1" stop-color="#3c4738"/></linearGradient><radialGradient id="textFade"><stop stop-color="#14221a" stop-opacity=".66"/><stop offset=".68" stop-color="#14221a" stop-opacity=".38"/><stop offset="1" stop-color="#14221a" stop-opacity="0"/></radialGradient></defs><rect width="${profile.widthUnits}" height="${profile.heightUnits}" fill="url(#bg)"/>${photo}<g transform="${contentTransform(profile)}"><g transform="translate(18 -17)">${textBackground}<text x="66" y="${layout.idY}" fill="white" font-family="sans-serif" font-size="22" letter-spacing="4" ${textOutline}>MATRIK · ${id}</text>${icon}${titleLines}<text x="66" y="${layout.timeY}" fill="white" font-family="sans-serif" font-size="19" ${textOutline}>${esc(recipe.activeTime ? `${recipe.activeTime} min aktiv tid` : "")}</text><rect x="435" y="${qrY}" width="172" height="180" rx="10" fill="${theme.qrPaper}"/><g fill="${theme.qrInk}">${qrDots}</g></g></g></svg>`;
  }
  const lines = recipe.ingredients || [];
  const rowHeight = lines.length > 10 ? 31 : 37;
  const tableY = BACK_TABLE_Y;
  const rows = lines
    .map((item, index) => {
      const y = tableY + index * rowHeight;
      const label = ingredientDisplayName(item);
      const name = esc(label);
      const nameSize = label === item.name ? 18 : 15;
      const quantities = [4, 6, 8].map((portions) =>
        scaledQuantity(item, portions, recipe.servings),
      );
      const cells = quantities
        .map(
          (quantity, i) =>
            `<text x="${424 + i * 76}" y="${y + 24}" text-anchor="end" font-size="18" font-weight="600">${esc(quantity)}</text>`,
        )
        .join("");
      return `<rect x="55" y="${y}" width="580" height="${rowHeight}" fill="${index % 2 ? theme.back.stripe : theme.back.row}"/><text x="66" y="${y + 24}" font-size="${nameSize}" ${fitText(label, nameSize, 255)}>${name}</text><text x="338" y="${y + 24}" font-size="17" fill="${theme.back.unit}">${esc(cardUnit(item, quantities))}</text>${cells}`;
    })
    .join("");
  const instructionY = backInstructionY(lines.length, rowHeight);
  const backTitleSize =
    rawTitle.length <= 16 ? 43 : rawTitle.length <= 22 ? 34 : 27;
  const backTitle = `${rawTitle} · ${recipe.id || ""}`;
  const backTimes = [
    recipe.activeTime ? `${recipe.activeTime} min aktiv` : "",
    recipe.totalTime ? `${recipe.totalTime} min totalt` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const instructions = wrap(recipe.cardRecipe || recipe.recipe, 57)
    .slice(0, Math.max(0, Math.floor((860 - instructionY - 36) / 25) + 1))
    .map(
      (line, i) =>
        `<text x="66" y="${instructionY + 36 + i * 25}" font-size="19" ${fitText(line, 19, 540)}>${esc(line)}</text>`,
    )
    .join("");
  return `${svgStart(profile)}<rect width="${profile.widthUnits}" height="${profile.heightUnits}" fill="${theme.back.paper}"/><g transform="${contentTransform(profile)}"><text x="66" y="91" font-family="sans-serif" font-size="${backTitleSize}" font-weight="700" fill="${theme.back.title}" ${fitText(backTitle, backTitleSize, 540)}>${title} · ${id}</text><text x="66" y="126" font-family="sans-serif" font-size="17" fill="${theme.back.muted}">${esc(backTimes)}</text><line x1="55" y1="143" x2="635" y2="143" stroke="${theme.back.rule}"/><g font-family="sans-serif" fill="${theme.back.body}"><text x="66" y="168" font-size="14" fill="${theme.back.accent}">INGREDIENSER</text><text x="424" y="168" text-anchor="end" font-size="16">4</text><text x="500" y="168" text-anchor="end" font-size="16">6</text><text x="576" y="168" text-anchor="end" font-size="16">8</text>${rows}<text x="66" y="${instructionY}" font-size="20" font-weight="700" fill="${theme.back.heading}">GÖR SÅ HÄR</text>${instructions}</g></g></svg>`;
}

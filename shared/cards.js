import QRCode from "qrcode";
import { DEFAULT_PRINT_PROFILE, resolvePrintProfile } from "./print-profile.js";
import { cardUnit, cardIngredientName } from "./ingredient-label.js";
import { recipeType } from "./recipe-type.js";
import { cropImageSvg } from "./image-crop.js";
import { backCardLayout } from "./card-layout.js";

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
  return recipeType(recipe) === "Dessert"
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
  const resolvedProfile = resolvePrintProfile(profile);
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
  if ((recipe.ingredients || []).some((x) => cardIngredientName(x).length > 31))
    issues.push({
      level: "warning",
      message: "Ett ingrediensnamn är långt och kan behöva förkortas.",
    });
  for (const message of backCardLayout(recipe, resolvedProfile, scaledQuantity)
    .errors)
    issues.push({ level: "error", message });
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
  {
    frontStyle = "panel",
    printProfile = DEFAULT_PRINT_PROFILE,
    showCardGraphics = true,
  } = {},
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
      ? cropImageSvg(
          esc(recipe.imageDataUrl),
          recipe.imageCrop,
          recipe.imageWidth,
          recipe.imageHeight,
          printProfile,
        )
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
              panelHeight: recipe.activeTime || recipe.totalTime ? 210 : 170,
              idY: 716,
              titleY: 762,
              titleStep: 48,
              timeY: 852,
            }
          : {
              panelY: 710,
              panelHeight: recipe.activeTime || recipe.totalTime ? 155 : 115,
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
    const frontTimes = [
      recipe.activeTime ? `${recipe.activeTime} min aktivt` : "",
      recipe.totalTime ? `${recipe.totalTime} min totalt` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const frontTime = frontTimes
      ? `<g fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><circle cx="76" cy="${layout.timeY - 7}" r="8"/><path d="M76 ${layout.timeY - 12}v5l3 2"/></g><text x="92" y="${layout.timeY}" fill="white" font-family="sans-serif" font-size="19" ${textOutline}>${esc(frontTimes)}</text>`
      : "";
    return `${svgStart(profile)}<defs><linearGradient id="bg" x2=".8" y2="1"><stop stop-color="#c78b52"/><stop offset="1" stop-color="#3c4738"/></linearGradient><radialGradient id="textFade"><stop stop-color="#14221a" stop-opacity=".66"/><stop offset=".68" stop-color="#14221a" stop-opacity=".38"/><stop offset="1" stop-color="#14221a" stop-opacity="0"/></radialGradient></defs><rect width="${profile.widthUnits}" height="${profile.heightUnits}" fill="url(#bg)"/>${photo}${showCardGraphics ? `<g transform="${contentTransform(profile)}"><g transform="translate(18 -17)">${textBackground}<text x="66" y="${layout.idY}" fill="white" font-family="sans-serif" font-size="22" letter-spacing="4" ${textOutline}>MATRIK · ${id}</text>${icon}${titleLines}${frontTime}<rect x="435" y="${qrY}" width="172" height="180" rx="10" fill="${theme.qrPaper}"/><g fill="${theme.qrInk}">${qrDots}</g></g></g>` : ""}</svg>`;
  }
  const layout = backCardLayout(recipe, profile, scaledQuantity);
  const backTitle = layout.titleRows
    .map(
      ({ text, x, y, size }) =>
        `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" fill="${theme.back.title}">${esc(text)}</text>`,
    )
    .join("");
  const backTime = layout.times
    ? `<g fill="none" stroke="${theme.back.muted}" stroke-width="1.8" stroke-linecap="round"><circle cx="${layout.left + 4}" cy="${layout.timesY - 6}" r="7"/><path d="M${layout.left + 4} ${layout.timesY - 10}v4l3 2"/></g><text x="${layout.left + 18}" y="${layout.timesY}" font-size="17" fill="${theme.back.muted}">${esc(layout.times)}</text>`
    : "";
  const headings = ["4", "6", "8"]
    .map(
      (value, index) =>
        `<text x="${layout.columns[index]}" y="${layout.headingY}" text-anchor="end" font-size="16">${value}</text>`,
    )
    .join("");
  const rows = layout.rows
    .map((row, index) => {
      const names = row.names
        .map(
          (name, line) =>
            `<text x="${layout.left}" y="${row.y + 20 + line * 17}" font-size="${row.nameSize}">${esc(name)}</text>`,
        )
        .join("");
      const values = row.quantities
        .map(
          (value, col) =>
            `<text x="${layout.columns[col]}" y="${row.y + 20}" text-anchor="end" font-size="18" font-weight="700">${esc(value)}</text>`,
        )
        .join("");
      return `<rect x="${layout.left - 14}" y="${row.y}" width="${layout.right - layout.left + 19}" height="${row.height}" fill="${index % 2 ? theme.back.stripe : theme.back.row}"/>${names}<text x="${layout.unitX}" y="${row.y + 20}" font-size="17" fill="${theme.back.unit}">${esc(row.unit)}</text>${values}`;
    })
    .join("");
  const instructions = layout.instructions
    .map(
      ({ text, x, y }) =>
        `<text x="${x}" y="${y}" font-size="19">${esc(text)}</text>`,
    )
    .join("");
  return `${svgStart(profile)}<rect width="${profile.widthUnits}" height="${profile.heightUnits}" fill="${theme.back.paper}"/><g font-family="Noto Sans, sans-serif" fill="${theme.back.body}">${backTitle}${backTime}<line x1="${layout.left - 14}" x2="${layout.right + 5}" y1="${layout.ruleY}" y2="${layout.ruleY}" stroke="${theme.back.rule}"/><text x="${layout.left}" y="${layout.headingY}" font-size="14" fill="${theme.back.accent}">INGREDIENSER</text>${headings}${rows}<line x1="${layout.left - 4}" x2="${layout.right}" y1="${layout.dividerY}" y2="${layout.dividerY}" stroke="${theme.back.rule}" stroke-width="1.3"/>${instructions}</g></svg>`;
}

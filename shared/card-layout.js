import { CARD_FONT_METRICS } from "./card-font-metrics.js";
import { cardIngredientName, cardUnit } from "./ingredient-label.js";
import { standardCardIngredients } from "./ingredient-order.js";

const glyph = (char, bold) =>
  CARD_FONT_METRICS[bold ? "bold" : "regular"][char] ||
  CARD_FONT_METRICS[bold ? "bold" : "regular"]["?"];

// Noto Sans advance widths are summed without kerning. This is a conservative
// bound for SVG text and avoids changing font size or compressing glyphs.
export function cardTextWidth(value, size, bold = false) {
  return [...String(value || "")].reduce(
    (width, char) => width + glyph(char, bold)[0] * size,
    0,
  );
}

export function cardTextBounds(
  value,
  size,
  x,
  baseline,
  bold = false,
  anchor = "start",
) {
  const chars = [...String(value || "")];
  const advance = cardTextWidth(value, size, bold);
  let cursor = anchor === "end" ? x - advance : x;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const char of chars) {
    const [width, l, t, r, b] = glyph(char, bold);
    if (r > l && b > t) {
      left = Math.min(left, cursor + l * size);
      top = Math.min(top, baseline + t * size);
      right = Math.max(right, cursor + r * size);
      bottom = Math.max(bottom, baseline + b * size);
    }
    cursor += width * size;
  }
  return Number.isFinite(left) ? { left, top, right, bottom } : null;
}

export function wrapCardText(value, size, maxWidth, bold = false) {
  const lines = [];
  for (const paragraph of String(value || "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = (line + " " + word).trim();
      if (line && cardTextWidth(candidate, size, bold) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function backCardLayout(recipe, profile, quantityFor) {
  const safe = (profile.bleedMm + profile.safeMm) * 10;
  const right = profile.widthUnits - safe;
  const bottom = profile.heightUnits - safe;
  const left = safe + 5.5;
  const title = `${recipe.shortName || recipe.name || "Namnlös rätt"} · ${recipe.id || ""}`;
  const rawTitle = recipe.shortName || recipe.name || "";
  const titleSize =
    rawTitle.length <= 16 ? 43 : rawTitle.length <= 22 ? 34 : 27;
  let titleLines = wrapCardText(title, titleSize, right - left, true);
  if (titleLines.length === 2) {
    const words = title.split(/\s+/);
    const choices = words
      .slice(1)
      .map((_, index) => [
        words.slice(0, index + 1).join(" "),
        words.slice(index + 1).join(" "),
      ])
      .filter((pair) =>
        pair.every(
          (part) => cardTextWidth(part, titleSize, true) <= right - left,
        ),
      );
    if (choices.length)
      titleLines = choices.reduce((best, pair) =>
        Math.abs(
          cardTextWidth(pair[0], titleSize, true) -
            cardTextWidth(pair[1], titleSize, true),
        ) <
        Math.abs(
          cardTextWidth(best[0], titleSize, true) -
            cardTextWidth(best[1], titleSize, true),
        )
          ? pair
          : best,
      );
  }
  const titleBase = safe + 43.5;
  const titleShift = Math.max(0, titleLines.length - 1) * 34;
  const times = [
    recipe.activeTime ? `${recipe.activeTime} min aktiv` : "",
    recipe.totalTime ? `${recipe.totalTime} min totalt` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const timesY = safe + 73.5 + titleShift; // +5 vs the approved prototype
  const ruleY = safe + 86.5 + titleShift;
  const headingY = safe + 105.5 + titleShift;
  const tableY = safe + 114.5 + titleShift;
  const columns = [right - 185, right - 105, right - 15];
  const unitX = left + 269;
  const boxes = [];
  const add = (label, text, size, x, y, bold = false, anchor) => {
    const bounds = cardTextBounds(text, size, x, y, bold, anchor);
    if (bounds) boxes.push({ label, ...bounds });
    return bounds;
  };
  const titleRows = titleLines.map((text, index) => ({
    text,
    x: left,
    y: titleBase + index * 34,
    size: titleSize,
    bounds: add("Titel", text, titleSize, left, titleBase + index * 34, true),
  }));
  const timeBounds = add("Tider", times, 17, left + 18, timesY);
  add("Ingrediensrubrik", "INGREDIENSER", 14, left, headingY);
  ["4", "6", "8"].forEach((text, index) =>
    add("Portionsrubrik", text, 16, columns[index], headingY, false, "end"),
  );
  let y = tableY;
  const rows = standardCardIngredients(recipe).map((item, index) => {
    const label = cardIngredientName(item);
    let nameSize = 18;
    let names = wrapCardText(label, nameSize, 259);
    if (
      names.length > 2 ||
      names.some((text) => cardTextWidth(text, nameSize) > 259)
    ) {
      nameSize = 15;
      names = wrapCardText(label, nameSize, 259);
    }
    const height = names.length === 2 ? 43 : 29;
    const nameBounds = names.map((text, line) =>
      add(`Ingrediens ${index + 1}`, text, nameSize, left, y + 20 + line * 17),
    );
    const quantities = [4, 6, 8].map((portions) =>
      quantityFor(item, portions, recipe.servings),
    );
    const unit = cardUnit(item, quantities);
    const unitBounds = add(`Enhet ${index + 1}`, unit, 17, unitX, y + 20);
    const quantityBounds = quantities.map((text, col) =>
      add(`Mängd ${index + 1}`, text, 18, columns[col], y + 20, true, "end"),
    );
    const row = {
      y,
      height,
      label,
      names,
      nameSize,
      unit,
      quantities,
      nameBounds,
      unitBounds,
      quantityBounds,
    };
    y += height;
    return row;
  });
  const dividerY = y + 9;
  const instructionLines = wrapCardText(
    recipe.cardRecipe || recipe.recipe,
    19,
    right - left,
  );
  const instructions = instructionLines.map((text, index) => {
    const baseline = dividerY + 25 + index * 23;
    return {
      text,
      x: left,
      y: baseline,
      bounds: add(`Instruktion ${index + 1}`, text, 19, left, baseline),
    };
  });
  const errors = [];
  if (titleLines.length > 2)
    errors.push("Korttiteln behöver fler än två rader.");
  for (const [index, row] of rows.entries()) {
    if (row.names.length > 2)
      errors.push(`Ingrediens ${index + 1} behöver fler än två rader.`);
    if (row.nameBounds.some((box) => box?.right > unitX - 5))
      errors.push(`Ingrediens ${index + 1} överlappar enheten.`);
    if (row.unitBounds?.right > row.quantityBounds[0]?.left - 5)
      errors.push(`Enhet ${index + 1} överlappar mängden.`);
    if (
      row.quantityBounds.some(
        (box, col) => col && box?.left < row.quantityBounds[col - 1]?.right + 5,
      )
    )
      errors.push(`Mängderna överlappar på ingrediensrad ${index + 1}.`);
  }
  if (titleRows.at(-1)?.bounds?.bottom > timeBounds?.top - 3)
    errors.push("Titel och tider överlappar.");
  for (const box of boxes) {
    if (
      box.left < safe - 0.2 ||
      box.top < safe - 0.2 ||
      box.right > right + 0.2 ||
      box.bottom > bottom + 0.2
    )
      errors.push(`${box.label} ligger utanför safe area.`);
  }
  for (let i = 1; i < instructions.length; i++)
    if (instructions[i - 1].bounds?.bottom > instructions[i].bounds?.top)
      errors.push(`Instruktionsrad ${i} överlappar nästa rad.`);
  return {
    safe,
    right,
    bottom,
    left,
    titleRows,
    titleSize,
    times,
    timesY,
    ruleY,
    headingY,
    tableY,
    columns,
    unitX,
    rows,
    dividerY,
    instructions,
    boxes,
    errors,
    remainingUnits: bottom - (instructions.at(-1)?.bounds?.bottom ?? dividerY),
  };
}

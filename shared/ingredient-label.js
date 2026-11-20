export function alternativeNote(line) {
  const alternatives = (
    Array.isArray(line.alternatives) ? line.alternatives : []
  )
    .map((item) => String(item?.name || item).trim())
    .filter(Boolean);
  const note = String(line.note || "").trim();
  return [
    alternatives.length ? `Alternativ: ${alternatives.join(" / ")}` : "",
    note,
  ]
    .filter(Boolean)
    .join("; ");
}

export function ingredientDisplayName(line) {
  const structured = (line.alternatives || [])
    .filter((item) => item && typeof item === "object" && item.ingredientId)
    .map((item) => item.name);
  const match = /(?:^|;\s*)Alternativ:\s*([^;]+)/i.exec(
    String(line.note || ""),
  );
  const name = structured.length
    ? `${String(line.name || "").split(/\s*\/\s*/)[0]} / ${structured.join(" / ")}`
    : match
      ? `${line.name} / ${match[1].trim().replace(/\s*\/\s*/g, " / ")}`
      : String(line.name || "");
  return line.required === false || line.required === "Nej"
    ? `${name} (valfri)`
    : name;
}

export function cardIngredientName(line) {
  const name = String(line.name || "")
    .split(/\s*\/\s*/)[0]
    .trim();
  return line.required === false || line.required === "Nej"
    ? `${name} (valfri)`
    : name;
}

export function grammaticalUnit(unit, quantity) {
  const text = String(unit || "");
  if (text.toLowerCase() === "burk" && Number(quantity) !== 1) return "burkar";
  return text;
}

export function cardUnit(line, quantities) {
  const unit = String(line.unit || "");
  if (unit.toLowerCase() === "kit" && /kit/i.test(line.name || "")) return "";
  if (
    unit.toLowerCase() === "burk" &&
    quantities.every((quantity) => Number(quantity) > 1)
  )
    return "burkar";
  return unit;
}

export function ingredientListLine(line) {
  const label = ingredientDisplayName({
    ...line,
    note: alternativeNote(line),
  });
  const repeatedKit =
    String(line.unit || "").toLowerCase() === "kit" &&
    /kit/i.test(line.name || "");
  const singleCarrot =
    String(line.name || "").toLocaleLowerCase("sv-SE") === "morötter" &&
    String(line.unit || "").toLocaleLowerCase("sv-SE") === "st" &&
    Number(line.quantity) === 1 &&
    !String(line.note || "").includes("Alternativ:");
  if (singleCarrot)
    return `1 morot${line.required === false ? " (valfri)" : ""}${line.note ? ` – ${line.note}` : ""}`;
  const unit = repeatedKit
    ? ""
    : `${grammaticalUnit(line.unit, line.quantity)} `;
  const name = label.charAt(0).toLocaleLowerCase("sv-SE") + label.slice(1);
  return `${line.quantity} ${unit}${name}${line.note ? ` – ${line.note}` : ""}`;
}

export function alternativeNote(line) {
  const alternatives = (
    Array.isArray(line.alternatives) ? line.alternatives : []
  )
    .map((name) => String(name).trim())
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
  const match = /(?:^|;\s*)Alternativ:\s*([^;]+)/i.exec(
    String(line.note || ""),
  );
  const name = match
    ? `${line.name} / ${match[1].trim().replace(/\s*\/\s*/g, " / ")}`
    : String(line.name || "");
  return line.required === false || line.required === "Nej"
    ? `${name} (valfri)`
    : name;
}

export function grammaticalUnit(unit, quantity) {
  const text = String(unit || "");
  if (text.toLowerCase() === "burk" && Number(quantity) !== 1)
    return "burkar";
  return text;
}

export function cardUnit(line, quantities) {
  const unit = String(line.unit || "");
  if (unit.toLowerCase() === "kit" && /kit/i.test(line.name || ""))
    return "";
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
  const unit = repeatedKit ? "" : `${grammaticalUnit(line.unit, line.quantity)} `;
  const name = label.charAt(0).toLocaleLowerCase("sv-SE") + label.slice(1);
  return `${line.quantity} ${unit}${name}${line.note ? ` – ${line.note}` : ""}`;
}

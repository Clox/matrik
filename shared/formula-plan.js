export function copyFormulaToRow(formula, sourceRow, targetRow) {
  if (!String(formula).startsWith("=") || sourceRow < 1 || targetRow < 1)
    throw new Error("Ogiltig formelmall eller rad.");
  const copied = formula.replace(
    /(\$?[A-Z]{1,3})(?!\$)(\d+)\b/g,
    (match, column, row) =>
      Number(row) === sourceRow ? `${column}${targetRow}` : match,
  );
  if (copied === formula)
    throw new Error("Formelmallen saknar relativa radreferenser.");
  return copied;
}

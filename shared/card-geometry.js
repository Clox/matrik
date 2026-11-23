// Measurements are in the SVG's 0.1 mm coordinate system. Poker values are
// intentionally identical to the original production layout.
const poker = Object.freeze({
  titleSizes: [43, 34, 27],
  titleBase: 43.5,
  titleStep: 34,
  timesY: 73.5,
  ruleY: 86.5,
  headingY: 105.5,
  tableY: 114.5,
  unitOffset: 269,
  timeSize: 17,
  headingSize: 14,
  portionSize: 16,
  ingredientSize: 19,
  ingredientWidth: 259,
  rowHeight: 27,
  wrappedRowHeight: 41,
  rowBaseline: 20,
  nameLineStep: 17,
  unitSize: 18,
  quantitySize: 19,
  dividerGap: 7,
  instructionSize: 20,
  instructionStart: 23,
  instructionStep: 24,
  frontVerticalAlign: "center",
});

const tarot = Object.freeze({
  titleSizes: [48, 39, 31],
  titleBase: 55,
  titleStep: 43,
  timesY: 92,
  ruleY: 108,
  headingY: 132,
  tableY: 144,
  unitOffset: 287,
  timeSize: 19,
  headingSize: 17,
  portionSize: 18,
  ingredientSize: 22,
  ingredientWidth: 276,
  rowHeight: 34,
  wrappedRowHeight: 52,
  rowBaseline: 25,
  nameLineStep: 21,
  unitSize: 20,
  quantitySize: 21,
  dividerGap: 14,
  instructionSize: 24,
  instructionStart: 29,
  instructionStep: 31,
  frontVerticalAlign: "bottom",
});

export function cardGeometry(profile) {
  return profile.id === "mpc-tarot" ? tarot : poker;
}

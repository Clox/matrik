import assert from "node:assert/strict";
import test from "node:test";
import { copyFormulaToRow } from "../shared/formula-plan.js";

test("nya relationsrader får relativa referenser utan att fast formelområde ändras", () => {
  const previous =
    '=IF(OR($A200="";$C200="");"";VLOOKUP($A200;\'Rätter\'!$A$2:$D$200;4;FALSE))';
  const next = copyFormulaToRow(previous, 200, 201);
  assert.match(next, /\$A201/);
  assert.match(next, /\$C201/);
  assert.match(next, /\$A\$2:\$D\$200/);
  assert.doesNotMatch(next, /\$A200(?!\$)/);
  assert.throws(() => copyFormulaToRow("=1+1", 200, 201));
});

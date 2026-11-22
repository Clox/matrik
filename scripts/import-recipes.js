import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { google } from "googleapis";
import { authClient, loadCatalog } from "../server/google.js";
import { copyFormulaToRow } from "../shared/formula-plan.js";
import {
  buildImportPlan,
  planMarkdown,
  proposalMarkdown,
} from "../shared/import-plan.js";

const args = process.argv.slice(2);
const mode = args.shift();
const inputPath = args.shift();
const confirmedHash = args[0] === "--confirm" ? args[1] : "";
if (!(["dry-run", "apply"].includes(mode) && inputPath)) {
  console.error(
    "Användning: npm run import:dry -- .local/import/recipes.json\n" +
      "eller: npm run import:apply -- .local/import/recipes.json --confirm PLAN-ID",
  );
  process.exit(2);
}
if (mode === "apply" && !confirmedHash) {
  console.error("Import kräver --confirm med planens exakta ID.");
  process.exit(2);
}
const absoluteInput = path.resolve(inputPath);
if (!absoluteInput.startsWith(`${path.resolve(".local")}${path.sep}`)) {
  console.error(
    "Receptförslag måste ligga i den Git-ignorerade .local-mappen.",
  );
  process.exit(2);
}
const source = JSON.parse(fs.readFileSync(absoluteInput, "utf8"));
const auth = authClient();
const catalog = await loadCatalog(auth);
const plan = buildImportPlan(catalog, source);

// Additional reviewed edits use exact old-cell preconditions. This permits a
// single import to include existing-recipe corrections and alternative rows.
function appendReviewedChanges(current, target) {
  const known = new Map(target.changes.map((change) => [change.range, change]));
  for (const item of source.extraChanges || []) {
    const sheet = current.raw[item.kind];
    if (
      !sheet ||
      !Number.isInteger(item.row) ||
      !Number.isInteger(item.column)
    ) {
      target.conflicts.push(
        `Ogiltig kompletterande celländring: ${item.range}`,
      );
      continue;
    }
    const before =
      item.row === 1
        ? String(sheet.headers[item.column] ?? "")
        : String(sheet.rows[item.row - 2]?.cells?.[item.column] ?? "");
    const expected = String(item.before ?? "");
    const after = String(item.after ?? "");
    if (before === after) continue;
    if (before !== expected) {
      target.conflicts.push(
        `${item.range}: förväntat gammalt cellvärde stämmer inte.`,
      );
      continue;
    }
    if (known.has(item.range)) {
      if (known.get(item.range).after !== after)
        target.conflicts.push(`${item.range}: olika ändringar i samma cell.`);
      continue;
    }
    const change = {
      kind: item.kind,
      range: item.range,
      row: item.row,
      column: item.column,
      before,
      after,
      writeValue: item.writeValue ?? after,
      context: item.context || "Granskad komplettering",
    };
    target.changes.push(change);
    known.set(item.range, change);
  }
}
appendReviewedChanges(catalog, plan);

const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });
const newDishRows = new Set(
  plan.changes
    .filter(
      (change) =>
        change.kind === "dishes" &&
        change.column === catalog.raw.dishes.columns.id,
    )
    .map((change) => change.row),
);
const newLinkRows = new Set(
  plan.changes
    .filter(
      (change) =>
        change.kind === "links" &&
        change.column === catalog.raw.links.columns.dishId,
    )
    .map((change) => change.row),
);
const grid = await sheets.spreadsheets.get({
  spreadsheetId,
  ranges: [
    `'Rätter'!L2:L${Math.max(1000, ...newDishRows)}`,
    `'Rätt-ingredienser'!G2:I${Math.max(991, ...newLinkRows)}`,
  ],
  includeGridData: true,
  fields:
    "sheets(properties(title,gridProperties),data(startRow,startColumn,rowData(values(userEnteredValue))))",
});
const byTitle = Object.fromEntries(
  (grid.data.sheets || []).map((sheet) => [sheet.properties.title, sheet]),
);
const properties = await sheets.spreadsheets.get({
  spreadsheetId,
  fields: "sheets(properties(sheetId,title,gridProperties))",
});
const sizes = Object.fromEntries(
  (properties.data.sheets || []).map((sheet) => [
    sheet.properties.title,
    sheet.properties.gridProperties,
  ]),
);
for (const [title, rows, firstColumn, width] of [
  ["Rätter", newDishRows, 11, 1],
  ["Rätt-ingredienser", newLinkRows, 6, 3],
]) {
  const sheet = byTitle[title];
  const data = sheet?.data?.[0];
  const formulaAt = (row, column) =>
    data?.rowData?.[row - 1 - (data.startRow || 0)]?.values?.[
      column - (data.startColumn || 0)
    ]?.userEnteredValue?.formulaValue;
  const planned = new Map();
  for (const row of [...rows].sort((a, b) => a - b)) {
    if (row > sizes[title]?.rowCount)
      throw new Error(
        `${title} saknar rad ${row}; importen stoppas utan ändringar.`,
      );
    for (let column = 0; column < width; column++) {
      const absoluteColumn = firstColumn + column;
      if (formulaAt(row, absoluteColumn)) continue;
      const entered =
        data?.rowData?.[row - 1 - (data.startRow || 0)]?.values?.[
          absoluteColumn - (data.startColumn || 0)
        ]?.userEnteredValue;
      if (entered)
        throw new Error(
          `${title} rad ${row} har ett värde där en formel krävs; importen stoppas.`,
        );
      let templateRow = row - 1;
      while (
        templateRow > 1 &&
        !formulaAt(templateRow, absoluteColumn) &&
        !planned.has(`${templateRow}:${absoluteColumn}`)
      )
        templateRow--;
      const template =
        formulaAt(templateRow, absoluteColumn) ||
        planned.get(`${templateRow}:${absoluteColumn}`);
      if (!template)
        throw new Error(
          `${title} rad ${row} saknar formel och ingen säker mall finns; importen stoppas.`,
        );
      const formula = copyFormulaToRow(template, templateRow, row);
      planned.set(`${row}:${absoluteColumn}`, formula);
      const letter = String.fromCharCode(65 + absoluteColumn);
      plan.changes.push({
        kind: title === "Rätter" ? "dishes" : "links",
        range: `'${title}'!${letter}${row}`,
        row,
        column: absoluteColumn,
        before: "",
        after: formula,
        writeValue: formula,
        formula: true,
        context: `Fyll tom formel för ny ${title === "Rätter" ? "rätt" : "ingrediensrelation"}`,
      });
    }
  }
}
for (const [kind, sheet] of Object.entries(catalog.raw)) {
  const title = {
    dishes: "Rätter",
    ingredients: "Ingredienser",
    links: "Rätt-ingredienser",
    tags: "Taggar",
    preparations: "Rätt-förberedelser",
    alternatives: "Rätt-ingrediensalternativ",
  }[kind];
  const maxRow = Math.max(
    0,
    ...plan.changes
      .filter((change) => change.kind === kind)
      .map((change) => change.row),
  );
  const maxColumn = Math.max(
    0,
    ...plan.changes
      .filter((change) => change.kind === kind)
      .map((change) => change.column + 1),
  );
  const gridSize = sizes[title];
  const schemaExpansion =
    title === "Rätt-ingredienser" &&
    maxColumn === 20 &&
    gridSize?.columnCount === 19 &&
    plan.changes.some(
      (change) =>
        change.range === "'Rätt-ingredienser'!T1" &&
        change.before === "" &&
        change.after === "Kan väljas bort",
    );
  if (
    !gridSize ||
    maxRow > gridSize.rowCount ||
    (maxColumn > gridSize.columnCount && !schemaExpansion)
  )
    throw new Error(
      `${title} behöver större rutnät; importen stoppas utan ändringar.`,
    );
}
plan.hash = crypto
  .createHash("sha256")
  .update(
    JSON.stringify({
      assignments: plan.assignments,
      changes: plan.changes,
      conflicts: plan.conflicts,
      warnings: plan.warnings,
    }),
  )
  .digest("hex")
  .slice(0, 16);
const outputDirectory = path.resolve(".local/import/reports");
fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const reportPath = path.join(outputDirectory, `${plan.hash}.md`);
fs.writeFileSync(reportPath, planMarkdown(plan), { mode: 0o600 });
fs.chmodSync(reportPath, 0o600);
const recipesPath = path.join(outputDirectory, `${plan.hash}-recipes.md`);
fs.writeFileSync(recipesPath, proposalMarkdown(source, plan), { mode: 0o600 });
fs.chmodSync(recipesPath, 0o600);
console.log(
  `Plan ${plan.hash}: ${plan.assignments.length} rätter, ${plan.changes.length} celländringar, ${plan.conflicts.length} konflikter, ${plan.warnings.length} varningar.`,
);
console.log(`Fullständig dry-run: ${reportPath}`);
console.log(`Recept att granska: ${recipesPath}`);
if (plan.conflicts.length) process.exit(mode === "dry-run" ? 1 : 2);
if (mode === "apply" && plan.hash !== confirmedHash)
  throw new Error(
    "Arket eller förslagen har ändrats sedan godkänd dry-run. Kör ny dry-run.",
  );
if (mode === "apply" && !plan.changes.length) {
  console.log("Inga ändringar att importera.");
  process.exit(0);
}
console.log("Formler och tillgängliga arkceller är kontrollerade.");
if (mode === "dry-run") process.exit(0);

const backup = await drive.files.copy({
  fileId: spreadsheetId,
  requestBody: {
    name: `Matrik säkerhetskopia före import ${new Date().toISOString()}`,
  },
  fields: "id,name,webViewLink",
});
const backupDirectory = path.resolve(".local/import/backups");
fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
const backupPath = path.join(backupDirectory, `${plan.hash}.json`);
fs.writeFileSync(
  backupPath,
  JSON.stringify({
    at: new Date().toISOString(),
    planHash: plan.hash,
    backup: backup.data,
    snapshot: catalog.raw,
  }),
  { mode: 0o600 },
);
fs.chmodSync(backupPath, 0o600);
console.log(`Säkerhetskopia skapad i Drive och lokalt: ${backupPath}`);
const linkGrid = sizes["Rätt-ingredienser"];
if (
  plan.changes.some((change) => change.range === "'Rätt-ingredienser'!T1") &&
  linkGrid.columnCount === 19
) {
  const sheetId = properties.data.sheets.find(
    (sheet) => sheet.properties.title === "Rätt-ingredienser",
  )?.properties.sheetId;
  if (sheetId === undefined) throw new Error("Relationsflikens ark-ID saknas.");
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { columnCount: 20 } },
            fields: "gridProperties.columnCount",
          },
        },
      ],
    },
  });
}
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,
  requestBody: {
    valueInputOption: "RAW",
    data: plan.changes
      .filter((change) => !change.formula)
      .map((change) => ({
        range: change.range,
        values: [[change.writeValue]],
      })),
  },
});
const formulas = plan.changes.filter((change) => change.formula);
if (formulas.length)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: formulas.map((change) => ({
        range: change.range,
        values: [[change.after]],
      })),
    },
  });
const afterCatalog = await loadCatalog(auth);
const after = buildImportPlan(afterCatalog, source);
appendReviewedChanges(afterCatalog, after);
if (after.conflicts.length || after.changes.length)
  throw new Error(
    `Importen behöver kontroll: ${after.changes.length} ändringar och ${after.conflicts.length} konflikter återstår. Säkerhetskopia: ${backupPath}`,
  );
console.log("Importen verifierad: ny dry-run ger noll ändringar.");

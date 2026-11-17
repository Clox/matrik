import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { authClient, loadCatalog } from "../server/google.js";
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
  ranges: ["'Rätter'!L2:L1000", "'Rätt-ingredienser'!G2:I991"],
  includeGridData: true,
  fields:
    "sheets(properties(title,gridProperties),data(startRow,startColumn,rowData(values(userEnteredValue))))",
});
const byTitle = Object.fromEntries(
  (grid.data.sheets || []).map((sheet) => [sheet.properties.title, sheet]),
);
const properties = await sheets.spreadsheets.get({
  spreadsheetId,
  fields: "sheets(properties(title,gridProperties))",
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
  for (const row of rows) {
    if (row > sizes[title]?.rowCount)
      throw new Error(
        `${title} saknar rad ${row}; importen stoppas utan ändringar.`,
      );
    const values =
      data?.rowData?.[row - 1 - (data.startRow || 0)]?.values || [];
    for (let column = 0; column < width; column++) {
      if (
        !values[firstColumn + column - (data.startColumn || 0)]
          ?.userEnteredValue?.formulaValue
      )
        throw new Error(
          `${title} rad ${row} saknar förväntad formel; importen stoppas utan ändringar.`,
        );
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
  if (
    !gridSize ||
    maxRow > gridSize.rowCount ||
    maxColumn > gridSize.columnCount
  )
    throw new Error(
      `${title} behöver större rutnät; importen stoppas utan ändringar.`,
    );
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
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,
  requestBody: {
    valueInputOption: "RAW",
    data: plan.changes.map((change) => ({
      range: change.range,
      values: [[change.writeValue]],
    })),
  },
});
const after = buildImportPlan(await loadCatalog(auth), source);
if (after.conflicts.length || after.changes.length)
  throw new Error(
    `Importen behöver kontroll: ${after.changes.length} ändringar och ${after.conflicts.length} konflikter återstår. Säkerhetskopia: ${backupPath}`,
  );
console.log("Importen verifierad: ny dry-run ger noll ändringar.");

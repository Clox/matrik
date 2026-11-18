import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { google } from "googleapis";
import { SHEETS, makeCatalog, a1 } from "../shared/schema.js";

const localDir = path.resolve(".local");
const tokenPath = path.join(localDir, "token.json");
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
const q = (name) => `'${name.replaceAll("'", "''")}'`;
function credentials() {
  if (process.env.GOOGLE_CREDENTIALS_FILE) {
    const file = JSON.parse(
      fs.readFileSync(process.env.GOOGLE_CREDENTIALS_FILE, "utf8"),
    );
    const config = file.web || file.installed;
    if (!config)
      throw new Error("Credential-filen saknar web eller installed.");
    return { id: config.client_id, secret: config.client_secret };
  }
  return {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
  };
}
export function isConfigured() {
  try {
    const c = credentials();
    return Boolean(c.id && c.secret && spreadsheetId);
  } catch {
    return false;
  }
}
export function oauth() {
  const c = credentials();
  if (!c.id || !c.secret)
    throw new Error("Google OAuth är inte konfigurerat. Se README.");
  return new google.auth.OAuth2(
    c.id,
    c.secret,
    `http://127.0.0.1:${process.env.PORT || 4173}/auth/callback`,
  );
}
export function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(tokenPath, "utf8"));
  } catch {
    return null;
  }
}
export function saveTokens(tokens) {
  fs.mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const previous = readTokens() || {};
  fs.writeFileSync(tokenPath, JSON.stringify({ ...previous, ...tokens }), {
    mode: 0o600,
  });
  fs.chmodSync(tokenPath, 0o600);
}
export function clearTokens() {
  try {
    fs.unlinkSync(tokenPath);
  } catch {}
}
export function authClient() {
  const tokens = readTokens();
  if (!tokens)
    throw Object.assign(new Error("Logga in med Google först."), {
      status: 401,
    });
  const client = oauth();
  client.setCredentials(tokens);
  client.on("tokens", saveTokens);
  return client;
}
export function authUrl(state) {
  return oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
    state,
  });
}
const sheets = (auth) => google.sheets({ version: "v4", auth });
const drive = (auth) => google.drive({ version: "v3", auth });
export async function loadCatalog(auth) {
  if (!spreadsheetId) throw new Error("GOOGLE_SPREADSHEET_ID saknas.");
  const ranges = Object.values(SHEETS).map(q);
  const response = await sheets(auth).spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const data = Object.fromEntries(
    Object.keys(SHEETS).map((key, i) => [
      key,
      response.data.valueRanges?.[i]?.values || [],
    ]),
  );
  const catalog = makeCatalog(data);
  const validation = await sheets(auth).spreadsheets.get({
    spreadsheetId,
    ranges: [`${q(SHEETS.preparations)}!A2:J2`],
    includeGridData: true,
    fields: "sheets(properties(title),data(rowData(values(dataValidation))))",
  });
  const cells =
    validation.data.sheets?.find(
      (sheet) => sheet.properties?.title === SHEETS.preparations,
    )?.data?.[0]?.rowData?.[0]?.values || [];
  catalog.preparationOptions = Object.fromEntries(
    ["type", "timingType", "priority"].map((key) => [
      key,
      cells[
        catalog.raw.preparations.columns[key]
      ]?.dataValidation?.condition?.values
        ?.map((value) => value.userEnteredValue)
        .filter(Boolean) || [],
    ]),
  );
  return catalog;
}
function addCell(data, sheet, row, column, value) {
  data.push({
    range: a1(SHEETS[sheet], row, column),
    values: [[String(value ?? "")]],
    sheet,
    row,
    column,
  });
}
function setFields(catalog, kind, rowNumber, values, data) {
  for (const [key, value] of Object.entries(values)) {
    const index = catalog.raw[kind].columns[key];
    if (index === undefined || index < 0) continue;
    addCell(data, kind, rowNumber, index, value);
  }
}
function revisionOf(recipe) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(recipe))
    .digest("hex")
    .slice(0, 20);
}
function nextIngredientId(rows) {
  const ids = rows.map((row) => row.id).filter(Boolean);
  const numbered = ids.map((id) => /^(.*?)(\d+)$/.exec(id)).filter(Boolean);
  const prefix = numbered[0]?.[1] || "";
  const width = numbered[0]?.[2].length || 1;
  const max = Math.max(
    0,
    ...numbered
      .filter((match) => match[1] === prefix)
      .map((match) => Number(match[2])),
  );
  let next = max + 1;
  while (ids.includes(`${prefix}${String(next).padStart(width, "0")}`)) next++;
  return `${prefix}${String(next).padStart(width, "0")}`;
}
function nextPreparationId(rows) {
  const ids = new Set(rows.map((row) => row.id).filter(Boolean));
  const numbered = [...ids]
    .map((id) => /^([^\d]*)(\d+)$/.exec(id))
    .filter(Boolean);
  const prefix = numbered[0]?.[1] || "F";
  const width = numbered[0]?.[2].length || 3;
  let next =
    1 +
    Math.max(
      0,
      ...numbered
        .filter((match) => match[1] === prefix)
        .map((match) => Number(match[2])),
    );
  while (ids.has(`${prefix}${String(next).padStart(width, "0")}`)) next++;
  return `${prefix}${String(next).padStart(width, "0")}`;
}
function driveFileId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) return text;
  try {
    const url = new URL(text);
    if (!["drive.google.com", "docs.google.com"].includes(url.hostname))
      return "";
    return (
      /\/d\/([^/]+)/.exec(url.pathname)?.[1] || url.searchParams.get("id") || ""
    );
  } catch {
    return "";
  }
}
function imageCellValue(catalog, value) {
  if (!value) return "";
  const index = catalog.raw.dishes.columns.imageId;
  const header = index < 0 ? "" : catalog.raw.dishes.headers[index];
  if (header && /länk/i.test(header) && !/^https?:\/\//i.test(value))
    return `https://drive.google.com/file/d/${value}/view`;
  return value;
}
async function extendGrid(auth, edits) {
  const response = await sheets(auth).spreadsheets.get({
    spreadsheetId,
    fields:
      "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
  });
  const requests = [];
  for (const sheet of response.data.sheets || []) {
    const kind = Object.keys(SHEETS).find(
      (key) => SHEETS[key] === sheet.properties.title,
    );
    if (!kind) continue;
    const cells = edits.filter((edit) => edit.sheet === kind);
    if (!cells.length) continue;
    const neededRows = Math.max(...cells.map((edit) => edit.row));
    const neededColumns = Math.max(...cells.map((edit) => edit.column + 1));
    const properties = sheet.properties;
    if (neededRows > properties.gridProperties.rowCount)
      requests.push({
        appendDimension: {
          sheetId: properties.sheetId,
          dimension: "ROWS",
          length: neededRows - properties.gridProperties.rowCount,
        },
      });
    if (neededColumns > properties.gridProperties.columnCount)
      requests.push({
        appendDimension: {
          sheetId: properties.sheetId,
          dimension: "COLUMNS",
          length: neededColumns - properties.gridProperties.columnCount,
        },
      });
  }
  if (requests.length)
    await sheets(auth).spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
}
export function withRevisions(catalog) {
  return {
    ...catalog,
    recipes: catalog.recipes.map((r) => ({ ...r, revision: revisionOf(r) })),
  };
}
export async function saveRecipe(auth, id, input) {
  const catalog = withRevisions(await loadCatalog(auth));
  const current = catalog.recipes.find((r) => r.id === id);
  if (!current)
    throw Object.assign(new Error(`Rätten ${id} finns inte i Sheet.`), {
      status: 404,
    });
  if (input.revision !== current.revision)
    throw Object.assign(
      new Error(
        "Receptet har ändrats i Google Sheets. Ladda om sidan innan du sparar.",
      ),
      { status: 409 },
    );
  if (!input.name?.trim())
    throw Object.assign(new Error("Namn krävs."), { status: 422 });
  const dishRow = catalog.raw.dishes.rows.find((r) => r.id === id);
  const edits = [];
  setFields(
    catalog,
    "dishes",
    dishRow.rowNumber,
    {
      name: input.name,
      shortName: input.shortName,
      servings: input.servings,
      activeTime: input.activeTime,
      totalTime: input.totalTime,
      recipe: input.recipe,
      cardRecipe: input.cardRecipe,
      status: input.status,
      ...(catalog.raw.dishes.columns.tags >= 0
        ? { tags: (input.tags || []).join(", ") }
        : {}),
      imageId: imageCellValue(catalog, input.imageId || ""),
    },
    edits,
  );
  const oldLinks = catalog.raw.links.rows.filter(
    (r) => r.dishId === id && r.ingredientId,
  );
  const oldPreparations = catalog.raw.preparations.rows.filter(
    (row) => row.dishId === id && row.id,
  );
  const oldPreparationById = new Map(
    oldPreparations.map((row) => [row.id, row]),
  );
  const incomingPreparations = input.preparations;
  if (!Array.isArray(incomingPreparations))
    throw Object.assign(new Error("Förberedelser måste vara en lista."), {
      status: 422,
    });
  const seenPreparationIds = new Set();
  const preparationIds = [...catalog.raw.preparations.rows];
  let newPreparationCount = 0;
  for (const preparation of incomingPreparations) {
    const existingId = String(preparation.id || "");
    if (existingId && !oldPreparationById.has(existingId))
      throw Object.assign(
        new Error(`Förberedelsen ${existingId} tillhör inte ${id}.`),
        { status: 422 },
      );
    if (existingId && seenPreparationIds.has(existingId))
      throw Object.assign(
        new Error(`Förberedelsen ${existingId} förekommer två gånger.`),
        { status: 422 },
      );
    if (
      !preparation.instruction?.trim() ||
      !preparation.type?.trim() ||
      !preparation.timingType?.trim()
    )
      throw Object.assign(
        new Error("Förberedelser behöver typ, tidpunktstyp och instruktion."),
        { status: 422 },
      );
    const leadMinutes = Number(preparation.leadMinutes);
    if (
      !Number.isFinite(leadMinutes) ||
      leadMinutes < 0 ||
      !Number.isInteger(leadMinutes)
    )
      throw Object.assign(
        new Error("Ledtid måste vara ett heltal i minuter, minst 0."),
        { status: 422 },
      );
    for (const key of ["type", "timingType", "priority"]) {
      const options = catalog.preparationOptions[key];
      if (options.length && !options.includes(preparation[key]))
        throw Object.assign(
          new Error(`Ogiltigt värde för ${key}: ${preparation[key]}.`),
          { status: 422 },
        );
    }
    const preparationId = existingId || nextPreparationId(preparationIds);
    seenPreparationIds.add(preparationId);
    preparationIds.push({ id: preparationId });
    const rowNumber = existingId
      ? oldPreparationById.get(existingId).rowNumber
      : catalog.raw.preparations.rows.length + 2 + newPreparationCount++;
    setFields(
      catalog,
      "preparations",
      rowNumber,
      {
        id: preparationId,
        dishId: id,
        type: preparation.type,
        leadMinutes,
        timingType: preparation.timingType,
        instruction: preparation.instruction.trim(),
        condition: preparation.condition || "",
        priority: preparation.priority || "",
        active: preparation.active ? "Ja" : "Nej",
        note: preparation.note || "",
      },
      edits,
    );
  }
  for (const preparation of oldPreparations) {
    if (seenPreparationIds.has(preparation.id)) continue;
    setFields(
      catalog,
      "preparations",
      preparation.rowNumber,
      Object.fromEntries(
        Object.keys(catalog.raw.preparations.columns).map((key) => [key, ""]),
      ),
      edits,
    );
  }
  if (catalog.raw.dishes.columns.tags < 0) {
    const oldTags = catalog.raw.tags.rows.filter((r) => r.dishId === id);
    const names = [
      ...new Set((input.tags || []).map((tag) => tag.trim()).filter(Boolean)),
    ];
    for (let i = 0; i < Math.max(oldTags.length, names.length); i++) {
      const old = oldTags[i];
      const row =
        old?.rowNumber || catalog.raw.tags.rows.length + 2 + i - oldTags.length;
      setFields(
        catalog,
        "tags",
        row,
        names[i] ? { dishId: id, name: names[i] } : { dishId: "", name: "" },
        edits,
      );
    }
  }
  const newRows = [];
  const ingredientIds = [...catalog.raw.ingredients.rows];
  const lines = [];
  for (const line of input.ingredients || []) {
    let ingredientId = String(line.ingredientId || "");
    if (!ingredientId) {
      if (!line.name?.trim())
        throw Object.assign(new Error("Ny ingrediens behöver namn."), {
          status: 422,
        });
      ingredientId = nextIngredientId(ingredientIds);
      const row = catalog.raw.ingredients.rows.length + newRows.length + 2;
      setFields(
        catalog,
        "ingredients",
        row,
        {
          id: ingredientId,
          name: line.name.trim(),
          defaultUnit: line.unit,
          purchaseUnit: line.purchaseUnit,
          packageSize: line.packageSize,
          purchaseNote: line.purchaseNote,
        },
        edits,
      );
      newRows.push({ ingredientId, name: line.name.trim() });
      ingredientIds.push({ id: ingredientId });
    }
    lines.push({ ...line, ingredientId });
  }
  for (let i = 0; i < Math.max(oldLinks.length, lines.length); i++) {
    const old = oldLinks[i];
    const line = lines[i];
    if (!old && !line) continue;
    const row =
      old?.rowNumber || catalog.raw.links.rows.length + 2 + i - oldLinks.length;
    setFields(
      catalog,
      "links",
      row,
      line
        ? {
            dishId: id,
            ingredientId: line.ingredientId,
            quantity: line.quantity,
            unit: line.unit,
            required: line.required ? "Ja" : "Nej",
            note: line.note,
            scaling: line.scaling,
            rounding: line.rounding,
            purchaseUnit: line.purchaseUnit,
            packageSize: line.packageSize,
            purchaseNote: line.purchaseNote,
          }
        : { dishId: "", ingredientId: "" },
      edits,
    );
  }
  await extendGrid(auth, edits);
  await sheets(auth).spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: edits.map(({ range, values }) => ({ range, values })),
    },
  });
  return withRevisions(await loadCatalog(auth)).recipes.find(
    (r) => r.id === id,
  );
}
export async function findImageFile(auth, recipe) {
  if (!folderId) return null;
  if (recipe.imageId) {
    try {
      const fileId = driveFileId(recipe.imageId);
      if (!fileId) throw new Error("Ogiltig bildlänk.");
      const file = await drive(auth).files.get({
        fileId,
        fields: "id,mimeType,parents,trashed,modifiedTime,md5Checksum,version",
      });
      if (
        !file.data.trashed &&
        file.data.parents?.includes(folderId) &&
        file.data.mimeType?.startsWith("image/")
      )
        return file.data;
    } catch {}
    // En trasig explicit bildlänk får inte falla tillbaka till en äldre bild.
    return null;
  }
  const result = await drive(auth).files.list({
    q: `'${folderId.replaceAll("'", "\\'")}' in parents and name contains '${recipe.id.replaceAll("'", "\\'")}' and trashed = false`,
    fields:
      "files(id,name,mimeType,modifiedTime,md5Checksum,version),nextPageToken",
    pageSize: 100,
  });
  return (
    result.data.files?.find(
      (file) =>
        file.mimeType?.startsWith("image/") && file.name.startsWith(recipe.id),
    ) || null
  );
}
export async function findImage(auth, recipe) {
  return (await findImageFile(auth, recipe))?.id || null;
}
export async function imageBytes(auth, fileId) {
  const result = await drive(auth).files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(result.data);
}
export async function uploadImage(auth, recipe, file) {
  if (!folderId)
    throw Object.assign(new Error("GOOGLE_DRIVE_FOLDER_ID saknas."), {
      status: 422,
    });
  const api = drive(auth);
  const media = {
    mimeType: file.mimetype,
    body: (await import("node:stream")).Readable.from(file.buffer),
  };
  const result = await api.files.create({
    requestBody: {
      name: `${recipe.id}-${Date.now()}.${file.mimetype.split("/")[1] || "jpg"}`,
      parents: [folderId],
    },
    media,
    fields: "id",
  });
  return result.data.id;
}

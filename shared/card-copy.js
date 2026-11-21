import { cardTheme, scaledQuantity } from "./cards.js";
import { cardIngredientName, cardUnit } from "./ingredient-label.js";

function cardContent(recipe) {
  return {
    title: `${recipe.shortName || recipe.name || "Namnlös rätt"}${recipe.id ? ` · ${recipe.id}` : ""}`,
    times: [
      recipe.activeTime ? `${recipe.activeTime} min aktiv` : "",
      recipe.totalTime ? `${recipe.totalTime} min totalt` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    rows: (recipe.ingredients || []).map((line) => {
      const quantities = [4, 6, 8].map((portions) =>
        scaledQuantity(line, portions, recipe.servings),
      );
      return [
        cardIngredientName(line),
        cardUnit(line, quantities),
        ...quantities,
      ];
    }),
    instructions: String(recipe.cardRecipe || recipe.recipe || "").trim(),
  };
}

function tableCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

export function backCardMarkdown(recipe) {
  const { title, times, rows, instructions } = cardContent(recipe);
  const table = [
    "| Ingrediens | Enhet | 4 portioner | 6 portioner | 8 portioner |",
    "| --- | --- | ---: | ---: | ---: |",
    ...rows.map((row) => `| ${row.map(tableCell).join(" | ")} |`),
  ].join("\n");
  return [
    `# ${title}`,
    times,
    "## Ingredienser",
    table,
    "## Gör så här",
    instructions,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

export function backCardHtml(recipe) {
  const { title, times, rows, instructions } = cardContent(recipe);
  const colors = cardTheme(recipe).back;
  const headings = [
    "Ingrediens",
    "Enhet",
    "4 portioner",
    "6 portioner",
    "8 portioner",
  ];
  const head = headings
    .map(
      (label, index) =>
        `<th scope="col" style="border:1px solid ${colors.rule};padding:6px 8px;text-align:${index < 2 ? "left" : "right"};background:${colors.stripe};font-weight:700">${label}</th>`,
    )
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (value, index) =>
              `<td style="border:1px solid ${colors.rule};padding:6px 8px;text-align:${index < 2 ? "left" : "right"}">${escapeHtml(value)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const steps = instructions
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;color:${colors.body};font-size:14px;line-height:1.4"><h1 style="font-size:24px;font-weight:700;color:${colors.title};margin:0 0 8px">${escapeHtml(title)}</h1>${times ? `<p style="font-size:14px;color:${colors.muted};margin:0 0 16px">${escapeHtml(times)}</p>` : ""}<h2 style="font-size:17px;font-weight:700;color:${colors.heading};margin:16px 0 8px">Ingredienser</h2><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><h2 style="font-size:17px;font-weight:700;color:${colors.heading};margin:16px 0 8px">Gör så här</h2>${steps}</div>`;
}

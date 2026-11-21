import test from "node:test";
import assert from "node:assert/strict";
import { backCardHtml, backCardMarkdown } from "../shared/card-copy.js";

test("kopierad Markdown följer baksidans kortnamn, tider och portionsmängder", () => {
  const markdown = backCardMarkdown({
    id: "M007",
    name: "Tacos med tillbehör",
    shortName: "Tacos",
    activeTime: 20,
    totalTime: 25,
    servings: 4,
    ingredients: [
      {
        name: "Fläskkarré / picnicbog / fläskbog",
        quantity: 400,
        unit: "g",
        scaling: "Proportionell",
      },
      {
        name: "Salsa",
        quantity: 1,
        unit: "burk",
        scaling: "Hela enheter",
        required: false,
      },
    ],
    cardRecipe: "Stek köttet.\nServera med salsa.",
    recipe: "Det fullständiga receptet ska inte kopieras.",
  });

  assert.match(markdown, /^# Tacos · M007\n\n20 min aktiv · 25 min totalt/m);
  assert.match(markdown, /\| Fläskkarré \| g \| 400 \| 600 \| 800 \|/);
  assert.match(markdown, /\| Salsa \(valfri\) \| burk \| 1 \| 2 \| 2 \|/);
  assert.match(markdown, /## Gör så här\n\nStek köttet\.\nServera med salsa\./);
  assert.doesNotMatch(markdown, /Det fullständiga receptet/);
});

test("formaterad kopia har rubriker och riktig tabell med samma kortvärden", () => {
  const html = backCardHtml({
    id: "D001",
    type: "Dessert",
    shortName: "Kladdkaka & grädde",
    activeTime: 15,
    totalTime: 35,
    servings: 4,
    ingredients: [
      { name: "Grädde", quantity: 2, unit: "dl", scaling: "Proportionell" },
    ],
    cardRecipe: "Vispa grädden.\nServera med kakan.",
  });

  assert.match(html, /<h1 style="[^"]*font-size:24px;font-weight:700/);
  assert.match(html, /Kladdkaka &amp; grädde · D001/);
  assert.match(html, /<table\b[^>]*><thead><tr><th\b/);
  assert.match(html, /<tbody><tr><td\b[^>]*>Grädde<\/td>/);
  assert.match(html, />2<\/td><td\b[^>]*>3<\/td><td\b[^>]*>4<\/td>/);
  assert.match(html, /<h2\b[^>]*>Gör så här<\/h2>/);
  assert.match(html, /<p\b[^>]*>Vispa grädden\.<\/p>/);
});

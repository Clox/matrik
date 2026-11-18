import React, { useMemo, useState } from "react";
import {
  applyIngredientChoice,
  formatAmount,
  ingredientChoices,
  lineKey,
  replacementFor,
  scaledAmount,
  shoppingList,
} from "../shared/shopping-list.js";
import { grammaticalUnit } from "../shared/ingredient-label.js";
import { recipeType } from "../shared/recipe-type.js";
import {
  WEEK_DAYS,
  UNSCHEDULED,
  addPlanEntry,
  dayLabel,
  removePlanEntry,
  replacePlanEntry,
  updatePlanEntry,
} from "../shared/weekly-plan.js";

function selected(entry, line, index) {
  const choice = entry.choices?.[lineKey(line, index)];
  return choice?.included ?? line.required;
}

export default function WeeklyPlan({ recipes, plan, setPlan }) {
  const [recipeId, setRecipeId] = useState(recipes[0]?.id || "");
  const [day, setDay] = useState(UNSCHEDULED);
  const byId = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.id, recipe])),
    [recipes],
  );
  const list = useMemo(() => shoppingList(recipes, plan), [recipes, plan]);
  const update = (entryId, change) =>
    setPlan((current) => updatePlanEntry(current, entryId, change));
  const updateChoice = (entry, recipe, index, patch) => {
    const next = applyIngredientChoice(entry, recipe, index, patch);
    update(entry.id, { choices: next.choices });
  };
  return (
    <div className="weekly-view">
      <header className="weekly-heading">
        <div>
          <p className="eyebrow">Planera och handla</p>
          <h1>Veckoplan</h1>
          <p>
            Välj maträtter, desserter och portioner. Listan räknas direkt från
            recepten i Google Sheet.
          </p>
          <a className="weekly-jump" href="#weekly-shopping-title">
            Visa inköpslistan ↓
          </a>
        </div>
      </header>
      <div className="weekly-layout">
        <section
          className="paper weekly-meals"
          aria-labelledby="weekly-meals-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">Maträtter och desserter</p>
              <h2 id="weekly-meals-title">Din plan</h2>
            </div>
            <span className="id-tag">{plan.length} tillfällen</span>
          </div>
          <div className="weekly-add">
            <label className="field">
              <span>Lägg till recept</span>
              <select
                value={recipeId}
                onChange={(event) => setRecipeId(event.target.value)}
              >
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name} · {recipe.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Dag</span>
              <select
                value={day}
                onChange={(event) => setDay(event.target.value)}
              >
                <option value={UNSCHEDULED}>Ej schemalagt</option>
                {WEEK_DAYS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!byId.has(recipeId)}
              onClick={() =>
                setPlan((current) =>
                  addPlanEntry(current, byId.get(recipeId), day),
                )
              }
            >
              Lägg till
            </button>
          </div>
          {!plan.length && (
            <p className="weekly-empty">
              Lägg till ett eller flera recept för att skapa en inköpslista.
            </p>
          )}
          {plan.map((entry) => {
            const recipe = byId.get(entry.recipeId);
            if (!recipe) return null;
            return (
              <article
                className={`weekly-meal ${recipeType(recipe) === "Dessert" ? "weekly-dessert" : ""}`}
                key={entry.id}
              >
                <div className="weekly-meal-head">
                  <div>
                    <strong>{recipe.name}</strong>
                    <span>
                      {recipe.id} · {recipeType(recipe)} · {dayLabel(entry.day)}
                    </span>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      setPlan((current) => removePlanEntry(current, entry.id))
                    }
                    aria-label={`Ta bort förekomsten av ${recipe.name}`}
                  >
                    Ta bort
                  </button>
                </div>
                <div className="weekly-entry-fields">
                  <label className="field">
                    <span>Flytta till dag</span>
                    <select
                      value={entry.day || UNSCHEDULED}
                      onChange={(event) =>
                        update(entry.id, { day: event.target.value })
                      }
                    >
                      <option value={UNSCHEDULED}>Ej schemalagt</option>
                      {WEEK_DAYS.map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Byt recept</span>
                    <select
                      value={entry.recipeId}
                      onChange={(event) =>
                        setPlan((current) =>
                          replacePlanEntry(
                            current,
                            entry.id,
                            byId.get(event.target.value),
                          ),
                        )
                      }
                    >
                      {recipes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field weekly-servings">
                  <span>Portioner</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={entry.servings}
                    onChange={(event) =>
                      update(entry.id, { servings: event.target.value })
                    }
                    onBlur={() => {
                      const n = Number(entry.servings);
                      if (!Number.isInteger(n) || n < 1 || n > 100)
                        update(entry.id, { servings: recipe.servings || 4 });
                    }}
                  />
                </label>
                <details className="weekly-choices">
                  <summary>
                    Ingredienser och val{" "}
                    <span>{recipe.ingredients.length} rader</span>
                  </summary>
                  <div className="weekly-ingredient-list">
                    {recipe.ingredients.map((line, index) => {
                      const key = lineKey(line, index),
                        options = ingredientChoices(line),
                        choice = entry.choices?.[key],
                        included = selected(entry, line, index);
                      const canToggle =
                        !line.required ||
                        recipe.ingredients.some(
                          (other) =>
                            replacementFor(recipe, other) === line.ingredientId,
                        );
                      return (
                        <div className="weekly-ingredient" key={key}>
                          <label className="weekly-ingredient-main">
                            <input
                              type="checkbox"
                              checked={Boolean(included)}
                              disabled={!canToggle}
                              onChange={(event) =>
                                updateChoice(entry, recipe, index, {
                                  included: event.target.checked,
                                })
                              }
                            />
                            <span>
                              <strong>{line.name}</strong>
                              <small>
                                {formatAmount(
                                  scaledAmount(
                                    line,
                                    Number(entry.servings),
                                    recipe.servings,
                                  ),
                                )}{" "}
                                {grammaticalUnit(
                                  line.unit,
                                  scaledAmount(
                                    line,
                                    Number(entry.servings),
                                    recipe.servings,
                                  ),
                                )}
                                {!line.required ? " · valfri" : ""}
                              </small>
                            </span>
                          </label>
                          {options.length > 1 && (
                            <label className="weekly-option">
                              <span>Välj vara</span>
                              <select
                                value={
                                  options.includes(choice?.name)
                                    ? choice.name
                                    : options[0]
                                }
                                disabled={!included}
                                onChange={(event) =>
                                  updateChoice(entry, recipe, index, {
                                    name: event.target.value,
                                  })
                                }
                              >
                                {options.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {line.purchaseNote && (
                            <small className="weekly-hint">
                              {line.purchaseNote}
                            </small>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              </article>
            );
          })}
        </section>
        <section
          className="paper weekly-shopping"
          aria-labelledby="weekly-shopping-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">Sammanställt</p>
              <h2 id="weekly-shopping-title">Inköpslista</h2>
            </div>
            <span className="id-tag">{list.length} varor</span>
          </div>
          {!list.length && (
            <p className="weekly-empty">
              Listan visas när du lägger till ett recept.
            </p>
          )}
          <div className="weekly-shopping-list">
            {list.map((item) => (
              <article className="weekly-shopping-item" key={item.key}>
                <div className="weekly-shopping-top">
                  <strong>{item.name}</strong>
                  <b>
                    {formatAmount(item.amount)}{" "}
                    {grammaticalUnit(item.unit, item.amount)}
                  </b>
                </div>
                {item.packages && (
                  <p className="weekly-packages">
                    Köp minst {item.packages.count} förpackning
                    {item.packages.count === 1 ? "" : "ar"} à{" "}
                    {item.packages.size}.
                  </p>
                )}
                {item.purchaseUnits.length > 0 && !item.packages && (
                  <p className="weekly-packages">
                    Inköpsenhet: {item.purchaseUnits.join(" / ")}
                    {item.family !==
                    `unit:${item.purchaseUnits[0]?.toLowerCase()}`
                      ? " · förpackningsstorlek saknas"
                      : ""}
                  </p>
                )}
                <p className="weekly-sources">
                  {item.sources.map((source, index) => (
                    <span key={index}>
                      {source.recipeName} · {dayLabel(source.day)} (
                      {formatAmount(source.amount)}{" "}
                      {grammaticalUnit(source.unit, source.amount)})
                      {index < item.sources.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </p>
                {item.notes.length > 0 && (
                  <p className="weekly-hint">{item.notes.join(" · ")}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

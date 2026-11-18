import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { FRONT_STYLES, renderCard, validateCard } from "../shared/cards.js";
import { ingredientDisplayName } from "../shared/ingredient-label.js";
import {
  DEFAULT_PRINT_PROFILE,
  PRINT_PROFILES,
  printProfileErrors,
  resolvePrintProfile,
} from "../shared/print-profile.js";
import { previewPng, printLinesUrl } from "./preview-image.js";
import WeeklyPlan from "./WeeklyPlan.jsx";
import { normalizeWeekPlan } from "../shared/weekly-plan.js";
import { filterRecipes, recipeType } from "../shared/recipe-type.js";
import "./style.css";

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Fel ${response.status}`);
  return data;
}
function fileName(response) {
  return (
    response.headers
      .get("content-disposition")
      ?.match(/filename="([^"]+)"/)?.[1] || "matrik-export"
  );
}
async function download(url, recipe, csrf, frontStyle, printProfile) {
  const { imageDataUrl, ...payload } = recipe;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-matrik-csrf": csrf },
    body: JSON.stringify({ ...payload, frontStyle, printProfile }),
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).error ||
        "Exporten misslyckades.",
    );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = fileName(response);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function useCardImageUrls(cards) {
  const urls = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(cards).map(([side, svg]) => [
          side,
          URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
        ]),
      ),
    [cards],
  );
  useEffect(() => {
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [urls]);
  return urls;
}
function CardPreviewImage({
  src,
  alt,
  profile,
  showBleed,
  showPrintLines,
  enlarged = false,
}) {
  const bleed = profile.bleedMm;
  const imageStyle = showBleed
    ? undefined
    : {
        width: `${(profile.widthMm / profile.trimWidthMm) * 100}%`,
        height: `${(profile.heightMm / profile.trimHeightMm) * 100}%`,
        left: `${(-bleed / profile.trimWidthMm) * 100}%`,
        top: `${(-bleed / profile.trimHeightMm) * 100}%`,
      };
  const surfaceStyle = showBleed
    ? undefined
    : {
        inset: `${(bleed / profile.heightMm) * 100}% ${(bleed / profile.widthMm) * 100}%`,
      };
  return (
    <span
      className={`card-preview-frame${enlarged ? " card-dialog-image" : ""}`}
      style={{ aspectRatio: `${profile.widthPx} / ${profile.heightPx}` }}
    >
      <span className="card-preview-surface" style={surfaceStyle}>
        <img src={src} alt={alt} style={imageStyle} />
        {showPrintLines && (
          <img
            className="print-lines-overlay"
            src={printLinesUrl(profile, showBleed)}
            alt=""
            aria-hidden="true"
          />
        )}
      </span>
    </span>
  );
}
function Preview({ recipe, frontStyle, printProfile }) {
  const profile = useMemo(
    () => resolvePrintProfile(printProfile),
    [printProfile],
  );
  const issues = useMemo(
    () => validateCard(recipe, printProfile),
    [recipe, printProfile],
  );
  const cards = useMemo(
    () => ({
      front: renderCard(recipe, "front", { frontStyle, printProfile }),
      back: renderCard(recipe, "back", { printProfile }),
    }),
    [recipe, frontStyle, printProfile],
  );
  const cardUrls = useCardImageUrls(cards);
  const [expandedSide, setExpandedSide] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [showBleed, setShowBleed] = useState(false);
  const [showPrintLines, setShowPrintLines] = useState(false);
  const saveCard = async () => {
    try {
      const url = URL.createObjectURL(
        await previewPng(
          cardUrls[expandedSide],
          profile,
          showBleed,
          showPrintLines,
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${recipe.id}-${expandedSide}-preview.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCopyMessage("PNG-bilden har sparats.");
    } catch (error) {
      setCopyMessage(`Kunde inte spara bilden: ${error.message}`);
    }
  };
  const copyCard = async () => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setCopyMessage(
        "Bildkopiering stöds inte i den här webbläsaren. Använd PNG-knappen under Tryckfiler.",
      );
      return;
    }
    try {
      const png = previewPng(
        cardUrls[expandedSide],
        profile,
        showBleed,
        showPrintLines,
      );
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      setCopyMessage("Kortbilden har kopierats som PNG.");
    } catch (error) {
      setCopyMessage(`Kunde inte kopiera bilden: ${error.message}`);
    }
  };
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    if (!expandedSide) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setExpandedSide(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus?.();
    };
  }, [Boolean(expandedSide)]);
  const dialogKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const buttons = [...dialogRef.current.querySelectorAll("button")];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="preview-panel">
      <div className="preview-heading">
        <div>
          <p className="eyebrow">Live-preview</p>
          <h2>Kortet som det trycks</h2>
        </div>
        <div className="preview-controls">
          <span className="format">
            {profile.trimWidthMm} × {profile.trimHeightMm} mm +{" "}
            {profile.bleedMm} mm utfall
          </span>
          <label className="trim-toggle">
            <input
              type="checkbox"
              checked={showBleed}
              onChange={(event) => setShowBleed(event.target.checked)}
            />
            Visa bleed
          </label>
          <label className="trim-toggle">
            <input
              type="checkbox"
              checked={showPrintLines}
              onChange={(event) => setShowPrintLines(event.target.checked)}
            />
            Visa trycklinjer
          </label>
          <span
            className="print-zone-key"
            style={{ visibility: showPrintLines ? "visible" : "hidden" }}
            aria-hidden={!showPrintLines}
          >
            Streck: trim · Prickar: safe area
          </span>
        </div>
      </div>
      <div className="cards">
        <div>
          <button
            type="button"
            className="card-trigger"
            aria-label="Visa framsidan större"
            onClick={() => setExpandedSide("front")}
          >
            <CardPreviewImage
              src={cardUrls.front}
              alt="Kortets framsida"
              profile={profile}
              showBleed={showBleed}
              showPrintLines={showPrintLines}
            />
          </button>
          <p>Framsida</p>
        </div>
        <div>
          <button
            type="button"
            className="card-trigger"
            aria-label="Visa baksidan större"
            onClick={() => setExpandedSide("back")}
          >
            <CardPreviewImage
              src={cardUrls.back}
              alt="Kortets baksida"
              profile={profile}
              showBleed={showBleed}
              showPrintLines={showPrintLines}
            />
          </button>
          <p>Baksida · 4 / 6 / 8 portioner</p>
        </div>
      </div>
      {expandedSide &&
        createPortal(
          <div
            className="card-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setExpandedSide(null);
            }}
          >
            <div
              className="card-dialog"
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="card-dialog-title"
              onKeyDown={dialogKeyDown}
            >
              <div className="card-dialog-header">
                <div>
                  <p className="eyebrow">Live-preview · {recipe.id}</p>
                  <h2 id="card-dialog-title">
                    {expandedSide === "front" ? "Framsida" : "Baksida"}
                  </h2>
                </div>
                <button
                  type="button"
                  className="card-dialog-close"
                  ref={closeRef}
                  aria-label="Stäng förstoringen"
                  onClick={() => setExpandedSide(null)}
                >
                  ×
                </button>
              </div>
              <div className="card-dialog-switch" aria-label="Välj kortsida">
                <button
                  type="button"
                  className={expandedSide === "front" ? "selected" : ""}
                  aria-pressed={expandedSide === "front"}
                  onClick={() => {
                    setExpandedSide("front");
                    setCopyMessage("");
                  }}
                >
                  Framsida
                </button>
                <button
                  type="button"
                  className={expandedSide === "back" ? "selected" : ""}
                  aria-pressed={expandedSide === "back"}
                  onClick={() => {
                    setExpandedSide("back");
                    setCopyMessage("");
                  }}
                >
                  Baksida
                </button>
              </div>
              <label className="trim-toggle">
                <input
                  type="checkbox"
                  checked={showBleed}
                  onChange={(event) => setShowBleed(event.target.checked)}
                />
                Visa bleed
              </label>
              <label className="trim-toggle">
                <input
                  type="checkbox"
                  checked={showPrintLines}
                  onChange={(event) => setShowPrintLines(event.target.checked)}
                />
                Visa trycklinjer
              </label>
              <span
                className="print-zone-key"
                style={{ visibility: showPrintLines ? "visible" : "hidden" }}
                aria-hidden={!showPrintLines}
              >
                Streck: trim · Prickar: safe area
              </span>
              <CardPreviewImage
                src={cardUrls[expandedSide]}
                alt={`Kortets ${expandedSide === "front" ? "framsida" : "baksida"}`}
                profile={profile}
                showBleed={showBleed}
                showPrintLines={showPrintLines}
                enlarged
              />
              <div className="card-image-actions">
                <button type="button" onClick={saveCard}>
                  Spara bild som PNG
                </button>
                <button type="button" onClick={copyCard}>
                  Kopiera bild som PNG
                </button>
              </div>
              <p className="print-zone-key">
                Preview-PNG följer valen ovan. Tryckfiler innehåller alltid
                bleed men inga trycklinjer.
              </p>
              {copyMessage && (
                <p className="card-copy-message" role="status">
                  {copyMessage}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
      <div className="validation">
        <strong>Layoutkontroll</strong>
        {issues.length ? (
          issues.map((issue, i) => (
            <p key={i} className={issue.level}>
              {issue.level === "error" ? "●" : "◐"} {issue.message}
            </p>
          ))
        ) : (
          <p className="ok">● Kortet ryms i mallen.</p>
        )}
      </div>
    </div>
  );
}
function Settings({
  frontStyle,
  onFrontStyleChange,
  printProfile,
  onPrintProfileChange,
  recipe,
  onBack,
  backLabel,
}) {
  const [loadedImage, setLoadedImage] = useState(null);
  const activeProfile = resolvePrintProfile(printProfile);
  const [profileDraft, setProfileDraft] = useState(printProfile);
  const [profileError, setProfileError] = useState("");
  useEffect(() => setProfileDraft(printProfile), [printProfile]);
  const setProfileField = (key, value) => {
    setProfileError("");
    setProfileDraft((current) => ({
      ...current,
      id: "custom",
      name:
        key === "name"
          ? value
          : current.id === DEFAULT_PRINT_PROFILE.id
            ? "Egen profil"
            : current.name,
      [key]: value,
    }));
  };
  const applyProfile = () => {
    const errors = printProfileErrors(profileDraft);
    if (errors.length) {
      setProfileError(errors.join(" "));
      return;
    }
    onPrintProfileChange({
      id: profileDraft.id,
      name: String(profileDraft.name).trim(),
      trimWidthMm: Number(profileDraft.trimWidthMm),
      trimHeightMm: Number(profileDraft.trimHeightMm),
      bleedMm: Number(profileDraft.bleedMm),
      safeMm: Number(profileDraft.safeMm),
      dpi: Number(profileDraft.dpi),
      exportWidthPx: Number(profileDraft.exportWidthPx),
      exportHeightPx: Number(profileDraft.exportHeightPx),
    });
    setProfileError("");
  };
  const recipeId = recipe?.id;
  const hasImage = Boolean(recipe?.imageDataUrl);
  useEffect(() => {
    if (!recipeId || hasImage) return;
    let active = true;
    fetch(`/api/recipes/${encodeURIComponent(recipeId)}/image`)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => blob && toDataUrl(blob))
      .then((dataUrl) => {
        if (active && dataUrl) setLoadedImage({ recipeId, dataUrl });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [recipeId, hasImage]);
  const cardRecipe =
    recipe && !hasImage && loadedImage?.recipeId === recipeId
      ? { ...recipe, imageDataUrl: loadedImage.dataUrl }
      : recipe;
  const fronts = useMemo(
    () =>
      cardRecipe
        ? Object.fromEntries(
            FRONT_STYLES.map((style) => [
              style.id,
              renderCard(cardRecipe, "front", {
                frontStyle: style.id,
                printProfile,
              }),
            ]),
          )
        : {},
    [cardRecipe, printProfile],
  );
  return (
    <div className="settings-view">
      <div className="settings-heading">
        <div>
          <p className="eyebrow">Matrik</p>
          <h1>Inställningar</h1>
        </div>
        <button type="button" className="secondary" onClick={onBack}>
          {backLabel}
        </button>
      </div>
      <section
        className="paper settings-card"
        aria-labelledby="front-style-heading"
      >
        <p className="eyebrow">Kortdesign</p>
        <h2 id="front-style-heading">Framsidans utseende</h2>
        <p>
          Gäller alla rätter och används både i förhandsvisningen och i PNG- och
          PDF-exporten. Valet sparas i den här webbläsaren.
        </p>
        <div
          className="front-compare-options"
          role="group"
          aria-label="Välj framsidesvariant"
        >
          {FRONT_STYLES.map((style) => (
            <button
              type="button"
              className={`front-compare-option ${frontStyle === style.id ? "selected" : ""}`}
              key={style.id}
              aria-pressed={frontStyle === style.id}
              onClick={() => onFrontStyleChange(style.id)}
            >
              {fronts[style.id] && (
                <span
                  className="front-compare-thumb"
                  style={{
                    aspectRatio: `${activeProfile.widthPx} / ${activeProfile.heightPx}`,
                  }}
                  dangerouslySetInnerHTML={{ __html: fronts[style.id] }}
                />
              )}
              <strong>{style.label}</strong>
              <small>{style.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section
        className="paper settings-card"
        aria-labelledby="print-profile-heading"
      >
        <p className="eyebrow">Tryck</p>
        <h2 id="print-profile-heading">Tryckprofil</h2>
        <p>
          Profilen gäller alla kort och används i förhandsvisning, sparade
          bilder, PNG och PDF. Ändrade standardmått sparas som Egen profil i den
          här webbläsaren.
        </p>
        <div className="profile-fields">
          <label>
            Profil
            <select
              value={
                profileDraft.id === DEFAULT_PRINT_PROFILE.id
                  ? DEFAULT_PRINT_PROFILE.id
                  : "custom"
              }
              onChange={(event) => {
                setProfileError("");
                setProfileDraft(
                  event.target.value === DEFAULT_PRINT_PROFILE.id
                    ? { ...DEFAULT_PRINT_PROFILE }
                    : { ...profileDraft, id: "custom", name: "Egen profil" },
                );
              }}
            >
              {PRINT_PROFILES.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
              <option value="custom">Egen profil</option>
            </select>
          </label>
          <label>
            Profilnamn
            <input
              value={profileDraft.name}
              onChange={(event) => setProfileField("name", event.target.value)}
            />
          </label>
          {[
            ["trimWidthMm", "Trim width (mm)", "0.001"],
            ["trimHeightMm", "Trim height (mm)", "0.001"],
            ["bleedMm", "Bleed per sida (mm)", "0.001"],
            ["safeMm", "Safe area innanför trim (mm)", "0.001"],
            ["dpi", "DPI", "1"],
            ["exportWidthPx", "Export width (px)", "1"],
            ["exportHeightPx", "Export height (px)", "1"],
          ].map(([key, label, step]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                step={step}
                value={profileDraft[key]}
                onChange={(event) => setProfileField(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="profile-note">
          MakePlayingCards kräver minst 822 × 1122 px vid 300 DPI. Även egna
          profiler måste ha minst så många pixlar som deras fysiska mått och DPI
          kräver.
        </p>
        {profileError && (
          <p className="profile-error" role="alert">
            {profileError}
          </p>
        )}
        <button type="button" className="primary" onClick={applyProfile}>
          Använd tryckprofil
        </button>
      </section>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
  rows = 4,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={rows}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
const blankLine = {
  ingredientId: "",
  name: "",
  quantity: "",
  unit: "",
  required: true,
  note: "",
  scaling: "Proportionell",
  rounding: "",
  purchaseUnit: "",
  packageSize: "",
  purchaseNote: "",
};
function IngredientEditor({ lines, options, update }) {
  const change = (index, key, value) =>
    update(
      lines.map((line, i) => (i === index ? { ...line, [key]: value } : line)),
    );
  return (
    <section className="ingredients">
      <div className="section-head">
        <div>
          <p className="eyebrow">Relationer i Sheet</p>
          <h3>Ingredienser</h3>
        </div>
        <button
          className="secondary"
          onClick={() => update([...lines, { ...blankLine }])}
        >
          + Lägg till
        </button>
      </div>
      {lines.map((line, i) => (
        <div className="ingredient" key={`${line.ingredientId}-${i}`}>
          <div className="ingredient-top">
            <span className="number">{String(i + 1).padStart(2, "0")}</span>
            <select
              aria-label="Välj ingrediens"
              value={line.ingredientId || ""}
              onChange={(e) => {
                const option = options.find((x) => x.id === e.target.value);
                update(
                  lines.map((item, n) =>
                    n === i
                      ? {
                          ...item,
                          ingredientId: option?.id || "",
                          name: option?.name || "",
                          unit: item.unit || option?.defaultUnit || "",
                        }
                      : item,
                  ),
                );
              }}
            >
              <option value="">Ny ingrediens…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Ingrediensnamn"
              placeholder="Namn på ny ingrediens"
              value={line.name}
              onChange={(e) => change(i, "name", e.target.value)}
              disabled={Boolean(line.ingredientId)}
            />
            <button
              className="icon"
              title="Ta bort"
              onClick={() => update(lines.filter((_, n) => n !== i))}
            >
              ×
            </button>
          </div>
          {ingredientDisplayName(line) !== line.name && (
            <p className="ingredient-display-name">
              {ingredientDisplayName(line)}
            </p>
          )}
          <div className="ingredient-fields">
            <Field
              label="Basmängd"
              value={line.quantity}
              onChange={(v) => change(i, "quantity", v)}
            />
            <Field
              label="Enhet"
              value={line.unit}
              onChange={(v) => change(i, "unit", v)}
            />
            <label className="field">
              <span>Skalning</span>
              <select
                value={line.scaling}
                onChange={(e) => change(i, "scaling", e.target.value)}
              >
                {[
                  "Proportionell",
                  "Hela enheter",
                  "Fast",
                  "Personspecifik",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <Field
              label="Avrundning"
              value={line.rounding}
              onChange={(v) => change(i, "rounding", v)}
            />
            <Field
              label="Förberedelse / anmärkning"
              value={line.note}
              onChange={(v) => change(i, "note", v)}
            />
            <Field
              label="Inköpsenhet"
              value={line.purchaseUnit}
              onChange={(v) => change(i, "purchaseUnit", v)}
            />
            <Field
              label="Förpackningsstorlek"
              value={line.packageSize}
              onChange={(v) => change(i, "packageSize", v)}
            />
            <Field
              label="Inköpsnotering"
              value={line.purchaseNote}
              onChange={(v) => change(i, "purchaseNote", v)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(line.required)}
                onChange={(e) => change(i, "required", e.target.checked)}
              />{" "}
              Obligatorisk
            </label>
          </div>
        </div>
      ))}
    </section>
  );
}
function PreparationEditor({ preparations, options, hasPreparations, update }) {
  const change = (index, key, value) =>
    update(
      preparations.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  const add = () =>
    update([
      ...preparations,
      {
        id: "",
        type: options.type?.[0] || "",
        leadMinutes: 0,
        timingType: options.timingType?.[0] || "",
        instruction: "",
        condition: "",
        priority: options.priority?.[0] || "",
        active: true,
        note: "",
      },
    ]);
  const select = (index, key, label) => {
    const values = [
      ...new Set(
        [preparations[index][key], ...(options[key] || [])].filter(Boolean),
      ),
    ];
    return (
      <label className="field">
        <span>{label}</span>
        <select
          value={preparations[index][key] || ""}
          onChange={(event) => change(index, key, event.target.value)}
        >
          {!values.length && <option value="">Inga val i Sheet</option>}
          {values.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <section className="preparations">
      <div className="section-head">
        <div>
          <p className="eyebrow">Rätt-förberedelser i Sheet</p>
          <h3>Förberedelser</h3>
        </div>
        <button className="secondary" onClick={add}>
          + Lägg till
        </button>
      </div>
      <p className="sheet-indicator">
        Har förberedelser i Sheet:{" "}
        <strong>{hasPreparations ? "Ja" : "Nej"}</strong> · beräknas av Sheet
        efter sparning
      </p>
      {!preparations.length && (
        <p className="empty-preparations">
          Inga förberedelser för den här rätten.
        </p>
      )}
      {preparations.map((preparation, i) => (
        <div className="preparation" key={preparation.id || `new-${i}`}>
          <div className="preparation-head">
            <span className="number">{preparation.id || `Ny ${i + 1}`}</span>
            <button
              className="icon"
              title="Ta bort förberedelse"
              aria-label="Ta bort förberedelse"
              onClick={() => update(preparations.filter((_, n) => n !== i))}
            >
              ×
            </button>
          </div>
          <div className="preparation-fields">
            {select(i, "type", "Typ")}
            {select(i, "timingType", "Tidpunktstyp")}
            <label className="field">
              <span>Ledtid (min)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={preparation.leadMinutes ?? ""}
                onChange={(event) =>
                  change(i, "leadMinutes", event.target.value)
                }
              />
            </label>
            {select(i, "priority", "Prioritet")}
            <div className="preparation-wide">
              <Field
                label="Instruktion"
                value={preparation.instruction}
                onChange={(value) => change(i, "instruction", value)}
                multiline
                rows={3}
              />
            </div>
            <Field
              label="Villkor"
              value={preparation.condition}
              onChange={(value) => change(i, "condition", value)}
            />
            <Field
              label="Anteckning"
              value={preparation.note}
              onChange={(value) => change(i, "note", value)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(preparation.active)}
                onChange={(event) => change(i, "active", event.target.checked)}
              />{" "}
              Aktiv
            </label>
          </div>
        </div>
      ))}
    </section>
  );
}
function App() {
  const [status, setStatus] = useState(null),
    [statusError, setStatusError] = useState(null),
    [catalogRequest, setCatalogRequest] = useState({
      phase: "loading",
      data: null,
      error: null,
    }),
    [selected, setSelected] = useState(null),
    [draft, setDraft] = useState(null),
    [preview, setPreview] = useState(null),
    [search, setSearch] = useState(""),
    [recipeTypeFilter, setRecipeTypeFilter] = useState("Maträtt"),
    [tagFilter, setTagFilter] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [imageRefresh, setImageRefresh] = useState({}),
    [showSettings, setShowSettings] = useState(false),
    [showWeekPlan, setShowWeekPlan] = useState(false),
    [weekPlan, setWeekPlan] = useState(() => {
      try {
        const saved = JSON.parse(
          localStorage.getItem("matrik.weekPlan") || "[]",
        );
        return normalizeWeekPlan(saved);
      } catch {
        return [];
      }
    });
  const catalog = catalogRequest.data;
  const [frontStyle, setFrontStyle] = useState(() => {
    try {
      const saved = localStorage.getItem("matrik.settings.frontStyle");
      return FRONT_STYLES.some((style) => style.id === saved) ? saved : "panel";
    } catch {
      return "panel";
    }
  });
  const [printProfile, setPrintProfile] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("matrik.settings.printProfile"),
      );
      return printProfileErrors(saved).length ? DEFAULT_PRINT_PROFILE : saved;
    } catch {
      return DEFAULT_PRINT_PROFILE;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("matrik.settings.frontStyle", frontStyle);
    } catch {}
  }, [frontStyle]);
  useEffect(() => {
    try {
      localStorage.setItem("matrik.weekPlan", JSON.stringify(weekPlan));
    } catch {}
  }, [weekPlan]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "matrik.settings.printProfile",
        JSON.stringify(printProfile),
      );
    } catch {}
  }, [printProfile]);
  const load = async () => {
    setStatusError(null);
    setCatalogRequest((current) => ({
      ...current,
      phase: "loading",
      error: null,
    }));
    let state;
    try {
      state = await json("/api/status");
      setStatus(state);
    } catch (error) {
      setStatusError(error.message);
      return;
    }
    if (!state.configured || !state.authenticated) {
      setCatalogRequest({ phase: "success", data: null, error: null });
      return;
    }
    try {
      const data = await json("/api/catalog");
      if (!Array.isArray(data.recipes))
        throw new Error("Receptregistret gav ett ogiltigt svar.");
      setCatalogRequest({ phase: "success", data, error: null });
    } catch (error) {
      setCatalogRequest({ phase: "error", data: null, error: error.message });
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!selected || !catalog) return;
    const recipe = catalog.recipes.find((x) => x.id === selected);
    if (!recipe) return;
    setDraft(structuredClone(recipe));
    setPreview(structuredClone(recipe));
    let live = true;
    fetch(`/api/recipes/${encodeURIComponent(selected)}/image`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => blob && toDataUrl(blob))
      .then((data) => {
        if (live && data) {
          setDraft((d) =>
            d?.id === selected ? { ...d, imageDataUrl: data } : d,
          );
          setPreview((d) =>
            d?.id === selected ? { ...d, imageDataUrl: data } : d,
          );
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [selected, catalog]);
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => setPreview(structuredClone(draft)), 600);
    return () => clearTimeout(timer);
  }, [draft]);
  const typedRecipes = filterRecipes(catalog?.recipes || [], recipeTypeFilter);
  const allTags = [...new Set(typedRecipes.flatMap((r) => r.tags))].sort();
  const recipes = typedRecipes.filter(
    (r) =>
      `${r.id} ${r.name} ${r.shortName}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!tagFilter || r.tags.includes(tagFilter)),
  );
  const edit = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const selectRecipe = (id) => {
    setMessage("");
    setSelected(id);
    setShowSettings(false);
    setShowWeekPlan(false);
  };
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const { imageDataUrl, ...payload } = draft;
      await json(`/api/recipes/${draft.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-matrik-csrf": status.csrf,
        },
        body: JSON.stringify(payload),
      });
      const updatedCatalog = await json("/api/catalog");
      setCatalogRequest({
        phase: "success",
        data: updatedCatalog,
        error: null,
      });
      setImageRefresh((current) => ({
        ...current,
        [draft.id]: (current[draft.id] || 0) + 1,
      }));
      setMessage("Sparat i Google Sheets.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };
  const upload = async (file) => {
    if (!file) return;
    setMessage("Laddar upp bilden till Google Drive…");
    try {
      const form = new FormData();
      form.append("image", file);
      const result = await json(`/api/recipes/${draft.id}/image`, {
        method: "POST",
        headers: { "x-matrik-csrf": status.csrf },
        body: form,
      });
      const data = await toDataUrl(file);
      setDraft((d) => ({ ...d, imageId: result.imageId, imageDataUrl: data }));
      setImageRefresh((current) => ({
        ...current,
        [draft.id]: (current[draft.id] || 0) + 1,
      }));
      setMessage(
        "Bilden finns i Drive. Spara receptet för att koppla bilden till raden i Sheet.",
      );
    } catch (error) {
      setMessage(error.message);
    }
  };
  const exportFile = async (target) => {
    setMessage("");
    try {
      await download(target, draft, status.csrf, frontStyle, printProfile);
    } catch (error) {
      setMessage(error.message);
    }
  };
  if (statusError)
    return (
      <main className="welcome">
        <h1>Kunde inte ansluta till Matrik</h1>
        <div className="notice" role="alert">
          {statusError}
        </div>
        <button className="secondary" onClick={load}>
          Försök igen
        </button>
      </main>
    );
  if (!status)
    return (
      <main className="loading" role="status">
        Hämtar recept…
      </main>
    );
  if (!status.configured || !status.authenticated)
    return (
      <div className="welcome">
        <div className="brand">
          <img src="/brand-mark.svg" alt="" />
        </div>
        <p className="eyebrow">Familjens receptregister</p>
        <h1>Matrik</h1>
        <p>
          Samla recepten från Google Sheets och skapa färdiga matkort direkt i
          webbläsaren.
        </p>
        {!status.configured ? (
          <div className="notice">
            Google OAuth saknar lokal konfiguration. Följ stegen i README och
            starta sedan om appen.
          </div>
        ) : (
          <a className="primary" href="/auth/login">
            Logga in med Google →
          </a>
        )}
        {message && <div className="notice">{message}</div>}
      </div>
    );
  if (catalogRequest.phase === "loading")
    return (
      <main className="loading" role="status">
        Hämtar recept…
      </main>
    );
  if (catalogRequest.phase === "error")
    return (
      <main className="welcome">
        <h1>Kunde inte läsa receptregistret</h1>
        <div className="notice" role="alert">
          {catalogRequest.error}
        </div>
        <button className="secondary" onClick={load}>
          Försök igen
        </button>{" "}
        <a className="primary" href="/auth/login">
          Logga in igen
        </a>
      </main>
    );
  return (
    <div className={`app ${showWeekPlan ? "week-open" : ""}`}>
      <aside className="sidebar">
        <div className="logo" aria-label="Matrik">
          <img src="/brand-mark.svg" alt="" />
          <span aria-hidden="true">atrik</span>
        </div>
        <div className="list-header">
          <p className="eyebrow">Receptregister</p>
          <h2>
            {recipeTypeFilter === "Maträtt"
              ? "Maträtter"
              : recipeTypeFilter === "Dessert"
                ? "Desserter"
                : "Recept"}{" "}
            <em>{recipes.length}</em>
          </h2>
        </div>
        <input
          className="search"
          placeholder="Sök namn eller M-kod…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="type-filter"
          aria-label="Filtrera recepttyp"
          value={recipeTypeFilter}
          onChange={(event) => {
            setRecipeTypeFilter(event.target.value);
            setTagFilter("");
          }}
        >
          <option value="Maträtt">Maträtter</option>
          <option value="Dessert">Desserter</option>
          <option value="Alla">Alla recept</option>
        </select>
        <select
          className="tag-filter"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        >
          <option value="">Alla taggar</option>
          {allTags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <div className="recipe-list">
          {!recipes.length && (
            <p className="recipe-list-empty">
              {recipeTypeFilter === "Dessert"
                ? "Inga desserter importerade ännu."
                : "Inga recept matchar filtret."}
            </p>
          )}
          {recipes.map((r) => (
            <button
              key={r.id}
              className={`recipe-item ${selected === r.id && !showSettings && !showWeekPlan ? "active" : ""}`}
              onClick={() => selectRecipe(r.id)}
            >
              <div className="thumb">
                {r.id.slice(-2)}
                <img
                  src={
                    r.id === draft?.id && draft.imageDataUrl
                      ? draft.imageDataUrl
                      : `/api/recipes/${encodeURIComponent(r.id)}/image?v=${imageRefresh[r.id] || 0}`
                  }
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <div>
                <strong>{r.name}</strong>
                <span>
                  {r.id} · {recipeType(r)} · {r.status || "Ingen status"}
                </span>
              </div>
              <b>›</b>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          {showWeekPlan && (
            <button
              className="settings-link"
              onClick={() => setShowWeekPlan(false)}
            >
              ← Till recepten
            </button>
          )}
          <button
            className={`settings-link ${showWeekPlan ? "active" : ""}`}
            aria-current={showWeekPlan ? "page" : undefined}
            onClick={() => {
              setShowWeekPlan(true);
              setShowSettings(false);
            }}
          >
            ☷ Veckoplan{" "}
            <span className="sidebar-count">{weekPlan.length}</span>
          </button>
          <button
            className={`settings-link ${showSettings && !showWeekPlan ? "active" : ""}`}
            aria-current={showSettings ? "page" : undefined}
            onClick={() => {
              setShowSettings(true);
              setShowWeekPlan(false);
            }}
          >
            ⚙ Inställningar
          </button>
          <div className="sidebar-footer-actions">
            <button onClick={load}>↻ Synka från Google</button>
            <button
              onClick={async () => {
                await json("/auth/logout", {
                  method: "POST",
                  headers: { "x-matrik-csrf": status.csrf },
                });
                location.reload();
              }}
            >
              Logga ut
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        {showWeekPlan ? (
          <WeeklyPlan
            recipes={catalog.recipes}
            plan={weekPlan}
            setPlan={setWeekPlan}
          />
        ) : showSettings ? (
          <Settings
            frontStyle={frontStyle}
            onFrontStyleChange={setFrontStyle}
            printProfile={printProfile}
            onPrintProfileChange={setPrintProfile}
            recipe={
              preview ||
              draft ||
              catalog.recipes.find((x) => x.id === "M007") ||
              catalog.recipes[0]
            }
            onBack={() => setShowSettings(false)}
            backLabel={draft ? "Tillbaka till rätten" : "Till recepten"}
          />
        ) : !draft ? (
          <div className="empty">
            <p className="eyebrow">Välkommen tillbaka</p>
            <h1>
              {recipeTypeFilter === "Dessert"
                ? "Inga desserter ännu"
                : "Välj ett recept"}
            </h1>
            <p>
              {recipeTypeFilter === "Dessert"
                ? "När dessertrecept har importerats visas de här med sina rosa kort."
                : "Öppna ett recept i listan för att redigera det och se kortet live."}
            </p>
            {recipeTypeFilter !== "Dessert" && (
              <button
                className="primary"
                onClick={() =>
                  selectRecipe(
                    catalog.recipes.find((x) => x.id === "M007")?.id ||
                      catalog.recipes[0]?.id,
                  )
                }
              >
                Öppna{" "}
                {catalog.recipes.some((x) => x.id === "M007")
                  ? "M007 Tacos"
                  : "första rätten"}{" "}
                →
              </button>
            )}
          </div>
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">Recept / {draft.id}</p>
                <h1>{draft.name || "Namnlös rätt"}</h1>
              </div>
              <div className="top-actions">
                <span className="badge">{draft.status || "Utan status"}</span>
                <button className="primary" disabled={saving} onClick={save}>
                  {saving ? "Sparar…" : "Spara i Sheet"}
                </button>
              </div>
            </header>
            {message && (
              <div className="notice" role="status">
                {message}
              </div>
            )}
            <div className="workspace">
              <div className="editor">
                <section className="paper">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Grunduppgifter</p>
                      <h3>Om rätten</h3>
                    </div>
                    <span className="id-tag">{draft.id}</span>
                  </div>
                  <div className="grid two">
                    <Field
                      label="Namn"
                      value={draft.name}
                      onChange={(v) => edit("name", v)}
                    />
                    <Field
                      label="Kortnamn"
                      value={draft.shortName}
                      onChange={(v) => edit("shortName", v)}
                    />
                    <Field
                      label="Basportioner"
                      type="number"
                      value={draft.servings}
                      onChange={(v) => edit("servings", v)}
                    />
                    <Field
                      label="Status"
                      value={draft.status}
                      onChange={(v) => edit("status", v)}
                    />
                    <Field
                      label="Aktiv tid (min)"
                      value={draft.activeTime}
                      onChange={(v) => edit("activeTime", v)}
                    />
                    <Field
                      label="Total tid (min)"
                      value={draft.totalTime}
                      onChange={(v) => edit("totalTime", v)}
                    />
                  </div>
                  <Field
                    label="Taggar, separerade med kommatecken"
                    value={draft.tags.join(", ")}
                    onChange={(v) =>
                      edit(
                        "tags",
                        v
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                  <Field
                    label="Fullständigt recept"
                    value={draft.recipe}
                    onChange={(v) => edit("recipe", v)}
                    multiline
                    rows={7}
                  />
                  {catalog.schema.dishes.cardRecipe >= 0 && (
                    <Field
                      label="Kortrecept för baksidan"
                      value={draft.cardRecipe}
                      onChange={(v) => edit("cardRecipe", v)}
                      multiline
                      rows={5}
                    />
                  )}
                  <label className="field">
                    <span>Rättbild i Drive</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => upload(e.target.files?.[0])}
                    />
                  </label>
                </section>
                <IngredientEditor
                  lines={draft.ingredients}
                  options={catalog.ingredientOptions}
                  update={(v) => edit("ingredients", v)}
                />
                <PreparationEditor
                  preparations={draft.preparations}
                  options={catalog.preparationOptions || {}}
                  hasPreparations={draft.hasPreparations}
                  update={(v) => edit("preparations", v)}
                />
              </div>
              <div className="right">
                <Preview
                  recipe={preview || draft}
                  frontStyle={frontStyle}
                  printProfile={printProfile}
                />
                <div className="export-panel">
                  <p className="eyebrow">Exportera vid behov</p>
                  <h3>Tryckfiler</h3>
                  <p>
                    {resolvePrintProfile(printProfile).name}: PNG i{" "}
                    {resolvePrintProfile(printProfile).dpi} DPI,{" "}
                    {resolvePrintProfile(printProfile).widthPx} ×{" "}
                    {resolvePrintProfile(printProfile).heightPx} px inklusive
                    utfall. PDF i faktisk storlek på A4.
                  </p>
                  <div className="export-buttons">
                    <button onClick={() => exportFile("/api/export/png/front")}>
                      ↓ Framsida PNG
                    </button>
                    <button onClick={() => exportFile("/api/export/png/back")}>
                      ↓ Baksida PNG
                    </button>
                    <button onClick={() => exportFile("/api/export/proof")}>
                      ↓ A4 proof PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);

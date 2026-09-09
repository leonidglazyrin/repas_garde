import { canonicalIngredientKey } from "./ingredientNormalization.js";

const DAYS = [
  ["Lundi", 0],
  ["Mardi", 1],
  ["Mercredi", 2],
  ["Jeudi", 3],
  ["Vendredi", 4],
];

let cutoffTimer = null;
let scheduled = false;

function getWeekId() {
  return document.body?.innerText?.match(/Semaine\s+(\d{4}-S\d{2})/)?.[1] || null;
}

function mondayFromWeekId(weekId) {
  const match = String(weekId || "").match(/^(\d{4})-S(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(year, 0, 4, 12, 0, 0, 0);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4Day - 1) + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function cutoffFor(weekId, offset) {
  const monday = mondayFromWeekId(weekId);
  if (!monday) return null;
  const cutoff = new Date(monday);
  cutoff.setDate(monday.getDate() + offset);
  cutoff.setHours(19, 30, 0, 0);
  return cutoff;
}

function getMealRows() {
  const rows = [];
  const seen = new Set();
  document.querySelectorAll('textarea[placeholder^="Ingrédients"]').forEach((ingredients) => {
    let row = ingredients.parentElement;
    while (row && row !== document.body) {
      const text = row.textContent || "";
      const day = DAYS.find(([label]) => text.includes(label));
      const name = row.querySelector?.('input[placeholder="Nom du souper"]');
      if (day && name) {
        if (!seen.has(row)) {
          seen.add(row);
          rows.push({ row, ingredients, offset: day[1] });
        }
        break;
      }
      row = row.parentElement;
    }
  });
  return rows;
}

function isApproved(row) {
  const button = Array.from(row.querySelectorAll('button[aria-pressed]')).find((candidate) =>
    (candidate.textContent || "").includes("Approuvé")
  );
  return button?.getAttribute("aria-pressed") === "true";
}

function ingredientKeys(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((part) => canonicalIngredientKey(part))
    .filter(Boolean);
}

function tokens(value) {
  return canonicalIngredientKey(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

function matchesKey(candidate, wanted) {
  const a = canonicalIngredientKey(candidate);
  const b = canonicalIngredientKey(wanted);
  if (!a || !b) return false;
  if (a === b) return true;

  const aTokens = new Set(tokens(a));
  const bTokens = tokens(b);
  return bTokens.length > 0 && bTokens.every((token) => aTokens.has(token));
}

function getGrocerySection() {
  return Array.from(document.querySelectorAll("main section")).find((section) =>
    (section.textContent || "").includes("Liste d'épicerie")
  ) || null;
}

function cleanup() {
  scheduled = false;
  const weekId = getWeekId();
  if (!weekId) return;

  const expired = [];
  const active = [];
  const now = Date.now();

  getMealRows().forEach(({ row, ingredients, offset }) => {
    if (!isApproved(row)) return;
    const cutoff = cutoffFor(weekId, offset);
    if (!cutoff) return;
    const target = now >= cutoff.getTime() ? expired : active;
    ingredientKeys(ingredients.value).forEach((key) => target.push(key));
  });

  const section = getGrocerySection();
  if (!section) return;

  section.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    if (checkbox.closest("[data-family-inventory-stable], #common-grocery-wrapper-stable")) return;
    const label = checkbox.closest("label");
    const row = label?.parentElement;
    if (!label || !row) return;

    const source = row.dataset.groceryOriginalLabel || (label.textContent || "").trim();
    const usedOnlyInExpiredMeals = expired.some((key) => matchesKey(source, key)) &&
      !active.some((key) => matchesKey(source, key));

    if (checkbox.checked && usedOnlyInExpiredMeals) {
      row.dataset.expiredCheckedGrocery = "true";
      row.style.setProperty("display", "none", "important");
    } else if (row.dataset.expiredCheckedGrocery === "true") {
      delete row.dataset.expiredCheckedGrocery;
      if (row.dataset.expiredMealGrocery !== "true" && row.dataset.groceryInFridge !== "true" && row.dataset.inventoryExcluded !== "true") {
        row.style.removeProperty("display");
      }
    }
  });

  scheduleNextCutoff(weekId);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(cleanup);
}

function scheduleNextCutoff(weekId) {
  clearTimeout(cutoffTimer);
  const now = Date.now();
  const future = DAYS
    .map(([, offset]) => cutoffFor(weekId, offset)?.getTime())
    .filter((time) => time && time > now)
    .sort((a, b) => a - b)[0];

  if (!future) return;
  cutoffTimer = setTimeout(schedule, Math.max(1000, future - now + 1000));
}

document.addEventListener("change", schedule, true);
document.addEventListener("input", schedule, true);
document.addEventListener("fridge-items-changed", schedule);
document.addEventListener("grocery-layout-changed", schedule);
queueMicrotask(schedule);
setTimeout(schedule, 500);

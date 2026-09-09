import { supabase } from "./supabaseClient.js";
import { canonicalIngredientKey } from "./ingredientNormalization.js";

const DAYS = [
  ["Lundi", "mon", 0],
  ["Mardi", "tue", 1],
  ["Mercredi", "wed", 2],
  ["Jeudi", "thu", 3],
  ["Vendredi", "fri", 4],
];

let frame = null;
let activeWeek = null;
let knownLibrary = new Set();
let ratings = new Map();

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-CA");
}

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

function getMealRows() {
  const result = [];
  const seen = new Set();
  document.querySelectorAll('input[placeholder="Nom du souper"]').forEach((input) => {
    let node = input.parentElement;
    while (node && node !== document.body) {
      const text = node.textContent || "";
      const day = DAYS.find(([label]) => text.includes(label));
      if (day && node.querySelector?.('textarea[placeholder^="Ingrédients"]')) {
        if (!seen.has(node)) {
          seen.add(node);
          result.push({ row: node, input, ingredients: node.querySelector('textarea[placeholder^="Ingrédients"]'), day });
        }
        return;
      }
      node = node.parentElement;
    }
  });
  return result;
}

function cutoffFor(weekId, dayOffset) {
  const monday = mondayFromWeekId(weekId);
  if (!monday) return null;
  const cutoff = new Date(monday);
  cutoff.setDate(monday.getDate() + dayOffset);
  cutoff.setHours(19, 30, 0, 0);
  return cutoff;
}

function isExpired(weekId, dayOffset) {
  const cutoff = cutoffFor(weekId, dayOffset);
  return !!cutoff && Date.now() >= cutoff.getTime();
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
    .map((item) => canonicalIngredientKey(item.trim()))
    .filter(Boolean);
}

async function loadLibrary() {
  const { data, error } = await supabase.from("meal_library").select("name");
  if (error) {
    console.error("load meal library for ratings", error);
    return;
  }
  knownLibrary = new Set((data || []).map((row) => normalize(row.name)).filter(Boolean));
  schedule();
}

async function loadRatings(weekId) {
  if (!weekId) return;
  const { data, error } = await supabase.from("meal_ratings").select("day_key, meal_name, rating").eq("week_id", weekId);
  if (error) {
    console.error("load meal ratings", error);
    return;
  }
  ratings = new Map((data || []).map((row) => [row.day_key, row]));
  schedule();
}

async function keepInLibrary(name, ingredients, category) {
  const { data } = await supabase.from("meal_library").select("id").ilike("name", name).limit(1);
  const existing = data?.[0];
  if (existing) {
    await supabase.from("meal_library").update({ ingredients: ingredients || "", rating_category: category }).eq("id", existing.id);
  } else {
    await supabase.from("meal_library").insert({ name, ingredients: ingredients || "", rating_category: category });
  }
  knownLibrary.add(normalize(name));
}

async function removeFromLibrary(name) {
  if (!name) return;
  await supabase.from("meal_library").delete().ilike("name", name);
  knownLibrary.delete(normalize(name));
}

async function rateMeal(weekId, dayKey, name, ingredients, rating) {
  const { error } = await supabase.from("meal_ratings").upsert({
    week_id: weekId,
    day_key: dayKey,
    meal_name: name,
    ingredients: ingredients || "",
    rating,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("save meal rating", error);
    return;
  }

  if (rating === "no") await removeFromLibrary(name);
  if (rating === "love") await keepInLibrary(name, ingredients, "love");
  if (rating === "okay") await keepInLibrary(name, ingredients, "okay");

  ratings.set(dayKey, { day_key: dayKey, meal_name: name, rating });
  document.dispatchEvent(new CustomEvent("meal-rating-changed"));
  schedule();
}

function candidateMeals(weekId, rows) {
  return rows.filter(({ input, day }) => {
    const name = input.value.trim();
    const [, dayKey, offset] = day;
    return !!name && isExpired(weekId, offset) && !ratings.has(dayKey);
  });
}

function ensureRatingPanel(main, weekId, rows) {
  const candidates = candidateMeals(weekId, rows);
  let panel = document.getElementById("meal-rating-panel");
  if (!candidates.length) {
    panel?.remove();
    return;
  }

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "meal-rating-panel";
  }
  Object.assign(panel.style, {
    marginBottom: "16px",
    padding: "15px",
    border: "2px solid #C98A3B",
    borderRadius: "12px",
    background: "#FFF6E7",
    boxShadow: "0 4px 14px rgba(201,138,59,.12)",
  });
  panel.replaceChildren();

  const title = document.createElement("div");
  title.textContent = "⭐ Le repas est passé — dites-nous s'il faut le garder";
  Object.assign(title.style, { fontWeight: "900", fontSize: "15px", marginBottom: "4px" });
  panel.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Votre avis décide si le plat entre dans la bibliothèque et dans quelle catégorie.";
  Object.assign(subtitle.style, { fontSize: "12px", color: "var(--ink-soft)", lineHeight: "1.35" });
  panel.appendChild(subtitle);

  candidates.forEach(({ input, ingredients, day }) => {
    const [label, dayKey] = day;
    const name = input.value.trim();
    const wrap = document.createElement("div");
    Object.assign(wrap.style, { marginTop: "11px", paddingTop: "11px", borderTop: "1px solid #E7CFA8" });

    const heading = document.createElement("div");
    heading.textContent = `${label} · ${name}`;
    Object.assign(heading.style, { fontWeight: "900", marginBottom: "8px" });
    wrap.appendChild(heading);

    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "7px" });
    [
      ["love", "❤️ On en reveut absolument", "#4C6B4E"],
      ["okay", "🙂 Correct, de temps en temps", "#C98A3B"],
      ["no", "✕ Non, on oublie", "#B24F35"],
    ].forEach(([rating, labelText, color]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = labelText;
      Object.assign(button.style, {
        minHeight: "44px",
        padding: "8px 9px",
        borderRadius: "9px",
        border: `1px solid ${color}`,
        background: "var(--card)",
        color,
        fontWeight: "900",
        cursor: "pointer",
        fontSize: "12px",
      });
      button.addEventListener("click", () => rateMeal(weekId, dayKey, name, ingredients?.value?.trim() || "", rating));
      actions.appendChild(button);
    });
    wrap.appendChild(actions);
    panel.appendChild(wrap);
  });

  const overview = document.getElementById("week-compact-overview");
  const nav = document.getElementById("parent-quick-nav");
  const anchor = overview || nav || main.firstElementChild;
  if (anchor?.parentElement === main && panel.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", panel);
  else if (!panel.parentElement) main.insertBefore(panel, main.firstElementChild);
}

function applyExpiry(weekId, rows) {
  rows.forEach(({ row, day }) => {
    const [, dayKey, offset] = day;
    const expired = isExpired(weekId, offset);
    row.dataset.mealExpired = String(expired);
    if (expired) row.style.setProperty("display", "none", "important");
    else if (row.style.getPropertyPriority("display") === "important") row.style.removeProperty("display");

    const compact = document.querySelector(`[data-compact-day="${dayKey}"]`);
    if (compact) {
      if (expired) compact.style.setProperty("display", "none", "important");
      else if (compact.style.getPropertyPriority("display") === "important") compact.style.removeProperty("display");
    }
  });
}

function applyExpiredGroceryFilter(weekId, rows) {
  const expiredKeys = new Set();
  const activeKeys = new Set();

  rows.forEach(({ row, ingredients, day }) => {
    if (!isApproved(row)) return;
    const keys = ingredientKeys(ingredients?.value || "");
    const target = isExpired(weekId, day[2]) ? expiredKeys : activeKeys;
    keys.forEach((key) => target.add(key));
  });

  const grocerySection = Array.from(document.querySelectorAll("main section")).find((section) =>
    (section.textContent || "").includes("Liste d'épicerie")
  );
  if (!grocerySection) return;

  grocerySection.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    if (checkbox.closest("#common-grocery-wrapper")) return;
    const label = checkbox.closest("label");
    const row = label?.parentElement;
    if (!label || !row) return;
    const key = canonicalIngredientKey((label.textContent || "").trim());
    if (key && expiredKeys.has(key) && !activeKeys.has(key)) {
      row.dataset.expiredMealGrocery = "true";
      row.style.setProperty("display", "none", "important");
    } else if (row.dataset.expiredMealGrocery === "true") {
      delete row.dataset.expiredMealGrocery;
      row.style.removeProperty("display");
    }
  });
}

function sync() {
  const main = document.querySelector("main");
  const weekId = getWeekId();
  if (!main || !weekId) return;
  const rows = getMealRows();
  if (!rows.length) return;

  if (activeWeek !== weekId) {
    activeWeek = weekId;
    ratings = new Map();
    loadRatings(weekId);
  }

  applyExpiry(weekId, rows);
  applyExpiredGroceryFilter(weekId, rows);
  ensureRatingPanel(main, weekId, rows);
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    sync();
  });
}

document.addEventListener("focusout", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.placeholder !== "Nom du souper") return;
  const name = input.value.trim();
  if (!name || knownLibrary.has(normalize(name))) return;
  setTimeout(async () => {
    const rowEntry = getMealRows().find((entry) => entry.input === input);
    const dayKey = rowEntry?.day?.[1];
    if (dayKey && ratings.has(dayKey)) return;
    await removeFromLibrary(name);
  }, 700);
}, true);

document.addEventListener("input", schedule, true);
document.addEventListener("change", schedule, true);
document.addEventListener("click", schedule, true);
document.addEventListener("fridge-items-changed", schedule);
const observer = new MutationObserver(schedule);
observer.observe(document.documentElement, { childList: true, subtree: true });
setInterval(schedule, 30000);
loadLibrary();
queueMicrotask(schedule);

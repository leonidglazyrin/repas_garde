import { supabase } from "./supabaseClient.js";

const DAYS = [
  ["Lundi", "mon", 0, "#1F7A3D", "#E2F2E7"],
  ["Mardi", "tue", 1, "#C98A3B", "#F6E9D3"],
  ["Mercredi", "wed", 2, "#2457C5", "#E5ECFF"],
  ["Jeudi", "thu", 3, "#7A5AA3", "#EEE8F5"],
  ["Vendredi", "fri", 4, "#B24F35", "#F5E1D9"],
];

let meals = new Map();
let activeWeek = null;
let channel = null;
let frame = null;
let requestId = 0;
let pendingIngredientRender = false;
const expandedDays = new Set();
const ingredientTimers = new Map();
const INGREDIENT_SAVE_DELAY_MS = 1500;

function currentWeekId() {
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

function formatDate(weekId, offset) {
  const monday = mondayFromWeekId(weekId);
  if (!monday) return "";
  const date = new Date(monday);
  date.setDate(monday.getDate() + offset);
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

function findGrocerySection() {
  return Array.from(document.querySelectorAll("main > section")).find((section) => {
    const text = section.textContent || "";
    return text.includes("Liste d'épicerie") || text.includes("Liste d’épicerie") || text.includes("repas de la semaine");
  }) || null;
}

function ensureSlot() {
  const section = findGrocerySection();
  if (!section) return null;

  const header = Array.from(section.children).find((child) => {
    const text = child.textContent || "";
    return text.includes("Liste d'épicerie") || text.includes("Liste d’épicerie") || text.includes("repas de la semaine");
  });
  const body = Array.from(section.children).find((child) => child !== header);
  if (!body) return null;

  let slot = document.getElementById("grocery-meal-details");
  if (!slot) {
    slot = document.createElement("div");
    slot.id = "grocery-meal-details";
  }
  if (slot.parentElement !== body || body.firstElementChild !== slot) body.prepend(slot);
  return slot;
}

async function load() {
  const weekId = currentWeekId();
  if (!weekId) return;
  const id = ++requestId;
  const { data, error } = await supabase
    .from("week_meals")
    .select("day_key,name,ingredients,status,comment")
    .eq("week_id", weekId);
  if (id !== requestId || weekId !== currentWeekId()) return;
  if (error) {
    console.error("load grocery meal details", error);
    return;
  }
  meals = new Map((data || []).map((row) => [row.day_key, row]));
  activeWeek = weekId;
  const active = document.activeElement;
  if (active?.closest?.("#grocery-meal-details")) {
    pendingIngredientRender = true;
  } else {
    pendingIngredientRender = false;
    schedule();
  }
}

async function saveIngredients(dayKey, value) {
  const weekId = currentWeekId();
  if (!weekId) return;
  const current = meals.get(dayKey);
  if (!current || current.status !== "approved") return;

  const previous = current.ingredients || "";
  const ingredients = String(value || "").trim();
  meals.set(dayKey, { ...current, ingredients });

  const { error } = await supabase.from("week_meals").upsert({
    week_id: weekId,
    day_key: dayKey,
    name: current.name || "",
    ingredients,
    status: "approved",
    comment: current.comment || "",
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("save grocery meal ingredients", error);
    meals.set(dayKey, { ...current, ingredients: previous });
    schedule();
  }
}

function render() {
  frame = null;
  const slot = ensureSlot();
  const weekId = currentWeekId();
  if (!slot || !weekId) return;
  if (weekId !== activeWeek) {
    load();
    return;
  }

  slot.replaceChildren();

  const approved = DAYS.filter(([, dayKey]) => {
    const meal = meals.get(dayKey);
    return meal?.status === "approved" && String(meal.name || "").trim();
  });

  if (!approved.length) {
    const empty = document.createElement("p");
    empty.className = "grocery-recipes-empty";
    empty.textContent = "Aucun repas approuvé pour le moment.";
    slot.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "grocery-recipes-grid";

  approved.forEach(([label, dayKey, offset, color, soft]) => {
    const meal = meals.get(dayKey);
    const card = document.createElement("article");
    card.className = "grocery-recipe-card";
    card.style.setProperty("--recipe-color", color);
    card.style.setProperty("--recipe-soft", soft);

    const title = document.createElement("button");
    title.type = "button";
    title.className = "grocery-recipe-title";
    const expanded = expandedDays.has(dayKey);
    title.setAttribute("aria-expanded", String(expanded));
    title.setAttribute("aria-label", `${meal.name}, ${formatDate(weekId, offset)} — modifier les ingrédients`);

    const name = document.createElement("strong");
    name.textContent = meal.name;
    const meta = document.createElement("span");
    meta.textContent = formatDate(weekId, offset);
    title.append(name, meta);

    title.addEventListener("click", () => {
      if (expandedDays.has(dayKey)) expandedDays.delete(dayKey);
      else expandedDays.add(dayKey);
      schedule();
    });

    card.append(title);

    if (expanded) {
      const textarea = document.createElement("textarea");
      textarea.rows = 3;
      textarea.placeholder = "Ajouter les ingrédients de cette recette";
      textarea.value = meal.ingredients || "";
      textarea.addEventListener("input", () => {
        clearTimeout(ingredientTimers.get(dayKey));
        ingredientTimers.set(dayKey, setTimeout(() => {
          ingredientTimers.delete(dayKey);
          saveIngredients(dayKey, textarea.value);
        }, INGREDIENT_SAVE_DELAY_MS));
      });
      textarea.addEventListener("blur", () => {
        clearTimeout(ingredientTimers.get(dayKey));
        ingredientTimers.delete(dayKey);
        saveIngredients(dayKey, textarea.value);
      });
      card.appendChild(textarea);
    }

    grid.appendChild(card);
  });

  slot.appendChild(grid);
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(render);
}

function subscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel("grocery-meal-details")
    .on("postgres_changes", { event: "*", schema: "public", table: "week_meals" }, load)
    .subscribe();
}

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("button");
  if (!button) return;
  if (button.matches?.('button[aria-label="Semaine précédente"], button[aria-label="Semaine suivante"]') || button.textContent?.trim() === "Aujourd'hui") {
    setTimeout(load, 180);
  }
}, true);

load();
subscribe();
queueMicrotask(schedule);
setTimeout(load, 250);
setTimeout(load, 900);


document.addEventListener("focusout", (event) => {
  if (!event.target?.closest?.("#grocery-meal-details") || !pendingIngredientRender) return;
  setTimeout(() => {
    if (document.activeElement?.closest?.("#grocery-meal-details")) return;
    pendingIngredientRender = false;
    schedule();
  }, 0);
}, true);

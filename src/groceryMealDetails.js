import { supabase } from "./supabaseClient.js";

const DAYS = [
  ["Lundi", "mon", 0],
  ["Mardi", "tue", 1],
  ["Mercredi", "wed", 2],
  ["Jeudi", "thu", 3],
  ["Vendredi", "fri", 4],
];

let meals = new Map();
let activeWeek = null;
let channel = null;
let frame = null;
let requestId = 0;

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

function ensureSlot() {
  const main = document.querySelector("main");
  if (!main) return null;
  let slot = document.getElementById("grocery-meal-details");
  if (!slot) {
    slot = document.createElement("section");
    slot.id = "grocery-meal-details";
    slot.dataset.workspaceGrocery = "true";
    const grocery = Array.from(main.children).find((child) =>
      (child.textContent || "").includes("Liste d'épicerie") ||
      (child.textContent || "").includes("Épicerie des repas")
    );
    if (grocery) main.insertBefore(slot, grocery);
    else main.appendChild(slot);
  }
  return slot;
}

async function load() {
  const weekId = currentWeekId();
  if (!weekId) return;
  const id = ++requestId;
  const { data, error } = await supabase
    .from("week_meals")
    .select("day_key,name,ingredients,status")
    .eq("week_id", weekId);
  if (id !== requestId || weekId !== currentWeekId()) return;
  if (error) {
    console.error("load grocery meal details", error);
    return;
  }
  meals = new Map((data || []).map((row) => [row.day_key, row]));
  activeWeek = weekId;
  schedule();
}

async function saveIngredients(dayKey, value) {
  const weekId = currentWeekId();
  if (!weekId) return;
  const current = meals.get(dayKey) || { day_key: dayKey, name: "", status: "pending" };
  const ingredients = String(value || "").trim();
  meals.set(dayKey, { ...current, ingredients });
  const { error } = await supabase.from("week_meals").upsert({
    week_id: weekId,
    day_key: dayKey,
    name: current.name || "",
    ingredients,
    status: current.status || "pending",
    comment: current.comment || "",
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("save grocery meal ingredients", error);
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

  const title = document.createElement("div");
  title.className = "grocery-meals-title";
  title.innerHTML = "<strong>Plats de la semaine et ingrédients</strong><span>Les ingrédients inscrits ici alimentent automatiquement la liste d’épicerie.</span>";
  slot.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "grocery-meals-grid";

  DAYS.forEach(([label, dayKey, offset]) => {
    const meal = meals.get(dayKey) || {};
    const card = document.createElement("article");
    card.className = "grocery-meal-card";

    const heading = document.createElement("div");
    heading.className = "grocery-meal-heading";
    const name = document.createElement("strong");
    name.textContent = meal.name?.trim() || "Aucun souper";
    const day = document.createElement("span");
    day.textContent = `${label} · ${formatDate(weekId, offset)}`;
    heading.append(name, day);

    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.placeholder = "Ingrédients du souper, séparés par des virgules";
    textarea.value = meal.ingredients || "";
    textarea.disabled = !meal.name?.trim();
    textarea.addEventListener("blur", () => saveIngredients(dayKey, textarea.value));

    card.append(heading, textarea);
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

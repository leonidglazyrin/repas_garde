import { supabase } from "./supabaseClient";

const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];

let activeWeek = null;
let values = {};
let channel = null;
let frame = null;

function getWeekId() {
  const match = document.body?.innerText?.match(/Semaine\s+(\d{4}-S\d{2})/);
  return match?.[1] || null;
}

function getMealRow(input) {
  let node = input?.parentElement;
  while (node && node !== document.body) {
    const hasMealFields =
      node.querySelector?.('input[placeholder="Nom du souper"]') &&
      node.querySelector?.('textarea[placeholder^="Ingrédients"]');
    const text = node.innerText || "";
    const hasDay = DAYS.some(([label]) => text.includes(label));
    if (hasMealFields && hasDay) return node;
    node = node.parentElement;
  }
  return null;
}

function getDay(row) {
  const text = row?.innerText || "";
  return DAYS.find(([label]) => text.includes(label)) || null;
}

function getMealControls(row) {
  const input = row?.querySelector?.('input[placeholder="Nom du souper"]');
  if (!input) return null;
  let line = input.parentElement;
  while (line && line !== row) {
    const librarySelect = line.querySelector?.('select[aria-label="Piger dans la bibliothèque"]');
    if (librarySelect) return { line, librarySelect };
    line = line.parentElement;
  }
  const librarySelect = row.querySelector?.('select[aria-label="Piger dans la bibliothèque"]');
  return librarySelect ? { line: librarySelect.parentElement, librarySelect } : null;
}

async function save(dayKey, dessert) {
  const weekId = getWeekId();
  if (!weekId) return;
  values[dayKey] = dessert;
  const { error } = await supabase.from("week_desserts").upsert({
    week_id: weekId,
    day_key: dayKey,
    dessert,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("save week_desserts", error);
}

function styleDessertButton(button, hasDessert, open) {
  Object.assign(button.style, {
    minWidth: hasDessert ? "auto" : "42px",
    minHeight: "42px",
    border: `1px solid ${hasDessert || open ? "var(--honey)" : "var(--line)"}`,
    borderRadius: "21px",
    padding: hasDessert ? "8px 12px" : "8px",
    background: hasDessert || open ? "var(--honey-soft)" : "var(--card)",
    color: hasDessert || open ? "var(--honey)" : "var(--ink-soft)",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    flexShrink: "0",
    boxShadow: open ? "0 2px 8px rgba(42,36,30,0.08)" : "none",
  });
}

function updateDessertButton(group, dayKey) {
  const button = group.querySelector("[data-dessert-toggle]");
  if (!button) return;
  const dessert = (values[dayKey] || "").trim();
  const open = group.dataset.dessertOpen === "true";
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", dessert ? `Dessert : ${dessert}` : "Ajouter un dessert");
  button.title = dessert ? `Dessert : ${dessert}` : "Ajouter un dessert";
  button.textContent = dessert ? `🍰 ${dessert}` : "🍰";
  styleDessertButton(button, !!dessert, open);
}

function buildDessertField(dayKey, value = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Choisir un dessert";
  input.value = value;
  input.dataset.dessertDay = dayKey;
  input.setAttribute("aria-label", "Dessert");
  Object.assign(input.style, {
    flex: "1 1 180px",
    minWidth: "180px",
    minHeight: "40px",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    padding: "8px 10px",
    background: "var(--card)",
    color: "var(--ink)",
    fontSize: "16px",
  });

  const commit = async () => {
    await save(dayKey, input.value.trim());
    const group = input.closest("[data-dessert-group]");
    if (group) updateDessertButton(group, dayKey);
  };
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  return input;
}

function buildDessertGroup(dayKey, value = "") {
  const group = document.createElement("div");
  group.dataset.dessertGroup = dayKey;
  group.dataset.dessertOpen = "false";
  Object.assign(group.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
    minWidth: "0",
  });

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dessertToggle = "true";
  button.setAttribute("aria-controls", `dessert-field-${dayKey}`);

  const field = buildDessertField(dayKey, value);
  field.id = `dessert-field-${dayKey}`;
  field.hidden = true;
  field.style.setProperty("display", "none", "important");

  button.addEventListener("click", () => {
    const opening = group.dataset.dessertOpen !== "true";
    group.dataset.dessertOpen = String(opening);
    field.hidden = !opening;
    if (opening) {
      field.style.removeProperty("display");
      requestAnimationFrame(() => field.focus({ preventScroll: true }));
    } else {
      field.style.setProperty("display", "none", "important");
    }
    updateDessertButton(group, dayKey);
  });

  group.appendChild(button);
  group.appendChild(field);
  updateDessertButton(group, dayKey);
  return group;
}

function placeGroup(row, line, librarySelect, dayKey, group) {
  const extras = row.querySelector(`[data-meal-extras-row="${dayKey}"]`);
  if (extras) {
    if (group.parentElement !== extras) extras.appendChild(group);
    return;
  }
  if (group.parentElement !== line) line.insertBefore(group, librarySelect);
}

function mountFields() {
  document.querySelectorAll('input[placeholder="Nom du souper"]').forEach((mealInput) => {
    const row = getMealRow(mealInput);
    const day = getDay(row);
    if (!row || !day) return;
    const [, dayKey] = day;
    const controls = getMealControls(row);
    if (!controls) return;
    const { line, librarySelect } = controls;

    let group = row.querySelector(`[data-dessert-group="${dayKey}"]`);
    if (!group) group = buildDessertGroup(dayKey, values[dayKey] || "");
    placeGroup(row, line, librarySelect, dayKey, group);
  });
}

function applyValues() {
  document.querySelectorAll("input[data-dessert-day]").forEach((input) => {
    const dayKey = input.dataset.dessertDay;
    if (document.activeElement !== input) input.value = values[dayKey] || "";
    const group = input.closest("[data-dessert-group]");
    if (group) updateDessertButton(group, dayKey);
  });
}

async function loadWeek(weekId) {
  if (!weekId) return;
  const { data, error } = await supabase.from("week_desserts").select("day_key, dessert").eq("week_id", weekId);
  if (error) {
    console.error("fetch week_desserts", error);
    return;
  }
  values = Object.fromEntries((data || []).map((row) => [row.day_key, row.dessert || ""]));
  applyValues();
  mountFields();
}

function subscribe(weekId) {
  if (channel) supabase.removeChannel(channel);
  if (!weekId) return;
  channel = supabase
    .channel(`desserts-${weekId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "week_desserts", filter: `week_id=eq.${weekId}` }, () => loadWeek(weekId))
    .subscribe();
}

function sync() {
  mountFields();
  const weekId = getWeekId();
  if (weekId && weekId !== activeWeek) {
    activeWeek = weekId;
    values = {};
    subscribe(weekId);
    loadWeek(weekId);
  }
}

function scheduleSync() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    sync();
  });
}

const root = document.getElementById("root") || document.body;
const observer = new MutationObserver(scheduleSync);
observer.observe(root, { childList: true, subtree: true });
queueMicrotask(sync);

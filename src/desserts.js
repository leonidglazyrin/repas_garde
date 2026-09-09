import { supabase } from "./supabaseClient";

const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];

const DESSERT_OPTIONS = ["Yogourt", "Fruits", "Salade de fruits", "Céréales"];

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

function refillSelect(select, selectedValue = "") {
  if (!select) return;
  const current = DESSERT_OPTIONS.includes(selectedValue || select.value)
    ? (selectedValue || select.value)
    : "";

  const signature = `${current}|${DESSERT_OPTIONS.join("|")}`;
  if (select.dataset.optionsSignature === signature) return;
  select.dataset.optionsSignature = signature;
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choisir un dessert";
  select.appendChild(placeholder);

  DESSERT_OPTIONS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = current;
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

function buildDessertSelect(dayKey, value = "") {
  const select = document.createElement("select");
  select.dataset.dessertDay = dayKey;
  select.setAttribute("aria-label", "Dessert");
  Object.assign(select.style, {
    width: "100%",
    minWidth: "0",
    minHeight: "42px",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    padding: "8px 10px",
    background: "var(--card)",
    color: "var(--ink)",
    fontSize: "16px",
    cursor: "pointer",
  });
  refillSelect(select, value);
  select.addEventListener("change", () => save(dayKey, select.value));
  return select;
}

function buildIcon() {
  const icon = document.createElement("div");
  icon.dataset.dessertIcon = "true";
  icon.textContent = "🍎";
  icon.setAttribute("aria-hidden", "true");
  Object.assign(icon.style, {
    width: "42px",
    height: "42px",
    borderRadius: "21px",
    border: "1px solid var(--honey)",
    background: "var(--honey-soft)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    flexShrink: "0",
  });
  return icon;
}

function buildDessertGroup(dayKey, value = "") {
  const group = document.createElement("div");
  group.dataset.dessertGroup = dayKey;
  Object.assign(group.style, {
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr)",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    minWidth: "0",
  });
  group.append(buildIcon(), buildDessertSelect(dayKey, value));
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
  document.querySelectorAll("select[data-dessert-day]").forEach((select) => {
    if (document.activeElement === select) return;
    refillSelect(select, values[select.dataset.dessertDay] || "");
  });
}

async function loadWeek(weekId) {
  if (!weekId) return;
  const { data, error } = await supabase
    .from("week_desserts")
    .select("day_key,dessert")
    .eq("week_id", weekId);
  if (error) {
    console.error("fetch week_desserts", error);
    return;
  }
  values = Object.fromEntries((data || []).map((row) => [row.day_key, DESSERT_OPTIONS.includes(row.dessert) ? row.dessert : ""]));
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

// Pas de MutationObserver ici : le dessert ne reconstruit plus l'interface pendant le scroll.
queueMicrotask(scheduleSync);
setTimeout(scheduleSync, 120);
setTimeout(scheduleSync, 500);
document.addEventListener("meal-rating-changed", scheduleSync);

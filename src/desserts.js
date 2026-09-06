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

function buildDessertField(dayKey, value = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Dessert (optionnel)";
  input.value = value;
  input.dataset.dessertDay = dayKey;
  input.setAttribute("aria-label", "Dessert optionnel");

  Object.assign(input.style, {
    width: "100%",
    minWidth: "0",
    minHeight: "40px",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    padding: "8px 10px",
    background: "var(--card)",
    color: "var(--ink)",
    fontSize: "16px",
  });

  input.addEventListener("change", () => save(dayKey, input.value.trim()));
  input.addEventListener("blur", () => save(dayKey, input.value.trim()));
  return input;
}

function mountFields() {
  document.querySelectorAll('input[placeholder="Nom du souper"]').forEach((mealInput) => {
    const row = getMealRow(mealInput);
    const day = getDay(row);
    if (!row || !day) return;

    const [, dayKey] = day;
    if (row.querySelector(`[data-dessert-group="${dayKey}"]`)) return;

    const controls = getMealControls(row);
    if (!controls) return;
    const { line, librarySelect } = controls;

    const group = document.createElement("div");
    group.dataset.dessertGroup = dayKey;
    Object.assign(group.style, {
      width: "100%",
      minWidth: "0",
      display: "flex",
      alignItems: "center",
      marginTop: "2px",
      marginBottom: "2px",
    });

    group.appendChild(buildDessertField(dayKey, values[dayKey] || ""));

    const accompaniment = row.querySelector(`[data-accompaniment-group="${dayKey}"]`);
    if (accompaniment?.parentElement === line) {
      accompaniment.insertAdjacentElement("afterend", group);
    } else {
      line.insertBefore(group, librarySelect);
    }
  });
}

function applyValues() {
  document.querySelectorAll("input[data-dessert-day]").forEach((input) => {
    if (document.activeElement !== input) input.value = values[input.dataset.dessertDay] || "";
  });
}

async function loadWeek(weekId) {
  if (!weekId) return;
  const { data, error } = await supabase
    .from("week_desserts")
    .select("day_key, dessert")
    .eq("week_id", weekId);
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
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "week_desserts", filter: `week_id=eq.${weekId}` },
      () => loadWeek(weekId)
    )
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

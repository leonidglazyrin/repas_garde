import { supabase } from "./supabaseClient";

const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];

const DEFAULT_OPTIONS = [
  "Fruits frais",
  "Compote",
  "Yogourt",
  "Crème glacée",
  "Biscuits",
  "Brownies",
  "Gâteau",
  "Muffins",
  "Pouding",
  "Tarte",
];

let activeWeek = null;
let values = {};
let customOptions = [];
let channel = null;
let optionChannel = null;
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

function allOptions() {
  const seen = new Set();
  return [...DEFAULT_OPTIONS, ...customOptions]
    .map((value) => String(value || "").trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase("fr-CA");
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function refillSelect(select, selectedValue = "") {
  if (!select) return;
  const current = selectedValue || select.value || "";
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choisir un dessert";
  select.appendChild(placeholder);

  const options = allOptions();
  if (current && !options.includes(current)) options.push(current);

  options.forEach((value) => {
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

async function addCustomOption() {
  const idea = window.prompt("Nouveau dessert :", "");
  const name = String(idea || "").trim();
  if (!name) return;

  if (!allOptions().some((value) => value.toLocaleLowerCase("fr-CA") === name.toLocaleLowerCase("fr-CA"))) {
    customOptions = [...customOptions, name];
    updateAllMenus();
  }

  const { error } = await supabase
    .from("dessert_options")
    .upsert({ name, updated_at: new Date().toISOString() }, { onConflict: "name" });

  if (error) {
    console.error("save dessert option", error);
    loadOptions();
  }
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
  const button = group?.querySelector("[data-dessert-toggle]");
  if (!button) return;
  const dessert = (values[dayKey] || "").trim();
  const open = group.dataset.dessertOpen === "true";
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", dessert ? `Dessert : ${dessert}` : "Choisir un dessert");
  button.title = dessert ? `Dessert : ${dessert}` : "Choisir un dessert";
  button.textContent = dessert ? `🍰 ${dessert}` : "🍰";
  styleDessertButton(button, !!dessert, open);
}

function buildDessertSelect(dayKey, value = "") {
  const select = document.createElement("select");
  select.dataset.dessertDay = dayKey;
  select.setAttribute("aria-label", "Dessert");
  Object.assign(select.style, {
    flex: "1 1 180px",
    minWidth: "180px",
    minHeight: "40px",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    padding: "8px 10px",
    background: "var(--card)",
    color: "var(--ink)",
    fontSize: "16px",
    cursor: "pointer",
  });

  refillSelect(select, value);
  select.addEventListener("change", async () => {
    await save(dayKey, select.value);
    const group = select.closest("[data-dessert-group]");
    if (group) updateDessertButton(group, dayKey);
  });
  return select;
}

function buildEditButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dessertEdit = "true";
  button.textContent = "✎";
  button.setAttribute("aria-label", "Ajouter un dessert");
  button.title = "Ajouter un dessert";
  Object.assign(button.style, {
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    background: "var(--card)",
    color: "var(--ink-soft)",
    cursor: "pointer",
    fontSize: "18px",
    lineHeight: "1",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  });
  button.addEventListener("click", addCustomOption);
  return button;
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
  button.setAttribute("aria-controls", `dessert-menu-${dayKey}`);

  const menu = document.createElement("div");
  menu.id = `dessert-menu-${dayKey}`;
  menu.dataset.dessertMenu = "true";
  Object.assign(menu.style, {
    display: "none",
    alignItems: "center",
    gap: "6px",
    flex: "1 1 240px",
    minWidth: "0",
  });

  const select = buildDessertSelect(dayKey, value);
  select.style.flex = "1 1 auto";
  menu.appendChild(select);
  menu.appendChild(buildEditButton());

  button.addEventListener("click", () => {
    const opening = group.dataset.dessertOpen !== "true";
    group.dataset.dessertOpen = String(opening);
    menu.style.display = opening ? "flex" : "none";
    updateDessertButton(group, dayKey);
    if (opening) requestAnimationFrame(() => select.focus({ preventScroll: true }));
  });

  group.appendChild(button);
  group.appendChild(menu);
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

function updateAllMenus() {
  document.querySelectorAll("select[data-dessert-day]").forEach((select) => {
    refillSelect(select, values[select.dataset.dessertDay] || select.value);
  });
}

function applyValues() {
  document.querySelectorAll("select[data-dessert-day]").forEach((select) => {
    const dayKey = select.dataset.dessertDay;
    if (document.activeElement !== select) refillSelect(select, values[dayKey] || "");
    const group = select.closest("[data-dessert-group]");
    if (group) updateDessertButton(group, dayKey);
  });
}

async function loadOptions() {
  const { data, error } = await supabase
    .from("dessert_options")
    .select("name")
    .order("name", { ascending: true });
  if (error) {
    console.error("fetch dessert_options", error);
    return;
  }
  customOptions = (data || []).map((row) => row.name).filter(Boolean);
  updateAllMenus();
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

function subscribeOptions() {
  if (optionChannel) supabase.removeChannel(optionChannel);
  optionChannel = supabase
    .channel("dessert-options")
    .on("postgres_changes", { event: "*", schema: "public", table: "dessert_options" }, loadOptions)
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

loadOptions();
subscribeOptions();
const root = document.getElementById("root") || document.body;
const observer = new MutationObserver(scheduleSync);
observer.observe(root, { childList: true, subtree: true });
queueMicrotask(sync);

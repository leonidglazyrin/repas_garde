import { supabase } from "./supabaseClient.js";

const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];
const COLORS = ["#4C6B4E", "#C98A3B", "#B24F35", "#3E6E8E", "#7A5AA3", "#2F8F82", "#8A5A3E", "#B05A7A"];

let caregivers = [];
let assignments = new Map();
let activeWeek = null;
let channel = null;
let frame = null;
let assignmentRequest = 0;
let startupTimer = null;
let startupPasses = 0;

function currentWeekId() {
  return document.body?.innerText?.match(/Semaine\s+(\d{4}-S\d{2})/)?.[1] || null;
}

function isMobile() {
  return window.matchMedia?.("(max-width: 700px)")?.matches ?? false;
}

function shortName(name) {
  return String(name || "").trim().slice(0, 3).toLocaleUpperCase("fr-CA");
}

function findMealRows() {
  const rows = [];
  const seen = new Set();
  document.querySelectorAll('input[placeholder="Nom du souper"]').forEach((input) => {
    let node = input.parentElement;
    while (node && node !== document.body) {
      const text = node.textContent || "";
      const day = DAYS.find(([label]) => text.includes(label));
      if (day && node.querySelector?.('textarea[placeholder^="Ingrédients"]')) {
        if (!seen.has(node)) {
          seen.add(node);
          rows.push({ row: node, dayKey: day[1] });
        }
        break;
      }
      node = node.parentElement;
    }
  });
  return rows;
}

function selectedFor(dayKey) {
  return assignments.get(dayKey) || new Set();
}

function textColor(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return "#fff";
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? "#2A241E" : "#fff";
}

function chip(caregiver, selected, dayKey) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.caregiverId = String(caregiver.id);
  button.dataset.fullName = caregiver.name;
  button.setAttribute("aria-pressed", String(selected));
  button.setAttribute("aria-label", `${caregiver.name}${selected ? " sélectionnée" : ""}`);
  button.textContent = isMobile() ? shortName(caregiver.name) : caregiver.name;
  button.title = caregiver.name;
  Object.assign(button.style, {
    borderRadius: "999px",
    border: `1px solid ${caregiver.color}`,
    background: selected ? caregiver.color : "var(--card)",
    color: selected ? textColor(caregiver.color) : caregiver.color,
    padding: "4px 8px",
    minHeight: "28px",
    fontSize: "11px",
    fontWeight: "800",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await toggleAssignment(dayKey, caregiver.id, selected);
  });
  return button;
}

function addButton(dayKey) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "+";
  button.title = "Ajouter une gardienne";
  button.setAttribute("aria-label", "Ajouter une gardienne");
  Object.assign(button.style, {
    width: "28px",
    minWidth: "28px",
    height: "28px",
    minHeight: "28px",
    padding: "0",
    borderRadius: "50%",
    border: "1px dashed var(--line)",
    background: "var(--card)",
    color: "var(--ink-soft)",
    fontWeight: "900",
    cursor: "pointer",
  });
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const name = String(window.prompt("Nom de la gardienne :", "") || "").trim();
    if (!name) return;

    const existing = caregivers.find((item) => item.name.toLocaleLowerCase("fr-CA") === name.toLocaleLowerCase("fr-CA"));
    if (existing) {
      if (!selectedFor(dayKey).has(existing.id)) await toggleAssignment(dayKey, existing.id, false);
      return;
    }

    const color = COLORS[caregivers.length % COLORS.length];
    const { data, error } = await supabase.from("caregivers").insert({ name, color }).select("id,name,color").single();
    if (error) {
      console.error("add caregiver", error);
      return;
    }
    caregivers = [...caregivers, data];
    await toggleAssignment(dayKey, data.id, false);
  });
  return button;
}

function renderDay(row, dayKey) {
  const dayColumn = row.firstElementChild;
  if (!dayColumn) return;

  const mobile = isMobile();
  const host = mobile ? row : dayColumn;
  let wrap = row.querySelector(':scope > [data-caregiver-picker="true"]') || dayColumn.querySelector(':scope > [data-caregiver-picker="true"]');

  if (!wrap) {
    wrap = document.createElement("div");
    wrap.dataset.caregiverPicker = "true";
  }
  if (wrap.parentElement !== host) host.appendChild(wrap);
  wrap.dataset.mobile = mobile ? "true" : "false";

  const selected = selectedFor(dayKey);
  const signature = `${activeWeek}|${mobile ? "m" : "d"}|${caregivers.map((c) => `${c.id}:${c.name}:${c.color}`).join("|")}/${Array.from(selected).sort().join(",")}`;
  if (wrap.dataset.signature === signature) return;
  wrap.dataset.signature = signature;
  wrap.replaceChildren();

  const label = document.createElement("span");
  label.textContent = "Gardienne";
  label.dataset.caregiverLabel = "true";
  wrap.appendChild(label);

  const choices = document.createElement("div");
  choices.dataset.caregiverChoices = "true";
  caregivers.forEach((caregiver) => choices.appendChild(chip(caregiver, selected.has(caregiver.id), dayKey)));
  choices.appendChild(addButton(dayKey));
  wrap.appendChild(choices);
}

function render() {
  frame = null;
  const weekId = currentWeekId();
  if (!weekId) return;

  if (weekId !== activeWeek) {
    activeWeek = weekId;
    assignments = new Map(DAYS.map(([, key]) => [key, new Set()]));
    loadAssignments(weekId);
  }

  findMealRows().forEach(({ row, dayKey }) => renderDay(row, dayKey));
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(render);
}

async function loadCaregivers() {
  const { data, error } = await supabase.from("caregivers").select("id,name,color").order("created_at");
  if (error) {
    console.error("load caregivers", error);
    return;
  }
  caregivers = data || [];
  schedule();
}

async function loadAssignments(weekId = currentWeekId()) {
  if (!weekId) return;
  const requestId = ++assignmentRequest;
  const { data, error } = await supabase.from("week_caregivers").select("day_key,caregiver_id").eq("week_id", weekId);
  if (requestId !== assignmentRequest || weekId !== currentWeekId()) return;
  if (error) {
    console.error("load week caregivers", error);
    return;
  }

  const next = new Map(DAYS.map(([, key]) => [key, new Set()]));
  (data || []).forEach((row) => {
    if (!next.has(row.day_key)) next.set(row.day_key, new Set());
    next.get(row.day_key).add(row.caregiver_id);
  });
  assignments = next;
  schedule();
}

async function toggleAssignment(dayKey, caregiverId, currentlySelected) {
  const weekId = currentWeekId();
  if (!weekId) return;

  const previous = new Set(selectedFor(dayKey));
  const next = new Set(previous);
  currentlySelected ? next.delete(caregiverId) : next.add(caregiverId);
  assignments.set(dayKey, next);
  schedule();

  const query = supabase.from("week_caregivers");
  const { error } = currentlySelected
    ? await query.delete().eq("week_id", weekId).eq("day_key", dayKey).eq("caregiver_id", caregiverId)
    : await query.upsert({ week_id: weekId, day_key: dayKey, caregiver_id: caregiverId }, { onConflict: "week_id,day_key,caregiver_id" });

  if (error) {
    console.error("save caregiver assignment", error);
    assignments.set(dayKey, previous);
    schedule();
  }
}

function subscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel("caregiver-assignments")
    .on("postgres_changes", { event: "*", schema: "public", table: "caregivers" }, loadCaregivers)
    .on("postgres_changes", { event: "*", schema: "public", table: "week_caregivers" }, () => loadAssignments(currentWeekId()))
    .subscribe();
}

function startupSync() {
  startupPasses += 1;
  schedule();
  if (startupPasses >= 8) {
    clearInterval(startupTimer);
    startupTimer = null;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("button");
  if (!button) return;
  const isWeekNav = button.matches?.('button[aria-label="Semaine précédente"], button[aria-label="Semaine suivante"]');
  const isToday = button.textContent?.trim() === "Aujourd'hui";
  if (isWeekNav || isToday) setTimeout(schedule, 180);
}, true);

window.matchMedia?.("(max-width: 700px)")?.addEventListener?.("change", () => {
  document.querySelectorAll('[data-caregiver-picker="true"]').forEach((node) => { node.dataset.signature = ""; });
  schedule();
});

loadCaregivers();
activeWeek = currentWeekId();
if (activeWeek) loadAssignments(activeWeek);
subscribe();
startupTimer = setInterval(startupSync, 400);
queueMicrotask(schedule);

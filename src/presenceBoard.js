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
let notes = new Map();
let activeWeek = null;
let channel = null;
let frame = null;
let requestId = 0;
let pendingPresenceRender = false;
const noteTimers = new Map();
const NOTE_SAVE_DELAY_MS = 1500;

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

function formatDayDate(weekId, offset) {
  const monday = mondayFromWeekId(weekId);
  if (!monday) return "";
  const date = new Date(monday);
  date.setDate(monday.getDate() + offset);
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

function selectedFor(dayKey) {
  return assignments.get(dayKey) || new Set();
}

function noteFor(dayKey) {
  return notes.get(dayKey) || { special_event: "", early_leave: "" };
}

function textColor(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return "#fff";
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? "#2A241E" : "#fff";
}

function ensureSlot() {
  const main = document.querySelector("main");
  if (!main) return null;
  let slot = document.getElementById("presence-board-slot");
  if (!slot) {
    slot = document.createElement("section");
    slot.id = "presence-board-slot";
    slot.dataset.workspacePresence = "true";
    main.appendChild(slot);
  }
  return slot;
}

async function load() {
  const weekId = currentWeekId();
  if (!weekId) return;
  const id = ++requestId;
  const [caregiverResult, assignmentResult, noteResult] = await Promise.all([
    supabase.from("caregivers").select("id,name,color").order("created_at"),
    supabase.from("week_caregivers").select("day_key,caregiver_id").eq("week_id", weekId),
    supabase.from("week_presence_notes").select("day_key,special_event,early_leave").eq("week_id", weekId),
  ]);
  if (id !== requestId || weekId !== currentWeekId()) return;

  if (!caregiverResult.error) caregivers = caregiverResult.data || [];
  if (!assignmentResult.error) {
    assignments = new Map(DAYS.map(([, key]) => [key, new Set()]));
    (assignmentResult.data || []).forEach((row) => {
      if (!assignments.has(row.day_key)) assignments.set(row.day_key, new Set());
      assignments.get(row.day_key).add(row.caregiver_id);
    });
  }
  if (!noteResult.error) {
    notes = new Map((noteResult.data || []).map((row) => [row.day_key, row]));
  }
  activeWeek = weekId;
  const active = document.activeElement;
  if (active?.closest?.("#presence-board-slot")) {
    pendingPresenceRender = true;
  } else {
    pendingPresenceRender = false;
    schedule();
  }
}

async function toggleAssignment(dayKey, caregiverId, selected) {
  const weekId = currentWeekId();
  if (!weekId) return;
  const previous = new Set(selectedFor(dayKey));
  const next = new Set(previous);
  selected ? next.delete(caregiverId) : next.add(caregiverId);
  assignments.set(dayKey, next);
  schedule();

  const query = supabase.from("week_caregivers");
  const { error } = selected
    ? await query.delete().eq("week_id", weekId).eq("day_key", dayKey).eq("caregiver_id", caregiverId)
    : await query.upsert({ week_id: weekId, day_key: dayKey, caregiver_id: caregiverId }, { onConflict: "week_id,day_key,caregiver_id" });

  if (error) {
    console.error("save presence assignment", error);
    assignments.set(dayKey, previous);
    schedule();
  }
}

async function saveNote(dayKey, field, value) {
  const weekId = currentWeekId();
  if (!weekId) return;
  const current = { ...noteFor(dayKey), [field]: value };
  notes.set(dayKey, current);
  const { error } = await supabase.from("week_presence_notes").upsert({
    week_id: weekId,
    day_key: dayKey,
    special_event: current.special_event || "",
    early_leave: current.early_leave || "",
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("save presence note", error);
}

function caregiverButton(caregiver, dayKey) {
  const selected = selectedFor(dayKey).has(caregiver.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "presence-caregiver";
  button.setAttribute("aria-pressed", String(selected));
  button.textContent = caregiver.name;
  button.title = selected ? `Retirer ${caregiver.name}` : `Ajouter ${caregiver.name}`;
  button.style.borderColor = caregiver.color || COLORS[0];
  button.style.color = selected ? textColor(caregiver.color || COLORS[0]) : (caregiver.color || COLORS[0]);
  button.style.background = selected ? (caregiver.color || COLORS[0]) : "var(--card)";
  button.addEventListener("click", () => toggleAssignment(dayKey, caregiver.id, selected));
  return button;
}

function inputField(labelText, placeholder, value, onSave, saveKey) {
  const wrap = document.createElement("label");
  wrap.className = "presence-field";

  const label = document.createElement("span");
  label.textContent = labelText;

  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.placeholder = placeholder;
  textarea.value = value || "";

  const scheduleSave = () => {
    clearTimeout(noteTimers.get(saveKey));
    noteTimers.set(saveKey, setTimeout(() => {
      noteTimers.delete(saveKey);
      onSave(textarea.value.trim());
    }, NOTE_SAVE_DELAY_MS));
  };

  textarea.addEventListener("input", scheduleSave);
  textarea.addEventListener("blur", () => {
    clearTimeout(noteTimers.get(saveKey));
    noteTimers.delete(saveKey);
    onSave(textarea.value.trim());
  });

  wrap.append(label, textarea);
  return wrap;
}

async function addCaregiver() {
  const name = String(window.prompt("Nom de la gardienne :", "") || "").trim();
  if (!name) return;
  const existing = caregivers.find((item) => item.name.toLocaleLowerCase("fr-CA") === name.toLocaleLowerCase("fr-CA"));
  if (existing) return;
  const color = COLORS[caregivers.length % COLORS.length];
  const { error } = await supabase.from("caregivers").insert({ name, color });
  if (error) console.error("add caregiver", error);
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

  const header = document.createElement("div");
  header.className = "presence-board-header";
  header.innerHTML = "<strong>Présences et infos supplémentaires</strong>";
  slot.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "presence-grid";

  DAYS.forEach(([label, dayKey], index) => {
    const card = document.createElement("article");
    card.className = "presence-day-card";

    const title = document.createElement("h3");
    title.textContent = `${label} · ${formatDayDate(weekId, index)}`;

    const choices = document.createElement("div");
    choices.className = "presence-caregivers";
    caregivers.forEach((caregiver) => choices.appendChild(caregiverButton(caregiver, dayKey)));

    const dayNote = noteFor(dayKey);
    card.append(
      title,
      choices,
      inputField("Consigne spéciale de la part des parents", "Ex. rendez-vous", dayNote.special_event, (value) => saveNote(dayKey, "special_event", value), `${weekId}:${dayKey}:special_event`),
      inputField("Information des gardiennes", "Ajustement d’horaire", dayNote.early_leave, (value) => saveNote(dayKey, "early_leave", value), `${weekId}:${dayKey}:early_leave`)
    );
    grid.appendChild(card);
  });

  slot.appendChild(grid);

  const add = document.createElement("button");
  add.type = "button";
  add.className = "presence-add-caregiver";
  add.textContent = "+ Ajouter une gardienne";
  add.addEventListener("click", addCaregiver);
  slot.appendChild(add);
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(render);
}

function subscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel("presence-board")
    .on("postgres_changes", { event: "*", schema: "public", table: "caregivers" }, load)
    .on("postgres_changes", { event: "*", schema: "public", table: "week_caregivers" }, load)
    .on("postgres_changes", { event: "*", schema: "public", table: "week_presence_notes" }, load)
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
setTimeout(load, 200);
setTimeout(load, 800);


document.addEventListener("focusout", (event) => {
  if (!event.target?.closest?.("#presence-board-slot") || !pendingPresenceRender) return;
  setTimeout(() => {
    if (document.activeElement?.closest?.("#presence-board-slot")) return;
    pendingPresenceRender = false;
    schedule();
  }, 0);
}, true);

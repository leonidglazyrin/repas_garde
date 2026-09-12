import { supabase } from "./supabaseClient.js";

const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];

let profiles = [];
let assignments = new Map();
let activeWeekId = null;
let channel = null;
let profileChannel = null;

function currentDisplayedWeekId() {
  return document.body?.innerText?.match(/Semaine\s+(\d{4}-S\d{2})/)?.[1] || null;
}

function getMonday(date) {
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  if (day !== 1) monday.setDate(monday.getDate() - (day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekId(monday) {
  const target = new Date(monday.valueOf());
  const dayNr = (monday.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  const weekNumber = 1 + Math.round((firstThursday - target) / (7 * 24 * 3600 * 1000));
  return `${monday.getFullYear()}-S${String(weekNumber).padStart(2, "0")}`;
}

function getMealRows() {
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

function assignmentSet(dayKey) {
  return assignments.get(dayKey) || new Set();
}

async function loadProfiles() {
  const { data, error } = await supabase.from("profiles").select("id,name,color").order("created_at", { ascending: true });
  if (error) {
    console.error("week responsibility profiles", error);
    return;
  }
  profiles = data || [];
  mount();
}

async function loadAssignments(weekId) {
  if (!weekId) return;
  const { data, error } = await supabase
    .from("week_meal_profiles")
    .select("day_key,profile_id")
    .eq("week_id", weekId);
  if (error) {
    console.error("week responsibility assignments", error);
    return;
  }
  const next = new Map();
  (data || []).forEach((row) => {
    if (!next.has(row.day_key)) next.set(row.day_key, new Set());
    next.get(row.day_key).add(row.profile_id);
  });
  assignments = next;
  mount();
}

async function toggleAssignment(dayKey, profileId) {
  const weekId = currentDisplayedWeekId();
  if (!weekId) return;
  const selected = assignmentSet(dayKey);
  const isSelected = selected.has(profileId);

  if (isSelected) selected.delete(profileId);
  else selected.add(profileId);
  assignments.set(dayKey, new Set(selected));
  mount();

  const query = supabase.from("week_meal_profiles");
  const { error } = isSelected
    ? await query.delete().eq("week_id", weekId).eq("day_key", dayKey).eq("profile_id", profileId)
    : await query.insert({ week_id: weekId, day_key: dayKey, profile_id: profileId });

  if (error) {
    console.error("toggle week responsibility", error);
    await loadAssignments(weekId);
  }
}

function buildPicker(dayKey) {
  const wrap = document.createElement("div");
  wrap.dataset.mealResponsibility = dayKey;
  Object.assign(wrap.style, {
    marginTop: "7px",
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    alignItems: "center",
  });

  if (!profiles.length) {
    const hint = document.createElement("span");
    hint.textContent = "Aucun profil";
    Object.assign(hint.style, { fontSize: "10px", color: "var(--ink-soft)" });
    wrap.appendChild(hint);
    return wrap;
  }

  const selected = assignmentSet(dayKey);
  profiles.forEach((profile) => {
    const active = selected.has(profile.id);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.responsibilityProfile = profile.id;
    button.title = active ? `Retirer ${profile.name} des responsables` : `Ajouter ${profile.name} aux responsables`;
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", `${profile.name} responsable ce soir`);
    button.textContent = profile.name;
    Object.assign(button.style, {
      minHeight: "24px",
      padding: "3px 6px",
      borderRadius: "12px",
      border: `1px solid ${profile.color || "var(--line)"}`,
      background: active ? (profile.color || "var(--herb)") : "var(--card)",
      color: active ? "#fff" : "var(--ink)",
      fontSize: "10px",
      fontWeight: "700",
      cursor: "pointer",
      lineHeight: "1.1",
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleAssignment(dayKey, profile.id);
    });
    wrap.appendChild(button);
  });
  return wrap;
}

function mount() {
  const weekId = currentDisplayedWeekId();
  if (!weekId) return;
  if (weekId !== activeWeekId) {
    activeWeekId = weekId;
    assignments = new Map();
    loadAssignments(weekId);
    subscribeWeek(weekId);
  }

  getMealRows().forEach(({ row, dayKey }) => {
    const dayColumn = row.firstElementChild;
    if (!dayColumn) return;
    dayColumn.querySelector(`[data-meal-responsibility="${dayKey}"]`)?.remove();
    dayColumn.appendChild(buildPicker(dayKey));
    dayColumn.style.width = "118px";
  });

  keepWeekendOpen();
}

function keepWeekendOpen() {
  const textarea = document.querySelector('textarea[placeholder^="Ce qui est déjà prêt"]');
  if (!textarea) return;
  let node = textarea.parentElement;
  while (node && node !== document.body) {
    if ((node.textContent || "").includes("Fin de semaine")) {
      node.dataset.weekendAlwaysOpen = "true";
      node.style.setProperty("display", "flex", "important");
      node.style.removeProperty("height");
      node.style.removeProperty("visibility");
      textarea.style.removeProperty("display");
      break;
    }
    node = node.parentElement;
  }
}

function subscribeWeek(weekId) {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel(`week-meal-profiles-${weekId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "week_meal_profiles", filter: `week_id=eq.${weekId}` }, () => loadAssignments(weekId))
    .subscribe();
}

function subscribeProfiles() {
  if (profileChannel) supabase.removeChannel(profileChannel);
  profileChannel = supabase
    .channel("week-responsibility-profiles")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadProfiles)
    .subscribe();
}

function maybeAdvancePastFinishedWeek() {
  const now = new Date();
  const currentWeekId = getWeekId(getMonday(now));
  const displayedWeekId = currentDisplayedWeekId();
  if (!displayedWeekId || displayedWeekId !== currentWeekId) return;

  const afterFridayCutoff = now.getDay() === 6 || now.getDay() === 0 || (now.getDay() === 5 && (now.getHours() > 19 || (now.getHours() === 19 && now.getMinutes() >= 30)));
  if (!afterFridayCutoff) return;

  const storageKey = `repasgarde:auto-next:${currentWeekId}`;
  if (sessionStorage.getItem(storageKey) === "1") return;
  const nextButton = document.querySelector('button[aria-label="Semaine suivante"]');
  if (!nextButton) return;
  sessionStorage.setItem(storageKey, "1");
  nextButton.click();
  setTimeout(mount, 250);
}

document.addEventListener("click", (event) => {
  const nav = event.target?.closest?.('button[aria-label="Semaine précédente"], button[aria-label="Semaine suivante"]');
  if (nav) setTimeout(mount, 180);
});

document.addEventListener("meal-rating-changed", () => setTimeout(mount, 0));

loadProfiles();
subscribeProfiles();
setTimeout(() => {
  mount();
  maybeAdvancePastFinishedWeek();
}, 250);
setTimeout(mount, 900);

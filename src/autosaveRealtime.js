import { supabase, supabaseConfigured } from "./supabaseClient";

const DAY_KEYS = {
  Lundi: "mon",
  Mardi: "tue",
  Mercredi: "wed",
  Jeudi: "thu",
  Vendredi: "fri",
};

// On attend une vraie pause de saisie avant d'écrire dans Supabase.
// Cela évite qu'un retour Realtime arrive pendant que quelqu'un est encore en train de taper.
const AUTOSAVE_DELAY_MS = 1500;
const REALTIME_WARNING_DELAY_MS = 5000;

const mealTimers = new Map();
let weekendTimer = null;
let badgeTimer = null;
let realtimeWarningTimer = null;
let realtimeHealthy = false;

function getWeekId() {
  const match = document.body?.innerText?.match(/Semaine\s+(\d{4}-S\d{2})/);
  return match?.[1] || null;
}

function ensureBadge() {
  let badge = document.getElementById("autosave-sync-badge");
  if (badge) return badge;

  badge = document.createElement("div");
  badge.id = "autosave-sync-badge";
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-live", "polite");
  Object.assign(badge.style, {
    position: "fixed",
    right: "14px",
    bottom: "14px",
    zIndex: "9999",
    padding: "8px 11px",
    borderRadius: "999px",
    background: "rgba(47, 59, 44, 0.94)",
    color: "#F3EFE4",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "12px",
    fontWeight: "600",
    boxShadow: "0 4px 16px rgba(0,0,0,.18)",
    opacity: "0",
    transform: "translateY(5px)",
    transition: "opacity .16s ease, transform .16s ease",
    pointerEvents: "none",
  });
  document.body.appendChild(badge);
  return badge;
}

function showBadge(message, persistent = false) {
  const badge = ensureBadge();
  badge.textContent = message;
  badge.style.opacity = "1";
  badge.style.transform = "translateY(0)";
  clearTimeout(badgeTimer);
  if (!persistent) {
    badgeTimer = setTimeout(() => {
      badge.style.opacity = "0";
      badge.style.transform = "translateY(5px)";
    }, 1200);
  }
}

function ensureRefreshReminder() {
  let reminder = document.getElementById("refresh-reminder");
  if (reminder) return reminder;

  reminder = document.createElement("div");
  reminder.id = "refresh-reminder";
  reminder.setAttribute("role", "note");
  reminder.setAttribute("aria-live", "polite");
  reminder.textContent = "↻ N’oubliez pas d’actualiser la page pour voir les dernières modifications";
  Object.assign(reminder.style, {
    position: "fixed",
    top: "12px",
    right: "12px",
    zIndex: "10001",
    maxWidth: "min(430px, calc(100vw - 24px))",
    padding: "9px 13px",
    borderRadius: "999px",
    background: "#F6E9D3",
    color: "#2A241E",
    border: "1px solid #C98A3B",
    boxShadow: "0 4px 14px rgba(0,0,0,.16)",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1.25",
    textAlign: "center",
    opacity: "0",
    transform: "translateY(-5px)",
    transition: "opacity .2s ease, transform .2s ease",
    pointerEvents: "none",
  });
  document.body.appendChild(reminder);
  return reminder;
}

function setRefreshReminderVisible(visible) {
  const reminder = ensureRefreshReminder();
  reminder.style.opacity = visible ? "1" : "0";
  reminder.style.transform = visible ? "translateY(0)" : "translateY(-5px)";
}

function markRealtimeHealthy() {
  realtimeHealthy = true;
  clearTimeout(realtimeWarningTimer);
  setRefreshReminderVisible(false);
}

function markRealtimeUnavailable() {
  realtimeHealthy = false;
  clearTimeout(realtimeWarningTimer);
  setRefreshReminderVisible(true);
}

function monitorRealtimeHealth() {
  ensureRefreshReminder();

  if (!supabaseConfigured || !navigator.onLine) {
    markRealtimeUnavailable();
    return;
  }

  // Ce canal ne transporte aucune donnée métier. Il sert uniquement à vérifier
  // que la connexion Realtime est réellement active. Tant qu'elle fonctionne,
  // le rappel d'actualisation reste caché.
  const channel = supabase.channel("realtime-ui-health").subscribe((status) => {
    if (status === "SUBSCRIBED") {
      markRealtimeHealthy();
      return;
    }

    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      markRealtimeUnavailable();
    }
  });

  realtimeWarningTimer = setTimeout(() => {
    if (!realtimeHealthy) setRefreshReminderVisible(true);
  }, REALTIME_WARNING_DELAY_MS);

  window.addEventListener("offline", markRealtimeUnavailable);
  window.addEventListener("online", () => {
    // On ne cache pas le rappel simplement parce qu'Internet revient :
    // on attend la confirmation SUBSCRIBED du canal Realtime.
    if (!realtimeHealthy) {
      clearTimeout(realtimeWarningTimer);
      realtimeWarningTimer = setTimeout(() => {
        if (!realtimeHealthy) setRefreshReminderVisible(true);
      }, REALTIME_WARNING_DELAY_MS);
    }
  });

  window.addEventListener("beforeunload", () => {
    supabase.removeChannel(channel);
  });
}

function applyAppTitle() {
  const title = "Les souper de la semaine";
  document.title = title;
  const heading = document.querySelector("h1");
  if (heading) heading.textContent = title;
}

function findMealRow(element) {
  let node = element?.parentElement;
  while (node && node !== document.body) {
    if (
      node.querySelector?.('input[placeholder="Nom du souper"]') &&
      node.querySelector?.('textarea[placeholder^="Ingrédients"]') &&
      node.querySelector?.('input[placeholder^="Commentaire du parent"]')
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function getDayKey(row) {
  const text = row?.innerText || "";
  for (const [label, key] of Object.entries(DAY_KEYS)) {
    if (text.includes(label)) return key;
  }
  return null;
}

function getStatus(row) {
  const active = row.querySelector('button[aria-pressed="true"]');
  const label = active?.textContent || "";
  if (label.includes("Approuvé")) return "approved";
  if (label.includes("Refusé")) return "refused";
  return "pending";
}

function snapshotMeal(row) {
  const weekId = getWeekId();
  const dayKey = getDayKey(row);
  if (!weekId || !dayKey) return null;
  return {
    week_id: weekId,
    day_key: dayKey,
    name: row.querySelector('input[placeholder="Nom du souper"]')?.value || "",
    ingredients: row.querySelector('textarea[placeholder^="Ingrédients"]')?.value || "",
    comment: row.querySelector('input[placeholder^="Commentaire du parent"]')?.value || "",
    status: getStatus(row),
    updated_at: new Date().toISOString(),
  };
}

async function saveMeal(snapshot) {
  if (!supabaseConfigured || !snapshot) return;
  showBadge("↻ Enregistrement…", true);
  const { error } = await supabase.from("week_meals").upsert(snapshot);
  if (error) {
    console.error("autosave week_meals", error);
    showBadge(`! ${error.message || "Erreur d’enregistrement"}`);
    return;
  }
  showBadge("✓ Enregistré et synchronisé");
}

function scheduleMealSave(row) {
  const initialSnapshot = snapshotMeal(row);
  if (!initialSnapshot) return;
  const key = `${initialSnapshot.week_id}:${initialSnapshot.day_key}`;
  clearTimeout(mealTimers.get(key));
  mealTimers.set(
    key,
    setTimeout(() => {
      mealTimers.delete(key);
      // On relit la valeur au dernier moment pour enregistrer exactement ce qui est affiché.
      saveMeal(snapshotMeal(row));
    }, AUTOSAVE_DELAY_MS)
  );
}

async function saveWeekend(textarea) {
  if (!supabaseConfigured) return;
  const weekId = getWeekId();
  if (!weekId) return;
  const snapshot = {
    week_id: weekId,
    note: textarea.value || "",
    updated_at: new Date().toISOString(),
  };
  showBadge("↻ Enregistrement…", true);
  const { error } = await supabase.from("weekend_notes").upsert(snapshot);
  if (error) {
    console.error("autosave weekend_notes", error);
    showBadge(`! ${error.message || "Erreur d’enregistrement"}`);
    return;
  }
  showBadge("✓ Enregistré et synchronisé");
}

function isMealField(target) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  const placeholder = target.getAttribute("placeholder") || "";
  return placeholder === "Nom du souper" || placeholder.startsWith("Ingrédients") || placeholder.startsWith("Commentaire du parent");
}

function isWeekendField(target) {
  return target instanceof HTMLTextAreaElement && (target.getAttribute("placeholder") || "").startsWith("Ce qui est déjà prêt");
}

// Une seule écriture après 1,5 s sans frappe. Les événements IME/composition
// (accents, claviers mobiles, prédiction) ne déclenchent pas de sauvegarde au milieu d'un mot.
document.addEventListener("input", (event) => {
  if (event.isComposing) return;
  const target = event.target;
  if (isMealField(target)) {
    const row = findMealRow(target);
    if (row) scheduleMealSave(row);
    return;
  }
  if (isWeekendField(target)) {
    clearTimeout(weekendTimer);
    weekendTimer = setTimeout(() => saveWeekend(target), AUTOSAVE_DELAY_MS);
  }
});

// Le rendu React se fait juste après l'import de ce module.
queueMicrotask(() => {
  applyAppTitle();
  monitorRealtimeHealth();
});
setTimeout(applyAppTitle, 100);

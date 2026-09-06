import { supabase, supabaseConfigured } from "./supabaseClient";

const DAY_KEYS = {
  Lundi: "mon",
  Mardi: "tue",
  Mercredi: "wed",
  Jeudi: "thu",
  Vendredi: "fri",
};

const mealTimers = new Map();
let weekendTimer = null;
let badgeTimer = null;

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
  const snapshot = snapshotMeal(row);
  if (!snapshot) return;
  const key = `${snapshot.week_id}:${snapshot.day_key}`;
  clearTimeout(mealTimers.get(key));
  mealTimers.set(
    key,
    setTimeout(() => {
      mealTimers.delete(key);
      saveMeal(snapshot);
    }, 300)
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

// Une seule écriture après une courte pause de saisie. Cela conserve l'auto-enregistrement
// tout en évitant des dizaines de requêtes Supabase et de rafraîchissements Realtime.
document.addEventListener("input", (event) => {
  const target = event.target;
  if (isMealField(target)) {
    const row = findMealRow(target);
    if (row) scheduleMealSave(row);
    return;
  }
  if (isWeekendField(target)) {
    clearTimeout(weekendTimer);
    weekendTimer = setTimeout(() => saveWeekend(target), 300);
  }
});

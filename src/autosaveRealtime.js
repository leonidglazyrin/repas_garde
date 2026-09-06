import { supabase, supabaseConfigured } from "./supabaseClient";

const DAY_KEYS = {
  Lundi: "mon",
  Mardi: "tue",
  Mercredi: "wed",
  Jeudi: "thu",
  Vendredi: "fri",
};

const mealQueues = new WeakMap();
let weekendQueue = Promise.resolve();
let badgeTimer;

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
    display: "flex",
    alignItems: "center",
    gap: "7px",
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
    transition: "opacity .18s ease, transform .18s ease",
    pointerEvents: "none",
  });
  document.body.appendChild(badge);
  return badge;
}

function showBadge(state, message) {
  const badge = ensureBadge();
  const icon = state === "saved" ? "✓" : state === "error" ? "!" : "↻";
  badge.textContent = `${icon} ${message}`;
  badge.style.opacity = "1";
  badge.style.transform = "translateY(0)";
  clearTimeout(badgeTimer);
  if (state !== "saving") {
    badgeTimer = setTimeout(() => {
      badge.style.opacity = "0";
      badge.style.transform = "translateY(5px)";
    }, 1500);
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
  const active = Array.from(row.querySelectorAll('button[aria-pressed="true"]'));
  const label = active.map((button) => button.textContent || "").join(" ");
  if (label.includes("Approuvé")) return "approved";
  if (label.includes("Refusé")) return "refused";
  return "pending";
}

function snapshotMealRow(row) {
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

async function persistMeal(snapshot) {
  if (!supabaseConfigured || !snapshot) return;
  showBadge("saving", "Enregistrement…");
  const { error } = await supabase.from("week_meals").upsert(snapshot);

  if (error) {
    console.error("autosave week_meals", error);
    showBadge("error", `Erreur: ${error.message || "enregistrement impossible"}`);
    throw error;
  }

  showBadge("saved", "Enregistré et synchronisé");
}

function queueMealSave(row) {
  const snapshot = snapshotMealRow(row);
  if (!snapshot) return;

  const previous = mealQueues.get(row) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => persistMeal(snapshot));
  mealQueues.set(row, next);
}

function queueWeekendSave(textarea) {
  if (!supabaseConfigured) return;
  const weekId = getWeekId();
  if (!weekId) return;

  const snapshot = {
    week_id: weekId,
    note: textarea.value || "",
    updated_at: new Date().toISOString(),
  };

  weekendQueue = weekendQueue
    .catch(() => {})
    .then(async () => {
      showBadge("saving", "Enregistrement…");
      const { error } = await supabase.from("weekend_notes").upsert(snapshot);
      if (error) {
        console.error("autosave weekend_notes", error);
        showBadge("error", `Erreur: ${error.message || "enregistrement impossible"}`);
        throw error;
      }
      showBadge("saved", "Enregistré et synchronisé");
    });
}

function isMealField(target) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  const placeholder = target.getAttribute("placeholder") || "";
  return (
    placeholder === "Nom du souper" ||
    placeholder.startsWith("Ingrédients") ||
    placeholder.startsWith("Commentaire du parent")
  );
}

function isWeekendField(target) {
  return (
    target instanceof HTMLTextAreaElement &&
    (target.getAttribute("placeholder") || "").startsWith("Ce qui est déjà prêt")
  );
}

function decorateActionButtons() {
  document.querySelectorAll("button").forEach((button) => {
    if (button.querySelector("svg") || button.dataset.addIcon === "true") return;
    const label = (button.textContent || "").trim();
    if (label !== "Ajouter" && label !== "Enregistrer") return;

    const icon = document.createElement("span");
    icon.textContent = "+";
    icon.setAttribute("aria-hidden", "true");
    icon.style.fontSize = "16px";
    icon.style.lineHeight = "1";
    icon.style.fontWeight = "700";
    icon.style.marginRight = "6px";
    button.prepend(icon);
    button.dataset.addIcon = "true";
  });
}

// Chaque frappe est mise en file et persistée dans l'ordre. Ainsi, même si la
// personne tape vite, la dernière valeur finit toujours dans Supabase.
document.addEventListener("input", (event) => {
  const target = event.target;

  if (isMealField(target)) {
    const row = findMealRow(target);
    if (row) queueMealSave(row);
    return;
  }

  if (isWeekendField(target)) {
    queueWeekendSave(target);
  }
});

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("button");
  if (!button) return;

  const text = button.textContent || "";
  if (text.includes("En attente") || text.includes("Approuvé") || text.includes("Refusé")) {
    const row = findMealRow(button);
    if (!row) return;
    setTimeout(() => queueMealSave(row), 0);
    return;
  }

  if (/Ajouter|Enregistrer|Copier la semaine/.test(text)) {
    showBadge("saving", "Synchronisation…");
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => showBadge("saved", "Synchronisé"), 700);
  }
});

const observer = new MutationObserver(() => decorateActionButtons());
observer.observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(decorateActionButtons);

// App.jsx est abonné à Supabase Realtime. Dès qu'une écriture arrive dans la
// base, les autres appareils rechargent automatiquement les données concernées.

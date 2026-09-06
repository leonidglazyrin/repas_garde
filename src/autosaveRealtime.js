import { supabase, supabaseConfigured } from "./supabaseClient";

const DAY_KEYS = {
  Lundi: "mon",
  Mardi: "tue",
  Mercredi: "wed",
  Jeudi: "thu",
  Vendredi: "fri",
};

const timers = new WeakMap();
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
    }, 1800);
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

async function saveMealRow(row) {
  if (!supabaseConfigured) return;
  const weekId = getWeekId();
  const dayKey = getDayKey(row);
  if (!weekId || !dayKey) return;

  const name = row.querySelector('input[placeholder="Nom du souper"]')?.value || "";
  const ingredients = row.querySelector('textarea[placeholder^="Ingrédients"]')?.value || "";
  const comment = row.querySelector('input[placeholder^="Commentaire du parent"]')?.value || "";
  const status = getStatus(row);

  showBadge("saving", "Enregistrement…");
  const { error } = await supabase.from("week_meals").upsert({
    week_id: weekId,
    day_key: dayKey,
    name,
    ingredients,
    comment,
    status,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("autosave week_meals", error);
    showBadge("error", "Erreur d’enregistrement");
  } else {
    showBadge("saved", "Enregistré et synchronisé");
  }
}

async function saveWeekend(textarea) {
  if (!supabaseConfigured) return;
  const weekId = getWeekId();
  if (!weekId) return;

  showBadge("saving", "Enregistrement…");
  const { error } = await supabase.from("weekend_notes").upsert({
    week_id: weekId,
    note: textarea.value || "",
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("autosave weekend_notes", error);
    showBadge("error", "Erreur d’enregistrement");
  } else {
    showBadge("saved", "Enregistré et synchronisé");
  }
}

function debounce(element, callback, delay = 450) {
  const oldTimer = timers.get(element);
  if (oldTimer) clearTimeout(oldTimer);
  const timer = setTimeout(callback, delay);
  timers.set(element, timer);
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

document.addEventListener("input", (event) => {
  const target = event.target;

  if (isMealField(target)) {
    const row = findMealRow(target);
    if (!row) return;
    showBadge("saving", "Modification…");
    debounce(target, () => saveMealRow(row));
    return;
  }

  if (isWeekendField(target)) {
    showBadge("saving", "Modification…");
    debounce(target, () => saveWeekend(target));
  }
});

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("button");
  if (!button) return;

  const text = button.textContent || "";
  if (text.includes("En attente") || text.includes("Approuvé") || text.includes("Refusé")) {
    const row = findMealRow(button);
    if (!row) return;
    setTimeout(() => saveMealRow(row), 0);
    return;
  }

  if (/Ajouter|Enregistrer|Copier la semaine/.test(text)) {
    showBadge("saving", "Synchronisation…");
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => showBadge("saved", "Synchronisé"), 800);
  }
});

const observer = new MutationObserver(() => decorateActionButtons());
observer.observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(decorateActionButtons);

// Les abonnements Realtime de App.jsx rechargent déjà les données dès qu'un autre
// appareil écrit dans Supabase. Ce module ajoute l'auto-enregistrement des champs
// pendant la saisie, les icônes d'ajout et un indicateur visuel de synchronisation.

const DAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
let highlightTimer = null;

function getLocalToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatShort(date) {
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
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

function currentDisplayedWeekId() {
  return document.body?.innerText?.match(/Semaine\s+(\d{4}-S\d{2})/)?.[1] || null;
}

function findMealRowFromInput(input) {
  let node = input?.parentElement;
  while (node && node !== document.body) {
    if (
      node.querySelector?.('input[placeholder="Nom du souper"]') &&
      node.querySelector?.('textarea[placeholder^="Ingrédients"]') &&
      node.querySelector?.('input[placeholder^="Commentaire du parent"]')
    ) return node;
    node = node.parentElement;
  }
  return null;
}

function findWeekendCard() {
  const textarea = Array.from(document.querySelectorAll("textarea")).find((node) =>
    (node.getAttribute("placeholder") || "").startsWith("Ce qui est déjà prêt")
  );
  if (!textarea) return null;
  let node = textarea.parentElement;
  while (node && node !== document.body) {
    if ((node.innerText || "").includes("Fin de semaine") && node.querySelector("textarea") === textarea) return node;
    node = node.parentElement;
  }
  return null;
}

function findTodayCard(today) {
  const dayIndex = today.getDay();
  if (dayIndex >= 1 && dayIndex <= 5) {
    const label = DAY_LABELS[dayIndex];
    const expectedDate = formatShort(today).replace(/\.$/, "");
    for (const input of document.querySelectorAll('input[placeholder="Nom du souper"]')) {
      const row = findMealRowFromInput(input);
      if (!row) continue;
      const text = (row.innerText || "").replace(/\./g, "");
      if (text.includes(label) && text.includes(expectedDate)) return row;
    }
    return null;
  }
  return findWeekendCard();
}

function scrollCardIntoView(card) {
  const headerHeight = document.querySelector("header")?.getBoundingClientRect().height || 0;
  const rect = card.getBoundingClientRect();
  const targetY = Math.max(0, window.scrollY + rect.top - headerHeight - 14);
  // Aucun scroll animé : il provoquait des recalculs concurrents sur mobile.
  window.scrollTo({ top: targetY, behavior: "auto" });
}

function focusToday(today) {
  const card = findTodayCard(today);
  if (!card) return false;
  scrollCardIntoView(card);

  const previousOutline = card.style.outline;
  const previousOffset = card.style.outlineOffset;
  card.style.outline = "3px solid var(--honey)";
  card.style.outlineOffset = "3px";

  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    card.style.outline = previousOutline;
    card.style.outlineOffset = previousOffset;
  }, 1800);
  return true;
}

function focusAfterReactUpdate() {
  const today = getLocalToday();
  const expectedWeekId = getWeekId(getMonday(today));
  let attempts = 0;
  const tryFocus = () => {
    attempts += 1;
    if (currentDisplayedWeekId() === expectedWeekId && focusToday(today)) return;
    if (attempts < 20) setTimeout(tryFocus, 100);
  };
  setTimeout(tryFocus, 80);
}

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("button");
  if (!button || button.textContent?.trim() !== "Aujourd'hui") return;
  focusAfterReactUpdate();
});

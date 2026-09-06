const DAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
let highlightTimer = null;

function findMealRowFromInput(input) {
  let node = input?.parentElement;
  while (node && node !== document.body) {
    if (
      node.querySelector?.('input[placeholder="Nom du souper"]') &&
      node.querySelector?.('textarea[placeholder^="Ingrédients"]')
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function findTodayCard() {
  const today = new Date();
  const dayIndex = today.getDay();

  if (dayIndex >= 1 && dayIndex <= 5) {
    const label = DAY_LABELS[dayIndex];
    for (const input of document.querySelectorAll('input[placeholder="Nom du souper"]')) {
      const row = findMealRowFromInput(input);
      if (row && (row.innerText || "").includes(label)) return row;
    }
    return null;
  }

  return Array.from(document.querySelectorAll("main > div > div, main div")).find((node) =>
    (node.innerText || "").includes("Fin de semaine")
  ) || null;
}

function focusToday() {
  const card = findTodayCard();
  if (!card) return false;

  card.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

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
  let attempts = 0;
  const tryFocus = () => {
    attempts += 1;
    if (focusToday() || attempts >= 12) return;
    setTimeout(tryFocus, 80);
  };
  setTimeout(tryFocus, 40);
}

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("button");
  if (!button || button.textContent?.trim() !== "Aujourd'hui") return;
  focusAfterReactUpdate();
});

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

function maybeAdvancePastFinishedWeek() {
  const now = new Date();
  const currentWeekId = getWeekId(getMonday(now));
  const displayedWeekId = currentDisplayedWeekId();
  if (!displayedWeekId || displayedWeekId !== currentWeekId) return;

  const afterFridayCutoff =
    now.getDay() === 6 ||
    now.getDay() === 0 ||
    (now.getDay() === 5 && (now.getHours() > 19 || (now.getHours() === 19 && now.getMinutes() >= 30)));
  if (!afterFridayCutoff) return;

  const storageKey = `repasgarde:auto-next:${currentWeekId}`;
  if (sessionStorage.getItem(storageKey) === "1") return;
  const nextButton = document.querySelector('button[aria-label="Semaine suivante"]');
  if (!nextButton) return;

  sessionStorage.setItem(storageKey, "1");
  nextButton.click();
  setTimeout(keepWeekendOpen, 250);
}

document.addEventListener("click", (event) => {
  const nav = event.target?.closest?.('button[aria-label="Semaine précédente"], button[aria-label="Semaine suivante"]');
  if (nav) setTimeout(keepWeekendOpen, 180);
});

document.addEventListener("input", () => setTimeout(keepWeekendOpen, 0), true);

setTimeout(() => {
  keepWeekendOpen();
  maybeAdvancePastFinishedWeek();
}, 250);
setTimeout(keepWeekendOpen, 900);

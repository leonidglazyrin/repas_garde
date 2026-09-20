const TABS = [
  ["meals", "Repas de la semaine"],
  ["grocery", "Épicerie"],
  ["presence", "Présence et infos"],
];

let activeTab = localStorage.getItem("repasgarde:active-tab") || "meals";
if (!TABS.some(([key]) => key === activeTab)) activeTab = "meals";
let observer = null;
let frame = null;

function directChildOfMain(node) {
  const main = document.querySelector("main");
  let current = node;
  while (current && current.parentElement !== main) current = current.parentElement;
  return current?.parentElement === main ? current : null;
}

function markSections() {
  frame = null;
  const main = document.querySelector("main");
  if (!main) return;

  const profileSection = Array.from(main.children).find((child) => {
    const text = child.textContent || "";
    return text.includes("Profils et restrictions") || text.includes("Ajouter un profil");
  });
  if (profileSection) profileSection.dataset.workspaceHidden = "true";

  const librarySection = Array.from(main.children).find((child) =>
    (child.textContent || "").includes("Bibliothèque de plats déjà utilisés")
  );
  if (librarySection) librarySection.dataset.workspaceHidden = "true";

  const mealInput = main.querySelector('input[placeholder="Nom du souper"]');
  const mealBlock = directChildOfMain(mealInput);
  if (mealBlock) mealBlock.dataset.workspaceMeals = "true";

  Array.from(main.children).forEach((child) => {
    const text = child.textContent || "";
    if (text.includes("en attente d'approbation") || text.includes("Tous les soupers saisis")) {
      child.dataset.workspaceMeals = "true";
    }
    if (text.includes("Liste d'épicerie") || text.includes("Épicerie des repas")) child.dataset.workspaceGrocery = "true";
  });

  const common = document.getElementById("common-grocery-wrapper-stable");
  if (common) common.dataset.workspaceGrocery = "true";

  const quickNav = document.getElementById("parent-quick-nav");
  if (quickNav) quickNav.dataset.workspaceMeals = "true";

  const overview = document.getElementById("week-compact-overview");
  if (overview) overview.dataset.workspaceMeals = "true";

  const ratings = document.getElementById("meal-rating-panel");
  if (ratings) ratings.dataset.workspaceMeals = "true";

  const discovery = document.getElementById("discover-dishes-slot");
  if (discovery) discovery.dataset.workspaceMeals = "true";

  const groceryMeals = document.getElementById("grocery-meal-details");
  if (groceryMeals) groceryMeals.dataset.workspaceGrocery = "true";

  const presence = document.getElementById("presence-board-slot");
  if (presence) presence.dataset.workspacePresence = "true";

  main.dataset.workspaceReady = "true";
}

function scheduleMark() {
  if (frame !== null) return;
  frame = requestAnimationFrame(markSections);
}

function selectTab(key) {
  activeTab = key;
  localStorage.setItem("repasgarde:active-tab", key);
  document.body.dataset.appTab = key;
  document.querySelectorAll("[data-app-tab-button]").forEach((button) => {
    const active = button.dataset.appTabButton === key;
    button.setAttribute("aria-selected", String(active));
  });
  scheduleMark();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function ensureTabs() {
  const header = document.querySelector("header");
  const main = document.querySelector("main");
  if (!header || !main) return false;

  let nav = document.getElementById("app-section-tabs");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "app-section-tabs";
    nav.setAttribute("aria-label", "Sections de l'application");

    TABS.forEach(([key, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.appTabButton = key;
      button.textContent = label;
      button.addEventListener("click", () => selectTab(key));
      nav.appendChild(button);
    });

    header.insertAdjacentElement("afterend", nav);
  }

  selectTab(activeTab);

  if (!observer) {
    observer = new MutationObserver(scheduleMark);
    observer.observe(main, { childList: true });
  }

  return true;
}

let tries = 0;
function boot() {
  if (ensureTabs()) return;
  tries += 1;
  if (tries < 30) setTimeout(boot, 100);
}

boot();
document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("button");
  if (!button) return;
  if (button.matches?.('button[aria-label="Semaine précédente"], button[aria-label="Semaine suivante"]') || button.textContent?.trim() === "Aujourd'hui") {
    setTimeout(scheduleMark, 200);
  }
}, true);

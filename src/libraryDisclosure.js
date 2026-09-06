function findLibrarySection() {
  return Array.from(document.querySelectorAll("main > section")).find((section) =>
    (section.textContent || "").includes("Bibliothèque de plats déjà utilisés")
  );
}

function getLibraryContent(section) {
  return Array.from(section.children).find((child) =>
    child.querySelector?.('input[placeholder="Chercher un plat ou un ingrédient..."]') ||
    child.querySelector?.('input[placeholder="Filtrer les plats déjà faits ou un ingrédient..."]')
  ) || null;
}

function getSearchInput(section) {
  return getLibraryContent(section)?.querySelector?.(
    'input[placeholder="Chercher un plat ou un ingrédient..."], input[placeholder="Filtrer les plats déjà faits ou un ingrédient..."]'
  ) || null;
}

function getSearchRow(section) {
  return getSearchInput(section)?.parentElement || null;
}

function getResultsBlocks(section) {
  const content = getLibraryContent(section);
  const searchRow = getSearchRow(section);
  if (!content) return [];

  return Array.from(content.children).filter((child) => {
    if (child === searchRow) return false;
    if (child.dataset.libraryTabs === "true") return false;
    if (child.querySelector?.('input[placeholder="Nom du plat"]')) return false;
    return true;
  });
}

function styleTab(button) {
  Object.assign(button.style, {
    width: "100%",
    minHeight: "42px",
    border: "1px solid var(--herb)",
    borderRadius: "8px",
    padding: "9px 12px",
    background: "var(--herb-soft)",
    color: "var(--herb)",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "default",
  });
  button.setAttribute("aria-selected", "true");
}

function ensureTabs(section) {
  const content = getLibraryContent(section);
  if (!content) return;

  let tabs = content.querySelector("[data-library-tabs]");
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.dataset.libraryTabs = "true";
    tabs.setAttribute("role", "tablist");
    tabs.style.marginBottom = "10px";
    content.insertBefore(tabs, content.firstElementChild);
  }

  tabs.replaceChildren();

  const savedTab = document.createElement("button");
  savedTab.type = "button";
  savedTab.dataset.libraryModeButton = "saved";
  savedTab.setAttribute("role", "tab");
  savedTab.textContent = "Bibliothèque de plats déjà faits";
  styleTab(savedTab);
  tabs.appendChild(savedTab);
}

function syncResults(section) {
  const search = getSearchInput(section);
  if (!search) return;

  getResultsBlocks(section).forEach((block) => {
    block.hidden = false;
    block.removeAttribute("aria-hidden");
    block.style.removeProperty("display");
    block.style.removeProperty("visibility");
    block.style.removeProperty("height");
    block.style.removeProperty("overflow");
  });

  search.placeholder = "Filtrer les plats déjà faits ou un ingrédient...";
  section.querySelector("[data-library-toggle]")?.remove();
}

function toggleDish(card) {
  const ingredients = card?.querySelector("[data-library-ingredients]");
  const name = card?.querySelector("[data-library-dish-name]");
  if (!ingredients || !name) return;

  const opening = ingredients.hidden;
  ingredients.hidden = !opening;
  name.setAttribute("aria-expanded", String(opening));
}

function decorateLibrary(section) {
  section.querySelectorAll('button[aria-label^="Supprimer "]').forEach((deleteButton) => {
    const header = deleteButton.parentElement;
    const card = header?.parentElement;
    if (!card || card.dataset.libraryDisclosure === "true") return;

    const name = header.querySelector("span");
    const ingredients = Array.from(card.children).find((child) => child !== header && child.textContent?.trim());
    if (!name || !ingredients) return;

    card.dataset.libraryDisclosure = "true";
    name.dataset.libraryDishName = "true";
    ingredients.dataset.libraryIngredients = "true";
    ingredients.hidden = true;

    name.setAttribute("role", "button");
    name.setAttribute("tabindex", "0");
    name.setAttribute("aria-expanded", "false");
    name.setAttribute("title", "Afficher les ingrédients");
    name.style.cursor = "pointer";
    name.style.textDecoration = "underline";
    name.style.textDecorationStyle = "dotted";
    name.style.textUnderlineOffset = "3px";
  });
}

function initLibraryDisclosure() {
  const section = findLibrarySection();
  if (!section || section.dataset.libraryDisclosureReady === "true") return false;

  const search = getSearchInput(section);
  if (!search) return false;

  section.dataset.libraryDisclosureReady = "true";
  ensureTabs(section);
  decorateLibrary(section);
  syncResults(section);

  search.addEventListener("input", () => {
    requestAnimationFrame(() => {
      decorateLibrary(section);
      syncResults(section);
    });
  });

  section.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-library-mode-button]")) return;
    if (event.target.closest('button[aria-label^="Supprimer "]')) return;
    const name = event.target.closest("[data-library-dish-name]");
    if (!name) return;
    toggleDish(name.closest("[data-library-disclosure='true']"));
  });

  section.addEventListener("keydown", (event) => {
    const name = event.target.closest?.("[data-library-dish-name]");
    if (!name || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggleDish(name.closest("[data-library-disclosure='true']"));
  });

  let syncing = false;
  const observer = new MutationObserver(() => {
    if (syncing) return;
    syncing = true;
    requestAnimationFrame(() => {
      ensureTabs(section);
      decorateLibrary(section);
      syncResults(section);
      syncing = false;
    });
  });
  observer.observe(section, { childList: true, subtree: true });
  return true;
}

setTimeout(() => {
  if (initLibraryDisclosure()) return;
  const retry = setInterval(() => {
    if (initLibraryDisclosure()) clearInterval(retry);
  }, 250);
  setTimeout(() => clearInterval(retry), 5000);
}, 0);

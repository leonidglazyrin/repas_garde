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

function getResultsBlocks(section) {
  const content = getLibraryContent(section);
  if (!content) return [];

  const children = Array.from(content.children);
  return children.filter((child, index) => {
    if (index === 0) return false;
    if (child.dataset.libraryTabs === "true") return false;
    if (child.querySelector?.('input[placeholder="Nom du plat"]')) return false;
    return true;
  });
}

function getMode(section) {
  return section.dataset.libraryMode || "search";
}

function styleTab(button, active) {
  Object.assign(button.style, {
    flex: "1 1 160px",
    minHeight: "42px",
    border: `1px solid ${active ? "var(--herb)" : "var(--line)"}`,
    borderRadius: "8px",
    padding: "9px 12px",
    background: active ? "var(--herb-soft)" : "var(--card)",
    color: active ? "var(--herb)" : "var(--ink-soft)",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  });
  button.setAttribute("aria-selected", String(active));
}

function ensureTabs(section) {
  const content = getLibraryContent(section);
  if (!content) return;

  let tabs = content.querySelector("[data-library-tabs]");
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.dataset.libraryTabs = "true";
    tabs.setAttribute("role", "tablist");
    Object.assign(tabs.style, {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
      marginBottom: "10px",
    });

    const searchTab = document.createElement("button");
    searchTab.type = "button";
    searchTab.dataset.libraryModeButton = "search";
    searchTab.setAttribute("role", "tab");
    searchTab.textContent = "Recherche";

    const savedTab = document.createElement("button");
    savedTab.type = "button";
    savedTab.dataset.libraryModeButton = "saved";
    savedTab.setAttribute("role", "tab");
    savedTab.textContent = "Bibliothèque de plats déjà faits";

    tabs.append(searchTab, savedTab);
    content.insertBefore(tabs, content.firstElementChild);
  }

  section.querySelectorAll("[data-library-mode-button]").forEach((button) => {
    styleTab(button, button.dataset.libraryModeButton === getMode(section));
  });
}

function syncResults(section) {
  const search = getSearchInput(section);
  if (!search) return;

  const mode = getMode(section);
  const hasQuery = search.value.trim().length > 0;

  // Les plats restent toujours cachés tant qu'aucune recherche n'est saisie,
  // même dans l'onglet « Bibliothèque de plats déjà faits ».
  getResultsBlocks(section).forEach((block) => {
    block.hidden = !hasQuery;
    block.dataset.libraryResultsBlock = "true";
  });

  search.placeholder = mode === "saved"
    ? "Filtrer les plats déjà faits ou un ingrédient..."
    : "Chercher un plat ou un ingrédient...";

  section.querySelectorAll("[data-library-mode-button]").forEach((button) => {
    styleTab(button, button.dataset.libraryModeButton === mode);
  });

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
  section.dataset.libraryMode = "search";
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
    const modeButton = event.target.closest?.("[data-library-mode-button]");
    if (modeButton) {
      section.dataset.libraryMode = modeButton.dataset.libraryModeButton;
      syncResults(section);
      // Ne pas appeler focus() ici : sur téléphone, le clavier doit s'ouvrir
      // uniquement lorsque l'utilisateur touche directement la barre de recherche.
      return;
    }

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

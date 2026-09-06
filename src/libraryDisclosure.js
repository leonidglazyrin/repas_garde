function findLibrarySection() {
  return Array.from(document.querySelectorAll("main > section")).find((section) =>
    (section.textContent || "").includes("Bibliothèque de plats déjà utilisés")
  );
}

function getLibraryContent(section) {
  return Array.from(section.children).find((child) =>
    child.querySelector?.('input[placeholder="Chercher un plat ou un ingrédient..."]')
  ) || null;
}

function getSearchInput(section) {
  return getLibraryContent(section)?.querySelector?.('input[placeholder="Chercher un plat ou un ingrédient..."]') || null;
}

function getResultsBlocks(section) {
  const content = getLibraryContent(section);
  if (!content) return [];

  const children = Array.from(content.children);
  return children.filter((child, index) => {
    // La première ligne contient toujours la recherche + « Nouveau plat ».
    if (index === 0) return false;

    // Le formulaire de création reste visible lorsqu'il est ouvert.
    if (child.querySelector?.('input[placeholder="Nom du plat"]')) return false;

    // Le reste correspond aux résultats de recherche ou au message « aucun plat ».
    return true;
  });
}

function syncSearchResults(section) {
  const search = getSearchInput(section);
  if (!search) return;

  const hasQuery = search.value.trim().length > 0;
  getResultsBlocks(section).forEach((block) => {
    block.hidden = !hasQuery;
    block.dataset.libraryResultsBlock = "true";
  });

  // Ancien bouton de dépliage : il n'est plus nécessaire.
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
  decorateLibrary(section);
  syncSearchResults(section);

  // Les recettes apparaissent uniquement dès qu'on écrit un nom de plat
  // ou un ingrédient dans la barre de recherche.
  search.addEventListener("input", () => {
    requestAnimationFrame(() => {
      decorateLibrary(section);
      syncSearchResults(section);
    });
  });

  section.addEventListener("click", (event) => {
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

  const observer = new MutationObserver(() => {
    decorateLibrary(section);
    syncSearchResults(section);
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

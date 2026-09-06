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

function getResultsBlocks(section) {
  const content = getLibraryContent(section);
  if (!content) return [];

  const children = Array.from(content.children);
  return children.filter((child, index) => {
    // Le premier bloc contient la recherche + « Nouveau plat » et reste toujours visible.
    if (index === 0) return false;

    // Le formulaire « Nouveau plat » doit rester utilisable même quand les plats sont repliés.
    if (child.querySelector?.('input[placeholder="Nom du plat"]')) return false;

    // Le reste correspond à la grille de plats ou au message « aucun plat ».
    return true;
  });
}

function setResultsVisible(section, visible) {
  getResultsBlocks(section).forEach((block) => {
    block.hidden = !visible;
    block.dataset.libraryResultsBlock = "true";
  });
}

function toggleLibrary(section) {
  const button = section.querySelector("[data-library-toggle]");
  if (!button) return;

  const opening = button.getAttribute("aria-expanded") !== "true";
  setResultsVisible(section, opening);
  button.setAttribute("aria-expanded", String(opening));
  button.textContent = opening ? "Masquer les plats ▴" : "Afficher les plats ▾";
}

function ensureLibraryToggle(section) {
  const content = getLibraryContent(section);
  if (!content) return;

  let button = section.querySelector("[data-library-toggle]");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.dataset.libraryToggle = "true";
    button.setAttribute("aria-expanded", "false");
    button.textContent = "Afficher les plats ▾";
    Object.assign(button.style, {
      width: "100%",
      minHeight: "42px",
      marginTop: "10px",
      marginBottom: "10px",
      border: "1px solid var(--line)",
      borderRadius: "8px",
      padding: "9px 12px",
      background: "var(--card)",
      color: "var(--ink)",
      fontSize: "16px",
      fontWeight: "600",
      textAlign: "left",
      cursor: "pointer",
    });

    // Le bouton est placé dans la bibliothèque, après la barre de recherche.
    const firstRow = content.firstElementChild;
    if (firstRow?.nextSibling) content.insertBefore(button, firstRow.nextSibling);
    else content.appendChild(button);
  }

  if (!content.dataset.libraryCollapsedReady) {
    content.dataset.libraryCollapsedReady = "true";
    setResultsVisible(section, false);
  } else {
    // React peut recréer la grille après une recherche : conserver l'état courant.
    const visible = button.getAttribute("aria-expanded") === "true";
    setResultsVisible(section, visible);
  }
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

  section.dataset.libraryDisclosureReady = "true";
  ensureLibraryToggle(section);
  decorateLibrary(section);

  section.addEventListener("click", (event) => {
    const libraryToggle = event.target.closest?.("[data-library-toggle]");
    if (libraryToggle) {
      toggleLibrary(section);
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

  const observer = new MutationObserver(() => {
    ensureLibraryToggle(section);
    decorateLibrary(section);
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

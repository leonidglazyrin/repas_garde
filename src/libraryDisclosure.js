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
    if (child.dataset.libraryAlphabet === "true") return false;
    if (child.querySelector?.('input[placeholder="Nom du plat"]')) return false;
    return true;
  });
}

function getDishCards(section) {
  const cards = [];
  const seen = new Set();
  section.querySelectorAll('button[aria-label^="Supprimer "]').forEach((deleteButton) => {
    const card = deleteButton.parentElement?.parentElement;
    if (card && !seen.has(card)) {
      seen.add(card);
      cards.push(card);
    }
  });
  return cards;
}

function getDishName(card) {
  return card?.querySelector("[data-library-dish-name]")?.textContent?.trim() ||
    card?.querySelector("span")?.textContent?.trim() || "";
}

function getInitial(name) {
  const first = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

function isOpen(section) {
  return section.dataset.libraryOpen === "true";
}

function styleTab(button, open) {
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
    cursor: "pointer",
  });
  button.setAttribute("aria-expanded", String(open));
  button.textContent = open
    ? "Bibliothèque de plats déjà faits ▴"
    : "Bibliothèque de plats déjà faits ▾";
}

function ensureTabs(section) {
  const content = getLibraryContent(section);
  if (!content) return;

  let tabs = content.querySelector("[data-library-tabs]");
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.dataset.libraryTabs = "true";
    tabs.style.marginBottom = "10px";
    content.insertBefore(tabs, content.firstElementChild);
  }

  let savedTab = tabs.querySelector("[data-library-mode-button='saved']");
  if (!savedTab) {
    tabs.replaceChildren();
    savedTab = document.createElement("button");
    savedTab.type = "button";
    savedTab.dataset.libraryModeButton = "saved";
    savedTab.setAttribute("aria-controls", "library-saved-results");
    tabs.appendChild(savedTab);
  }

  styleTab(savedTab, isOpen(section));
}

function styleLetterButton(button, active) {
  Object.assign(button.style, {
    minWidth: "34px",
    minHeight: "34px",
    padding: "5px 9px",
    borderRadius: "17px",
    border: `1px solid ${active ? "var(--herb)" : "var(--line)"}`,
    background: active ? "var(--herb)" : "var(--card)",
    color: active ? "#fff" : "var(--ink-soft)",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  });
}

function ensureAlphabet(section) {
  const content = getLibraryContent(section);
  const searchRow = getSearchRow(section);
  if (!content || !searchRow) return;

  let alphabet = content.querySelector("[data-library-alphabet]");
  if (!alphabet) {
    alphabet = document.createElement("div");
    alphabet.dataset.libraryAlphabet = "true";
    alphabet.setAttribute("aria-label", "Filtrer les plats par lettre");
    Object.assign(alphabet.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      marginBottom: "10px",
    });
    searchRow.insertAdjacentElement("afterend", alphabet);
  }

  const letters = Array.from(new Set(getDishCards(section).map((card) => getInitial(getDishName(card)))))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "fr"));
  const wanted = ["ALL", ...letters];
  const currentButtons = Array.from(alphabet.querySelectorAll("button[data-library-letter]"));
  const current = currentButtons.map((button) => button.dataset.libraryLetter).join("|");
  if (current !== wanted.join("|")) {
    alphabet.replaceChildren();
    wanted.forEach((letter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.libraryLetter = letter;
      button.textContent = letter === "ALL" ? "Tous" : letter;
      button.setAttribute("aria-label", letter === "ALL" ? "Afficher tous les plats" : `Afficher les plats en ${letter}`);
      alphabet.appendChild(button);
    });
  }

  const selected = section.dataset.libraryLetter || "ALL";
  alphabet.querySelectorAll("button[data-library-letter]").forEach((button) => {
    styleLetterButton(button, button.dataset.libraryLetter === selected);
  });
  alphabet.style.display = isOpen(section) && letters.length ? "flex" : "none";
}

function setBlockVisible(block, visible) {
  block.dataset.libraryResultsBlock = "true";
  block.hidden = !visible;
  block.setAttribute("aria-hidden", String(!visible));

  if (visible) {
    block.style.removeProperty("display");
    block.style.removeProperty("visibility");
    block.style.removeProperty("height");
    block.style.removeProperty("overflow");
  } else {
    block.style.setProperty("display", "none", "important");
    block.style.setProperty("visibility", "hidden", "important");
    block.style.setProperty("height", "0", "important");
    block.style.setProperty("overflow", "hidden", "important");
  }
}

function applyLetterFilter(section) {
  const selected = section.dataset.libraryLetter || "ALL";
  getDishCards(section).forEach((card) => {
    const matches = selected === "ALL" || getInitial(getDishName(card)) === selected;
    card.style.setProperty("display", matches ? "" : "none", matches ? "" : "important");
    if (matches) card.style.removeProperty("display");
  });

  section.querySelectorAll("button[data-library-letter]").forEach((button) => {
    styleLetterButton(button, button.dataset.libraryLetter === selected);
  });
}

function syncResults(section) {
  const search = getSearchInput(section);
  if (!search) return;

  const open = isOpen(section);
  getResultsBlocks(section).forEach((block, index) => {
    if (index === 0) block.id = "library-saved-results";
    setBlockVisible(block, open);
  });

  search.placeholder = "Filtrer les plats déjà faits ou un ingrédient...";
  const savedTab = section.querySelector("[data-library-mode-button='saved']");
  if (savedTab) styleTab(savedTab, open);
  section.querySelector("[data-library-toggle]")?.remove();
  ensureAlphabet(section);
  applyLetterFilter(section);
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
  section.dataset.libraryOpen = "false";
  section.dataset.libraryLetter = "ALL";
  ensureTabs(section);
  decorateLibrary(section);
  ensureAlphabet(section);
  syncResults(section);

  search.addEventListener("input", () => {
    section.dataset.libraryLetter = "ALL";
    requestAnimationFrame(() => {
      decorateLibrary(section);
      syncResults(section);
    });
  });

  section.addEventListener("click", (event) => {
    const savedTab = event.target.closest?.("[data-library-mode-button='saved']");
    if (savedTab) {
      section.dataset.libraryOpen = String(!isOpen(section));
      syncResults(section);
      return;
    }

    const letterButton = event.target.closest?.("button[data-library-letter]");
    if (letterButton) {
      section.dataset.libraryLetter = letterButton.dataset.libraryLetter || "ALL";
      applyLetterFilter(section);
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
      ensureAlphabet(section);
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

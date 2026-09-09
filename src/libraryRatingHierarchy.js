import { supabase } from "./supabaseClient.js";

let ratingByName = new Map();
let frame = null;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr-CA");
}

function findLibrarySection() {
  return Array.from(document.querySelectorAll("main > section")).find((section) =>
    (section.textContent || "").includes("Bibliothèque de plats déjà utilisés")
  ) || null;
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
  const name = card.querySelector("[data-library-dish-name]") || card.querySelector("span");
  return (name?.textContent || "").trim();
}

async function loadRatings() {
  const { data, error } = await supabase.from("meal_library").select("name,rating_category");
  if (error) {
    console.error("load library rating categories", error);
    return;
  }
  ratingByName = new Map((data || []).map((row) => [normalize(row.name), row.rating_category || "okay"]));
  schedule();
}

function styleButton(button, active, color) {
  Object.assign(button.style, {
    minHeight: "36px",
    padding: "7px 11px",
    borderRadius: "18px",
    border: `1px solid ${active ? color : "var(--line)"}`,
    background: active ? color : "var(--card)",
    color: active ? "#fff" : "var(--ink-soft)",
    fontSize: "12px",
    fontWeight: "800",
    cursor: "pointer",
  });
}

function ensureRatingFilters(section) {
  const genreFilters = section.querySelector("[data-library-genres]");
  if (!genreFilters) return null;
  let filters = section.querySelector("[data-library-rating-filters]");
  if (!filters) {
    filters = document.createElement("div");
    filters.dataset.libraryRatingFilters = "true";
    Object.assign(filters.style, { display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "8px" });
    genreFilters.parentElement?.insertBefore(filters, genreFilters);

    [
      ["love", "❤️ Adoré · à refaire souvent", "#4C6B4E"],
      ["okay", "🙂 Correct · de temps en temps", "#C98A3B"],
    ].forEach(([key, label, color]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.libraryRating = key;
      button.dataset.ratingColor = color;
      button.textContent = label;
      button.addEventListener("click", () => {
        section.dataset.libraryRating = section.dataset.libraryRating === key ? "" : key;
        if (!section.dataset.libraryRating) section.dataset.libraryGenre = "ALL";
        applyHierarchy(section);
      });
      filters.appendChild(button);
    });
  }
  return filters;
}

function applyHierarchy(section) {
  const filters = ensureRatingFilters(section);
  const genreFilters = section.querySelector("[data-library-genres]");
  if (!filters || !genreFilters) return;

  const selectedRating = section.dataset.libraryRating || "";
  filters.querySelectorAll("button[data-library-rating]").forEach((button) => {
    styleButton(button, button.dataset.libraryRating === selectedRating, button.dataset.ratingColor || "var(--herb)");
  });

  genreFilters.style.display = selectedRating && section.dataset.libraryOpen === "true" ? "flex" : "none";
  if (selectedRating && !genreFilters.previousElementSibling?.dataset.libraryGenreHint) {
    const hint = document.createElement("div");
    hint.dataset.libraryGenreHint = "true";
    hint.textContent = "Puis choisis le type de plat :";
    Object.assign(hint.style, { fontSize: "12px", color: "var(--ink-soft)", marginBottom: "6px", fontWeight: "700" });
    genreFilters.parentElement?.insertBefore(hint, genreFilters);
  }
  const hint = genreFilters.previousElementSibling?.dataset.libraryGenreHint ? genreFilters.previousElementSibling : null;
  if (hint) hint.style.display = selectedRating && section.dataset.libraryOpen === "true" ? "block" : "none";

  const selectedGenre = section.dataset.libraryGenre || "ALL";
  getDishCards(section).forEach((card) => {
    const name = getDishName(card);
    const rating = ratingByName.get(normalize(name)) || "okay";
    const ratingMatches = !selectedRating || rating === selectedRating;

    let genreMatches = true;
    if (selectedRating && selectedGenre !== "ALL") {
      const hiddenByGenre = card.style.getPropertyValue("display") === "none";
      genreMatches = !hiddenByGenre;
    }

    if (!ratingMatches) card.style.setProperty("display", "none", "important");
    else if (selectedRating && selectedGenre === "ALL") card.style.removeProperty("display");
    else if (!selectedRating) card.style.removeProperty("display");
    else if (!genreMatches) card.style.setProperty("display", "none", "important");
  });
}

function sync() {
  const section = findLibrarySection();
  if (!section) return;
  const filters = ensureRatingFilters(section);
  if (!filters) return;
  filters.style.display = section.dataset.libraryOpen === "true" ? "flex" : "none";
  applyHierarchy(section);
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    sync();
  });
}

const observer = new MutationObserver(schedule);
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("click", () => setTimeout(schedule, 0), true);

supabase.channel("library-rating-hierarchy")
  .on("postgres_changes", { event: "*", schema: "public", table: "meal_library" }, loadRatings)
  .subscribe();
loadRatings();
queueMicrotask(schedule);

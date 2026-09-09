import { supabase } from "./supabaseClient.js";

let ratingsByName = new Map();
let frame = null;
let channel = null;

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-CA");
}

function findLibrarySection() {
  return Array.from(document.querySelectorAll("main > section")).find((section) =>
    (section.textContent || "").includes("Bibliothèque de plats déjà utilisés")
  ) || null;
}

function getDishCards(section) {
  const cards = [];
  const seen = new Set();
  section.querySelectorAll('button[aria-label^="Supprimer "]').forEach((button) => {
    const card = button.parentElement?.parentElement;
    if (card && !seen.has(card)) {
      seen.add(card);
      cards.push(card);
    }
  });
  return cards;
}

function getDishName(card) {
  const marked = card.querySelector("[data-library-dish-name]");
  if (marked) return (marked.textContent || "").trim();
  const deleteButton = card.querySelector('button[aria-label^="Supprimer "]');
  const label = deleteButton?.getAttribute("aria-label") || "";
  return label.replace(/^Supprimer\s+/i, "").trim();
}

async function loadCategories() {
  const { data, error } = await supabase.from("meal_library").select("name,rating_category");
  if (error) {
    console.error("load library rating categories", error);
    return;
  }
  ratingsByName = new Map((data || []).map((row) => [normalize(row.name), row.rating_category === "love" ? "love" : "okay"]));
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

function ensureControls(section) {
  section.querySelector("[data-library-genres]")?.style.setProperty("display", "none", "important");

  let controls = section.querySelector("[data-library-rating-categories]");
  if (!controls) {
    controls = document.createElement("div");
    controls.dataset.libraryRatingCategories = "true";
    Object.assign(controls.style, { display: "flex", flexWrap: "wrap", gap: "7px", margin: "8px 0 10px" });

    const search = section.querySelector('input[placeholder*="plats déjà faits"], input[placeholder^="Chercher un plat"]');
    const row = search?.parentElement?.parentElement || search?.parentElement;
    row?.insertAdjacentElement("afterend", controls);
  }

  const modes = [
    ["all", "Tous", "#5F5A54"],
    ["love", "❤️ Adoré — à refaire souvent", "#4C6B4E"],
    ["okay", "🙂 Correct — de temps en temps", "#C98A3B"],
  ];
  if (controls.children.length !== modes.length) {
    controls.replaceChildren();
    modes.forEach(([key, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.libraryRatingFilter = key;
      button.textContent = label;
      button.addEventListener("click", () => {
        section.dataset.libraryRatingFilter = key;
        apply(section);
      });
      controls.appendChild(button);
    });
  }

  const selected = section.dataset.libraryRatingFilter || "all";
  Array.from(controls.children).forEach((button, index) => {
    styleButton(button, button.dataset.libraryRatingFilter === selected, modes[index][2]);
  });
}

function apply(section) {
  ensureControls(section);
  const selected = section.dataset.libraryRatingFilter || "all";
  getDishCards(section).forEach((card) => {
    const name = getDishName(card);
    const category = ratingsByName.get(normalize(name)) || "okay";
    card.dataset.libraryRatingCategory = category;
    const visible = selected === "all" || selected === category;
    if (visible) card.style.removeProperty("display");
    else card.style.setProperty("display", "none", "important");
  });

  const controls = section.querySelector("[data-library-rating-categories]");
  if (controls) {
    const colors = { all: "#5F5A54", love: "#4C6B4E", okay: "#C98A3B" };
    controls.querySelectorAll("button").forEach((button) => {
      const key = button.dataset.libraryRatingFilter;
      styleButton(button, key === selected, colors[key] || "#5F5A54");
    });
  }
}

function sync() {
  const section = findLibrarySection();
  if (!section) return;
  apply(section);
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
channel = supabase.channel("library-rating-categories").on("postgres_changes", { event: "*", schema: "public", table: "meal_library" }, loadCategories).subscribe();
loadCategories();
queueMicrotask(schedule);

import { supabase } from "./supabaseClient.js";

const inFlight = new Map();

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-CA");
}

function ratingFromButton(button) {
  const text = String(button?.textContent || "");
  if (text.includes("On en reveut")) return "love";
  if (text.includes("Correct, de temps en temps")) return "okay";
  return null;
}

function mealNameFromButton(button) {
  const block = button?.closest?.("div");
  let node = block;
  while (node && node.id !== "meal-rating-panel") {
    const heading = Array.from(node.children || []).find((child) => {
      const text = String(child.textContent || "");
      return text.includes(" · ") && !child.querySelector?.("button");
    });
    if (heading) return String(heading.textContent || "").split(" · ").slice(1).join(" · ").trim();
    node = node.parentElement;
  }
  return "";
}

function ingredientsFor(name) {
  const key = normalize(name);
  const input = Array.from(document.querySelectorAll('input[placeholder="Nom du souper"]')).find((candidate) => normalize(candidate.value) === key);
  if (!input) return "";
  let node = input.parentElement;
  while (node && node !== document.body) {
    const textarea = node.querySelector?.('textarea[placeholder^="Ingrédients"]');
    if (textarea) return String(textarea.value || "").trim();
    node = node.parentElement;
  }
  return "";
}

async function persistToLibrary(name, ingredients, ratingCategory) {
  const { data, error: lookupError } = await supabase
    .from("meal_library")
    .select("id")
    .ilike("name", name)
    .limit(1);

  if (lookupError) throw lookupError;

  const existing = data?.[0];
  if (existing) {
    const { error } = await supabase
      .from("meal_library")
      .update({ ingredients: ingredients || "", rating_category: ratingCategory })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("meal_library")
      .insert({ name, ingredients: ingredients || "", rating_category: ratingCategory });
    if (error) throw error;
  }
}

async function guaranteeLibrary(name, ratingCategory) {
  const key = normalize(name);
  if (!key || inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    const ingredients = ingredientsFor(name);
    try {
      await persistToLibrary(name, ingredients, ratingCategory);
    } catch (firstError) {
      console.error("rating library save retry", firstError);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await persistToLibrary(name, ingredients, ratingCategory);
    }
    document.dispatchEvent(new CustomEvent("meal-rating-changed"));
    document.dispatchEvent(new CustomEvent("meal-library-changed"));
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("#meal-rating-panel button");
  if (!button) return;
  const ratingCategory = ratingFromButton(button);
  if (!ratingCategory) return;
  const name = mealNameFromButton(button);
  if (!name) return;
  guaranteeLibrary(name, ratingCategory).catch((error) => console.error("guarantee rating library", error));
}, true);

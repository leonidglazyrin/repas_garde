import { canonicalIngredientKey } from "./ingredientNormalization.js";

let frame = null;

function words(value) {
  return canonicalIngredientKey(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
}

function inventoryMatches(groceryLabel, inventoryKey) {
  const groceryKey = canonicalIngredientKey(groceryLabel);
  if (!groceryKey || !inventoryKey) return false;
  if (groceryKey === inventoryKey) return true;

  const groceryWords = new Set(words(groceryKey));
  const inventoryWords = words(inventoryKey);
  if (!inventoryWords.length) return false;

  // "poulet" masque "escalopes de poulet", "jambon" masque "jambon blanc", etc.
  return inventoryWords.every((word) => groceryWords.has(word));
}

function findGrocerySection() {
  return Array.from(document.querySelectorAll("main section")).find((section) =>
    (section.textContent || "").includes("Liste d'épicerie")
  ) || null;
}

function applyInventoryFilter() {
  frame = null;
  const section = findGrocerySection();
  const inventoryKeys = window.__fridgeIngredientKeys instanceof Set
    ? Array.from(window.__fridgeIngredientKeys)
    : [];
  if (!section || !inventoryKeys.length) return;

  section.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    const label = checkbox.closest("label");
    const row = label?.parentElement;
    if (!label || !row) return;
    if (row.closest("[data-family-inventory-stable]")) return;

    const source = row.dataset.groceryOriginalLabel || (label.textContent || "").trim();
    const excluded = inventoryKeys.some((key) => inventoryMatches(source, key));
    if (excluded) {
      row.dataset.inventoryExcluded = "true";
      row.style.setProperty("display", "none", "important");
    } else if (row.dataset.inventoryExcluded === "true") {
      delete row.dataset.inventoryExcluded;
      row.style.removeProperty("display");
    }
  });
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(applyInventoryFilter);
}

document.addEventListener("fridge-items-changed", schedule);
document.addEventListener("input", schedule, true);
document.addEventListener("change", schedule, true);
document.addEventListener("blur", schedule, true);
setInterval(schedule, 3000);
queueMicrotask(schedule);

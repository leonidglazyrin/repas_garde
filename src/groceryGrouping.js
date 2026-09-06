import { canonicalIngredientKey } from "./ingredientNormalization.js";

let scheduled = false;
let propagating = false;

function findGrocerySection() {
  return Array.from(document.querySelectorAll("main section")).find((section) =>
    (section.textContent || "").includes("Liste d'épicerie")
  );
}

function getIngredientRow(checkbox) {
  const label = checkbox?.closest?.("label");
  const row = label?.parentElement;
  if (!label || !row) return null;
  return { label, row };
}

function getIngredientName(checkbox) {
  const data = getIngredientRow(checkbox);
  if (!data) return "";
  return (data.label.textContent || "").trim();
}

function groupGroceryItems() {
  scheduled = false;
  const section = findGrocerySection();
  if (!section) return;

  const checkboxes = Array.from(section.querySelectorAll('input[type="checkbox"]'));
  const leaders = new Map();

  checkboxes.forEach((checkbox) => {
    const data = getIngredientRow(checkbox);
    if (!data) return;

    data.row.style.display = "";
    delete data.row.dataset.groceryDuplicate;

    const key = canonicalIngredientKey(getIngredientName(checkbox));
    if (!key) return;

    if (!leaders.has(key)) {
      leaders.set(key, data.row);
      data.row.dataset.groceryGroup = key;
      return;
    }

    data.row.dataset.groceryDuplicate = "true";
    data.row.dataset.groceryGroup = key;
    data.row.style.display = "none";
  });
}

function scheduleGrouping() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(groupGroceryItems);
}

// Si deux anciennes entrées équivalentes ont encore des états de case différents,
// une action sur la ligne visible est propagée à toutes les variantes cachées.
document.addEventListener(
  "change",
  (event) => {
    const checkbox = event.target;
    if (propagating || !(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox") return;

    const section = findGrocerySection();
    if (!section || !section.contains(checkbox)) return;

    const key = canonicalIngredientKey(getIngredientName(checkbox));
    if (!key) return;

    const desired = checkbox.checked;
    const equivalents = Array.from(section.querySelectorAll('input[type="checkbox"]')).filter(
      (candidate) => canonicalIngredientKey(getIngredientName(candidate)) === key
    );

    if (equivalents.length <= 1) return;

    propagating = true;
    equivalents.forEach((candidate) => {
      if (candidate !== checkbox && candidate.checked !== desired) candidate.click();
    });
    propagating = false;
    scheduleGrouping();
  },
  true
);

const observer = new MutationObserver(scheduleGrouping);
observer.observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(scheduleGrouping);

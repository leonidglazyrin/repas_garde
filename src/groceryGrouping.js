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

function getEquivalentCheckboxes(section, source) {
  const key = canonicalIngredientKey(getIngredientName(source));
  if (!key) return [];
  return Array.from(section.querySelectorAll('input[type="checkbox"]')).filter(
    (candidate) => canonicalIngredientKey(getIngredientName(candidate)) === key
  );
}

function groupGroceryItems() {
  scheduled = false;
  const section = findGrocerySection();
  if (!section) return;

  const checkboxes = Array.from(section.querySelectorAll('input[type="checkbox"]'));
  const groups = new Map();

  // On repart toujours de l'état React réel avant de reconstruire les groupes.
  checkboxes.forEach((checkbox) => {
    const data = getIngredientRow(checkbox);
    if (!data) return;
    data.row.style.display = "";
    delete data.row.dataset.groceryDuplicate;
    delete data.row.dataset.groceryMergedCount;

    const key = canonicalIngredientKey(getIngredientName(checkbox));
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ checkbox, row: data.row });
  });

  // Un même ingrédient provenant de plusieurs plats n'occupe qu'une seule ligne.
  // Les variantes singulier/pluriel et les quantités sont déjà ramenées à la même clé.
  groups.forEach((items, key) => {
    if (!items.length) return;
    const leader = items[0];
    leader.row.dataset.groceryGroup = key;
    leader.row.dataset.groceryMergedCount = String(items.length);

    items.slice(1).forEach(({ row }) => {
      row.dataset.groceryDuplicate = "true";
      row.dataset.groceryGroup = key;
      row.style.display = "none";
    });
  });
}

function scheduleGrouping() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(groupGroceryItems);
}

// Quand on coche/décoche l'ingrédient visible, toutes ses variantes provenant
// des autres plats de la semaine prennent exactement le même état.
document.addEventListener(
  "change",
  (event) => {
    const checkbox = event.target;
    if (propagating || !(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox") {
      scheduleGrouping();
      return;
    }

    const section = findGrocerySection();
    if (!section || !section.contains(checkbox)) {
      scheduleGrouping();
      return;
    }

    const equivalents = getEquivalentCheckboxes(section, checkbox);
    if (equivalents.length > 1) {
      const desired = checkbox.checked;
      propagating = true;
      equivalents.forEach((candidate) => {
        if (candidate !== checkbox && candidate.checked !== desired) candidate.click();
      });
      propagating = false;
    }
    scheduleGrouping();
  },
  true
);

// Les ingrédients des plats sont modifiés dans des champs React; on regroupe aussi
// après une saisie ou une sortie de champ afin que la liste reste propre immédiatement.
document.addEventListener("input", scheduleGrouping, true);
document.addEventListener("blur", scheduleGrouping, true);

const observer = new MutationObserver(scheduleGrouping);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});

queueMicrotask(scheduleGrouping);

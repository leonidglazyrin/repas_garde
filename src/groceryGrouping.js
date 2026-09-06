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

function setIngredientName(label, value) {
  const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = ` ${value}`;
  } else {
    label.appendChild(document.createTextNode(` ${value}`));
  }
}

function parseFraction(value) {
  const text = String(value || "").trim().replace(",", ".");
  const unicode = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
  if (unicode[text] != null) return unicode[text];
  if (/^\d+\/\d+$/.test(text)) {
    const [a, b] = text.split("/").map(Number);
    return b ? a / b : null;
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const mixed = text.match(/^(\d+)([½¼¾⅓⅔])$/);
  if (mixed) return Number(mixed[1]) + unicode[mixed[2]];
  return null;
}

function parseQuantityLabel(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+|\d+[½¼¾⅓⅔]|[½¼¾⅓⅔])\s*(kg|mg|g|ml|cl|dl|l|litres?|tasses?|tranches?)?\s+(?:de\s+|d['’])?(.*)$/iu);
  if (!match) return null;

  const quantity = parseFraction(match[1]);
  const item = (match[3] || "").trim();
  if (quantity == null || !item) return null;

  let unit = (match[2] || "").toLocaleLowerCase("fr-CA");
  const normalizedUnits = {
    litre: "l",
    litres: "l",
    tasse: "tasse",
    tasses: "tasse",
    tranche: "tranche",
    tranches: "tranche",
  };
  unit = normalizedUnits[unit] || unit;

  return { quantity, unit, item };
}

function formatQuantity(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}

function pluralizeSimple(item, quantity) {
  if (quantity <= 1) return item;
  const words = item.split(/\s+/);
  const first = words[0] || "";
  const lower = first.toLocaleLowerCase("fr-CA");
  const invariant = new Set(["riz", "maïs", "mais", "couscous", "jus", "pois", "ananas", "noix"]);
  if (!invariant.has(lower) && !/[sxz]$/i.test(first)) words[0] = `${first}s`;
  return words.join(" ");
}

function buildSummedLabel(items) {
  const parsed = items.map(({ sourceLabel }) => parseQuantityLabel(sourceLabel));
  if (parsed.some((entry) => !entry)) return null;

  const unit = parsed[0].unit;
  if (parsed.some((entry) => entry.unit !== unit)) return null;

  const total = parsed.reduce((sum, entry) => sum + entry.quantity, 0);
  const baseItem = parsed.find((entry) => entry.quantity > 1)?.item || parsed[0].item;
  const item = pluralizeSimple(baseItem, total);
  const unitLabel = unit ? ` ${unit}` : "";
  return `${formatQuantity(total)}${unitLabel} ${item}`;
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

  checkboxes.forEach((checkbox) => {
    const data = getIngredientRow(checkbox);
    if (!data) return;

    const currentLabel = (data.label.textContent || "").trim();
    const previousAggregate = data.row.dataset.groceryAggregateLabel || "";
    let sourceLabel = data.row.dataset.groceryOriginalLabel || currentLabel;

    // Si React a remplacé le contenu depuis le dernier regroupement, cette nouvelle
    // valeur devient la source officielle. Sinon on restaure la valeur originale
    // avant de recalculer, pour ne jamais additionner deux fois un total déjà affiché.
    if (!previousAggregate || currentLabel !== previousAggregate) sourceLabel = currentLabel;
    data.row.dataset.groceryOriginalLabel = sourceLabel;
    delete data.row.dataset.groceryAggregateLabel;
    setIngredientName(data.label, sourceLabel);

    data.row.style.display = "";
    delete data.row.dataset.groceryDuplicate;
    delete data.row.dataset.groceryMergedCount;

    const key = canonicalIngredientKey(sourceLabel);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ checkbox, row: data.row, label: data.label, sourceLabel });
  });

  groups.forEach((items, key) => {
    if (!items.length) return;
    const leader = items[0];
    leader.row.dataset.groceryGroup = key;
    leader.row.dataset.groceryMergedCount = String(items.length);

    const summedLabel = buildSummedLabel(items);
    if (summedLabel && items.length > 1) {
      setIngredientName(leader.label, summedLabel);
      leader.row.dataset.groceryAggregateLabel = summedLabel;
    }

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

document.addEventListener("input", scheduleGrouping, true);
document.addEventListener("blur", scheduleGrouping, true);

const observer = new MutationObserver(scheduleGrouping);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});

queueMicrotask(scheduleGrouping);

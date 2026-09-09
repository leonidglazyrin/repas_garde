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
  return data ? (data.label.textContent || "").trim() : "";
}

function setIngredientName(label, value) {
  const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.textContent = ` ${value}`;
  else label.appendChild(document.createTextNode(` ${value}`));
}

function parseNumber(value) {
  const text = String(value || "").trim().replace(",", ".");
  const unicode = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
  if (unicode[text] != null) return unicode[text];
  if (/^\d+\/\d+$/.test(text)) {
    const [a, b] = text.split("/").map(Number);
    return b ? a / b : null;
  }
  const mixed = text.match(/^(\d+)([½¼¾⅓⅔])$/);
  if (mixed) return Number(mixed[1]) + unicode[mixed[2]];
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return null;
}

const UNIT_MAP = {
  kg: { family: "mass", factor: 1000, base: "g" },
  g: { family: "mass", factor: 1, base: "g" },
  mg: { family: "mass", factor: 0.001, base: "g" },
  l: { family: "volume", factor: 1000, base: "ml" },
  litre: { family: "volume", factor: 1000, base: "ml" },
  litres: { family: "volume", factor: 1000, base: "ml" },
  ml: { family: "volume", factor: 1, base: "ml" },
  cl: { family: "volume", factor: 10, base: "ml" },
  dl: { family: "volume", factor: 100, base: "ml" },
  tasse: { family: "tasse", factor: 1, base: "tasse" },
  tasses: { family: "tasse", factor: 1, base: "tasse" },
  tranche: { family: "tranche", factor: 1, base: "tranche" },
  tranches: { family: "tranche", factor: 1, base: "tranche" },
};

function parseIngredient(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const match = text.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+|\d+[½¼¾⅓⅔]|[½¼¾⅓⅔])\s*(kg|mg|g|ml|cl|dl|l|litres?|tasses?|tranches?)?\s*(?:de\s+|d['’])?(.*)$/iu);
  if (!match) {
    return {
      key: canonicalIngredientKey(text),
      quantity: null,
      family: null,
      baseValue: null,
      item: text,
    };
  }

  const quantity = parseNumber(match[1]);
  const rawUnit = (match[2] || "").toLocaleLowerCase("fr-CA");
  const item = (match[3] || "").trim();
  if (quantity == null || !item) return null;

  const unit = rawUnit ? UNIT_MAP[rawUnit] : null;
  return {
    key: canonicalIngredientKey(item),
    quantity,
    family: unit?.family || "count",
    baseValue: unit ? quantity * unit.factor : quantity,
    item,
  };
}

function formatNumber(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}

function pluralize(item, quantity) {
  if (quantity <= 1) return item;
  const words = String(item || "").split(/\s+/);
  const first = words[0] || "";
  const invariant = new Set(["riz", "maïs", "mais", "couscous", "jus", "pois", "ananas", "noix"]);
  if (!invariant.has(first.toLocaleLowerCase("fr-CA")) && !/[sxz]$/i.test(first)) words[0] = `${first}s`;
  return words.join(" ");
}

function formatAggregate(entries) {
  const parsed = entries.map((entry) => parseIngredient(entry)).filter(Boolean);
  if (!parsed.length || parsed.some((entry) => entry.quantity == null)) return null;

  const families = new Set(parsed.map((entry) => entry.family));
  if (families.size !== 1) return null;

  const family = parsed[0].family;
  const total = parsed.reduce((sum, entry) => sum + entry.baseValue, 0);
  const baseItem = parsed[0].item;

  if (family === "mass") {
    if (total >= 1000) return `${formatNumber(total / 1000)} kg ${baseItem}`;
    return `${formatNumber(total)} g ${baseItem}`;
  }
  if (family === "volume") {
    if (total >= 1000) return `${formatNumber(total / 1000)} l ${baseItem}`;
    return `${formatNumber(total)} ml ${baseItem}`;
  }
  if (family === "tasse") return `${formatNumber(total)} tasse${total > 1 ? "s" : ""} ${baseItem}`;
  if (family === "tranche") return `${formatNumber(total)} tranche${total > 1 ? "s" : ""} ${baseItem}`;

  return `${formatNumber(total)} ${pluralize(baseItem, total)}`;
}

function getApprovedMealIngredientLines() {
  const lines = [];
  document.querySelectorAll('textarea[placeholder^="Ingrédients"]').forEach((textarea) => {
    if (textarea.closest?.('[data-meal-expired="true"]')) return;

    let card = textarea.parentElement;
    while (card && card !== document.body) {
      const approvedButton = Array.from(card.querySelectorAll('button[aria-pressed]')).find(
        (button) => (button.textContent || "").includes("Approuvé")
      );
      if (approvedButton) {
        if (approvedButton.getAttribute("aria-pressed") === "true") {
          String(textarea.value || "")
            .split(/[,;\n]+/)
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((item) => lines.push(item));
        }
        break;
      }
      card = card.parentElement;
    }
  });
  return lines;
}

function buildApprovedTotals() {
  const groups = new Map();
  getApprovedMealIngredientLines().forEach((line) => {
    const parsed = parseIngredient(line);
    const key = parsed?.key || canonicalIngredientKey(line);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  });
  return groups;
}

function ingredientMatchesInventory(ingredientKey, inventoryKeys) {
  if (!ingredientKey || !(inventoryKeys instanceof Set) || !inventoryKeys.size) return false;
  const ingredientTokens = new Set(ingredientKey.split(/\s+/).filter(Boolean));

  for (const inventoryKey of inventoryKeys) {
    if (!inventoryKey) continue;
    if (ingredientKey === inventoryKey) return true;

    const wantedTokens = String(inventoryKey).split(/\s+/).filter(Boolean);
    if (wantedTokens.length && wantedTokens.every((token) => ingredientTokens.has(token))) return true;
  }
  return false;
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

  const approvedTotals = buildApprovedTotals();
  const fridgeKeys = window.__fridgeIngredientKeys instanceof Set ? window.__fridgeIngredientKeys : new Set();
  const checkboxes = Array.from(section.querySelectorAll('input[type="checkbox"]'));
  const groups = new Map();

  checkboxes.forEach((checkbox) => {
    const data = getIngredientRow(checkbox);
    if (!data) return;

    const current = (data.label.textContent || "").trim();
    const previousAggregate = data.row.dataset.groceryAggregateLabel || "";
    let sourceLabel = data.row.dataset.groceryOriginalLabel || current;

    if (!previousAggregate || current !== previousAggregate) sourceLabel = current;
    data.row.dataset.groceryOriginalLabel = sourceLabel;
    delete data.row.dataset.groceryAggregateLabel;
    setIngredientName(data.label, sourceLabel);

    data.row.style.removeProperty("display");
    delete data.row.dataset.groceryDuplicate;

    const key = canonicalIngredientKey(sourceLabel);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ checkbox, row: data.row, label: data.label, sourceLabel });
  });

  groups.forEach((items, key) => {
    if (!items.length) return;

    if (ingredientMatchesInventory(key, fridgeKeys)) {
      items.forEach(({ row }) => {
        row.dataset.groceryInFridge = "true";
        row.style.setProperty("display", "none", "important");
      });
      return;
    }

    const leader = items[0];
    const sourceEntries = approvedTotals.get(key) || items.map((item) => item.sourceLabel);

    const mealDerived = items.some((item) => item.row.dataset.groceryOriginalLabel);
    if (mealDerived && approvedTotals.size > 0 && !approvedTotals.has(key)) {
      items.forEach(({ row }) => row.style.setProperty("display", "none", "important"));
      return;
    }

    const aggregate = formatAggregate(sourceEntries);
    leader.row.dataset.groceryGroup = key;
    leader.row.dataset.groceryMergedCount = String(items.length);
    delete leader.row.dataset.groceryInFridge;

    if (aggregate && sourceEntries.length > 0) {
      setIngredientName(leader.label, aggregate);
      leader.row.dataset.groceryAggregateLabel = aggregate;
    }

    items.slice(1).forEach(({ row }) => {
      row.dataset.groceryDuplicate = "true";
      row.dataset.groceryGroup = key;
      row.style.setProperty("display", "none", "important");
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
document.addEventListener("fridge-items-changed", scheduleGrouping);

const observer = new MutationObserver(scheduleGrouping);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});

queueMicrotask(scheduleGrouping);

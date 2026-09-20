import { supabase } from "./supabaseClient.js";
import { canonicalIngredientKey } from "./ingredientNormalization.js";

let fridge = [];
let pantry = [];
let common = [];
let syncTimer = null;
let pendingRender = false;

const inventoryOpen = new Map([
  ["fridge_items", false],
  ["pantry_items", false],
]);

const SYNC_DELAY_MS = 500;

function findSection() {
  return document.querySelector('main > section[data-weekly-grocery="true"]');
}

function findHeader(section) {
  return Array.from(section?.children || []).find((child) => {
    const text = child.textContent || "";
    return text.includes("Liste d'épicerie") || (text.includes("Épicerie des repas") || text.includes("repas préparés"));
  }) || null;
}

function findBody(section, header) {
  return Array.from(section?.children || []).find((child) => child !== header) || null;
}

function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return true;
  return !!active.closest?.("#common-grocery-wrapper-stable");
}

function publishExcluded() {
  const keys = new Set(
    [...fridge, ...pantry]
      .map((row) => canonicalIngredientKey(row.item))
      .filter(Boolean)
  );
  window.__fridgeIngredientKeys = keys;
  window.__pantryIngredientKeys = new Set(
    pantry.map((row) => canonicalIngredientKey(row.item)).filter(Boolean)
  );
  document.dispatchEvent(new CustomEvent("fridge-items-changed"));
}

async function loadAll({ allowRender = true } = {}) {
  const [fridgeResult, pantryResult, commonResult] = await Promise.all([
    supabase.from("fridge_items").select("id,item").order("item"),
    supabase.from("pantry_items").select("id,item").order("item"),
    supabase.from("common_grocery_items").select("id,item,checked,stock_status").order("created_at"),
  ]);

  if (!fridgeResult.error) fridge = fridgeResult.data || [];
  if (!pantryResult.error) pantry = pantryResult.data || [];
  if (!commonResult.error) common = commonResult.data || [];
  publishExcluded();

  if (allowRender && !isEditing()) {
    pendingRender = false;
    render();
  } else {
    pendingRender = true;
  }
}

function scheduleLoadAll(delay = SYNC_DELAY_MS) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    loadAll({ allowRender: !isEditing() });
  }, delay);
}

async function addItem(table, item) {
  const value = String(item || "").trim();
  if (!value) return;

  // On garde toujours la liste d'éléments repliée après un ajout.
  if (table === "fridge_items" || table === "pantry_items") inventoryOpen.set(table, false);

  if (table === "common_grocery_items") {
    const wrapper = document.getElementById("common-grocery-wrapper-stable");
    if (wrapper) wrapper.dataset.open = "true";
  }

  const payload = table === "common_grocery_items"
    ? { item: value }
    : { item: value, updated_at: new Date().toISOString() };

  const query = supabase.from(table);
  const { error } = table === "common_grocery_items"
    ? await query.insert(payload)
    : await query.upsert(payload, { onConflict: "item" });

  if (error) {
    console.error(`add ${table}`, error);
    return;
  }

  // La donnée se synchronise après 2 s, mais le DOM ne bouge pas tant qu'on écrit.
  scheduleLoadAll();
}

async function removeItem(table, id) {
  const source = table === "common_grocery_items" ? common : table === "fridge_items" ? fridge : pantry;
  const previous = [...source];
  if (table === "common_grocery_items") common = common.filter((item) => item.id !== id);
  if (table === "fridge_items") fridge = fridge.filter((item) => item.id !== id);
  if (table === "pantry_items") pantry = pantry.filter((item) => item.id !== id);
  publishExcluded();
  render();

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    console.error(`remove ${table}`, error);
    if (table === "common_grocery_items") common = previous;
    if (table === "fridge_items") fridge = previous;
    if (table === "pantry_items") pantry = previous;
    publishExcluded();
    render();
    return;
  }
  scheduleLoadAll(250);
}

function statusLabel(stockStatus) {
  if (stockStatus === "buy") return "À racheter";
  if (stockStatus === "stock") return "En stock";
  return "À vérifier";
}

function paintStatusButtons(id, stockStatus) {
  document.querySelectorAll(`[data-daily-grocery-item-id="${id}"] [data-daily-stock-dot]`).forEach((button) => {
    button.dataset.stockStatus = stockStatus;
    button.setAttribute("aria-label", `${button.dataset.itemName || "Aliment"} — ${statusLabel(stockStatus)}. Appuyer pour changer.`);
    button.title = statusLabel(stockStatus);
  });
}

async function setCommonStockStatus(id, stockStatus) {
  const previousItem = common.find((item) => item.id === id);
  const previousStatus = previousItem?.stock_status || "unknown";
  common = common.map((item) => item.id === id ? { ...item, stock_status: stockStatus } : item);
  paintStatusButtons(id, stockStatus);

  const { error } = await supabase
    .from("common_grocery_items")
    .update({ stock_status: stockStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("set common grocery stock status", error);
    common = common.map((item) => item.id === id ? { ...item, stock_status: previousStatus } : item);
    paintStatusButtons(id, previousStatus);
    return;
  }
  scheduleLoadAll(500);
}

function inputRow(placeholder, onAdd) {
  const row = document.createElement("div");
  row.dataset.inventoryInputRow = "true";
  Object.assign(row.style, {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 42px",
    gap: "7px",
    marginBottom: "8px",
  });

  const input = document.createElement("input");
  input.placeholder = placeholder;
  input.autocomplete = "off";
  Object.assign(input.style, {
    minWidth: "0",
    minHeight: "42px",
    border: "1px solid var(--line)",
    borderRadius: "9px",
    padding: "8px 10px",
    fontSize: "16px",
    boxSizing: "border-box",
  });

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "+";
  Object.assign(button.style, {
    minHeight: "42px",
    border: "1px solid var(--line)",
    borderRadius: "9px",
    background: "var(--card)",
    cursor: "pointer",
    fontSize: "20px",
  });

  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    onAdd(value);
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  };

  button.addEventListener("click", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit();
  });

  row.append(input, button);
  return row;
}

function inventoryPanel(title, hint, items, table, placeholder) {
  const panel = document.createElement("aside");
  panel.dataset.inventoryPanel = table;
  Object.assign(panel.style, {
    padding: "10px",
    border: "1px solid var(--line)",
    borderRadius: "10px",
    background: "var(--card)",
    minWidth: "0",
    boxSizing: "border-box",
  });

  const heading = document.createElement("div");
  heading.textContent = title;
  Object.assign(heading.style, { fontWeight: "800", marginBottom: "4px" });

  const help = document.createElement("div");
  help.textContent = hint;
  Object.assign(help.style, {
    fontSize: "12px",
    color: "var(--ink-soft)",
    marginBottom: "7px",
    lineHeight: "1.3",
  });

  panel.append(heading, help, inputRow(placeholder, (value) => addItem(table, value)));

  const open = inventoryOpen.get(table) === true;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.dataset.inventoryListToggle = table;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.textContent = `${open ? "▴" : "▾"} ${open ? "Masquer" : "Voir"} les éléments (${items.length})`;
  Object.assign(toggle.style, {
    width: "100%",
    minHeight: "34px",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    background: "var(--paper)",
    color: "var(--ink-soft)",
    fontSize: "12px",
    fontWeight: "800",
    cursor: "pointer",
    textAlign: "left",
    padding: "6px 8px",
  });

  toggle.addEventListener("click", () => {
    inventoryOpen.set(table, !open);
    const section = findSection();
    const header = findHeader(section);
    const body = findBody(section, header);
    const inventory = body?.querySelector("[data-family-inventory-stable]");
    if (inventory) inventory.dataset.signature = "";
    render();
  });
  panel.appendChild(toggle);

  if (open) {
    const list = document.createElement("div");
    list.dataset.inventoryItemsList = table;
    Object.assign(list.style, {
      marginTop: "6px",
      paddingTop: "3px",
      borderTop: "1px solid var(--line)",
    });

    items.forEach((item) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 30px",
        gap: "4px",
        alignItems: "center",
        padding: "3px 0",
        fontSize: "13px",
      });
      const label = document.createElement("span");
      label.textContent = item.item;
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "×";
      del.setAttribute("aria-label", `Supprimer ${item.item}`);
      Object.assign(del.style, {
        minHeight: "30px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: "18px",
      });
      del.addEventListener("click", () => removeItem(table, item.id));
      row.append(label, del);
      list.appendChild(row);
    });
    panel.appendChild(list);
  }

  return panel;
}

const DAILY_CATEGORIES = [
  {
    name: "Viandes et protéines",
    match: ["jambon", "saumon", "oeuf", "œuf", "oeufs", "œufs"],
  },
  {
    name: "Produits laitiers",
    match: ["lait ", "lait 2", "yogourt", "yaourt", "fromage", "beurre", "crème", "creme"],
  },
  {
    name: "Fruits et légumes",
    match: ["banane", "fruit", "fraise", "mangue", "bleuet", "framboise", "pomme", "kiwi", "concombre", "avocat", "laitue", "tomate", "citron", "lime"],
  },
  {
    name: "Boulangerie",
    match: ["pain", "bagel", "mcmuffin"],
  },
  {
    name: "Boissons",
    match: ["jus", "orange", "canneberge", "limonade"],
  },
  {
    name: "Collations et autres",
    match: [],
  },
];

function normalizeDaily(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-CA");
}

function dailyCategory(item) {
  const normalized = normalizeDaily(item);
  for (const category of DAILY_CATEGORIES.slice(0, -1)) {
    if (category.match.some((keyword) => normalized.includes(normalizeDaily(keyword)))) return category.name;
  }
  return "Collations et autres";
}

function ensureCommonShell(section) {
  let wrapper = document.getElementById("common-grocery-wrapper-stable");
  if (!wrapper) {
    wrapper = document.createElement("section");
    wrapper.id = "common-grocery-wrapper-stable";
    wrapper.dataset.workspaceGrocery = "true";
    wrapper.dataset.open = "false";
    section.insertAdjacentElement("afterend", wrapper);
  } else {
    wrapper.dataset.workspaceGrocery = "true";
    if (!wrapper.dataset.open) wrapper.dataset.open = "false";
  }

  let toggle = wrapper.querySelector(":scope > [data-daily-grocery-toggle]");
  let panel = wrapper.querySelector(":scope > [data-daily-grocery-panel]");

  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.dailyGroceryToggle = "true";
    toggle.setAttribute("aria-controls", "daily-grocery-panel");

    const icon = document.createElement("span");
    icon.dataset.dailyGroceryIcon = "true";
    icon.textContent = "🛒";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.dataset.dailyGroceryLabel = "true";
    label.textContent = "Liste d'épicerie quotidienne";

    const arrow = document.createElement("span");
    arrow.dataset.dailyGroceryArrow = "true";
    arrow.setAttribute("aria-hidden", "true");

    toggle.append(icon, label, arrow);
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = wrapper.dataset.open !== "true";
      wrapper.dataset.open = String(nextOpen);
      updateCommonVisibility(wrapper);
    });

    wrapper.prepend(toggle);
  }

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "daily-grocery-panel";
    panel.dataset.dailyGroceryPanel = "true";
    wrapper.appendChild(panel);
  }

  return { wrapper, toggle, panel };
}

function updateCommonVisibility(wrapper) {
  const open = wrapper.dataset.open === "true";
  const toggle = wrapper.querySelector(":scope > [data-daily-grocery-toggle]");
  const panel = wrapper.querySelector(":scope > [data-daily-grocery-panel]");
  const arrow = toggle?.querySelector("[data-daily-grocery-arrow]");

  toggle?.setAttribute("aria-expanded", String(open));
  if (arrow) arrow.textContent = open ? "▲" : "▼";
  if (panel) {
    panel.hidden = !open;
    panel.style.display = open ? "block" : "none";
  }
}

function statusDot(item) {
  const stockStatus = item.stock_status || "unknown";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "daily-grocery-status-dot";
  button.dataset.dailyStockDot = "true";
  button.dataset.stockStatus = stockStatus;
  button.dataset.itemName = item.item;
  button.setAttribute("aria-label", `${item.item} — ${statusLabel(stockStatus)}. Appuyer pour changer.`);
  button.title = statusLabel(stockStatus);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const current = common.find((row) => row.id === item.id)?.stock_status || "unknown";
    const next = current === "unknown" ? "buy" : current === "buy" ? "stock" : "unknown";
    setCommonStockStatus(item.id, next);
  });
  return button;
}

function renderCommon(section) {
  const { wrapper, toggle, panel } = ensureCommonShell(section);
  updateCommonVisibility(wrapper);

  const open = wrapper.dataset.open === "true";
  toggle.dataset.open = String(open);

  panel.replaceChildren();

  const add = inputRow("Ajouter un item à l'épicerie quotidienne", (value) => addItem("common_grocery_items", value));
  add.dataset.dailyGroceryAdd = "true";
  panel.appendChild(add);

  const legend = document.createElement("div");
  legend.className = "daily-grocery-legend";
  [
    ["unknown", "À vérifier"],
    ["buy", "À racheter"],
    ["stock", "En stock"],
  ].forEach(([status, label]) => {
    const item = document.createElement("span");
    item.className = "daily-grocery-legend-item";
    const dot = document.createElement("span");
    dot.className = "daily-grocery-legend-dot";
    dot.dataset.stockStatus = status;
    const text = document.createElement("span");
    text.textContent = label;
    item.append(dot, text);
    legend.appendChild(item);
  });
  panel.appendChild(legend);

  const byCategory = new Map(DAILY_CATEGORIES.map((category) => [category.name, []]));
  common.forEach((item) => byCategory.get(dailyCategory(item.item))?.push(item));

  DAILY_CATEGORIES.forEach((category) => {
    const items = byCategory.get(category.name) || [];
    if (!items.length) return;

    const group = document.createElement("section");
    group.className = "daily-grocery-category";

    const title = document.createElement("h3");
    title.textContent = category.name;
    group.appendChild(title);

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "daily-grocery-item";
      row.dataset.dailyGroceryItemId = String(item.id);

      const text = document.createElement("span");
      text.className = "daily-grocery-item-name";
      text.textContent = item.item;

      row.append(text, statusDot(item));
      group.appendChild(row);
    });

    panel.appendChild(group);
  });

  updateCommonVisibility(wrapper);
}

function render() {
  if (isEditing()) {
    pendingRender = true;
    return;
  }

  const section = findSection();
  if (!section) return;
  const header = findHeader(section);
  const body = findBody(section, header);
  if (!header || !body) return;

  const label = Array.from(header.querySelectorAll("span")).find((span) =>
    (span.textContent || "").includes("Liste d'épicerie")
  );
  if (label) label.textContent = "Liste d’épicerie pour les repas de la semaine";

  // Le frigo et les placards restent une source de filtrage, mais ne sont plus affichés.
  const inventory = body.querySelector("[data-family-inventory-stable]");
  inventory?.remove();

  body.style.display = "block";
  body.style.gridTemplateColumns = "";
  body.style.columnGap = "";
  body.style.rowGap = "";
  Array.from(body.children).forEach((child) => {
    child.style.gridColumn = "";
    child.style.gridRow = "";
  });

  renderCommon(section);
  pendingRender = false;
}

document.addEventListener("focusout", () => {
  if (!pendingRender) return;
  setTimeout(() => {
    if (!isEditing()) render();
  }, 0);
}, true);

const media = window.matchMedia("(max-width: 700px)");
media.addEventListener?.("change", () => render());

supabase.channel("family-grocery-stable")
  .on("postgres_changes", { event: "*", schema: "public", table: "fridge_items" }, () => scheduleLoadAll())
  .on("postgres_changes", { event: "*", schema: "public", table: "pantry_items" }, () => scheduleLoadAll())
  .on("postgres_changes", { event: "*", schema: "public", table: "common_grocery_items" }, () => scheduleLoadAll())
  .subscribe();

loadAll({ allowRender: true });


document.addEventListener("grocery-tab-opened", () => {
  const wrapper = document.getElementById("common-grocery-wrapper-stable");
  if (!wrapper) return;
  wrapper.dataset.open = "false";
  updateCommonVisibility(wrapper);
});

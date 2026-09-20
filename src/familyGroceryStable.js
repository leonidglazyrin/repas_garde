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

const SYNC_DELAY_MS = 2000;

function findSection() {
  return Array.from(document.querySelectorAll("main section")).find((section) => {
    const text = section.textContent || "";
    return text.includes("Liste d'épicerie pour les repas préparés") || text.includes("Liste d'épicerie") || (text.includes("Épicerie des repas") || text.includes("repas préparés"));
  }) || null;
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
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
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

async function setCommonStockStatus(id, stockStatus) {
  const previous = common.map((item) => ({ ...item }));
  common = common.map((item) => item.id === id ? { ...item, stock_status: stockStatus } : item);
  render();

  const { error } = await supabase
    .from("common_grocery_items")
    .update({ stock_status: stockStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("set common grocery stock status", error);
    common = previous;
    render();
    return;
  }
  scheduleLoadAll(250);
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

function renderCommon(section) {
  let wrapper = document.getElementById("common-grocery-wrapper-stable");
  if (!wrapper) {
    wrapper = document.createElement("section");
    wrapper.id = "common-grocery-wrapper-stable";
    wrapper.dataset.open = "false";
    section.insertAdjacentElement("afterend", wrapper);
  }

  const open = wrapper.dataset.open === "true";
  const signature = `${open}|${common.map((x) => `${x.id}:${x.item}:${x.checked}`).join(";")}`;
  if (wrapper.dataset.signature === signature) return;
  wrapper.dataset.signature = signature;
  wrapper.replaceChildren();

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.replaceChildren();
  const icon = document.createElement("span");
  icon.textContent = "🛒";
  icon.setAttribute("aria-hidden", "true");
  Object.assign(icon.style, { fontSize: "18px", lineHeight: "1", flexShrink: "0" });

  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "Liste d'épicerie quotidienne";
  const toggleArrow = document.createElement("span");
  toggleArrow.textContent = open ? "▲" : "▼";
  Object.assign(toggleArrow.style, {
    marginLeft: "auto",
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid currentColor",
    background: "var(--card)",
    fontSize: "18px",
    flexShrink: "0",
  });
  toggle.append(icon, toggleLabel, toggleArrow);
  Object.assign(toggle.style, {
    width: "100%",
    minHeight: "56px",
    border: `2px solid ${open ? "var(--herb)" : "var(--honey)"}`,
    borderRadius: "10px",
    background: open ? "var(--herb-soft)" : "var(--honey-soft)",
    color: open ? "var(--herb)" : "var(--ink)",
    fontWeight: "800",
    fontSize: "15px",
    cursor: "pointer",
    textAlign: "left",
    padding: "10px 12px 10px 16px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    boxShadow: open ? "0 2px 8px rgba(76,107,78,0.16)" : "0 2px 8px rgba(201,138,59,0.18)",
  });
  toggle.addEventListener("click", () => {
    wrapper.dataset.open = String(!open);
    renderCommon(section);
  });
  wrapper.appendChild(toggle);
  if (!open) return;

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    marginTop: "7px",
    padding: "10px",
    border: "1px solid var(--line)",
    borderRadius: "10px",
    background: "var(--card)",
  });
  panel.appendChild(inputRow("Ajouter manuellement", (value) => addItem("common_grocery_items", value)));

  const help = document.createElement("div");
  help.textContent = "Pour chaque essentiel, indique s'il est en stock ou s'il faut le racheter.";
  Object.assign(help.style, {
    margin: "2px 0 8px",
    color: "var(--ink-soft)",
    fontSize: "12px",
    lineHeight: "1.35",
  });
  panel.appendChild(help);

  common.forEach((item) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) auto 30px",
      gap: "7px",
      alignItems: "center",
      padding: "7px 0",
      borderTop: "1px solid var(--line)",
    });

    const text = document.createElement("span");
    text.textContent = item.item;
    Object.assign(text.style, {
      fontSize: "13px",
      lineHeight: "1.3",
      minWidth: "0",
    });

    const status = document.createElement("button");
    status.type = "button";
    const stockStatus = item.stock_status || "unknown";
    status.dataset.stockStatus = stockStatus;
    status.textContent =
      stockStatus === "buy" ? "À racheter" :
      stockStatus === "stock" ? "En stock" :
      "À vérifier";
    status.title = "Appuyer pour changer le statut";
    Object.assign(status.style, {
      minHeight: "32px",
      padding: "5px 9px",
      borderRadius: "16px",
      border: "1px solid var(--line)",
      background:
        stockStatus === "buy" ? "var(--honey-soft)" :
        stockStatus === "stock" ? "var(--herb-soft)" :
        "var(--paper)",
      color:
        stockStatus === "buy" ? "var(--honey)" :
        stockStatus === "stock" ? "var(--herb)" :
        "var(--ink-soft)",
      fontSize: "11px",
      fontWeight: "800",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    status.addEventListener("click", () => {
      const next =
        stockStatus === "unknown" ? "buy" :
        stockStatus === "buy" ? "stock" :
        "unknown";
      setCommonStockStatus(item.id, next);
    });

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", `Retirer ${item.item}`);
    del.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeItem("common_grocery_items", item.id);
    });
    Object.assign(del.style, {
      minHeight: "30px",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontSize: "18px",
    });

    row.append(text, status, del);
    panel.appendChild(row);
  });
  wrapper.appendChild(panel);
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

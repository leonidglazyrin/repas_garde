import { supabase } from "./supabaseClient.js";
import { canonicalIngredientKey } from "./ingredientNormalization.js";

let fridge = [];
let pantry = [];
let common = [];
let mountedSection = null;
let keepOpenUntil = 0;
let refocusPlaceholder = "";

function findSection() {
  return Array.from(document.querySelectorAll("main section")).find((section) => {
    const text = section.textContent || "";
    return text.includes("Liste d'épicerie pour les repas préparés") || text.includes("Liste d'épicerie");
  }) || null;
}

function findHeader(section) {
  return Array.from(section?.children || []).find((child) => (child.textContent || "").includes("Liste d'épicerie")) || null;
}

function findBody(section, header) {
  return Array.from(section?.children || []).find((child) => child !== header) || null;
}

function keepPreparedListOpen() {
  const section = findSection();
  if (!section) return;
  const header = findHeader(section);
  if (section.dataset.groceryOpen !== "true") header?.click();
}

function publishExcluded() {
  const keys = new Set(
    [...fridge, ...pantry]
      .map((row) => canonicalIngredientKey(row.item))
      .filter(Boolean)
  );
  window.__fridgeIngredientKeys = keys;
  window.__pantryIngredientKeys = new Set(pantry.map((row) => canonicalIngredientKey(row.item)).filter(Boolean));
  document.dispatchEvent(new CustomEvent("fridge-items-changed"));
}

async function loadAll() {
  const [fridgeResult, pantryResult, commonResult] = await Promise.all([
    supabase.from("fridge_items").select("id,item").order("item"),
    supabase.from("pantry_items").select("id,item").order("item"),
    supabase.from("common_grocery_items").select("id,item,checked").order("created_at"),
  ]);
  if (!fridgeResult.error) fridge = fridgeResult.data || [];
  if (!pantryResult.error) pantry = pantryResult.data || [];
  if (!commonResult.error) common = commonResult.data || [];
  publishExcluded();
  render();

  if (Date.now() < keepOpenUntil) {
    keepPreparedListOpen();
    if (refocusPlaceholder) {
      requestAnimationFrame(() => {
        const input = Array.from(document.querySelectorAll("input")).find((node) => node.placeholder === refocusPlaceholder);
        input?.focus({ preventScroll: true });
      });
    }
  }
}

async function addItem(table, item, placeholder = "") {
  const value = String(item || "").trim();
  if (!value) return;

  keepOpenUntil = Date.now() + 10000;
  refocusPlaceholder = placeholder;
  keepPreparedListOpen();

  if (table === "common_grocery_items") {
    const wrapper = document.getElementById("common-grocery-wrapper-stable");
    if (wrapper) wrapper.dataset.open = "true";
  }

  const payload = table === "common_grocery_items" ? { item: value } : { item: value, updated_at: new Date().toISOString() };
  const query = supabase.from(table);
  const { error } = table === "common_grocery_items"
    ? await query.insert(payload)
    : await query.upsert(payload, { onConflict: "item" });
  if (error) console.error(`add ${table}`, error);
  await loadAll();
}

async function removeItem(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error(`remove ${table}`, error);
  await loadAll();
}

async function toggleCommon(id, checked) {
  const { error } = await supabase.from("common_grocery_items").update({ checked, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("toggle common grocery", error);
  await loadAll();
}

function inputRow(placeholder, onAdd) {
  const row = document.createElement("div");
  Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) 38px", gap: "6px", marginBottom: "8px" });
  const input = document.createElement("input");
  input.placeholder = placeholder;
  input.autocomplete = "off";
  Object.assign(input.style, { minWidth: "0", minHeight: "38px", border: "1px solid var(--line)", borderRadius: "8px", padding: "7px 9px", fontSize: "16px" });
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "+";
  Object.assign(button.style, { minHeight: "38px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--card)", cursor: "pointer", fontSize: "20px" });
  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    onAdd(value, placeholder);
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
  Object.assign(panel.style, { padding: "12px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--card)", minWidth: "0" });
  const heading = document.createElement("div");
  heading.textContent = title;
  Object.assign(heading.style, { fontWeight: "800", marginBottom: "6px" });
  const help = document.createElement("div");
  help.textContent = hint;
  Object.assign(help.style, { fontSize: "12px", color: "var(--ink-soft)", marginBottom: "8px" });
  panel.append(heading, help, inputRow(placeholder, (value, currentPlaceholder) => addItem(table, value, currentPlaceholder)));
  items.forEach((item) => {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) 28px", gap: "5px", alignItems: "center", padding: "3px 0", fontSize: "13px" });
    const label = document.createElement("span");
    label.textContent = item.item;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", `Supprimer ${item.item}`);
    Object.assign(del.style, { border: "none", background: "transparent", cursor: "pointer", fontSize: "18px" });
    del.addEventListener("click", () => removeItem(table, item.id));
    row.append(label, del);
    panel.appendChild(row);
  });
  return panel;
}

function renderCommon(section) {
  let wrapper = document.getElementById("common-grocery-wrapper-stable");
  if (!wrapper) {
    wrapper = document.createElement("section");
    wrapper.id = "common-grocery-wrapper-stable";
    wrapper.dataset.open = "false";
    wrapper.style.marginTop = "12px";
    section.insertAdjacentElement("afterend", wrapper);
  }
  const open = wrapper.dataset.open === "true";
  const signature = `${open}|${common.map((x) => `${x.id}:${x.item}:${x.checked}`).join(";")}`;
  if (wrapper.dataset.signature === signature) return;
  wrapper.dataset.signature = signature;
  wrapper.replaceChildren();
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = `✎ Épicerie commune ${open ? "▴" : "▾"}`;
  Object.assign(toggle.style, { width: "100%", minHeight: "38px", border: "1px solid var(--line)", borderRadius: "9px", background: "transparent", color: "var(--ink-soft)", fontWeight: "700", cursor: "pointer", textAlign: "left", padding: "8px 11px" });
  toggle.addEventListener("click", () => { wrapper.dataset.open = String(!open); renderCommon(section); });
  wrapper.appendChild(toggle);
  if (!open) return;
  const panel = document.createElement("div");
  Object.assign(panel.style, { marginTop: "7px", padding: "12px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--card)" });
  panel.appendChild(inputRow("Ajouter manuellement", (value, placeholder) => addItem("common_grocery_items", value, placeholder)));
  common.forEach((item) => {
    const row = document.createElement("label");
    Object.assign(row.style, { display: "grid", gridTemplateColumns: "28px minmax(0,1fr) 28px", gap: "6px", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--line)" });
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!item.checked;
    check.addEventListener("change", () => toggleCommon(item.id, check.checked));
    const text = document.createElement("span");
    text.textContent = item.item;
    if (item.checked) { text.style.textDecoration = "line-through"; text.style.opacity = ".55"; }
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.addEventListener("click", (event) => { event.preventDefault(); removeItem("common_grocery_items", item.id); });
    Object.assign(del.style, { border: "none", background: "transparent", cursor: "pointer", fontSize: "18px" });
    row.append(check, text, del);
    panel.appendChild(row);
  });
  wrapper.appendChild(panel);
}

function render() {
  const section = findSection();
  if (!section) return;
  const header = findHeader(section);
  const body = findBody(section, header);
  if (!header || !body) return;

  const label = Array.from(header.querySelectorAll("span")).find((span) => (span.textContent || "").includes("Liste d'épicerie"));
  if (label) label.textContent = "Liste d'épicerie pour les repas préparés";

  const signature = `${fridge.map((x) => `${x.id}:${x.item}`).join(";")}|${pantry.map((x) => `${x.id}:${x.item}`).join(";")}|${window.innerWidth <= 700}`;
  let inventory = body.querySelector("[data-family-inventory-stable]");
  if (!inventory) {
    inventory = document.createElement("div");
    inventory.dataset.familyInventoryStable = "true";
    body.appendChild(inventory);
  }
  if (inventory.dataset.signature !== signature) {
    inventory.dataset.signature = signature;
    inventory.replaceChildren(
      inventoryPanel("🧊 Déjà dans le frigo", "Ces aliments ne sont pas ajoutés à la liste.", fridge, "fridge_items", "Ajouter au frigo"),
      inventoryPanel("🥫 Déjà dans les placards", "Ces ingrédients ne sont pas ajoutés à la liste.", pantry, "pantry_items", "Ajouter aux placards")
    );
  }
  Object.assign(inventory.style, { display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" });

  const mobile = window.innerWidth <= 700;
  body.style.display = "grid";
  body.style.gridTemplateColumns = mobile ? "minmax(0,1fr)" : "minmax(0,1.65fr) minmax(230px,.75fr)";
  body.style.columnGap = "14px";
  Array.from(body.children).forEach((child) => {
    child.style.gridColumn = child === inventory && !mobile ? "2" : "1";
  });
  if (!mobile) inventory.style.gridRow = "1 / span 30";

  renderCommon(section);
  mountedSection = section;

  if (Date.now() < keepOpenUntil) keepPreparedListOpen();
}

window.addEventListener("resize", render);
setInterval(() => {
  if (mountedSection && !document.contains(mountedSection)) mountedSection = null;
  render();
}, 1500);

supabase.channel("family-grocery-stable")
  .on("postgres_changes", { event: "*", schema: "public", table: "fridge_items" }, loadAll)
  .on("postgres_changes", { event: "*", schema: "public", table: "pantry_items" }, loadAll)
  .on("postgres_changes", { event: "*", schema: "public", table: "common_grocery_items" }, loadAll)
  .subscribe();

loadAll();
queueMicrotask(render);

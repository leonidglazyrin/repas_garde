import { supabase } from "./supabaseClient.js";
import { canonicalIngredientKey } from "./ingredientNormalization.js";

let fridgeItems = [];
let commonItems = [];
let frame = null;
let fridgeChannel = null;
let commonChannel = null;

function findGrocerySection() {
  return Array.from(document.querySelectorAll("main section")).find((section) =>
    (section.textContent || "").includes("Liste d'épicerie")
  ) || null;
}

function findHeader(section) {
  return Array.from(section?.children || []).find((child) =>
    (child.textContent || "").includes("Liste d'épicerie")
  ) || null;
}

function findBody(section, header) {
  return Array.from(section?.children || []).find((child) => child !== header) || null;
}

function publishFridgeKeys() {
  window.__fridgeIngredientKeys = new Set(
    fridgeItems.map((row) => canonicalIngredientKey(row.item)).filter(Boolean)
  );
  document.dispatchEvent(new CustomEvent("fridge-items-changed"));
}

async function loadFridge() {
  const { data, error } = await supabase.from("fridge_items").select("id,item").order("item", { ascending: true });
  if (error) {
    console.error("load fridge items", error);
    return;
  }
  fridgeItems = data || [];
  publishFridgeKeys();
  schedule();
}

async function addFridge(item) {
  const value = String(item || "").trim();
  if (!value) return;
  const { error } = await supabase
    .from("fridge_items")
    .upsert({ item: value, updated_at: new Date().toISOString() }, { onConflict: "item" });
  if (error) console.error("add fridge item", error);
  await loadFridge();
}

async function removeFridge(id) {
  const { error } = await supabase.from("fridge_items").delete().eq("id", id);
  if (error) console.error("remove fridge item", error);
  await loadFridge();
}

async function loadCommon() {
  const { data, error } = await supabase
    .from("common_grocery_items")
    .select("id,item,checked")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("load common grocery", error);
    return;
  }
  commonItems = data || [];
  schedule();
}

async function addCommon(item) {
  const value = String(item || "").trim();
  if (!value) return;
  const { error } = await supabase.from("common_grocery_items").insert({ item: value });
  if (error) console.error("add common grocery item", error);
  await loadCommon();
}

async function toggleCommon(id, checked) {
  const { error } = await supabase
    .from("common_grocery_items")
    .update({ checked, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("toggle common grocery", error);
  await loadCommon();
}

async function removeCommon(id) {
  const { error } = await supabase.from("common_grocery_items").delete().eq("id", id);
  if (error) console.error("remove common grocery item", error);
  await loadCommon();
}

function makeInputRow(placeholder, onAdd) {
  const row = document.createElement("div");
  Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) 38px", gap: "6px", marginBottom: "10px" });

  const input = document.createElement("input");
  input.placeholder = placeholder;
  Object.assign(input.style, {
    minWidth: "0",
    minHeight: "38px",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    padding: "7px 9px",
    fontSize: "16px",
    background: "var(--card)",
  });

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "+";
  button.setAttribute("aria-label", `Ajouter ${placeholder.toLocaleLowerCase("fr-CA")}`);
  Object.assign(button.style, {
    minHeight: "38px",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    background: "var(--card)",
    fontSize: "20px",
    cursor: "pointer",
  });

  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    onAdd(value);
  };
  button.addEventListener("click", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit();
  });

  row.append(input, button);
  return row;
}

function renderFridgePanel(body) {
  let panel = body.querySelector("[data-fridge-panel]");
  if (!panel) {
    panel = document.createElement("aside");
    panel.dataset.fridgePanel = "true";
    Object.assign(panel.style, {
      gridColumn: "2",
      gridRow: "1 / span 30",
      alignSelf: "start",
      padding: "12px",
      border: "1px solid var(--line)",
      borderRadius: "10px",
      background: "#F7FBF7",
      minWidth: "0",
    });
    body.appendChild(panel);
  }

  panel.replaceChildren();
  const title = document.createElement("div");
  title.textContent = "🧊 Déjà dans le frigo";
  Object.assign(title.style, { fontWeight: "800", marginBottom: "8px", color: "var(--herb)" });
  panel.appendChild(title);

  const hint = document.createElement("div");
  hint.textContent = "Ces aliments sont automatiquement retirés de la liste des repas.";
  Object.assign(hint.style, { fontSize: "12px", color: "var(--ink-soft)", marginBottom: "9px", lineHeight: "1.35" });
  panel.appendChild(hint);
  panel.appendChild(makeInputRow("Ajouter au frigo", addFridge));

  const list = document.createElement("div");
  Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "5px" });
  fridgeItems.forEach((item) => {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) 28px", alignItems: "center", gap: "5px", fontSize: "13px" });
    const label = document.createElement("span");
    label.textContent = item.item;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", `Retirer ${item.item} du frigo`);
    Object.assign(del.style, { border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-soft)", fontSize: "18px" });
    del.addEventListener("click", () => removeFridge(item.id));
    row.append(label, del);
    list.appendChild(row);
  });
  panel.appendChild(list);
}

function styleGroceryColumns(body) {
  const mobile = window.innerWidth <= 700;
  body.style.display = "grid";
  body.style.gridTemplateColumns = mobile ? "minmax(0,1fr)" : "minmax(0,1.65fr) minmax(230px,.75fr)";
  body.style.columnGap = "14px";
  body.style.alignItems = "start";

  Array.from(body.children).forEach((child) => {
    if (child.dataset.fridgePanel === "true") {
      child.style.gridColumn = mobile ? "1" : "2";
      child.style.gridRow = mobile ? "auto" : "1 / span 30";
      child.style.marginTop = mobile ? "12px" : "0";
      return;
    }
    child.style.gridColumn = "1";
  });
}

function renameGrocery(section, header) {
  const candidates = Array.from(header?.querySelectorAll("span") || []);
  const label = candidates.find((span) => (span.textContent || "").trim() === "Liste d'épicerie");
  if (label) label.textContent = "Liste d'épicerie pour les repas préparés";
  section.dataset.preparedGrocery = "true";
}

function renderCommonSection(section) {
  let wrapper = document.getElementById("common-grocery-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("section");
    wrapper.id = "common-grocery-wrapper";
    wrapper.style.marginTop = "12px";
    section.insertAdjacentElement("afterend", wrapper);
  }

  const wasOpen = wrapper.dataset.open === "true";
  wrapper.replaceChildren();
  wrapper.dataset.open = String(wasOpen);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = `✎ Épicerie commune ${wasOpen ? "▴" : "▾"}`;
  Object.assign(toggle.style, {
    width: "100%",
    minHeight: "38px",
    border: "1px solid var(--line)",
    borderRadius: "9px",
    background: "transparent",
    color: "var(--ink-soft)",
    fontWeight: "700",
    cursor: "pointer",
    textAlign: "left",
    padding: "8px 11px",
  });
  toggle.addEventListener("click", () => {
    wrapper.dataset.open = String(wrapper.dataset.open !== "true");
    renderCommonSection(section);
  });
  wrapper.appendChild(toggle);

  if (!wasOpen) return;
  const panel = document.createElement("div");
  Object.assign(panel.style, { marginTop: "7px", padding: "12px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--card)" });
  panel.appendChild(makeInputRow("Ajouter manuellement", addCommon));

  commonItems.forEach((item) => {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "grid", gridTemplateColumns: "28px minmax(0,1fr) 28px", alignItems: "center", gap: "6px", padding: "6px 0", borderTop: "1px solid var(--line)" });
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!item.checked;
    check.addEventListener("change", () => toggleCommon(item.id, check.checked));
    const label = document.createElement("span");
    label.textContent = item.item;
    if (item.checked) {
      label.style.textDecoration = "line-through";
      label.style.opacity = ".55";
    }
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", `Supprimer ${item.item}`);
    Object.assign(del.style, { border: "none", background: "transparent", cursor: "pointer", fontSize: "18px", color: "var(--ink-soft)" });
    del.addEventListener("click", () => removeCommon(item.id));
    row.append(check, label, del);
    panel.appendChild(row);
  });
  wrapper.appendChild(panel);
}

function sync() {
  const section = findGrocerySection();
  if (!section) return;
  const header = findHeader(section);
  const body = findBody(section, header);
  if (!header || !body) return;
  renameGrocery(section, header);
  renderFridgePanel(body);
  styleGroceryColumns(body);
  renderCommonSection(section);
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    sync();
  });
}

window.addEventListener("resize", schedule);
const observer = new MutationObserver(schedule);
observer.observe(document.documentElement, { childList: true, subtree: true });

fridgeChannel = supabase.channel("fridge-items").on("postgres_changes", { event: "*", schema: "public", table: "fridge_items" }, loadFridge).subscribe();
commonChannel = supabase.channel("common-grocery-items").on("postgres_changes", { event: "*", schema: "public", table: "common_grocery_items" }, loadCommon).subscribe();

loadFridge();
loadCommon();
queueMicrotask(schedule);

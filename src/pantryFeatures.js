import { supabase } from "./supabaseClient.js";
import { canonicalIngredientKey } from "./ingredientNormalization.js";

let pantryItems = [];
let fridgeItems = [];
let frame = null;

function findPreparedGrocerySection() {
  return Array.from(document.querySelectorAll("main section")).find((section) =>
    (section.textContent || "").includes("Liste d'épicerie pour les repas préparés") ||
    (section.textContent || "").includes("Liste d'épicerie")
  ) || null;
}

function findBody(section) {
  const header = Array.from(section?.children || []).find((child) =>
    (child.textContent || "").includes("Liste d'épicerie")
  );
  return Array.from(section?.children || []).find((child) => child !== header) || null;
}

function publishExcludedKeys() {
  const fridge = new Set(fridgeItems.map((row) => canonicalIngredientKey(row.item)).filter(Boolean));
  const pantry = new Set(pantryItems.map((row) => canonicalIngredientKey(row.item)).filter(Boolean));
  window.__pantryIngredientKeys = pantry;
  window.__fridgeIngredientKeys = new Set([...fridge, ...pantry]);
  document.dispatchEvent(new CustomEvent("fridge-items-changed"));
}

async function loadInventories() {
  const [fridgeResult, pantryResult] = await Promise.all([
    supabase.from("fridge_items").select("id,item").order("item", { ascending: true }),
    supabase.from("pantry_items").select("id,item").order("item", { ascending: true }),
  ]);
  if (fridgeResult.error) console.error("load fridge inventory", fridgeResult.error);
  if (pantryResult.error) console.error("load pantry inventory", pantryResult.error);
  if (!fridgeResult.error) fridgeItems = fridgeResult.data || [];
  if (!pantryResult.error) pantryItems = pantryResult.data || [];
  publishExcludedKeys();
  schedule();
}

async function addPantry(item) {
  const value = String(item || "").trim();
  if (!value) return;
  const { error } = await supabase
    .from("pantry_items")
    .upsert({ item: value, updated_at: new Date().toISOString() }, { onConflict: "item" });
  if (error) console.error("add pantry item", error);
  await loadInventories();
}

async function removePantry(id) {
  const { error } = await supabase.from("pantry_items").delete().eq("id", id);
  if (error) console.error("remove pantry item", error);
  await loadInventories();
}

function makeInputRow() {
  const row = document.createElement("div");
  Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) 38px", gap: "6px", marginBottom: "10px" });
  const input = document.createElement("input");
  input.placeholder = "Ajouter aux placards";
  Object.assign(input.style, { minWidth: "0", minHeight: "38px", border: "1px solid var(--line)", borderRadius: "8px", padding: "7px 9px", fontSize: "16px", background: "var(--card)" });
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "+";
  button.setAttribute("aria-label", "Ajouter dans les placards");
  Object.assign(button.style, { minHeight: "38px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--card)", fontSize: "20px", cursor: "pointer" });
  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    addPantry(value);
  };
  button.addEventListener("click", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit();
  });
  row.append(input, button);
  return row;
}

function renderPantry(body) {
  let panel = body.querySelector("[data-pantry-panel]");
  if (!panel) {
    panel = document.createElement("aside");
    panel.dataset.pantryPanel = "true";
    body.appendChild(panel);
  }
  Object.assign(panel.style, {
    gridColumn: window.innerWidth <= 700 ? "1" : "2",
    gridRow: "auto",
    alignSelf: "start",
    marginTop: "10px",
    padding: "12px",
    border: "1px solid var(--line)",
    borderRadius: "10px",
    background: "#FBF8F0",
    minWidth: "0",
  });

  const fridge = body.querySelector("[data-fridge-panel]");
  if (fridge) {
    fridge.style.gridRow = "auto";
    fridge.style.gridColumn = window.innerWidth <= 700 ? "1" : "2";
  }

  panel.replaceChildren();
  const title = document.createElement("div");
  title.textContent = "🥫 Déjà dans les placards";
  Object.assign(title.style, { fontWeight: "800", marginBottom: "8px", color: "#8A6A32" });
  panel.appendChild(title);
  const hint = document.createElement("div");
  hint.textContent = "Ces ingrédients sont eux aussi retirés automatiquement de la liste d'épicerie.";
  Object.assign(hint.style, { fontSize: "12px", color: "var(--ink-soft)", marginBottom: "9px", lineHeight: "1.35" });
  panel.appendChild(hint);
  panel.appendChild(makeInputRow());

  const list = document.createElement("div");
  Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "5px" });
  pantryItems.forEach((item) => {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) 28px", alignItems: "center", gap: "5px", fontSize: "13px" });
    const label = document.createElement("span");
    label.textContent = item.item;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", `Retirer ${item.item} des placards`);
    Object.assign(del.style, { border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-soft)", fontSize: "18px" });
    del.addEventListener("click", () => removePantry(item.id));
    row.append(label, del);
    list.appendChild(row);
  });
  panel.appendChild(list);
}

function sync() {
  const section = findPreparedGrocerySection();
  const body = findBody(section);
  if (!body) return;
  renderPantry(body);
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

supabase.channel("pantry-items")
  .on("postgres_changes", { event: "*", schema: "public", table: "pantry_items" }, loadInventories)
  .subscribe();
supabase.channel("pantry-fridge-items")
  .on("postgres_changes", { event: "*", schema: "public", table: "fridge_items" }, loadInventories)
  .subscribe();

loadInventories();
queueMicrotask(schedule);

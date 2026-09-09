import { supabase } from "./supabaseClient.js";

const TABLES = new Set(["fridge_items", "pantry_items"]);

function finishEdit(row, text, editButton, deleteButton) {
  const label = document.createElement("span");
  label.textContent = text;
  row.replaceChildren(label, editButton, deleteButton);
  editButton.textContent = "✎";
  editButton.setAttribute("aria-label", `Modifier ${text}`);
  row.dataset.inventoryEditing = "false";
}

async function saveEdit(row, table, oldValue, input, editButton, deleteButton) {
  const value = input.value.trim();
  if (!value || value === oldValue) {
    finishEdit(row, oldValue, editButton, deleteButton);
    return;
  }

  editButton.disabled = true;
  const { error } = await supabase
    .from(table)
    .update({ item: value, updated_at: new Date().toISOString() })
    .eq("item", oldValue);
  editButton.disabled = false;

  if (error) {
    console.error(`edit ${table}`, error);
    finishEdit(row, oldValue, editButton, deleteButton);
    return;
  }

  finishEdit(row, value, editButton, deleteButton);
}

function startEdit(row, table) {
  if (row.dataset.inventoryEditing === "true") return;

  const label = row.querySelector("span");
  const deleteButton = Array.from(row.querySelectorAll("button")).find((button) => button.textContent === "×");
  const editButton = row.querySelector('[data-inventory-edit="true"]');
  if (!label || !deleteButton || !editButton) return;

  const oldValue = (label.textContent || "").trim();
  const input = document.createElement("input");
  input.value = oldValue;
  input.setAttribute("aria-label", `Modifier ${oldValue}`);
  Object.assign(input.style, {
    width: "100%",
    minWidth: "0",
    minHeight: "32px",
    border: "1px solid var(--line)",
    borderRadius: "7px",
    padding: "5px 7px",
    fontSize: "16px",
    boxSizing: "border-box",
  });

  row.dataset.inventoryEditing = "true";
  editButton.textContent = "✓";
  editButton.setAttribute("aria-label", "Enregistrer la modification");
  row.replaceChildren(input, editButton, deleteButton);
  input.focus({ preventScroll: true });
  input.select();

  const save = () => saveEdit(row, table, oldValue, input, editButton, deleteButton);
  editButton.onclick = save;
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishEdit(row, oldValue, editButton, deleteButton);
    }
  });
}

function enhanceInventoryRows() {
  document.querySelectorAll("[data-inventory-items-list]").forEach((list) => {
    const table = list.dataset.inventoryItemsList;
    if (!TABLES.has(table)) return;

    Array.from(list.children).forEach((row) => {
      if (!(row instanceof HTMLElement) || row.querySelector('[data-inventory-edit="true"]')) return;

      const deleteButton = Array.from(row.querySelectorAll("button")).find((button) => button.textContent === "×");
      const label = row.querySelector("span");
      if (!deleteButton || !label) return;

      row.style.gridTemplateColumns = "minmax(0,1fr) 30px 30px";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.dataset.inventoryEdit = "true";
      editButton.textContent = "✎";
      editButton.setAttribute("aria-label", `Modifier ${(label.textContent || "").trim()}`);
      Object.assign(editButton.style, {
        minHeight: "30px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: "15px",
        padding: "0",
      });
      editButton.addEventListener("click", () => startEdit(row, table));
      row.insertBefore(editButton, deleteButton);
    });
  });
}

document.addEventListener("click", () => queueMicrotask(enhanceInventoryRows), true);
document.addEventListener("fridge-items-changed", () => queueMicrotask(enhanceInventoryRows));
queueMicrotask(enhanceInventoryRows);

let scheduled = false;

function parseIngredients(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderPreview(textarea, preview) {
  const items = parseIngredients(textarea.value);
  preview.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.textContent = "Aucun ingrédient saisi";
    empty.style.color = "var(--ink-soft)";
    empty.style.fontSize = "14px";
    preview.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  Object.assign(list.style, {
    margin: "0",
    padding: "0 0 0 20px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  });

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    Object.assign(li.style, {
      fontSize: "15px",
      lineHeight: "1.35",
      overflowWrap: "anywhere",
    });
    list.appendChild(li);
  });

  preview.appendChild(list);
}

function buildDisclosure(textarea) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mealIngredientsToggle = "true";
  button.setAttribute("aria-expanded", "false");
  button.textContent = "Ingrédients ▾";

  Object.assign(button.style, {
    width: "100%",
    minHeight: "42px",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    padding: "8px 10px",
    background: "var(--card)",
    color: "var(--ink-soft)",
    fontSize: "14px",
    fontWeight: "600",
    textAlign: "left",
    cursor: "pointer",
  });

  const panel = document.createElement("div");
  panel.dataset.mealIngredientsPanel = "true";
  Object.assign(panel.style, {
    display: "none",
    width: "100%",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    padding: "10px 12px",
    background: "var(--card)",
  });

  const preview = document.createElement("div");
  preview.dataset.mealIngredientsPreview = "true";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "Modifier les ingrédients";
  Object.assign(editButton.style, {
    marginTop: "10px",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    padding: "7px 10px",
    background: "var(--paper)",
    color: "var(--ink-soft)",
    fontSize: "14px",
    cursor: "pointer",
  });

  panel.appendChild(preview);
  panel.appendChild(editButton);

  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", open ? "false" : "true");
    button.textContent = open ? "Ingrédients ▾" : "Ingrédients ▴";
    panel.style.display = open ? "none" : "block";
    textarea.style.display = "none";
    editButton.textContent = "Modifier les ingrédients";
    if (!open) renderPreview(textarea, preview);
  });

  editButton.addEventListener("click", () => {
    const editing = textarea.style.display !== "none";
    if (editing) {
      textarea.style.display = "none";
      editButton.textContent = "Modifier les ingrédients";
      renderPreview(textarea, preview);
      return;
    }

    textarea.style.display = "block";
    textarea.style.width = "100%";
    textarea.style.marginTop = "10px";
    textarea.style.fontSize = "16px";
    textarea.style.lineHeight = "1.4";
    textarea.style.minHeight = "120px";
    editButton.textContent = "Masquer l’éditeur";
    textarea.focus();
  });

  textarea.addEventListener("input", () => {
    if (panel.style.display !== "none") renderPreview(textarea, preview);
  });

  return { button, panel };
}

function applyDisclosure() {
  scheduled = false;

  document.querySelectorAll('textarea[placeholder^="Ingrédients"]').forEach((textarea) => {
    if (textarea.dataset.ingredientsDisclosureReady === "true") return;

    textarea.dataset.ingredientsDisclosureReady = "true";
    textarea.style.display = "none";

    const { button, panel } = buildDisclosure(textarea);
    textarea.insertAdjacentElement("beforebegin", panel);
    panel.insertAdjacentElement("beforebegin", button);
  });
}

function scheduleDisclosure() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applyDisclosure);
}

const observer = new MutationObserver(scheduleDisclosure);
observer.observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(scheduleDisclosure);

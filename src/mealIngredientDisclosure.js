let scheduled = false;

function buildButton(textarea) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mealIngredientsToggle = "true";
  button.setAttribute("aria-expanded", "false");
  button.textContent = "Ingrédients ▾";

  Object.assign(button.style, {
    width: "100%",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    padding: "7px 10px",
    background: "var(--card)",
    color: "var(--ink-soft)",
    fontSize: "13px",
    fontWeight: "600",
    textAlign: "left",
    cursor: "pointer",
  });

  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", open ? "false" : "true");
    button.textContent = open ? "Ingrédients ▾" : "Ingrédients ▴";
    textarea.style.display = open ? "none" : "block";
    if (!open) textarea.focus();
  });

  return button;
}

function applyDisclosure() {
  scheduled = false;

  document.querySelectorAll('textarea[placeholder^="Ingrédients"]').forEach((textarea) => {
    if (textarea.dataset.ingredientsDisclosureReady === "true") return;

    textarea.dataset.ingredientsDisclosureReady = "true";
    textarea.style.display = "none";

    const button = buildButton(textarea);
    textarea.insertAdjacentElement("beforebegin", button);
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

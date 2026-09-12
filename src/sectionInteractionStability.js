let releaseTimer = null;
let activeAnchor = null;
let activeTop = 0;

function isDisclosureControl(target) {
  const button = target?.closest?.("button");
  if (!button) return null;

  const text = (button.textContent || "").trim();
  const aria = button.getAttribute("aria-label") || "";
  const expanded = button.hasAttribute("aria-expanded");
  const known =
    text.includes("Bibliothèque") ||
    text.includes("épicerie") ||
    text.includes("Voir les éléments") ||
    text.includes("Masquer les éléments") ||
    text.includes("Ingrédients") ||
    aria.includes("Bibliothèque") ||
    aria.includes("épicerie");

  return expanded || known ? button : null;
}

function finish() {
  clearTimeout(releaseTimer);
  releaseTimer = null;
  document.documentElement.classList.remove("section-interacting");
  activeAnchor = null;
}

function keepAnchorStill(anchor, beforeTop) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!anchor?.isConnected) return finish();
      const afterTop = anchor.getBoundingClientRect().top;
      const delta = afterTop - beforeTop;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, left: 0, behavior: "auto" });
      releaseTimer = setTimeout(finish, 180);
    });
  });
}

document.addEventListener(
  "pointerdown",
  (event) => {
    const control = isDisclosureControl(event.target);
    if (!control) return;

    clearTimeout(releaseTimer);
    activeAnchor = control;
    activeTop = control.getBoundingClientRect().top;
    document.documentElement.classList.add("section-interacting");
  },
  true
);

document.addEventListener(
  "click",
  (event) => {
    const control = isDisclosureControl(event.target);
    if (!control) return;

    const anchor = activeAnchor?.isConnected ? activeAnchor : control;
    const beforeTop = activeAnchor?.isConnected ? activeTop : anchor.getBoundingClientRect().top;
    keepAnchorStill(anchor, beforeTop);
  },
  true
);

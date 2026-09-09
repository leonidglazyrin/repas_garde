const INVENTORY_PLACEHOLDERS = new Set([
  "Ajouter au frigo",
  "Ajouter aux placards",
  "Ajouter manuellement",
]);

let lockUntil = 0;
let lockedTop = 0;
let frame = null;

function startScrollLock() {
  lockedTop = window.scrollY;
  lockUntil = performance.now() + 900;
  if (frame !== null) return;

  const hold = () => {
    if (performance.now() >= lockUntil) {
      frame = null;
      return;
    }
    if (Math.abs(window.scrollY - lockedTop) > 1) {
      window.scrollTo({ top: lockedTop, left: window.scrollX, behavior: "auto" });
    }
    frame = requestAnimationFrame(hold);
  };

  frame = requestAnimationFrame(hold);
}

function inventoryInputFromButton(button) {
  return button?.parentElement?.querySelector?.("input") || null;
}

document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest?.("button");
  if (!button) return;
  const input = inventoryInputFromButton(button);
  if (input && INVENTORY_PLACEHOLDERS.has(input.placeholder)) startScrollLock();
}, true);

document.addEventListener("keydown", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (event.key === "Enter" && INVENTORY_PLACEHOLDERS.has(input.placeholder)) startScrollLock();
}, true);

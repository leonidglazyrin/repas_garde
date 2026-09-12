const isMobile = () => window.matchMedia?.("(max-width: 700px)")?.matches;

let activeField = null;
let lastViewportHeight = window.visualViewport?.height || window.innerHeight;
let raf = null;

function isEditable(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function rememberField(target) {
  if (!isMobile() || !isEditable(target)) return;
  activeField = target;
  lastViewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.classList.add("mobile-keyboard-active");
}

function keepFieldVisibleAfterKeyboardResize() {
  if (!isMobile() || !activeField || document.activeElement !== activeField) return;
  if (raf !== null) cancelAnimationFrame(raf);

  raf = requestAnimationFrame(() => {
    raf = null;
    if (!activeField || document.activeElement !== activeField) return;

    const viewport = window.visualViewport;
    const currentHeight = viewport?.height || window.innerHeight;
    const keyboardChanged = Math.abs(currentHeight - lastViewportHeight) > 40;
    lastViewportHeight = currentHeight;
    if (!keyboardChanged) return;

    const rect = activeField.getBoundingClientRect();
    const visibleTop = (viewport?.offsetTop || 0) + 8;
    const visibleBottom = (viewport?.offsetTop || 0) + currentHeight - 12;

    // Ne jamais compenser un déplacement normal de la page : on corrige seulement
    // si le clavier cache réellement le champ actif.
    if (rect.bottom > visibleBottom) {
      window.scrollBy({ top: rect.bottom - visibleBottom, left: 0, behavior: "auto" });
    } else if (rect.top < visibleTop) {
      window.scrollBy({ top: rect.top - visibleTop, left: 0, behavior: "auto" });
    }
  });
}

function clearField(target) {
  if (target !== activeField) return;
  setTimeout(() => {
    if (document.activeElement === activeField) return;
    activeField = null;
    document.documentElement.classList.remove("mobile-keyboard-active");
  }, 80);
}

document.addEventListener("focusin", (event) => rememberField(event.target));
document.addEventListener("focusout", (event) => clearField(event.target));

// Le scroll de visualViewport se déclenche pendant un défilement normal sur iOS.
// On n'écoute donc que le redimensionnement réel du clavier.
window.visualViewport?.addEventListener("resize", keepFieldVisibleAfterKeyboardResize);

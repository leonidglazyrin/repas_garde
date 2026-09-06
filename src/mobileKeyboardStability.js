const isMobile = () => window.matchMedia?.("(max-width: 700px)")?.matches;

let activeField = null;
let anchorTop = null;
let lastViewportHeight = window.visualViewport?.height || window.innerHeight;
let raf = null;

function isEditable(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function rememberAnchor(target) {
  if (!isMobile() || !isEditable(target)) return;
  activeField = target;
  anchorTop = target.getBoundingClientRect().top;
  lastViewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.classList.add("mobile-keyboard-active");
}

function keepFieldStable() {
  if (!isMobile() || !activeField || document.activeElement !== activeField || anchorTop == null) return;

  if (raf !== null) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = null;
    if (!activeField || document.activeElement !== activeField) return;

    const viewport = window.visualViewport;
    const currentHeight = viewport?.height || window.innerHeight;
    const keyboardChanged = Math.abs(currentHeight - lastViewportHeight) > 40;
    lastViewportHeight = currentHeight;

    if (!keyboardChanged) return;

    const currentTop = activeField.getBoundingClientRect().top;
    const delta = currentTop - anchorTop;

    // iOS peut faire remonter toute la page au moment où le clavier apparaît.
    // On compense ce déplacement pour garder le champ au même endroit visuel.
    if (Math.abs(delta) > 4) {
      window.scrollBy({ top: delta, left: 0, behavior: "auto" });
    }

    // Si le champ est malgré tout caché par le clavier, on le ramène juste assez
    // dans la zone visible, sans recentrer brutalement toute la page.
    requestAnimationFrame(() => {
      if (!activeField || document.activeElement !== activeField) return;
      const rect = activeField.getBoundingClientRect();
      const visibleTop = (viewport?.offsetTop || 0) + 8;
      const visibleBottom = (viewport?.offsetTop || 0) + currentHeight - 12;

      if (rect.bottom > visibleBottom) {
        window.scrollBy({ top: rect.bottom - visibleBottom, left: 0, behavior: "auto" });
      } else if (rect.top < visibleTop) {
        window.scrollBy({ top: rect.top - visibleTop, left: 0, behavior: "auto" });
      }
    });
  });
}

function clearAnchor(target) {
  if (target !== activeField) return;
  setTimeout(() => {
    if (document.activeElement === activeField) return;
    activeField = null;
    anchorTop = null;
    document.documentElement.classList.remove("mobile-keyboard-active");
  }, 80);
}

document.addEventListener("focusin", (event) => rememberAnchor(event.target));
document.addEventListener("focusout", (event) => clearAnchor(event.target));

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", keepFieldStable);
  window.visualViewport.addEventListener("scroll", keepFieldStable);
}

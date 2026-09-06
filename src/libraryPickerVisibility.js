function syncLibraryPicker(input) {
  if (!(input instanceof HTMLInputElement)) return;
  if (input.getAttribute("placeholder") !== "Nom du souper") return;

  const line = input.parentElement;
  if (!line) return;

  const picker = line.querySelector('select[aria-label="Piger dans la bibliothèque"]');
  if (!picker) return;

  const hasName = input.value.trim().length > 0;
  picker.hidden = hasName;
  picker.setAttribute("aria-hidden", String(hasName));
  picker.style.display = hasName ? "none" : "";
}

function syncAllLibraryPickers() {
  document.querySelectorAll('input[placeholder="Nom du souper"]').forEach(syncLibraryPicker);
}

document.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.getAttribute("placeholder") === "Nom du souper") {
    syncLibraryPicker(event.target);
  }
});

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.getAttribute("placeholder") === "Nom du souper") {
    syncLibraryPicker(event.target);
  }
});

const observer = new MutationObserver(() => {
  requestAnimationFrame(syncAllLibraryPickers);
});

setTimeout(() => {
  syncAllLibraryPickers();
  const root = document.getElementById("root") || document.body;
  observer.observe(root, { childList: true, subtree: true });
}, 0);

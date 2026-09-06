function findSectionByText(text) {
  return Array.from(document.querySelectorAll("main > section")).find((section) =>
    (section.textContent || "").includes(text)
  );
}

function placeLibraryAboveGrocery() {
  const library = findSectionByText("Bibliothèque de plats déjà utilisés");
  const grocery = findSectionByText("Liste d'épicerie");
  if (!library || !grocery || library.nextElementSibling === grocery) return false;

  grocery.parentElement?.insertBefore(library, grocery);
  return true;
}

let frame = null;
function schedulePlacement() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    placeLibraryAboveGrocery();
  });
}

queueMicrotask(schedulePlacement);

const observer = new MutationObserver(schedulePlacement);
observer.observe(document.documentElement, { childList: true, subtree: true });

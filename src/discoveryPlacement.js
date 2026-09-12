function findProfilesSection(main) {
  return Array.from(main.children).find((child) => {
    const text = child.textContent || "";
    return text.includes("Profils et restrictions") || text.includes("Ajouter un profil");
  }) || null;
}

function findLibrarySection(main) {
  return Array.from(main.children).find((child) =>
    (child.textContent || "").includes("Bibliothèque de plats déjà utilisés")
  ) || null;
}

function stabilizePageSections() {
  const main = document.querySelector("main");
  if (!main) return false;

  const profiles = findProfilesSection(main);
  if (profiles) {
    profiles.dataset.familyProfilesHidden = "true";
    profiles.setAttribute("aria-hidden", "true");
    profiles.style.setProperty("display", "none", "important");
  }

  const library = findLibrarySection(main);
  const slot = document.getElementById("discover-dishes-slot");
  if (library && slot && library.nextElementSibling !== slot) {
    library.insertAdjacentElement("afterend", slot);
  }
  return !!library;
}

let frame = null;
function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    stabilizePageSections();
  });
}

// Quelques passes seulement au démarrage : aucun observer permanent qui fait sauter la page.
queueMicrotask(schedule);
setTimeout(schedule, 120);
setTimeout(schedule, 450);
setTimeout(schedule, 1000);

document.addEventListener("click", (event) => {
  if (event.target?.closest?.('button[aria-label="Semaine précédente"], button[aria-label="Semaine suivante"], button')) {
    setTimeout(schedule, 80);
  }
}, true);

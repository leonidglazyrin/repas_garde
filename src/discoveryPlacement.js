function findProfilesSection(main) {
  return Array.from(main.children).find((child) => {
    const text = child.textContent || "";
    return text.includes("Profils et restrictions") || text.includes("Ajouter un profil");
  }) || null;
}

function placeProfilesThenDiscovery() {
  const main = document.querySelector("main");
  if (!main) return false;

  const profiles = findProfilesSection(main);
  if (!profiles) return false;

  if (main.firstElementChild !== profiles) {
    main.insertBefore(profiles, main.firstElementChild);
  }

  const slot = document.getElementById("discover-dishes-slot");
  if (slot && profiles.nextElementSibling !== slot) {
    main.insertBefore(slot, profiles.nextElementSibling);
  }

  return true;
}

let frame = null;
function scheduleMove() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    placeProfilesThenDiscovery();
  });
}

const observer = new MutationObserver(scheduleMove);
observer.observe(document.documentElement, { childList: true, subtree: true });

queueMicrotask(scheduleMove);
setTimeout(scheduleMove, 250);
setTimeout(scheduleMove, 1000);

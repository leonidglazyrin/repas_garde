function findProfilesSection(main) {
  return Array.from(main.querySelectorAll(":scope > section")).find((section) =>
    (section.textContent || "").includes("Profils et restrictions")
  ) || null;
}

function placeProfilesThenDiscovery() {
  const main = document.querySelector("main");
  const slot = document.getElementById("discover-dishes-slot");
  if (!main || !slot) return false;

  const profiles = findProfilesSection(main);
  if (!profiles) return false;

  if (main.firstElementChild !== profiles) {
    main.insertBefore(profiles, main.firstElementChild);
  }

  if (profiles.nextElementSibling !== slot) {
    profiles.insertAdjacentElement("afterend", slot);
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

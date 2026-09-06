function findProfilesBlock(main) {
  const marker = Array.from(main.querySelectorAll("*" )).find((node) =>
    (node.textContent || "").includes("Profils et restrictions") &&
    (node.textContent || "").includes("Ajouter un profil")
  );
  if (!marker) return null;

  let block = marker;
  while (block.parentElement && block.parentElement !== main) {
    block = block.parentElement;
  }
  return block.parentElement === main ? block : null;
}

function placeProfilesThenDiscovery() {
  const main = document.querySelector("main");
  if (!main) return false;

  const profiles = findProfilesBlock(main);
  if (!profiles) return false;

  if (main.firstElementChild !== profiles) {
    main.insertBefore(profiles, main.firstElementChild);
  }

  const slot = document.getElementById("discover-dishes-slot");
  if (slot && profiles.nextElementSibling !== slot) {
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

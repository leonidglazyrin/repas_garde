function moveDiscoveryToTop() {
  const main = document.querySelector("main");
  const slot = document.getElementById("discover-dishes-slot");
  if (!main || !slot) return false;

  if (main.firstElementChild !== slot) {
    main.insertBefore(slot, main.firstElementChild);
  }

  return true;
}

let frame = null;
function scheduleMove() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    moveDiscoveryToTop();
  });
}

const observer = new MutationObserver(scheduleMove);
observer.observe(document.documentElement, { childList: true, subtree: true });

queueMicrotask(scheduleMove);

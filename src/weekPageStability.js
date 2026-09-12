let releaseTimer = null;
let savedMinHeight = "";

function mainNode() {
  return document.querySelector("main");
}

function release(main) {
  clearTimeout(releaseTimer);
  releaseTimer = null;
  if (!main) return;
  main.style.minHeight = savedMinHeight;
  document.documentElement.classList.remove("week-page-switching");
}

function stabilizeDuringWeekChange() {
  const main = mainNode();
  if (!main) return;

  clearTimeout(releaseTimer);
  savedMinHeight = main.style.minHeight;
  const height = Math.ceil(main.getBoundingClientRect().height);
  if (height > 0) main.style.minHeight = `${height}px`;

  document.documentElement.classList.add("week-page-switching");
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  releaseTimer = setTimeout(() => release(main), 1200);
}

document.addEventListener("click", (event) => {
  const nav = event.target?.closest?.(
    'button[aria-label="Semaine précédente"], button[aria-label="Semaine suivante"]'
  );
  if (!nav) return;
  stabilizeDuringWeekChange();
}, true);

window.addEventListener("pageshow", () => {
  document.documentElement.classList.remove("week-page-switching");
  const main = mainNode();
  if (main && releaseTimer) release(main);
});

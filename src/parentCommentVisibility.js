let frame = null;
let startupPasses = 0;
let startupTimer = null;

function commentInputs() {
  return Array.from(document.querySelectorAll('input[placeholder^="Commentaire du parent"]'));
}

function syncOne(input) {
  const host = input.parentElement;
  if (!host) return;

  let preview = host.querySelector(':scope > [data-parent-comment-preview="true"]');
  const value = String(input.value || "").trim();

  if (!preview) {
    preview = document.createElement("div");
    preview.dataset.parentCommentPreview = "true";
    Object.assign(preview.style, {
      width: "100%",
      boxSizing: "border-box",
      marginTop: "6px",
      padding: "8px 10px",
      borderRadius: "8px",
      border: "1px solid var(--line)",
      background: "var(--paper)",
      color: "var(--ink)",
      fontSize: "13px",
      lineHeight: "1.4",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    });
    host.appendChild(preview);
  }

  preview.textContent = value;
  preview.style.display = value ? "block" : "none";
  input.title = value;
}

function sync() {
  frame = null;
  commentInputs().forEach(syncOne);
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(sync);
}

document.addEventListener("input", (event) => {
  if (event.target?.matches?.('input[placeholder^="Commentaire du parent"]')) schedule();
}, true);

document.addEventListener("change", (event) => {
  if (event.target?.matches?.('input[placeholder^="Commentaire du parent"]')) schedule();
}, true);

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("button");
  if (!button) return;
  if (button.matches?.('button[aria-label="Semaine précédente"], button[aria-label="Semaine suivante"]') || button.textContent?.trim() === "Aujourd'hui") {
    setTimeout(schedule, 160);
  }
}, true);

startupTimer = setInterval(() => {
  startupPasses += 1;
  schedule();
  if (startupPasses >= 8) {
    clearInterval(startupTimer);
    startupTimer = null;
  }
}, 350);

queueMicrotask(schedule);

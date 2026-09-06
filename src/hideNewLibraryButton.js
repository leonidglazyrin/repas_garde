function findLibrarySection() {
  return Array.from(document.querySelectorAll("main > section")).find((section) =>
    (section.textContent || "").includes("Bibliothèque de plats déjà utilisés")
  );
}

function hideNewButton() {
  const section = findLibrarySection();
  if (!section) return false;

  section.querySelectorAll("button").forEach((button) => {
    if ((button.textContent || "").trim().includes("Nouveau plat")) {
      button.style.setProperty("display", "none", "important");
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
    }
  });

  return true;
}

setTimeout(() => {
  hideNewButton();
  const root = document.getElementById("root") || document.body;
  const observer = new MutationObserver(() => hideNewButton());
  observer.observe(root, { childList: true, subtree: true });
}, 0);

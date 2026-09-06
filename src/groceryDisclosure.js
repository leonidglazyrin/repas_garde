function findGrocerySection() {
  return Array.from(document.querySelectorAll("main section")).find((section) =>
    (section.textContent || "").includes("Liste d'épicerie")
  );
}

function getHeader(section) {
  return Array.from(section.children).find((child) =>
    (child.textContent || "").includes("Liste d'épicerie")
  ) || null;
}

function getBody(section, header) {
  if (!section || !header) return null;
  return Array.from(section.children).find((child) => child !== header) || null;
}

function styleHeader(header, open) {
  Object.assign(header.style, {
    cursor: "pointer",
    userSelect: "none",
    width: "100%",
    minHeight: "52px",
    padding: "12px 16px",
    borderRadius: "10px",
    border: `2px solid ${open ? "var(--herb)" : "var(--honey)"}`,
    background: open ? "var(--herb-soft)" : "var(--honey-soft)",
    boxShadow: open ? "0 2px 8px rgba(76,107,78,0.16)" : "0 2px 8px rgba(201,138,59,0.18)",
    fontWeight: "700",
    fontSize: "15px",
    alignItems: "center",
    marginBottom: open ? "10px" : "0",
  });

  Array.from(header.querySelectorAll("span")).forEach((span) => {
    if (span.dataset.groceryDisclosureArrow === "true") return;
    span.style.fontWeight = "700";
    span.style.fontSize = "15px";
    span.style.color = open ? "var(--herb)" : "var(--ink)";
  });

  const icon = header.querySelector("svg");
  if (icon) {
    icon.style.width = "20px";
    icon.style.height = "20px";
    icon.style.color = open ? "var(--herb)" : "var(--honey)";
  }
}

function setOpen(section, header, body, open) {
  section.dataset.groceryOpen = String(open);
  header.setAttribute("aria-expanded", String(open));
  header.title = open ? "Masquer la liste de courses" : "Afficher la liste de courses";
  styleHeader(header, open);

  let arrow = header.querySelector("[data-grocery-disclosure-arrow]");
  if (!arrow) {
    arrow = document.createElement("span");
    arrow.dataset.groceryDisclosureArrow = "true";
    arrow.setAttribute("aria-hidden", "true");
    Object.assign(arrow.style, {
      marginLeft: "auto",
      fontSize: "18px",
      fontWeight: "800",
      color: "var(--ink)",
      flexShrink: "0",
    });
    header.appendChild(arrow);
  }
  arrow.textContent = open ? "▴" : "▾";
  arrow.style.color = open ? "var(--herb)" : "var(--honey)";

  body.hidden = !open;
  body.setAttribute("aria-hidden", String(!open));
  if (open) {
    body.style.removeProperty("display");
  } else {
    body.style.setProperty("display", "none", "important");
  }
}

function initGroceryDisclosure() {
  const section = findGrocerySection();
  if (!section || section.dataset.groceryDisclosureReady === "true") return false;

  const header = getHeader(section);
  const body = getBody(section, header);
  if (!header || !body) return false;

  section.dataset.groceryDisclosureReady = "true";
  section.dataset.groceryOpen = "false";

  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-controls", "grocery-list-content");
  body.id = "grocery-list-content";

  const toggle = () => {
    const open = section.dataset.groceryOpen === "true";
    setOpen(section, header, body, !open);
  };

  header.addEventListener("click", toggle);
  header.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });

  setOpen(section, header, body, false);

  const observer = new MutationObserver(() => {
    const open = section.dataset.groceryOpen === "true";
    setOpen(section, header, body, open);
  });
  observer.observe(body, { childList: true, subtree: true });

  return true;
}

setTimeout(() => {
  if (initGroceryDisclosure()) return;
  const retry = setInterval(() => {
    if (initGroceryDisclosure()) clearInterval(retry);
  }, 250);
  setTimeout(() => clearInterval(retry), 5000);
}, 0);

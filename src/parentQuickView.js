const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];

let frame = null;
let activeDay = null;

function findSection(text) {
  return Array.from(document.querySelectorAll("main > section")).find((section) =>
    (section.textContent || "").includes(text)
  ) || null;
}

function getMealRows() {
  const rows = [];
  document.querySelectorAll('input[placeholder="Nom du souper"]').forEach((input) => {
    let node = input.parentElement;
    while (node && node !== document.body) {
      const text = node.textContent || "";
      const day = DAYS.find(([label]) => text.includes(label));
      const hasIngredients = node.querySelector?.('textarea[placeholder^="Ingrédients"]');
      if (day && hasIngredients) {
        if (!rows.some((entry) => entry.row === node)) rows.push({ row: node, input, day });
        break;
      }
      node = node.parentElement;
    }
  });
  return rows;
}

function getStatus(row) {
  const buttons = Array.from(row.querySelectorAll("button"));
  for (const [label, status] of [["Approuvé", "approved"], ["Refusé", "refused"], ["En attente", "pending"]]) {
    const button = buttons.find((candidate) => (candidate.textContent || "").trim().includes(label));
    if (!button) continue;
    const bg = button.style.background || "";
    if (bg && !bg.includes("var(--card)")) return status;
  }
  return "pending";
}

function statusMeta(status) {
  if (status === "approved") return { label: "Approuvé", dot: "#4C6B4E", bg: "#E8F0E7" };
  if (status === "refused") return { label: "Refusé", dot: "#B24F35", bg: "#F7E8E3" };
  return { label: "En attente", dot: "#77736C", bg: "#EEECE8" };
}

function mealEmoji(name) {
  const text = String(name || "").toLocaleLowerCase("fr-CA");
  if (/saumon|poisson|thon|crevette|morue|truite/.test(text)) return "🐟";
  if (/poulet|dinde|volaille/.test(text)) return "🍗";
  if (/boeuf|bœuf|steak|burger/.test(text)) return "🥩";
  if (/porc|jambon|bacon/.test(text)) return "🥓";
  if (/pâte|pasta|spaghetti|lasagne|macaroni/.test(text)) return "🍝";
  if (/riz|bol/.test(text)) return "🍚";
  if (/soupe|chili|potage/.test(text)) return "🥣";
  if (/salade|courgette|légume|vege|végé|tofu/.test(text)) return "🥗";
  return "🍽️";
}

function styleStatusButtons(rows) {
  rows.forEach(({ row }) => {
    Array.from(row.querySelectorAll("button")).forEach((button) => {
      const text = (button.textContent || "").trim();
      let palette = null;
      if (text.includes("En attente")) palette = { active: "#77736C", soft: "#EEECE8" };
      if (text.includes("Approuvé")) palette = { active: "#4C6B4E", soft: "#E8F0E7" };
      if (text.includes("Refusé")) palette = { active: "#B24F35", soft: "#F7E8E3" };
      if (!palette) return;

      const active = (button.style.background || "") && !(button.style.background || "").includes("var(--card)");
      button.style.borderColor = active ? palette.active : "var(--line)";
      button.style.background = active ? palette.active : palette.soft;
      button.style.color = active ? "#fff" : palette.active;
      button.style.fontWeight = "700";
    });
  });
}

function ensureQuickNav(main, rows) {
  let nav = document.getElementById("parent-quick-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "parent-quick-nav";
    Object.assign(nav.style, {
      position: "sticky",
      top: "8px",
      zIndex: "9",
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "6px",
      padding: "6px",
      margin: "0 0 14px",
      border: "1px solid var(--line)",
      borderRadius: "12px",
      background: "rgba(250,247,240,.96)",
      boxShadow: "0 4px 14px rgba(42,36,30,.08)",
      backdropFilter: "blur(8px)",
    });

    [
      ["Semaine", "📅"],
      ["Épicerie", "🛒"],
      ["Bibliothèque", "📚"],
    ].forEach(([label, icon]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${icon} ${label}`;
      button.dataset.quickTarget = label;
      Object.assign(button.style, {
        minHeight: "40px",
        borderRadius: "9px",
        border: "1px solid var(--line)",
        background: "var(--card)",
        color: "var(--ink)",
        fontWeight: "700",
        cursor: "pointer",
      });
      button.addEventListener("click", () => {
        if (label === "Semaine") {
          document.getElementById("week-compact-overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        const section = findSection(label === "Épicerie" ? "Liste d'épicerie" : "Bibliothèque de plats déjà utilisés");
        if (!section) return;
        if (label === "Épicerie" && section.dataset.groceryOpen !== "true") {
          const header = Array.from(section.children).find((child) => (child.textContent || "").includes("Liste d'épicerie"));
          header?.click();
        }
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.appendChild(button);
    });
  }

  const firstRow = rows[0]?.row;
  if (firstRow && nav.parentElement !== main) main.insertBefore(nav, firstRow);
  else if (firstRow && nav.nextElementSibling !== firstRow) main.insertBefore(nav, firstRow);
  return nav;
}

function ensureOverview(main, rows) {
  if (!rows.length) return;
  let overview = document.getElementById("week-compact-overview");
  if (!overview) {
    overview = document.createElement("section");
    overview.id = "week-compact-overview";
    Object.assign(overview.style, {
      marginBottom: "16px",
      padding: "14px",
      border: "1px solid var(--line)",
      borderRadius: "12px",
      background: "var(--card)",
      scrollMarginTop: "72px",
    });
  }

  if (!activeDay || !rows.some(({ day }) => day[1] === activeDay)) {
    const today = new Date().toLocaleDateString("fr-CA", { weekday: "long" });
    const todayMatch = rows.find(({ day }) => day[0].toLocaleLowerCase("fr-CA") === today.toLocaleLowerCase("fr-CA"));
    activeDay = todayMatch?.day[1] || rows[0].day[1];
  }

  const approved = rows.filter(({ row }) => getStatus(row) === "approved").length;
  const pending = rows.filter(({ row }) => getStatus(row) === "pending").length;
  overview.replaceChildren();

  const top = document.createElement("div");
  Object.assign(top.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "10px" });
  const title = document.createElement("strong");
  title.textContent = `Semaine en un coup d'œil · ${approved}/${rows.length} repas confirmés`;
  top.appendChild(title);
  const badge = document.createElement("span");
  badge.textContent = pending ? `${pending} en attente` : "Tout est décidé ✓";
  Object.assign(badge.style, { padding: "5px 9px", borderRadius: "999px", fontSize: "12px", fontWeight: "800", background: pending ? "#EEECE8" : "#E8F0E7", color: pending ? "#5F5A54" : "#4C6B4E" });
  top.appendChild(badge);
  overview.appendChild(top);

  const bar = document.createElement("div");
  Object.assign(bar.style, { height: "7px", borderRadius: "999px", background: "#E7E2D9", overflow: "hidden", marginBottom: "12px" });
  const fill = document.createElement("div");
  Object.assign(fill.style, { height: "100%", width: `${rows.length ? (approved / rows.length) * 100 : 0}%`, background: "#4C6B4E", borderRadius: "inherit", transition: "width .2s ease" });
  bar.appendChild(fill);
  overview.appendChild(bar);

  const grid = document.createElement("div");
  Object.assign(grid.style, { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px" });
  rows.forEach(({ row, input, day }) => {
    const [label, key] = day;
    const status = getStatus(row);
    const meta = statusMeta(status);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.compactDay = key;
    const name = input.value.trim() || "À choisir";
    button.innerHTML = `<span style="font-size:20px">${mealEmoji(name)}</span><strong>${label.slice(0, 3)}</strong><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">${name}</span><span style="font-size:11px;font-weight:800;color:${meta.dot}">● ${meta.label}</span>`;
    Object.assign(button.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "3px",
      minWidth: "0",
      minHeight: "88px",
      padding: "9px",
      borderRadius: "10px",
      border: key === activeDay ? `2px solid ${meta.dot}` : "1px solid var(--line)",
      background: key === activeDay ? meta.bg : "var(--paper)",
      color: "var(--ink)",
      cursor: "pointer",
      textAlign: "left",
    });
    button.addEventListener("click", () => {
      activeDay = key;
      schedule();
      requestAnimationFrame(() => row.scrollIntoView({ behavior: "smooth", block: "center" }));
    });
    grid.appendChild(button);
  });
  overview.appendChild(grid);

  const nav = document.getElementById("parent-quick-nav");
  if (nav && overview.previousElementSibling !== nav) nav.insertAdjacentElement("afterend", overview);
  else if (!overview.parentElement) main.insertBefore(overview, rows[0].row);
}

function applyCompactRows(rows) {
  rows.forEach(({ row, day }) => {
    row.dataset.quickDay = day[1];
    row.style.display = day[1] === activeDay ? "" : "none";
    if (day[1] === activeDay) {
      row.style.scrollMarginTop = "78px";
      row.style.borderRadius = "12px";
    }
  });
}

function dedupeDiscoveryMessages() {
  const slot = document.getElementById("discover-dishes-slot");
  if (!slot) return;
  const messages = Array.from(slot.querySelectorAll("div,p")).filter((node) =>
    (node.textContent || "").trim() === "Ajoute d'abord un profil pour pouvoir voter."
  );
  messages.forEach((node, index) => {
    node.style.display = index === 0 ? "" : "none";
    if (index === 0) {
      node.textContent = "Ajoute un profil pour activer les votes sur tous les plats à découvrir.";
      Object.assign(node.style, { padding: "8px 10px", borderRadius: "8px", background: "#EEECE8", marginBottom: "8px" });
    }
  });
}

function labelExtras() {
  document.querySelectorAll("[data-accompaniment-icon]").forEach((icon) => {
    icon.title = "Accompagnement";
    icon.setAttribute("aria-label", "Accompagnement");
    icon.removeAttribute("aria-hidden");
  });
  document.querySelectorAll("[data-dessert-icon]").forEach((icon) => {
    icon.title = "Dessert";
    icon.setAttribute("aria-label", "Dessert");
    icon.removeAttribute("aria-hidden");
  });
}

function improveFields() {
  document.querySelectorAll('select[data-accompaniment-day], select[data-dessert-day]').forEach((select) => {
    select.style.backgroundColor = "#FFFDF8";
    select.style.borderStyle = "solid";
    select.style.borderWidth = "1px";
    select.style.boxShadow = "inset 0 0 0 1px rgba(42,36,30,.02)";
    select.style.fontWeight = "600";
  });
  document.querySelectorAll('input[placeholder^="Commentaire du parent"]').forEach((input) => {
    input.style.background = "#FAFAF8";
    input.style.borderStyle = "dashed";
  });
}

function sync() {
  const main = document.querySelector("main");
  if (!main) return;
  const rows = getMealRows();
  if (!rows.length) return;
  ensureQuickNav(main, rows);
  ensureOverview(main, rows);
  applyCompactRows(rows);
  styleStatusButtons(rows);
  dedupeDiscoveryMessages();
  labelExtras();
  improveFields();
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    sync();
  });
}

document.addEventListener("click", schedule, true);
document.addEventListener("input", schedule, true);
document.addEventListener("change", schedule, true);
const observer = new MutationObserver(schedule);
observer.observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(schedule);

const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];

let frame = null;
let activeDay = null;
let lastOverviewSignature = "";

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
  const active = Array.from(row.querySelectorAll('button[aria-pressed="true"]'))[0];
  const text = active?.textContent || "";
  if (text.includes("Approuvé")) return "approved";
  if (text.includes("Refusé")) return "refused";
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

function ensureQuickNav(main, rows) {
  let nav = document.getElementById("parent-quick-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "parent-quick-nav";
    Object.assign(nav.style, {
      position: "static",
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "5px",
      padding: "5px",
      border: "1px solid var(--line)",
      borderRadius: "10px",
      background: "var(--paper)",
    });

    [["Semaine", "📅"], ["Épicerie", "🛒"], ["Bibliothèque", "📚"]].forEach(([label, icon]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${icon} ${label}`;
      button.dataset.quickTarget = label;
      Object.assign(button.style, {
        minHeight: "36px",
        borderRadius: "8px",
        border: "1px solid var(--line)",
        background: "var(--card)",
        color: "var(--ink)",
        fontWeight: "700",
        cursor: "pointer",
      });
      button.addEventListener("click", () => {
        if (label === "Semaine") {
          document.getElementById("week-compact-overview")?.scrollIntoView({ block: "start" });
          return;
        }
        const section = findSection(label === "Épicerie" ? "Liste d'épicerie" : "Bibliothèque de plats déjà utilisés");
        if (!section) return;
        if (label === "Épicerie" && section.dataset.groceryOpen !== "true") {
          const header = Array.from(section.children).find((child) => (child.textContent || "").includes("Liste d'épicerie"));
          header?.click();
        }
        section.scrollIntoView({ block: "start" });
      });
      nav.appendChild(button);
    });
  }

  const firstRow = rows[0]?.row;
  if (firstRow && nav.parentElement !== main) main.insertBefore(nav, firstRow);
  return nav;
}

function overviewSignature(rows) {
  return `${activeDay}|${rows.map(({ row, input, day }) => `${day[1]}:${input.value}:${getStatus(row)}:${row.dataset.mealExpired || "false"}`).join("|")}`;
}

function ensureOverview(main, rows) {
  if (!rows.length) return;
  let overview = document.getElementById("week-compact-overview");
  if (!overview) {
    overview = document.createElement("section");
    overview.id = "week-compact-overview";
    Object.assign(overview.style, {
      padding: "10px",
      border: "1px solid var(--line)",
      borderRadius: "10px",
      background: "var(--card)",
    });
  }

  const visibleRows = rows.filter(({ row }) => row.dataset.mealExpired !== "true");
  const usableRows = visibleRows.length ? visibleRows : rows;
  if (!activeDay || !usableRows.some(({ day }) => day[1] === activeDay)) {
    const today = new Date().toLocaleDateString("fr-CA", { weekday: "long" });
    const todayMatch = usableRows.find(({ day }) => day[0].toLocaleLowerCase("fr-CA") === today.toLocaleLowerCase("fr-CA"));
    activeDay = todayMatch?.day[1] || usableRows[0].day[1];
  }

  const nav = document.getElementById("parent-quick-nav");
  if (nav && overview.previousElementSibling !== nav) nav.insertAdjacentElement("afterend", overview);
  else if (!overview.parentElement) main.insertBefore(overview, rows[0].row);

  const signature = overviewSignature(rows);
  if (signature === lastOverviewSignature && overview.childElementCount) return;
  lastOverviewSignature = signature;

  const approved = visibleRows.filter(({ row }) => getStatus(row) === "approved").length;
  const pending = visibleRows.filter(({ row }) => getStatus(row) === "pending").length;
  overview.replaceChildren();

  const top = document.createElement("div");
  Object.assign(top.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "7px" });
  const title = document.createElement("strong");
  title.textContent = `${approved}/${visibleRows.length} repas confirmés`;
  const badge = document.createElement("span");
  badge.textContent = pending ? `${pending} en attente` : "Tout est décidé ✓";
  Object.assign(badge.style, { padding: "4px 7px", borderRadius: "999px", fontSize: "11px", fontWeight: "800", background: pending ? "#EEECE8" : "#E8F0E7", color: pending ? "#5F5A54" : "#4C6B4E" });
  top.append(title, badge);
  overview.appendChild(top);

  const grid = document.createElement("div");
  Object.assign(grid.style, { display: "grid", gridTemplateColumns: `repeat(${Math.max(1, visibleRows.length)}, minmax(0, 1fr))`, gap: "6px" });
  visibleRows.forEach(({ row, input, day }) => {
    const [label, key] = day;
    const status = getStatus(row);
    const meta = statusMeta(status);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.compactDay = key;
    const name = input.value.trim() || "À choisir";
    button.innerHTML = `<span style="font-size:16px">${mealEmoji(name)}</span><strong>${label.slice(0, 3)}</strong><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;font-size:12px">${name}</span><span style="font-size:10px;font-weight:800;color:${meta.dot}">● ${meta.label}</span>`;
    Object.assign(button.style, {
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", minWidth: "0", minHeight: "62px",
      padding: "6px", borderRadius: "8px", border: key === activeDay ? `2px solid ${meta.dot}` : "1px solid var(--line)",
      background: key === activeDay ? meta.bg : "var(--paper)", color: "var(--ink)", cursor: "pointer", textAlign: "left",
    });
    button.addEventListener("click", () => {
      activeDay = key;
      lastOverviewSignature = "";
      sync();
      row.scrollIntoView({ block: "center" });
    });
    grid.appendChild(button);
  });
  overview.appendChild(grid);
}

function applyCompactRows(rows) {
  rows.forEach(({ row, day }) => {
    row.dataset.quickDay = day[1];
    if (row.dataset.mealExpired === "true") return;
    const shouldShow = day[1] === activeDay;
    if ((row.style.display !== "none") !== shouldShow) row.style.display = shouldShow ? "" : "none";
  });
}

function styleStatusButtons(rows) {
  rows.forEach(({ row }) => {
    row.querySelectorAll('button[aria-pressed]').forEach((button) => {
      const text = button.textContent || "";
      const active = button.getAttribute("aria-pressed") === "true";
      const palette = text.includes("Approuvé") ? ["#4C6B4E", "#E8F0E7"] : text.includes("Refusé") ? ["#B24F35", "#F7E8E3"] : ["#77736C", "#EEECE8"];
      button.style.borderColor = active ? palette[0] : "var(--line)";
      button.style.background = active ? palette[0] : palette[1];
      button.style.color = active ? "#fff" : palette[0];
    });
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
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    sync();
  });
}

document.addEventListener("click", schedule, true);
document.addEventListener("input", () => { lastOverviewSignature = ""; schedule(); }, true);
document.addEventListener("change", () => { lastOverviewSignature = ""; schedule(); }, true);
window.addEventListener("resize", () => { lastOverviewSignature = ""; schedule(); });

setInterval(() => {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
  schedule();
}, 2000);

queueMicrotask(schedule);
setTimeout(schedule, 250);

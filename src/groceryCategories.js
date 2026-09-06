const CATEGORIES = [
  {
    name: "Viandes et protéines",
    keywords: [
      "boeuf", "bœuf", "poulet", "dinde", "porc", "jambon", "bacon", "veau", "agneau",
      "saumon", "thon", "poisson", "crevette", "crevettes", "tofu", "tempeh", "oeuf", "œuf", "oeufs", "œufs",
      "haricot", "haricots", "lentille", "lentilles", "pois chiche", "pois chiches"
    ],
  },
  {
    name: "Légumes et fruits",
    keywords: [
      "tomate", "tomates", "carotte", "carottes", "courgette", "courgettes", "poivron", "poivrons",
      "oignon", "oignons", "ail", "brocoli", "brocolis", "chou", "choux", "salade", "laitue", "épinard", "epinard",
      "épinards", "epinards", "champignon", "champignons", "concombre", "concombres", "aubergine", "aubergines",
      "céleri", "celeri", "poireau", "poireaux", "patate", "patates", "pomme de terre", "pommes de terre",
      "avocat", "avocats", "citron", "citrons", "lime", "limes", "pomme", "pommes", "banane", "bananes",
      "orange", "oranges", "fraise", "fraises", "framboise", "framboises"
    ],
  },
  {
    name: "Produits laitiers",
    keywords: [
      "lait", "crème", "creme", "beurre", "fromage", "mozzarella", "cheddar", "parmesan", "yogourt", "yaourt"
    ],
  },
  {
    name: "Épicerie",
    keywords: [
      "riz", "pâte", "pates", "pâtes", "semoule", "couscous", "quinoa", "farine", "sucre", "huile", "vinaigre",
      "sauce", "bouillon", "conserve", "tomates en boite", "tomates en boîte", "haricots en boite", "haricots en boîte",
      "épice", "epice", "épices", "epices", "sel", "poivre", "paprika", "cumin", "curry", "moutarde", "mayonnaise",
      "ketchup", "pesto", "tortilla", "nouille", "nouilles"
    ],
  },
  {
    name: "Boulangerie",
    keywords: ["pain", "pains", "naan", "naans", "pita", "baguette", "baguettes", "brioche", "wrap", "wraps"],
  },
  {
    name: "Autres",
    keywords: [],
  },
];

let scheduled = false;
let lastSignature = "";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-CA")
    .replace(/\s+/g, " ")
    .trim();
}

function findGrocerySection() {
  return Array.from(document.querySelectorAll("main section")).find((section) =>
    (section.textContent || "").includes("Liste d'épicerie")
  );
}

function findGroceryGrid(section) {
  const checkbox = section?.querySelector('input[type="checkbox"]');
  if (!checkbox) return null;
  return checkbox.closest("label")?.parentElement?.parentElement || null;
}

function ingredientText(row) {
  const label = row?.querySelector("label");
  return (label?.textContent || "").trim();
}

function categoryFor(text) {
  const normalized = normalize(text);
  for (const category of CATEGORIES.slice(0, -1)) {
    if (category.keywords.some((keyword) => normalized.includes(normalize(keyword)))) return category.name;
  }
  return "Autres";
}

function organize() {
  scheduled = false;
  const section = findGrocerySection();
  const grid = findGroceryGrid(section);
  if (!grid) return;

  const rows = Array.from(grid.children).filter((child) => child.querySelector?.('input[type="checkbox"]'));
  if (!rows.length) return;

  const signature = rows.map((row) => `${ingredientText(row)}:${row.style.display}`).join("|");
  if (signature === lastSignature && grid.querySelector("[data-grocery-category-header]")) return;
  lastSignature = signature;

  grid.querySelectorAll("[data-grocery-category-header]").forEach((header) => header.remove());

  const used = new Set();
  rows.forEach((row) => {
    const category = categoryFor(ingredientText(row));
    row.dataset.groceryCategory = category;
    const index = CATEGORIES.findIndex((entry) => entry.name === category);
    row.style.order = String(index * 100 + 10);
    if (row.style.display !== "none") used.add(category);
  });

  CATEGORIES.forEach((category, index) => {
    if (!used.has(category.name)) return;
    const header = document.createElement("div");
    header.dataset.groceryCategoryHeader = category.name;
    header.textContent = category.name;
    Object.assign(header.style, {
      gridColumn: "1 / -1",
      order: String(index * 100),
      fontSize: "12px",
      fontWeight: "700",
      color: "var(--ink-soft)",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      marginTop: index === 0 ? "2px" : "10px",
      paddingBottom: "4px",
      borderBottom: "1px solid var(--line)",
    });
    grid.appendChild(header);
  });
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(organize);
}

const observer = new MutationObserver(schedule);
observer.observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(schedule);

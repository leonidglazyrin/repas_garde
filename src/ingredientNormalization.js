const INVARIANT_WORDS = new Set([
  "riz",
  "maïs",
  "mais",
  "couscous",
  "jus",
  "pois",
  "ananas",
  "noix",
  "houmous",
  "hummus",
  "thym",
]);

const IRREGULAR = new Map([
  ["oeufs", "oeuf"],
  ["œufs", "œuf"],
  ["ail", "ail"],
  ["aulx", "ail"],
]);

const UNIT_WORDS = new Set([
  "g",
  "kg",
  "mg",
  "ml",
  "cl",
  "dl",
  "l",
  "litre",
  "litres",
  "tasse",
  "tasses",
  "c",
  "cuillère",
  "cuillères",
  "cuillere",
  "cuilleres",
  "tranche",
  "tranches",
]);

const LEADING_WORDS = new Set(["de", "des", "du", "le", "la", "les", "un", "une"]);

function singularizeWord(word) {
  if (!word || INVARIANT_WORDS.has(word)) return word;
  if (IRREGULAR.has(word)) return IRREGULAR.get(word);

  // poireaux -> poireau, gâteaux -> gâteau
  if (word.length > 4 && word.endsWith("eaux")) {
    return word.slice(0, -1);
  }
  // chevaux -> cheval
  if (word.length > 4 && word.endsWith("aux")) {
    return `${word.slice(0, -3)}al`;
  }
  if (word.length > 3 && word.endsWith("s")) {
    return word.slice(0, -1);
  }
  if (word.length > 3 && word.endsWith("x")) {
    return word.slice(0, -1);
  }
  return word;
}

function stripLeadingQuantity(words) {
  const copy = [...words];
  while (copy.length) {
    const first = copy[0].replace(",", ".");
    if (/^\d+(?:[./]\d+)?$/.test(first) || /^\d+[½¼¾⅓⅔]$/.test(first)) {
      copy.shift();
      continue;
    }
    if (UNIT_WORDS.has(first) || LEADING_WORDS.has(first)) {
      copy.shift();
      continue;
    }
    break;
  }
  return copy;
}

export function canonicalIngredientKey(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("fr-CA")
    .replace(/[’']/g, "'")
    .replace(/^(\d+(?:[.,]\d+)?)(kg|mg|g|ml|cl|dl|l)\b/u, "$1 $2 ")
    .replace(/[()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  const words = stripLeadingQuantity(normalized.split(" "));
  return words
    .map((word) => {
      const match = word.match(/^([^\p{L}]*)([\p{L}œŒ-]+)([^\p{L}]*)$/u);
      if (!match) return word;
      return `${match[1]}${singularizeWord(match[2])}${match[3]}`;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayIngredientLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toLocaleUpperCase("fr-CA") + text.slice(1);
}

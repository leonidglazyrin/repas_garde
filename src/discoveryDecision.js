import { supabase } from "./supabaseClient.js";

let frame = null;
let observer = null;
let observedSlot = null;

function dishNameFromCard(card) {
  const deleteButton = card?.querySelector('button[aria-label^="Supprimer "]');
  return String(deleteButton?.getAttribute("aria-label") || "").replace(/^Supprimer\s+/u, "").trim();
}

async function findDishId(name) {
  const { data, error } = await supabase
    .from("discovery_dishes")
    .select("id")
    .ilike("name", name)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("find discovery dish", error);
    return null;
  }
  return data?.[0]?.id ?? null;
}

async function removeDiscoveryDish(name) {
  const id = await findDishId(name);
  if (id == null) return false;
  const { error } = await supabase.from("discovery_dishes").delete().eq("id", id);
  if (error) {
    console.error("remove discovery dish", error);
    return false;
  }
  return true;
}

async function acceptDish(name) {
  const { data, error } = await supabase
    .from("meal_library")
    .select("id")
    .ilike("name", name)
    .limit(1);
  if (error) {
    console.error("check discovery library", error);
    return false;
  }

  if (!data?.length) {
    const { error: insertError } = await supabase
      .from("meal_library")
      .insert({ name, ingredients: "" });
    if (insertError) {
      console.error("add discovery dish to library", insertError);
      return false;
    }
  }

  return removeDiscoveryDish(name);
}

function decisionButton(label, symbol, tone, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${symbol} ${label}`;
  button.setAttribute("aria-label", label);
  Object.assign(button.style, {
    minHeight: "36px",
    padding: "7px 12px",
    borderRadius: "18px",
    border: `1px solid ${tone}`,
    background: "var(--card)",
    color: tone,
    fontSize: "12px",
    fontWeight: "900",
    cursor: "pointer",
  });
  button.addEventListener("click", onClick);
  return button;
}

function hideOldProfileVotes(card) {
  const voteButtons = Array.from(card.querySelectorAll('button[aria-pressed]'));
  voteButtons.forEach((button) => {
    let row = button.parentElement;
    while (row && row !== card) {
      if (row.parentElement === card || row.querySelectorAll?.('button[aria-pressed]').length >= 2) break;
      row = row.parentElement;
    }
    if (row && row !== card) row.style.setProperty("display", "none", "important");
  });

  Array.from(card.children).forEach((child, index) => {
    if (index === 0) return;
    if (child.querySelector?.('button[aria-pressed]')) child.style.setProperty("display", "none", "important");
  });
}

function decorateCard(card) {
  if (!card || card.dataset.discoveryDecisionReady === "true") {
    if (card) hideOldProfileVotes(card);
    return;
  }

  const name = dishNameFromCard(card);
  if (!name) return;
  card.dataset.discoveryDecisionReady = "true";
  hideOldProfileVotes(card);

  const actions = document.createElement("div");
  actions.dataset.discoveryDecisionActions = "true";
  Object.assign(actions.style, {
    display: "flex",
    gap: "7px",
    flexWrap: "wrap",
    marginTop: "9px",
    paddingTop: "9px",
    borderTop: "1px solid var(--line)",
  });

  const setBusy = (busy) => {
    actions.querySelectorAll("button").forEach((button) => {
      button.disabled = busy;
      button.style.opacity = busy ? ".5" : "1";
      button.style.cursor = busy ? "wait" : "pointer";
    });
  };

  const yes = decisionButton("Oui, garder ce plat", "✓", "var(--herb)", async () => {
    setBusy(true);
    const ok = await acceptDish(name);
    if (!ok) setBusy(false);
  });

  const no = decisionButton("Non, oublier", "✕", "var(--paprika)", async () => {
    setBusy(true);
    const ok = await removeDiscoveryDish(name);
    if (!ok) setBusy(false);
  });

  actions.append(yes, no);
  card.appendChild(actions);
}

function decorate() {
  frame = null;
  const slot = document.getElementById("discover-dishes-slot");
  if (!slot) return;

  if (observedSlot !== slot) {
    observer?.disconnect();
    observedSlot = slot;
    observer = new MutationObserver(schedule);
    observer.observe(slot, { childList: true, subtree: true });
  }

  slot.querySelectorAll('button[aria-label^="Supprimer "]').forEach((deleteButton) => {
    const card = deleteButton.parentElement?.parentElement?.parentElement;
    decorateCard(card);
  });
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(decorate);
}

setTimeout(schedule, 200);
setTimeout(schedule, 800);
document.addEventListener("click", (event) => {
  if (event.target?.closest?.("#discover-dishes-slot")) setTimeout(schedule, 0);
}, true);

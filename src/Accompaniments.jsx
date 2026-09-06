import { useEffect } from "react";
import { supabase } from "./supabaseClient";

const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];

const OPTIONS = [
  "Salade",
  "Légumes",
  "Riz",
  "Pâtes",
  "Pommes de terre",
  "Frites",
  "Couscous",
  "Quinoa",
  "Pain",
  "Soupe",
  "Aucun",
  "À décider",
];

function getWeekId() {
  const match = document.body?.innerText?.match(/Semaine\s+(\d{4}-S\d{2})/);
  return match?.[1] || null;
}

function getMealRow(input) {
  let node = input?.parentElement;
  while (node && node !== document.body) {
    if (
      node.querySelector?.('input[placeholder="Nom du souper"]') &&
      node.querySelector?.('textarea[placeholder^="Ingrédients"]')
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function getDay(row) {
  const text = row?.innerText || "";
  return DAYS.find(([label]) => text.includes(label)) || null;
}

function buildSelect(label, dayKey, onChange) {
  const select = document.createElement("select");
  select.dataset.accompanimentDay = dayKey;
  select.setAttribute("aria-label", `Accompagnement pour ${label}`);
  select.title = `Accompagnement pour ${label}`;

  Object.assign(select.style, {
    border: "1px solid var(--line)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "13px",
    background: "var(--card)",
    color: "var(--ink)",
    maxWidth: "190px",
    minWidth: "155px",
    cursor: "pointer",
  });

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Accompagnement…";
  select.appendChild(placeholder);

  OPTIONS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  select.addEventListener("change", () => onChange(dayKey, select.value));
  return select;
}

export default function Accompaniments() {
  useEffect(() => {
    let disposed = false;
    let activeWeek = null;
    let channel = null;
    let frame = null;

    const setValues = (rows = []) => {
      const values = Object.fromEntries(rows.map((row) => [row.day_key, row.accompaniment || ""]));
      document.querySelectorAll("select[data-accompaniment-day]").forEach((select) => {
        const value = values[select.dataset.accompanimentDay] || "";
        if (document.activeElement !== select) select.value = value;
      });
    };

    const loadWeek = async (weekId) => {
      if (!weekId || disposed) return;
      const { data, error } = await supabase
        .from("week_accompaniments")
        .select("day_key, accompaniment")
        .eq("week_id", weekId);
      if (disposed) return;
      if (error) {
        console.error("fetch week_accompaniments", error);
        return;
      }
      setValues(data || []);
    };

    const save = async (dayKey, accompaniment) => {
      const weekId = getWeekId();
      if (!weekId) return;
      const { error } = await supabase.from("week_accompaniments").upsert({
        week_id: weekId,
        day_key: dayKey,
        accompaniment,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("save week_accompaniments", error);
    };

    const mountMenus = () => {
      document.querySelectorAll('input[placeholder="Nom du souper"]').forEach((input) => {
        const row = getMealRow(input);
        const day = getDay(row);
        if (!row || !day) return;
        const [label, dayKey] = day;
        if (row.querySelector(`select[data-accompaniment-day="${dayKey}"]`)) return;

        const line = input.parentElement;
        if (!line) return;
        line.appendChild(buildSelect(label, dayKey, save));
      });
    };

    const subscribe = (weekId) => {
      if (channel) supabase.removeChannel(channel);
      if (!weekId) return;
      channel = supabase
        .channel(`accompaniments-${weekId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "week_accompaniments", filter: `week_id=eq.${weekId}` },
          () => loadWeek(weekId)
        )
        .subscribe();
    };

    const sync = () => {
      if (disposed) return;
      mountMenus();
      const weekId = getWeekId();
      if (weekId && weekId !== activeWeek) {
        activeWeek = weekId;
        subscribe(weekId);
        loadWeek(weekId);
      }
    };

    const scheduleSync = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        sync();
      });
    };

    sync();
    const root = document.getElementById("root") || document.body;
    const observer = new MutationObserver(scheduleSync);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      if (channel) supabase.removeChannel(channel);
      document.querySelectorAll("select[data-accompaniment-day]").forEach((select) => select.remove());
    };
  }, []);

  return null;
}

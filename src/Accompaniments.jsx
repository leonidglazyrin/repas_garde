import { useEffect } from "react";
import { supabase } from "./supabaseClient";

const DAYS = [
  ["Lundi", "mon"],
  ["Mardi", "tue"],
  ["Mercredi", "wed"],
  ["Jeudi", "thu"],
  ["Vendredi", "fri"],
];

const DEFAULT_OPTIONS = [
  "Salade composée",
  "Riz basmati",
  "Riz collant",
  "Assortiments de légumes chauds",
  "Semoules",
  "Purées de pommes de terres",
  "Pommes de terres sautées",
  "Pains naans",
  "Pains pita",
];

function getWeekId() {
  const match = document.body?.innerText?.match(/Semaine\s+(\d{4}-S\d{2})/);
  return match?.[1] || null;
}

function getMealRow(input) {
  let node = input?.parentElement;
  while (node && node !== document.body) {
    const hasMealFields =
      node.querySelector?.('input[placeholder="Nom du souper"]') &&
      node.querySelector?.('textarea[placeholder^="Ingrédients"]');
    const text = node.innerText || "";
    const hasDay = DAYS.some(([label]) => text.includes(label));

    if (hasMealFields && hasDay) return node;
    node = node.parentElement;
  }
  return null;
}

function getDay(row) {
  const text = row?.innerText || "";
  return DAYS.find(([label]) => text.includes(label)) || null;
}

function getMealControls(row) {
  const input = row?.querySelector?.('input[placeholder="Nom du souper"]');
  if (!input) return null;

  let line = input.parentElement;
  while (line && line !== row) {
    const librarySelect = line.querySelector?.('select[aria-label="Piger dans la bibliothèque"]');
    if (librarySelect) return { input, line, librarySelect };
    line = line.parentElement;
  }

  const librarySelect = row.querySelector?.('select[aria-label="Piger dans la bibliothèque"]');
  return librarySelect ? { input, line: librarySelect.parentElement, librarySelect } : null;
}

function allOptions(customOptions) {
  const seen = new Set();
  return [...DEFAULT_OPTIONS, ...customOptions]
    .map((value) => String(value || "").trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase("fr-CA");
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function refillSelect(select, customOptions, selectedValue = "") {
  const current = selectedValue || select.value || "";
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Accompagnement";
  select.appendChild(placeholder);

  const options = allOptions(customOptions);
  if (current && !options.some((value) => value === current)) options.push(current);

  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  select.value = current;
}

function buildSelect(label, dayKey, customOptions, onChange) {
  const select = document.createElement("select");
  select.dataset.accompanimentDay = dayKey;
  select.setAttribute("aria-label", `Accompagnement pour ${label}`);
  select.title = `Accompagnement pour ${label}`;

  Object.assign(select.style, {
    border: "1px solid var(--line)",
    borderRadius: "6px",
    padding: "8px 10px",
    fontSize: "16px",
    background: "var(--card)",
    color: "var(--ink)",
    width: "100%",
    minWidth: "0",
    minHeight: "40px",
    cursor: "pointer",
  });

  refillSelect(select, customOptions);
  select.addEventListener("change", () => onChange(dayKey, select.value));
  return select;
}

function buildEditButton(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.accompanimentEdit = "true";
  button.textContent = "✎";
  button.setAttribute("aria-label", "Ajouter une idée d’accompagnement");
  button.title = "Ajouter une idée d’accompagnement";
  Object.assign(button.style, {
    width: "40px",
    height: "40px",
    borderRadius: "7px",
    border: "1px solid var(--line)",
    background: "var(--card)",
    color: "var(--ink-soft)",
    cursor: "pointer",
    fontSize: "18px",
    lineHeight: "1",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  });
  button.addEventListener("click", onClick);
  return button;
}

export default function Accompaniments() {
  useEffect(() => {
    let disposed = false;
    let activeWeek = null;
    let channel = null;
    let optionChannel = null;
    let frame = null;
    let customOptions = [];

    const updateAllMenus = () => {
      document.querySelectorAll("select[data-accompaniment-day]").forEach((select) => {
        refillSelect(select, customOptions, select.value);
      });
    };

    const setValues = (rows = []) => {
      const values = Object.fromEntries(rows.map((row) => [row.day_key, row.accompaniment || ""]));
      document.querySelectorAll("select[data-accompaniment-day]").forEach((select) => {
        const value = values[select.dataset.accompanimentDay] || "";
        if (document.activeElement !== select) refillSelect(select, customOptions, value);
      });
    };

    const loadOptions = async () => {
      const { data, error } = await supabase
        .from("accompaniment_options")
        .select("name")
        .order("name", { ascending: true });
      if (disposed) return;
      if (error) {
        console.error("fetch accompaniment_options", error);
        return;
      }
      customOptions = (data || []).map((row) => row.name).filter(Boolean);
      updateAllMenus();
    };

    const addCustomOption = async () => {
      const idea = window.prompt("Nouvelle idée d’accompagnement :", "");
      const name = String(idea || "").trim();
      if (!name) return;

      if (!allOptions(customOptions).some((value) => value.toLocaleLowerCase("fr-CA") === name.toLocaleLowerCase("fr-CA"))) {
        customOptions = [...customOptions, name];
        updateAllMenus();
      }

      const { error } = await supabase
        .from("accompaniment_options")
        .upsert({ name, updated_at: new Date().toISOString() }, { onConflict: "name" });
      if (error) {
        console.error("save accompaniment option", error);
        loadOptions();
      }
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
        if (row.querySelector(`[data-accompaniment-group="${dayKey}"]`)) return;

        const controls = getMealControls(row);
        if (!controls) return;
        const { line, librarySelect } = controls;

        Object.assign(line.style, {
          display: "flex",
          flexDirection: "column",
          flexWrap: "nowrap",
          alignItems: "stretch",
          width: "100%",
        });
        Object.assign(input.style, {
          width: "100%",
          flex: "0 0 auto",
          fontSize: "16px",
        });
        Object.assign(librarySelect.style, {
          width: "100%",
          maxWidth: "none",
          flex: "0 0 auto",
          fontSize: "16px",
        });

        const group = document.createElement("div");
        group.dataset.accompanimentGroup = dayKey;
        Object.assign(group.style, {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          width: "100%",
          minWidth: "0",
          marginTop: "2px",
          marginBottom: "2px",
        });

        const select = buildSelect(label, dayKey, customOptions, save);
        select.style.flex = "1 1 auto";
        group.appendChild(select);
        group.appendChild(buildEditButton(addCustomOption));

        line.insertBefore(group, librarySelect);
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

    const subscribeOptions = () => {
      optionChannel = supabase
        .channel("accompaniment-options")
        .on("postgres_changes", { event: "*", schema: "public", table: "accompaniment_options" }, loadOptions)
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

    loadOptions();
    subscribeOptions();
    sync();
    const root = document.getElementById("root") || document.body;
    const observer = new MutationObserver(scheduleSync);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      if (channel) supabase.removeChannel(channel);
      if (optionChannel) supabase.removeChannel(optionChannel);
      document.querySelectorAll("[data-accompaniment-group]").forEach((group) => group.remove());
    };
  }, []);

  return null;
}

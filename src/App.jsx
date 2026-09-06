import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, Check, X, Clock, Plus, Trash2, ShoppingBasket, Users, Copy, Loader2, BookOpen, Search } from "lucide-react";
import { supabase } from "./supabaseClient";

const WEEKDAYS = [
  { key: "mon", label: "Lundi" },
  { key: "tue", label: "Mardi" },
  { key: "wed", label: "Mercredi" },
  { key: "thu", label: "Jeudi" },
  { key: "fri", label: "Vendredi" },
];

const PROFILE_COLORS = ["#4C6B4E", "#C98A3B", "#B24F35", "#3E6E8E", "#7A5AA3", "#2F8F82", "#8A5A3E"];

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay() || 7;
  if (day !== 1) date.setDate(date.getDate() - (day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function getWeekId(monday) {
  const target = new Date(monday.valueOf());
  const dayNr = (monday.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.round((firstThursday - target) / (7 * 24 * 3600 * 1000));
  return `${monday.getFullYear()}-S${String(weekNumber).padStart(2, "0")}`;
}

function formatShort(d) {
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

function emptyMeal() {
  return { name: "", ingredients: "", status: "pending", comment: "" };
}

function emptyMeals() {
  const meals = {};
  WEEKDAYS.forEach((d) => (meals[d.key] = emptyMeal()));
  return meals;
}

// ---- Accès aux données (Supabase) ----

async function fetchWeekMeals(weekId) {
  const meals = emptyMeals();
  const { data, error } = await supabase.from("week_meals").select("*").eq("week_id", weekId);
  if (error) {
    console.error("fetchWeekMeals", error);
    return meals;
  }
  (data || []).forEach((row) => {
    if (meals[row.day_key]) {
      meals[row.day_key] = {
        name: row.name || "",
        ingredients: row.ingredients || "",
        status: row.status || "pending",
        comment: row.comment || "",
      };
    }
  });
  return meals;
}

async function upsertWeekMeal(weekId, dayKey, meal) {
  const { error } = await supabase
    .from("week_meals")
    .upsert({ week_id: weekId, day_key: dayKey, ...meal, updated_at: new Date().toISOString() });
  if (error) console.error("upsertWeekMeal", error);
}

async function fetchWeekendNote(weekId) {
  const { data, error } = await supabase.from("weekend_notes").select("note").eq("week_id", weekId).maybeSingle();
  if (error) {
    console.error("fetchWeekendNote", error);
    return "";
  }
  return data?.note || "";
}

async function upsertWeekendNote(weekId, note) {
  const { error } = await supabase
    .from("weekend_notes")
    .upsert({ week_id: weekId, note, updated_at: new Date().toISOString() });
  if (error) console.error("upsertWeekendNote", error);
}

async function fetchProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("fetchProfiles", error);
    return [];
  }
  return data || [];
}

async function insertProfile(profile) {
  const { data, error } = await supabase.from("profiles").insert(profile).select().single();
  if (error) console.error("insertProfile", error);
  return data;
}

async function deleteProfileRow(id) {
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) console.error("deleteProfileRow", error);
}

async function fetchLibrary() {
  const { data, error } = await supabase.from("meal_library").select("*").order("name", { ascending: true });
  if (error) {
    console.error("fetchLibrary", error);
    return [];
  }
  return data || [];
}

async function upsertLibraryEntry(name, ingredients) {
  if (!name.trim()) return;
  const { data: existing } = await supabase.from("meal_library").select("id").ilike("name", name.trim()).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("meal_library").update({ ingredients: ingredients || "" }).eq("id", existing.id);
    if (error) console.error("upsertLibraryEntry(update)", error);
  } else {
    const { error } = await supabase.from("meal_library").insert({ name: name.trim(), ingredients: ingredients || "" });
    if (error) console.error("upsertLibraryEntry(insert)", error);
  }
}

async function deleteLibraryRow(id) {
  const { error } = await supabase.from("meal_library").delete().eq("id", id);
  if (error) console.error("deleteLibraryRow", error);
}

async function fetchGroceryChecked(weekId) {
  const { data, error } = await supabase.from("grocery_checked").select("*").eq("week_id", weekId);
  if (error) {
    console.error("fetchGroceryChecked", error);
    return {};
  }
  const map = {};
  (data || []).forEach((row) => (map[row.item_key] = row.checked));
  return map;
}

async function setGroceryCheckedRow(weekId, itemKey, checked) {
  const { error } = await supabase.from("grocery_checked").upsert({ week_id: weekId, item_key: itemKey, checked });
  if (error) console.error("setGroceryCheckedRow", error);
}

async function fetchGroceryExtra(weekId) {
  const { data, error } = await supabase.from("grocery_extra").select("item").eq("week_id", weekId);
  if (error) {
    console.error("fetchGroceryExtra", error);
    return [];
  }
  return (data || []).map((r) => r.item);
}

async function addGroceryExtraRow(weekId, item) {
  const { error } = await supabase.from("grocery_extra").insert({ week_id: weekId, item });
  if (error) console.error("addGroceryExtraRow", error);
}

async function removeGroceryExtraRow(weekId, item) {
  const { error } = await supabase.from("grocery_extra").delete().eq("week_id", weekId).eq("item", item);
  if (error) console.error("removeGroceryExtraRow", error);
}

export default function App() {
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const weekId = useMemo(() => getWeekId(monday), [monday]);

  const [meals, setMeals] = useState(emptyMeals());
  const [weekendNote, setWeekendNote] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [library, setLibrary] = useState([]);
  const [grocery, setGrocery] = useState({});
  const [groceryExtra, setGroceryExtra] = useState([]);
  const [loadingWeek, setLoadingWeek] = useState(true);

  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileNotes, setNewProfileNotes] = useState("");
  const [showAddProfile, setShowAddProfile] = useState(false);

  const [librarySearch, setLibrarySearch] = useState("");
  const [showAddLibraryItem, setShowAddLibraryItem] = useState(false);
  const [newLibName, setNewLibName] = useState("");
  const [newLibIngredients, setNewLibIngredients] = useState("");

  const [newGroceryItem, setNewGroceryItem] = useState("");

  const reloadWeek = useCallback(async () => {
    const [m, note, checked, extra] = await Promise.all([
      fetchWeekMeals(weekId),
      fetchWeekendNote(weekId),
      fetchGroceryChecked(weekId),
      fetchGroceryExtra(weekId),
    ]);
    setMeals(m);
    setWeekendNote(note);
    setGrocery(checked);
    setGroceryExtra(extra);
    setLoadingWeek(false);
  }, [weekId]);

  const reloadGlobals = useCallback(async () => {
    const [p, l] = await Promise.all([fetchProfiles(), fetchLibrary()]);
    setProfiles(p);
    setLibrary(l);
  }, []);

  // Chargement initial + à chaque changement de semaine
  useEffect(() => {
    setLoadingWeek(true);
    reloadWeek();
  }, [reloadWeek]);

  useEffect(() => {
    reloadGlobals();
  }, [reloadGlobals]);

  // Temps réel : tout le monde voit les changements des autres, sans recharger la page
  useEffect(() => {
    const channel = supabase
      .channel(`week-${weekId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "week_meals", filter: `week_id=eq.${weekId}` }, reloadWeek)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekend_notes", filter: `week_id=eq.${weekId}` }, reloadWeek)
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_checked", filter: `week_id=eq.${weekId}` }, reloadWeek)
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_extra", filter: `week_id=eq.${weekId}` }, reloadWeek)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [weekId, reloadWeek]);

  useEffect(() => {
    const channel = supabase
      .channel("globals")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, reloadGlobals)
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_library" }, reloadGlobals)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reloadGlobals]);

  const updateMeal = async (dayKey, patch) => {
    const nextMeal = { ...emptyMeal(), ...meals[dayKey], ...patch };
    setMeals((prev) => ({ ...prev, [dayKey]: nextMeal }));
    await upsertWeekMeal(weekId, dayKey, nextMeal);
  };

  const updateWeekendNote = async (value) => {
    setWeekendNote(value);
    await upsertWeekendNote(weekId, value);
  };

  const upsertLibrary = async (name, ingredients) => {
    if (!name.trim()) return;
    await upsertLibraryEntry(name, ingredients);
    reloadGlobals();
  };

  const deleteLibraryItem = async (id) => {
    await deleteLibraryRow(id);
    reloadGlobals();
  };

  const addLibraryItemManually = async () => {
    if (!newLibName.trim()) return;
    await upsertLibrary(newLibName, newLibIngredients);
    setNewLibName("");
    setNewLibIngredients("");
    setShowAddLibraryItem(false);
  };

  const duplicatePreviousWeek = async () => {
    const prevMonday = addDays(monday, -7);
    const prevWeekId = getWeekId(prevMonday);
    const prevMeals = await fetchWeekMeals(prevWeekId);
    await Promise.all(
      WEEKDAYS.map((d) => {
        const prevMeal = prevMeals[d.key];
        if (!prevMeal || !prevMeal.name.trim()) return Promise.resolve();
        const nextMeal = { name: prevMeal.name, ingredients: prevMeal.ingredients, status: "pending", comment: "" };
        return upsertWeekMeal(weekId, d.key, nextMeal);
      })
    );
    reloadWeek();
  };

  const addProfile = async () => {
    if (!newProfileName.trim()) return;
    const color = PROFILE_COLORS[profiles.length % PROFILE_COLORS.length];
    await insertProfile({ name: newProfileName.trim(), notes: newProfileNotes.trim(), color });
    setNewProfileName("");
    setNewProfileNotes("");
    setShowAddProfile(false);
    reloadGlobals();
  };

  const removeProfile = async (id) => {
    await deleteProfileRow(id);
    reloadGlobals();
  };

  const toggleGroceryItem = async (key) => {
    const nextChecked = !grocery[key];
    setGrocery((prev) => ({ ...prev, [key]: nextChecked }));
    await setGroceryCheckedRow(weekId, key, nextChecked);
  };

  const addGroceryItem = async () => {
    const item = newGroceryItem.trim();
    if (!item) return;
    const lower = item.toLowerCase();
    if (groceryExtra.some((i) => i.toLowerCase() === lower)) {
      setNewGroceryItem("");
      return;
    }
    setGroceryExtra((prev) => [...prev, item]);
    setNewGroceryItem("");
    await addGroceryExtraRow(weekId, item);
  };

  const removeGroceryExtra = async (item) => {
    setGroceryExtra((prev) => prev.filter((i) => i !== item));
    await removeGroceryExtraRow(weekId, item);
  };

  const clearCheckedGrocery = async () => {
    const keysToUncheck = Object.keys(grocery).filter((k) => grocery[k]);
    setGrocery((prev) => {
      const next = { ...prev };
      keysToUncheck.forEach((k) => (next[k] = false));
      return next;
    });
    await Promise.all(keysToUncheck.map((k) => setGroceryCheckedRow(weekId, k, false)));
  };

  const groceryList = useMemo(() => {
    const seen = new Map();
    WEEKDAYS.forEach((d) => {
      const meal = meals[d.key] || emptyMeal();
      if (meal.status === "approved" && meal.ingredients.trim()) {
        meal.ingredients.split(",").forEach((raw) => {
          const item = raw.trim();
          if (!item) return;
          const lower = item.toLowerCase();
          if (!seen.has(lower)) seen.set(lower, { label: item.charAt(0).toUpperCase() + item.slice(1), removable: false });
        });
      }
    });
    groceryExtra.forEach((item) => {
      const lower = item.toLowerCase();
      if (!seen.has(lower)) seen.set(lower, { label: item, removable: true });
      else seen.set(lower, { ...seen.get(lower), removable: false });
    });
    return Array.from(seen.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [meals, groceryExtra]);

  const pendingCount = useMemo(() => {
    let n = 0;
    WEEKDAYS.forEach((d) => {
      const meal = meals[d.key] || emptyMeal();
      if (meal.name.trim() && meal.status === "pending") n++;
    });
    return n;
  }, [meals]);

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    const sorted = [...library].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    if (!q) return sorted;
    return sorted.filter((m) => m.name.toLowerCase().includes(q) || (m.ingredients || "").toLowerCase().includes(q));
  }, [library, librarySearch]);

  const weekDates = WEEKDAYS.map((d, i) => addDays(monday, i));
  const weekendStart = addDays(monday, 5);
  const weekendEnd = addDays(monday, 6);
  const rangeLabel = `${formatShort(weekDates[0])} – ${formatShort(weekendEnd)} ${monday.getFullYear()}`;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: "var(--paper)", minHeight: "100vh", color: "var(--ink)" }}>
      <style>{`
        :root {
          --paper: #FBF7F0;
          --ink: #2A241E;
          --ink-soft: #746A5C;
          --herb: #4C6B4E;
          --herb-soft: #E6EEE2;
          --honey: #C98A3B;
          --honey-soft: #F6E9D3;
          --paprika: #B24F35;
          --paprika-soft: #F5E1D9;
          --line: #E3D9C8;
          --card: #FFFFFF;
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
        input, textarea, button, select { font-family: inherit; }
        input:focus, textarea:focus, button:focus-visible, select:focus { outline: 2px solid var(--herb); outline-offset: 1px; }
        textarea { resize: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <header style={{ background: "#2F3B2C", color: "#F3EFE4", padding: "20px 20px 18px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 600, fontSize: "clamp(24px,4vw,34px)", margin: "0 0 20px" }}>
            Le souper de la semaine
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <button onClick={() => setMonday(addDays(monday, -7))} style={navBtnStyle} aria-label="Semaine précédente">
              <ChevronLeft size={18} />
            </button>
            <div style={{ minWidth: 210, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#C8CFC0", letterSpacing: 0.3 }}>Semaine {weekId}</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{rangeLabel}</div>
            </div>
            <button onClick={() => setMonday(addDays(monday, 7))} style={navBtnStyle} aria-label="Semaine suivante">
              <ChevronRight size={18} />
            </button>
            <button onClick={() => setMonday(getMonday(new Date()))} style={{ ...pillBtnStyle, marginLeft: 6 }}>
              Aujourd'hui
            </button>
            <button onClick={duplicatePreviousWeek} style={{ ...pillBtnStyle, marginLeft: "auto" }}>
              <Copy size={14} style={{ marginRight: 6 }} />
              Copier la semaine dernière
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "22px 20px 60px" }}>
        <section style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Users size={16} color="var(--ink-soft)" />
            <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 500 }}>
              Profils et restrictions — enfants comme parents
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {profiles.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "var(--card)",
                  border: `1px solid ${p.color}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {p.notes && <span style={{ color: "var(--ink-soft)" }}>— {p.notes}</span>}
                <button
                  onClick={() => removeProfile(p.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)", padding: 0, display: "flex" }}
                  aria-label={`Retirer ${p.name}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {!showAddProfile && (
              <button onClick={() => setShowAddProfile(true)} style={{ ...pillBtnStyle, background: "transparent", color: "var(--ink)", border: "1px dashed var(--line)" }}>
                <Plus size={14} style={{ marginRight: 6 }} />
                Ajouter un profil
              </button>
            )}
            {showAddProfile && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input placeholder="Prénom" value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} style={{ ...inputStyle, width: 110 }} />
                <input placeholder="Allergies, préférences..." value={newProfileNotes} onChange={(e) => setNewProfileNotes(e.target.value)} style={{ ...inputStyle, width: 200 }} />
                <button onClick={addProfile} style={{ ...pillBtnStyle, background: "var(--herb)", color: "#fff" }}>
                  Ajouter
                </button>
                <button onClick={() => setShowAddProfile(false)} style={{ ...pillBtnStyle, background: "transparent", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
                  Annuler
                </button>
              </div>
            )}
          </div>
        </section>

        <section style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <BookOpen size={16} color="var(--ink-soft)" />
            <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 500 }}>Bibliothèque de plats déjà utilisés</span>
          </div>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 200px" }}>
                <Search size={14} color="var(--ink-soft)" style={{ position: "absolute", left: 10, top: 10 }} />
                <input
                  placeholder="Chercher un plat ou un ingrédient..."
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  style={{ ...inputStyle, width: "100%", paddingLeft: 30 }}
                />
              </div>
              {!showAddLibraryItem && (
                <button onClick={() => setShowAddLibraryItem(true)} style={{ ...pillBtnStyle, background: "var(--herb)", color: "#fff" }}>
                  <Plus size={14} style={{ marginRight: 6 }} />
                  Nouveau plat
                </button>
              )}
            </div>
            {showAddLibraryItem && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, background: "var(--paper)", padding: 10, borderRadius: 8 }}>
                <input placeholder="Nom du plat" value={newLibName} onChange={(e) => setNewLibName(e.target.value)} style={{ ...inputStyle, width: 160 }} />
                <input placeholder="Ingrédients, séparés par virgules" value={newLibIngredients} onChange={(e) => setNewLibIngredients(e.target.value)} style={{ ...inputStyle, flex: "1 1 220px" }} />
                <button onClick={addLibraryItemManually} style={{ ...pillBtnStyle, background: "var(--herb)", color: "#fff" }}>Enregistrer</button>
                <button onClick={() => setShowAddLibraryItem(false)} style={{ ...pillBtnStyle, background: "transparent", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>Annuler</button>
              </div>
            )}
            {filteredLibrary.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
                Aucun plat pour l'instant. Ajoute un plat ci-dessus, ou remplis un souper plus bas — il sera enregistré ici automatiquement.
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                {filteredLibrary.map((m) => (
                  <div key={m.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</span>
                      <button onClick={() => deleteLibraryItem(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)", flexShrink: 0 }} aria-label={`Supprimer ${m.name}`}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {m.ingredients && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{m.ingredients}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {loadingWeek ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-soft)", padding: 40, justifyContent: "center" }}>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            Chargement de la semaine…
          </div>
        ) : (
          <>
            <div
              style={{
                background: pendingCount > 0 ? "var(--honey-soft)" : "var(--herb-soft)",
                border: `1px solid ${pendingCount > 0 ? "var(--honey)" : "var(--herb)"}`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {pendingCount > 0
                ? `${pendingCount} souper${pendingCount > 1 ? "s" : ""} en attente d'approbation avant de faire l'épicerie.`
                : "Tous les soupers saisis ont une réponse des parents. Prêt pour l'épicerie."}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {WEEKDAYS.map((d, i) => (
                <EveningRow
                  key={d.key}
                  dayLabel={d.label}
                  dateLabel={formatShort(weekDates[i])}
                  meal={meals[d.key] || emptyMeal()}
                  library={library}
                  onChange={(patch) => updateMeal(d.key, patch)}
                  onLibraryUpsert={upsertLibrary}
                />
              ))}
              <WeekendCard
                dateLabel={`${formatShort(weekendStart)} – ${formatShort(weekendEnd)}`}
                note={weekendNote}
                onChange={updateWeekendNote}
              />
            </div>

            <section style={{ marginTop: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <ShoppingBasket size={16} color="var(--ink-soft)" />
                <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 500 }}>Liste d'épicerie</span>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    placeholder="Ajouter un item (ex. lait, papier essuie-tout...)"
                    value={newGroceryItem}
                    onChange={(e) => setNewGroceryItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addGroceryItem()}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={addGroceryItem} style={{ ...pillBtnStyle, background: "var(--herb)", color: "#fff" }}>
                    <Plus size={14} style={{ marginRight: 6 }} />
                    Ajouter
                  </button>
                </div>
                {groceryList.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
                    Aucun item pour l'instant. Les ingrédients des soupers approuvés apparaissent ici automatiquement, ou ajoute un item toi-même.
                  </p>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
                      {groceryList.map((item) => (
                        <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, textDecoration: grocery[item.key] ? "line-through" : "none", color: grocery[item.key] ? "var(--ink-soft)" : "var(--ink)" }}>
                            <input type="checkbox" checked={!!grocery[item.key]} onChange={() => toggleGroceryItem(item.key)} />
                            {item.label}
                          </label>
                          {item.removable && (
                            <button onClick={() => removeGroceryExtra(item.label)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)" }} aria-label={`Retirer ${item.label}`}>
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button onClick={clearCheckedGrocery} style={{ ...pillBtnStyle, marginTop: 12, background: "transparent", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
                      Décocher tout
                    </button>
                  </>
                )}
              </div>
            </section>

            <p style={{ marginTop: 28, fontSize: 12, color: "var(--ink-soft)" }}>
              📱 Ajoute ce lien à l'écran d'accueil de ton téléphone pour l'ouvrir comme une application. Les changements sont synchronisés en direct pour tout le monde.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function WeekendCard({ dateLabel, note, onChange }) {
  const [value, setValue] = useState(note);
  useEffect(() => setValue(note), [note]);

  return (
    <div style={{ background: "var(--honey-soft)", border: "1px solid var(--honey)", borderRadius: 10, padding: 12, display: "flex", flexWrap: "wrap", gap: 12 }}>
      <div style={{ width: 92, flexShrink: 0, paddingTop: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Fin de semaine</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{dateLabel}</div>
      </div>
      <div style={{ flex: "1 1 300px" }}>
        <textarea
          placeholder="Ce qui est déjà prêt pour le samedi et le dimanche, et ce que les parents peuvent faire (ex. : reste de lasagne au frigo pour samedi, dimanche ils peuvent faire des pâtes ou commander)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onChange(value)}
          rows={3}
          style={{ ...inputStyle, width: "100%", background: "var(--card)", fontSize: 13 }}
        />
      </div>
    </div>
  );
}

function EveningRow({ dayLabel, dateLabel, meal, library, onChange, onLibraryUpsert }) {
  const [name, setName] = useState(meal.name);
  const [ingredients, setIngredients] = useState(meal.ingredients);
  const [comment, setComment] = useState(meal.comment);

  useEffect(() => setName(meal.name), [meal.name]);
  useEffect(() => setIngredients(meal.ingredients), [meal.ingredients]);
  useEffect(() => setComment(meal.comment), [meal.comment]);

  const statusColors = {
    pending: { bg: "var(--card)", border: "var(--line)", text: "var(--ink-soft)" },
    approved: { bg: "var(--herb-soft)", border: "var(--herb)", text: "var(--herb)" },
    refused: { bg: "var(--paprika-soft)", border: "var(--paprika)", text: "var(--paprika)" },
  };
  const sc = statusColors[meal.status];

  const handlePickFromLibrary = (e) => {
    const id = e.target.value;
    if (!id) return;
    const item = library.find((m) => m.id === id);
    if (item) {
      setName(item.name);
      setIngredients(item.ingredients);
      onChange({ name: item.name, ingredients: item.ingredients });
    }
    e.target.value = "";
  };

  return (
    <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 10, padding: 12, display: "flex", flexWrap: "wrap", gap: 12 }}>
      <div style={{ width: 92, flexShrink: 0, paddingTop: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{dayLabel}</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{dateLabel}</div>
      </div>

      <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            placeholder="Nom du souper"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              onChange({ name });
              onLibraryUpsert(name, ingredients);
            }}
            style={{ ...inputStyle, flex: 1, fontWeight: 600, background: "var(--card)" }}
          />
          <select onChange={handlePickFromLibrary} defaultValue="" style={{ ...inputStyle, background: "var(--card)", maxWidth: 160 }} aria-label="Piger dans la bibliothèque">
            <option value="">Piger…</option>
            {library.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          placeholder="Ingrédients (séparés par des virgules)"
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          onBlur={() => {
            onChange({ ingredients });
            onLibraryUpsert(name, ingredients);
          }}
          rows={2}
          style={{ ...inputStyle, fontSize: 12, color: "var(--ink-soft)", background: "var(--card)" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 130, flexShrink: 0 }}>
        <StatusButton active={meal.status === "pending"} onClick={() => onChange({ status: "pending" })} icon={<Clock size={12} />} label="En attente" />
        <StatusButton active={meal.status === "approved"} onClick={() => onChange({ status: "approved" })} icon={<Check size={12} />} label="Approuvé" color="var(--herb)" />
        <StatusButton active={meal.status === "refused"} onClick={() => onChange({ status: "refused" })} icon={<X size={12} />} label="Refusé" color="var(--paprika)" />
      </div>

      <div style={{ flex: "1 1 220px" }}>
        <input
          placeholder="Commentaire du parent (ex. « pas de noix », « il n'aime pas le poisson »)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => onChange({ comment })}
          style={{ ...inputStyle, width: "100%", background: "var(--card)", fontSize: 13 }}
        />
      </div>
    </div>
  );
}

function StatusButton({ active, onClick, icon, label, color }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderRadius: 6,
        border: `1px solid ${active ? (color || "var(--ink-soft)") : "var(--line)"}`,
        background: active ? (color || "var(--ink-soft)") : "var(--card)",
        color: active ? "#fff" : "var(--ink-soft)",
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const navBtnStyle = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid #4C5945",
  background: "transparent",
  color: "#F3EFE4",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const pillBtnStyle = {
  border: "1px solid transparent",
  borderRadius: 20,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  background: "#3E4A38",
  color: "#F3EFE4",
  display: "inline-flex",
  alignItems: "center",
};

const inputStyle = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
  background: "var(--card)",
};

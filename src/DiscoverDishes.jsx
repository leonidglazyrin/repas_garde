import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "./supabaseClient";

const CACHE_KEY = "repasgarde:discovery:dishes";

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeCache(dishes) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(dishes));
  } catch {}
}

function findLibrarySection() {
  return Array.from(document.querySelectorAll("main > section")).find((section) =>
    (section.textContent || "").includes("Bibliothèque de plats déjà utilisés")
  ) || null;
}

function ensureMountNode() {
  const main = document.querySelector("main");
  const library = findLibrarySection();
  if (!main || !library) return null;

  let slot = document.getElementById("discover-dishes-slot");
  if (!slot) {
    slot = document.createElement("div");
    slot.id = "discover-dishes-slot";
  }
  if (slot.parentElement !== main || library.nextElementSibling !== slot) {
    library.insertAdjacentElement("afterend", slot);
  }
  return slot;
}

export default function DiscoverDishes() {
  const cached = useMemo(() => readCache(), []);
  const [mountNode, setMountNode] = useState(null);
  const [dishes, setDishes] = useState(cached);
  const [newName, setNewName] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const place = () => {
      if (cancelled) return;
      const slot = ensureMountNode();
      if (slot) {
        setMountNode(slot);
        return;
      }
      attempts += 1;
      if (attempts < 20) setTimeout(place, 100);
    };
    place();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from("discovery_dishes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetch discovery_dishes", error);
      return;
    }
    setDishes(data || []);
  }, []);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel("discovery-dishes-stable")
      .on("postgres_changes", { event: "*", schema: "public", table: "discovery_dishes" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  useEffect(() => {
    writeCache(dishes);
  }, [dishes]);

  const addDish = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("discovery_dishes")
      .insert({ name, details: newDetails.trim(), updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) console.error("add discovery dish", error);
    else if (data) {
      setDishes((prev) => [data, ...prev.filter((dish) => dish.id !== data.id)]);
      setNewName("");
      setNewDetails("");
      setShowAddForm(false);
    }
    setAdding(false);
  };

  const startEdit = (dish) => {
    setEditingId(dish.id);
    setEditName(dish.name || "");
    setEditDetails(dish.details || "");
  };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!editingId || !name) return;
    const { data, error } = await supabase
      .from("discovery_dishes")
      .update({ name, details: editDetails.trim(), updated_at: new Date().toISOString() })
      .eq("id", editingId)
      .select()
      .single();
    if (error) console.error("update discovery dish", error);
    else if (data) {
      setDishes((prev) => prev.map((dish) => (dish.id === data.id ? data : dish)));
      setEditingId(null);
    }
  };

  const removeDish = async (dish) => {
    if (busyId) return;
    setBusyId(dish.id);
    const previous = dishes;
    setDishes((prev) => prev.filter((item) => item.id !== dish.id));
    const { error } = await supabase.from("discovery_dishes").delete().eq("id", dish.id);
    if (error) {
      console.error("delete discovery dish", error);
      setDishes(previous);
    }
    setBusyId(null);
  };

  const keepDish = async (dish) => {
    if (busyId) return;
    setBusyId(dish.id);

    const name = String(dish.name || "").trim();
    const ingredients = String(dish.details || "").trim();
    const { data: existing, error: lookupError } = await supabase
      .from("meal_library")
      .select("id")
      .ilike("name", name)
      .limit(1);

    if (lookupError) {
      console.error("lookup library dish", lookupError);
      setBusyId(null);
      return;
    }

    let libraryError = null;
    if (existing?.length) {
      const result = await supabase
        .from("meal_library")
        .update({ ingredients })
        .eq("id", existing[0].id);
      libraryError = result.error;
    } else {
      const result = await supabase.from("meal_library").insert({ name, ingredients });
      libraryError = result.error;
    }

    if (libraryError) {
      console.error("save discovery dish to library", libraryError);
      setBusyId(null);
      return;
    }

    const previous = dishes;
    setDishes((prev) => prev.filter((item) => item.id !== dish.id));
    const { error: deleteError } = await supabase.from("discovery_dishes").delete().eq("id", dish.id);
    if (deleteError) {
      console.error("remove accepted discovery dish", deleteError);
      setDishes(previous);
    }
    setBusyId(null);
  };

  if (!mountNode) return null;

  return createPortal(
    <section data-discovery-stable="true">
      <div className="discover-header">
        <Sparkles size={16} color="var(--honey)" />
        <span>Plats à découvrir</span>
        <button
          type="button"
          onClick={() => setShowAddForm((visible) => !visible)}
          aria-label={showAddForm ? "Fermer l’ajout" : "Ajouter un plat à découvrir"}
          className="discover-add-toggle"
        >
          {showAddForm ? <X size={16} /> : <Plus size={16} />}
        </button>
      </div>

      <div className="discover-card-shell">
        {showAddForm && (
          <div className="discover-add-form">
            <input
              placeholder="Nom du plat à découvrir"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDish()}
            />
            <input
              placeholder="Ingrédients ou détail (facultatif)"
              value={newDetails}
              onChange={(e) => setNewDetails(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDish()}
            />
            <button type="button" onClick={addDish} disabled={adding || !newName.trim()} className="discover-primary">Ajouter</button>
          </div>
        )}

        {dishes.length === 0 ? (
          <p className="discover-empty">Aucun plat à décider pour le moment.</p>
        ) : (
          <div className="discover-list">
            {dishes.map((dish) => {
              const editing = editingId === dish.id;
              const busy = busyId === dish.id;
              return (
                <article key={dish.id} className="discover-item">
                  {editing ? (
                    <div className="discover-edit-form">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nom du plat" autoFocus />
                      <input value={editDetails} onChange={(e) => setEditDetails(e.target.value)} placeholder="Ingrédients ou détail" />
                      <div className="discover-edit-actions">
                        <button type="button" onClick={saveEdit} className="discover-primary">Enregistrer</button>
                        <button type="button" onClick={() => setEditingId(null)} className="discover-secondary">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="discover-item-top">
                        <div className="discover-copy">
                          <strong>{dish.name}</strong>
                          {dish.details && <span>{dish.details}</span>}
                        </div>
                        <div className="discover-item-tools">
                          <button type="button" onClick={() => startEdit(dish)} aria-label={`Modifier ${dish.name}`}><Pencil size={14} /></button>
                          <button type="button" onClick={() => removeDish(dish)} aria-label={`Supprimer ${dish.name}`}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="discover-decision-row">
                        <span>On garde ce plat ?</span>
                        <button type="button" disabled={busy} onClick={() => keepDish(dish)} className="discover-yes">Oui</button>
                        <button type="button" disabled={busy} onClick={() => removeDish(dish)} className="discover-no">Non</button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>,
    mountNode
  );
}

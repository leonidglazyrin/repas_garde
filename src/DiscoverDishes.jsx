import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, HelpCircle, Plus, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "./supabaseClient";

const CACHE_KEY = "repasgarde:discovery";

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeCache(dishes, votes) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ dishes, votes }));
  } catch {}
}

function votesToMap(rows) {
  const map = {};
  (rows || []).forEach((row) => {
    if (!map[row.dish_id]) map[row.dish_id] = {};
    map[row.dish_id][row.profile_id] = row.choice;
  });
  return map;
}

export default function DiscoverDishes() {
  const cached = useMemo(() => readCache(), []);
  const [mountNode, setMountNode] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [dishes, setDishes] = useState(() => cached?.dishes || []);
  const [votes, setVotes] = useState(() => cached?.votes || {});
  const [newName, setNewName] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const placeSection = () => {
      const librarySection = Array.from(document.querySelectorAll("main > section")).find((section) =>
        (section.textContent || "").includes("Bibliothèque de plats déjà utilisés")
      );
      if (!librarySection) return false;

      let slot = document.getElementById("discover-dishes-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "discover-dishes-slot";
        librarySection.insertAdjacentElement("afterend", slot);
      }
      setMountNode(slot);
      return true;
    };

    if (placeSection()) return;
    const observer = new MutationObserver(() => {
      if (placeSection()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const reload = useCallback(async () => {
    const [dishResult, voteResult, profileResult] = await Promise.all([
      supabase.from("discovery_dishes").select("*").order("created_at", { ascending: false }),
      supabase.from("discovery_votes").select("dish_id, profile_id, choice"),
      supabase.from("profiles").select("id, name, color").order("created_at", { ascending: true }),
    ]);

    if (!dishResult.error) setDishes(dishResult.data || []);
    else console.error("fetch discovery_dishes", dishResult.error);

    if (!voteResult.error) setVotes(votesToMap(voteResult.data));
    else console.error("fetch discovery_votes", voteResult.error);

    if (!profileResult.error) setProfiles(profileResult.data || []);
    else console.error("fetch discovery profiles", profileResult.error);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    writeCache(dishes, votes);
  }, [dishes, votes]);

  useEffect(() => {
    const channel = supabase
      .channel("discovery")
      .on("postgres_changes", { event: "*", schema: "public", table: "discovery_dishes" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "discovery_votes" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, reload)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const addDish = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("discovery_dishes")
      .insert({ name, details: newDetails.trim(), updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) {
      console.error("add discovery dish", error);
    } else if (data) {
      setDishes((prev) => [data, ...prev]);
      setNewName("");
      setNewDetails("");
    }
    setAdding(false);
  };

  const deleteDish = async (id) => {
    setDishes((prev) => prev.filter((dish) => dish.id !== id));
    setVotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const { error } = await supabase.from("discovery_dishes").delete().eq("id", id);
    if (error) {
      console.error("delete discovery dish", error);
      reload();
    }
  };

  const setVote = async (dishId, profileId, choice) => {
    setVotes((prev) => ({
      ...prev,
      [dishId]: { ...(prev[dishId] || {}), [profileId]: choice },
    }));

    const { error } = await supabase.from("discovery_votes").upsert({
      dish_id: dishId,
      profile_id: profileId,
      choice,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("save discovery vote", error);
      reload();
    }
  };

  if (!mountNode) return null;

  return createPortal(
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Sparkles size={16} color="var(--honey)" />
        <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 600 }}>Plats à découvrir</span>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: dishes.length ? 14 : 0 }}>
          <input
            placeholder="Nom du plat à découvrir"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDish()}
            style={{ ...inputStyle, flex: "1 1 190px", fontWeight: 600 }}
          />
          <input
            placeholder="Petit détail (facultatif)"
            value={newDetails}
            onChange={(e) => setNewDetails(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDish()}
            style={{ ...inputStyle, flex: "2 1 240px" }}
          />
          <button onClick={addDish} disabled={adding || !newName.trim()} style={{ ...pillBtnStyle, background: "var(--honey)", color: "#fff", opacity: adding || !newName.trim() ? 0.55 : 1 }}>
            <Plus size={14} style={{ marginRight: 6 }} />
            Ajouter
          </button>
        </div>

        {dishes.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "10px 0 0" }}>
            Ajoute une idée de plat. Chaque profil pourra dire s'il a envie d'y goûter.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dishes.map((dish) => (
              <div key={dish.id} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: 11, background: "var(--paper)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{dish.name}</div>
                    {dish.details && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 3 }}>{dish.details}</div>}
                  </div>
                  <button onClick={() => deleteDish(dish.id)} aria-label={`Supprimer ${dish.name}`} style={{ border: "none", background: "transparent", color: "var(--ink-soft)", cursor: "pointer", padding: 2 }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {profiles.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 9 }}>Ajoute d'abord un profil pour pouvoir voter.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                    {profiles.map((profile) => {
                      const choice = votes[dish.id]?.[profile.id] || null;
                      return (
                        <div key={profile.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: profile.color || "var(--ink-soft)" }} />
                          <span style={{ minWidth: 82, fontSize: 13, fontWeight: 600 }}>{profile.name}</span>
                          <VoteButton active={choice === "want"} onClick={() => setVote(dish.id, profile.id, "want")} icon={<Check size={12} />} label="Oui, à goûter" color="var(--herb)" />
                          <VoteButton active={choice === "maybe"} onClick={() => setVote(dish.id, profile.id, "maybe")} icon={<HelpCircle size={12} />} label="Peut-être" color="var(--honey)" />
                          <VoteButton active={choice === "no"} onClick={() => setVote(dish.id, profile.id, "no")} icon={<X size={12} />} label="Non merci" color="var(--paprika)" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>,
    mountNode
  );
}

function VoteButton({ active, onClick, icon, label, color }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 16,
        border: `1px solid ${active ? color : "var(--line)"}`,
        background: active ? color : "var(--card)",
        color: active ? "#fff" : "var(--ink-soft)",
        padding: "5px 9px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const pillBtnStyle = {
  border: "1px solid transparent",
  borderRadius: 20,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
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

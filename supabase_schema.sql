-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > coller > Run

create extension if not exists "pgcrypto";

-- Profils (enfants ET parents), avec restrictions/notes et une couleur
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text default '',
  color text not null,
  created_at timestamptz default now()
);

-- Bibliothèque de plats déjà utilisés
create table if not exists meal_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ingredients text default '',
  created_at timestamptz default now()
);

-- Plats proposés à découvrir
create table if not exists discovery_dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  details text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Choix de chaque profil pour chaque plat à découvrir
create table if not exists discovery_votes (
  dish_id uuid not null references discovery_dishes(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  choice text not null check (choice in ('want', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (dish_id, profile_id)
);

-- Un souper par jour de semaine, par semaine (week_id ex. "2026-S37")
create table if not exists week_meals (
  week_id text not null,
  day_key text not null,
  name text default '',
  ingredients text default '',
  status text default 'pending',
  comment text default '',
  updated_at timestamptz default now(),
  primary key (week_id, day_key)
);

-- Note fin de semaine (samedi + dimanche regroupés), une par semaine
create table if not exists weekend_notes (
  week_id text primary key,
  note text default '',
  updated_at timestamptz default now()
);

-- Cases cochées de la liste d'épicerie (auto + manuel), par semaine
create table if not exists grocery_checked (
  week_id text not null,
  item_key text not null,
  checked boolean default false,
  primary key (week_id, item_key)
);

-- Items ajoutés manuellement à la liste d'épicerie, par semaine
create table if not exists grocery_extra (
  week_id text not null,
  item text not null,
  primary key (week_id, item)
);

-- Active la réplication en temps réel (pour que tout le monde voie les changements en direct)
alter publication supabase_realtime add table profiles, meal_library, discovery_dishes, discovery_votes, week_meals, weekend_notes, grocery_checked, grocery_extra;

-- Sécurité (RLS) : app familiale simple utilisée via un lien, sans compte.
-- On active RLS mais on autorise toutes les opérations à la clé "anon" (publique).
-- ATTENTION : quiconque a le lien de l'app peut lire/écrire toutes les données.
-- C'est le même niveau de confidentialité qu'un lien partagé classique — ne mets rien de sensible dedans.
alter table profiles enable row level security;
alter table meal_library enable row level security;
alter table discovery_dishes enable row level security;
alter table discovery_votes enable row level security;
alter table week_meals enable row level security;
alter table weekend_notes enable row level security;
alter table grocery_checked enable row level security;
alter table grocery_extra enable row level security;

create policy "allow all - profiles" on profiles for all using (true) with check (true);
create policy "allow all - meal_library" on meal_library for all using (true) with check (true);
create policy "allow all - discovery_dishes" on discovery_dishes for all using (true) with check (true);
create policy "allow all - discovery_votes" on discovery_votes for all using (true) with check (true);
create policy "allow all - week_meals" on week_meals for all using (true) with check (true);
create policy "allow all - weekend_notes" on weekend_notes for all using (true) with check (true);
create policy "allow all - grocery_checked" on grocery_checked for all using (true) with check (true);
create policy "allow all - grocery_extra" on grocery_extra for all using (true) with check (true);

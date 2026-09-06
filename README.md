# Le souper de la semaine

Planificateur de soupers pour le gardiennage, avec approbation des parents, bibliothèque de plats et liste d'épicerie — partagé en temps réel via Supabase.

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com), crée un compte gratuit et un nouveau projet.
2. Une fois le projet créé, va dans **SQL Editor** (menu de gauche) > **New query**.
3. Colle tout le contenu du fichier `supabase_schema.sql` (fourni dans ce projet) et clique **Run**.
4. Va dans **Project Settings > API**. Note :
   - `Project URL` → deviendra `VITE_SUPABASE_URL`
   - `anon public` key → deviendra `VITE_SUPABASE_ANON_KEY`

⚠️ **Sécurité** : ce schéma autorise n'importe qui possédant la clé `anon` (visible dans le code du site, c'est normal) à lire et modifier toutes les données. C'est adapté à une app familiale partagée par lien, pas à des données sensibles.

## 2. Configurer le projet localement

```bash
cp .env.example .env
```

Puis ouvre `.env` et remplace les valeurs par celles de ton projet Supabase.

```bash
npm install
npm run dev
```

Ouvre l'adresse affichée (ex. http://localhost:5173) pour tester.

## 3. Mettre le code sur GitHub

```bash
git init
git add .
git commit -m "Premier envoi : planificateur de soupers"
```

Sur [github.com](https://github.com), crée un nouveau repository (vide, sans README). Puis :

```bash
git remote add origin https://github.com/TON-NOM-UTILISATEUR/TON-REPO.git
git branch -M main
git push -u origin main
```

## 4. Héberger l'app pour que tout le monde puisse l'utiliser en tout temps

Le plus simple et gratuit : **Vercel** ou **Netlify**.

### Avec Vercel
1. Va sur [vercel.com](https://vercel.com), connecte ton compte GitHub.
2. « Add New Project » → choisis ton repo.
3. Dans les réglages du projet, ajoute les variables d'environnement :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Déploie. Tu obtiens une URL publique (ex. `ton-app.vercel.app`) utilisable par tout le monde, en tout temps, sur mobile ou ordinateur.

Chaque fois que tu pousses du code sur GitHub, le site se met à jour automatiquement.

## 5. Utilisation quotidienne

- Ouvre l'URL publique et ajoute-la à l'écran d'accueil du téléphone (ça s'ouvre alors comme une app).
- Tous ceux qui ont le lien voient les mêmes données, mises à jour en direct (grâce à Supabase Realtime) — pas besoin de rafraîchir la page.

## Structure du projet

```
src/App.jsx            → toute l'interface et la logique
src/supabaseClient.js   → connexion à Supabase
supabase_schema.sql     → schéma de base de données à exécuter une fois dans Supabase
.env.example            → modèle pour tes clés Supabase (ne jamais commit le vrai .env)
```

<!-- deploy-trigger: 2026-09-06T16:29:00Z -->

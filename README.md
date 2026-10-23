# Bess Sök — veille maritime personnelle

Application de prospection maritime React/Vite en TypeScript. La carte Mapbox affiche les positions AIS fournies par un relais privé hébergé sur Render. Les fiches prospects sont synchronisées entre appareils avec Supabase; les documents personnels restent dans le navigateur.

## Démarrer

Prérequis : Node.js 20 ou supérieur et pnpm.

```powershell
pnpm install
Copy-Item .env.example .env.local
# Renseigner les variables VITE_* décrites ci-dessous
pnpm dev
```

Ouvre l’adresse locale affichée par Vite. `pnpm typecheck` vérifie les types TypeScript et `pnpm build` lance cette vérification avant de compiler l’application pour la production.

## Configuration des services

Copie `.env.example` vers `.env.local` et renseigne les clés du frontend :

- `VITE_MAPBOX_TOKEN` : jeton public Mapbox `pk.*`, limité aux styles, tuiles et polices nécessaires et restreint aux domaines utilisés.
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` : URL du projet et clé publique Supabase. La clé frontend n’est pas un secret; l’accès aux prospects est protégé par les politiques RLS de la migration.
- `VITE_AIS_RELAY_URL` : URL du relais Render, par exemple `wss://bess-sok-ais-relay.onrender.com` en production.

Dans Supabase, exécute `supabase/migrations/202610210001_create_prospects.sql`, active le fournisseur d’authentification e-mail, puis ajoute l’URL GitHub Pages et l’URL locale aux URL autorisées. Les utilisateurs créent leur compte depuis l’écran de connexion de l’application.

Le relais est défini dans `render.yaml`. Son installation utilise le lockfile npm dédié de `server/`, indépendamment du workspace pnpm du frontend. Le relais s’abonne à AISStream avec une bounding box `[15.5, -19.5]` → `[-6.5, 12.5]` en coordonnées `[latitude, longitude]`, sous la forme `BoundingBoxes: [[[15.5, -19.5], [-6.5, 12.5]]]` attendue par AISStream : `BoundingBoxes` est une liste de boîtes, chaque boîte étant une liste de deux coins `[latitude, longitude]`. Le coin nord-ouest `[15.5, -19.5]` vient en premier, le coin sud-est `[-6.5, 12.5]` en second. Il filtre aussi les positions reçues dans ces limites. Configure ses variables privées :

- `AISSTREAM_API_KEY` : clé AISStream, uniquement côté Render.
- `SUPABASE_URL` et `SUPABASE_ANON_KEY` : mêmes valeurs Supabase que le frontend; le relais valide les sessions utilisateurs avant de créer un ticket WebSocket à usage unique.
- `FRONTEND_ORIGINS` : origines exactes autorisées, séparées par des virgules. Garde l’origine GitHub Pages et les origines locales utiles.

Dans les paramètres du dépôt GitHub, ajoute `VITE_MAPBOX_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` comme secrets Actions, et `VITE_AIS_RELAY_URL` comme variable Actions. GitHub Pages est recompilé par le workflow à chaque push sur `main`/`master` ou par lancement manuel.

Ne place jamais la clé AISStream dans une variable `VITE_*`, dans GitHub Pages ou dans le dépôt.

## Simulateur autonome

La page `public/maritime-demo.html` est une démonstration Leaflet autonome à ouvrir depuis `/maritime-demo.html`. Elle anime six navires fictifs sur des routes maritimes distinctes depuis Dakar, Abidjan, Tema, Lagos et Douala, en couvrant le golfe de Guinée et l’Atlantique Sud jusqu’à Pointe-Noire, puis au retour. Les routes et positions sont affichées ensemble sur la carte. La page propose pause, réglage de vitesse, copie et téléchargement du HTML. Un bandeau indique explicitement que les données sont simulées; ces positions ne sont pas des données AIS et ne sont pas enregistrables comme prospects. Le lien « Radar AIS réel » ouvre l’application authentifiée. Le radar de zone y place les latitudes et longitudes reçues en temps réel du flux AISStream via le relais sécurisé et indique les coordonnées de chaque navire. Il s’agit d’une visualisation de données AIS et non d’un radar de navigation certifié. La clé fournisseur reste uniquement sur Render et n’est jamais saisie dans le fichier HTML.

## Zone de suivi AIS

Le relais et la carte utilisent le rectangle AISStream `[15.5, -19.5]` → `[-6.5, 12.5]` (coins nord-ouest et sud-est, format `[latitude, longitude]`). Il couvre les approches de Dakar et la chaîne des ports jusqu’à Pointe-Noire : Dakar, Abidjan, Tema, Lomé, Cotonou, Lagos, Onne, Douala, Libreville, Port-Gentil et Pointe-Noire. C’est une bounding box, pas une frontière côtière; la couverture, la fraîcheur et la disponibilité dépendent des stations AIS, du fournisseur et de ses quotas. L’application indique les interruptions et signale l’absence de nouvelle position après deux minutes.

La carte utilise le style clair Mapbox Light v11. Sans jeton Mapbox ou sans configuration des services, l’application indique le service indisponible plutôt que d’afficher de fausses positions AIS.

Tailwind CSS v3 est configuré avec PostCSS et Autoprefixer. Les fichiers de configuration sont déjà présents; il n’est pas nécessaire de relancer `tailwindcss init`.

## Documents personnels

La bibliothèque permet d’ajouter, consulter et supprimer des documents classés par identité, véhicule, assurance, abonnement ou autre. Elle est conservée dans le stockage local du navigateur et n’est pas synchronisée. La migration depuis l’ancienne clé de stockage conserve les données enregistrées sur cet appareil.

La carte Mapbox et ses tuiles nécessitent une connexion Internet et restent soumises aux conditions et quotas du compte Mapbox.

# Bess Sök — veille maritime personnelle

Application web React/Vite en TypeScript avec carte Mapbox GL, recherche, filtres par type de navire, radar visuel de démonstration et bibliothèque personnelle de documents maritimes.

## Démarrer

Prérequis : Node.js et pnpm.

```powershell
pnpm install
Copy-Item .env.example .env.local
# Renseigner VITE_MAPBOX_TOKEN dans .env.local
pnpm dev
```

Ouvre l’adresse locale affichée par Vite. `pnpm typecheck` vérifie les types TypeScript et `pnpm build` lance cette vérification avant de compiler l’application pour la production.

## Carte Mapbox

La carte utilise le style clair Mapbox Light v11, avec un fond pâle et une eau discrètement bleutée. Pour l’afficher, crée un jeton public dans ton compte Mapbox, puis renseigne `VITE_MAPBOX_TOKEN` dans `.env.local` à la racine du projet. Le fichier `.env.local` est ignoré par Git. Ne place pas un jeton dans le code ou dans un fichier commité.

Un jeton préfixé par `pk.` est un jeton public : il sera visible par les visiteurs dans le navigateur et dans le bundle. Dans les paramètres Mapbox, limite ses permissions à la lecture des styles, tuiles et polices nécessaires, puis restreins les URL autorisées à tes origines de développement et de production. Sans jeton configuré, l’application affiche un message dans la zone de carte.

Tailwind CSS v3 est configuré avec PostCSS et Autoprefixer. Les fichiers de configuration sont déjà présents ; il n’est pas nécessaire de relancer `tailwindcss init`.

## Documents maritimes

La bibliothèque permet d’ajouter, consulter et supprimer des documents personnels classés par identité, véhicule, assurance, abonnement ou autre. Chaque document comprend un nom, une catégorie, une date d’expiration obligatoire et des notes facultatives. Les documents sont conservés dans le stockage local du navigateur, sans envoi vers un serveur.

Les types et composants sont organisés dans `src/types/document.ts`, `src/components/`, `src/hooks/useDocuments.ts` et `src/App.tsx`. Le modèle de données de documents utilise la clé de stockage v2, sans écraser les éventuelles données sauvegardées avec le modèle précédent.

## Données

Les six navires, leurs positions, leurs caractéristiques et les échos du radar sont fictifs. Le prototype n’accède pas à l’AIS et ne réalise aucune détection réelle. Une source AIS et les autorisations/API nécessaires devront être choisies avant d’afficher du trafic en direct.

La carte Mapbox et ses tuiles nécessitent une connexion Internet. Le chargement du style et des données cartographiques est soumis aux conditions et quotas du compte Mapbox.

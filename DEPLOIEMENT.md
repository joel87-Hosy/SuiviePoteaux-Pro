# Deploiement SuiviPoteaux Pro

L'application contient deux parties :

- `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg` : frontend PWA.
- `server.js`, `data/`, `uploads/` : backend Node.js et stockage.

## Pourquoi `/api/auth/login` fait 404 ou 405

Cette erreur arrive quand le lien distant heberge seulement les fichiers statiques.
Dans ce cas, `index.html` existe, mais `server.js` ne tourne pas. Le navigateur appelle donc :

```text
https://votre-domaine/api/auth/login
```

et l'hebergeur repond `404` ou `405`, car aucune API Node n'est active.

## Option recommandee : deployer tout le projet sur un hebergeur Node

Utiliser Render, Railway, Fly.io, un VPS, ou tout service qui lance :

```bash
node server.js
```

Commande de demarrage :

```bash
npm start
```

Port :

```text
PORT
```

Le backend sert aussi le frontend, donc l'URL publique du service Node suffit.

## Activation Supabase

Pour utiliser une vraie base de donnees et un stockage photo persistant, suivre `SUPABASE.md`.

Variables Render a ajouter :

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

## Option separee : frontend statique + backend ailleurs

1. Deployer `server.js` sur un hebergeur Node.
2. Recuperer son URL publique, par exemple :

```text
https://suivi-poteaux-api.onrender.com
```

3. Dans `config.js`, remplacer :

```js
window.SUIVI_API_BASE = window.SUIVI_API_BASE || `${window.location.origin}/api`;
```

par :

```js
window.SUIVI_API_BASE = "https://suivi-poteaux-api.onrender.com/api";
```

4. Redeposer le frontend statique.

## Apres mise a jour

Si l'ancienne version reste affichee, vider le cache PWA :

```text
F12 -> Application -> Service Workers -> Unregister
F12 -> Application -> Storage -> Clear site data
```

# Migration Supabase - SuiviPoteaux Pro

## 1. Creer le projet Supabase

Dans Supabase :

1. Creer un nouveau projet.
2. Ouvrir `SQL Editor`.
3. Coller et executer le fichier `supabase-schema.sql`.
4. Aller dans `Storage`.
5. Creer un bucket public :

```text
pole-photos
```

## 2. Variables Render

Dans Render, service `suiviepoteaux-pro` :

```text
Environment
→ Add Environment Variable
```

Ajouter :

```text
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx
SUPABASE_STORAGE_BUCKET=pole-photos
```

Important : utiliser la `service_role key` uniquement dans Render/backend.
Ne jamais la mettre dans `config.js` ni dans le frontend.

## 3. Redeployer

Sur Render :

```text
Manual Deploy → Deploy latest commit
```

Puis tester :

```text
https://votre-service.onrender.com/api/health
```

## 4. Comptes demo

Apres execution du SQL :

```text
admin@itc.local / demo123
depot@itc.local / demo123
terrain@itc.local / demo123
controle@itc.local / demo123
```

## 5. Mode fallback

Si les variables Supabase ne sont pas presentes, le backend continue d'utiliser :

```text
data/db.json
uploads/
```

Ce mode est utile en local, mais il ne doit pas etre utilise comme stockage final en production.

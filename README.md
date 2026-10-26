# Calé : on se voit quand ?

Trouver une date avec ses potes, sans compte et sans appli.

1. **L'organisateur** donne un nom à la sortie et tape sur les dates qui l'arrangent (ou utilise un raccourci : « Vendredis & samedis », « Les week-ends du mois »…).
2. **Il envoie le lien** sur le groupe (bouton WhatsApp ou partage natif du téléphone).
3. **Chaque ami** ouvre le lien, tape son prénom, puis tape sur les jours où il est dispo. Tout s'enregistre tout seul.
4. **La meilleure date** s'affiche en direct en haut de la page. L'organisateur la valide en un clic, et tout le monde peut l'ajouter à son agenda.

## Déployer sur Vercel (environ 5 minutes)

1. Mets ce dossier sur un dépôt GitHub (privé ou public).
2. Sur [vercel.com/new](https://vercel.com/new), importe le dépôt. Vercel détecte Next.js tout seul, donc rien à configurer.
3. Ajoute la base de données (gratuite) :
   - Dans ton projet Vercel → onglet **Storage** → **Create Database** → **Upstash for Redis** (Marketplace) → plan **Free**.
   - Connecte-la au projet. Les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` sont ajoutées automatiquement.
4. **Redeploy** (onglet Deployments → ⋯ → Redeploy) pour que les variables soient prises en compte.

C'est en ligne.

> Sans base Redis, l'app fonctionne mais garde les données en mémoire : elles disparaissent à chaque redémarrage. C'est pratique en local, mais pas en production.

Les variables `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` sont aussi acceptées si tu crées la base directement sur upstash.com.

## En local

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Détails techniques

- Next.js 16 (App Router) + TypeScript, aucun framework CSS (un seul `app/globals.css`, mode sombre inclus).
- Stockage : une clé Redis par sondage + un hash des participants (les écritures simultanées ne s'écrasent pas). Les sondages expirent après 120 jours d'inactivité.
- Identité sans compte : un identifiant aléatoire est gardé dans le navigateur. Sur un autre appareil, on tape sur son prénom pour retrouver ses réponses.
- Organisateur : un jeton secret, gardé dans son navigateur, permet de valider la date. Le « lien organisateur » (`/e/<id>#admin=<jeton>`) permet de le récupérer sur un autre appareil.
- La page se met à jour toute seule toutes les 7 secondes quand elle est visible.

```
app/
  page.tsx                    accueil + création
  e/[id]/page.tsx             page du sondage (aperçu de lien WhatsApp inclus)
  api/events/route.ts         POST  créer un sondage
  api/events/[id]/route.ts    GET   lire un sondage
  api/events/[id]/vote/       PUT   enregistrer ses dispos
  api/events/[id]/final/      POST  valider la date (organisateur)
components/                   CreateForm, EventClient, Avatars, Brand
lib/                          store (Redis), dates, ranking, client utils
```

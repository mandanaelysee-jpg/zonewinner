# Configuration de l’espace membre ZoneWinner

## Fichiers ajoutés
- `connexion.html` : connexion, inscription, réinitialisation de mot de passe et widget Turnstile.
- `espace-membre.html` : tableau de bord de base réservé aux utilisateurs connectés.
- `auth-config.js` : paramètres publics à renseigner.
- La page d’accueil comporte un lien vers l’espace membre.

## Étape 1 — Supabase
1. Crée un projet dans https://supabase.com/ (ou utilise ton projet existant).
2. Dans Project Settings / API, copie l’URL du projet et la clé publique (publishable/anon).
3. Remplace les deux valeurs correspondantes dans `auth-config.js`.
4. Dans Authentication, active la confirmation par e-mail.
5. Dans Authentication / URL Configuration, configure l’URL de production du site et ajoute les URL de redirection autorisées pour `/espace-membre.html` et `/reinitialiser-mot-de-passe.html`.
6. Dans Authentication / Bot and Abuse Protection, active CAPTCHA et choisis Cloudflare Turnstile.

## Étape 2 — Cloudflare Turnstile
1. Crée un widget Turnstile sur https://dash.cloudflare.com/ et ajoute le hostname `zonewinner-cm.netlify.app` (sans `https://` ni chemin) dans Hostname Management. Si un autre domaine sert le site, ajoute aussi ce hostname.
2. La Site Key publique est déjà renseignée dans `auth-config.js` sur la branche `security-hardening`. Vérifie dans Cloudflare que le widget autorise bien `zonewinner-cm.netlify.app`.
3. Copie la **secret key** uniquement dans les paramètres CAPTCHA du tableau de bord Supabase. Ne la mets jamais dans GitHub ni dans `auth-config.js`.

## Étape 3 — Déploiement et tests
- Publie la branche sur un déploiement de prévisualisation Netlify.
- Teste inscription, e-mail de confirmation, connexion, CAPTCHA invalide/expiré, récupération du mot de passe et déconnexion.
- Configure une URL réelle de récupération pointant vers `reinitialiser-mot-de-passe.html` avant d’activer le parcours « mot de passe oublié » en production.
- Ne place aucune donnée sensible dans une page HTML statique : l’authentification côté navigateur ne protège pas le contenu statique lui-même. Toute donnée privée devra être fournie par Supabase avec des politiques RLS restrictives ou par une fonction serveur qui vérifie la session.

## Important
Cette branche contient le squelette d’interface, pas un service prêt pour la production : il faut encore renseigner les clés publiques, configurer Supabase et Turnstile, ajouter la page de changement de mot de passe et effectuer les tests de bout en bout. Aucun secret ne doit être envoyé dans le chat.

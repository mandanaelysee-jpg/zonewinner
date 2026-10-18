# ZoneWinner — préparation de l’automatisation des résultats

Cette fonctionnalité est volontairement **désactivée tant que l’administrateur n’a pas installé la migration, configuré les secrets et activé une planification**. Ne jamais mettre une clé API ou une clé service-role dans le frontend.

## Fichiers concernés
- `supabase/results-automation-setup.sql` : ajoute les champs de mapping et de contrôle. Les anciens pronostics restent en `manual_review` / `needs_mapping`.
- `supabase/functions/settle-results/index.ts` : fonction serveur qui interroge API-Football et ne règle que les pronostics explicitement prêts.
- `admin.html` : formulaire pour choisir le marché, la sélection, les équipes et l'identifiant du match API-Football.

## Mise en place dans le projet de test

1. Dans Supabase > SQL Editor, exécuter d'abord les scripts déjà utilisés par le projet si ce n'est pas fait, puis exécuter `supabase/results-automation-setup.sql`.
2. Déployer la fonction Edge `settle-results` depuis cette branche de test.
3. Dans Supabase > Edge Functions > Secrets, définir :
   - `API_FOOTBALL_KEY` : clé API-Football privée.
   - `ZONEWINNER_CRON_SECRET` : secret aléatoire long, à garder privé.
   - `PROJECT_URL` : URL du projet Supabase (par exemple `https://<project-ref>.supabase.co`).
   - `PROJECT_SERVICE_ROLE_KEY` : clé serveur du projet Supabase. Supabase réserve le préfixe `SUPABASE_` pour ses propres variables ; la fonction lit donc ces noms personnalisés. Ne jamais les mettre dans `auth-config.js`, GitHub ou le navigateur.
4. Tester manuellement la fonction avec une requête POST et l'en-tête `x-zonewinner-cron-secret`. La réponse indique `checked`, `settled`, `review`, `waiting` et `errors`.
5. Seulement après validation des tests, configurer Supabase Cron / pg_cron pour appeler la fonction à intervalles réguliers, par exemple toutes les 30 minutes. Conserver la clé API et le secret uniquement côté serveur.

## Règles de sécurité

- L'automatisation ne traite que les pronostics publiés, au statut `pending`, avec un identifiant de fixture et `result_review_status = ready_to_settle`.
- Vérifier le nom exact de l'équipe à domicile et de l'équipe à l'extérieur avant tout calcul.
- La version initiale ne règle automatiquement que le statut API `FT` (fin du temps réglementaire). Prolongations, tirs au but, report, annulation, forfait, noms divergents et marchés non reconnus passent en vérification manuelle.
- Les types et sélections acceptés sont : `match_result` avec `home`/`draw`/`away` ; `double_chance` avec `1x`/`x2`/`12` ; `over_under` avec `over_2_5`, `under_3_5`, etc. ; `both_teams_score` avec `yes`/`no` ; `exact_score` avec `2-1`.
- Les seuils `over_under` sont stricts ; une égalité exacte au seuil doit être définie explicitement comme un marché asiatique si nécessaire, sinon passer en vérification manuelle.
- La fonction utilise un service-role côté serveur pour écrire dans Supabase ; ne pas appeler cette fonction directement depuis la page web. L'appel planifié doit être côté serveur.
- Aucune fusion ni mise en production n'est autorisée par ce guide. Vérifier d'abord avec des matchs de test.

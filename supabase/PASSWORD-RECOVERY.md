# Récupération des accès — RestoManager V3

## Principe

Les mots de passe **ne sont jamais consultables**, même par un administrateur. Une perte d'accès se résout par une **réinitialisation**, pas par la récupération de l'ancien mot de passe.

La page `login.html` affiche désormais « Mot de passe oublié ? » et les instructions de contact. **Ce bouton ne lance pas encore une réinitialisation automatique.**

## Procédure provisoire (avant l'interface d'administration)

1. Le responsable habilité ouvre le projet Supabase et s'authentifie avec son compte d'administration du projet (et MFA si disponible).
2. Il identifie le bon compte dans **Authentication → Users**.
3. Il effectue une réinitialisation du mot de passe via un mécanisme d'administration sécurisé (interface ou API d'administration côté serveur).
4. Il communique le nouveau mot de passe par un canal approprié, sans l'inscrire dans GitHub ou ChatGPT.
5. Il révoque les sessions actives si l'accès précédent est suspecté compromis et consigne l'opération.

## Évolution prévue

Ajouter dans l'espace F&B une action « Réinitialiser le mot de passe Réception ». Elle doit appeler une **Edge Function côté serveur** utilisant une clé secrète stockée exclusivement dans les secrets Supabase, vérifier un JWT valide et le rôle `fb_admin` côté serveur, exiger une réauthentification récente/MFA selon la politique choisie, limiter les tentatives et produire un journal d'audit. Ne jamais confier la clé `service_role` au navigateur, ni utiliser un simple code PIN statique comme unique preuve d'identité.

Le compte F&B ne doit pas pouvoir se réinitialiser lui-même par une procédure reposant uniquement sur sa session perdue : prévoir une récupération de secours par un administrateur du projet Supabase.

**À ne pas faire :** conserver les mots de passe en clair, les afficher à l'administrateur, ou ajouter un code maître universel dans le JavaScript.

La branche GitHub Pages officielle n'est pas modifiée.

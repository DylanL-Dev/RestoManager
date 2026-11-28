# RM-RELEASE-03 B4 — Connexion Réception sur DEV

Le parcours mobile sur Render DEV a ouvert l’espace Restaurant du laboratoire QA. Le formulaire a refusé le compte individuel Réception après validation des identifiants. Une lecture du profil sur Supabase DEV confirme son rôle Réception actif et son rattachement au laboratoire.

Le script publié au commit `8756be9` attribue le rôle `fb_admin` aux adresses saisies en entier sur DEV, puis exige ce rôle dans le profil authentifié. Le correctif consulte le profil actif du compte identifié par Supabase et accepte les deux rôles d’équipe, `reception` et `fb_admin`, pour ce mode de connexion sur DEV. Les alias continuent de désigner leur compte et leur rôle précis. Les adresses individuelles restent limitées à DEV. La version du lien vers le script de connexion change pour renouveler la ressource dans le navigateur.

Les tests locaux exercent le formulaire avec des réponses Auth et profil simulées. Ils couvrent les deux rôles par e-mail sur DEV, les deux alias et leurs rôles, un profil inactif, un rôle inconnu, un profil inaccessible, un refus d’Auth et le contrôle du canal de publication. Le test existant de la page contrôle ses points d’entrée et l’accessibilité du formulaire. La vérification de syntaxe passe sur 298 fichiers et les 511 tests unitaires passent.

Pour la recette hébergée, confirmer le commit LIVE sur Render DEV puis refaire les connexions Restaurant et Réception dans des sessions indépendantes. Vérifier le rôle et le laboratoire affichés avant toute action de service. La recette B4 reste ouverte jusqu’aux essais de synchronisation, de concurrence et de reprise de session sur DEV. Le laboratoire doit aussi être configuré pour les essais de fusion et de réservation en ligne.

Le périmètre du correctif est le formulaire de connexion. Le retour à la version précédente consiste à rétablir le module et son lien de version en republiant le candidat de retour sur DEV après validation. Le correctif ne requiert aucune migration SQL.

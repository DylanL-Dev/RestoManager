# RM-015.12 — Textes intelligents par établissement (DEV uniquement)

Date de préparation : 22 novembre 2026.

## Problème constaté

Le modèle proposé dans Gestion → Réservations en ligne contenait toujours une référence au parcours hôtel, y compris lorsque l’établissement indépendant ne proposait pas ce parcours. Les textes enregistrés en Supabase étaient déjà stockés séparément par `restaurant_id`; il ne faut pas les migrer ni les remplacer.

## Comportement attendu

- **Restaurant indépendant** (option `hotelGuestsEnabled` désactivée ou absente) : modèle de confidentialité neutre, sans chambre, séjour ni parcours Hôtel/Extérieur.
- **Restaurant d’hôtel** (option activée) : ajouter une explication spécifique sur le parcours hôtel et la donnée éventuelle de chambre, sans annoncer qu’une chambre est toujours obligatoire.
- Le nom visible de l’établissement est utilisé pour le modèle proposé, sans copier le nom ni le contact du Mercure Rouen. L’exemple du champ de lien est neutre (« Nom de votre restaurant »), et ne cite plus À l’Épicerie.
- Le texte de confidentialité sauvegardé, les conditions d’annulation et le contact RGPD enregistrés restent **inchangés** jusqu’à une action explicite de l’utilisateur puis « Enregistrer les réglages ».
- Quand l’option Hôtel change, seul un *modèle strictement non personnalisé* est régénéré, en préservant la durée de conservation renseignée. Un texte libre ou déjà enregistré ne doit jamais être écrasé automatiquement. Un avertissement demande de le relire.
- Bouton « Utiliser les textes proposés » : conserve la confirmation en cas de remplacement et n’enregistre rien sans l’action finale.
- Durée réelle de conservation et contact RGPD restent propres à l’établissement. Les marqueurs `[À COMPLÉTER]` interdisent l’ouverture tant que le texte n’est pas adapté. Aucun délai d’effacement automatique n’est inventé.
- Les textes d’annulation conservent la logique actuelle de confirmation des groupes de 4 personnes : c’est une règle du backend RM-015, pas une particularité de l’hôtel.
- Aucun ajustement de capacité, de disponibilité ou de réservation.

## Fichiers

`service-v3-publication-model.js` (modèles), `service-v3-public-booking.js` (formulaire de Gestion), `tests/rm01512-legal-templates.test.cjs` (tests de régression).

## Recette recommandée en environnement isolé

1. Restaurant indépendant sans réglages : modèle neutre, nom local, contact et conservation à compléter.
2. Activer « Client de l’hôtel » : seuls les modèles non modifiés suivent le nouveau parcours.
3. Remplir la durée de conservation, écrire un paragraphe personnalisé ; basculer le mode : le paragraphe persiste.
4. Modifier le contact, les annulations et le nom public : aucune valeur de l’établissement A n’est affichée pour B.
5. Recharger avec des textes déjà sauvegardés : leurs valeurs prévalent toujours sur les modèles.
6. Ne pas déclencher d’écriture Supabase PROD, ne pas fusionner V3/MAIN et ne pas toucher aux réservations ni au portail en service.

Ces modèles aident à la saisie mais ne constituent pas un avis juridique. Chaque exploitant reste responsable de l’exactitude des informations publiées.

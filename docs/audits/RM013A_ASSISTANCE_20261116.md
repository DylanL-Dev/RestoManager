# RM-013-A — Assistance harmonisée, 16 novembre 2026

Demande utilisateur avant publication de RM-013-A vers V3 et MAIN : remplacer « Contacter le créateur » par « Assistance » et refaire le formulaire selon le style de l’application.

## Résultat

La rubrique s’intitule Assistance. Les choix Problème, Assistance et Suggestion sont intégrés au formulaire, avec les icônes locales de l’application. La priorité Normale/Urgente suit la même présentation. Les anciennes fenêtres de sélection Annuler/Valider ne sont plus ouvertes pour ces champs.

Sujet, contact facultatif et message utilisent des champs cohérents avec les autres écrans. Le rappel de confidentialité, le bouton d’envoi et les retours d’état sont harmonisés. La mise en page passe à une colonne sur téléphone et répartit les contrôles sur les écrans larges ; mode sombre et clavier conservés.

## Comportement préservé

- Les enums envoyés restent `bug`, `question`, `suggestion` et `normal`, `urgent` ; « Assistance » est le nouveau libellé du type `question`.
- Même table `platform_reports`, même vérification `auth.getUser()`, même établissement et rôle authentifiés, aucun accès de lecture aux signalements pour les employés.
- Aucun changement de droits, RLS, migration, données ou destination des messages. Aucun message d’essai adressé à l’assistance réelle.
- Les limites des champs, la validation, la prévention du double envoi, la conservation d’une saisie après échec et la remise à zéro après succès restent actives.

## Validation technique

- `npm run test:syntax` : 134 fichiers, zéro erreur.
- `npm test` : 51 fichiers de tests passent.
- `npm run test:assistance:browser` : 14 combinaisons, Restaurant/Réception × 360/390/430/768/1024/1440/1920, zéro erreur de page.
- La nouvelle suite couvre les cartes, le clavier, les enums, la validation d’un formulaire vide, la conservation au repli, l’échec et la relance d’envoi, les champs exacts transmis et le retour aux choix par défaut après succès.
- `npm run test:mission3:browser` : 110 scénarios passent.
- Les requêtes distantes sont bloquées, la frontière du service est simulée en mémoire. Aucun envoi, réservation ou clôture réelle utilisé pour la recette.

Captures limitées à la fenêtre du navigateur, avec données fictives :

| Format | Clair | Sombre |
| --- | --- | --- |
| Mobile 390 | [Capture](preuves/rm013a-assistance/assistance-390.png) | [Capture](preuves/rm013a-assistance/assistance-390-dark.png) |
| Tablette 768 | [Capture](preuves/rm013a-assistance/assistance-768.png) | [Capture](preuves/rm013a-assistance/assistance-768-dark.png) |
| PC 1440 | [Capture](preuves/rm013a-assistance/assistance-1440.png) | [Capture](preuves/rm013a-assistance/assistance-1440-dark.png) |

[Journaux et matrice](preuves/rm013a-assistance/). Les contrôles GitHub ciblent DEV, V3 et MAIN avec les mêmes scénarios isolés.

## Livraison

La version du formulaire, du module authentifié et du CSS est `20261116-rm013a3`. Le cache PWA contient le module Assistance. La livraison vers V3/MAIN est ciblée sur les interfaces validées de RM-013-A et ce formulaire, avec conservation des fichiers de connexion et dépendances propres à la production ; aucune fusion globale de DEV, aucun SQL ni routage DEV transmis.

### Publication vérifiée

La livraison a été fusionnée dans l’ordre DEV [#154](https://github.com/DylanL-Dev/RestoManager/pull/154), V3 [#155](https://github.com/DylanL-Dev/RestoManager/pull/155), puis MAIN [#156](https://github.com/DylanL-Dev/RestoManager/pull/156). Les workflows du paquet final sont verts. Render DEV est LIVE et GitHub Pages sert la version `20261116-rm013a3` ; le HTML et les ressources contrôlées correspondent aux fichiers de la livraison. [Empreintes et références exactes](preuves/rm013a-publication-20261116.json). Aucune modification Supabase PROD ni écriture de test distante.

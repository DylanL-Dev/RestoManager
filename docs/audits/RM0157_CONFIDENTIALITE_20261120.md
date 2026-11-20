# RM-015.7 — Confidentialité et conditions du portail

Demande : « Met à jour tout ce qui et confidentialité ect », puis « utilise les informations de l’hôtel ». Périmètre DEV. Branche `feature/rm015-privacy-conditions`, issue de DEV `eaf47862ddfdd60972f5f671da3cd35750031555`, sauvegardé sur `backup/rm015-privacy-before-20261120` avant modification.

## Informations actualisées

La notice explique le responsable du traitement, la réservation demandée et la base contractuelle/précontractuelle, la protection anti-abus et son intérêt légitime, les champs obligatoires/facultatifs, les personnes et prestataires habilités, l’empreinte IP, le lien personnel, le stockage technique de session sans coordonnées, les droits et le recours à la CNIL. L’expiration du lien ne prétend pas supprimer les données. Google Maps est identifié comme service extérieur ouvert uniquement à la demande.

Le champ facultatif de demandes particulières invite à contacter directement le restaurant pour une allergie ou un besoin médical. La case de validation distingue l’acceptation des conditions de réservation de la lecture des informations de confidentialité. Aucune inscription marketing ni nouveau traitement publicitaire n’est ajouté.

Les conditions décrivent la confirmation effective, les demandes de quatre personnes ou plus, l’échéance, la revalidation d’une modification et la conservation de la réservation initiale en cas de refus/expiration d’une proposition. Le délai d’annulation reste issu du réglage actuel. Aucune nouvelle règle de paiement, pénalité, capacité ou horaire n’est inventée.

Dans Gestion, le contact accepte plusieurs lignes ; les textes personnalisés restent inchangés tant que le Restaurant ne demande pas leur remplacement. Le remplacement par les modèles garde sa confirmation, le contact et la durée déjà saisis. Un contact composé uniquement de zéros est signalé avant l’enregistrement d’un portail ouvert.

La fenêtre publique utilise des paragraphes et sous-titres lisibles, une carte de contact, des liens email/téléphone validés, Échap et le retour du focus. Les données sont construites avec `textContent`, sans interpréter du HTML fourni par un établissement. La démonstration distingue désormais son stockage local du portail connecté existant.

## Contact de l’hôtel vérifié

Source officielle consultée le 20/11/2026 : [Accor — Mercure Rouen Centre Champ-de-Mars, hôtel 1273](https://all.accor.com/hotel/1273/index.fr.shtml), rubrique Localisation/contact.

- Email : **h1273@accor.com**.
- Téléphone : **+33 2 35 52 42 32**.
- Adresse : **12 bis avenue Aristide Briand, 76000 Rouen**.

Ces informations remplacent le contact provisoire « 0000000 » dans la configuration DEV de l’établissement existant `a-lepicerie-rouen`, conformément à la réponse utilisateur. Elles ne sont pas codées dans les modèles multi-établissements. Elles servent de point de contact de l’hôtel ; aucun DPO ou identité juridique supplémentaire n’est inventé.

## Mise à jour de contenu DEV

Aucune migration de schéma, aucune modification de RLS, secret, fonction API ou réglage email. Une mise à jour administrative de contenu est préparée pour l’établissement précis : `privacy_notice`, `privacy_contact` et `cancellation_notice` uniquement. Elle emploie le même verrou de restaurant que les opérations normales, exige la version et les anciens textes attendus, incrémente la version et conserve un audit système avec ancien/nouveau contenu et autorisation utilisateur. Elle n’usurpe aucun compte salarié.

Tous les autres réglages doivent conserver leur empreinte avant/après ; aucune réservation, table, clôture ou heure de service ne doit être modifiée. Le texte et le contact sont des contenus réellement demandés, pas des données d’essai. L’exécution et la preuve du déploiement sont consignées dans la PR après la validation CI.

La durée déjà saisie, **30 jours**, est conservée. Cette mise à jour n’ajoute aucun effacement automatique : le texte de Gestion le précise. La mise en œuvre opérationnelle de cette conservation reste une tâche de l’établissement et du produit, à traiter avant publication officielle. Aucune purge de données réelles n’est lancée.

## Vérifications

- 304 cas unitaires et 63 fichiers `npm test` réussis ; 192 fichiers contrôlés sans erreur de syntaxe.
- Builds public démo/connecté : 8/15 assets autorisés, sans dashboard ni secret ajouté à l’artefact public.
- Parcours ciblé : 7 scénarios sur 360, 390, 430, 768, 1024, 1440 et 1920 px ; 21 audits axe sans violation des règles exécutées. Contrôles des contacts multilignes, des liens sûrs, d’un texte malveillant non interprété, du clavier, du focus et de l’absence de réservation créée.
- Captures actualisées sur 390/768/1440, avec les mêmes assertions. Les captures utilisent exclusivement un restaurant, un hôtel et des coordonnées fictifs ; aucune donnée fictive n’est écrite dans Supabase partagé.
- La campagne complète du portail et les régressions RM-012/013/014/016 sont exécutées par les workflows de la PR. Les résultats finaux figurent dans la PR, pas dans une affirmation anticipée ici.

| Format | Confidentialité client | Carte de contact | Conditions client | Gestion |
| --- | --- | --- | --- | --- |
| Mobile 390 | [Voir](preuves/rm0157-20261120/privacy-client-390.png) | [Voir](preuves/rm0157-20261120/privacy-contact-390.png) | [Voir](preuves/rm0157-20261120/booking-conditions-390.png) | [Voir](preuves/rm0157-20261120/privacy-settings-390.png) |
| Tablette 768 | [Voir](preuves/rm0157-20261120/privacy-client-768.png) | [Voir](preuves/rm0157-20261120/privacy-contact-768.png) | [Voir](preuves/rm0157-20261120/booking-conditions-768.png) | [Voir](preuves/rm0157-20261120/privacy-settings-768.png) |
| PC 1440 | [Voir](preuves/rm0157-20261120/privacy-client-1440.png) | [Voir](preuves/rm0157-20261120/privacy-contact-1440.png) | [Voir](preuves/rm0157-20261120/booking-conditions-1440.png) | [Voir](preuves/rm0157-20261120/privacy-settings-1440.png) |

## Recette

Après la livraison, mettre à jour l’application DEV, ouvrir Gestion → Réservations en ligne → Réglages du portail → Conditions et confidentialité, puis ouvrir le lien public enregistré. Consulter les deux boutons du pied de page et ceux du formulaire. Contrôler les contacts officiels et le délai d’annulation inchangé, faire défiler les textes, fermer avec Échap et vérifier le retour au bouton d’origine. Aucune réservation d’essai n’est nécessaire.

Références CNIL : [information et transparence](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence) et [durées de conservation](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees). La consultation de la seconde page a expiré ; les principes de conservation et le fonctionnement réel ont été contrôlés dans le code. Ce travail actualise l’information : il ne constitue pas une certification RGPD ni un test de délivrabilité email. Les transferts et garanties contractuelles des sous-traitants restent à documenter avec l’exploitant avant mise en production.

MAIN, V3 et Supabase PROD restent inchangées. Les emails restent désactivés.

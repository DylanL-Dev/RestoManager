# RM-015.8 — Clients Hôtel et Extérieur dans le portail public

Demande : distinguer les clients hébergés des clients extérieurs dans un portail réutilisable par plusieurs hôtels et restaurants, en attendant la configuration de l’envoi des emails. Branche `feature/rm015-hotel-public-guests`, issue de DEV `bf9d2c7021a5f1ec0676c583949fa1b9790bb749`. Sauvegarde Git poussée avant modification : `backup/rm015-hotel-before-20261120`.

## Parcours livré

Un seul portail par établissement. Lorsque le Restaurant active le parcours Hôtel, le client choisit « Client de l’hôtel » ou « Client extérieur ». Un lien et un QR Hôtel distincts présélectionnent le premier choix ; ils ne contiennent ni chambre, ni coordonnées, ni privilège salarié. Le lien général reste disponible. Le client peut changer son choix avant envoi.

Conformément à la précision utilisateur, **le nom et le numéro de chambre sont obligatoires pour réserver comme client Hôtel**. Le prénom déjà requis reste requis. L’email est masqué temporairement tant que son envoi est désactivé, selon la dernière demande utilisateur. L’option « Je n’ai pas encore mon numéro de chambre » est retirée. Les champs portent une indication obligatoire accessible. Le récapitulatif et le lien personnel affichent la chambre. Les demandes en attente distinguent le profil proposé de la réservation initiale. Un refus ou une expiration restaure le profil initial. La chambre déclarée n’est jamais recherchée dans un annuaire d’autres clients.

Le séjour est **déclaratif** : ce parcours ne vérifie pas l’hébergement et ne constitue pas un accès privilégié. Hôtel et Extérieur restent soumis aux mêmes tables disponibles, horaires, répartition des arrivées, maintiens et contrôles transactionnels du canal Web. À partir de quatre personnes, la validation Restaurant et son délai configuré restent applicables. Une réservation confirmée reste attendue ; aucune installation automatique n’est ajoutée.

Le Restaurant peut corriger le profil d’une réservation Web dans la fiche existante. Cette correction utilise l’API de modification existante, son contrôle de version et ses autorisations serveur. Elle conserve le nom, les consignes internes, les allergies et l’origine Web ; passer à Extérieur retire la chambre. Le lien personnel reflète ensuite la fiche réellement enregistrée. Les droits Réception sur les tables, l’installation, l’approbation des groupes et la configuration ne sont pas étendus.

## Mode temporaire sans email

Le champ email est absent du formulaire, du récapitulatif et de la confirmation lorsque le serveur annonce explicitement `emailRequired: false`. Il est aussi retiré de la démonstration, qui ne préremplit plus d’adresse fictive. Le prénom, le nom et, pour Hôtel, la chambre restent requis ; le téléphone reste facultatif. Le lien personnel sécurisé demeure le moyen de retrouver la réservation.

Le navigateur omet complètement l’email lors d’une nouvelle soumission dans ce mode. PostgreSQL enregistre `null`, sans adresse fictive ni email commun à tous les visiteurs. Aucune tâche d’envoi n’est créée sans destinataire. Le quota par email ne s’applique qu’aux vraies adresses fournies ; les limites IP, défis anti-abus, contrôles de tables, arrivées et idempotence restent conservés. Trois visiteurs sans email ne se bloquent pas sur un quota d’adresse vide partagée.

Une ancienne adresse est conservée lorsqu’un lien personnel modifie la réservation sans la fournir à nouveau ; elle ne s’affiche pas dans le formulaire masqué. Les anciens clients qui soumettent encore une adresse valide restent compatibles. Changer ou supprimer cette ancienne adresse reste interdit par la règle existante. Aucune purge de données réelles n’est lancée.

La politique est privée et appartient au serveur ; aucun paramètre du visiteur ou réglage salarié ne peut la réactiver. Les essais modifient cette fonction uniquement sur PostgreSQL jetable pour vérifier le retour d’un email obligatoire et la première saisie d’une adresse sur une ancienne réservation anonyme. **Cela ne lance aucun envoi** : le verrou du runtime `emailEnabled=false`, le worker et les secrets restent inchangés. L’activation réelle exigera une livraison revue avec l’adresse autorisée, le prestataire, les règles et le consentement adaptés.

Un ancien backend qui ne connaît pas `emailRequired` conserve le formulaire requis, afin de ne pas cacher le champ alors que son API l’exige encore. Les mentions standards de confidentialité s’adaptent au mode effectif ; seuls les passages standards connus sont remplacés à l’affichage, sans écraser les paragraphes juridiques personnalisés. Une notice entièrement personnalisée reste à vérifier par l’établissement avant publication.

La démonstration passe **13 scénarios** aux sept largeurs, incluant l’absence d’appel aux données internes, le refus du stockage et le lien expiré. Le parcours connecté ciblé couvre le mode sans email sur les sept formats, puis le retour simulé du champ et la préservation d’une adresse existante. Un complément de **3 scénarios / 9 audits axe réussis à 390 px** vérifie aussi qu’une ancienne réservation anonyme peut saisir sa première adresse lorsque la collecte est réactivée en simulation ; ce champ devient modifiable uniquement si aucune adresse n’était enregistrée. Les adresses existantes restent en lecture seule. Les résultats de campagne complète sur le dernier commit figurent dans la PR.

## Avant / après

| Situation | Avant | Après |
| --- | --- | --- |
| Réservation publique d’un client hébergé | Profil Extérieur par défaut | Profil Hôtel explicite, origine Web conservée |
| Chambre inconnue au moment de réserver | Pas de parcours dédié | Réservation Hôtel impossible sans chambre ; message explicite |
| QR dans une chambre ou à la réception | Portail général | Même portail avec Hôtel présélectionné |
| Restaurant indépendant | Parcours général | Parcours Extérieur inchangé, mode Hôtel désactivé par défaut |
| Statistiques | Pas de distinction Hôtel déclarée en ligne | Couverts Hôtel et Extérieur distincts, sans double comptage du canal Web |
| Mode Hôtel désactivé après réservation | Sans objet | Ancien QR signale la fermeture ; lien personnel existant reste gérable |

## Architecture et migration préparée

Migration : [`20261120173728_rm015_public_hotel_guests.sql`](../../supabase/migrations/20261120173728_rm015_public_hotel_guests.sql), créée avec Supabase CLI et testée sur PostgreSQL 17 jetable sans réseau.

- Une colonne privée : `private.rm015_settings.hotel_guests_enabled boolean NOT NULL DEFAULT false`.
- Métadonnées déclarées dans le JSON privé existant du contact : `guestType`, `hotelRoom`, `roomPending`.
- Projection vers les champs et marqueurs métier existants : `hotel_room`, Hôtel/Extérieur et `source_channel = web`. Aucune nouvelle table publique ou politique `anon`.
- Mise à jour de huit fonctions existantes, sans changer leurs signatures, propriétaires, droits ou RLS. Une nouvelle fonction privée booléenne `rm015_email_required()` renvoie false et n’est pas exécutable par les clients ni par les salariés. Les permissions temporaires de migration sont retirées dans la transaction.
- Validation stricte côté serveur : types JSON, nom et prénom non vides (espaces, tabulations et retours à la ligne seuls refusés), chambre Hôtel obligatoire de 1 à 20 caractères autorisés, ancien indicateur `roomPending=true` refusé, absence de chambre pour Extérieur, absence d’injection de marqueur métier, activation de l’établissement.
- Les anciens clients qui omettent ces champs conservent le profil réel d’une réservation Hôtel existante. Une nouvelle réservation ancienne reste Extérieur.
- Audit des changements de profil public et du réglage Hôtel. Les corrections salariées conservent la traçabilité et le contrôle de concurrence de la modification existante.

Le test de migration reproduit les permissions relevées en lecture seule sur DEV : rôle sans superutilisateur, `CREATEROLE`, option ADMIN sur le writer mais INHERIT désactivé. Le rôle jetable reçoit ces mêmes options avant le test ; aucun droit du projet partagé n’est changé.

La migration n’active aucun établissement, ne requalifie aucune réservation passée et ne change ni les horaires, ni les capacités, ni les conditions personnalisées. Sa réapplication est testée avec un mode déjà activé et des réglages personnalisés. La désactivation ultérieure empêche les nouvelles déclarations Hôtel sans bloquer la gestion des réservations Hôtel existantes.

L’Edge Function accepte une adresse absente ou nulle, valide les adresses fournies et ajoute la politique de collecte aux champs publics autorisés. La chambre d’un client n’est rendue que via son propre lien de gestion ou aux salariés habilités du même établissement. Les notes internes restent exclues des réponses publiques. Aucun secret supplémentaire n’est nécessaire. Les emails restent désactivés.

## Validation

- **315 cas unitaires**, **65 fichiers `npm test`** : réussis.
- **198 fichiers** contrôlés sans erreur de syntaxe ; entrée publique et worker email validés par Deno 2.5.6.
- Builds : **8 assets** pour la démonstration, **17 assets** pour le portail connecté. Aucun dashboard ou secret ajouté à l’artefact public.
- **24 groupes PostgreSQL dédiés** : isolation par établissement et rôle, déclarations invalides, refus des noms/chambres manquants, protection des anciens liens sans chambre, approbation de groupes revalidée, changements soumis à validation, refus/expiration, compatibilité des anciens clients, désactivation et réapplication de migration.
- **27 groupes historiques PostgreSQL réussis** contre le nouveau schéma. Campagne Playwright complète et vérifications CI : résultats finaux consignés dans la Pull Request sur son dernier commit.
- Parcours ciblé final : **9 scénarios / 32 audits axe réussis**, sur les sept largeurs, incluant les tentatives sans nom et sans chambre, le véritable RPC salarié et les thèmes clair/sombre. Aucune requête extérieure ni écriture de test partagée.
- Sept largeurs couvertes : **360, 390, 430, 768, 1024, 1440 et 1920 px**. Vérifications des débordements, champs accessibles, navigation au clavier, focus après erreur, saisie conservée, droits, lien et décodage du QR Hôtel.
- Le scénario de correction salariée utilise le **vrai RPC SQL de modification**. Le transport du test a été étendu explicitement à ce RPC ; la réponse UUID est convertie en JSON par la fixture. Les accès directs salariés aux tables restent interdits.
- Les audits axe du formulaire de correction ont révélé un contraste insuffisant des anciens textes d’aide : couleur corrigée en thème clair. Une transition du bouton de table pouvait aussi afficher du texte clair avant le fond sombre ; les couleurs basculent désormais ensemble. Contrôle répété en clair et sombre, sans désactiver de règle axe. Un test de version CSS a été actualisé avec la nouvelle ressource.

Toutes les données d’essai sont fictives et isolées. Les tests utilisent Chromium, un serveur local et PostgreSQL Docker `--network none`. Les identités salariées sont des fixtures authentifiées locales. L’upload d’image est simulé au transport et adossé aux vraies politiques SQL ; le service Storage hébergé n’est pas sollicité. Aucun email envoyé, aucune réservation fictive et aucune migration appliquée à une base partagée pour ces essais. Aucun essai avec de vrais employés ou clients n’est revendiqué. Axe et Playwright ne remplacent pas une validation humaine avec lecteurs d’écran et appareils physiques.

## Captures

Les captures utilisent exclusivement un restaurant et des clients fictifs.

| Format | Choix Hôtel / Extérieur | Chambre obligatoire | Confirmation | QR Hôtel dans Gestion |
| --- | --- | --- | --- | --- |
| Mobile 390 | [Voir](preuves/rm0158-20261120/hotel-client-390.png) | [Voir](preuves/rm0158-20261120/hotel-coordinates-390.png) | [Voir](preuves/rm0158-20261120/hotel-confirmed-390.png) | [Voir](preuves/rm0158-20261120/hotel-qr-390.png) |
| Tablette 768 | [Voir](preuves/rm0158-20261120/hotel-client-768.png) | [Voir](preuves/rm0158-20261120/hotel-coordinates-768.png) | [Voir](preuves/rm0158-20261120/hotel-confirmed-768.png) | [Voir](preuves/rm0158-20261120/hotel-qr-768.png) |
| PC 1440 | [Voir](preuves/rm0158-20261120/hotel-client-1440.png) | [Voir](preuves/rm0158-20261120/hotel-coordinates-1440.png) | [Voir](preuves/rm0158-20261120/hotel-confirmed-1440.png) | [Voir](preuves/rm0158-20261120/hotel-qr-1440.png) |

Correction salariée : [clair](preuves/rm0158-20261120/hotel-staff-correction-390.png) · [sombre](preuves/rm0158-20261120/hotel-staff-correction-dark-390.png).

## Déploiement DEV et recette

**Préparé, pas encore activé sur Render ni Supabase partagé.** Le [cahier des charges #173, §9.C](https://github.com/DylanL-Dev/RestoManager/issues/173#issue-6440535875) exige « aucun changement PROD ni Supabase DEV partagé sans accord explicite ». L’autorisation d’implémenter cette évolution ne vaut pas application de la nouvelle migration partagée.

Après accord explicite pour cette migration et l’API DEV : appliquer la migration au projet DEV uniquement, vérifier le catalogue et les droits, déployer l’Edge Function `rm015-public` avec ses réglages existants et les emails désactivés, fusionner la PR vers DEV, puis déployer le frontend sur le clone Render. Ne pas publier le frontend seul avant le backend. Vérifier la version `2026.11.20-rm015.8-dev` et les ressources réellement servies.

Sur le clone [Render DEV](https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html), Restaurant → Gestion → Réservations en ligne → Réglages : cocher « Proposer le parcours Client de l’hôtel », enregistrer, puis ouvrir le lien général et le lien Hôtel enregistré. Pour un restaurant indépendant, laisser la case décochée. La nouvelle règle ne réécrit pas les réservations existantes : un ancien lien Hôtel sans chambre reste consultable et annulable, mais une nouvelle modification publique doit fournir une chambre. Une ancienne demande de groupe incomplète ne peut pas être approuvée ; elle peut toujours être refusée ou annulée sans inventer une chambre. Le libellé historique « Chambre à compléter » reste un état de lecture, jamais une option de création. Les parcours internes Restaurant/Réception existants gardent leurs règles et droits.

L’activation de l’hôtel actuel peut se faire dans l’interface par le Restaurant ; aucun autre établissement ne doit être activé automatiquement.

Vérifier visuellement la sélection, la chambre ou son absence explicite, le récapitulatif, les mentions de confidentialité, le lien et le QR. **Ne pas confirmer de réservation fictive dans les données partagées.** Utiliser la démonstration isolée pour s’entraîner ; les scénarios transactionnels sont déjà couverts par les bases jetables.

## Limites et suite

Aucun envoi email, intégration PMS ou vérification d’hébergement. Pas d’avantage de quota accordé sur simple déclaration. Pas de purge automatique de données ajoutée ; la politique et le contact existants sont conservés. L’envoi transactionnel nécessite toujours une adresse autorisée, un domaine vérifié et une activation ultérieure. V3, MAIN et Supabase PROD restent exclus de cette livraison.

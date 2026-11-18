# RM-015.2 — Impacts et activation DEV

## État livré

Le moteur, l’API, le suivi Restaurant et le parcours public connecté sont développés. Leur validation utilise exclusivement PostgreSQL éphémère, des identités fictives et une API HTTP locale. Le dépôt et Render DEV restent **en préparation**, sans activation publique des réservations ni des emails. La démonstration RM-015.1 reste indépendante.

Aucune migration, fonction Edge, clé ou configuration Supabase partagée n’a été appliquée par cette livraison. Aucun changement sur MAIN, V3 ou Supabase PROD. L’activation ci-dessous constitue une opération distincte, à valider après lecture des impacts. Cela respecte la consigne : « Si une migration Supabase est nécessaire, la préparer dans le dépôt, la tester sur une base éphémère isolée et présenter les impacts avant toute application à une base partagée. »

## Migration préparée

Fichier : `supabase/migrations/20261118190351_rm015_secure_public_booking.sql`.

| Élément | Modification et effet |
| --- | --- |
| Rôle technique | `rm015_public_writer`, NOLOGIN, NOINHERIT, sans BYPASSRLS ; aucun compte Auth créé. |
| Six tables privées | `rm015_settings`, `rm015_requests`, `rm015_operations`, `rm015_audit`, `rm015_mail`, `rm015_rate` ; RLS activée et forcée, aucun accès direct anon/authenticated. |
| Réservations | Colonne `source_channel` staff/web, valeur par défaut staff ; aucune réservation créée par la migration. |
| Maintiens partagés | `table_holds.web_request_id`, FK tenant/demande et contrainte de propriétaire exclusive. Un maintien salarié conserve `held_by` ; un maintien Web utilise sa demande privée, sans faux salarié. |
| Anciennes fonctions | Comparaisons `held_by <> …` remplacées par `IS DISTINCT FROM` ; les maintiens Web bloquent aussi les anciennes RPC. Identité, propriétaire, search_path et droits existants sont contrôlés automatiquement avant/après. |
| Moteur de placement | Réutilisation des ensembles et fusions autorisés ; exclusion du seul maintien Web propre à la demande lors de sa revalidation. Aucun nouveau type de fusion créé. |
| Contexte du restaurant | `private.staff_restaurant()` accepte un contexte backend seulement si le rôle PostgreSQL réel est service_role et qu’aucun utilisateur n’est connecté. Aucun privilège salarié accordé au Web. |
| API | Trois RPC backend réservées à service_role : gateway, limitation de débit, emails. Une RPC staff exige un profil actif et vérifie Restaurant/Réception côté serveur. |
| Synchronisation | Capacité additive `public_booking:1` et signalement sur le bus de révision existant ; pas de nouvelle publication Realtime. |
| Traçabilité | Audit privé append-only, utilisateur pour les actions salariées, source système pour les expirations. |

La migration est transactionnelle et rejoue deux fois dans les tests. Ses prérequis vérifient le moteur existant, RM-012 et le pourcentage d’arrivées. Une dérive de catalogue provoque l’arrêt et le rollback. Aucun établissement n’est activé, aucun horaire ni pourcentage existant n’est modifié. Le rôle technique perd CREATE après installation. L’administrateur installateur reçoit une appartenance SET sans héritage au rôle technique, nécessaire au transfert de propriété sous PostgreSQL 17 (héritage temporaire uniquement dans la transaction DDL pour permettre aussi une réapplication) ; aucun rôle anon/authenticated/service_role ne la reçoit.

## Règles métier

- Plafond Web = arrondi supérieur de la capacité active × le pourcentage partagé ; même regroupement horaire que le suivi des arrivées. Réservations actives, maintiens Web et brouillons salariés actifs sont comptabilisés. Les dérogations salariées existantes sont conservées.
- Vérification des horaires hebdomadaires, fermetures de service, capacité, fusions, chevauchements, tables encore installées et durée du service. Un client installé depuis la veille n’est jamais libéré automatiquement.
- Maintien du formulaire : trois minutes. De 1 à 3 personnes, confirmation atomique après revalidation. À partir de 4 personnes, demande Restaurant avec maintien **une heure par défaut**, réglable de 15 à 180 minutes et limité par l’heure de venue. Une modification ne repousse pas continuellement cette échéance.
- La confirmation crée une réservation Web « Confirmée », toujours attendue ; aucune arrivée ou installation automatique. La Réception consulte les demandes mais ne les approuve pas et ne change pas les réglages Web.
- Une modification de groupe garde l’ancienne réservation jusqu’à l’accord Restaurant. Refus, expiration ou intervention salariée libèrent la proposition et rétablissent le récapitulatif réel. La simple lecture d’une notification ne traite pas une demande.
- Un même verrou par établissement précède les mutations Web et salariées. Version optimiste et identité d’opération empêchent les doublons, sauvegardes périmées et doubles confirmations.
- Une fermeture volontaire du canal empêche les nouvelles demandes ; les liens existants restent utilisables pour consulter et annuler selon les conditions.

## Secrets et protection des liens

Jetons opaques de 256 bits, empreinte SHA-256 en base, copie chiffrée AES-GCM avec clé versionnée et contexte du restaurant. Le client reçoit son seul lien ; aucun identifiant de table, profil salarié ou note interne. Le lien utilise un fragment URL, pas une query de jeton ; Referrer-Policy no-referrer et réponses no-store. Expiration sept jours après la venue ; après un changement salarié, date et échéance sont recalculées.

Dans l’onglet, sessionStorage ne conserve que la preuve de reprise et les identités d’opération. Les coordonnées restent en mémoire pendant la saisie. Le stockage indisponible bloque l’écriture réelle et explique la situation. Une réponse perdue déclenche une vérification serveur, jamais une confirmation locale de secours. Un lien personnel est confidentiel et donne accès aux coordonnées correspondantes ; il ne doit pas être partagé.

La limitation de débit est persistante et indépendante de la transaction métier. L’adresse réseau est hachée avec un secret HMAC. Les en-têtes de proxy doivent être vérifiés sur l’environnement déployé ; une topologie inconnue échoue fermée. Après trois maintiens dans la même fenêtre, une vérification progressive est requise. Sans service de challenge configuré, la réponse demande de patienter ; aucune exemption automatique. Le frontend ne charge actuellement aucun widget externe.

## Procédure après validation des impacts

1. Confirmer l’identifiant du **projet DEV**, sa séparation de PROD, le catalogue et la sauvegarde. Examiner le diff et le résultat CI de la PR. Ne jamais utiliser un `db push` lié implicitement à un projet inconnu.
2. Appliquer uniquement cette migration sur DEV avec un administrateur autorisé. Vérifier rôle sans BYPASSRLS, RLS, ACL et capacité de snapshot. Si un prérequis échoue, diagnostiquer la dérive ; ne pas retirer la protection.
3. Déployer `rm015-public` vers ce projet explicite. `verify_jwt=false` est volontaire : aucun compte public ; l’Edge utilise ensuite sa clé serveur et une RPC backend fermée. CORS n’est pas le contrôle d’autorisation des réservations : les jetons et RLS le sont.
4. Configurer dans les secrets de l’Edge, jamais dans Render statique : `SUPABASE_URL`, `SUPABASE_SECRET_KEY` ou la clé service-role historique, `RM015_TOKEN_KEYS_JSON` (map de clés AES hex 32 octets), `RM015_ACTIVE_TOKEN_KEY`, `RM015_RATE_SECRET` (hex 32 octets), `RM015_ALLOWED_ORIGINS` (origines exactes), `RM015_TRUSTED_IP_HEADER`, `RM015_TRUSTED_PROXY_HOPS`. Conserver les anciennes clés tant que des liens en dépendent. Ne pas journaliser de corps ou de jeton.
5. Tester la réécriture réelle du proxy avec en-têtes forgés avant de choisir les deux paramètres IP. Leur absence bloque les requêtes. Option future : `RM015_TURNSTILE_SECRET`, avec domaine et action `reservation` vérifiés côté serveur ; le client de challenge reste à raccorder avant de l’utiliser publiquement.
6. Laisser `RM015_EMAIL_ENABLED=false`. Aucun prestataire, ordonnanceur, domaine ou adresse d’expédition n’est activé par cette mission. Ne pas faire tourner la file accumulée de recette sur un prestataire réel.
7. Le responsable Restaurant renseigne dans Gestion → Réservations en ligne son slug, son maximum, ses mentions de confidentialité, son contact, ses conditions et le délai. L’ouverture est explicite ; aucun texte juridique officiel ou maximum n’est inventé pour lui. Prévoir une politique de conservation validée avant accueil de clients réels.
8. Dans un déploiement DEV distinct et revu, ajouter l’origine API exacte à connect-src de `reservation/live.html`, renseigner `runtime.json` avec cette URL et cette origine, puis `activated:true`. `RM015_ENABLED=true` active ensuite l’Edge. Le build de préparation refuse une activation silencieuse. Aucun secret dans runtime.json.
9. Faire la recette des liens et disponibilités en lecture sur DEV. **Les réservations, annulations et expirations fictives restent réservées à la base de test isolée**, même si DEV contient des données clonées. Un véritable bac à sable séparé est nécessaire pour proposer au propriétaire une recette connectée avec écritures fictives dans le navigateur distant.
10. Une publication officielle, un domaine client et toute action PROD/V3/MAIN nécessitent une validation distincte.

## Emails préparés, désactivés

Worker séparé authentifié par un secret d’au moins 32 caractères, pas de session salarié. File privée avec bail, ACK conditionnel, tentatives espacées et clé d’idempotence stable par message. Les événements remplacés sont écartés avant envoi. Les messages anciens de plus de 23 heures passent en vérification manuelle pour rester dans la fenêtre de déduplication de 24 heures du transport Resend. Les templates sont testés via un transport simulé : attente, accord, modification, annulation, refus, expiration et remplacement par le Restaurant.

Pour une phase d’activation email ultérieure seulement : domaine vérifié et expéditeur autorisé, `RM015_EMAIL_PROVIDER=resend`, `RM015_RESEND_API_KEY`, `RM015_EMAIL_FROM`, `RM015_PUBLIC_BASE`, `RM015_MAIL_WORKER_SECRET`, ordonnanceur backend et surveillance de la file. Choisir les règles de conservation et de reprise avant d’activer. Un lien personnel reste l’état de référence si une réservation change pendant qu’un email est déjà en transit.

## Désactivation et limites

Fermer le canal dans Gestion bloque les nouvelles réservations tout en conservant la gestion des liens existants. Désactiver aussi l’Edge/runtime bloque tous les parcours publics, y compris ces liens : réserver cette coupure à un incident ou une maintenance annoncée. Un retour au frontend antérieur conserve la migration additive ; ne pas supprimer à chaud les tables, clés ou contraintes liées aux demandes. La restauration de code ne restaure pas les données.

Le placement public conserve les fusions autorisées par le moteur SQL existant, actuellement jusqu’à trois tables. Il n’invente pas de groupe de quatre tables à partir du seul rendu salarié. La prise en charge de services traversant minuit dépend des horaires réellement acceptés par le moteur partagé ; aucun horaire existant n’est modifié. Aucun indicateur ne garantit une demande particulière. Les emails, le challenge interactif, la rétention automatisée et la publication officielle restent des étapes d’activation distinctes.

# RM-RELEASE-03 B2 — Sécurité de présentation CF27

Suivi #266, #284. Base DEV 374f556. La PR #286 est fusionnée ; le contrôle catalogue Supabase DEV du 28/11/2026 confirme que la définition de service_sync_state_v1 n'a pas changé (empreinte b5daa1b050d12a8100610b91fc0f5e5e) et que les RPC, reçus et journal quick_release ne sont pas encore installés. Aucune écriture ni migration.

## Correctif avant activation
- Le libellé Libre pour un état inconnu était trompeur. Les compteurs du moteur sont présentés comme « à contrôler », neutres ; le texte accessible « Aucun client enregistré » reste présent. Les salles ne sont plus agrégées depuis le plan filtré ni mises en cache entre établissements.
- Correction de l'heure réelle de Paris (le booléen false court-circuitait le repli). Les horaires du panneau utilisent Paris, les présences sont sélectionnées dans la journée courante parmi les statuts attendus.
- Source locale de simulation limitée à la clé de l'établissement courant, contrôle du contexte des réservations partagées et des panneaux/toasts. Plus de réutilisation des compteurs d'arrivées filtrés.
- Seul un résultat explicite ok:true déclenche une confirmation ; annulation attendue et erreurs visibles. Suppression du faux succès visuel sans hook. Indicateur de synchronisation non vert si données en attente.
- Version des assets et cache PWA renouvelés. Aucun changement de SQL, de routage, d'autorisation ou de moteur d'installation/passage.

## Validation
Tests unitaires et navigateur étendus (source avec clé fictive d'un autre établissement, libellé neutre, confirmation d'annulation, réponse absente et refus d'annulation injectés dans navigateur isolé). CI à vérifier sur le SHA de la PR. Le test hébergé et les deux appareils physiques restent à faire après autorisation de migration et de déploiement DEV. L'installation et le passage express réels restent verrouillés. MAIN, V3, Supabase PROD exclus.

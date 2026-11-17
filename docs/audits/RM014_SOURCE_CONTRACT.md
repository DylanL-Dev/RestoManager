# RM-014 — Contrat des sources et intégration RM-012

Depuis la branche RM-012 du 17/11/2026, `service-v3-closeout.js` inscrit le fournisseur `rm012`. Il reste inactif sans la capacité serveur `service_regularization: 1`. La migration RM-012 est préparée et testée uniquement sur PostgreSQL éphémère ; ce document ne signifie pas qu’elle est appliquée sur une base partagée.

Le fournisseur utilise le champ autorisé `notification_days` de `rm012_services_v1`, contenant toutes les journées terminées non clôturées, indépendamment de la pagination des listes et de l’historique. Identité : `rm012:service:AAAA-MM-JJ`, rôle `fb_admin`, priorité haute, `dismissible: false`. Les compteurs et la révision évoluent après vérification serveur. Une journée sans élément restant à corriger garde son rappel « clôture reste à confirmer » jusqu’à sa clôture réelle. Une lecture ne résout rien ; le rappel revient à la prochaine connexion. Une réponse réseau incertaine conserve explicitement le dernier état périmé et bloque les mutations. Réception ne charge aucune donnée RM-012.

Le schéma ci-dessous illustre le contrat générique ; l’implémentation utilise `service:date` comme identité stable et `RestoCloseout.openDate` comme navigation protégée par RM-011.

```js
const unregister = window.RestoNotifications.registerSource('rm012', {
  roles: ['fb_admin'],
  collect({context, now}) {
    // Lire uniquement un snapshot déjà autorisé par le backend RM-012.
    // Retourner [] tant que cette source n’est pas réellement disponible.
    return authorizedSnapshot.map(service => ({
      id: 'service:' + service.date, // stable, indépendamment du nombre de points
      restaurantId: context.restaurantId,
      group: 'important',
      type: 'service-regularization',
      priority: 'high',
      title: 'Service du ' + service.displayDate + ' à régulariser',
      body: service.pendingCount + ' éléments à vérifier.',
      createdAt: service.detectedAt, // timestamp ms stable, pas Date.now() à chaque refresh
      revision: service.revision, // identité stable de la révision, sans donnée personnelle
      dismissible: false, // facultatif : protéger une alerte qui doit rester visible
      resolved: service.isResolved,
      expiresAt: service.retentionEnd, // timestamp ms
      icon: 'clipboard-check',
      targetScreen: 'administration',
      actionLabel: 'Régulariser le service du ' + service.displayDate,
      serviceDate: service.date
    }));
  },
  async open(notification) {
    // Le centre a déjà demandé la navigation via RestoScreens.request.
    // Ouvrir la rubrique RM-012 autorisée. Ne jamais clôturer ni libérer automatiquement.
    await window.RestoCloseout.openDate(notification.serviceDate);
  }
});
```

Le registre refuse une double inscription du même nom, applique les rôles, préfixe les identités avec la source et rejette les éléments d’un autre établissement, résolus ou expirés. Le fournisseur est du code applicatif de confiance ; ce filtre d’interface ne remplace jamais les permissions serveur/RLS. Ne jamais intégrer les données d’une autre équipe ou établissement, ni exposer notes/allergies dans `body`.

Une action ne résout pas une anomalie : seule l’évolution du snapshot autorisé la résout. Le retrait personnel par glissement masque une révision sur cet appareil, sans modifier le snapshot ni les marqueurs de lecture serveur. Une révision, un horaire estimé ou une priorité différente la fait réapparaître. `dismissible: false` protège une alerte métier ; les erreurs de connexion, sources indisponibles et mises à jour en attente sont toujours protégées. Les sources futures n’ont pas de report automatique. Un échec du fournisseur produit une information d’indisponibilité. Les lectures et retraits locaux sont séparés par restaurant/utilisateur/rôle ; aucune nouvelle persistance serveur n’est requise dans RM-014. Les deux stores d’événements existants conservent leur `read_at` et les RLS ; leur lecture reste partagée selon le comportement historique de l’équipe Restaurant.

## Durée de vie

- Rappels retard/départ/capacité : durée de l’état réel ; le départ estimé ne libère jamais une table, y compris après minuit Paris.
- Événements Réception : maximum 7 jours non lus, 48 heures après lecture ; dernier contexte d’une réservation regroupé, chaque référence serveur conservée pour marquer lu.
- Indisponibilité/consultation seule : jusqu’au rétablissement du véritable état de connexion/capacité.
- Nouveautés : annonce de la version courante pendant 30 jours, mise à jour confirmée tant qu’elle est pertinente ; historique versionné public limité à 30 versions.
- État local de lecture/report/retrait : nettoyage à 30 jours. Aucun nom, note, allergie ou corps de notification n’y est stocké : identités, révisions, type/priorité et timestamps seulement. L’annulation des retraits est disponible pendant la session du même compte ; le changement de contexte ou le rechargement réinitialise cette pile d’annulation.

L’API doit recevoir `RestoNotifications.refresh()` après un nouveau snapshot fournisseur. Les notifications ne sont jamais une autorisation de modifier les données.

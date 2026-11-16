# RM-014 — Contrat des sources futures (RM-012)

Aucun fournisseur RM-012 n’est chargé dans l’application de cette livraison. Aucune migration ou clôture n’est créée. L’adaptateur sera ajouté quand les règles et la source autorisée RM-012 seront disponibles.

```js
const unregister = window.RestoNotifications.registerSource('rm012', {
  roles: ['fb_admin'],
  collect({context, now}) {
    // Lire uniquement un snapshot déjà autorisé par le backend RM-012.
    // Retourner [] tant que cette source n’est pas réellement disponible.
    return authorizedSnapshot.map(service => ({
      id: 'unclosed:' + service.date, // stable, indépendamment du nombre de points
      restaurantId: context.restaurantId,
      group: 'important',
      type: 'service-regularization',
      priority: 'high',
      title: 'Service du ' + service.displayDate + ' à régulariser',
      body: service.pendingCount + ' éléments à vérifier.',
      createdAt: service.detectedAt, // timestamp ms stable, pas Date.now() à chaque refresh
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
    // Ouvrir la future rubrique RM-012. Ne jamais clôturer ni libérer automatiquement.
    await futureAuthorizedRm012Navigator(notification.serviceDate);
  }
});
```

Le registre refuse une double inscription du même nom, applique les rôles, préfixe les identités avec la source et rejette les éléments d’un autre établissement, résolus ou expirés. Le fournisseur est du code applicatif de confiance ; ce filtre d’interface ne remplace jamais les permissions serveur/RLS. Ne jamais intégrer les données d’une autre équipe ou établissement, ni exposer notes/allergies dans `body`.

Une action ne résout pas une anomalie : seule l’évolution du snapshot autorisé la retire. Les sources futures n’ont pas de report automatique. Un échec du fournisseur produit une information d’indisponibilité. Les lectures locales sont séparées par restaurant/utilisateur/rôle ; aucune nouvelle persistance serveur n’est requise dans RM-014. Les deux stores d’événements existants conservent leur `read_at` et les RLS ; leur lecture reste partagée selon le comportement historique de l’équipe Restaurant.

## Durée de vie

- Rappels retard/départ/capacité : durée de l’état réel ; le départ estimé ne libère jamais une table, y compris après minuit Paris.
- Événements Réception : maximum 7 jours non lus, 48 heures après lecture ; dernier contexte d’une réservation regroupé, chaque référence serveur conservée pour marquer lu.
- Indisponibilité/consultation seule : jusqu’au rétablissement du véritable état de connexion/capacité.
- Nouveautés : annonce de la version courante pendant 30 jours, mise à jour confirmée tant qu’elle est pertinente ; historique versionné public limité à 30 versions.
- État local de lecture/report : nettoyage à 30 jours. Aucun nom, note, allergie ou corps de notification n’y est stocké : identités et timestamps seulement.

L’API doit recevoir `RestoNotifications.refresh()` après un nouveau snapshot fournisseur. Les notifications ne sont jamais une autorisation de modifier les données.

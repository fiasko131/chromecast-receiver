// Obtenez l'instance du contexte du récepteur
const context = cast.framework.CastReceiverContext.getInstance();

// Démarrer le contexte du récepteur et chaîner avec .then()
context.start()
  .then(() => {
    console.log('Le contexte Cast a démarré avec succès. Les API sont prêtes.');
    
    // Obtenez l'instance du PlayerManager ici
    const playerManager = context.getPlayerManager();

    // Ajoutez vos intercepteurs de messages
    playerManager.setMessageInterceptor(
      cast.framework.messages.MessageType.LOAD,
      loadRequestData => {
        if (loadRequestData.media && loadRequestData.media.customData) {
          const { customData } = loadRequestData.media;
          console.log('En-têtes personnalisés reçus:', customData.headers);
          loadRequestData.media.customData = customData;
        }
        return loadRequestData;
      }
    );

    // Ajoutez vos écouteurs d'événements
    playerManager.addEventListener(
      cast.framework.events.EventType.PLAYING,
      () => {
        console.log('Lecture du média commencée, passage en mode plein écran.');
        document.body.classList.add('playing');
      }
    );

    playerManager.addEventListener(
      cast.framework.events.EventType.IDLE,
      () => {
        console.log('Lecture du média arrêtée, retour au mode par défaut.');
        document.body.classList.remove('playing');
      }
    );
  })
  .catch(error => {
    console.error('Erreur lors du démarrage du contexte Cast:', error);
  });

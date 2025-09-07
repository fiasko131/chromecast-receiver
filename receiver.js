const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Intercepte les messages de chargement
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

// Écouteur d'événement pour le début de la lecture
playerManager.addEventListener(
  cast.framework.events.EventType.PLAYING,
  () => {
    console.log('Lecture du média commencée, passage en mode plein écran.');
    document.body.classList.add('playing');
  }
);

// Écouteur d'événement pour l'arrêt ou la mise en pause du média
playerManager.addEventListener(
  cast.framework.events.EventType.IDLE,
  () => {
    console.log('Lecture du média arrêtée, retour au mode par défaut.');
    document.body.classList.remove('playing');
  }
);

context.start();

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Utiliser l'événement onReady pour garantir que le framework est initialisé
context.onReady = () => {
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

  context.start();
};

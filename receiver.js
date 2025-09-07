const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Intercepte la requête de chargement (le code actuel)
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

// Gère les changements d'état du lecteur
playerManager.addEventListener(
  cast.framework.events.EventType.PLAYER_STATE_CHANGED,
  event => {
    const playerState = event.playerState;
    if (playerState === cast.framework.events.PlayerState.PLAYING) {
      // La vidéo est en cours de lecture, on cache l'interface
      document.body.classList.add('is-playing');
    } else {
      // Si la lecture s'arrête, on affiche à nouveau l'interface
      document.body.classList.remove('is-playing');
    }
  }
);

context.start();

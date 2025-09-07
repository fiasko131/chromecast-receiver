// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// DEBUG: affiche les constantes pour s'assurer qu'elles existent
console.log('cast.framework.events.EventType:', cast.framework.events?.EventType);
console.log('cast.framework.ui.PlayerDataEventType:', cast.framework.ui?.PlayerDataEventType);

// Intercepteur pour LOAD (optionnel)
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

// Méthode recommandée : PlayerDataBinder
try {
  const playerData = {};
  const playerDataBinder = new cast.framework.ui.PlayerDataBinder(playerData);

  playerDataBinder.addEventListener(
    cast.framework.ui.PlayerDataEventType.STATE_CHANGED,
    (e) => {
      console.log('PlayerData.STATE_CHANGED:', e.value);

      switch (e.value) {
        case cast.framework.ui.State.PLAYING:
          document.body.classList.add('playing');
          break;
        case cast.framework.ui.State.IDLE:
        case cast.framework.ui.State.LAUNCHING:
          document.body.classList.remove('playing');
          break;
      }
    }
  );
} catch (err) {
  console.warn('PlayerDataBinder indisponible, fallback MEDIA_STATUS', err);

  // Fallback : écouter MEDIA_STATUS
  playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_STATUS,
    (event) => {
      const state = event.mediaStatus && event.mediaStatus.playerState;
      console.log('MEDIA_STATUS playerState=', state);
      if (state === 'PLAYING') {
        document.body.classList.add('playing');
      } else if (state === 'IDLE') {
        document.body.classList.remove('playing');
      }
    }
  );
}

// Démarre le receiver
context.start();

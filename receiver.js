const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Quand la lecture démarre → mode "playing"
playerManager.addEventListener(cast.framework.events.EventType.PLAYING, () => {
  document.body.classList.add("playing");
});

// Quand la lecture s’arrête → revenir à l’écran d’accueil
playerManager.addEventListener(cast.framework.events.EventType.IDLE, () => {
  document.body.classList.remove("playing");
});

// Intercepteur (si tu en as besoin pour customData)
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

context.start();

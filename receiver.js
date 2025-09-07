const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

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

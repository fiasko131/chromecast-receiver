// Activer le mode de débogage pour le framework Cast
cast.framework.CastReceiverContext.getInstance().setLoggerLevel(cast.framework.LoggerLevel.DEBUG);
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Intercepte la requête de chargement pour ajouter les en-têtes personnalisés
playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  loadRequestData => {
    const customData = loadRequestData.media.customData;
    if (customData && customData.headers) {
      console.log('En-têtes personnalisés reçus:', customData.headers);
      
      // Créez un nouvel objet Headers pour la requête
      const requestHeaders = new Headers();
      
      // Parcourez les en-têtes de l'objet customData et ajoutez-les à la requête
      for (const header in customData.headers) {
        requestHeaders.append(header, customData.headers[header]);
      }
      
      // Assurez-vous d'ajouter également l'en-tête de la méthode
      loadRequestData.media.customData = customData;
      
      // Appliquez les en-têtes à la requête
      loadRequestData.media.httpHeaders = requestHeaders;
    }
    
    return Promise.resolve(loadRequestData);
  }
);

context.start();

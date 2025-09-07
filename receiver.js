const context = cast.framework.CastReceiverContext.getInstance();

context.onReady = () => {
    console.log('Le contexte Cast est prêt.');
    
    // playerManager n'est accessible en toute sécurité qu'ici
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

    // Les écouteurs d'événements doivent être ajoutés ici, après l'initialisation du playerManager
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

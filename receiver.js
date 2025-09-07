document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM est prêt, initialisation du récepteur Cast...');
    
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

    // Utilisez les chaînes de caractères littérales pour les types d'événements
    playerManager.addEventListener(
        'playing',
        () => {
            console.log('Lecture du média commencée, passage en mode plein écran.');
            document.body.classList.add('playing');
        }
    );

    playerManager.addEventListener(
        'idle',
        () => {
            console.log('Lecture du média arrêtée, retour au mode par défaut.');
            document.body.classList.remove('playing');
        }
    );

    context.start();
});

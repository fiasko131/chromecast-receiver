// La première chose à faire est d'obtenir l'instance du contexte
const context = cast.framework.CastReceiverContext.getInstance();

// Définissez le gestionnaire d'événements onReady.
// Cette fonction sera appelée par le framework lorsque tout sera prêt.
context.onReady = () => {
    console.log('Le contexte Cast est prêt, et l\'API est prête à être utilisée.');
    
    // Obtenez l'instance de PlayerManager UNIQUEMENT ICI, car le contexte est maintenant initialisé.
    const playerManager = context.getPlayerManager();

    // Ajoutez ici tous vos intercepteurs et vos écouteurs d'événements.
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
};

// DÉMARREZ le contexte du récepteur après avoir défini le gestionnaire onReady.
// Cela déclenchera l'événement onReady une fois que tout sera initialisé.
context.start();

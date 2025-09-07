// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Éléments DOM
const progressBarContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

// Variable pour la durée du média
let mediaDuration = 0;
let hideProgressTimeout = null;

// Fonction pour afficher temporairement la progressBar
function showProgressTemporarily() {
    progressBarContainer.style.opacity = 1;
    if (hideProgressTimeout) clearTimeout(hideProgressTimeout);
    hideProgressTimeout = setTimeout(() => {
        progressBarContainer.style.opacity = 0;
    }, 2000);
}

// Intercepteur pour LOAD (conservé)
playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.LOAD,
    loadRequestData => {
        if (loadRequestData.media && loadRequestData.media.customData) {
            const { customData } = loadRequestData.media;
            console.log('En-têtes personnalisés reçus:', customData.headers);
            loadRequestData.media.customData = customData;
        }

        // Récupération de la durée du média
        if (loadRequestData.media && loadRequestData.media.duration) {
            mediaDuration = loadRequestData.media.duration;
            console.log("Durée du média (LOAD):", mediaDuration, "s");
        }

        return loadRequestData;
    }
);

// Listener pour les actions utilisateur qui doivent afficher la barre
playerManager.addEventListener(cast.framework.events.EventType.PLAYER_SEEKED, () => showProgressTemporarily());
playerManager.addEventListener(cast.framework.events.EventType.PLAY, () => showProgressTemporarily());
playerManager.addEventListener(cast.framework.events.EventType.PAUSE, () => showProgressTemporarily());

// Listener pour mise à jour continue de la progression
playerManager.addEventListener(cast.framework.events.EventType.PROGRESS, (event) => {
    if (!mediaDuration) return;

    // currentTime ou currentMediaTime selon la source
    const currentTime = (typeof event.currentTime === "number") ? event.currentTime : event.currentMediaTime;
    if (typeof currentTime !== "number" || isNaN(currentTime)) {
        console.log("PROGRESS sans currentTime valide:", event);
        return;
    }

    const pct = (currentTime / mediaDuration) * 100;
    progressBar.style.width = pct + "%";

    // LOG progression et couleur
    const color = window.getComputedStyle(progressBar).backgroundColor;
    console.log(`Progression: ${pct.toFixed(2)}% (${currentTime.toFixed(1)}s / ${mediaDuration.toFixed(1)}s) | Couleur: ${color}`);
});

// PlayerDataBinder pour changer l'affichage du body
try {
    const playerData = {};
    const playerDataBinder = new cast.framework.ui.PlayerDataBinder(playerData);

    playerDataBinder.addEventListener(
        cast.framework.ui.PlayerDataEventType.STATE_CHANGED,
        (e) => {
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
    playerManager.addEventListener(
        cast.framework.events.EventType.MEDIA_STATUS,
        (event) => {
            const state = event.mediaStatus && event.mediaStatus.playerState;
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

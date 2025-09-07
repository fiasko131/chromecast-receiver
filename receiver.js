// Récupération du contexte et du player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Intercepteur pour LOAD (conservé)
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

// Référence à la progressBar et timer
const progressBar = document.getElementById('progress-bar');
let hideProgressTimer = null;

// Fonction pour afficher la barre temporairement
function showProgressTemporarily() {
  progressBar.style.display = 'block';
  if (hideProgressTimer) clearTimeout(hideProgressTimer);
  hideProgressTimer = setTimeout(() => {
    progressBar.style.display = 'none';
  }, 2000); // 2 secondes
}

// Fonction pour mettre à jour la largeur de la barre
function updateProgressBar(currentTime, duration) {
  if (!duration || duration <= 0) return;
  const progressPercent = ((currentTime / duration) * 100).toFixed(2);
  progressBar.style.width = `${progressPercent}%`;
  console.log(`Progression: ${progressPercent}% (currentTime=${currentTime}s, duration=${duration}s)`);
}

// Listener pour état du player (PLAY/PAUSE)
playerManager.addEventListener(
  cast.framework.events.EventType.PLAYER_STATE_CHANGED,
  (event) => {
    const state = playerManager.getPlayerState();
    console.log('PLAYER_STATE_CHANGED:', state);

    if (state === cast.framework.PlayerState.PLAYING) {
      document.body.classList.add('playing');
      showProgressTemporarily();
    } else if (state === cast.framework.PlayerState.IDLE || state === cast.framework.PlayerState.PAUSED) {
      document.body.classList.remove('playing');
    }
  }
);

// Listener pour seek terminé
playerManager.addEventListener(
  cast.framework.events.EventType.SEEKED,
  () => {
    console.log('SEEKED event');
    showProgressTemporarily();
  }
);

// Listener pour progression continue
playerManager.addEventListener(
  cast.framework.events.EventType.PROGRESS,
  (event) => {
    const currentTime = event.currentMediaTime;
    const duration = playerManager.getMediaInformation()?.duration;
    if (currentTime != null && duration != null) {
      updateProgressBar(currentTime, duration);
    } else {
      console.log('PROGRESS sans currentTime valide:', event);
    }
  }
);

// Démarre le receiver
context.start();

// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");

let progressTimeout = null;

// DEBUG
console.log('cast.framework.events.EventType:', cast.framework.events?.EventType);
console.log('cast.framework.ui.PlayerDataEventType:', cast.framework.ui?.PlayerDataEventType);

// Intercepteur LOAD (doit être conservé)
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

// Fonction utilitaire pour afficher la barre
function showProgressBar() {
  progressContainer.classList.add("show");

  if (progressTimeout) clearTimeout(progressTimeout);
  progressTimeout = setTimeout(() => {
    progressContainer.classList.remove("show");
  }, 2000);
}

try {
  const playerData = {};
  const playerDataBinder = new cast.framework.ui.PlayerDataBinder(playerData);

  // Met à jour la largeur de la barre
  playerDataBinder.addEventListener(
    cast.framework.ui.PlayerDataEventType.POSITION_CHANGED,
    () => {
      if (playerData.duration > 0) {
        const percent = (playerData.currentTime / playerData.duration) * 100;
        progressBar.style.width = percent + "%";
      }
    }
  );

  // Affiche la barre quand l’état change
  playerDataBinder.addEventListener(
    cast.framework.ui.PlayerDataEventType.STATE_CHANGED,
    (e) => {
      console.log("PlayerData.STATE_CHANGED:", e.value);

      switch (e.value) {
        case cast.framework.ui.State.PLAYING:
        case cast.framework.ui.State.PAUSED:
          document.body.classList.add("playing");
          showProgressBar();
          break;

        case cast.framework.ui.State.IDLE:
        case cast.framework.ui.State.LAUNCHING:
          document.body.classList.remove("playing");
          progressContainer.classList.remove("show");
          progressBar.style.width = "0%";
          if (progressTimeout) clearTimeout(progressTimeout);
          break;
      }
    }
  );

  // Affiche la barre quand un SEEK est reçu
  playerManager.addEventListener(
    cast.framework.events.EventType.SEEKING,
    (e) => {
      console.log("SEEKING event:", e);
      showProgressBar();
    }
  );

} catch (err) {
  console.warn("PlayerDataBinder indisponible, fallback MEDIA_STATUS", err);

  // Fallback : écouter MEDIA_STATUS
  playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_STATUS,
    (event) => {
      const state = event.mediaStatus && event.mediaStatus.playerState;
      console.log("MEDIA_STATUS playerState=", state);
      if (state === "PLAYING") {
        document.body.classList.add("playing");
      } else if (state === "IDLE") {
        document.body.classList.remove("playing");
      }
    }
  );
}

// Démarre le receiver
context.start();

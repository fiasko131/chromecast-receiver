// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

let mediaDuration = 0; // durée en secondes de la vidéo en cours

// Intercepteur pour LOAD (optionnel, à garder comme demandé)
playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  loadRequestData => {
    if (loadRequestData.media) {
      // On capture la durée ici
      mediaDuration = loadRequestData.media.duration || 0;
      console.log("Durée du média (LOAD):", mediaDuration, "s");
    }

    if (loadRequestData.media && loadRequestData.media.customData) {
      const { customData } = loadRequestData.media;
      console.log("En-têtes personnalisés reçus:", customData.headers);
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
      console.log("PlayerData.STATE_CHANGED:", e.value);

      switch (e.value) {
        case cast.framework.ui.State.PLAYING:
          document.body.classList.add("playing");
          break;
        case cast.framework.ui.State.IDLE:
        case cast.framework.ui.State.LAUNCHING:
          document.body.classList.remove("playing");
          break;
      }
    }
  );
} catch (err) {
  console.warn("PlayerDataBinder indisponible, fallback MEDIA_STATUS", err);

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

// ---- Gestion de la barre de progression ----
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");

playerManager.addEventListener(
  cast.framework.events.EventType.PROGRESS,
  (event) => {
    if (!mediaDuration || mediaDuration <= 0) return;

    const currentTime = event.currentTime;
    const pct = (currentTime / mediaDuration) * 100;

    // Mise à jour de la barre
    progressBar.style.width = pct + "%";

    // Afficher la barre si progression > 0
    if (pct > 0) {
      progressContainer.classList.add("show");
    }

    // LOG progression + couleur
    const color = window.getComputedStyle(progressBar).backgroundColor;
    console.log(
      `Progression: ${pct.toFixed(2)}% (${currentTime.toFixed(1)}s / ${mediaDuration.toFixed(1)}s) | Couleur: ${color}`
    );
  }
);

// Démarre le receiver
context.start();

// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

let mediaDuration = 0; // durée en secondes du média en cours
let hideProgressTimeout = null; // timer pour cacher le bottom-ui
let lastPlayerState = null; // pour filtrer les apparitions intempestives

// ---- Intercepteur pour LOAD ----
playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  loadRequestData => {
    if (loadRequestData.media) {
      if (typeof loadRequestData.media.duration === "number" && loadRequestData.media.duration > 0) {	
        mediaDuration = loadRequestData.media.duration;
        console.log("Durée du média fournie:", mediaDuration, "s");
      } else {
        mediaDuration = 0; // ✅ laisse le player découvrir la durée
        console.log("Durée du média non fournie, detection automatique.");
      }
    }

    if (loadRequestData.media && loadRequestData.media.customData) {
      const { customData } = loadRequestData.media;
      console.log("En-têtes personnalisés reçus:", customData.headers);
      loadRequestData.media.customData = customData;
    }

    // ⚡ Récupération du titre et miniature envoyés dans metadata
    const videoTitle = document.getElementById("video-title");
    const videoThumbnail = document.getElementById("video-thumbnail");
    const videoTitleSmall = document.getElementById("video-title-small");
    const videoThumbnailSmall = document.getElementById("video-thumbnail-small");

    if (loadRequestData.media && loadRequestData.media.metadata) {
      const meta = loadRequestData.media.metadata;

      // Titre
      const titleText = meta.title || "En attente...";
      if (videoTitle) videoTitle.textContent = titleText;
      if (videoTitleSmall) videoTitleSmall.textContent = titleText;

      // Miniature
      if (Array.isArray(meta.images) && meta.images.length > 0 && meta.images[0].url) {
        if (videoThumbnail) videoThumbnail.src = meta.images[0].url;
        if (videoThumbnailSmall) videoThumbnailSmall.src = meta.images[0].url;
      } else {
        if (videoThumbnail) videoThumbnail.src = "assets/placeholder.png";
        if (videoThumbnailSmall) videoThumbnailSmall.src = "assets/placeholder.png";
      }
    } else {
      // ⚡ Aucun metadata fourni → valeurs par défaut
      if (videoTitle) videoTitle.textContent = "En attente...";
      if (videoThumbnail) videoThumbnail.src = "assets/placeholder.png";
      if (videoTitleSmall) videoTitleSmall.textContent = "En attente...";
      if (videoThumbnailSmall) videoThumbnailSmall.src = "assets/placeholder.png";
    }

    return loadRequestData;
  }
);

// ---- Bottom UI (au lieu de progressContainer seul) ----
const bottomUI = document.getElementById("bottom-ui");
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");
const pauseIcon = document.getElementById("pause-icon");

// ---- Audio UI (progress bar dédiée) ----
const audioProgressContainer = document.getElementById("audio-progress-container");
const audioProgressBar = document.getElementById("audio-progress-bar");
const audioCurrentTime = document.getElementById("audio-current-time");
const audioTotalTime = document.getElementById("audio-total-time");

// ---- Création des éléments de durée (current / total) ----
let currentTimeElem = document.getElementById("current-time");
let totalTimeElem = document.getElementById("total-time");

if (!currentTimeElem) {
  currentTimeElem = document.createElement("span");
  currentTimeElem.id = "current-time";
  progressContainer.appendChild(currentTimeElem);
}

if (!totalTimeElem) {
  totalTimeElem = document.createElement("span");
  totalTimeElem.id = "total-time";
  progressContainer.appendChild(totalTimeElem);
}

// Format hh:mm:ss
function formatTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h > 0 ? h.toString().padStart(2, "0") + ":" : "") +
         m.toString().padStart(2, "0") + ":" +
         s.toString().padStart(2, "0");
}

// ⚡ Affiche le bottom-ui temporairement
function showBottomUiTemporarily() {
  bottomUI.classList.add("show");
  if (hideProgressTimeout) clearTimeout(hideProgressTimeout);
  hideProgressTimeout = setTimeout(() => {
    // ⚡ uniquement masquer si on n’est PAS en pause
    if (lastPlayerState !== cast.framework.ui.State.PAUSED) {
      bottomUI.classList.remove("show");
    }
  }, 2000);
}

// ---- Gestion des changements d'état ----
function handlePlayerState(state) {
  if (state === lastPlayerState) return;
  lastPlayerState = state;

  switch (state) {
    case cast.framework.ui.State.PLAYING:
      showBottomUiTemporarily();
      document.body.classList.add("playing");
      if (pauseIcon) pauseIcon.style.display = "none"; // cacher icône pause
      break;

    case cast.framework.ui.State.PAUSED:
      if (bottomUI) bottomUI.classList.add("show");
      document.body.classList.add("playing");
      if (pauseIcon) pauseIcon.style.display = "block"; // afficher icône pause
      break;

    case cast.framework.ui.State.IDLE:
    case cast.framework.ui.State.LAUNCHING:
      document.body.classList.remove("playing");
      if (bottomUI) bottomUI.classList.remove("show");
      if (pauseIcon) pauseIcon.style.display = "none";
      break;
  }
}

// ---- PlayerDataBinder si disponible ----
try {
  const playerData = {};
  const playerDataBinder = new cast.framework.ui.PlayerDataBinder(playerData);

  playerDataBinder.addEventListener(
    cast.framework.ui.PlayerDataEventType.STATE_CHANGED,
    (e) => {
      console.log("PlayerData.STATE_CHANGED:", e.value);
      handlePlayerState(e.value);
    }
  );
} catch (err) {
  console.warn("PlayerDataBinder indisponible, fallback MEDIA_STATUS", err);

  playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_STATUS,
    (event) => {
      const state = event.mediaStatus && event.mediaStatus.playerState;
      console.log("MEDIA_STATUS playerState=", state);
      handlePlayerState(state);
    }
  );
}

// ---- Mise à jour de la durée via MEDIA_STATUS ----
playerManager.addEventListener(
  cast.framework.events.EventType.MEDIA_STATUS,
  (event) => {
    if (event.mediaStatus && event.mediaStatus.media && event.mediaStatus.media.duration) {
      mediaDuration = event.mediaStatus.media.duration;
      console.log("🎵 Durée détectée par le player:", mediaDuration, "s");
    }
  }
);

// ---- Gestion de la barre de progression (audio + vidéo) ----
playerManager.addEventListener(
  cast.framework.events.EventType.PROGRESS,
  (event) => {
    const currentTime = (typeof event.currentTime === "number")
      ? event.currentTime
      : event.currentMediaTime;

    console.log("🎵 PROGRESS raw:", {
      currentTime,
      mediaDuration,
      event
    });

    if (!mediaDuration || mediaDuration <= 0) {
      console.warn("⏳ mediaDuration pas encore dispo, attente découverte...");
      return;
    }

    const pct = (currentTime / mediaDuration) * 100;

    // ⚡ Choix UI : audio vs vidéo
    if (audioProgressContainer && audioProgressContainer.offsetParent !== null) {
      // === Mode audio ===
      audioProgressBar.style.width = pct + "%";
      audioCurrentTime.textContent = formatTime(currentTime);
      audioTotalTime.textContent = formatTime(mediaDuration);
      console.log("➡️ MAJ audio bar:", pct.toFixed(2) + "%");
    } else {
      // === Mode vidéo ===
      progressBar.style.width = pct + "%";
      currentTimeElem.textContent = formatTime(currentTime);
      totalTimeElem.textContent = formatTime(mediaDuration);
      console.log("➡️ MAJ video bar:", pct.toFixed(2) + "%");
    }
  }
);

// ---- Démarrage du receiver ----
context.start();

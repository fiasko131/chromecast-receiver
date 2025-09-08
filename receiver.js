k// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

let mediaDuration = 0; // durée en secondes de la vidéo en cours
let hideProgressTimeout = null; // timer pour cacher la barre
let lastPlayerState = null; // pour filtrer les apparitions intempestives

// --- ⚡ AJOUT : références UI pour titre + miniature ---
const videoInfo = document.getElementById("video-info");
const videoThumbnail = document.getElementById("video-thumbnail");
const videoTitle = document.getElementById("video-title");
const PLACEHOLDER_SRC = "assets/placeholder.png";

// --- ⚡ AJOUT : helper sûr pour mettre à jour le bloc info ---
function safeSetVideoInfoFromMetadata(metadata) {
  try {
    if (!metadata) {
      if (videoInfo) videoInfo.style.display = "none";
      return;
    }

    if (videoInfo) videoInfo.style.display = "";

    const title = (metadata && metadata.title) ? metadata.title : "Titre inconnu";
    if (videoTitle) videoTitle.textContent = title;

    let imgUrl = null;
    if (metadata && Array.isArray(metadata.images) && metadata.images.length > 0 && metadata.images[0] && metadata.images[0].url) {
      imgUrl = metadata.images[0].url;
    }

    if (imgUrl && /^http:/.test(imgUrl) && location && location.protocol === "https:") {
      console.warn("Miniature http bloquée (mixed content) :", imgUrl);
      imgUrl = null;
    }

    if (videoThumbnail) {
      videoThumbnail.onerror = function() {
        videoThumbnail.onerror = null;
        videoThumbnail.src = PLACEHOLDER_SRC;
      };
      videoThumbnail.src = imgUrl || PLACEHOLDER_SRC;
    }
  } catch (err) {
    console.error("Erreur safeSetVideoInfoFromMetadata:", err);
    if (videoInfo) videoInfo.style.display = "none";
  }
}

// ---- Intercepteur pour LOAD ----
playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  loadRequestData => {
    if (loadRequestData.media) {
      if (typeof loadRequestData.media.duration === "number" && loadRequestData.media.duration > 0) {	
        mediaDuration = loadRequestData.media.duration;
        console.log("Durée du média fournie:", mediaDuration, "s");
      } else {
        mediaDuration = 0;
        console.log("Durée du média non fournie, detection automatique.");
      }
    }

    if (loadRequestData.media && loadRequestData.media.customData) {
      const { customData } = loadRequestData.media;
      console.log("En-têtes personnalisés reçus:", customData.headers);
      loadRequestData.media.customData = customData;
    }

    // ⚡ NE PAS toucher le DOM ici → trop tôt
    return loadRequestData;
  }
);

// ---- ProgressBar ----
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");

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

// Affiche la barre et les durées temporairement
function showProgressTemporarily() {
  progressContainer.classList.add("show");
  if (hideProgressTimeout) clearTimeout(hideProgressTimeout);
  hideProgressTimeout = setTimeout(() => {
    progressContainer.classList.remove("show");
  }, 2000);
}

// ---- Gestion des changements d'état ----
function handlePlayerState(state) {
  if (state === lastPlayerState) return;
  lastPlayerState = state;

  switch (state) {
    case cast.framework.ui.State.PLAYING:
    case cast.framework.ui.State.PAUSED:
      showProgressTemporarily();
      document.body.classList.add("playing");
      break;
    case cast.framework.ui.State.IDLE:
    case cast.framework.ui.State.LAUNCHING:
      document.body.classList.remove("playing");
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

      // ⚡ AJOUT : mise à jour safe de l'UI
      const md = event && event.mediaStatus && event.mediaStatus.media && event.mediaStatus.media.metadata;
      safeSetVideoInfoFromMetadata(md);
    }
  );
}

// ---- Gestion de la barre de progression ----
playerManager.addEventListener(
  cast.framework.events.EventType.PROGRESS,
  (event) => {
    if (!mediaDuration || mediaDuration <= 0) return;

    const currentTime = (typeof event.currentTime === "number")
      ? event.currentTime
      : event.currentMediaTime;

    if (typeof currentTime !== "number" || isNaN(currentTime)) {
      console.log("⚠️ PROGRESS sans currentTime valide:", event);
      return;
    }

    const pct = (currentTime / mediaDuration) * 100;
    progressBar.style.width = pct + "%";

    currentTimeElem.textContent = formatTime(currentTime);
    totalTimeElem.textContent = formatTime(mediaDuration);

    const color = window.getComputedStyle(progressBar).backgroundColor;
    console.log(
      `Progression: ${pct.toFixed(2)}% (${currentTime.toFixed(1)}s / ${mediaDuration.toFixed(1)}s) | Couleur: ${color}`
    );
  }
);

// ---- Démarrage du receiver ----
context.start();


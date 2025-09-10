kk// ==================== INIT ====================
// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

let mediaDuration = 0; // durée en secondes du média en cours
let hideProgressTimeout = null; // timer pour cacher le bottom-ui (vidéo seulement)
let lastPlayerState = null; // pour filtrer les apparitions intempestives
let isAudioContent = false; // ⚡ nouveau : indique si le média est audio

// ==================== LOAD INTERCEPTOR ====================
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

    // ⚡ Détection du type de média
    if (loadRequestData.media && loadRequestData.media.contentType) {
      const type = loadRequestData.media.contentType;
      isAudioContent = type.startsWith("audio/");
      console.log("Type détecté:", type, "=> isAudioContent =", isAudioContent);
    } else {
      isAudioContent = false;
    }

    if (loadRequestData.media && loadRequestData.media.customData) {
      const { customData } = loadRequestData.media;
      console.log("En-têtes personnalisés reçus:", customData.headers);
      loadRequestData.media.customData = customData;
    }

    // ==================== MÉTADONNÉES ====================
    const videoTitle = document.getElementById("video-title");
    const videoThumbnail = document.getElementById("video-thumbnail");
    const videoTitleSmall = document.getElementById("video-title-small");
    const videoThumbnailSmall = document.getElementById("video-thumbnail-small");

    const audioTitle = document.getElementById("track-title");
    const audioAlbum = document.getElementById("track-album");
    const audioArtist = document.getElementById("track-artist");
    const audioThumbnail = document.getElementById("audio-thumbnail");

    if (loadRequestData.media && loadRequestData.media.metadata) {
      const meta = loadRequestData.media.metadata;

      // --- Titre ---
      const titleText = meta.title || "En attente...";
      if (videoTitle) videoTitle.textContent = titleText;
      if (videoTitleSmall) videoTitleSmall.textContent = titleText;
      if (audioTitle) audioTitle.textContent = titleText;

      // --- Album & artiste (audio uniquement) ---
      if (audioAlbum) audioAlbum.textContent = meta.albumName || "Album inconnu";
      if (audioArtist) audioArtist.textContent = meta.artist || "Artiste inconnu";

      // --- Miniature ---
      let imgUrl = "assets/placeholder.png";
      if (Array.isArray(meta.images) && meta.images.length > 0 && meta.images[0].url) {
        imgUrl = meta.images[0].url;
      }
      if (videoThumbnail) videoThumbnail.src = imgUrl;
      if (videoThumbnailSmall) videoThumbnailSmall.src = imgUrl;
      if (audioThumbnail) audioThumbnail.src = imgUrl;

    } else {
      // ⚡ Aucun metadata fourni → valeurs par défaut
      if (videoTitle) videoTitle.textContent = "En attente...";
      if (videoThumbnail) videoThumbnail.src = "assets/placeholder.png";
      if (videoTitleSmall) videoTitleSmall.textContent = "En attente...";
      if (videoThumbnailSmall) videoThumbnailSmall.src = "assets/placeholder.png";
      if (audioTitle) audioTitle.textContent = "En attente...";
      if (audioAlbum) audioAlbum.textContent = "Album inconnu";
      if (audioArtist) audioArtist.textContent = "Artiste inconnu";
      if (audioThumbnail) audioThumbnail.src = "assets/placeholder.png";
    }

    return loadRequestData;
  }
);

// ==================== UI ELEMENTS ====================
// --- Vidéo ---
const bottomUI = document.getElementById("bottom-ui");
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");
const pauseIcon = document.getElementById("pause-icon");

// --- Audio ⚡ nouvel UI ---
const audioUI = document.getElementById("audio-ui");
const audioProgressContainer = document.getElementById("audio-progress-container");
const audioProgressBar = document.getElementById("audio-progress-bar");
const audioCurrentTime = document.getElementById("audio-current-time");
const audioTotalTime = document.getElementById("audio-total-time");
const audioPauseIcon = document.getElementById("audio-pause-icon");

// --- Durées vidéo ---
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

// ==================== HELPERS ====================
function formatTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h > 0 ? h.toString().padStart(2, "0") + ":" : "") +
         m.toString().padStart(2, "0") + ":" +
         s.toString().padStart(2, "0");
}

// ⚡ Vidéo uniquement : affiche bottom-ui temporairement
function showBottomUiTemporarily() {
  bottomUI.classList.add("show");
  if (hideProgressTimeout) clearTimeout(hideProgressTimeout);
  hideProgressTimeout = setTimeout(() => {
    if (lastPlayerState !== cast.framework.ui.State.PAUSED) {
      bottomUI.classList.remove("show");
    }
  }, 2000);
}

// ==================== PLAYER STATE ====================
function handlePlayerState(state) {
  if (state === lastPlayerState) return;
  lastPlayerState = state;

  switch (state) {
    case cast.framework.ui.State.PLAYING:
      document.body.classList.add("playing");
      if (isAudioContent) {
        // --- AUDIO ---
        audioUI.style.display = "flex";
        bottomUI.classList.remove("show");
        document.getElementById("player").style.display = "none";
        if (audioPauseIcon) audioPauseIcon.style.display = "none";
      } else {
        // --- VIDEO ---
        showBottomUiTemporarily();
        document.getElementById("player").style.display = "block";
        audioUI.style.display = "none";
        if (pauseIcon) pauseIcon.style.display = "none";
      }
      break;

    case cast.framework.ui.State.PAUSED:
      document.body.classList.add("playing");
      if (isAudioContent) {
        audioUI.style.display = "flex";
        if (audioPauseIcon) audioPauseIcon.style.display = "block";
      } else {
        if (bottomUI) bottomUI.classList.add("show");
        if (pauseIcon) pauseIcon.style.display = "block";
      }
      break;

    case cast.framework.ui.State.IDLE:
    case cast.framework.ui.State.LAUNCHING:
      document.body.classList.remove("playing");
      if (bottomUI) bottomUI.classList.remove("show");
      if (pauseIcon) pauseIcon.style.display = "none";
      if (audioPauseIcon) audioPauseIcon.style.display = "none";
      audioUI.style.display = "none";
      break;
  }
}

// ==================== PLAYER DATA BINDING ====================
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

// ==================== PROGRESS ====================
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

    if (isAudioContent) {
      // --- AUDIO ---
      audioProgressBar.style.width = pct + "%";
      audioCurrentTime.textContent = formatTime(currentTime);
      audioTotalTime.textContent = formatTime(mediaDuration);
    } else {
      // --- VIDEO ---
      progressBar.style.width = pct + "%";
      currentTimeElem.textContent = formatTime(currentTime);
      totalTimeElem.textContent = formatTime(mediaDuration);
    }

    console.log(
      `Progression: ${pct.toFixed(2)}% (${currentTime.toFixed(1)}s / ${mediaDuration.toFixed(1)}s)`
    );
  }
);

// ==================== START RECEIVER ====================
context.start();


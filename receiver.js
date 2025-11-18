// ==================== INIT ====================
// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

let mediaDuration = 0;                // durée du média en secondes
let hideProgressTimeout = null;       // timer pour cacher bottom-ui (vidéo)
let lastPlayerState = null;           // filtrage apparition répétée
let isAudioContent = false;           // ⚡ true si média audio

// ⚡ Audio uniquement
let audioCurrentTimeSec = 0;
let audioTimer = null;
let audioIsPlaying = false;

// ==================== NOUVEAU : MESSAGE BUS pour images/contrôles ====================
const IMAGE_NAMESPACE = 'urn:x-cast:wizu.channel'; // à garder identique côté Android
const messageBus = context.getCastMessageBus(IMAGE_NAMESPACE, cast.receiver.CastMessageBus.MessageType.JSON);

messageBus.onMessage = (event) => {
  try {
    const data = (typeof event.data === 'string') ? JSON.parse(event.data) : event.data;
    if (!data || !data.cmd) return;

    switch (data.cmd) {
      case 'showImage':
        // { cmd: "showImage", url: "...", next: "...", next2: "..." }
        showImage(data.url, data.next, data.next2);
        break;
      case 'hideImage':
        hideImage();
        break;
      case 'showVideo':
        // { cmd: "showVideo", url: "...", title?: "...", thumbnail?: "..." }
        showVideo(data.url, data.title, data.thumbnail);
        break;
      default:
        console.warn("Message non géré sur IMAGE_NAMESPACE:", data.cmd);
    }
  } catch (e) {
    console.error("Erreur parsing messageBus:", e);
  }
};

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
        console.log("Durée du média non fournie, détection automatique.");
      }

      // ⚡ Type audio ou vidéo
      if (loadRequestData.media.contentType) {
        isAudioContent = loadRequestData.media.contentType.startsWith("audio/");
        console.log("Type détecté:", loadRequestData.media.contentType, "=> isAudioContent =", isAudioContent);
      } else {
        isAudioContent = false;
      }
    }

    // ⚡ CustomData
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
      const titleText = meta.title || "In Progress...";

      // --- Titre ---
      if (videoTitle) videoTitle.textContent = titleText || "unknown title";
      if (videoTitleSmall) videoTitleSmall.textContent = titleText;
      if (audioTitle) audioTitle.textContent = titleText;

      // --- Album & Artiste (audio) ---
      if (audioAlbum) audioAlbum.textContent = meta.albumName ? ("Album: " + meta.albumName) : "Album: unknown";
      if (audioArtist) audioArtist.textContent = meta.artist ? ("Artist: " + meta.artist) : "Artist: unknown";

      // --- Miniature ---
      let imgUrl = "assets/placeholder.png";
      if (Array.isArray(meta.images) && meta.images.length > 0 && meta.images[0].url) {
        imgUrl = meta.images[0].url;
      }
      if (videoThumbnail) videoThumbnail.src = imgUrl;
      if (videoThumbnailSmall) videoThumbnailSmall.src = imgUrl;
      if (audioThumbnail) audioThumbnail.src = imgUrl;

    } else {
      // ⚡ Valeurs par défaut
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
// Vidéo
const bottomUI = document.getElementById("bottom-ui");
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");
const pauseIcon = document.getElementById("pause-icon");

// Audio
const audioUI = document.getElementById("audio-ui");
const audioProgressBar = document.getElementById("audio-progress-bar");
const audioCurrentTime = document.getElementById("audio-current-time");
const audioTotalTime = document.getElementById("audio-total-time");
const audioPauseIcon = document.getElementById("audio-pause-icon");

// Image elements (nouveau)
const imageViewer = document.getElementById("image-viewer");
const imageLoading = document.getElementById("image-loading");

// Durées vidéo
let currentTimeElem = document.getElementById("current-time");
let totalTimeElem = document.getElementById("total-time");
if (!currentTimeElem) { currentTimeElem = document.createElement("span"); currentTimeElem.id = "current-time"; progressContainer.appendChild(currentTimeElem); }
if (!totalTimeElem) { totalTimeElem = document.createElement("span"); totalTimeElem.id = "total-time"; progressContainer.appendChild(totalTimeElem); }

// ==================== HELPERS ====================
function formatTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h>0? h.toString().padStart(2,"0")+":" : "") + m.toString().padStart(2,"0") + ":" + s.toString().padStart(2,"0");
}

// Vidéo uniquement : bottom-ui
function showBottomUiTemporarily() {
  bottomUI.classList.add("show");
  if (hideProgressTimeout) clearTimeout(hideProgressTimeout);
  hideProgressTimeout = setTimeout(() => {
    if (lastPlayerState !== cast.framework.ui.State.PAUSED) bottomUI.classList.remove("show");
  }, 2000);
}

// ==================== PLAYER STATE ====================
function handlePlayerState(state) {
  if (state === lastPlayerState) return;
  lastPlayerState = state;

  switch(state) {
    case cast.framework.ui.State.PLAYING:
      document.body.classList.add("playing");
      if (isAudioContent) {
        audioUI.style.display = "flex";
        bottomUI.classList.remove("show");
        document.getElementById("player").style.display = "none";
        if (audioPauseIcon) audioPauseIcon.style.display = "none";
      } else {
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
      // si idle, masquer l'image aussi (retour écran attente)
      if (imageViewer) {
        imageViewer.style.opacity = '0';
        setTimeout(()=>{ imageViewer.style.display = 'none'; }, 350);
      }
      if (imageLoading) imageLoading.style.display = 'none';
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

// ==================== AUDIO TIMER ====================
function updateAudioProgressUI() {
  if (!isAudioContent || !mediaDuration || mediaDuration <= 0) return;
  const pct = (audioCurrentTimeSec / mediaDuration) * 100;
  audioProgressBar.style.width = pct + "%";
  audioCurrentTime.textContent = formatTime(audioCurrentTimeSec);
  audioTotalTime.textContent = formatTime(mediaDuration);
}

function startAudioTimer() {
  if (audioTimer) clearInterval(audioTimer);
  audioTimer = setInterval(() => {
    if (audioIsPlaying && audioCurrentTimeSec < mediaDuration) {
      audioCurrentTimeSec += 1;
      updateAudioProgressUI();
    }
  }, 1000);
}

function stopAudioTimer() {
  if (audioTimer) clearInterval(audioTimer);
  audioTimer = null;
}

// ==================== MEDIA_STATUS POUR AUDIO ====================
playerManager.addEventListener(
  cast.framework.events.EventType.MEDIA_STATUS,
  (event) => {
    if (!isAudioContent || !event.mediaStatus) return;

    const newTime = event.mediaStatus.currentTime;
    if (typeof newTime === "number" && !isNaN(newTime)) {
      audioCurrentTimeSec = newTime;           // ⚡ SEEK détecté
      updateAudioProgressUI();
      console.log(`[Audio SEEK] currentTime mis à jour: ${audioCurrentTimeSec}s`);
    }

    audioIsPlaying = (event.mediaStatus.playerState === "PLAYING");
    if (audioIsPlaying) startAudioTimer();
    else stopAudioTimer();
  }
);

// ==================== PROGRESS POUR VIDEO ====================
playerManager.addEventListener(
  cast.framework.events.EventType.PROGRESS,
  (event) => {
    if (isAudioContent) return;  // AUDIO géré par timer
    if (!mediaDuration || mediaDuration <= 0) return;

    const currentTime = (typeof event.currentTime === "number") ? event.currentTime : event.currentMediaTime;
    if (typeof currentTime !== "number" || isNaN(currentTime)) return;

    const pct = (currentTime / mediaDuration) * 100;
    progressBar.style.width = pct + "%";
    currentTimeElem.textContent = formatTime(currentTime);
    totalTimeElem.textContent = formatTime(mediaDuration);

    console.log(`[Video PROGRESS] currentTime=${currentTime.toFixed(1)}s | duration=${mediaDuration.toFixed(1)}s | pct=${pct.toFixed(2)}%`);
  }
);

// ==================== NOUVEAU : Fonctions d'affichage Image / Video ====================
/**
 * showImage(url, next, next2)
 * - affiche l'image full screen
 * - précharge next / next2
 */
function showImage(url, next = null, next2 = null) {
  if (!imageViewer) return;
  if (!url) return console.warn("showImage: url manquante");

  console.log("showImage ->", url);

  // masquer audio / vidéo
  if (audioUI) audioUI.style.display = 'none';
  const player = document.getElementById("player");
  if (player) {
    try { player.pause(); } catch(e){}
    player.style.display = 'none';
  }

  // afficher écran de chargement
  if (imageLoading) imageLoading.style.display = 'block';

  // préchargement principal : on utilise un Image() pour charger et mesurer
  const img = new Image();
  img.onload = () => {
    // swap src only after loaded to avoid flicker
    imageViewer.src = url;
    imageViewer.style.display = 'block';
    // small timeout to ensure display applied, then fade-in
    requestAnimationFrame(() => {
      imageViewer.style.opacity = '1';
    });
    // hide loading overlay
    if (imageLoading) imageLoading.style.display = 'none';
    console.log("Image chargée et affichée:", url);
  };
  img.onerror = () => {
    console.warn("Erreur chargement image:", url);
    if (imageLoading) imageLoading.style.display = 'none';
  };
  img.src = url;

  // Préchargement suivant(s)
  if (next) {
    try { (new Image()).src = next; } catch(e) {}
  }
  if (next2) {
    try { (new Image()).src = next2; } catch(e) {}
  }

  // masquer bottom-ui car image est plein écran
  if (bottomUI) bottomUI.classList.remove("show");
  // retirer overlay logo initial
  const overlay = document.getElementById("overlay");
  if (overlay) overlay.style.display = 'none';
}

/**
 * hideImage() : cache l'image et rétablit overlay et player si besoin
 */
function hideImage() {
  if (!imageViewer) return;
  imageViewer.style.opacity = '0';
  if (imageLoading) imageLoading.style.display = 'none';
  setTimeout(() => {
    try { imageViewer.style.display = 'none'; imageViewer.src = ''; } catch(e){}
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.style.display = 'flex';
  }, 350);
}

/**
 * showVideo(url, title, thumbnail)
 * - utilise ton <video id="player"> existant
 */
function showVideo(url, title, thumbnail) {
  console.log("showVideo ->", url);

  // masquer image
  if (imageViewer) { imageViewer.style.opacity = '0'; setTimeout(()=>{ if (imageViewer) imageViewer.style.display = 'none'; }, 350); }
  if (imageLoading) imageLoading.style.display = 'none';

  // masquer audio
  if (audioUI) audioUI.style.display = 'none';

  const player = document.getElementById("player");
  if (!player) {
    console.warn("player non trouvé pour showVideo");
    return;
  }

  // affecter la source, relancer le player
  try {
    player.pause();
    player.src = url;
    player.load();
    player.style.display = "block";
    player.play().catch(e => console.warn("play() rejected:", e));
  } catch (e) {
    console.error("Erreur lors du showVideo:", e);
  }

  // si tu veux afficher le thumbnail quelque part, tu peux utiliser le param thumbnail
  if (thumbnail) {
    const videoThumbnail = document.getElementById("video-thumbnail");
    const videoThumbnailSmall = document.getElementById("video-thumbnail-small");
    if (videoThumbnail) videoThumbnail.src = thumbnail;
    if (videoThumbnailSmall) videoThumbnailSmall.src = thumbnail;
  }

  // retirer overlay logo initial
  const overlay = document.getElementById("overlay");
  if (overlay) overlay.style.display = 'none';
}

// ==================== START RECEIVER ========================
context.start();

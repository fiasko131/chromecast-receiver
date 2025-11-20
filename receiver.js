// ==================== INIT ====================
cast.framework.CastReceiverContext.getInstance().setLoggerLevel(cast.framework.LoggerLevel.DEBUG);

// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
// 🚫 Empêche le PlayerManager d'essayer de lire les images (sinon IDLE → écran d'accueil)
/*playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  message => {
      if (message.media && message.media.contentType 
          && message.media.contentType.startsWith("image/")) {
          console.log("[RECEIVER] Intercepteur: image => gestion manuelle");
          return null; // on bloque le PlayerManager pour les images
      }
      return message; // vidéo/audio continue normalement
  }
);*/

let mediaDuration = 0;                // durée du média en secondes
let hideProgressTimeout = null;       // timer pour cacher bottom-ui (vidéo)
let lastPlayerState = null;           // filtrage apparition répétée
let isAudioContent = false;           // ⚡ true si média audio

// ⚡ Audio uniquement
let audioCurrentTimeSec = 0;
let audioTimer = null;
let audioIsPlaying = false;

// ==================== IMAGE NAMESPACE & STATE ====================
const IMAGE_NAMESPACE = 'urn:x-cast:com.wizu.images';

// Liste d'URLs d'images (fournie par l'app Android via LOAD_IMAGE_LIST)
let imageList = [];            // Array of string URLs
let currentImageIndex = 0;     // index dans imageList
const imageCache = {};         // url -> HTMLImageElement (preloaded)
const PRELOAD_AHEAD = 2;       // combien d'images précharger
// mode manuel d'affichage d'images : si true on ignore certains changements d'état player
let displayingManualImage = false;

// Helper : précharge une image et la stocke dans imageCache
function preloadImage(url) {
  if (!url) return;
  if (imageCache[url] && imageCache[url].complete) return; // déjà chargé
  const img = new Image();
  img.onload = () => {
    console.log("Image préchargée:", url);
    imageCache[url] = img;
  };
  img.onerror = (e) => {
    console.warn("Erreur préchargement image:", url, e);
    // on conserve l'objet pour éviter reessayages immédiats
    imageCache[url] = img;
  };
  img.src = url;
  // stocker même si pas encore complete pour marquer tentative
  imageCache[url] = img;
}

// Affiche l'image d'index donné (0..n-1)
/*function showImageAtIndex(index) {
  if (!Array.isArray(imageList) || imageList.length === 0) return;
  if (index < 0) index = 0;
  if (index >= imageList.length) index = imageList.length - 1;

  currentImageIndex = index;
  const url = imageList[currentImageIndex];
  console.log("Affichage image index=", currentImageIndex, "url=", url);

  // si l'image est préchargée, on l'utilise, sinon on met directement le src
  if (imageCache[url] && imageCache[url].complete) {
    // si le navigateur a préchargé, on peut utiliser le data directement
    imageDisplay.src = url;
  } else {
    // fallback : assigner l'URL (le navigateur va charger)
    imageDisplay.src = url;
    // essayer de précharger au cas où
    preloadImage(url);
  }

  // Masque audio/vidéo
  if (document.getElementById("player")) document.getElementById("player").style.display = "none";
  if (audioUI) audioUI.style.display = "none";
  if (bottomUI) bottomUI.classList.remove("show");
  if (pauseIcon) pauseIcon.style.display = "none";
  if (audioPauseIcon) audioPauseIcon.style.display = "none";

  // Affiche image UI
  if (imageUI) imageUI.style.display = "flex";
  document.body.classList.add("playing");

  // précharge les suivantes
  for (let i = 1; i <= PRELOAD_AHEAD; i++) {
    const idx = currentImageIndex + i;
    if (idx < imageList.length) preloadImage(imageList[idx]);
  }
}*/
/*function showImageAtIndex(index) {
    if (!Array.isArray(imageList) || imageList.length === 0) return;
    if (index < 0) index = 0;
    if (index >= imageList.length) index = imageList.length - 1;

    currentImageIndex = index;
    const url = imageList[currentImageIndex];
    console.log("Affichage image index=", currentImageIndex, "url=", url);

    // Masque audio/vidéo immédiatement
    if (document.getElementById("player")) document.getElementById("player").style.display = "none";
    if (audioUI) audioUI.style.display = "none";
    if (bottomUI) bottomUI.classList.remove("show");
    if (pauseIcon) pauseIcon.style.display = "none";
    if (audioPauseIcon) audioPauseIcon.style.display = "none";

    // Affichage de l'image : si déjà préchargée et complète, on affiche immédiatement
    if (imageCache[url] && imageCache[url].complete) {
        imageDisplay.src = url;
        if (imageUI) imageUI.style.display = "flex";
        document.body.classList.add("playing");
    } else {
        // Sinon, crée une Image temporaire et attend le chargement
        const tempImg = new Image();
        tempImg.onload = () => {
            console.log("Image prête à l'affichage:", url);
            imageDisplay.src = url;
            if (imageUI) imageUI.style.display = "flex";
            document.body.classList.add("playing");
        };
        tempImg.onerror = (e) => {
            console.warn("Erreur chargement image pour affichage:", url, e);
        };
        tempImg.src = url;

        // Stocke quand même dans le cache pour préchargement
        imageCache[url] = tempImg;
    }

    // Précharge les images suivantes
    for (let i = 1; i <= PRELOAD_AHEAD; i++) {
        const idx = currentImageIndex + i;
        if (idx < imageList.length) preloadImage(imageList[idx]);
    }
}*/

let firstImageShown = false;

function showImageAtIndex(index) {
  if (!Array.isArray(imageList) || imageList.length === 0) return;
  if (index < 0) index = 0;
  if (index >= imageList.length) index = imageList.length - 1;

  currentImageIndex = index;
  const url = imageList[currentImageIndex];
  console.log("[RECEIVER] Affichage index=", index, "url=", url);

  // on attend que le DOM soit prêt au cas où
  const startDisplay = () => {
    // vérif si déjà préchargée
    if (imageCache[url] && imageCache[url].complete) {
      displayImage(url);
    } else {
      preloadAndShow(url);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startDisplay);
  } else {
    startDisplay();
  }

  // précharge les images suivantes
  for (let i = 1; i <= PRELOAD_AHEAD; i++) {
    const idx = currentImageIndex + i;
    if (idx < imageList.length) preloadImage(imageList[idx]);
  }
}

// charge + affiche en garantissant le rendu
function preloadAndShow(url) {
  const img = new Image();
  img.onload = () => {
    imageCache[url] = img;
    displayImage(url);
  };
  img.src = url;
}

// affiche vraiment l’image + UI
function displayImage(url) {
  console.log("[RECEIVER] displayImage:", url);

  // Indique qu'on est en mode affichage manuel d'image
  displayingManualImage = true;

  imageDisplay.src = url;

  // Sécurité première image : empêche UI hidden trop tôt
  if (!firstImageShown) {
    imageUI.style.display = "flex";
    document.body.classList.add("playing");
    firstImageShown = true;
  } else {
    // images suivantes : logique normale
    imageUI.style.display = "flex";
  }

  // masquage du player/audio
  const p = document.getElementById("player");
  if (p) p.style.display = "none";
  if (audioUI) audioUI.style.display = "none";
  if (pauseIcon) pauseIcon.style.display = "none";
  if (audioPauseIcon) audioPauseIcon.style.display = "none";
  if (bottomUI) bottomUI.classList.remove("show");
}




// Reçoit messages images (CAF v3)
context.addCustomMessageListener(IMAGE_NAMESPACE, (event) => {
  try {
    const data = event.data;
    console.log("Message IMAGE reçu:", data);

    if (!data || !data.type) return;
    console.log("data.type:", data.type);
    switch (data.type) {
      case 'LOAD_IMAGE_LIST':
      case 'LOAD_LIST':
        // data.urls : array of strings
        // data.index : optional start index in that array
        if (Array.isArray(data.urls)) {
          imageList = data.urls.slice(); // clone
          // reset cache? On garde cache existant (performances)
          const idx = (typeof data.index === 'number' && data.index >= 0) ? data.index : 0;
          currentImageIndex = Math.min(Math.max(0, idx), imageList.length - 1);
          // précharge initial
          preloadImage(imageList[currentImageIndex]);
          if (imageList[currentImageIndex + 1]) preloadImage(imageList[currentImageIndex + 1]);
          if (imageList[currentImageIndex + 2]) preloadImage(imageList[currentImageIndex + 2]);
          // afficher
          //showImageAtIndex(currentImageIndex);
          setTimeout(() => {
            showImageAtIndex(currentImageIndex);
          }, 50);
        } else {
          console.warn("LOAD_LIST sans urls valides");
        }
        break;

      case 'SET_INDEX':
        // data.index must be index in imageList
        if (typeof data.index === 'number') {
          const idxSet = Math.min(Math.max(0, data.index), imageList.length - 1);
          showImageAtIndex(idxSet);
        } else {
          console.warn("SET_INDEX sans index numérique");
        }
        break;

      case 'LOAD_IMAGE':
        // legacy single image load
        if (data.url) {
          // treat as single-element list
          imageList = [data.url];
          currentImageIndex = 0;
          preloadImage(data.url);
          showImageAtIndex(0);
        }
        break;

      case 'NEXT_IMAGE':
        // optionally accept data.index (explicit) or increment
        if (typeof data.index === 'number') {
          showImageAtIndex(data.index);
        } else {
          showImageAtIndex(Math.min(currentImageIndex + 1, imageList.length - 1));
        }
        break;

      case 'PREV_IMAGE':
      case 'BEFORE_IMAGE':
        if (typeof data.index === 'number') {
          showImageAtIndex(data.index);
        } else {
          showImageAtIndex(Math.max(currentImageIndex - 1, 0));
        }
        break;

      default:
        console.log("Message IMAGE non géré:", data.type);
    }
  } catch (err) {
    console.error("Erreur traitement message image:", err);
  }
});

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

    if (loadRequestData.media.metadata) {
      const meta = loadRequestData.media.metadata;
      const titleText = meta.title || "In Progress...";

      // --- Titre ---
      if (videoTitle) videoTitle.textContent = titleText || "unknown title";
      if (videoTitleSmall) videoTitleSmall.textContent = titleText;
      if (audioTitle) audioTitle.textContent = titleText;

      // --- Album & Artiste (audio) ---
      if (audioAlbum) audioAlbum.textContent = "Album: "+meta.albumName || "Album: unknown";
      if (audioArtist) audioArtist.textContent = "Artist: "+meta.artist || "Artist: unknown";

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

// Image
const imageUI = document.getElementById("image-ui");
const imageDisplay = document.getElementById("image-display");
imageDisplay.onerror = (e) => {
  console.error("❌ ERREUR CHARGEMENT IMAGE:", imageList[currentImageIndex], e);
  imageDisplay.src = "";       // vide pour éviter boucle
  imageDisplay.style.background = "#111";  // indication visuelle
};

// 🎉 Handler de succès UNE SEULE FOIS
imageDisplay.onload = () => {
  console.log("✅ IMAGE CHARGÉE OK:", imageList[currentImageIndex]);
};

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

// Affiche image fullscreen (compatibilité avec showImageAtIndex)
function showImage(url) {
  // garder pour compat / legacy: affiche une image simple
  if (!url) return;
  if (!imageUI || !imageDisplay) return;

  imageDisplay.src = url;
  // Masque audio et vidéo
  if (document.getElementById("player")) document.getElementById("player").style.display = "none";
  if (audioUI) audioUI.style.display = "none";
  if (bottomUI) bottomUI.classList.remove("show");
  if (pauseIcon) pauseIcon.style.display = "none";
  if (audioPauseIcon) audioPauseIcon.style.display = "none";

  // Affiche image
  imageUI.style.display = "flex";
  document.body.classList.add("playing");
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

  // Masque image si lecture audio ou vidéo
  if (imageUI) imageUI.style.display = "none";

  switch(state) {
    case cast.framework.ui.State.PLAYING:
      displayingManualImage = false;
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
      if (displayingManualImage) {
      console.log("[RECEIVER] Ignorer IDLE pour image manuelle");
      break;
      }
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

// ==================== START RECEIVER ========================
context.start();
context.addEventListener(cast.framework.system.EventType.SYSTEM_STATE_CHANGED, (event) => {
  console.warn("⚠️ SYSTEM STATE:", event.state);
  if (event.state === cast.framework.system.SystemState.IDLE) {
    console.error("🚨 Retour au logo détecté !");
  }
});

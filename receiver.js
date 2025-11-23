// ==================== INIT ====================
cast.framework.CastReceiverContext.getInstance().setLoggerLevel(cast.framework.LoggerLevel.DEBUG);

// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// pour la première video en mode custom
let firstVideoLoadReceived = false;
let pendingVideoUrl = null;




let mediaDuration = 0;                // durée du média en secondes
let hideProgressTimeout = null;       // timer pour cacher bottom-ui (vidéo)
let lastPlayerState = null;           // filtrage apparition répétée
let isAudioContent = false;           // ⚡ true si média audio

// ⚡ Audio uniquement
let audioCurrentTimeSec = 0;
let audioTimer = null;
let audioIsPlaying = false;
let videoProgressTimer = null;


// ==================== IMAGE NAMESPACE & STATE ====================
const IMAGE_NAMESPACE = 'urn:x-cast:com.wizu.images';

function sendImageUpdate(data) {
  try {
    context.sendCustomMessage(IMAGE_NAMESPACE, undefined, data);
    console.log("[RECEIVER] ➡️ Message envoyé:", data);
  } catch (e) {
    console.warn("[RECEIVER] ⚠️ Erreur envoi custom message:", e);
  }
}

function startVideoProgressUpdates(videoElement) {
  stopVideoProgressUpdates(); // sécurité

  videoProgressTimer = setInterval(() => {
    if (!videoElement || videoElement.readyState === 0) return;

    const current = Math.floor(videoElement.currentTime * 1000);
    const duration = Math.floor(videoElement.duration * 1000);

    if (!isNaN(current) && !isNaN(duration) && duration > 0) {
      sendImageUpdate({
        type: "PROGRESS",
        current,
        duration,
        index: currentImageIndex
      });
    }
  }, 500); // toutes les 500ms
}

function stopVideoProgressUpdates() {
  if (videoProgressTimer) {
    clearInterval(videoProgressTimer);
    videoProgressTimer = null;
  }
}

function isPlayingVideo(video) {
  return (
    video &&
    !video.paused &&
    !video.ended &&
    video.readyState >= 2
  );
}

function sendStateInfoVideo() {
  if (!window.cast || !window.cast.framework) return;

  let state;

  if (!playerManager) {
    state = "none";
  } else {
    // Récupérer l'état du player CAF
    const pmState = playerManager.getPlayerState(); // renvoie "IDLE", "PLAYING", "PAUSED", "BUFFERING"

    switch(pmState) {
      case cast.framework.ui.State.PLAYING:
        state = "playing";
        break;
      case cast.framework.ui.State.PAUSED:
        state = "paused";
        break;
      case cast.framework.ui.State.BUFFERING:
        state = "buffering";
        break;
      case cast.framework.ui.State.IDLE:
        state = "none"; // ou "ended" si tu veux détecter fin
        break;
      default:
        state = "unknown";
        break;
    }
  }

  context.sendCustomMessage(IMAGE_NAMESPACE, {
    type: "STATE_INFO_VIDEO",
    state: state,
    index: currentImageIndex,
    url: imageList[currentImageIndex]
  });
}




// Liste d'URLs d'images (fournie par l'app Android via LOAD_IMAGE_LIST)
// NOTE : ce tableau devient mixte (images, videos, audio); on garde le nom imageList pour compatibilité
let imageList = [];            // Array of string URLs
let currentImageIndex = 0;     // index dans imageList
const imageCache = {};         // url -> HTMLImageElement or VideoElement (preloaded)
const PRELOAD_AHEAD = 2;       // combien d'images précharger
// mode manuel d'affichage d'images : si true on ignore certains changements d'état player
let displayingManualImage = false;
let displayingManualVideo = false; // nouveau flag pour video gérée manuellement
let firstImageShown = false;
let v = null // video player;




// -------------------- Helpers type de média --------------------
// Détection par suffixe/url comme demandé : /v pour vidéo, /a pour audio
function isVideoUrl(url) {
  return url && url.indexOf("/v") !== -1;
}
function isAudioUrl(url) {
  return url && url.indexOf("/a") !== -1;
}
function isImageUrl(url) {
  return url && !isVideoUrl(url) && !isAudioUrl(url);
}

// -------------------- Préchargement --------------------
// Helper : précharge une image et la stocke dans imageCache
function preloadImage(url) {
  if (!url) return;
  if (imageCache[url] && imageCache[url].complete) return; // déjà chargé (pour image)
  // Si c'est une vidéo, utiliser preloadVideo (voir plus bas)
  if (isVideoUrl(url)) {
    preloadVideo(url);
    return;
  }
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

// préchargement vidéo minimal : crée un element <video> en mémoire et preload metadata
function preloadVideo(url) {
  if (!url) return;
  if (imageCache[url]) return; // marqueur déjà
  try {
    const v = document.createElement('video');
    v.preload = "metadata";
    v.src = url;
    // on ne l'ajoute pas au DOM, on le garde en cache pour marquer préchargement
    imageCache[url] = v;
    v.onloadedmetadata = () => {
      console.log("Video préchargée metadata:", url);
    };
    v.onerror = (e) => {
      console.warn("Erreur préchargement video:", url, e);
    };
  } catch (e) {
    console.warn("Preload video non supporté :", e);
  }
}

// -------------------- Affichage (image) --------------------
function showImageAtIndex(index) {
  stopVideoProgressUpdates();
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

  // send to android
  sendImageUpdate({
    type: 'CURRENT_INDEX',
    index: currentImageIndex,
    url: url,
    kind: 'image'
  });

  // précharge les images / videos suivantes
  for (let i = 1; i <= PRELOAD_AHEAD; i++) {
    const idx = currentImageIndex + i;
    if (idx < imageList.length) {
      const nextUrl = imageList[idx];
      if (isVideoUrl(nextUrl)) preloadVideo(nextUrl);
      else preloadImage(nextUrl);
    }
  }
}

// charge + affiche en garantissant le rendu (images)
function preloadAndShow(url) {
  const img = new Image();
  img.onload = () => {
    imageCache[url] = img;
    displayImage(url);
  };
  img.onerror = (e) => {
    console.warn("preloadAndShow failed:", url, e);
    displayImage(url); // tenter quand même (affichera erreur si corrompu)
  };
  img.src = url;
}

// affiche vraiment l’image + UI
function displayImage(url) {
  console.log("[RECEIVER] displayImage:", url);

  // Indique qu'on est en mode affichage manuel d'image
  displayingManualImage = true;
  displayingManualVideo = false;

  // Met à jour l'élément image
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

// -------------------- VIDEO / AUDIO manuel via <video id="player"> --------------------
// Arrête et nettoie le player manuel si on en avait un
function stopManualVideoIfAny() {
  const v = document.getElementById("player");
  if (v) {
    try { v.pause(); } catch (e) { /* ignore */ }
    try { v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ }
    v.style.display = "none";
  }
  displayingManualVideo = false;
}

function playPendingVideo() {
  const v = document.getElementById("player");
  if (!v || !pendingVideoUrl) return;

  v.src = pendingVideoUrl;
  v.play().catch(e => console.warn("Erreur lecture vidéo initiale:", e));
  pendingVideoUrl = null;
}

function castLoadVideo(url) {
  const mediaInfo = new cast.framework.messages.MediaInformation();
  mediaInfo.contentId = url;
  mediaInfo.contentType = "video/mp4"; // ou détecter dynamiquement

  const request = new cast.framework.messages.LoadRequestData();
  request.autoplay = false;  // on n’auto-joue PAS
  request.media = mediaInfo;

  console.log("[RECEIVER] Envoi d’un LOAD vidéo CAF pour éviter le timeout");
  playerManager.load(request);
}



// Fonction qui affiche une vidéo (utilise ton <video id="player">)
// Ce comportement lit la vidéo localement (par ton nano server) sans dépendre d'un LOAD CAF
function showVideoAtIndex(index) {
  if (!Array.isArray(imageList) || imageList.length === 0) return;
  if (index < 0) index = 0;
  if (index >= imageList.length) index = imageList.length - 1;

  currentImageIndex = index;
  const url = imageList[currentImageIndex];
  console.log("[RECEIVER] Affichage VIDEO index=", index, "url=", url);

  // send message to android
  sendImageUpdate({
    type: 'CURRENT_INDEX',
    index: currentImageIndex,
    url: url,
    kind: 'video'
  });


  // Mode manuel vidéo
  displayingManualVideo = true;
  displayingManualImage = false;

  // Masquer image et audio UI
  if (imageUI) imageUI.style.display = "none";
  if (audioUI) audioUI.style.display = "none";

  v = document.getElementById("player");
  startVideoProgressUpdates(v);
  if (!v) {
    console.error("player element introuvable");
    return;
  }

  // reset
  try { v.pause(); } catch(e){}
  try { v.removeAttribute('src'); v.load(); } catch(e){}

  // config
  v.preload = "auto"; // on souhaite un démarrage rapide
  v.src = url;
  v.style.display = "block";
  document.body.classList.add("playing");
  if (bottomUI) bottomUI.classList.add("show");

  // events
  v.onplay = () => {
    startVideoProgressUpdates(v);
    sendImageUpdate({ type: 'PLAYER_STATE', state: 'PLAYING', index: currentImageIndex });
    console.log("[RECEIVER] video onplay");
    if (pauseIcon) pauseIcon.style.display = "none";
    isAudioContent = false;
  };
  v.onpause = () => {
    stopVideoProgressUpdates();
    sendImageUpdate({ type: 'PLAYER_STATE', state: 'PAUSED', index: currentImageIndex });
    console.log("[RECEIVER] video onpause");
    if (pauseIcon) pauseIcon.style.display = "block";
  };
  v.ondurationchange = () => {
    mediaDuration = v.duration || 0;
    if (totalTimeElem) totalTimeElem.textContent = formatTime(mediaDuration);
  };
  v.ontimeupdate = () => {
    if (!mediaDuration || mediaDuration <= 0) {
      // tenter d'initialiser si non set
      if (v.duration && v.duration > 0) mediaDuration = v.duration;
      else return;
    }
    const pct = (v.currentTime / mediaDuration) * 100;
    if (progressBar) progressBar.style.width = pct + "%";
    if (currentTimeElem) currentTimeElem.textContent = formatTime(v.currentTime);
  };
  v.onended = () => {
    stopVideoProgressUpdates();
    sendImageUpdate({ type: 'PLAYER_STATE', state: 'ENDED', index: currentImageIndex });
    console.log("[RECEIVER] video ended");
    if (bottomUI) bottomUI.classList.remove("show");
    displayingManualVideo = false;
  };

  // tentative autoplay
  v.play().catch((err) => {
    console.warn("Auto-play échoué:", err);
  });
}

// Option pour audio si souhaité (placeholder simple)
function showAudioAtIndex(index) {
  currentImageIndex = index;
  const url = imageList[currentImageIndex];
  console.log("[RECEIVER] Affichage AUDIO index=", index, "url=", url);

  // send message to android
  sendImageUpdate({
    type: 'CURRENT_INDEX',
    index: currentImageIndex,
    url: url,
    kind: 'audio'
  });

  // Ici on choisit une implémentation simple : utiliser playerManager.load si on veut
  // permettre au cast standard d'afficher la UI audio (metadata, contrôle remote).
  // On peut aussi implémenter <audio> local similaire à <video>.
  try {
    // Construire un LoadRequestData pour déléguer au CAF
    const mediaInfo = new cast.framework.messages.MediaInformation();
    mediaInfo.contentId = url;
    mediaInfo.contentType = "audio/mpeg";
    mediaInfo.streamType = "BUFFERED";
    const req = new cast.framework.messages.LoadRequestData();
    req.media = mediaInfo;
    // Laisser CAF gérer l'audio (UI audio existante)
    playerManager.load(req);
  } catch (e) {
    console.error("Erreur lancement audio via CAF :", e);
    // fallback : afficher audio UI statique
    if (audioUI) audioUI.style.display = "flex";
    document.body.classList.add("playing");
  }
}

// ==================== Reçoit messages images / playlist (CAF v3) ====================
context.addCustomMessageListener(IMAGE_NAMESPACE, (event) => {
  try {
    const data = event.data;
    console.log("Message IMAGE reçu:", data);

    if (!data || !data.type) return;
    console.log("data.type:", data.type);

    // ============================================================
    // 🔧 AJOUT VIDEO CAF : fonction d’aide
    // ============================================================
    function loadVideoViaCAF(url, title = "Video", contentType = "video/mp4", durationMs = 0) {
  console.log("🎬 [CAF] Chargement vidéo via PlayerManager:", url);

  const mediaInfo = new cast.framework.messages.MediaInformation();
  mediaInfo.contentId = url;
  mediaInfo.contentType = contentType;

  // ⚡ Ajouter la durée si fournie (en secondes)
  if (durationMs > 0) {
    mediaInfo.streamDuration = durationMs / 1000; // convert ms → s
    console.log("Durée fournie pour CAF:", mediaInfo.streamDuration, "s");
  }

  const md = new cast.framework.messages.GenericMediaMetadata();
  md.title = title;
  mediaInfo.metadata = md;

  const req = new cast.framework.messages.LoadRequestData();
  req.media = mediaInfo;
  req.autoplay = true;

  // empêche votre lecteur <video> d'interférer
  displayingManualVideo = false;

  playerManager.load(req).then(() => {
    console.log("🎉 Lecture CAF OK");
  }).catch(e => console.error("❌ Erreur load CAF:", e));
}


    // ============================================================
    // 🔧 AJOUT VIDEO CAF : wrapper pour remplacer votre castLoadVideo
    // ============================================================
    function castLoadVideoCAF(url,title,mime,durationMs) {
      loadVideoViaCAF(url,title,mime,durationMs);  // simple délégation
    }

    switch (data.type) {
      case "GET_STATE_VIDEO":
        sendStateInfoVideo();
        break;

      case "PLAY_VIDEO":
        if (playerManager && playerManager.getPlayerState() !== cast.framework.ui.State.PLAYING) {
          playerManager.play().catch(err => console.warn("Erreur play via CAF:", err));
        }
        break;

      case "PAUSE_VIDEO":
        if (playerManager && playerManager.getPlayerState() === cast.framework.ui.State.PLAYING) {
          playerManager.pause();
        }
        break;

        case "SEEK_VIDEO":
          if (playerManager && typeof data.position === "number") {
            // ⚡ seek en secondes
            playerManager.seek(data.position/1000);
          }
          break;
      case 'LOAD_IMAGE_LIST':
      case 'LOAD_LIST':
        if (Array.isArray(data.urls)) {
          imageList = data.urls.slice(); // clone

          const startIndex = (typeof data.index === 'number' && data.index >= 0) 
                            ? Math.min(Math.max(0, data.index), imageList.length - 1)
                            : 0;
          currentImageIndex = startIndex;
          console.log("[RECEIVER] index ", "data.index "+data.index+ " currentImageIndex "+currentImageIndex);

          // préchargements
          const firstUrl = imageList[currentImageIndex];
          if (isVideoUrl(firstUrl)) preloadVideo(firstUrl); else preloadImage(firstUrl);

          if (imageList[currentImageIndex + 1]) {
            const u1 = imageList[currentImageIndex + 1];
            if (isVideoUrl(u1)) preloadVideo(u1); else preloadImage(u1);
          }
          if (imageList[currentImageIndex + 2]) {
            const u2 = imageList[currentImageIndex + 2];
            if (isVideoUrl(u2)) preloadVideo(u2); else preloadImage(u2);
          }

          // ============================================================
          // votre logique existante pour afficher le premier élément
          // ============================================================
          if (!firstImageShown && imageList.length > 0) {
              const first = imageList[currentImageIndex];

              if (isImageUrl(first)) {
                  displayFirstImage(first);

              } else if (isVideoUrl(first)) {
                  console.log("[RECEIVER] Première vidéo → passage en mode CAF");
                  console.log("[RECEIVER] durationMs "+data.durationms);
                  // 🔧 AJOUT VIDEO CAF : remplacer castLoadVideo par CAF
                  const mimeType = typeof data.mimeType === "string" ? data.mimeType : "video/mp4";
                  const durationMs = typeof data.durationms === "number" ? data.durationms : 0;
                  console.log("[RECEIVER] durationMs "+durationMs);
                  castLoadVideoCAF(first,"video",mimeType,durationMs);

                  pendingVideoUrl = first;
                  firstImageShown = true;

                  // 🔧 AJOUT VIDEO CAF : le CAF gère autoplay
                  pendingVideoUrl = null;

              } else if (isAudioUrl(first)) {
                  showAudioAtIndex(currentImageIndex);
                  firstImageShown = true;
              }

          } else {
              const cur = imageList[currentImageIndex];
              if (isVideoUrl(cur)) {
                  // 🔧 AJOUT VIDEO CAF
                  castLoadVideoCAF(cur);
              } else {
                  showImageAtIndex(currentImageIndex);
              }
          }

        } else {
          console.warn("LOAD_LIST sans urls valides");
        }
        break;

      case 'SET_INDEX':
        if (typeof data.index === 'number') {
          const idxSet = Math.min(Math.max(0, data.index), imageList.length - 1);
          currentImageIndex = idxSet;
          const urlToShow = imageList[idxSet];

          if (isVideoUrl(urlToShow)) {
            // 🔧 AJOUT VIDEO CAF
            castLoadVideoCAF(urlToShow);
          } 
          else if (isAudioUrl(urlToShow)) {
            showAudioAtIndex(idxSet);
          } 
          else {
            showImageAtIndex(idxSet);
          }
        } else {
          console.warn("SET_INDEX sans index numérique");
        }
        break;

      case 'LOAD_IMAGE':
        if (data.url) {
          imageList = [data.url];
          currentImageIndex = 0;
          preloadImage(data.url);
          showImageAtIndex(0);
        }
        break;

      case 'NEXT_IMAGE':
        if (typeof data.index === 'number') {
          const idx = Math.min(Math.max(0,data.index), imageList.length - 1);
          const urlN = imageList[idx];

          if (isVideoUrl(urlN)) 
              castLoadVideoCAF(urlN);  // 🔧 AJOUT VIDEO CAF
          else 
              showImageAtIndex(idx);

        } else {
          const nextIdx = Math.min(currentImageIndex + 1, imageList.length - 1);
          const urlN = imageList[nextIdx];

          if (isVideoUrl(urlN)) 
              castLoadVideoCAF(urlN);  // 🔧 AJOUT VIDEO CAF
          else 
              showImageAtIndex(nextIdx);
        }
        break;

      case 'PREV_IMAGE':
      case 'BEFORE_IMAGE':
        if (typeof data.index === 'number') {
          const idxP = Math.min(Math.max(0, data.index), imageList.length - 1);
          const urlP = imageList[idxP];

          if (isVideoUrl(urlP))
              castLoadVideoCAF(urlP);  // 🔧 AJOUT VIDEO CAF
          else
              showImageAtIndex(idxP);

        } else {
          const prevIdx = Math.max(currentImageIndex - 1, 0);
          const urlP = imageList[prevIdx];

          if (isVideoUrl(urlP))
              castLoadVideoCAF(urlP);  // 🔧 AJOUT VIDEO CAF
          else
              showImageAtIndex(prevIdx);
        }
        break;

      default:
        console.log("Message IMAGE non géré:", data.type);
    }
  } catch (err) {
    console.error("Erreur traitement message image:", err);
  }
});


// -------------------- displayFirstImage existante (inchangée, juste compatible) --------------------
function displayFirstImage(url) {
    // 1️⃣ Crée un média factice pour bloquer le retour au launcher
    const mediaInfo = new cast.framework.messages.MediaInformation();
    mediaInfo.contentId = url;                // ton URL ou base64
    mediaInfo.contentType = "image/webp";     // type MIME
    mediaInfo.streamType = "BUFFERED";
    mediaInfo.metadata = new cast.framework.messages.GenericMediaMetadata();
    mediaInfo.metadata.title = "Image";

    const request = new cast.framework.messages.LoadRequestData();
    request.autoplay = false; // pas de lecture réelle
    request.media = mediaInfo;

    // 2️⃣ Intercepte le playerManager pour ne pas “jouer” l’image
    playerManager.setMessageInterceptor(
        cast.framework.messages.MessageType.LOAD,
        (msg) => {
            if (msg.media && msg.media.contentType && msg.media.contentType.startsWith("image/")) {
                console.log("[RECEIVER] IMAGE interceptée, lecture manuelle");
                // on ignore la lecture réelle → juste rester sur receiver
                return null;
            }
            // si ce n'est pas une image, on arrête le player manuel (video/audio) pour laisser CAF gérer
            stopManualVideoIfAny();
            return msg;
        }
    );

    // 3️⃣ Affiche manuellement la première image dans le DOM
    imageDisplay.src = url;
    imageUI.style.display = "flex";
    document.body.classList.add("playing");
    firstImageShown = true;
    displayingManualImage = true; // flag pour gérer IDLE
}

// ==================== LOAD INTERCEPTOR ====================
// Cet interceptor reste : il collecte les metadata des LOAD CAF et permet au cast classique de fonctionner.
// On y ajoute un stop du player manuel si le LOAD n'est pas une image (pour éviter conflit)
playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  (loadRequest) => {

    // ============================================================
    // 1️⃣ GESTION IMAGE : empêcher CAF de prendre le contrôle
    // ============================================================
    if (loadRequest.media?.contentType?.startsWith("image/")) {
      console.log("[RECEIVER] IMAGE interceptée → affichage manuel");
      showImage(loadRequest.media?.contentId);
      return null; // block CAF player
    }

    // ============================================================
    // 2️⃣ GESTION VIDEO : laisser CAF jouer
    // ============================================================
    console.log("[RECEIVER] VIDEO interceptée:", loadRequest.media?.contentId);
    firstVideoLoadReceived = true;

    if (pendingVideoUrl && pendingVideoUrl === loadRequest.media?.contentId) {
      console.log("[RECEIVER] Lecture de la première vidéo après LOAD…");
      pendingVideoUrl = null;
    }

    // ============================================================
    // 3️⃣ RÉCUPÉRATION DE LA DURÉE
    // ============================================================
    mediaDuration = 0;

    if (loadRequest.media.customData?.durationMs > 0) {
      mediaDuration = loadRequest.media.customData.durationMs / 1000;
      console.log("[DURATION] depuis customData.durationMs =", mediaDuration);
    }
    else if (typeof loadRequest.media.duration === "number" && loadRequest.media.duration > 0) {
      mediaDuration = loadRequest.media.duration;
      console.log("[DURATION] depuis media.duration =", mediaDuration);
    }
    else if (typeof loadRequest.media.streamDuration === "number" && loadRequest.media.streamDuration > 0) {
      mediaDuration = loadRequest.media.streamDuration;
      console.log("[DURATION] depuis media.streamDuration =", mediaDuration);
    }
    else {
      console.log("[DURATION] aucune fournie → CAF devra la détecter");
    }

    // ============================================================
    // 4️⃣ TYPE AUDIO OU VIDEO
    // ============================================================
    const ct = loadRequest.media?.contentType || "";
    isAudioContent = ct.startsWith("audio/");
    console.log("[TYPE] contentType =", ct, "isAudioContent =", isAudioContent);

    // ============================================================
    // 5️⃣ METADATA (titre, artiste, miniature…)
    // ============================================================
    const meta = loadRequest.media.metadata;
    const videoTitle = document.getElementById("video-title");
    const videoThumbnail = document.getElementById("video-thumbnail");
    const videoTitleSmall = document.getElementById("video-title-small");
    const videoThumbnailSmall = document.getElementById("video-thumbnail-small");

    const audioTitle = document.getElementById("track-title");
    const audioAlbum = document.getElementById("track-album");
    const audioArtist = document.getElementById("track-artist");
    const audioThumbnail = document.getElementById("audio-thumbnail");

    if (meta) {
      const titleText = meta.title || "In Progress...";

      if (videoTitle) videoTitle.textContent = titleText;
      if (videoTitleSmall) videoTitleSmall.textContent = titleText;
      if (audioTitle) audioTitle.textContent = titleText;

      if (audioAlbum) audioAlbum.textContent = "Album: " + (meta.albumName || "unknown");
      if (audioArtist) audioArtist.textContent = "Artist: " + (meta.artist || "unknown");

      let imgUrl = meta.images?.[0]?.url || "assets/placeholder.png";
      if (videoThumbnail) videoThumbnail.src = imgUrl;
      if (videoThumbnailSmall) videoThumbnailSmall.src = imgUrl;
      if (audioThumbnail) audioThumbnail.src = imgUrl;
    }

    // ============================================================
    // 6️⃣ STOP MANUEL PLAYER
    // ============================================================
    if (!ct.startsWith("image/")) {
      stopManualVideoIfAny();
    }

    // Laisser CAF charger normalement
    return loadRequest;
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
  console.log("[RECEIVER] handlePlayerState "+state);
  if (state === lastPlayerState) return;
  lastPlayerState = state;

  // Si on affiche manuellement une image, on ignore certains IDLE envoyés par CAF
  if (displayingManualImage && state === cast.framework.ui.State.IDLE) {
    console.log("[RECEIVER] Ignorer IDLE pour image manuelle");
    return;
  }
  // Si on affiche manuellement une video via notre <video>, on ignore aussi certains états CAF
  if (displayingManualVideo && (state === cast.framework.ui.State.IDLE || state === cast.framework.ui.State.LAUNCHING)) {
    console.log("[RECEIVER] Ignorer state CAF car affichage manuel video");
    return;
  }

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
      console.log("PlayerData.STATE_CHANGED:", e.value+" "+displayingManualImage);
      
      if (displayingManualImage && e.value === cast.framework.ui.State.IDLE) {
        //setTimeout(() => handlePlayerState(e.value), 5000);
        return;
      }
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

    const currentTime = (typeof event.currentTime === "number") 
                          ? event.currentTime 
                          : event.currentMediaTime;
    if (typeof currentTime !== "number" || isNaN(currentTime)) return;

    const pct = (currentTime / mediaDuration) * 100;
    progressBar.style.width = pct + "%";
    currentTimeElem.textContent = formatTime(currentTime);
    totalTimeElem.textContent = formatTime(mediaDuration);

    console.log(`[Video PROGRESS] currentTime=${currentTime.toFixed(1)}s | duration=${mediaDuration.toFixed(1)}s | pct=${pct.toFixed(2)}%`);

    // 🔹 Envoi à Android via custom message
    context.sendCustomMessage(IMAGE_NAMESPACE, {
        type: 'PROGRESS',
        current: currentTime,
        duration: mediaDuration
    });
  }
);

// ==================== STATUS POUR PREMI7RE VIDEO CUSTOM ====================
// ==================== STATUS POUR VIDEO ====================
playerManager.addEventListener(
  cast.framework.events.EventType.MEDIA_STATUS,
  (event) => {

    const state = playerManager.getPlayerState(); // string

    let status;
    if (state === "PLAYING") status = "playing";
    else if (state === "PAUSED") status = "paused";
    else if (state === "BUFFERING") status = "buffering";
    else if (state === "IDLE") {

      // ⚡ détecter FIN de lecture
      const ct = playerManager.getCurrentTime ? playerManager.getCurrentTime() : 0;
      const dur = playerManager.getDuration ? playerManager.getDuration() : 0;

      if (dur > 0 && ct >= dur - 0.5) {
        status = "ended";       // 🎉 FIN TERMINÉE
      } else {
        status = "idle";        // 💤 idle normal (arrêt, pas de média)
      }
    } else {
      status = (typeof state === "string") ? state.toLowerCase() : "unknown";
    }

    console.log("[Video STATE] =>", status);

    // 🔃 Envoi au téléphone
    context.sendCustomMessage(IMAGE_NAMESPACE, {
      type: 'PLAYER_STATE',
      state: status,
      index: currentImageIndex,
      url: imageList[currentImageIndex]
    });
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

// ==================== INIT ====================
cast.framework.CastReceiverContext.getInstance().setLoggerLevel(cast.framework.LoggerLevel.DEBUG);

// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// pour la première video en mode custom
let firstVideoLoadReceived = false;
let pendingVideoUrl = null;
let phoneIpAndPort = null; // Variable globale pour stocker l'hôte

let isCAFReady = false;
const messageBuffer = [];  // stocke tous les messages à envoyer





let mediaDuration = 0;                // durée du média en secondes
let hideProgressTimeout = null;       // timer pour cacher bottom-ui (vidéo)
let lastPlayerState = null;           // filtrage apparition répétée
let isAudioContent = false;           // ⚡ true si média audio

// ⚡ Audio uniquement
let audioCurrentTimeSec = 0;
let audioTimer = null;
let audioIsPlaying = false;
let videoProgressTimer = null;
let seekingInProgress = false;
let transcoding = false;
let seekBarDuration = 0;


// ==================== IMAGE NAMESPACE & STATE ====================
const IMAGE_NAMESPACE = 'urn:x-cast:com.wizu.images';
let imagesSenderId = null;

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
    const pmState = playerManager.getPlayerState();
    const stateStr = String(pmState).trim(); // convertit en string, retire espaces invisibles

    switch(stateStr) {
      case "PLAYING":
        state = "playing";
        break;
      case "PAUSED":
        state = "paused";
        break;
      case "BUFFERING":
        state = "buffering";
        break;
      case "IDLE":
        state = "none";
        break;
      default:
        state = "unknown";
    }
  }

  context.sendCustomMessage(IMAGE_NAMESPACE,imagesSenderId, {
    type: "STATE_INFO_VIDEO",
    state: state,
    index: currentImageIndex,
    url: imageList[currentImageIndex],
    duration: Math.round(playerManager.getDurationSec() * 1000),
    current: Math.round(playerManager.getCurrentTimeSec() * 1000)
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
let currentAbortController = null;  // pour annuler la sonde HTML5 si nécessaire
let thumbUrl = null; // video thumnnailUrl pour custom
let lastImageIndex = 0;





// -------------------- Helpers type de média --------------------
// Détection par suffixe/url comme demandé : /v pour vidéo, /a pour audio
function isVideoUrl(url) {
  if (!url) return false;
  if (url.startsWith("{")) return true;

  try {
    const u = new URL(url);

    // Condition 1 : l'URL contient /v
    const hasV = u.pathname.endsWith("/v") || u.pathname.includes("/v/");


    return hasV ;
  } catch (e) {
    // URL invalide → fallback ancienne méthode
    return url.includes("/v") || url.includes(":9020");
  }
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
  
  /*if (!url) return;
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
  }*/
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
      displayImage(url,index);
    } else {
      preloadAndShow(url,index);
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

function animateImageSlide(newIndex) {
    const container = document.getElementById("image-ui");

    // Retirer toutes les classes précédentes
    container.classList.remove("slide-in-right", "slide-in-left", "active");

    // Déterminer la direction selon l’index
    const direction = newIndex > currentImageIndex ? "right" : "left";
    container.classList.add(`slide-in-${direction}`);

    // forcer le reflow pour que la transition fonctionne
    void container.offsetWidth;

    // Activer la classe active pour lancer l’animation
    container.classList.add("active");
    lastImageIndex = newIndex;
}


// charge + affiche en garantissant le rendu (images)
function preloadAndShow(url,newIndex) {
  const img = new Image();
  img.onload = () => {
    imageCache[url] = img;
    displayImage(url,newIndex);
  };
  img.onerror = (e) => {
    console.warn("preloadAndShow failed:", url, e);
    displayImage(url,newIndex); // tenter quand même (affichera erreur si corrompu)
  };
  img.src = url;
}

// affiche vraiment l’image + UI
function displayImage(url,newIndex) {
  console.log("[RECEIVER] displayImage:", url);

  // Indique qu'on est en mode affichage manuel d'image
  displayingManualImage = true;
  displayingManualVideo = false;

  // Met à jour l'élément image
  imageDisplay.src = url;
  /*imgageDisplay.onload = () => {
    animateImageSlide(newIndex); // lance l'animation une fois l'image chargée
  };*/

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
   //animateImageSlide(newIndex);   // ← AJOUT ICI
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
    imagesSenderId = event.senderId;
    const data = event.data;
    //console.log("Message IMAGE reçu:", data);

    if (!data || !data.type) return;
    console.log("[RECEIVER]","data.type" +data.type);
  
    // ============================================================
    // 🔧 AJOUT VIDEO CAF : fonction d’aide
    // ============================================================
    // ───────────────────────────────────────────────
    // 🔍 1. Fonction utilitaire : détecter la durée via HTML5
    // ───────────────────────────────────────────────
    function probeDurationWithHTML5(url, signal) {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.src = url;
        video.style.display = "none";

        function cleanup() {
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("error", onError);
          if (signal) signal.removeEventListener("abort", onAbort);
          video.src = "";
          video.remove();
        }

        const onLoaded = () => {
          const d = video.duration;
          cleanup();
          if (!isNaN(d) && d > 0) resolve(d);
          else reject("Invalid duration");
        };

        const onError = () => {
          cleanup();
          reject("HTML5 metadata load error");
        };

        const onAbort = () => {
          cleanup();
          reject(new DOMException("Aborted", "AbortError"));
        };

        video.addEventListener("loadedmetadata", onLoaded);
        video.addEventListener("error", onError);
        if (signal) signal.addEventListener("abort", onAbort);

        document.body.appendChild(video);
      });
    }

    // ───────────────────────────────────────────────
    // 🎬 2. Fonction CAF avec détection automatique
    // ───────────────────────────────────────────────
    async function loadVideoViaCAF(url, title = "Video", contentType = "video/mp4", durationMs = 0, signal = null) {
      console.log("🎬 [CAF] Chargement vidéo via PlayerManager:", url);

      let durationSec = 0;

      // Si durée fournie → on la prend
      if (durationMs > 0) {
        durationSec = durationMs / 1000;
        console.log("📌 Durée fournie par Android:", durationSec, "sec");
      } else {
        // Sinon → on sonde en HTML5
        try {
          console.log("⏳ Sonde durée via HTML5…");
          if (!transcoding)
            durationSec = await probeDurationWithHTML5(url, signal);
          console.log("✅ Durée trouvée via HTML5:", durationSec, "sec");
        } catch (err) {
          if (err.name === "AbortError") {
            console.warn("⚠️ Sonde annulée");
            return; // arrêt propre
          }
          console.warn("⚠️ Impossible de détecter la durée HTML5:", err);
          durationSec = 0;
        }
      }
      
      // Construire MediaInfo pour CAF
      const mediaInfo = new cast.framework.messages.MediaInformation();
      mediaInfo.contentId = url;
      mediaInfo.contentType = contentType;
      if (transcoding)
        mediaInfo.streamType = cast.framework.messages.StreamType.LIVE;
      else mediaInfo.streamType = cast.framework.messages.StreamType.BUFFERED;

      if (durationSec > 0) {
        mediaInfo.streamDuration = durationSec;  // ⭐ CAF a enfin la durée correcte
      }
      context.sendCustomMessage(IMAGE_NAMESPACE,imagesSenderId, {
              type: 'PROGRESS',
              current: 0,      // → ms
              duration: Math.round(durationSec * 1000)    // → ms
            });
     
      const meta = new cast.framework.messages.GenericMediaMetadata();
      meta.title = title;
      // ⭐ Ajouter la miniature
      
      mediaInfo.metadata = meta;

      const req = new cast.framework.messages.LoadRequestData();
      req.media = mediaInfo;
      req.autoplay = true;

      displayingManualVideo = false;

      try {
        await playerManager.load(req);
        console.log("🎉 Lecture CAF OK");
      } catch (e) {
        console.error("❌ Erreur load CAF:", e);
      }
    }

    /**
 * Charge une queue fMP4 dans CAF (initial load) de façon conforme.
 * @param {string[]} segmentList
 * @param {number} startIndex
 */
async function loadVideoViaCAFQueue(segmentList, startIndex) {
  console.log("🎬 [CAF QUEUE] Start index:", startIndex);

  if (!Array.isArray(segmentList) || segmentList.length === 0) {
    console.warn("[CAF QUEUE] Liste de segments vide");
    return;
  }
  if (typeof startIndex !== "number" || startIndex < 0 || startIndex >= segmentList.length) {
    startIndex = 0;
  }

  // 1) Construire les QueueItem
  const items = segmentList.map((segUrl) => {
    const mediaInfo = new cast.framework.messages.MediaInformation();
    mediaInfo.contentId = segUrl;
    mediaInfo.contentType = "video/mp4";
    mediaInfo.streamType = cast.framework.messages.StreamType.BUFFERED;
    mediaInfo.streamDuration = 10; // <-- durée connue

    const queueItem = new cast.framework.messages.QueueItem();
    queueItem.media = mediaInfo;
    queueItem.autoplay = true;
    queueItem.preloadTime = 5; // aide au gapless

    return queueItem;
  });

  // 2) Construire QueueLoadRequestData (les items)
  const queueLoadReq = new cast.framework.messages.QueueLoadRequestData();
  queueLoadReq.items = items;
  queueLoadReq.startIndex = startIndex;
  queueLoadReq.repeatMode = cast.framework.messages.RepeatMode.OFF;
  // optionnel : queueLoadReq.customData = {...}

  // 3) Encapsuler dans un LoadRequestData (obligatoire pour playerManager.load)
  const loadReq = new cast.framework.messages.LoadRequestData();
  // Tu peux aussi préciser loadReq.autoplay = true / loadReq.currentTime ...
  loadReq.queueData = queueLoadReq;

  // 4) Appeler playerManager.load(loadReq)
  try {
    const ctx = cast.framework.CastReceiverContext.getInstance();
    const playerManager = ctx.getPlayerManager();

    await playerManager.load(loadReq);
    console.log("🎉 LoadRequest (queue) envoyé OK (startIndex=" + startIndex + ")");
  } catch (err) {
    console.error("❌ Erreur load CAF (playerManager.load):", err);
  }
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
        /*if (playerManager && playerManager.getPlayerState() !== cast.framework.ui.State.PLAYING) {
         
        }*/
        try {
          playerManager.play();
        } catch (err) {
          console.warn("Erreur play via CAF:", err);
        }
        break;

      case "PAUSE_VIDEO":
        //if (playerManager && playerManager.getPlayerState() === cast.framework.ui.State.PLAYING) {
          
        //}
        try {
          playerManager.pause();
        } catch (err) {
          console.warn("Erreur pause via CAF:", err);
        }
        break;

        case "SEEK_VIDEO":
          if (playerManager && typeof data.position === "number") {
            // ⚡ seek en secondes
            console.log("seek to "+data.position/1000);
            if (transcoding){
              handleSeekTranscoding(data.position/1000)
            }else{
              playerManager.seek(data.position/1000);
            }
            
            const el = document.getElementById("progress-big-text");
            el.classList.remove("show");
          }
          break;
      case "SEEK_VIDEO_PROGRESS_VISIBLE":
          stopVideoProgressTimer();
          showBottomUi();
          progressBar.style.width = data.percent + "%";
          const el = document.getElementById("progress-big-text");
          //console.log("EL ?", el);
          el.textContent = data.durationText;
          //console.log("TEXT ?", data.durationText);
          el.classList.add("show");
       
        break;
      case "TRANSCODE_MP4_FINISHED":
          stopVideoProgressTimer();
          const durationSec = data.durationSec;
          console.log("[RECEIVER] finalDuration trancoded",data.durationSec);

        // Récupérer le MediaInfo actuel
        const newMediaInfo = playerManager.getMediaInformation();
        transcoding = false;
        // 1. Sauvegarder la position actuelle avant la coupure
        const currentTime = playerManager.getCurrentTimeSec();
        // ⭐ Les mises à jour critiques :
        newMediaInfo.contentId = data.finalUrl;
        newMediaInfo.streamDuration = durationSec;
        newMediaInfo.streamType = cast.framework.messages.StreamType.BUFFERED;
        console.log("[RECEIVER] final url",newMediaInfo.contentId);
        console.log("[RECEIVER] streamDuration",newMediaInfo.streamDuration);
        console.log("[RECEIVER] streamType",newMediaInfo.streamType);
        // 3. Préparer la requête de chargement
        const newLoadRequest = new cast.framework.messages.LoadRequestData();
        newLoadRequest.media = newMediaInfo;
        // ⭐ Demander de démarrer la lecture à l'instant exact de l'arrêt
        newLoadRequest.currentTime = currentTime; 
        // ⭐ L'ajout essentiel pour la reprise automatique
        newLoadRequest.autoplay = true;
        // 4. Exécuter le rechargement (C'est un appel de 'seek' sophistiqué)
        // Ceci est la seule façon de forcer le lecteur à reconstruire son état interne 
        // et à adopter la nouvelle duration.
        playerManager.load(newLoadRequest);
      
        showBottomUi();
        startVideoProgressTimer();
        break;
      case "SEEK_RESTART_READY":
        const seekTime = message.seekTime;
        const playerManager = context.getPlayerManager();

        // Relancer le chargement du même média à la nouvelle position de seek
        newMediaInfo = playerManager.getMediaInformation();
        
        newLoadRequest = new cast.framework.messages.LoadRequestData();
        newLoadRequest.media = newMediaInfo; // Utilise la même URL
        
        // ⭐ Clé 1 : Positionner le lecteur Cast sur la timeline absolue
        newLoadRequest.currentTime = seekTime; 
        
        // ⭐ Clé 2 : Reprendre la lecture immédiatement
        newLoadRequest.autoplay = true; 
        
        playerManager.load(newLoadRequest);
        
        console.log(`[RECEIVER] Reprise du LOAD forcée à ${seekTime}s.`);
        showBottomUi();
        startVideoProgressTimer();
        break;
      case 'LOAD_IMAGE_LIST':
      case 'LOAD_LIST':
        if (Array.isArray(data.urls)) {
          // on charge miniature si existe
          const videoThumbnailSmall = document.getElementById("video-thumbnail-small");
          const videoThumbnail = document.getElementById("video-thumbnail");
          thumbUrl = data.thumbUrl ?? "assets/placeholder.png";
          if (videoThumbnail) videoThumbnail.src = thumbUrl;
          if (videoThumbnailSmall) videoThumbnailSmall.src = thumbUrl;
          // on charge le titre
          const videoTitle = document.getElementById("video-title");
          const videoTitleSmall = document.getElementById("video-title-small");
          if (videoTitle) videoTitle.textContent = data.title;
          if (videoTitleSmall) videoTitleSmall.textContent = data.title;

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
                  lastImageIndex = startIndex;
                  displayFirstImage(first);

              } else if (isVideoUrl(first)) {
                  
                  console.log("[RECEIVER] Première vidéo → passage en mode CAF");
                  console.log("[RECEIVER] durationMs "+data.durationms);
                  // 👇 Detect segment JSON instead of regular URL
                  let isSegmentJson = false;
                  let segmentData = null;

                  if (typeof first === "string" && first.trim().startsWith("{")) {
                      try {
                          const parsed = JSON.parse(first);

                          if (parsed.type === "init_playlist" && Array.isArray(parsed.segments)) {
                              isSegmentJson = true;
                              segmentData = parsed;
                              console.log("[RECEIVER] JSON init_playlist détecté:", parsed);
                          }
                      } catch(e) {
                          console.warn("[RECEIVER] String ressemble à du JSON mais invalide :", e);
                      }
                  }
                  if (isSegmentJson) {
                      console.log("[RECEIVER] Lecture via segmentation CAF Queue");

                      /*loadVideoViaCAFQueue(
                          segmentData.segments,
                          segmentData.segmentDuration,
                          segmentData.playFromSegmentIndex
                      );*/

                  } else if (first.startsWith("http")) {
                    if (first.includes("progressive.mp4")) transcoding = true;
                      console.log("[RECEIVER] transcoding "+transcoding);
                      seekBarDuration = data.seekBarDuration/1000;
                      console.log("[RECEIVER] seekBarDuration "+seekBarDuration);
                      // URL classique → lecture CAF standard
                      // 🔧 AJOUT VIDEO CAF : remplacer castLoadVideo par CAF
                      const mimeType = typeof data.mimeType === "string" ? data.mimeType : "video/mp4";
                      const durationMs = typeof data.durationms === "number" ? data.durationms : 0;
                      console.log("[RECEIVER] durationMs "+durationMs);
                      //castLoadVideoCAF(first,"video",mimeType,0);
                      if (currentAbortController) {
                        currentAbortController.abort();
                      }
                      currentAbortController = new AbortController();
                      loadVideoViaCAF(first, data.title, mimeType, durationMs, currentAbortController.signal);

                  } else {
                      console.error("[RECEIVER] Valeur inattendue dans la liste: ", first);
                  }
                  pendingVideoUrl = first;
                  firstImageShown = true;

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
          try {
            if (playerManager){
                playerManager.stop();
            }   
          } catch (err) {
                console.warn("Erreur stop via CAF:", err);
          }

          if (isVideoUrl(urlToShow)) {
            // on charge miniature si existe
            const videoThumbnailSmall = document.getElementById("video-thumbnail-small");
            const videoThumbnail = document.getElementById("video-thumbnail");
            thumbUrl = data.thumbUrl ?? "assets/placeholder.png";
            if (videoThumbnail) videoThumbnail.src = thumbUrl;
            if (videoThumbnailSmall) videoThumbnailSmall.src = thumbUrl;
            // on charge le titre
            const videoTitle = document.getElementById("video-title");
            const videoTitleSmall = document.getElementById("video-title-small");
            if (videoTitle) videoTitle.textContent = data.title;
            if (videoTitleSmall) videoTitleSmall.textContent = data.title;
            // on remet les compteurs à 0
            context.sendCustomMessage(IMAGE_NAMESPACE,imagesSenderId, {
              type: 'PROGRESS',
              current: 0,      // → ms
              duration: 0    // → ms
            });
            
            // 🔧 AJOUT VIDEO CAF
            const mimeType = typeof data.mimeType === "string" ? data.mimeType : "video/mp4";
            const durationMs = typeof data.durationms === "number" ? data.durationms : 0;
            console.log("[RECEIVER] durationMs "+durationMs);
            //castLoadVideoCAF(urlToShow,"video",mimeType,0);
            if (currentAbortController) {
               currentAbortController.abort();
            }
            currentAbortController = new AbortController();

            // Lancer la nouvelle vidéo
            loadVideoViaCAF(urlToShow, data.title, mimeType, durationMs, currentAbortController.signal);
          } 
          else if (isAudioUrl(urlToShow)) {
            showAudioAtIndex(idxSet);
          } 
          else {
            stopVideoProgressTimer();
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
    /*playerManager.setMessageInterceptor(
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
    );*/

    // 3️⃣ Affiche manuellement la première image dans le DOM
    imageDisplay.src = url;
    imageUI.style.display = "flex";
    document.body.classList.add("playing");
    firstImageShown = true;
    displayingManualImage = true; // flag pour gérer IDLE
}


function handleSeekTranscoding(seekTime) {
    const playerManager = context.getPlayerManager()
    
    console.log(`[RECEIVER] CUSTOM_SEEK intercepté. Nouveau seek demandé: ${seekTime}s`);
    
    // 1. Envoyer un message de confirmation à Android pour lancer l'arrêt/redémarrage de FFmpeg.
    // On réutilise le senderId pour s'assurer que seul l'émetteur est ciblé.
    context.sendCustomMessage(IMAGE_NAMESPACE, senderId, {
        type: 'SEEK_REQUESTED', // Ce message est le signal pour Android
        seekTime: seekTime
    });

    // 2. Mettre à jour l'interface utilisateur/l'état (Optionnel, mais recommandé)
    // On peut mettre le lecteur en pause ici pour éviter les problèmes pendant le redémarrage du transcode.
    // playerManager.pause(); 
}

// 1. Définir l'intercepteur pour le message SEEK
/*playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.SEEK,
    (seekRequest) => {
        // seekRequest est l'objet qui contient les données de la requête de recherche
        
        const seekTime = seekRequest.currentTime;
        console.log("[RECEIVER] SEEK intercepté ",seekTime);
        
        // 2. Vérifier si le seek dépasse la portion déjà transcodée 
        // (Vous devez avoir une variable de suivi de la 'maxCurrentDurationSec')
        const maxDurationKnown = playerManager.getMediaInformation().streamDuration; 
        
        // Si le seek est au-delà de la portion écrite et avant la fin (mode progressif)
        if (seekTime > maxDurationKnown && transcoding) { // Ajoutez cette vérification côté JS si possible
            
            console.log(`[SEEK INTERCEPTED] Nouveau seek demandé: ${seekTime}s`);
            
            // 3. Envoyer un message personnalisé au Sender Android
            // Le Sender doit recevoir ce message et savoir qu'il doit redémarrer FFmpeg
            context.sendCustomMessage(IMAGE_NAMESPACE, imagesSenderId, {
                type: 'SEEK_REQUESTED',
                seekTime: seekTime
            });
            
            // 4. Important: Retourner la requête pour que CAF commence la mise en mémoire tampon.
            // Le lecteur se mettra en pause/buffering en attendant le nouveau flux.
            return seekRequest; 
        }
        
        // Si le seek est valide (dans la portion écrite ou après la fin du transcodage), 
        // laissez le traitement par défaut de CAF s'appliquer.
        return seekRequest;
    }
);*/

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
      if (thumbUrl == null) { // si thumbUrl custom n'est pas présente
        
        if (videoThumbnail) videoThumbnail.src = imgUrl;
        if (videoThumbnailSmall) videoThumbnailSmall.src = imgUrl;
      }
      
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
  }, 5000);
}

function showBottomUi() {
  bottomUI.classList.add("show");
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
  /*if (displayingManualVideo && (state === cast.framework.ui.State.IDLE || state === cast.framework.ui.State.LAUNCHING)) {
    console.log("[RECEIVER] Ignorer state CAF car affichage manuel video");
    return;
  }*/

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
      if (document.getElementById("player")) document.getElementById("player").style.display = "none";
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


function startVideoProgressTimer() {
  stopVideoProgressTimer(); // sécurité
  //if (transcoding) return;
  videoProgressTimer = setInterval(() => {
    
    if (!playerManager) return;

    const current = playerManager.getCurrentTimeSec();
    let duration = 0;
    if (!transcoding)
      duration = playerManager.getDurationSec();
    else duration = seekBarDuration;
    console.log("[RECEIVER] duration=", duration);
    console.log("[RECEIVER] current=", current);

    if (!duration || duration <= 0) return;
    if (isNaN(current)) return;

    // Mise à jour UI Receiver
    const pct = (current / duration) * 100;
    progressBar.style.width = pct + "%";
    currentTimeElem.textContent = formatTime(current);
    totalTimeElem.textContent = formatTime(duration);

    // Envoi côté Android (en ms)
    context.sendCustomMessage(IMAGE_NAMESPACE, imagesSenderId, {
      type: "PROGRESS",
      current: Math.round(current * 1000),
      duration: Math.round(duration * 1000)
    });

  }, 200); // 🔥 50 ms = super fluide
}
function stopVideoProgressTimer() {
  if (videoProgressTimer) {
    clearInterval(videoProgressTimer);
    videoProgressTimer = null;
  }
}


// ==================== PROGRESS POUR VIDEO ====================
/*playerManager.addEventListener(
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

    // 🔹 Envoi à Android via custom message
    context.sendCustomMessage(IMAGE_NAMESPACE,imagesSenderId, {
      type: 'PROGRESS',
      current: Math.round(currentTime * 1000),      // → ms
      duration: Math.round(mediaDuration * 1000)    // → ms
    });
     
  }
);*/


playerManager.addEventListener(
  cast.framework.events.EventType.SEEKING,
  () => {
    if(isAudioContent) return;
    seekingInProgress = true;
    stopVideoProgressTimer();
    showBottomUiTemporarily();
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
    if (!isAudioContent){
      if (state === "PLAYING"){
        if (seekingInProgress) {
              seekingInProgress = false;
              showBottomUiTemporarily();
            }
        startVideoProgressTimer();
      }
      if (state === "PAUSED" || state === "IDLE"){
        stopVideoProgressTimer();
      }
    }
    

    console.log("[Video STATE] =>", status);

    // 🔃 Envoi au téléphone
    context.sendCustomMessage(IMAGE_NAMESPACE,imagesSenderId, {
      type: 'PLAYER_STATE',
      state: status,
      index: currentImageIndex,
      url: imageList[currentImageIndex]
    });
    
   
  }
);

// =================== CLICK LISTENER ========================
document.addEventListener("click", () => {
  if(isAudioContent || displayingManualImage) return;
  showBottomUI();
});

// Définir le timeout à 1 heure (3600 secondes)
context.setInactivityTimeout(3600);

context.loggerLevel = cast.framework.LoggerLevel.ERROR;






// ==================== START RECEIVER ========================
context.start();




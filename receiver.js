// ==================== INIT ====================
if (!cast || !cast.framework) {
    console.error("CAF framework non chargé !");
} else {
    const context = cast.framework.CastReceiverContext.getInstance();
    const playerManager = context.getPlayerManager();

    let mediaDuration = 0;                // durée du média en secondes
    let hideProgressTimeout = null;       // timer pour cacher bottom-ui (vidéo)
    let lastPlayerState = null;           // filtrage apparition répétée
    let isAudioContent = false;
    let isImageContent = false;           // ⚡ true si média image

    // ⚡ Audio uniquement
    let audioCurrentTimeSec = 0;
    let audioTimer = null;
    let audioIsPlaying = false;

    // ==================== LOAD INTERCEPTOR ====================
    playerManager.setMessageInterceptor(
        cast.framework.messages.MessageType.LOAD,
        loadRequestData => {
            if (loadRequestData.media) {
                // durée
                mediaDuration = (typeof loadRequestData.media.duration === "number" && loadRequestData.media.duration > 0)
                    ? loadRequestData.media.duration
                    : 0;

                // type
                const contentType = loadRequestData.media.contentType || "";
                isAudioContent = contentType.startsWith("audio/");
                isImageContent = contentType.startsWith("image/");
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
                const imgUrl = (Array.isArray(meta.images) && meta.images.length > 0 && meta.images[0].url)
                    ? meta.images[0].url
                    : "assets/placeholder.png";

                // Vidéo
                if (videoTitle) videoTitle.textContent = titleText;
                if (videoTitleSmall) videoTitleSmall.textContent = titleText;
                if (!isImageContent) {
                    if (videoThumbnail) videoThumbnail.src = imgUrl;
                    if (videoThumbnailSmall) videoThumbnailSmall.src = imgUrl;
                }

                // Audio
                if (audioTitle) audioTitle.textContent = titleText;
                if (audioAlbum) audioAlbum.textContent = "Album: "+(meta.albumName || "unknown");
                if (audioArtist) audioArtist.textContent = "Artist: "+(meta.artist || "unknown");
                if (audioThumbnail) audioThumbnail.src = imgUrl;

            } else {
                // Valeurs par défaut
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
    const bottomUI = document.getElementById("bottom-ui");
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    const pauseIcon = document.getElementById("pause-icon");

    const audioUI = document.getElementById("audio-ui");
    const audioProgressBar = document.getElementById("audio-progress-bar");
    const audioCurrentTime = document.getElementById("audio-current-time");
    const audioTotalTime = document.getElementById("audio-total-time");
    const audioPauseIcon = document.getElementById("audio-pause-icon");

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
                } else if (isImageContent) {
                    document.getElementById("player").style.display = "none";
                    audioUI.style.display = "none";
                    bottomUI.classList.remove("show");
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
                break;
        }
    }

    // ==================== PLAYER DATA BINDING ====================
    try {
        const playerData = {};
        const playerDataBinder = new cast.framework.ui.PlayerDataBinder(playerData);
        playerDataBinder.addEventListener(
            cast.framework.ui.PlayerDataEventType.STATE_CHANGED,
            (e) => handlePlayerState(e.value)
        );
    } catch (err) {
        console.warn("PlayerDataBinder indisponible, fallback MEDIA_STATUS", err);
        playerManager.addEventListener(
            cast.framework.events.EventType.MEDIA_STATUS,
            (event) => {
                const state = event.mediaStatus && event.mediaStatus.playerState;
                handlePlayerState(state);
            }
        );
    }

    // ==================== START RECEIVER ========================
    context.start();
}

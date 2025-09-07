// Récupère le contexte et le player
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

let mediaDuration = 0; // durée en secondes de la vidéo en cours
let hideTimer = null;

// Récupère le container et la progress bar
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");

// Crée les éléments de durée si pas déjà dans le HTML
let currentTimeElem = document.getElementById("current-time");
let totalTimeElem = document.getElementById("total-time");

if (!currentTimeElem) {
  currentTimeElem = document.createElement("span");
  currentTimeElem.id = "current-time";
  currentTimeElem.style.position = "absolute";
  currentTimeElem.style.left = "5px";
  currentTimeElem.style.top = "-20px";
  currentTimeElem.style.color = "white";
  currentTimeElem.style.fontSize = "14px";
  progressContainer.appendChild(currentTimeElem);
}

if (!totalTimeElem) {
  totalTimeElem = document.createElement("span");
  totalTimeElem.id = "total-time";
  totalTimeElem.style.position = "absolute";
  totalTimeElem.style.right = "5px";
  totalTimeElem.style.top = "-20px";
  totalTimeElem.style.color = "white";
  totalTimeElem.style.fontSize = "14px";
  progressContainer.appendChild(totalTimeElem);
}

// Intercepteur LOAD
playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  loadRequestData => {
    if (loadRequestData.media) {
      mediaDuration = loadRequestData.media.duration || 0;
      console.log("Durée du média (LOAD):", mediaDuration, "s");
      totalTimeElem.textContent = formatTime(mediaDuration);
    }
    return loadRequestData;
  }
);

// Fonction de format hh:mm:ss
function formatTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h > 0 ? h.toString().padStart(2, "0") + ":" : "") +
         m.toString().padStart(2, "0") + ":" +
         s.toString().padStart(2, "0");
}

// Affiche la barre et la fait disparaître après 2s
function showProgressTemporarily() {
  progressContainer.classList.add("show");
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    progressContainer.classList.remove("show");
  }, 2000);
}

// PlayerDataBinder si disponible
try {
  const playerData = {};
  const playerDataBinder = new cast.framework.ui.PlayerDataBinder(playerData);

  playerDataBinder.addEventListener(
    cast.framework.ui.PlayerDataEventType.STATE_CHANGED,
    (e) => {
      console.log("PlayerData.STATE_CHANGED:", e.value);
      if ([cast.framework.ui.State.PLAYING, cast.framework.ui.State.PAUSED].includes(e.value)) {
        showProgressTemporarily();
      }
    }
  );
} catch (err) {
  console.warn("PlayerDataBinder indisponible, fallback MEDIA_STATUS", err);
  playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_STATUS,
    (event) => {
      const state = event.mediaStatus && event.mediaStatus.playerState;
      if (["PLAYING", "PAUSED"].includes(state)) showProgressTemporarily();
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

    // Met à jour les durées
    currentTimeElem.textContent = formatTime(currentTime);

    // LOG progression + couleur
    const color = window.getComputedStyle(progressBar).backgroundColor;
    console.log(
      `Progression: ${pct.toFixed(2)}% (${currentTime.toFixed(1)}s / ${mediaDuration.toFixed(1)}s) | Couleur: ${color}`
    );
  }
);

// Démarre le receiver
context.start();

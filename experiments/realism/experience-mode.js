export const EXPERIENCE_MODE = Object.freeze({
  PENDING: "pending",
  MAIN: "main",
  CHILL: "chill",
});

export const EXPERIENCE_MODE_SELECTED_EVENT = "assmagic:experience-mode-selected";

function requestMobileFullscreen(sourceEvent) {
  if (
    !sourceEvent?.isTrusted
    || !window.matchMedia?.("(pointer: coarse)").matches
    || document.fullscreenElement
    || typeof document.documentElement.requestFullscreen !== "function"
  ) return;

  try {
    const request = document.documentElement.requestFullscreen({ navigationUI: "hide" });
    request?.catch(() => {
      // Fullscreen is optional; unsupported browsers continue normally.
    });
  } catch {
    // Some iOS browser versions reject the request synchronously.
  }
}

export function createExperienceModeController({
  root = document.querySelector("#experience-mode-selection"),
} = {}) {
  const hasSelectionUi = root instanceof HTMLElement;
  let mode = hasSelectionUi ? EXPERIENCE_MODE.PENDING : EXPERIENCE_MODE.MAIN;
  let resolveSelection = null;
  const whenSelected = hasSelectionUi
    ? new Promise((resolve) => {
      resolveSelection = resolve;
    })
    : Promise.resolve(EXPERIENCE_MODE.MAIN);
  const buttons = hasSelectionUi
    ? [...root.querySelectorAll("[data-experience-mode]")]
    : [];

  const applyBodyMode = () => {
    document.body.classList.toggle("experience-pending", mode === EXPERIENCE_MODE.PENDING);
    document.body.classList.toggle("experience-main", mode === EXPERIENCE_MODE.MAIN);
    document.body.classList.toggle("experience-chill", mode === EXPERIENCE_MODE.CHILL);
    document.body.dataset.experienceMode = mode;
  };

  const select = (nextMode, sourceEvent = null) => {
    if (
      mode !== EXPERIENCE_MODE.PENDING
      || ![EXPERIENCE_MODE.MAIN, EXPERIENCE_MODE.CHILL].includes(nextMode)
    ) return false;

    requestMobileFullscreen(sourceEvent);
    mode = nextMode;
    applyBodyMode();
    if (hasSelectionUi) {
      root.dataset.selectedMode = mode;
      for (const button of buttons) {
        const selected = button.dataset.experienceMode === mode;
        button.disabled = true;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      }
    }
    window.dispatchEvent(new CustomEvent(EXPERIENCE_MODE_SELECTED_EVENT, {
      detail: { mode, sourceEvent },
    }));
    resolveSelection?.(mode);
    resolveSelection = null;
    return true;
  };

  for (const button of buttons) {
    button.addEventListener("click", (event) => {
      select(button.dataset.experienceMode, event);
    });
  }

  applyBodyMode();

  return {
    hasSelectionUi,
    whenSelected,
    getMode: () => mode,
    isMain: () => mode === EXPERIENCE_MODE.MAIN,
    isChill: () => mode === EXPERIENCE_MODE.CHILL,
    select,
    markLoadReady() {
      if (!hasSelectionUi) return;
      root.dataset.loadReady = "true";
      root.classList.add("is-load-ready");
    },
    hideSelection() {
      if (!hasSelectionUi) return;
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
    },
  };
}

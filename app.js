// --- Configuration ---
const CLIENT_ID =
  "932685095666-31l2s1psd94msj2a59d2ok7m4dfj3922.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/youtube.readonly";
// VERSION is now defined in version.js

const MAX_VIEWS_STEPS = [
  { value: 1_000, shortLabel: "1K", fullLabel: "Under 1K" },
  { value: 5_000, shortLabel: "5K", fullLabel: "Under 5K" },
  { value: 10_000, shortLabel: "10K", fullLabel: "Under 10K" },
  { value: 50_000, shortLabel: "50K", fullLabel: "Under 50K" },
  { value: 100_000, shortLabel: "100K", fullLabel: "Under 100K" },
  { value: 500_000, shortLabel: "500K", fullLabel: "Under 500K" },
  { value: 1_000_000, shortLabel: "1M", fullLabel: "Under 1M" },
  { value: null, shortLabel: "Any", fullLabel: "Any" },
];

function loadInitialMaxViews() {
  const saved = localStorage.getItem("dislikes-max-views");
  if (saved !== null) {
    if (saved === "any" || saved === "") return null;
    const parsed = parseInt(saved, 10);
    const match = MAX_VIEWS_STEPS.find((s) => s.value === parsed);
    return match ? match.value : null;
  }
  if (localStorage.getItem("dislikes-hidden-gems") === "true") {
    localStorage.setItem("dislikes-max-views", "100000");
    localStorage.removeItem("dislikes-hidden-gems");
    return 100_000;
  }
  return null;
}

// --- State ---
const state = {
  gisInited: false,
  tokenClient: null,
  accessToken: null,
  isAuthenticated: false,
  dataSource: null, // 'youtube' | 'demo' | 'upload' | null
  theme: localStorage.getItem("dislikes-theme") || "system",
  compactMode: localStorage.getItem("dislikes-compact") !== null ? localStorage.getItem("dislikes-compact") === "true" : true,
  musicOnly: localStorage.getItem("dislikes-music-only") !== null ? localStorage.getItem("dislikes-music-only") === "true" : true,
  maxViews: loadInitialMaxViews(),
  unavailableOnly: localStorage.getItem("dislikes-unavailable-only") === "true",
  videos: [],
  filteredVideos: [],
  loading: false,
  isLoadMore: false,
  error: null,
  searchTerm: "",
  debouncedSearchTerm: "",
  sortBy: "date-new",
  nextPageToken: null,
  totalResults: null,
  isFetchAll: false,
  mode: localStorage.getItem("dislikes-mode") || "like", // 'dislike' or 'like'
  iconCache: {},
  sidebarCategory: "channels",
  forceRefetch: false,
  sidebarBaseVideos: [],
  ytPlayer: null,
  isPlayerReady: false,
  currentVideoIndex: -1,
  currentVideoId: null,
  pendingVideoId: null,
  autoplayRequested: false,
  autoplayFallbackTimeout: null,
  autoSkipTimeout: null,
  consecutiveAutoSkips: 0,
  lastNavDirection: 1,
  restrictedVideoIds: new Set(),
  progressInterval: null,
  shuffleMode: false,
  shuffleHistory: [],
  shuffleHistoryPos: -1,
  toastTimeout: null,
  heroAnimFrame: null,
  lastHeroAnimSignature: "",
};

// --- DOM Elements ---
const dom = {
  appHeader: document.getElementById("app-header"),
  topbarAppControls: document.getElementById("topbar-app-controls"),
  authIndicator: document.getElementById("auth-indicator"),
  authButton: document.getElementById("auth-button"),
  authText: document.getElementById("auth-text"),
  heroAuthButton: document.getElementById("hero-auth-button"),
  heroDemoButton: document.getElementById("hero-demo-button"),
  heroUploadButton: document.getElementById("hero-upload-button"),
  signoutButton: document.getElementById("signout-button"),

  viewWelcome: document.getElementById("view-welcome"),
  viewContent: document.getElementById("view-content"),

  errorContainer: document.getElementById("error-container"),
  errorMessage: document.getElementById("error-message"),
  errorRetryButton: document.getElementById("error-retry-button"),

  resultsHeroCount: document.getElementById("results-hero-count"),
  resultsCount: document.getElementById("results-count"),
  playAllButton: document.getElementById("play-all-button"),
  shufflePlayButton: document.getElementById("shuffle-play-button"),
  libraryChipsRow: document.getElementById("library-chips-row"),
  searchInput: document.getElementById("search-input"),
  searchClearButton: document.getElementById("search-clear-button"),
  sortDropdown: document.getElementById("sort-dropdown"),
  sortTrigger: document.getElementById("sort-trigger"),
  sortLabel: document.getElementById("sort-label"),
  sortChevron: document.getElementById("sort-chevron"),
  sortMenu: document.getElementById("sort-menu"),
  filtersDropdown: document.getElementById("filters-dropdown"),
  filtersTrigger: document.getElementById("filters-trigger"),
  filtersActiveBadge: document.getElementById("filters-active-badge"),
  filtersMenu: document.getElementById("filters-menu"),
  filtersResetButton: document.getElementById("filters-reset-button"),
  maxViewsSlider: document.getElementById("max-views-slider"),
  maxViewsLabel: document.getElementById("max-views-label"),
  maxViewsStops: document.getElementById("max-views-stops"),

  emptyState: document.getElementById("empty-state"),
  gridTopSpacer: document.getElementById("grid-top-spacer"),
  videoGrid: document.getElementById("video-grid"),
  gridBottomSpacer: document.getElementById("grid-bottom-spacer"),

  libraryActionsGroup: document.getElementById("library-actions-group"),
  copyIdsButton: document.getElementById("copy-ids-button"),
  exportJsonButton: document.getElementById("export-json-button"),
  uploadJsonButton: document.getElementById("upload-json-button"),
  uploadJsonInput: document.getElementById("upload-json-input"),
  clearCacheButton: document.getElementById("clear-cache-button"),
  loadAllButton: document.getElementById("load-all-button"),
  sidebarFilterDropdown: document.getElementById("sidebar-filter-dropdown"),
  sidebarFilterTrigger: document.getElementById("sidebar-filter-trigger"),
  sidebarFilterLabel: document.getElementById("sidebar-filter-label"),
  sidebarFilterChevron: document.getElementById("sidebar-filter-chevron"),
  sidebarFilterMenu: document.getElementById("sidebar-filter-menu"),
  sidebarListContainer: document.getElementById("sidebar-list-container"),
  mobileFilterToggle: document.getElementById("mobile-filter-toggle"),
  sidebarContent: document.getElementById("sidebar-content"),

  scrollSentinel: document.getElementById("infinite-scroll-sentinel"),

  bottomPlayer: document.getElementById("bottom-player"),
  bottomPlayerTrackInfo: document.getElementById("bottom-player-track-info"),
  playerThumbnail: document.getElementById("player-thumbnail"),
  playerTitle: document.getElementById("player-title"),
  playerArtist: document.getElementById("player-artist"),
  playerPlayPause: document.getElementById("player-play-pause"),
  playerIconPlay: document.getElementById("player-icon-play"),
  playerIconPause: document.getElementById("player-icon-pause"),
  playerIconLoading: document.getElementById("player-icon-loading"),
  playerShuffle: document.getElementById("player-shuffle"),
  playerClose: document.getElementById("player-close"),
  playerPrev: document.getElementById("player-prev"),
  playerNext: document.getElementById("player-next"),
  playerTimeCurrent: document.getElementById("player-time-current"),
  playerTimeTotal: document.getElementById("player-time-total"),
  bottomPlayerProgressBar: document.getElementById("bottom-player-progress-bar"),
  bottomPlayerProgressContainer: document.getElementById("bottom-player-progress-container"),
  bottomPlayerBg: document.getElementById("bottom-player-bg"),

  fsPlayer: document.getElementById("full-screen-player"),
  fsPlayerBg: document.getElementById("fs-player-bg"),
  fsPlayerClose: document.getElementById("fs-player-close"),
  fsPlayerShuffle: document.getElementById("fs-player-shuffle"),
  fsPlayerThumbnail: document.getElementById("fs-player-thumbnail"),
  fsPlayerTitle: document.getElementById("fs-player-title"),
  fsPlayerArtist: document.getElementById("fs-player-artist"),
  fsPlayerPlayPause: document.getElementById("fs-player-play-pause"),
  fsPlayerIconPlay: document.getElementById("fs-player-icon-play"),
  fsPlayerIconPause: document.getElementById("fs-player-icon-pause"),
  fsPlayerIconLoading: document.getElementById("fs-player-icon-loading"),
  fsPlayerProgress: document.getElementById("fs-player-progress"),
  fsPlayerTimeCurrent: document.getElementById("fs-player-time-current"),
  fsPlayerTimeTotal: document.getElementById("fs-player-time-total"),
  fsPlayerPrev: document.getElementById("fs-player-prev"),
  fsPlayerNext: document.getElementById("fs-player-next"),

  fastScrubber: document.getElementById("fast-scrubber"),
  scrubberTooltip: document.getElementById("scrubber-tooltip"),
  scrubberTooltipPrimary: document.getElementById("scrubber-tooltip-primary"),
  scrubberTooltipSub: document.getElementById("scrubber-tooltip-sub"),
  scrubberTopBtn: document.getElementById("scrubber-top-btn"),
  scrubberBottomBtn: document.getElementById("scrubber-bottom-btn"),
  scrubberTrack: document.getElementById("scrubber-track"),
  scrubberThumb: document.getElementById("scrubber-thumb"),
  scrubberCheckpoints: document.getElementById("scrubber-checkpoints"),
  dropOverlay: document.getElementById("drop-overlay"),
  toast: document.getElementById("toast"),

  videoTemplate: document.getElementById("video-card-template"),
  skeletonTemplate: document.getElementById("skeleton-template"),
  modeToggleGroup: document.getElementById("mode-toggle-group"),
  welcomeTitle: document.getElementById("welcome-title"),
  welcomeDesc: document.getElementById("welcome-desc"),

  settingsButton: document.getElementById("settings-button"),
  settingsMenu: document.getElementById("settings-menu"),
  themeToggleGroup: document.getElementById("theme-toggle-group"),
  themeColorMeta: document.getElementById("theme-color-meta"),
  compactToggle: document.getElementById("compact-toggle"),
  musicToggle: document.getElementById("music-toggle"),
  unavailableToggle: document.getElementById("unavailable-toggle"),

  favicon: document.getElementById("favicon"),
  appleIcon: document.getElementById("apple-icon"),
  footerResetButton: document.getElementById("footer-reset-button"),
  resetAppLink: document.getElementById("reset-app-link"),
  initializationTrouble: document.getElementById("initialization-trouble"),
};

// --- Initialization ---

function showToast(message, type = "info") {
  if (!dom.toast) return;
  if (state.toastTimeout) {
    clearTimeout(state.toastTimeout);
  }
  dom.toast.textContent = message;
  const isError = type === "error";
  dom.toast.classList.toggle("bg-red-600", isError);
  dom.toast.classList.toggle("text-white", true);
  dom.toast.classList.toggle("bg-gray-950", !isError);
  dom.toast.classList.toggle("dark:bg-white", !isError);
  dom.toast.classList.toggle("dark:text-black", !isError);

  const playerOpen =
    dom.bottomPlayer &&
    !dom.bottomPlayer.classList.contains("translate-y-full") &&
    dom.fsPlayer &&
    dom.fsPlayer.classList.contains("translate-y-full");
  dom.toast.style.bottom = playerOpen ? "88px" : "24px";

  dom.toast.classList.remove("opacity-0", "translate-y-2");
  dom.toast.classList.add("opacity-100", "translate-y-0");

  state.toastTimeout = setTimeout(() => {
    dom.toast.classList.remove("opacity-100", "translate-y-0");
    dom.toast.classList.add("opacity-0", "translate-y-2");
  }, 3000);
}

window.showToast = showToast;

function closeAllPopovers(exceptMenu = null) {
  if (dom.settingsMenu && dom.settingsMenu !== exceptMenu) {
    dom.settingsMenu.classList.add("hidden");
    if (dom.settingsButton) dom.settingsButton.setAttribute("aria-expanded", "false");
  }
  if (dom.filtersMenu && dom.filtersMenu !== exceptMenu) {
    dom.filtersMenu.classList.add("hidden");
    if (dom.filtersTrigger) dom.filtersTrigger.setAttribute("aria-expanded", "false");
  }
  if (dom.sortMenu && dom.sortMenu !== exceptMenu) {
    dom.sortMenu.classList.add("hidden");
    if (dom.sortTrigger) dom.sortTrigger.setAttribute("aria-expanded", "false");
    if (dom.sortChevron) dom.sortChevron.classList.remove("rotate-180");
  }
  if (dom.sidebarFilterMenu && dom.sidebarFilterMenu !== exceptMenu) {
    dom.sidebarFilterMenu.classList.add("hidden");
    if (dom.sidebarFilterTrigger) dom.sidebarFilterTrigger.setAttribute("aria-expanded", "false");
    if (dom.sidebarFilterChevron) dom.sidebarFilterChevron.classList.remove("rotate-180");
  }
}

function isAnyPopoverOpen() {
  return Boolean(
    (dom.settingsMenu && !dom.settingsMenu.classList.contains("hidden")) ||
      (dom.filtersMenu && !dom.filtersMenu.classList.contains("hidden")) ||
      (dom.sortMenu && !dom.sortMenu.classList.contains("hidden")) ||
      (dom.sidebarFilterMenu && !dom.sidebarFilterMenu.classList.contains("hidden"))
  );
}

function updateModeToggleUI(mode) {
  if (!dom.modeToggleGroup) return;
  const buttons = dom.modeToggleGroup.querySelectorAll(".mode-option");
  buttons.forEach((btn) => {
    const isActive = btn.dataset.modeValue === mode;
    btn.setAttribute("aria-checked", String(isActive));
    btn.tabIndex = isActive ? 0 : -1;
    btn.classList.toggle("bg-white", isActive);
    btn.classList.toggle("dark:bg-[#343434]", isActive);
    btn.classList.toggle("text-gray-950", isActive);
    btn.classList.toggle("dark:text-white", isActive);
    btn.classList.toggle("shadow-sm", isActive);
    btn.classList.toggle("font-semibold", isActive);
    btn.classList.toggle("text-gray-500", !isActive);
    btn.classList.toggle("dark:text-[#9a9a9a]", !isActive);
    btn.classList.toggle("hover:text-gray-900", !isActive);
    btn.classList.toggle("dark:hover:text-white", !isActive);
    btn.classList.toggle("font-medium", !isActive);
  });
}

function updateThemeToggleUI(theme) {
  if (!dom.themeToggleGroup) return;
  const buttons = dom.themeToggleGroup.querySelectorAll(".theme-option");
  buttons.forEach((btn) => {
    const isActive = btn.dataset.themeValue === theme;
    btn.setAttribute("aria-checked", String(isActive));
    btn.tabIndex = isActive ? 0 : -1;
    btn.classList.toggle("bg-white", isActive);
    btn.classList.toggle("dark:bg-[#383838]", isActive);
    btn.classList.toggle("text-black", isActive);
    btn.classList.toggle("dark:text-white", isActive);
    btn.classList.toggle("shadow-sm", isActive);
    btn.classList.toggle("text-gray-500", !isActive);
    btn.classList.toggle("dark:text-[#aaaaaa]", !isActive);
    btn.classList.toggle("hover:text-black", !isActive);
    btn.classList.toggle("dark:hover:text-white", !isActive);
  });
}

function setupCustomDropdown({ container, trigger, menu, chevron, labelEl, getValue, onSelect }) {
  if (!container || !trigger || !menu) return;

  const getOptions = () => Array.from(menu.querySelectorAll(".dropdown-option"));

  const syncUI = () => {
    const currentValue = getValue();
    getOptions().forEach((opt) => {
      const isSelected = opt.dataset.value === currentValue;
      opt.setAttribute("aria-selected", String(isSelected));
      opt.classList.add("focus:outline-none", "focus:bg-gray-100", "dark:focus:bg-white/10");
      opt.classList.toggle("font-medium", isSelected);
      opt.classList.toggle("text-black", isSelected);
      opt.classList.toggle("dark:text-white", isSelected);
      opt.classList.toggle("bg-gray-100/80", isSelected);
      opt.classList.toggle("dark:bg-white/[0.08]", isSelected);
      opt.classList.toggle("text-gray-700", !isSelected);
      opt.classList.toggle("dark:text-[#cccccc]", !isSelected);
      opt.classList.toggle("hover:bg-gray-100/70", !isSelected);
      opt.classList.toggle("dark:hover:bg-white/[0.06]", !isSelected);

      const check = opt.querySelector(".check-icon");
      if (check) check.classList.toggle("opacity-0", !isSelected);

      if (isSelected && labelEl) {
        const textSpan = opt.querySelector("span");
        if (textSpan) labelEl.textContent = textSpan.textContent;
      }
    });
  };

  const openMenu = (focusTarget = null) => {
    closeAllPopovers(menu);
    syncUI();
    menu.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
    if (chevron) chevron.classList.add("rotate-180");

    if (focusTarget) {
      const options = getOptions();
      if (!options.length) return;
      let toFocus = options.find((o) => o.dataset.value === getValue()) || options[0];
      if (focusTarget === "first") toFocus = options[0];
      else if (focusTarget === "last") toFocus = options[options.length - 1];
      toFocus?.focus();
    }
  };

  const closeMenu = (restoreFocus = false) => {
    menu.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
    if (chevron) chevron.classList.remove("rotate-180");
    if (restoreFocus) trigger.focus();
  };

  trigger.style.touchAction = "manipulation";
  syncUI();

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = menu.classList.contains("hidden");
    if (isHidden) {
      openMenu(e.detail === 0 ? "selected" : null);
    } else {
      closeMenu(false);
    }
  });

  trigger.addEventListener("keydown", (e) => {
    if (!menu.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openMenu("selected");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu("selected");
    }
  });

  menu.addEventListener("click", (e) => {
    e.stopPropagation();
    const opt = e.target.closest(".dropdown-option");
    if (!opt) return;
    const newValue = opt.dataset.value;
    const prevValue = getValue();
    closeMenu(false);
    if (newValue && newValue !== prevValue) {
      onSelect(newValue);
    }
    syncUI();
  });

  menu.addEventListener("keydown", (e) => {
    if (menu.classList.contains("hidden")) return;
    const options = getOptions();
    if (!options.length) return;
    const currentIdx = options.indexOf(document.activeElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % options.length : 0;
      options[nextIdx]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = currentIdx >= 0 ? (currentIdx - 1 + options.length) % options.length : options.length - 1;
      options[prevIdx]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      options[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      options[options.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    } else if (e.key === "Tab") {
      closeMenu(false);
    }
  });
}

function setMobileFiltersOpen(isOpen) {
  if (!dom.sidebarContent || !dom.mobileFilterToggle) return;
  if (!isOpen && dom.sidebarFilterMenu) {
    dom.sidebarFilterMenu.classList.add("hidden");
    if (dom.sidebarFilterTrigger) dom.sidebarFilterTrigger.setAttribute("aria-expanded", "false");
    if (dom.sidebarFilterChevron) dom.sidebarFilterChevron.classList.remove("rotate-180");
  }
  dom.sidebarContent.classList.toggle("hidden", !isOpen);
  dom.sidebarContent.classList.toggle("flex", isOpen);
  if (dom.libraryActionsGroup) {
    dom.libraryActionsGroup.classList.toggle("hidden", !isOpen);
    dom.libraryActionsGroup.classList.toggle("flex", isOpen);
  }
  dom.mobileFilterToggle.setAttribute("aria-expanded", String(isOpen));
  const labelEl = dom.mobileFilterToggle.querySelector("span");
  const iconEl = dom.mobileFilterToggle.querySelector("svg");
  if (labelEl) labelEl.textContent = isOpen ? "Hide filters" : "Show filters";
  if (iconEl) iconEl.classList.toggle("rotate-180", isOpen);
}

function getMaxViewsStepIndex() {
  const idx = MAX_VIEWS_STEPS.findIndex((s) => s.value === state.maxViews);
  return idx === -1 ? MAX_VIEWS_STEPS.length - 1 : idx;
}

function updateFiltersUI() {
  const stepIdx = getMaxViewsStepIndex();
  const stepObj = MAX_VIEWS_STEPS[stepIdx];

  if (dom.maxViewsSlider) {
    dom.maxViewsSlider.value = String(stepIdx);
    dom.maxViewsSlider.setAttribute("aria-valuetext", stepObj.fullLabel);
  }
  if (dom.maxViewsLabel) {
    dom.maxViewsLabel.textContent = stepObj.fullLabel;
  }
  if (dom.maxViewsStops) {
    const stopBtns = dom.maxViewsStops.querySelectorAll(".max-views-stop");
    stopBtns.forEach((btn) => {
      const active = parseInt(btn.dataset.maxViewsStep, 10) === stepIdx;
      btn.classList.toggle("text-gray-950", active);
      btn.classList.toggle("dark:text-white", active);
      btn.classList.toggle("font-bold", active);
      btn.classList.toggle("text-gray-400", !active);
      btn.classList.toggle("dark:text-[#888888]", !active);
      btn.classList.toggle("hover:text-gray-700", !active);
      btn.classList.toggle("dark:hover:text-[#cccccc]", !active);
      btn.classList.toggle("font-medium", !active);
    });
  }

  if (dom.musicToggle) dom.musicToggle.checked = state.musicOnly;
  if (dom.unavailableToggle) dom.unavailableToggle.checked = state.unavailableOnly;

  const activeDiffCount =
    (state.maxViews !== null ? 1 : 0) +
    (!state.musicOnly ? 1 : 0) +
    (state.unavailableOnly ? 1 : 0);

  if (dom.filtersResetButton) {
    dom.filtersResetButton.classList.toggle("hidden", activeDiffCount === 0);
  }
  if (dom.filtersActiveBadge) {
    const showBadge = activeDiffCount > 0;
    dom.filtersActiveBadge.classList.toggle("hidden", !showBadge);
    dom.filtersActiveBadge.classList.toggle("inline-flex", showBadge);
    if (showBadge) {
      dom.filtersActiveBadge.textContent =
        activeDiffCount === 1 && state.maxViews !== null
          ? `<${stepObj.shortLabel}`
          : String(activeDiffCount);
    }
  }
}

function setMaxViewsStep(stepIndex) {
  const clamped = Math.max(0, Math.min(MAX_VIEWS_STEPS.length - 1, Number(stepIndex)));
  const nextVal = MAX_VIEWS_STEPS[clamped].value;
  if (nextVal === state.maxViews) return;
  state.maxViews = nextVal;
  localStorage.setItem("dislikes-max-views", nextVal === null ? "any" : String(nextVal));
  updateFiltersUI();
  filterVideos();
  render();
}

function resetFilters() {
  state.maxViews = null;
  state.musicOnly = true;
  state.unavailableOnly = false;
  localStorage.setItem("dislikes-max-views", "any");
  localStorage.setItem("dislikes-music-only", "true");
  localStorage.setItem("dislikes-unavailable-only", "false");
  updateFiltersUI();
  filterVideos();
  render();
}

function updateHeroCountDisplay(targetCount, animateSignature = null) {
  if (!dom.resultsHeroCount) return;
  if (state.heroAnimFrame) {
    cancelAnimationFrame(state.heroAnimFrame);
    state.heroAnimFrame = null;
  }
  if (typeof targetCount !== "number" || isNaN(targetCount)) {
    dom.resultsHeroCount.textContent = String(targetCount);
    return;
  }

  const fmt = formatCount;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (
    animateSignature &&
    animateSignature !== state.lastHeroAnimSignature &&
    targetCount > 0 &&
    !reducedMotion
  ) {
    state.lastHeroAnimSignature = animateSignature;
    const duration = 500;
    let startTs = null;
    const step = (ts) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      const easeOut = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      dom.resultsHeroCount.textContent = fmt(Math.round(easeOut * targetCount));
      if (p < 1) {
        state.heroAnimFrame = requestAnimationFrame(step);
      } else {
        state.heroAnimFrame = null;
        dom.resultsHeroCount.textContent = fmt(targetCount);
      }
    };
    state.heroAnimFrame = requestAnimationFrame(step);
  } else {
    dom.resultsHeroCount.textContent = fmt(targetCount);
  }
}

function tryRestoreCustomUpload() {
  try {
    const raw = localStorage.getItem("yt_dislikes_custom_upload");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.videos) || parsed.videos.length === 0) {
      localStorage.removeItem("yt_dislikes_custom_upload");
      return false;
    }
    if (parsed.mode === "like" || parsed.mode === "dislike") {
      state.mode = parsed.mode;
    }
    const normalized = normalizeImportedDataset(parsed.videos);
    if (!normalized.length) return false;
    state.dataSource = "upload";
    state.videos = normalized;
    state.nextPageToken = null;
    state.totalResults = normalized.length;
    state.error = null;
    filterVideos();
    return true;
  } catch {
    localStorage.removeItem("yt_dislikes_custom_upload");
    return false;
  }
}

function init() {
  console.log(`Dislikes v${APP_VERSION}`);
  const verEl = document.getElementById("app-version");
  if (verEl) verEl.textContent = `v${APP_VERSION}`;

  const params = new URLSearchParams(window.location.search || "");
  const modeParam = (params.get("mode") || "").toLowerCase();
  if (modeParam === "like" || modeParam === "dislike") {
    state.mode = modeParam;
  }
  const wantDemo =
    params.get("demo") === "1" ||
    params.get("demo") === "true" ||
    params.get("source") === "demo";

  applyTheme(state.theme);
  updateThemeToggleUI(state.theme);
  updateModeToggleUI(state.mode);
  updateFiltersUI();

  if (dom.compactToggle) {
    dom.compactToggle.checked = state.compactMode;
  }
  applyCompactMode(state.compactMode);

  setupEventListeners();
  setupMediaSessionHandlers();
  initYTPlayer();
  initGis();

  if (wantDemo) {
    render();
    loadDemoData();
  } else {
    if (!loadToken()) {
      tryRestoreCustomUpload();
    }
    render();
  }

  // If it's taking too long (e.g. 8 seconds), show the troubleshooting link
  setTimeout(() => {
    if (!state.gisInited && dom.initializationTrouble) {
      dom.initializationTrouble.classList.remove("hidden");
    }
  }, 8000);
}

function initGis() {
  let attempts = 0;
  const maxAttempts = 100; // 10 seconds
  const checkGis = setInterval(() => {
    attempts++;
    if (window.google?.accounts?.oauth2) {
      clearInterval(checkGis);
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp) => {
          if (resp.error) {
            showError("Authorization failed: " + resp.error);
            return;
          }
          saveToken(resp);
          localStorage.removeItem("yt_dislikes_custom_upload");
          state.accessToken = resp.access_token;
          state.isAuthenticated = true;
          state.dataSource = "youtube";
          state.videos = [];
          state.filteredVideos = [];
          state.sidebarBaseVideos = [];
          state.searchTerm = "";
          state.debouncedSearchTerm = "";
          dom.searchInput.value = "";
          updateSearchClearButton();
          state.nextPageToken = null;
          state.totalResults = null;
          state.error = null;
          render();
          fetchVideos();
        },
      });
      state.tokenClient = client;
      state.gisInited = true;
      checkReady();
    } else if (attempts > maxAttempts) {
      clearInterval(checkGis);
      console.warn("Google Identity Services load timeout");
      checkReady();
    }
  }, 100);
}

function saveToken(resp) {
  const expiresIn = parseInt(resp.expires_in, 10) || 3600;
  const tokenData = {
    ...resp,
    expires_at: Date.now() + expiresIn * 1000,
  };
  localStorage.setItem("yt_dislikes_token", JSON.stringify(tokenData));
}

function loadToken() {
  const data = localStorage.getItem("yt_dislikes_token");
  if (!data) return null;
  try {
    const tokenData = JSON.parse(data);
    if (!tokenData || !tokenData.access_token) return null;

    // If it's expiring in less than 5 minutes, consider it expired
    const now = Date.now();
    const expiresAt = parseInt(tokenData.expires_at, 10);

    if (isNaN(expiresAt) || now > expiresAt - 300000) {
      localStorage.removeItem("yt_dislikes_token");
      return null;
    }
    return tokenData;
  } catch (e) {
    console.error("Error loading token", e);
    return null;
  }
}

function checkReady() {
  if (state.gisInited) {
    if (dom.initializationTrouble) {
      dom.initializationTrouble.classList.add("hidden");
    }
    const token = loadToken();
    if (token && !state.isAuthenticated && !state.dataSource) {
      state.accessToken = token.access_token;
      state.isAuthenticated = true;
      state.dataSource = "youtube";
      // Initialize with loading state to avoid "All 0 loaded" flash
      state.loading = true;
      render();
      fetchVideos();
    } else {
      render(); // Update UI to enable buttons
    }
  }
}

function updateSearchClearButton() {
  if (!dom.searchClearButton) return;
  const hasValue = Boolean(dom.searchInput.value);
  dom.searchClearButton.classList.toggle("hidden", !hasValue);
  dom.searchClearButton.classList.toggle("flex", hasValue);
}

function isVideoPlayable(video) {
  return Boolean(
    video &&
      !checkIfDeleted(video) &&
      !state.restrictedVideoIds.has(video.video_id),
  );
}

function clearAutoSkipTimeout() {
  if (state.autoSkipTimeout) {
    clearTimeout(state.autoSkipTimeout);
    state.autoSkipTimeout = null;
  }
}

function findAdjacentPlayableIndex(fromIndex, step) {
  let i = fromIndex + step;
  while (i >= 0 && i < state.filteredVideos.length) {
    if (isVideoPlayable(state.filteredVideos[i])) {
      return i;
    }
    i += step;
  }
  return -1;
}

function getPlayableIndices() {
  const indices = [];
  for (let i = 0; i < state.filteredVideos.length; i++) {
    if (isVideoPlayable(state.filteredVideos[i])) {
      indices.push(i);
    }
  }
  return indices;
}

function updateShuffleUI() {
  const on = state.shuffleMode;
  if (dom.playerShuffle) {
    dom.playerShuffle.setAttribute("aria-pressed", String(on));
    dom.playerShuffle.classList.toggle("text-black", on);
    dom.playerShuffle.classList.toggle("dark:text-white", on);
    dom.playerShuffle.classList.toggle("bg-black/10", on);
    dom.playerShuffle.classList.toggle("dark:bg-white/15", on);
    dom.playerShuffle.classList.toggle("text-black/55", !on);
    dom.playerShuffle.classList.toggle("dark:text-gray-500", !on);
  }
  if (dom.fsPlayerShuffle) {
    dom.fsPlayerShuffle.setAttribute("aria-pressed", String(on));
    dom.fsPlayerShuffle.classList.toggle("text-black", on);
    dom.fsPlayerShuffle.classList.toggle("dark:text-white", on);
    dom.fsPlayerShuffle.classList.toggle("bg-black/10", on);
    dom.fsPlayerShuffle.classList.toggle("dark:bg-white/15", on);
    dom.fsPlayerShuffle.classList.toggle("text-gray-400", !on);
    dom.fsPlayerShuffle.classList.toggle("dark:text-gray-500", !on);
  }
}

function startOrderedPlay() {
  const playable = getPlayableIndices();
  if (playable.length === 0) {
    showToast("No playable tracks in current view", "error");
    return;
  }
  state.shuffleMode = false;
  state.shuffleHistory = [];
  state.shuffleHistoryPos = -1;
  state.consecutiveAutoSkips = 0;
  state.lastNavDirection = 1;
  updateShuffleUI();
  playTrackByIndex(playable[0], false);
}

function startShufflePlay() {
  const playable = getPlayableIndices();
  if (playable.length === 0) {
    showToast("No playable tracks in current view", "error");
    return;
  }

  state.shuffleMode = true;
  state.consecutiveAutoSkips = 0;
  state.lastNavDirection = 1;
  let candidates = playable;
  if (playable.length > 1 && state.currentVideoId) {
    const others = playable.filter(
      (i) => state.filteredVideos[i].video_id !== state.currentVideoId,
    );
    if (others.length > 0) candidates = others;
  }

  const chosenIdx = candidates[Math.floor(Math.random() * candidates.length)];
  state.shuffleHistory = [state.filteredVideos[chosenIdx].video_id];
  state.shuffleHistoryPos = 0;
  updateShuffleUI();
  playTrackByIndex(chosenIdx, true);
}

function toggleShuffleMode() {
  state.shuffleMode = !state.shuffleMode;
  if (state.shuffleMode) {
    state.shuffleHistory =
      state.currentVideoId && !state.restrictedVideoIds.has(state.currentVideoId)
        ? [state.currentVideoId]
        : [];
    state.shuffleHistoryPos = state.shuffleHistory.length - 1;
  } else {
    state.shuffleHistory = [];
    state.shuffleHistoryPos = -1;
  }
  updateShuffleUI();
  updatePrevNextButtons();
  showToast(state.shuffleMode ? "Shuffle on" : "Shuffle off");
}

function playPrevTrack(fromAutoSkip = false) {
  if (fromAutoSkip !== true) {
    state.consecutiveAutoSkips = 0;
  }
  state.lastNavDirection = -1;

  if (fromAutoSkip !== true && state.ytPlayer && state.ytPlayer.getCurrentTime) {
    if (state.ytPlayer.getCurrentTime() > 3) {
      state.ytPlayer.seekTo(0, true);
      return;
    }
  }

  if (state.shuffleMode && state.shuffleHistoryPos > 0) {
    for (let p = state.shuffleHistoryPos - 1; p >= 0; p--) {
      const vid = state.shuffleHistory[p];
      const idx = state.filteredVideos.findIndex(
        (v) => v.video_id === vid && isVideoPlayable(v),
      );
      if (idx !== -1) {
        state.shuffleHistoryPos = p;
        playTrackByIndex(idx, true);
        return;
      }
    }
  }

  if (!state.shuffleMode) {
    const prevIdx = findAdjacentPlayableIndex(state.currentVideoIndex, -1);
    if (prevIdx !== -1) {
      playTrackByIndex(prevIdx);
      return;
    }
  }

  if (fromAutoSkip !== true && state.ytPlayer && state.ytPlayer.seekTo) {
    state.ytPlayer.seekTo(0, true);
  }
}

function playNextTrack(fromAutoSkip = false) {
  if (fromAutoSkip !== true) {
    state.consecutiveAutoSkips = 0;
  }
  state.lastNavDirection = 1;

  if (state.shuffleMode) {
    // Step forward through shuffle history if user previously stepped back
    if (state.shuffleHistoryPos < state.shuffleHistory.length - 1) {
      for (let p = state.shuffleHistoryPos + 1; p < state.shuffleHistory.length; p++) {
        const vid = state.shuffleHistory[p];
        const idx = state.filteredVideos.findIndex(
          (v) => v.video_id === vid && isVideoPlayable(v),
        );
        if (idx !== -1) {
          state.shuffleHistoryPos = p;
          playTrackByIndex(idx, true);
          return;
        }
      }
    }

    const playable = getPlayableIndices();
    if (playable.length === 0) return;

    const visited = new Set(state.shuffleHistory);
    let candidates = playable.filter(
      (i) => !visited.has(state.filteredVideos[i].video_id),
    );
    if (candidates.length === 0) {
      // All playable tracks visited; start a fresh cycle avoiding repeating current track
      candidates =
        playable.length > 1 && state.currentVideoId
          ? playable.filter(
              (i) => state.filteredVideos[i].video_id !== state.currentVideoId,
            )
          : playable;
      state.shuffleHistory =
        state.currentVideoId && !state.restrictedVideoIds.has(state.currentVideoId)
          ? [state.currentVideoId]
          : [];
      state.shuffleHistoryPos = state.shuffleHistory.length - 1;
    }

    const chosenIdx = candidates[Math.floor(Math.random() * candidates.length)];
    state.shuffleHistory.push(state.filteredVideos[chosenIdx].video_id);
    state.shuffleHistoryPos = state.shuffleHistory.length - 1;
    playTrackByIndex(chosenIdx, true);
    return;
  }

  const nextIdx = findAdjacentPlayableIndex(state.currentVideoIndex, 1);
  if (nextIdx !== -1) {
    playTrackByIndex(nextIdx);
  }
}

function closePlayer() {
  try {
    if (state.ytPlayer && state.ytPlayer.stopVideo) {
      state.ytPlayer.stopVideo();
    }
  } catch {
    /* ignore */
  }
  stopProgressInterval();
  clearAutoplayFallback();
  clearAutoSkipTimeout();
  state.autoplayRequested = false;
  state.consecutiveAutoSkips = 0;
  state.currentVideoIndex = -1;
  state.currentVideoId = null;
  state.pendingVideoId = null;
  dom.bottomPlayer.classList.add("translate-y-full", "invisible");
  dom.fsPlayer.classList.add("translate-y-full", "invisible");
  document.body.style.paddingBottom = "0px";
  document.body.style.overflow = "";
  if (dom.fastScrubber) {
    dom.fastScrubber.classList.remove("bottom-24");
    dom.fastScrubber.classList.add("bottom-6");
    scheduleScrubberLayoutRefresh();
  }
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    } catch {
      /* ignore */
    }
  }
}

function setupEventListeners() {
  dom.authButton.addEventListener("click", handleAuthClick);
  dom.heroAuthButton.addEventListener("click", handleAuthClick);
  if (dom.heroDemoButton) {
    dom.heroDemoButton.addEventListener("click", loadDemoData);
  }
  if (dom.heroUploadButton) {
    dom.heroUploadButton.addEventListener("click", () => dom.uploadJsonInput?.click());
  }
  dom.signoutButton.addEventListener("click", handleSignout);

  if (dom.errorRetryButton) {
    dom.errorRetryButton.addEventListener("click", () => {
      if (state.isAuthenticated) {
        setError(null);
        fetchVideos();
      } else {
        window.location.reload();
      }
    });
  }

  const togglePlayPause = () => {
    if (!state.isPlayerReady || !state.ytPlayer) return;
    const playerState = state.ytPlayer.getPlayerState();
    if (playerState === 1 || playerState === 3) {
      state.autoplayRequested = false;
      clearAutoplayFallback();
      state.ytPlayer.pauseVideo();
    } else {
      state.autoplayRequested = true;
      state.ytPlayer.playVideo();
      scheduleAutoplayFallbackCheck(1200);
    }
  };

  dom.playerPlayPause.addEventListener("click", togglePlayPause);
  dom.fsPlayerPlayPause.addEventListener("click", togglePlayPause);
  dom.fsPlayerThumbnail.addEventListener("click", togglePlayPause);

  if (dom.playAllButton) {
    dom.playAllButton.addEventListener("click", startOrderedPlay);
  }
  if (dom.shufflePlayButton) {
    dom.shufflePlayButton.addEventListener("click", startShufflePlay);
  }
  if (dom.playerShuffle) {
    dom.playerShuffle.addEventListener("click", toggleShuffleMode);
  }
  if (dom.fsPlayerShuffle) {
    dom.fsPlayerShuffle.addEventListener("click", toggleShuffleMode);
  }

  dom.bottomPlayer.addEventListener("click", (e) => {
    // Don't trigger if they clicked a button, the progress bar, or a link
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("a") || e.target.closest("#bottom-player-progress-container")) {
      return;
    }
    dom.fsPlayer.classList.remove("translate-y-full", "invisible");
    // Make sure we stop body scrolling while full screen is open
    document.body.style.overflow = "hidden";
  });

  dom.fsPlayerClose.addEventListener("click", () => {
    dom.fsPlayer.classList.add("translate-y-full", "invisible");
    document.body.style.overflow = "";
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!dom.fsPlayer.classList.contains("translate-y-full")) {
        dom.fsPlayer.classList.add("translate-y-full", "invisible");
        document.body.style.overflow = "";
      } else if (isAnyPopoverOpen()) {
        const activeEl = document.activeElement;
        if (dom.sortMenu && !dom.sortMenu.classList.contains("hidden") && dom.sortDropdown?.contains(activeEl)) {
          dom.sortTrigger?.focus();
        } else if (
          dom.filtersMenu &&
          !dom.filtersMenu.classList.contains("hidden") &&
          dom.filtersDropdown?.contains(activeEl)
        ) {
          dom.filtersTrigger?.focus();
        } else if (
          dom.sidebarFilterMenu &&
          !dom.sidebarFilterMenu.classList.contains("hidden") &&
          dom.sidebarFilterDropdown?.contains(activeEl)
        ) {
          dom.sidebarFilterTrigger?.focus();
        } else if (dom.settingsMenu && !dom.settingsMenu.classList.contains("hidden") && dom.settingsMenu.contains(activeEl)) {
          dom.settingsButton?.focus();
        }
        closeAllPopovers();
      }
      return;
    }

    // Ignore Space when typing or focused on an interactive control, or when player is closed
    if (
      e.target.closest("input, textarea, select, button, a, [contenteditable]") ||
      dom.bottomPlayer.classList.contains("translate-y-full")
    ) {
      return;
    }

    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      togglePlayPause();
    }
  });

  dom.fsPlayerProgress.addEventListener("input", (e) => {
    if (state.ytPlayer && state.ytPlayer.getDuration) {
      const duration = state.ytPlayer.getDuration();
      const seekTo = (e.target.value / 100) * duration;
      state.ytPlayer.seekTo(seekTo, true);
      dom.fsPlayerTimeCurrent.innerText = formatTime(seekTo);
    }
  });

  dom.fsPlayerPrev.addEventListener("click", playPrevTrack);
  dom.playerPrev.addEventListener("click", playPrevTrack);

  dom.fsPlayerNext.addEventListener("click", playNextTrack);
  dom.playerNext.addEventListener("click", playNextTrack);

  dom.bottomPlayerProgressContainer.addEventListener("click", (e) => {
    if (state.ytPlayer && state.ytPlayer.getDuration) {
      const rect = dom.bottomPlayerProgressContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const duration = state.ytPlayer.getDuration();
      const seekTo = percent * duration;
      state.ytPlayer.seekTo(seekTo, true);
      dom.playerTimeCurrent.innerText = formatTime(seekTo);
    }
  });

  dom.playerClose.addEventListener("click", closePlayer);

  const debouncedSearch = debounce((value) => {
    state.debouncedSearchTerm = value;
    filterVideos();
    render();
  }, 300);

  setupCustomDropdown({
    container: dom.sidebarFilterDropdown,
    trigger: dom.sidebarFilterTrigger,
    menu: dom.sidebarFilterMenu,
    chevron: dom.sidebarFilterChevron,
    labelEl: dom.sidebarFilterLabel,
    getValue: () => state.sidebarCategory,
    onSelect: (newValue) => {
      state.sidebarCategory = newValue;
      renderSidebar();
    },
  });

  // Sidebar item clicks -> populate search input directly (cowneck/music style)
  dom.sidebarListContainer.addEventListener("click", (e) => {
    const filterItem = e.target.closest(".sidebar-filter-item");
    if (!filterItem) return;
    const query = filterItem.dataset.query || "";
    if (!query) return;

    const currentLower = state.debouncedSearchTerm.trim().toLowerCase();
    const isSame = currentLower !== "" && currentLower === query.trim().toLowerCase();
    applySearchQuery(isSame ? "" : query);

    if (window.scrollY > 80) {
      window.scrollTo({ top: 0, behavior: "auto" });
      virtualGrid.lastScrollY = 0;
    }

    // On mobile, automatically close the filters after selecting one
    if (window.innerWidth < 1024) {
      setMobileFiltersOpen(false);
    }
  });

  // Mobile filter toggle
  if (dom.mobileFilterToggle) {
    dom.mobileFilterToggle.addEventListener("click", () => {
      const isHidden = dom.sidebarContent.classList.contains("hidden");
      setMobileFiltersOpen(isHidden);
    });
  }

  dom.searchInput.addEventListener("input", (e) => {
    state.searchTerm = e.target.value;
    updateSearchClearButton();
    debouncedSearch(e.target.value);
  });

  if (dom.searchClearButton) {
    dom.searchClearButton.addEventListener("click", () => {
      applySearchQuery("");
      dom.searchInput.focus();
    });
  }

  setupCustomDropdown({
    container: dom.sortDropdown,
    trigger: dom.sortTrigger,
    menu: dom.sortMenu,
    chevron: dom.sortChevron,
    labelEl: dom.sortLabel,
    getValue: () => state.sortBy,
    onSelect: (newValue) => {
      state.sortBy = newValue;
      filterVideos();
      render();
    },
  });

  dom.copyIdsButton.addEventListener("click", handleCopyIds);
  dom.exportJsonButton.addEventListener("click", handleExportJson);
  dom.uploadJsonButton.addEventListener("click", () => dom.uploadJsonInput.click());
  dom.uploadJsonInput.addEventListener("change", handleUploadJson);
  dom.clearCacheButton.addEventListener("click", handleClearCache);
  dom.loadAllButton.addEventListener("click", handleLoadAll);

  // Drag-and-drop JSON upload anywhere in the window
  let dragDepth = 0;
  const setDropOverlayVisible = (visible) => {
    if (!dom.dropOverlay) return;
    dom.dropOverlay.classList.toggle("hidden", !visible);
    dom.dropOverlay.classList.toggle("flex", visible);
  };
  const hasDraggedFiles = (e) => {
    const types = e.dataTransfer?.types;
    return Boolean(types && Array.from(types).includes("Files"));
  };
  window.addEventListener("dragenter", (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    setDropOverlayVisible(true);
  });
  window.addEventListener("dragover", (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDropOverlayVisible(false);
  });
  window.addEventListener("drop", (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    setDropOverlayVisible(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      loadUploadedJsonFile(file);
    }
  });

  // Infinite Scroll Observer (for loading next YouTube API pages)
  const observer = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        state.nextPageToken &&
        !state.loading &&
        !state.debouncedSearchTerm.trim()
      ) {
        handleLoadMore();
      }
    },
    { threshold: 0.1 },
  );

  observer.observe(dom.scrollSentinel);

  // Delegated card playback handler (zero per-card listener closures)
  dom.videoGrid.addEventListener("click", (e) => {
    const playBtn = e.target.closest?.(".video-play-btn");
    if (!playBtn || playBtn.disabled) return;
    const card = playBtn.closest?.(".video-card");
    if (!card) return;
    const idx = parseInt(card.dataset.videoIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= state.filteredVideos.length) return;
    const video = state.filteredVideos[idx];
    if (!video || checkIfDeleted(video)) return;
    state.consecutiveAutoSkips = 0;
    state.lastNavDirection = 1;
    const baseUrl = video.is_music ? "https://music.youtube.com" : "https://www.youtube.com";
    const channelUrl = video.channel_id
      ? `${baseUrl}/channel/${encodeURIComponent(video.channel_id)}`
      : null;
    const thumbnail = `https://i.ytimg.com/vi/${video.video_id}/mqdefault.jpg`;
    playVideo(
      video.video_id,
      video.title || "Unavailable",
      video.artist || "Unknown channel",
      thumbnail,
      channelUrl,
      idx,
    );
  });

  // Fast Scrubber & Virtualized Grid Scroll / Resize Logic
  const setScrubberThumbActive = (active) => {
    if (!dom.scrubberThumb) return;
    dom.scrubberThumb.classList.toggle("bg-black/25", active);
    dom.scrubberThumb.classList.toggle("dark:bg-white/35", active);
    dom.scrubberThumb.classList.toggle("bg-black/10", !active);
    dom.scrubberThumb.classList.toggle("dark:bg-white/15", !active);
  };

  const jumpToCheckpoint = (cpIdx, edgeOverride = null, deferThumbs = false) => {
    const checkpoints = scrubberState.checkpoints;
    if (!checkpoints.length || state.filteredVideos.length === 0) return;
    const clampedIdx = Math.max(0, Math.min(checkpoints.length - 1, cpIdx));
    const cp = checkpoints[clampedIdx];
    const edge = edgeOverride || (clampedIdx === 0 ? "top" : null);
    const targetItem = edge === "bottom" ? state.filteredVideos.length - 1 : cp.startIndex;
    const fraction =
      edge === "top"
        ? 0
        : edge === "bottom"
          ? 1
          : (clampedIdx + 0.5) / checkpoints.length;
    scrollToVideoIndex(targetItem, edge, deferThumbs);
    updateScrubberPositionUI(fraction, clampedIdx, targetItem, true);
  };

  if (dom.scrubberTopBtn) {
    dom.scrubberTopBtn.addEventListener("click", () => {
      jumpToCheckpoint(0, "top", false);
      scheduleHideScrubberTooltip(650);
    });
  }

  if (dom.scrubberBottomBtn) {
    dom.scrubberBottomBtn.addEventListener("click", () => {
      jumpToCheckpoint(scrubberState.checkpoints.length - 1, "bottom", false);
      scheduleHideScrubberTooltip(650);
    });
  }

  if (dom.scrubberTrack) {
    let activePointerId = null;
    let startClientY = 0;
    let latestClientY = 0;
    let hasDragged = false;
    let handledByPointer = false;
    let scrubMoveRaf = null;
    let scrubPauseTimer = null;
    let pendingTarget = null;
    let committedItemIndex = -1;

    const clearScrubTimers = () => {
      if (scrubMoveRaf) {
        cancelAnimationFrame(scrubMoveRaf);
        scrubMoveRaf = null;
      }
      if (scrubPauseTimer) {
        clearTimeout(scrubPauseTimer);
        scrubPauseTimer = null;
      }
    };

    const previewTargetAtClientY = (clientY) => {
      const rect = dom.scrubberTrack.getBoundingClientRect();
      const height = Math.max(1, rect.height);
      const fraction = Math.max(0, Math.min(1, (clientY - rect.top) / height));
      const { cpIdx, itemIndex, edge } = fractionToScrubberTarget(fraction);
      pendingTarget = { fraction, cpIdx, itemIndex, edge };
      updateScrubberPositionUI(fraction, cpIdx, itemIndex, true);
    };

    const commitPendingTarget = (deferThumbs) => {
      if (!pendingTarget) return;
      if (!deferThumbs || pendingTarget.itemIndex !== committedItemIndex) {
        committedItemIndex = pendingTarget.itemIndex;
        scrollToVideoIndex(pendingTarget.itemIndex, pendingTarget.edge, deferThumbs);
      }
    };

    dom.scrubberTrack.addEventListener("pointerdown", (e) => {
      if (e.button && e.button !== 0) return;
      if (!scrubberState.checkpoints.length) return;
      e.preventDefault();
      clearScrubTimers();
      handledByPointer = true;
      activePointerId = e.pointerId;
      startClientY = e.clientY;
      latestClientY = e.clientY;
      hasDragged = false;
      committedItemIndex = -1;
      scrubberState.isDragging = true;
      setScrubberThumbActive(true);
      try {
        dom.scrubberTrack.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      const cpEl = e.target.closest?.("[data-checkpoint-idx]");
      if (cpEl) {
        const k = parseInt(cpEl.dataset.checkpointIdx, 10);
        if (!isNaN(k)) {
          const checkpoints = scrubberState.checkpoints;
          const clampedIdx = Math.max(0, Math.min(checkpoints.length - 1, k));
          const cp = checkpoints[clampedIdx];
          const edge = clampedIdx === 0 ? "top" : null;
          const fraction = edge === "top" ? 0 : (clampedIdx + 0.5) / checkpoints.length;
          pendingTarget = { fraction, cpIdx: clampedIdx, itemIndex: cp.startIndex, edge };
          updateScrubberPositionUI(fraction, clampedIdx, cp.startIndex, true);
          scrubPauseTimer = setTimeout(() => {
            scrubPauseTimer = null;
            commitPendingTarget(true);
          }, 110);
          return;
        }
      }

      previewTargetAtClientY(e.clientY);
      scrubPauseTimer = setTimeout(() => {
        scrubPauseTimer = null;
        commitPendingTarget(true);
      }, 110);
    });

    dom.scrubberTrack.addEventListener("pointermove", (e) => {
      if (!scrubberState.isDragging || e.pointerId !== activePointerId) return;
      if (!hasDragged && Math.abs(e.clientY - startClientY) < 4) return;
      hasDragged = true;
      latestClientY = e.clientY;

      if (scrubPauseTimer) {
        clearTimeout(scrubPauseTimer);
      }
      // Only commit a discrete scroll jump when finger pauses briefly (prevents iOS WebKit TileController OOM)
      scrubPauseTimer = setTimeout(() => {
        scrubPauseTimer = null;
        commitPendingTarget(true);
      }, 110);

      if (!scrubMoveRaf) {
        scrubMoveRaf = requestAnimationFrame(() => {
          scrubMoveRaf = null;
          if (scrubberState.isDragging) {
            previewTargetAtClientY(latestClientY);
          }
        });
      }
    });

    const finishPointerScrub = (e) => {
      if (!scrubberState.isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) {
        return;
      }
      clearScrubTimers();
      try {
        dom.scrubberTrack.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      activePointerId = null;
      scrubberState.isDragging = false;
      setScrubberThumbActive(false);

      if (e.type !== "pointercancel" && pendingTarget) {
        commitPendingTarget(false);
      } else {
        hydrateVisibleThumbnails();
      }
      pendingTarget = null;
      scheduleHideScrubberTooltip(500);
      setTimeout(() => {
        handledByPointer = false;
      }, 0);
    };

    dom.scrubberTrack.addEventListener("pointerup", finishPointerScrub);
    dom.scrubberTrack.addEventListener("pointercancel", finishPointerScrub);

    dom.scrubberTrack.addEventListener("click", (e) => {
      if (handledByPointer || !scrubberState.checkpoints.length) return;
      const cpEl = e.target.closest?.("[data-checkpoint-idx]");
      if (cpEl) {
        const k = parseInt(cpEl.dataset.checkpointIdx, 10);
        if (!isNaN(k)) {
          jumpToCheckpoint(k, null, false);
          scheduleHideScrubberTooltip(650);
        }
      }
    });

    dom.scrubberTrack.addEventListener("keydown", (e) => {
      const K = scrubberState.checkpoints.length;
      if (!K) return;
      const cur = Math.max(0, scrubberState.activeCheckpointIdx);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(K - 1, cur + 1);
        jumpToCheckpoint(next, next === K - 1 && cur === K - 1 ? "bottom" : null);
        scheduleHideScrubberTooltip(800);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        jumpToCheckpoint(Math.max(0, cur - 1));
        scheduleHideScrubberTooltip(800);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        jumpToCheckpoint(Math.min(K - 1, cur + 4));
        scheduleHideScrubberTooltip(800);
      } else if (e.key === "PageUp") {
        e.preventDefault();
        jumpToCheckpoint(Math.max(0, cur - 4));
        scheduleHideScrubberTooltip(800);
      } else if (e.key === "Home") {
        e.preventDefault();
        jumpToCheckpoint(0, "top");
        scheduleHideScrubberTooltip(800);
      } else if (e.key === "End") {
        e.preventDefault();
        jumpToCheckpoint(K - 1, "bottom");
        scheduleHideScrubberTooltip(800);
      }
    });
  }

  let scrollRafPending = false;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollRafPending) return;
      scrollRafPending = true;
      requestAnimationFrame(() => {
        scrollRafPending = false;
        const currentY = window.scrollY || 0;
        const delta = Math.abs(currentY - virtualGrid.lastScrollY);
        virtualGrid.lastScrollY = currentY;
        const fastFlick = delta > 260;
        renderVirtualGrid(false, null, fastFlick);
        if (fastFlick) {
          scheduleThumbnailHydration(140);
        }
        syncScrubberFromScroll();
      });
    },
    { passive: true },
  );

  let resizeRafPending = false;
  let lastResizeWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (resizeRafPending) return;
    resizeRafPending = true;
    requestAnimationFrame(() => {
      resizeRafPending = false;
      const width = window.innerWidth;
      if (width === lastResizeWidth) {
        // Height-only resize (mobile URL bar showing/hiding while scrolling): columns and card
        // size are unchanged, so skip the full re-measure and just fill any newly exposed rows.
        if (state.filteredVideos.length > 0 && !dom.viewContent.classList.contains("hidden")) {
          renderVirtualGrid(false);
          scheduleScrubberLayoutRefresh();
        }
        return;
      }
      lastResizeWidth = width;
      virtualGrid.cols = 0;
      virtualGrid.rowHeight = 0;
      scrubberState.renderedSignature = "";
      if (state.filteredVideos.length > 0 && !dom.viewContent.classList.contains("hidden")) {
        syncScrubberTopOffset();
        renderVirtualGrid(true);
        renderScrubberCheckpoints();
        syncScrubberFromScroll();
      }
    });
  });

  const selectMode = (nextMode) => {
    if (!nextMode || (nextMode !== "like" && nextMode !== "dislike") || nextMode === state.mode) {
      return;
    }
    state.mode = nextMode;
    localStorage.setItem("dislikes-mode", state.mode);
    updateModeToggleUI(state.mode);

    invalidateActiveFetch();

    // Clear state for new mode
    state.videos = [];
    state.filteredVideos = [];
    state.sidebarBaseVideos = [];
    state.nextPageToken = null;
    state.totalResults = null;
    state.error = null;
    state.searchTerm = "";
    state.debouncedSearchTerm = "";
    dom.searchInput.value = "";
    updateSearchClearButton();

    if (state.isAuthenticated) {
      state.dataSource = "youtube";
      fetchVideos();
    } else {
      localStorage.removeItem("yt_dislikes_custom_upload");
      state.dataSource = null;
      closePlayer();
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    render();
  };

  if (dom.modeToggleGroup) {
    dom.modeToggleGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".mode-option");
      if (!btn) return;
      selectMode(btn.dataset.modeValue);
    });

    dom.modeToggleGroup.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") {
        return;
      }
      const buttons = Array.from(dom.modeToggleGroup.querySelectorAll(".mode-option"));
      if (!buttons.length) return;
      e.preventDefault();
      const currentIdx = buttons.findIndex((b) => b.dataset.modeValue === state.mode);
      const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      const nextBtn = buttons[(Math.max(0, currentIdx) + delta + buttons.length) % buttons.length];
      if (nextBtn) {
        selectMode(nextBtn.dataset.modeValue);
        nextBtn.focus();
      }
    });
  }

  // Dedicated Filters Popover Logic
  if (dom.filtersTrigger && dom.filtersMenu) {
    dom.filtersTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = dom.filtersMenu.classList.contains("hidden");
      closeAllPopovers(dom.filtersMenu);
      dom.filtersMenu.classList.toggle("hidden", !willOpen);
      dom.filtersTrigger.setAttribute("aria-expanded", String(willOpen));
    });
  }

  if (dom.maxViewsSlider) {
    dom.maxViewsSlider.addEventListener("input", (e) => {
      setMaxViewsStep(parseInt(e.target.value, 10));
    });
  }

  if (dom.maxViewsStops) {
    dom.maxViewsStops.addEventListener("click", (e) => {
      const btn = e.target.closest(".max-views-stop");
      if (!btn) return;
      const step = parseInt(btn.dataset.maxViewsStep, 10);
      if (!isNaN(step)) {
        setMaxViewsStep(step);
      }
    });
  }

  if (dom.filtersResetButton) {
    dom.filtersResetButton.addEventListener("click", () => {
      resetFilters();
    });
  }

  // Settings Menu Logic
  dom.settingsButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = dom.settingsMenu.classList.contains("hidden");
    closeAllPopovers(dom.settingsMenu);
    dom.settingsMenu.classList.toggle("hidden", !willOpen);
    dom.settingsButton.setAttribute("aria-expanded", String(willOpen));
  });

  const dismissPopoversOutside = (e) => {
    if (
      dom.settingsMenu &&
      !dom.settingsMenu.classList.contains("hidden") &&
      !dom.settingsMenu.contains(e.target) &&
      !dom.settingsButton.contains(e.target)
    ) {
      dom.settingsMenu.classList.add("hidden");
      dom.settingsButton.setAttribute("aria-expanded", "false");
    }
    if (
      dom.filtersMenu &&
      !dom.filtersMenu.classList.contains("hidden") &&
      !dom.filtersDropdown.contains(e.target)
    ) {
      dom.filtersMenu.classList.add("hidden");
      dom.filtersTrigger.setAttribute("aria-expanded", "false");
    }
    if (
      dom.sortMenu &&
      !dom.sortMenu.classList.contains("hidden") &&
      !dom.sortDropdown.contains(e.target)
    ) {
      dom.sortMenu.classList.add("hidden");
      dom.sortTrigger.setAttribute("aria-expanded", "false");
      dom.sortChevron.classList.remove("rotate-180");
    }
    if (
      dom.sidebarFilterMenu &&
      !dom.sidebarFilterMenu.classList.contains("hidden") &&
      !dom.sidebarFilterDropdown.contains(e.target)
    ) {
      dom.sidebarFilterMenu.classList.add("hidden");
      dom.sidebarFilterTrigger.setAttribute("aria-expanded", "false");
      dom.sidebarFilterChevron.classList.remove("rotate-180");
    }
  };

  document.addEventListener("pointerdown", dismissPopoversOutside);
  document.addEventListener("click", dismissPopoversOutside);

  // Theme Logic
  const selectTheme = (newTheme) => {
    if (!newTheme || newTheme === state.theme) return;
    state.theme = newTheme;
    localStorage.setItem("dislikes-theme", newTheme);
    applyTheme(newTheme);
    updateThemeToggleUI(newTheme);
  };

  if (dom.themeToggleGroup) {
    dom.themeToggleGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-option");
      if (!btn) return;
      selectTheme(btn.dataset.themeValue);
    });

    dom.themeToggleGroup.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") {
        return;
      }
      const buttons = Array.from(dom.themeToggleGroup.querySelectorAll(".theme-option"));
      if (!buttons.length) return;
      e.preventDefault();
      const currentIdx = buttons.findIndex((b) => b.dataset.themeValue === state.theme);
      const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      const nextBtn = buttons[(Math.max(0, currentIdx) + delta + buttons.length) % buttons.length];
      if (nextBtn) {
        selectTheme(nextBtn.dataset.themeValue);
        nextBtn.focus();
      }
    });
  }

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") {
      applyTheme("system");
    }
  });

  // Compact Mode Logic
  dom.compactToggle.addEventListener("change", (e) => {
    const isCompact = e.target.checked;
    state.compactMode = isCompact;
    localStorage.setItem("dislikes-compact", isCompact);
    applyCompactMode(isCompact);
  });

  // Music Only Logic
  dom.musicToggle.checked = state.musicOnly;
  dom.musicToggle.addEventListener("change", (e) => {
    const isMusicOnly = e.target.checked;
    state.musicOnly = isMusicOnly;
    localStorage.setItem("dislikes-music-only", isMusicOnly);
    updateFiltersUI();
    filterVideos();
    render();
  });

  // Unavailable Only Logic
  dom.unavailableToggle.checked = state.unavailableOnly;
  dom.unavailableToggle.addEventListener("change", (e) => {
    const isUnavailableOnly = e.target.checked;
    state.unavailableOnly = isUnavailableOnly;
    localStorage.setItem("dislikes-unavailable-only", isUnavailableOnly);
    updateFiltersUI();
    filterVideos();
    render();
  });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function checkIfDeleted(video) {
  if (video._is404) return true;
  return video.is_deleted;
}

function handleAuthClick() {
  if (state.tokenClient) {
    // Use prompt: '' to avoid forcing the consent screen if already granted
    state.tokenClient.requestAccessToken({ prompt: "" });
  }
}

function handleSignout() {
  invalidateActiveFetch();
  closePlayer();

  // Clear Google OAuth token only if an OAuth session is active
  if (state.isAuthenticated) {
    if (state.accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(state.accessToken, () => {});
    }
    localStorage.removeItem("yt_dislikes_token");
  }
  localStorage.removeItem("yt_dislikes_custom_upload");

  // Reset state
  state.accessToken = null;
  state.isAuthenticated = false;
  state.dataSource = null;
  state.videos = [];
  state.filteredVideos = [];
  state.sidebarBaseVideos = [];
  state.nextPageToken = null;
  state.totalResults = null;
  state.error = null;
  state.searchTerm = "";
  state.debouncedSearchTerm = "";

  // Clear UI
  dom.searchInput.value = "";
  updateSearchClearButton();
  setMobileFiltersOpen(false);

  render();
}

function handleClearCache() {
  if (!state.isAuthenticated) return;
  invalidateActiveFetch();
  localStorage.removeItem(`yt_dislikes_cache_${state.mode}`);
  state.dataSource = "youtube";
  state.videos = [];
  state.filteredVideos = [];
  state.sidebarBaseVideos = [];
  state.nextPageToken = null;
  state.totalResults = null;
  state.forceRefetch = true;
  fetchVideos();
}

function parseViews(viewVal) {
  if (viewVal === undefined || viewVal === null) return 0;
  if (typeof viewVal === "number") return isNaN(viewVal) ? 0 : viewVal;
  const numStr = String(viewVal).replace(/[^0-9.KMBkmb]/g, "");
  let multiplier = 1;
  if (/k/i.test(numStr)) multiplier = 1_000;
  else if (/m/i.test(numStr)) multiplier = 1_000_000;
  else if (/b/i.test(numStr)) multiplier = 1_000_000_000;
  const val = parseFloat(numStr.replace(/[KMBkmb]/g, ""));
  return isNaN(val) ? 0 : Math.round(val * multiplier);
}

function isArtTrackVideo(v) {
  return Boolean(v?.artist?.endsWith(" - Topic") || v?.label);
}

function normalizeStoredVideo(v, assumeAllMusic = false, index = 0) {
  if (!v || typeof v !== "object") return v;
  const artTrack = isArtTrackVideo(v);
  const publishedAt =
    artTrack && v.published_at && !String(v.published_at).endsWith("T00:00:00Z")
      ? null
      : v.published_at || null;
  const isMusic =
    typeof v.is_music === "boolean" ? v.is_music : Boolean(assumeAllMusic || artTrack);

  const { _is404, ...rest } = v;
  return {
    ...rest,
    views: parseViews(v.views),
    comments: Number(v.comments) || 0,
    published_at: publishedAt,
    is_deleted: Boolean(v.is_deleted),
    is_music: isMusic,
    _origIdx: typeof v._origIdx === "number" ? v._origIdx : index,
  };
}

function isLibraryUploadVideo(v) {
  if (!v || typeof v !== "object") return false;
  const artist = String(v.artist || v.snippet?.channelTitle || "").trim();
  const title = String(v.title || v.snippet?.title || "");
  return artist === "Music Library Uploads" || title.includes("TrackUniquenessId");
}

function normalizeImportedDataset(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  const valid = rawArray.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      item.video_id &&
      !isLibraryUploadVideo(item),
  );
  const hasExplicitMusicFlag = valid.some((item) => typeof item.is_music === "boolean");
  return valid.map((item, idx) => normalizeStoredVideo(item, !hasExplicitMusicFlag, idx));
}

function loadFromCache(mode = state.mode) {
  try {
    const data = localStorage.getItem(`yt_dislikes_cache_${mode}`);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.videos)) {
        parsed.videos = parsed.videos
          .filter((v) => !isLibraryUploadVideo(v))
          .map((v, idx) => normalizeStoredVideo(v, false, idx));
      }
      return parsed;
    }
  } catch (e) {
    console.error("Failed to load cache:", e);
  }
  return null;
}

function saveToCache(
  mode = state.mode,
  videos = state.videos,
  nextPageToken = state.nextPageToken,
  totalResults = state.totalResults,
) {
  try {
    const data = {
      videos,
      nextPageToken,
      totalResults,
      timestamp: Date.now()
    };
    // _is404 is a per-session guess from a failed thumbnail load (often just a flaky connection),
    // so never persist it or the track stays "Unavailable" forever.
    localStorage.setItem(
      `yt_dislikes_cache_${mode}`,
      JSON.stringify(data, (key, value) => (key === "_is404" ? undefined : value)),
    );
  } catch (e) {
    console.error("Failed to save cache:", e);
  }
}

// --- Logic ---

function slimVideo(v) {
  const isDeleted = v.status ? (v.status.uploadStatus === "deleted" || v.status.uploadStatus === "rejected") : (!v.snippet);
  
  let inferredDate = null;
  let inferredLabel = null;
  let inferredCopyright = null;
  let isArtTrack = Boolean(v.snippet?.channelTitle?.endsWith(" - Topic"));

  if (v.snippet && v.snippet.description) {
    const desc = v.snippet.description;
    
    const dateMatch = desc.match(/Released on:\s*(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
      inferredDate = dateMatch[1] + "T00:00:00Z";
    }

    const labelMatch = desc.match(/Provided to YouTube by\s+(.*)/i);
    if (labelMatch) {
      inferredLabel = labelMatch[1].trim();
    }

    const copyrightMatch = desc.match(/℗\s+(.*)/i);
    if (copyrightMatch) {
      inferredCopyright = copyrightMatch[1].trim();
    }

    if (inferredLabel || /Auto-generated by YouTube\./i.test(desc)) {
      isArtTrack = true;
    }
  }

  return {
    title: v.snippet?.title || "Unavailable",
    artist: v.snippet?.channelTitle || "Unknown",
    video_id: v.id,
    channel_id: v.snippet?.channelId || null,
    views: v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : 0,
    comments: v.statistics?.commentCount ? parseInt(v.statistics.commentCount, 10) : 0,
    duration: v.contentDetails?.duration || null,
    published_at: inferredDate || (isArtTrack ? null : v.snippet?.publishedAt || null),
    label: inferredLabel,
    copyright: inferredCopyright,
    is_deleted: isDeleted,
    is_music: v.snippet?.categoryId === "10"
  };
}

let activeFetchPromise = null;
let fetchGeneration = 0;
let lastCacheSaveTs = 0;

function invalidateActiveFetch() {
  fetchGeneration++;
  activeFetchPromise = null;
  state.isFetchAll = false;
  state.loading = false;
  state.isLoadMore = false;
}

async function youtubeApiGet(endpoint, params = {}, timeoutMs = 30000) {
  if (!state.accessToken) {
    const authErr = new Error("Not authenticated");
    authErr.status = 401;
    throw authErr;
  }
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${state.accessToken}` },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error?.message || `YouTube API error (${res.status})`);
      err.status = res.status;
      err.result = json;
      throw err;
    }
    return json;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVideos(pageToken = null) {
  if (activeFetchPromise) {
    return activeFetchPromise;
  }

  const gen = ++fetchGeneration;
  const fetchMode = state.mode;

  const currentPromise = (async () => {
    const isLoadMore = !!pageToken;
    setLoading(true, isLoadMore);
    setError(null);

    if (!isLoadMore && !state.forceRefetch) {
      const cached = loadFromCache(fetchMode);
      if (cached) {
        if (gen !== fetchGeneration || state.mode !== fetchMode) return;
        state.videos = cached.videos;
        state.nextPageToken = cached.nextPageToken;
        state.totalResults = cached.totalResults;
        filterVideos();
        setLoading(false, false);
        return;
      }
    }

    state.forceRefetch = false;

    try {
      let items = [];
      let nextToken = null;
      let total = 0;

      if (fetchMode === "like") {
        // Use playlistItems for Likes to bypass the 1000-item limit of videos.list(myRating='like')
        // 'LL' is the magic ID for the Liked Videos playlist
        const plResult = await youtubeApiGet("playlistItems", {
          playlistId: "LL",
          part: "contentDetails",
          maxResults: 50,
          pageToken: pageToken || "",
        });

        if (gen !== fetchGeneration || state.mode !== fetchMode) return;

        const videoIds = (plResult.items || []).map(
          (item) => item.contentDetails.videoId,
        );
        nextToken = plResult.nextPageToken || null;
        total = plResult.pageInfo?.totalResults || 0;

        if (videoIds.length > 0) {
          const vResult = await youtubeApiGet("videos", {
            id: videoIds.join(","),
            part: "snippet,contentDetails,statistics,status",
          });

          if (gen !== fetchGeneration || state.mode !== fetchMode) return;

          const fetchedItems = vResult.items || [];
          // Maintain the order returned by the playlist, and preserve deleted/private videos
          const itemsMap = fetchedItems.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
          }, {});
          items = videoIds.map((id) => {
            if (itemsMap[id]) return itemsMap[id];
            // If videos.list doesn't return the video, it's deleted/private
            return {
              id: id,
              status: { uploadStatus: "deleted" },
              snippet: null,
            };
          });
        }
      } else {
        // Use videos.list for Dislikes
        // NOTE: This filter is known to be capped at 1000 items by the YouTube API.
        // Since there is no "Disliked Videos" playlist, this is the only way to fetch them.
        const result = await youtubeApiGet("videos", {
          myRating: fetchMode,
          part: "snippet,contentDetails,statistics,status",
          maxResults: 50,
          pageToken: pageToken || "",
        });

        if (gen !== fetchGeneration || state.mode !== fetchMode) return;

        items = result.items || [];
        nextToken = result.nextPageToken || null;
        total = result.pageInfo?.totalResults || 0;
      }

      const slimmedItems = items.map(slimVideo).filter((v) => !isLibraryUploadVideo(v));
      if (isLoadMore) {
        const baseIdx = state.videos.length;
        state.videos = [
          ...state.videos,
          ...slimmedItems.map((v, idx) => ({ ...v, _origIdx: baseIdx + idx })),
        ];
      } else {
        state.videos = slimmedItems.map((v, idx) => ({ ...v, _origIdx: idx }));
      }

      state.nextPageToken = nextToken;
      state.totalResults = total;
      // During "Load all", re-serializing the whole (growing) library into localStorage on every
      // 50-item page is quadratic and blocks the main thread; save every few seconds and on the last page.
      const now = Date.now();
      if (!state.isFetchAll || !nextToken || now - lastCacheSaveTs > 3000) {
        lastCacheSaveTs = now;
        saveToCache(fetchMode, state.videos, nextToken, total);
      }
      filterVideos();

      // The zero-yield fix for infinite scroll
      if (!state.isFetchAll && state.nextPageToken && !state.debouncedSearchTerm.trim()) {
        requestAnimationFrame(() => {
          const rect = dom.scrollSentinel.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            handleLoadMore();
          }
        });
      }
    } catch (err) {
      if (gen !== fetchGeneration || state.mode !== fetchMode) return;
      console.error("Fetch error detail:", err);
      const status = err?.status || err?.result?.error?.code;
      if (status === 401) {
        localStorage.removeItem("yt_dislikes_token");
        state.accessToken = null;
        state.isAuthenticated = false;
        state.dataSource = null;
        state.nextPageToken = null;
        state.isFetchAll = false;
        setError("Session expired. Please sign in again.");
      } else {
        setError(
          err?.result?.error?.message ||
            err?.message ||
            `Failed to fetch ${fetchMode === "dislike" ? "disliked" : "liked"} videos.`,
        );
      }
    } finally {
      if (gen === fetchGeneration && !state.isFetchAll) {
        setLoading(false, isLoadMore);
      }
    }
  })();

  activeFetchPromise = currentPromise;

  try {
    await currentPromise;
  } finally {
    if (activeFetchPromise === currentPromise) {
      activeFetchPromise = null;
    }
  }
}

function handleLoadMore() {
  if (state.nextPageToken) {
    fetchVideos(state.nextPageToken);
  }
}

async function handleLoadAll() {
  if (state.nextPageToken) {
    state.isFetchAll = true;
    render();
    try {
      while (state.isFetchAll && state.nextPageToken) {
        const tokenToFetch = state.nextPageToken;
        await fetchVideos(tokenToFetch);
        if (state.error || state.nextPageToken === tokenToFetch) {
          break;
        }
      }
    } finally {
      state.isFetchAll = false;
      setLoading(false, false);
      if (!state.nextPageToken && !state.error) {
        triggerCelebration();
      }
    }
  }
}

async function handleCopyIds() {
  if (state.filteredVideos.length === 0) return;

  const ids = state.filteredVideos.map((v) => v.video_id).join(",");

  try {
    await navigator.clipboard.writeText(ids);
    showToast(`Copied ${state.filteredVideos.length.toLocaleString()} video IDs`);

    const originalHtml = dom.copyIdsButton.innerHTML;
    dom.copyIdsButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
    `;

    setTimeout(() => {
      dom.copyIdsButton.innerHTML = originalHtml;
    }, 2000);
  } catch (err) {
    console.error("Failed to copy IDs:", err);
    showToast("Failed to copy to clipboard", "error");
  }
}

async function handleExportJson() {
  if (state.filteredVideos.length === 0) return;

  const exportData = state.filteredVideos;
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", objectUrl);
  const fileName = state.mode === "dislike" ? "dislikes.json" : "likes.json";
  downloadAnchorNode.setAttribute("download", fileName);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  showToast(`Exported ${exportData.length.toLocaleString()} videos`);

  const originalHtml = dom.exportJsonButton.innerHTML;
  dom.exportJsonButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
  `;

  setTimeout(() => {
    dom.exportJsonButton.innerHTML = originalHtml;
  }, 2000);
}

async function loadDemoData() {
  const originalText = dom.heroDemoButton ? dom.heroDemoButton.textContent : "View a demo";
  if (dom.heroDemoButton) {
    dom.heroDemoButton.textContent = "Loading...";
    dom.heroDemoButton.disabled = true;
  }

  try {
    const response = await fetch("likes.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (Array.isArray(data)) {
      invalidateActiveFetch();
      const normalized = normalizeImportedDataset(data);
      state.mode = "like";
      state.dataSource = "demo";
      state.videos = normalized;
      state.nextPageToken = null;
      state.totalResults = normalized.length;
      state.error = null;
      state.searchTerm = "";
      state.debouncedSearchTerm = "";
      dom.searchInput.value = "";
      updateSearchClearButton();
      localStorage.removeItem("dislikes-data-like");
      localStorage.removeItem("dislikes-data-like-timestamp");

      filterVideos();
      render();
    } else {
      showToast("Invalid JSON format in demo data", "error");
    }
  } catch (err) {
    showToast("Error loading demo data", "error");
    console.error(err);
  } finally {
    if (dom.heroDemoButton) {
      dom.heroDemoButton.textContent = originalText;
      dom.heroDemoButton.disabled = false;
    }
  }
}

function loadUploadedJsonFile(file) {
  if (!file) return;

  const lowerName = (file.name || "").toLowerCase();
  if (lowerName.includes("dislike")) {
    state.mode = "dislike";
    localStorage.setItem("dislikes-mode", "dislike");
  } else if (lowerName.includes("like")) {
    state.mode = "like";
    localStorage.setItem("dislikes-mode", "like");
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        invalidateActiveFetch();
        const normalized = normalizeImportedDataset(data);
        if (normalized.length === 0) {
          showToast("JSON file contained no valid videos", "error");
          return;
        }
        state.dataSource = "upload";
        state.videos = normalized;
        state.nextPageToken = null;
        state.totalResults = normalized.length;
        state.error = null;
        state.searchTerm = "";
        state.debouncedSearchTerm = "";
        dom.searchInput.value = "";
        updateSearchClearButton();
        localStorage.removeItem(`dislikes-data-${state.mode}`);
        localStorage.removeItem(`dislikes-data-${state.mode}-timestamp`);
        try {
          localStorage.setItem(
            "yt_dislikes_custom_upload",
            JSON.stringify({ mode: state.mode, videos: normalized }),
          );
        } catch {
          /* ignore quota limits on oversized files */
        }

        filterVideos();
        render();
        showToast(`Loaded ${normalized.length.toLocaleString()} videos`);
      } else {
        showToast("Invalid JSON format: expected an array of videos", "error");
      }
    } catch (err) {
      showToast("Error parsing JSON file", "error");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function handleUploadJson(event) {
  const file = event.target.files?.[0];
  if (file) {
    loadUploadedJsonFile(file);
  }
  event.target.value = "";
}

function cleanArtistName(artist) {
  const name = artist || "Unknown";
  return name.endsWith(" - Topic") ? name.slice(0, -8) : name;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getVideoYear(publishedAt) {
  if (!publishedAt) return NaN;
  return new Date(publishedAt).getUTCFullYear();
}

function applySearchQuery(nextQuery) {
  const normalized = String(nextQuery || "");
  state.searchTerm = normalized;
  state.debouncedSearchTerm = normalized;
  if (dom.searchInput) {
    dom.searchInput.value = normalized;
  }
  updateSearchClearButton();
  filterVideos();
  render();
}

function matchesVideoSearch(v, lowerQuery) {
  const title = (v.title || "").toLowerCase();
  if (title.includes(lowerQuery)) return true;

  const isDeleted = checkIfDeleted(v);
  const cleanArtist = (
    isDeleted && !v.artist ? "Unavailable" : cleanArtistName(v.artist)
  ).toLowerCase();
  if (cleanArtist.includes(lowerQuery)) return true;

  if (v.label && v.label.toLowerCase().includes(lowerQuery)) return true;
  if (v.copyright && v.copyright.toLowerCase().includes(lowerQuery)) return true;

  if (v.published_at) {
    const datePart = String(v.published_at).split("T")[0];
    const yearStr = String(getVideoYear(v.published_at));
    if (datePart.includes(lowerQuery) || yearStr === lowerQuery) return true;
    if (`${cleanArtist} ${yearStr}` === lowerQuery || `${cleanArtist} ${datePart}` === lowerQuery) {
      return true;
    }
  }
  return false;
}

// Shared collator: String.prototype.localeCompare with options builds a new collator per call,
// which made A–Z sorts of a few thousand items take 100ms+ on desktop (several times that on phones).
const TEXT_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

// Intl formatters are costly to construct; build them once instead of per card / per render.
const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
});
const COUNT_NUMBER_FORMAT = new Intl.NumberFormat();
const DAY_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const DAY_DATE_FORMAT_UTC = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const MONTH_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short" });
const MONTH_DATE_FORMAT_UTC = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatCompactNumber(n) {
  return COMPACT_NUMBER_FORMAT.format(n || 0);
}

function formatCount(n) {
  return COUNT_NUMBER_FORMAT.format(n);
}

// Midnight-UTC dates are release dates parsed from "Released on:" and must not shift a day in western time zones.
function formatPublishedDate(publishedAt, withDay = true) {
  const isUtcMidnight = String(publishedAt).endsWith("T00:00:00Z");
  const formatter = withDay
    ? isUtcMidnight
      ? DAY_DATE_FORMAT_UTC
      : DAY_DATE_FORMAT
    : isUtcMidnight
      ? MONTH_DATE_FORMAT_UTC
      : MONTH_DATE_FORMAT;
  return formatter.format(new Date(publishedAt));
}

function compareText(a, b) {
  return TEXT_COLLATOR.compare(a || "", b || "");
}

function getPublishedTs(v) {
  if (!v.published_at) return NaN;
  return Date.parse(v.published_at);
}

function getPublishedDayTs(v) {
  if (!v.published_at) return NaN;
  return Date.parse(String(v.published_at).split("T")[0]);
}

// Decorate-sort-undecorate so expensive keys (dates, ISO durations, cleaned artist names)
// are computed once per item instead of once per comparison. Array.prototype.sort is stable,
// so ties keep their original (date-added) order.
function sortVideos(videos, sortBy) {
  if (sortBy === "date-new" || !videos.length) return videos;

  let keyOf;
  let compare;
  switch (sortBy) {
    case "duration-long":
      keyOf = (v) => parseDuration(v.duration || "PT0S");
      compare = (a, b) => b.k - a.k;
      break;
    case "upload-new":
      keyOf = getPublishedTs;
      compare = (a, b) => {
        const aMissing = isNaN(a.k);
        const bMissing = isNaN(b.k);
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        return b.k - a.k;
      };
      break;
    case "comments-most":
      keyOf = (v) => Number(v.comments) || 0;
      compare = (a, b) => b.k - a.k;
      break;
    case "views-high":
      keyOf = (v) => Number(v.views) || 0;
      compare = (a, b) => b.k - a.k;
      break;
    case "channel-az":
      keyOf = (v) => ({ artist: cleanArtistName(v.artist), day: getPublishedDayTs(v) });
      compare = (a, b) => {
        const artistCompare = compareText(a.k.artist, b.k.artist);
        if (artistCompare !== 0) return artistCompare;
        const aMissing = isNaN(a.k.day);
        const bMissing = isNaN(b.k.day);
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (!aMissing && a.k.day !== b.k.day) return a.k.day - b.k.day;
        return compareText(a.v.title, b.v.title);
      };
      break;
    case "title-az":
      keyOf = (v) => v.title || "";
      compare = (a, b) => compareText(a.k, b.k);
      break;
    default:
      return videos;
  }

  return videos
    .map((v) => ({ v, k: keyOf(v) }))
    .sort(compare)
    .map((entry) => entry.v);
}

function filterVideos() {
  let results = state.videos.filter((v) => !isLibraryUploadVideo(v));

  if (state.unavailableOnly) {
    results = results.filter((v) => checkIfDeleted(v));
    if (state.musicOnly) {
      // YouTube strips snippet.categoryId on deleted/private videos, so preserve is_deleted items here
      results = results.filter((v) => v.is_music || v.is_deleted);
    }
  } else if (state.musicOnly) {
    results = results.filter((v) => v.is_music);
  }

  if (state.maxViews !== null && !state.unavailableOnly) {
    results = results.filter((v) => !checkIfDeleted(v) && (Number(v.views) || 0) < state.maxViews);
  }

  // Keep the left nav browsable across the full collection (cowneck/music style)
  state.sidebarBaseVideos = results;

  // Unified search (typed query or left-nav selection)
  const trimmedSearch = state.debouncedSearchTerm.trim();
  if (trimmedSearch) {
    const lower = trimmedSearch.toLowerCase();
    results = results.filter((v) => matchesVideoSearch(v, lower));
  }

  // Sort
  results = sortVideos(results, state.sortBy);

  state.filteredVideos = results;
  virtualGrid.listVersion++;
  scrubberState.checkpoints = buildScrubberCheckpoints(results, state.sortBy);
  scrubberState.renderedSignature = "";
  state.currentVideoIndex = state.currentVideoId
    ? results.findIndex((v) => v.video_id === state.currentVideoId)
    : -1;
  updatePrevNextButtons();
}

function setLoading(isLoading, isLoadMore = false) {
  state.loading = isLoading;
  state.isLoadMore = isLoadMore;
  render();
}

function setError(err) {
  state.error = err;
  render();
}

function showError(msg) {
  setError(msg);
}

function applyTheme(theme) {
  let isDark = false;
  if (theme === "dark") {
    isDark = true;
  } else if (theme === "system") {
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  document.documentElement.classList.toggle("dark", isDark);
  if (dom.themeColorMeta) {
    dom.themeColorMeta.setAttribute("content", isDark ? "#0a0a0a" : "#ffffff");
  }
}

const COMPACT_GRID_CLASSES = [
  "grid-cols-2",
  "sm:grid-cols-3",
  "md:grid-cols-4",
  "xl:grid-cols-5",
  "2xl:grid-cols-6",
  "gap-x-2",
  "gap-y-3",
  "sm:gap-x-3",
  "sm:gap-y-4",
];

const STANDARD_GRID_CLASSES = [
  "grid-cols-1",
  "sm:grid-cols-2",
  "lg:grid-cols-3",
  "2xl:grid-cols-4",
  "gap-x-3",
  "gap-y-4",
  "sm:gap-x-4",
  "sm:gap-y-5",
];

function applyCompactMode(isCompact) {
  if (isCompact) {
    document.body.classList.add("compact-mode");
    dom.videoGrid.classList.remove(...STANDARD_GRID_CLASSES);
    dom.videoGrid.classList.add(...COMPACT_GRID_CLASSES);
  } else {
    document.body.classList.remove("compact-mode");
    dom.videoGrid.classList.remove(...COMPACT_GRID_CLASSES);
    dom.videoGrid.classList.add(...STANDARD_GRID_CLASSES);
  }

  virtualGrid.cols = 0;
  virtualGrid.rowHeight = 0;
  virtualGrid.renderedVersion = -1;
  virtualGrid.listVersion++;

  if (
    state.filteredVideos.length > 0 &&
    !dom.viewContent.classList.contains("hidden")
  ) {
    renderVirtualGrid(true);
    syncScrubberFromScroll();
  }
}

// --- Virtualized Grid & Fast Scrubber ---

const BLANK_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const virtualGrid = {
  startRow: -1,
  endRow: -1,
  cols: 0,
  rowHeight: 0,
  rowGap: 0,
  renderedCards: new Map(),
  cardPool: [],
  listVersion: 0,
  renderedVersion: -1,
  lastScrollY: 0,
  hydrateTimer: null,
};

const scrubberState = {
  checkpoints: [],
  activeCheckpointIdx: -1,
  isDragging: false,
  tooltipHideTimeout: null,
  layoutRaf: null,
  renderedSignature: "",
};

function getOverscanRows() {
  return (window.innerWidth || 1280) < 768 ? 1 : 3;
}

function getGridOriginDocY() {
  const anchor = dom.gridTopSpacer || dom.videoGrid;
  if (!anchor?.getBoundingClientRect) return 0;
  return anchor.getBoundingClientRect().top + (window.scrollY || 0);
}

function getGridColumns() {
  if (dom.videoGrid && window.getComputedStyle && !dom.videoGrid.classList.contains("hidden")) {
    const template = window.getComputedStyle(dom.videoGrid).gridTemplateColumns || "";
    if (/\d+px/.test(template)) {
      const tracks = template.trim().split(/\s+/).filter(Boolean).length;
      if (tracks >= 1) return tracks;
    }
  }
  const w = window.innerWidth || 1280;
  if (state.compactMode) {
    if (w >= 1536) return 6;
    if (w >= 1280) return 5;
    if (w >= 768) return 4;
    if (w >= 640) return 3;
    return 2;
  }
  if (w >= 1536) return 4;
  if (w >= 1024) return 3;
  if (w >= 640) return 2;
  return 1;
}

function getRowStride() {
  if (virtualGrid.rowHeight > 0) {
    return virtualGrid.rowHeight + virtualGrid.rowGap;
  }
  return state.compactMode ? 236 : 300;
}

function teardownCardImage(card) {
  const img = card?._refs?.img;
  if (!img) return;
  img.onerror = null;
  delete img.dataset.pendingSrc;
  img.removeAttribute("src");
}

function releaseVideoCard(card) {
  if (!card) return;
  teardownCardImage(card);
  if (card.remove) card.remove();
  else if (card.parentNode) card.parentNode.removeChild(card);
  if (virtualGrid.cardPool.length < 36) {
    virtualGrid.cardPool.push(card);
  }
}

function resetVirtualGridDOM() {
  if (virtualGrid.hydrateTimer) {
    clearTimeout(virtualGrid.hydrateTimer);
    virtualGrid.hydrateTimer = null;
  }
  for (const card of virtualGrid.renderedCards.values()) {
    releaseVideoCard(card);
  }
  virtualGrid.renderedCards.clear();
  virtualGrid.startRow = -1;
  virtualGrid.endRow = -1;
  virtualGrid.renderedVersion = -1;
  if (dom.gridTopSpacer) dom.gridTopSpacer.style.height = "0px";
  if (dom.gridBottomSpacer) dom.gridBottomSpacer.style.height = "0px";
}

function hydrateCardThumbnail(card, video) {
  const refs = card?._refs;
  if (!refs?.img || !video) return;
  const img = refs.img;
  const overlay = refs.overlay;
  const thumbnail = `https://i.ytimg.com/vi/${video.video_id}/mqdefault.jpg`;
  delete img.dataset.pendingSrc;

  if (checkIfDeleted(video)) {
    img.onerror = null;
    img.src = BLANK_PIXEL;
    return;
  }

  img.onerror = () => {
    video._is404 = true;
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    img.onerror = null;
    img.src = BLANK_PIXEL;
  };
  img.src = thumbnail;
}

function hydrateVisibleThumbnails() {
  if (virtualGrid.hydrateTimer) {
    clearTimeout(virtualGrid.hydrateTimer);
    virtualGrid.hydrateTimer = null;
  }
  if (scrubberState.isDragging) return;
  for (const [idx, card] of virtualGrid.renderedCards.entries()) {
    if (card?._refs?.img?.dataset?.pendingSrc) {
      const video = state.filteredVideos[idx];
      if (video) hydrateCardThumbnail(card, video);
    }
  }
}

function scheduleThumbnailHydration(delayMs = 140) {
  if (scrubberState.isDragging) return;
  if (virtualGrid.hydrateTimer) {
    clearTimeout(virtualGrid.hydrateTimer);
  }
  virtualGrid.hydrateTimer = setTimeout(() => {
    virtualGrid.hydrateTimer = null;
    hydrateVisibleThumbnails();
  }, delayMs);
}

function acquireVideoCard(video, index, deferThumbnail = false) {
  let card = virtualGrid.cardPool.pop();
  if (!card) {
    const clone = dom.videoTemplate.content.cloneNode(true);
    card = clone.firstElementChild || clone;
    card._refs = {
      playBtn: card.querySelector(".video-play-btn"),
      img: card.querySelector(".video-thumbnail"),
      overlay: card.querySelector(".deleted-overlay"),
      links: Array.from(card.querySelectorAll(".video-link")),
      titleEl: card.querySelector(".video-title"),
      channelEl: card.querySelector(".channel-title"),
      metadataEl: card.querySelector(".dynamic-metadata"),
    };
  }

  const { playBtn, img, overlay, links, titleEl, channelEl, metadataEl } = card._refs;
  const title = video.title || "Unavailable";
  const isDeleted = checkIfDeleted(video);
  const thumbnail = `https://i.ytimg.com/vi/${video.video_id}/mqdefault.jpg`;
  const baseUrl = video.is_music ? "https://music.youtube.com" : "https://www.youtube.com";

  card.dataset.videoIndex = String(index);
  img.alt = title;

  overlay.classList.toggle("hidden", !isDeleted);
  overlay.classList.toggle("flex", isDeleted);

  playBtn.disabled = Boolean(isDeleted);
  playBtn.classList.toggle("cursor-not-allowed", Boolean(isDeleted));

  if (deferThumbnail || scrubberState.isDragging) {
    img.onerror = null;
    img.removeAttribute("src");
    img.dataset.pendingSrc = thumbnail;
  } else {
    hydrateCardThumbnail(card, video);
  }

  const watchHref = `${baseUrl}/watch?v=${encodeURIComponent(video.video_id)}`;
  for (let i = 0; i < links.length; i++) {
    links[i].href = watchHref;
  }

  const trimmedTerm = state.debouncedSearchTerm.trim();
  const chName = cleanArtistName(video.artist || "Unknown channel");
  const isExactArtistFilter =
    trimmedTerm !== "" && chName.toLowerCase() === trimmedTerm.toLowerCase();

  titleEl.innerHTML = highlightMatch(title, trimmedTerm);

  const renderedCh = isExactArtistFilter
    ? escapeHtml(chName)
    : highlightMatch(chName, trimmedTerm);
  const chId = video.channel_id;
  if (chId && !isDeleted) {
    channelEl.innerHTML = `<a href="${baseUrl}/channel/${encodeURIComponent(chId)}" target="_blank" rel="noopener noreferrer" class="hover:text-black dark:hover:text-white hover:underline">${renderedCh}</a>`;
  } else {
    channelEl.innerHTML = renderedCh;
  }

  metadataEl.textContent = isDeleted ? "No stats" : getDynamicMetadata(video);

  return card;
}

function renderVirtualGrid(force = false, anchorRow = null, deferThumbnails = false) {
  if (!dom.videoGrid || dom.videoGrid.classList.contains("hidden")) return;

  const totalItems = state.filteredVideos.length;
  if (totalItems === 0) {
    resetVirtualGridDOM();
    dom.videoGrid.innerHTML = "";
    return;
  }

  if (virtualGrid.renderedVersion !== virtualGrid.listVersion) {
    resetVirtualGridDOM();
    dom.videoGrid.innerHTML = "";
    virtualGrid.renderedVersion = virtualGrid.listVersion;
    force = true;
  }

  const cols = virtualGrid.cols || getGridColumns();
  if (cols !== virtualGrid.cols) {
    virtualGrid.cols = cols;
    virtualGrid.rowHeight = 0;
    force = true;
  }

  const totalRows = Math.ceil(totalItems / cols);
  const stride = getRowStride();
  const viewportH = window.innerHeight || 800;
  const overscan = getOverscanRows();

  let visStartRow = 0;
  let visEndRow = Math.min(totalRows, Math.ceil(viewportH / stride) + 1);

  if (typeof anchorRow === "number") {
    visStartRow = Math.min(totalRows - 1, Math.max(0, anchorRow));
    visEndRow = Math.min(totalRows, visStartRow + Math.ceil(viewportH / stride) + 1);
  } else {
    const scrollY = window.scrollY || 0;
    const gridTopDocY = getGridOriginDocY();
    const relTop = Math.max(0, scrollY - gridTopDocY);
    const relBottom = Math.max(0, scrollY + viewportH - gridTopDocY);
    visStartRow = Math.min(totalRows - 1, Math.max(0, Math.floor(relTop / stride)));
    visEndRow = Math.min(totalRows, Math.max(visStartRow + 1, Math.ceil(relBottom / stride)));
  }

  const nextStartRow = Math.max(0, visStartRow - overscan);
  const nextEndRow = Math.min(totalRows, visEndRow + overscan);

  if (!force && virtualGrid.startRow >= 0) {
    const topCovered =
      virtualGrid.startRow === 0 ? nextStartRow === 0 : visStartRow >= virtualGrid.startRow;
    const bottomCovered =
      virtualGrid.endRow === totalRows ? nextEndRow === totalRows : visEndRow <= virtualGrid.endRow;
    if (topCovered && bottomCovered) {
      if (!deferThumbnails && !scrubberState.isDragging) hydrateVisibleThumbnails();
      return;
    }
  }

  const startIndex = nextStartRow * cols;
  const endIndex = Math.min(totalItems, nextEndRow * cols);

  let overlapStart = Infinity;
  let overlapEnd = -1;

  for (const [idx, el] of virtualGrid.renderedCards.entries()) {
    if (idx < startIndex || idx >= endIndex) {
      releaseVideoCard(el);
      virtualGrid.renderedCards.delete(idx);
    } else {
      if (idx < overlapStart) overlapStart = idx;
      if (idx + 1 > overlapEnd) overlapEnd = idx + 1;
    }
  }

  if (virtualGrid.renderedCards.size === 0) {
    dom.videoGrid.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
      const cardEl = acquireVideoCard(state.filteredVideos[i], i, deferThumbnails);
      virtualGrid.renderedCards.set(i, cardEl);
      frag.appendChild(cardEl);
    }
    dom.videoGrid.appendChild(frag);
  } else {
    if (startIndex < overlapStart) {
      const firstExisting = dom.videoGrid.firstElementChild;
      const topFrag = document.createDocumentFragment();
      for (let i = startIndex; i < overlapStart; i++) {
        const cardEl = acquireVideoCard(state.filteredVideos[i], i, deferThumbnails);
        virtualGrid.renderedCards.set(i, cardEl);
        topFrag.appendChild(cardEl);
      }
      if (firstExisting) {
        dom.videoGrid.insertBefore(topFrag, firstExisting);
      } else {
        dom.videoGrid.appendChild(topFrag);
      }
    }
    if (endIndex > overlapEnd) {
      const bottomFrag = document.createDocumentFragment();
      for (let i = overlapEnd; i < endIndex; i++) {
        const cardEl = acquireVideoCard(state.filteredVideos[i], i, deferThumbnails);
        virtualGrid.renderedCards.set(i, cardEl);
        bottomFrag.appendChild(cardEl);
      }
      dom.videoGrid.appendChild(bottomFrag);
    }
  }

  if (virtualGrid.rowHeight === 0) {
    const firstCard = dom.videoGrid.firstElementChild;
    if (firstCard && firstCard.getBoundingClientRect) {
      const measuredH = firstCard.getBoundingClientRect().height;
      if (measuredH > 0) {
        virtualGrid.rowHeight = measuredH;
        const cs = window.getComputedStyle ? window.getComputedStyle(dom.videoGrid) : null;
        virtualGrid.rowGap = (cs && parseFloat(cs.rowGap)) || (state.compactMode ? 16 : 20);
      }
    }
  }

  const finalStride = getRowStride();
  const topH = nextStartRow * finalStride;
  const bottomRows = Math.max(0, totalRows - nextEndRow);
  const bottomH = bottomRows * finalStride;
  if (dom.gridTopSpacer) dom.gridTopSpacer.style.height = `${topH}px`;
  if (dom.gridBottomSpacer) dom.gridBottomSpacer.style.height = `${bottomH}px`;
  virtualGrid.startRow = nextStartRow;
  virtualGrid.endRow = nextEndRow;

  if (deferThumbnails || scrubberState.isDragging) {
    scheduleThumbnailHydration(160);
  } else {
    hydrateVisibleThumbnails();
  }
}

function getAlphaBucket(rawStr, seenLatin) {
  const trimmed = String(rawStr || "").trim();
  if (!trimmed) return "#";
  const base = trimmed[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (/^[A-Z]$/.test(base)) return base;
  return seenLatin ? "*" : "#";
}

function formatMilestoneIndex(idx) {
  if (idx === 0) return "#1";
  if (idx >= 1000) {
    const k = idx / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(idx);
}

function buildScrubberCheckpoints(videos = state.filteredVideos, sortBy = state.sortBy) {
  const total = videos.length;
  if (total <= 12) return [];

  if (sortBy === "date-new") {
    const steps = [10, 20, 50, 100, 200, 300, 500, 1000, 2000, 5000];
    const step = steps.find((s) => Math.ceil(total / s) <= 12) || 5000;
    const checkpoints = [];
    for (let start = 0; start < total; start += step) {
      const end = Math.min(total - 1, start + step - 1);
      const label = formatMilestoneIndex(start);
      checkpoints.push({ key: String(start), label, startIndex: start, endIndex: end });
    }
    return checkpoints;
  }

  const VIEW_TIERS = [
    [1_000_000_000, "1B+"],
    [100_000_000, "100M"],
    [10_000_000, "10M"],
    [1_000_000, "1M"],
    [500_000, "500k"],
    [100_000, "100k"],
    [50_000, "50k"],
    [10_000, "10k"],
    [1_000, "1k"],
    [0, "<1k"],
  ];

  const DURATION_TIERS = [
    [3600, "1h+"],
    [1800, "30m"],
    [900, "15m"],
    [600, "10m"],
    [420, "7m"],
    [300, "5m"],
    [240, "4m"],
    [180, "3m"],
    [120, "2m"],
    [0, "<2m"],
  ];

  const COMMENT_TIERS = [
    [100_000, "100k"],
    [10_000, "10k"],
    [1_000, "1k"],
    [500, "500"],
    [100, "100"],
    [50, "50"],
    [10, "10"],
    [1, "1+"],
    [0, "0"],
  ];

  const pickTier = (val, tiers) => {
    const n = Number(val) || 0;
    for (let i = 0; i < tiers.length; i++) {
      if (n >= tiers[i][0]) return tiers[i][1];
    }
    return tiers[tiers.length - 1][1];
  };

  const checkpoints = [];
  let seenLatin = false;

  for (let i = 0; i < total; i++) {
    const v = videos[i];
    let label = "";

    switch (sortBy) {
      case "title-az": {
        label = getAlphaBucket(v.title || "", seenLatin);
        if (/^[A-Z]$/.test(label)) seenLatin = true;
        break;
      }
      case "channel-az": {
        label = getAlphaBucket(cleanArtistName(v.artist), seenLatin);
        if (/^[A-Z]$/.test(label)) seenLatin = true;
        break;
      }
      case "upload-new": {
        const yr = v.published_at ? getVideoYear(v.published_at) : NaN;
        label = !isNaN(yr) ? String(yr) : "—";
        break;
      }
      case "views-high": {
        label = pickTier(v.views, VIEW_TIERS);
        break;
      }
      case "duration-long": {
        label = pickTier(parseDuration(v.duration), DURATION_TIERS);
        break;
      }
      case "comments-most": {
        label = pickTier(v.comments, COMMENT_TIERS);
        break;
      }
      default: {
        label = "#";
      }
    }

    const prev = checkpoints[checkpoints.length - 1];
    if (prev && prev.label === label) {
      prev.endIndex = i;
    } else {
      checkpoints.push({
        key: `${label}-${checkpoints.length}`,
        label,
        startIndex: i,
        endIndex: i,
      });
    }
  }

  return checkpoints;
}

function formatScrubberTooltip(checkpoint, video, index, total) {
  if (!video || !checkpoint) {
    return { primary: "", sub: "" };
  }
  const compact = formatCompactNumber;

  switch (state.sortBy) {
    case "title-az":
      return {
        primary: checkpoint.label,
        sub: video.title || "Unavailable",
      };
    case "channel-az":
      return {
        primary: checkpoint.label,
        sub: cleanArtistName(video.artist || "Unknown"),
      };
    case "upload-new": {
      if (!video.published_at) {
        return { primary: "No date", sub: video.title || "" };
      }
      const yr = getVideoYear(video.published_at);
      const sub = formatPublishedDate(video.published_at, false);
      return { primary: String(yr), sub };
    }
    case "views-high":
      return {
        primary: `${compact(video.views)} views`,
        sub: video.title || "",
      };
    case "duration-long":
      return {
        primary: formatDuration(video.duration).trim(),
        sub: video.title || "",
      };
    case "comments-most":
      return {
        primary: `${compact(video.comments)} comments`,
        sub: video.title || "",
      };
    case "date-new":
    default:
      return {
        primary: `#${(index + 1).toLocaleString()}`,
        sub: `of ${total.toLocaleString()} · ${video.title || ""}`,
      };
  }
}

function renderScrubberCheckpoints() {
  if (!dom.scrubberCheckpoints || !dom.scrubberTrack) return;
  const checkpoints = scrubberState.checkpoints;
  if (!checkpoints.length) {
    dom.scrubberCheckpoints.innerHTML = "";
    scrubberState.renderedSignature = "";
    scrubberState.activeCheckpointIdx = -1;
    return;
  }

  const trackHeight =
    dom.scrubberTrack.clientHeight || Math.max(180, (window.innerHeight || 700) - 220);
  const hasMultiChar = checkpoints.some((c) => c.label.length > 2);
  const minPxPerLabel = hasMultiChar ? 20 : 13;
  const maxLabels = Math.max(4, Math.floor(trackHeight / minPxPerLabel));
  const K = checkpoints.length;
  const stride = K <= maxLabels ? 1 : Math.ceil((K - 1) / (maxLabels - 1));

  const sig = `${state.sortBy}:${K}:${stride}:${checkpoints[0].label}:${checkpoints[K - 1].label}`;
  if (scrubberState.renderedSignature === sig) return;
  scrubberState.renderedSignature = sig;
  scrubberState.activeCheckpointIdx = -1;

  const html = checkpoints
    .map((cp, k) => {
      const isFirst = k === 0;
      const isLast = k === K - 1;
      const tooCloseToLast = !isLast && stride > 1 && K - 1 - k < Math.ceil(stride * 0.65);
      const showText = isFirst || isLast || (!tooCloseToLast && k % stride === 0);
      const safeLabel = escapeHtml(cp.label);

      return `<div data-checkpoint-idx="${k}" class="scrubber-cp flex-1 w-full flex items-center justify-center px-1 text-[9px] sm:text-[10px] leading-none font-medium text-gray-500 dark:text-gray-400 transition-colors">${
        showText
          ? `<span class="scrubber-cp-text pointer-events-none">${safeLabel}</span>`
          : `<span class="scrubber-cp-dot w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 pointer-events-none"></span>`
      }</div>`;
    })
    .join("");

  dom.scrubberCheckpoints.innerHTML = html;
}

function highlightActiveCheckpoint(cpIdx) {
  if (!dom.scrubberCheckpoints || cpIdx === scrubberState.activeCheckpointIdx) return;
  const nodes = dom.scrubberCheckpoints.children;
  if (scrubberState.activeCheckpointIdx >= 0 && nodes[scrubberState.activeCheckpointIdx]) {
    const prevEl = nodes[scrubberState.activeCheckpointIdx];
    prevEl.classList.remove("text-black", "dark:text-white", "font-bold");
    prevEl.classList.add("text-gray-500", "dark:text-gray-400", "font-medium");
    const dot = prevEl.querySelector(".scrubber-cp-dot");
    if (dot) {
      dot.classList.remove("bg-black", "dark:bg-white", "scale-125");
      dot.classList.add("bg-gray-300", "dark:bg-gray-600");
    }
  }
  if (cpIdx >= 0 && nodes[cpIdx]) {
    const nextEl = nodes[cpIdx];
    nextEl.classList.remove("text-gray-500", "dark:text-gray-400", "font-medium");
    nextEl.classList.add("text-black", "dark:text-white", "font-bold");
    const dot = nextEl.querySelector(".scrubber-cp-dot");
    if (dot) {
      dot.classList.remove("bg-gray-300", "dark:bg-gray-600");
      dot.classList.add("bg-black", "dark:bg-white", "scale-125");
    }
  }
  scrubberState.activeCheckpointIdx = cpIdx;
}

function showScrubberTooltip() {
  if (!dom.scrubberTooltip) return;
  if (scrubberState.tooltipHideTimeout) {
    clearTimeout(scrubberState.tooltipHideTimeout);
    scrubberState.tooltipHideTimeout = null;
  }
  dom.scrubberTooltip.classList.remove("opacity-0", "scale-95");
  dom.scrubberTooltip.classList.add("opacity-100", "scale-100");
}

function scheduleHideScrubberTooltip(delayMs = 500) {
  if (!dom.scrubberTooltip) return;
  if (scrubberState.tooltipHideTimeout) {
    clearTimeout(scrubberState.tooltipHideTimeout);
  }
  scrubberState.tooltipHideTimeout = setTimeout(() => {
    scrubberState.tooltipHideTimeout = null;
    if (!scrubberState.isDragging && dom.scrubberTooltip) {
      dom.scrubberTooltip.classList.remove("opacity-100", "scale-100");
      dom.scrubberTooltip.classList.add("opacity-0", "scale-95");
    }
  }, delayMs);
}

function updateScrubberPositionUI(fraction, cpIdx, itemIndex, withTooltip = false) {
  if (!dom.scrubberThumb || !dom.scrubberTrack) return;
  const clamped = Math.max(0, Math.min(1, fraction));
  const trackH = dom.scrubberTrack.clientHeight || 300;
  const padPx = 7;
  const thumbY = padPx + clamped * Math.max(0, trackH - padPx * 2);
  dom.scrubberThumb.style.top = `${thumbY}px`;

  highlightActiveCheckpoint(cpIdx);

  const total = state.filteredVideos.length;
  const cp = scrubberState.checkpoints[cpIdx];
  const video = state.filteredVideos[itemIndex];
  const info = formatScrubberTooltip(cp, video, itemIndex, total);

  dom.scrubberTrack.setAttribute("aria-valuemax", String(Math.max(1, total)));
  dom.scrubberTrack.setAttribute("aria-valuenow", String(Math.min(total, Math.max(1, itemIndex + 1))));
  if (info.primary) {
    dom.scrubberTrack.setAttribute(
      "aria-valuetext",
      info.sub ? `${info.primary} — ${info.sub}` : info.primary,
    );
  }

  if (withTooltip && dom.scrubberTooltip) {
    dom.scrubberTooltipPrimary.textContent = info.primary;
    dom.scrubberTooltipSub.textContent = info.sub;
    const topBtnOffset = dom.scrubberTopBtn?.offsetHeight || 20;
    const containerH = dom.fastScrubber?.clientHeight || trackH + 48;
    const tooltipY = Math.max(24, Math.min(containerH - 24, topBtnOffset + thumbY + 4));
    dom.scrubberTooltip.style.top = `${tooltipY}px`;
    showScrubberTooltip();
  }
}

function fractionToScrubberTarget(fraction) {
  const checkpoints = scrubberState.checkpoints;
  const total = state.filteredVideos.length;
  if (!checkpoints.length || total === 0) {
    return { cpIdx: 0, itemIndex: 0, edge: "top" };
  }
  const K = checkpoints.length;
  if (fraction <= 0.003) {
    return { cpIdx: 0, itemIndex: 0, edge: "top" };
  }
  if (fraction >= 0.997) {
    return { cpIdx: K - 1, itemIndex: total - 1, edge: "bottom" };
  }
  const scaled = fraction * K;
  const cpIdx = Math.min(K - 1, Math.floor(scaled));
  const localT = scaled - cpIdx;
  const cp = checkpoints[cpIdx];
  const count = cp.endIndex - cp.startIndex + 1;
  const itemIndex = Math.min(cp.endIndex, cp.startIndex + Math.floor(localT * count));
  return { cpIdx, itemIndex, edge: null };
}

function findCheckpointIndexForVideo(itemIndex) {
  const checkpoints = scrubberState.checkpoints;
  let lo = 0;
  let hi = checkpoints.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cp = checkpoints[mid];
    if (itemIndex < cp.startIndex) hi = mid - 1;
    else if (itemIndex > cp.endIndex) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(checkpoints.length - 1, lo));
}

function syncScrubberFromScroll() {
  if (
    !dom.fastScrubber ||
    dom.fastScrubber.classList.contains("hidden") ||
    scrubberState.isDragging ||
    scrubberState.checkpoints.length === 0 ||
    state.filteredVideos.length === 0
  ) {
    return;
  }

  const scrollY = window.scrollY || 0;
  const viewportH = window.innerHeight || 800;
  const docH = document.documentElement?.scrollHeight || 0;
  const checkpoints = scrubberState.checkpoints;
  const K = checkpoints.length;
  const total = state.filteredVideos.length;

  if (scrollY <= 8) {
    updateScrubberPositionUI(0, 0, 0, false);
    return;
  }
  if (docH > 0 && scrollY + viewportH >= docH - 12) {
    updateScrubberPositionUI(1, K - 1, total - 1, false);
    return;
  }

  const cols = virtualGrid.cols || getGridColumns();
  const stride = getRowStride();
  const gridTopDocY = getGridOriginDocY();
  const probeY = Math.max(0, scrollY + viewportH * 0.25 - gridTopDocY);
  const currentRow = Math.max(0, Math.floor(probeY / stride));
  const itemIndex = Math.min(total - 1, currentRow * cols);
  const cpIdx = findCheckpointIndexForVideo(itemIndex);
  const cp = checkpoints[cpIdx];
  const count = Math.max(1, cp.endIndex - cp.startIndex + 1);
  const localT = Math.min(1, Math.max(0, (itemIndex - cp.startIndex + 0.5) / count));
  const fraction = (cpIdx + localT) / K;

  updateScrubberPositionUI(fraction, cpIdx, itemIndex, false);
}

function scrollToVideoIndex(targetIndex, edge = null, deferThumbnails = false) {
  const total = state.filteredVideos.length;
  if (total === 0 || !dom.videoGrid) return;

  const clampedIndex = Math.max(0, Math.min(total - 1, targetIndex));
  const cols = virtualGrid.cols || getGridColumns();
  const targetRow = Math.floor(clampedIndex / cols);

  if (edge === "top") {
    renderVirtualGrid(false, 0, deferThumbnails);
    window.scrollTo({ top: 0, behavior: "auto" });
    virtualGrid.lastScrollY = 0;
    return;
  }

  renderVirtualGrid(false, targetRow, deferThumbnails);
  const stride = getRowStride();
  const gridTopDocY = getGridOriginDocY();

  if (edge === "bottom") {
    const totalRows = Math.ceil(total / cols);
    const gridBottomDocY = gridTopDocY + totalRows * stride;
    const targetY = Math.max(0, gridBottomDocY - (window.innerHeight || 800) + 96);
    window.scrollTo({ top: targetY, behavior: "auto" });
    virtualGrid.lastScrollY = targetY;
    return;
  }

  const headerH = dom.appHeader?.offsetHeight || 64;
  const rowTopDocY = Math.max(0, gridTopDocY + targetRow * stride - headerH - 12);
  window.scrollTo({ top: rowTopDocY, behavior: "auto" });
  virtualGrid.lastScrollY = rowTopDocY;
}

function syncScrubberTopOffset() {
  if (!dom.fastScrubber || !dom.appHeader) return;
  const headerH = Math.ceil(dom.appHeader.getBoundingClientRect().height || 65);
  dom.fastScrubber.style.top = `${Math.max(74, headerH + 10)}px`;
}

function updateScrubberVisibility(hasAppData) {
  if (!dom.fastScrubber || !dom.videoGrid) return;
  const shouldShow = Boolean(
    hasAppData &&
      !(state.loading && !state.isLoadMore) &&
      state.filteredVideos.length > 12 &&
      scrubberState.checkpoints.length > 0,
  );
  dom.fastScrubber.classList.toggle("hidden", !shouldShow);
  dom.fastScrubber.classList.toggle("flex", shouldShow);
  dom.videoGrid.classList.toggle("pr-6", shouldShow);
  dom.videoGrid.classList.toggle("sm:pr-7", shouldShow);
  if (shouldShow) {
    syncScrubberTopOffset();
  }
}

function scheduleScrubberLayoutRefresh() {
  if (scrubberState.layoutRaf) return;
  scrubberState.layoutRaf = requestAnimationFrame(() => {
    scrubberState.layoutRaf = null;
    scrubberState.renderedSignature = "";
    syncScrubberTopOffset();
    renderScrubberCheckpoints();
    syncScrubberFromScroll();
  });
}

// --- Rendering ---

function render() {
  const isReady = state.gisInited;
  const isLoadMore = state.isLoadMore;
  const hasAppData =
    state.isAuthenticated ||
    state.dataSource === "demo" ||
    state.dataSource === "upload";
  const trimmedSearch = state.debouncedSearchTerm.trim();

  // Auth Buttons
  if (isReady) {
    dom.authButton.disabled = false;
    dom.authButton.classList.remove("opacity-50", "cursor-not-allowed");

    dom.heroAuthButton.disabled = false;
    dom.heroAuthButton.textContent = "Connect YouTube account";
    dom.heroAuthButton.classList.remove("opacity-50");

    dom.authText.textContent = "Sign in";
  } else {
    dom.authButton.disabled = true;
    dom.heroAuthButton.disabled = true;
    dom.heroAuthButton.textContent = "Initializing...";
    dom.authText.textContent = "Loading...";
  }

  // Dynamic Text based on mode
  const isDislike = state.mode === "dislike";
  updateModeToggleUI(state.mode);
  dom.welcomeTitle.textContent = `Your YouTube ${isDislike ? "disliked" : "liked"} videos.`;
  dom.welcomeDesc.innerHTML = `View, filter, and sort your ${isDislike ? "dislikes" : "likes"}.<br>Simple, private, and minimal.`;

  document.title = isDislike ? "Dislikes" : "Likes";
  updateFavicon(state.mode);
  updateFiltersUI();

  if (dom.topbarAppControls) {
    dom.topbarAppControls.classList.toggle("hidden", !hasAppData);
    dom.topbarAppControls.classList.toggle("flex", hasAppData);
  }

  // Auth & Session Views
  if (hasAppData) {
    dom.viewWelcome.classList.add("hidden");
    dom.viewContent.classList.remove("hidden");

    dom.authIndicator.classList.remove("hidden");
    dom.authIndicator.classList.add("flex");

    const canRefreshYoutube = Boolean(state.isAuthenticated && state.dataSource === "youtube");
    dom.clearCacheButton.classList.toggle("hidden", !canRefreshYoutube);
    dom.clearCacheButton.classList.toggle("inline-flex", canRefreshYoutube);

    if (canRefreshYoutube) {
      dom.signoutButton.textContent = "Sign out";
      dom.authButton.classList.add("hidden");
      dom.authButton.classList.remove("sm:inline-flex");
    } else if (state.dataSource === "demo") {
      dom.signoutButton.textContent = "Exit demo";
      dom.authButton.classList.add("hidden");
      dom.authButton.classList.toggle("sm:inline-flex", !state.isAuthenticated);
      dom.authButton.classList.toggle("items-center", !state.isAuthenticated);
    } else {
      dom.signoutButton.textContent = state.isAuthenticated ? "Sign out" : "Close file";
      dom.authButton.classList.add("hidden");
      dom.authButton.classList.toggle("sm:inline-flex", !state.isAuthenticated);
      dom.authButton.classList.toggle("items-center", !state.isAuthenticated);
    }
  } else {
    dom.viewWelcome.classList.remove("hidden");
    dom.viewContent.classList.add("hidden");
    dom.authIndicator.classList.add("hidden");
    dom.authIndicator.classList.remove("flex");
    dom.authButton.classList.remove("hidden", "sm:inline-flex", "items-center");
  }

  // Error
  if (state.error) {
    dom.errorContainer.classList.remove("hidden");
    dom.errorContainer.classList.add("flex");
    dom.errorMessage.textContent = state.error;
  } else {
    dom.errorContainer.classList.add("hidden");
    dom.errorContainer.classList.remove("flex");
  }

  // Library Stats Hero Count & Subtitle
  const currentCount = state.filteredVideos.length;
  const totalCount = state.totalResults;
  const fmt = formatCount;
  const hasViewCap = state.maxViews !== null && !state.unavailableOnly;

  let countText = "";
  const noun = state.musicOnly
    ? currentCount === 1
      ? "music track"
      : "music tracks"
    : currentCount === 1
      ? "video"
      : "videos";

  if (state.loading && !isLoadMore) {
    updateHeroCountDisplay("—");
    countText = "Loading library...";
  } else {
    const animSig =
      !trimmedSearch && !hasViewCap && !state.unavailableOnly && !state.nextPageToken
        ? `${state.dataSource}:${state.mode}:${state.videos.length}`
        : null;
    updateHeroCountDisplay(currentCount, animSig);

    if (state.nextPageToken && !trimmedSearch && !hasViewCap && !state.unavailableOnly) {
      if (totalCount && totalCount > state.videos.length) {
        countText = `of ~${fmt(totalCount)} loaded`;
      } else {
        countText = "Loaded so far";
      }
    } else if (trimmedSearch || hasViewCap || state.unavailableOnly) {
      if (state.unavailableOnly && !trimmedSearch) {
        countText = `Unavailable ${noun}`;
      } else if (hasViewCap && !trimmedSearch) {
        const stepObj = MAX_VIEWS_STEPS[getMaxViewsStepIndex()];
        countText = `${stepObj.fullLabel} views`;
      } else {
        countText = `Matching ${noun}`;
      }
    } else if (state.musicOnly) {
      countText = isDislike ? "Disliked music" : "Liked music";
    } else {
      countText = isDislike ? "Disliked videos" : "Liked videos";
    }
  }

  dom.resultsCount.textContent = countText;

  const hasPlayable =
    !(state.loading && !isLoadMore) && state.filteredVideos.some((v) => isVideoPlayable(v));
  if (dom.playAllButton) dom.playAllButton.disabled = !hasPlayable;
  if (dom.shufflePlayButton) dom.shufflePlayButton.disabled = !hasPlayable;

  // Load All Button State
  const showLoadAll = Boolean(state.nextPageToken && !trimmedSearch);
  if (dom.libraryChipsRow) {
    dom.libraryChipsRow.classList.toggle("hidden", !showLoadAll);
    dom.libraryChipsRow.classList.toggle("flex", showLoadAll);
  }
  if (showLoadAll) {
    dom.loadAllButton.classList.remove("hidden");
    dom.loadAllButton.classList.add("inline-flex");
    if (state.isFetchAll) {
      dom.loadAllButton.textContent = "Loading all...";
      dom.loadAllButton.disabled = true;
      dom.loadAllButton.classList.add("opacity-50");
    } else {
      dom.loadAllButton.textContent = "Load all";
      dom.loadAllButton.disabled = false;
      dom.loadAllButton.classList.remove("opacity-50");
    }
  } else {
    dom.loadAllButton.classList.add("hidden");
    dom.loadAllButton.classList.remove("inline-flex");
  }

  renderSidebar();
  updateScrubberVisibility(hasAppData);

  // Gallery View
  if (hasAppData) {
    if (state.loading && !isLoadMore) {
      dom.emptyState.classList.add("hidden");
      dom.videoGrid.classList.remove("hidden");
      renderSkeletons();
    } else if (state.filteredVideos.length === 0) {
      dom.emptyState.classList.remove("hidden");
      dom.videoGrid.classList.add("hidden");
      dom.videoGrid.innerHTML = "";
      resetVirtualGridDOM();
    } else {
      dom.emptyState.classList.add("hidden");
      dom.videoGrid.classList.remove("hidden");

      renderVirtualGrid();
      renderScrubberCheckpoints();
      syncScrubberFromScroll();
    }

    updateSentinel();
  }
}

function updateSentinel() {
  const trimmedSearch = state.debouncedSearchTerm.trim();
  if (state.isFetchAll) {
    dom.scrollSentinel.classList.remove("hidden");
    dom.scrollSentinel.innerHTML = `
        <div class="loading-spinner inline-block w-4 h-4 border-2 border-gray-200 dark:border-white/15 border-t-gray-600 dark:border-t-white rounded-full mr-2 align-middle"></div>
        <span>Loading all videos...</span>
    `;
    return;
  }

  if (state.nextPageToken && !trimmedSearch) {
    dom.scrollSentinel.classList.remove("hidden");
    if (state.loading && state.isLoadMore) {
      dom.scrollSentinel.innerHTML = `
          <div class="loading-spinner inline-block w-4 h-4 border-2 border-gray-200 dark:border-white/15 border-t-gray-600 dark:border-t-white rounded-full mr-2 align-middle"></div>
          <span>Loading more...</span>
      `;
    } else {
      dom.scrollSentinel.textContent = "Scroll for more";
    }
  } else {
    dom.scrollSentinel.classList.add("hidden");
  }
}

function triggerCelebration() {
  if (window.confetti) {
    const duration = 1.5 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#000000", "#666666"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#000000", "#666666"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }
}

function renderSkeletons() {
  resetVirtualGridDOM();
  dom.videoGrid.innerHTML = "";
  for (let i = 0; i < 12; i++) {
    const clone = dom.skeletonTemplate.content.cloneNode(true);
    dom.videoGrid.appendChild(clone);
  }
}

function renderSidebar() {
  if (state.videos.length === 0) {
    dom.sidebarListContainer.innerHTML = "";
    return;
  }

  const data = calculateAnalytics();
  const activeQueryLower = state.debouncedSearchTerm.trim().toLowerCase();
  let html = "";

  const renderNameCountRow = (name, count) => {
    const safeName = escapeHtml(name);
    const isActive = activeQueryLower !== "" && activeQueryLower === name.trim().toLowerCase();
    const rowClass = isActive
      ? "bg-gray-950 text-white dark:bg-white dark:text-black"
      : "text-gray-800 dark:text-[#e8e8e8] hover:bg-gray-100 dark:hover:bg-[#1e1e1e]";
    const badgeClass = isActive
      ? "bg-white/20 text-white dark:bg-black/15 dark:text-black"
      : "bg-gray-100 text-gray-500 dark:bg-[#212121] dark:text-[#aaaaaa] group-hover:bg-gray-200/80 dark:group-hover:bg-[#2d2d2d]";

    return `
      <button type="button" class="sidebar-filter-item group w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors ${rowClass}" data-query="${safeName}" title="${safeName}">
        <span class="text-[13.5px] font-medium truncate">${safeName}</span>
        <span class="text-[11.5px] font-medium tabular-nums px-2 py-0.5 rounded-full shrink-0 transition-colors ${badgeClass}">${count}</span>
      </button>
    `;
  };

  if (state.sidebarCategory === "channels") {
    html = data.topChannels.map((ch) => renderNameCountRow(ch.name, ch.count)).join("");
  } else if (state.sidebarCategory === "albums") {
    html = data.topAlbums
      .map((album) => {
        const query = album.sameYearCollision
          ? `${album.artist} ${album.date}`
          : `${album.artist} ${album.year}`;
        const isActive =
          activeQueryLower !== "" && activeQueryLower === query.trim().toLowerCase();
        const safeQuery = escapeHtml(query);
        const safeArtist = escapeHtml(album.artist);
        const safeThumb = escapeHtml(album.thumbnail);
        const rowClass = isActive
          ? "bg-gray-950 text-white dark:bg-white dark:text-black"
          : "text-gray-900 dark:text-[#f1f1f1] hover:bg-gray-100 dark:hover:bg-[#1e1e1e]";
        const subClass = isActive
          ? "text-white/75 dark:text-black/70"
          : "text-gray-500 dark:text-[#999999]";
        const badgeClass = isActive
          ? "bg-white/20 text-white dark:bg-black/15 dark:text-black"
          : "bg-gray-100 text-gray-500 dark:bg-[#212121] dark:text-[#aaaaaa] group-hover:bg-gray-200/80 dark:group-hover:bg-[#2d2d2d]";

        return `
          <button type="button" class="sidebar-filter-item group w-full flex items-center justify-between gap-2.5 p-2 rounded-lg text-left cursor-pointer transition-colors ${rowClass}" data-query="${safeQuery}" title="${safeArtist} (${album.year})">
            <div class="flex items-center gap-2.5 min-w-0">
              <img src="${safeThumb}" alt="${safeArtist}" loading="lazy" decoding="async" class="w-10 h-10 object-cover rounded-md bg-gray-100 dark:bg-[#242424] shrink-0">
              <div class="flex flex-col min-w-0">
                <span class="text-[13.5px] font-medium truncate leading-snug">${safeArtist}</span>
                <span class="text-[11.5px] ${subClass} tabular-nums leading-snug">${album.year}</span>
              </div>
            </div>
            <span class="text-[11.5px] font-medium tabular-nums px-2 py-0.5 rounded-full shrink-0 transition-colors ${badgeClass}">${album.count}</span>
          </button>
        `;
      })
      .join("");
  } else if (state.sidebarCategory === "years") {
    html = data.releaseYears
      .map((ry) => {
        const yearStr = String(ry.year);
        const safeYear = escapeHtml(yearStr);
        const isActive = activeQueryLower !== "" && activeQueryLower === yearStr.toLowerCase();
        const rowClass = isActive
          ? "bg-gray-950 text-white dark:bg-white dark:text-black"
          : "text-gray-800 dark:text-[#e8e8e8] hover:bg-gray-100 dark:hover:bg-[#1e1e1e]";
        const trackClass = isActive
          ? "bg-white/20 dark:bg-black/15"
          : "bg-gray-100 dark:bg-[#212121]";
        const barClass = isActive
          ? "bg-white dark:bg-black"
          : "bg-gray-400 dark:bg-[#666666]";
        const countClass = isActive
          ? "text-white/90 dark:text-black/80"
          : "text-gray-500 dark:text-[#aaaaaa]";

        return `
          <button type="button" class="sidebar-filter-item group w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors ${rowClass}" data-query="${safeYear}">
            <span class="w-10 text-[13px] font-medium tabular-nums shrink-0">${safeYear}</span>
            <div class="flex-1 ${trackClass} rounded-full h-1.5 overflow-hidden">
              <div class="${barClass} h-full rounded-full transition-all" style="width: ${ry.percent}%"></div>
            </div>
            <span class="text-[11.5px] font-medium tabular-nums whitespace-nowrap text-right shrink-0 min-w-[28px] ${countClass}">${ry.count}</span>
          </button>
        `;
      })
      .join("");
  } else if (state.sidebarCategory === "labels") {
    html = data.topLabels.map((lbl) => renderNameCountRow(lbl.name, lbl.count)).join("");
  } else if (state.sidebarCategory === "copyrights") {
    html = data.topCopyrights.map((cpy) => renderNameCountRow(cpy.name, cpy.count)).join("");
  }

  dom.sidebarListContainer.innerHTML =
    html || '<div class="text-gray-500 dark:text-[#888888] text-xs px-2.5 py-3">No data available</div>';
}

function calculateAnalytics() {
  const channels = {};
  const years = {};
  const albums = {};
  const labels = {};
  const copyrights = {};

  (state.sidebarBaseVideos || state.filteredVideos).forEach((v) => {
    const isDeleted = checkIfDeleted(v);

    // Channels
    const chName =
      isDeleted && !v.artist
        ? "Unavailable"
        : cleanArtistName(v.artist);
    const chId = v.channel_id;

    if (!channels[chName]) {
      channels[chName] = { count: 0, id: isDeleted ? null : chId };
    }
    channels[chName].count++;

    // Release Years (UTC so YYYY-01-01T00:00:00Z doesn't shift into YYYY-1)
    if (!isDeleted && v.published_at) {
      const year = getVideoYear(v.published_at);
      if (!isNaN(year)) {
        years[year] = (years[year] || 0) + 1;
      }
    }

    // Top Albums (cluster by channel + exact day)
    if (!isDeleted && v.published_at && v.artist && chName !== "Music Library Uploads") {
      const date = v.published_at.split("T")[0];
      const albumKey = `${chName}|${date}`;
      if (!albums[albumKey]) {
        albums[albumKey] = {
          artist: chName,
          date: date,
          year: getVideoYear(v.published_at),
          thumbnail: `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`,
          video_id: v.video_id,
          count: 0,
        };
      }
      albums[albumKey].count++;
    }

    // Labels
    if (!isDeleted && v.label) {
      if (!labels[v.label]) labels[v.label] = 0;
      labels[v.label]++;
    }

    // Copyrights
    if (!isDeleted && v.copyright) {
      if (!copyrights[v.copyright]) copyrights[v.copyright] = 0;
      copyrights[v.copyright]++;
    }
  });

  const topChannels = Object.entries(channels)
    .map(([name, info]) => ({ name, count: info.count, id: info.id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  const maxYearCount = Math.max(1, ...Object.values(years));
  const releaseYears = Object.entries(years)
    .map(([year, count]) => ({
      year,
      count,
      percent: (count / maxYearCount) * 100,
    }))
    .sort((a, b) => b.year - a.year);

  const qualifyingAlbums = Object.values(albums)
    .filter((a) => a.count >= 3)
    .sort((a, b) => b.count - a.count);
  const artistYearCounts = {};
  qualifyingAlbums.forEach((a) => {
    const k = `${a.artist}|${a.year}`;
    artistYearCounts[k] = (artistYearCounts[k] || 0) + 1;
  });
  const topAlbums = qualifyingAlbums.slice(0, 100).map((a) => ({
    ...a,
    sameYearCollision: artistYearCounts[`${a.artist}|${a.year}`] > 1,
  }));

  const topLabels = Object.entries(labels)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  const topCopyrights = Object.entries(copyrights)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  return { topChannels, releaseYears, topAlbums, topLabels, topCopyrights };
}

function getDynamicMetadata(video) {
  const compact = formatCompactNumber;

  switch (state.sortBy) {
    case "views-high":
      return `${compact(video.views)} views`;
    case "duration-long":
      return formatDuration(video.duration);
    case "upload-new": {
      if (!video.published_at) return "Unknown date";
      return formatPublishedDate(video.published_at, true);
    }
    case "comments-most":
      return `${compact(video.comments)} comments`;
    default:
      return `${compact(video.views)} views`;
  }
}

function formatDuration(duration) {
  if (!duration) return "0:00";
  const totalSeconds = parseDuration(duration);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")} `;
  }
  return `${m}:${s.toString().padStart(2, "0")} `;
}

function highlightMatch(text, term) {
  const raw = String(text ?? "");
  const trimmed = (term || "").trim();
  if (!trimmed) return escapeHtml(raw);

  const regex = new RegExp(escapeRegExp(trimmed), "gi");
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    result += escapeHtml(raw.slice(lastIndex, match.index));
    result += `<mark>${escapeHtml(match[0])}</mark>`;
    lastIndex = regex.lastIndex;
    if (match[0].length === 0) break;
  }
  result += escapeHtml(raw.slice(lastIndex));
  return result;
}

function parseDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function updateFavicon(mode) {
  if (state.iconCache[mode]) {
    dom.favicon.href = state.iconCache[mode];
    dom.appleIcon.href = state.iconCache[mode];
    return;
  }

  const img = new Image();
  img.src = "icon.png";
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");

    if (mode === "like") {
      // Vertical flip
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
    }

    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    state.iconCache[mode] = dataUrl;
    dom.favicon.href = dataUrl;
    dom.appleIcon.href = dataUrl;
  };
}

// --- YouTube Player & Media Session Logic ---
function setupMediaSessionHandlers() {
  if (!("mediaSession" in navigator)) return;

  const actions = [
    ["play", () => state.isPlayerReady && state.ytPlayer?.playVideo?.()],
    ["pause", () => state.isPlayerReady && state.ytPlayer?.pauseVideo?.()],
    ["previoustrack", () => playPrevTrack()],
    ["nexttrack", () => playNextTrack()],
    [
      "seekto",
      (details) => {
        if (
          details &&
          typeof details.seekTime === "number" &&
          state.isPlayerReady &&
          state.ytPlayer?.seekTo
        ) {
          state.ytPlayer.seekTo(details.seekTime, true);
        }
      },
    ],
  ];

  actions.forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* unsupported media session action */
    }
  });
}

function updateMediaSessionMetadata(videoId, title, cleanArtist) {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") {
    return;
  }
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: cleanArtist,
      artwork: [
        {
          src: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          sizes: "320x180",
          type: "image/jpeg",
        },
        {
          src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          sizes: "480x360",
          type: "image/jpeg",
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

function clearAutoplayFallback() {
  if (state.autoplayFallbackTimeout) {
    clearTimeout(state.autoplayFallbackTimeout);
    state.autoplayFallbackTimeout = null;
  }
}

function showPlayIconsReady() {
  dom.playerIconLoading.classList.add("hidden");
  dom.playerIconPlay.classList.remove("hidden");
  dom.playerIconPause.classList.add("hidden");

  dom.fsPlayerIconLoading.classList.add("hidden");
  dom.fsPlayerIconPlay.classList.remove("hidden");
  dom.fsPlayerIconPause.classList.add("hidden");

  dom.playerPlayPause.disabled = false;
  dom.fsPlayerPlayPause.disabled = false;
}

function scheduleAutoplayFallbackCheck(delayMs = 1200) {
  clearAutoplayFallback();
  state.autoplayFallbackTimeout = setTimeout(() => {
    state.autoplayFallbackTimeout = null;
    if (!state.isPlayerReady || !state.ytPlayer?.getPlayerState) return;
    const st = state.ytPlayer.getPlayerState();
    // 1 = PLAYING, 3 = BUFFERING; if stuck in 5 (CUED), -1 (UNSTARTED), or 2 (PAUSED), reveal Play button
    if (st !== 1 && st !== 3) {
      state.autoplayRequested = false;
      showPlayIconsReady();
    }
  }, delayMs);
}

function configureYTPlayerIframe(player) {
  try {
    const iframe = player?.getIframe?.();
    if (iframe) {
      iframe.setAttribute("allow", "autoplay; encrypted-media");
      iframe.setAttribute("tabindex", "-1");
      iframe.setAttribute("title", "YouTube audio player");
    }
  } catch {
    /* ignore */
  }
}

function initYTPlayer() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  window.onYouTubeIframeAPIReady = function() {
    const playerVars = {
      playsinline: 1,
      autoplay: 1,
      controls: 0,
    };
    if (window.location?.origin && window.location.origin.startsWith("http")) {
      playerVars.origin = window.location.origin;
    }

    state.ytPlayer = new YT.Player("ytplayer", {
      height: "200",
      width: "200",
      videoId: "",
      playerVars,
      events: {
        onReady: (event) => {
          configureYTPlayerIframe(event?.target || state.ytPlayer);
          state.isPlayerReady = true;
          dom.playerPlayPause.disabled = false;
          dom.fsPlayerPlayPause.disabled = false;
          if (state.pendingVideoId) {
            const vid = state.pendingVideoId;
            state.pendingVideoId = null;
            state.autoplayRequested = true;
            state.ytPlayer.loadVideoById(vid);
            state.ytPlayer.playVideo?.();
            scheduleAutoplayFallbackCheck(1500);
          }
        },
        onStateChange: onPlayerStateChange,
        onError: (event) => {
          console.warn("YouTube player error:", event.data);
          state.autoplayRequested = false;
          clearAutoplayFallback();
          clearAutoSkipTimeout();
          stopProgressInterval();
          showPlayIconsReady();

          const isEmbedRestricted = event.data === 101 || event.data === 150;
          if (isEmbedRestricted && state.currentVideoId) {
            state.restrictedVideoIds.add(state.currentVideoId);
            updatePrevNextButtons();
            const hasPlayableNow = state.filteredVideos.some((v) => isVideoPlayable(v));
            if (dom.playAllButton) dom.playAllButton.disabled = !hasPlayableNow;
            if (dom.shufflePlayButton) dom.shufflePlayButton.disabled = !hasPlayableNow;

            let canAdvance = false;
            if (state.shuffleMode) {
              canAdvance = getPlayableIndices().length > 0;
            } else if (state.lastNavDirection === -1) {
              canAdvance = findAdjacentPlayableIndex(state.currentVideoIndex, -1) !== -1;
            } else {
              canAdvance = findAdjacentPlayableIndex(state.currentVideoIndex, 1) !== -1;
            }

            if (canAdvance && state.consecutiveAutoSkips < 15) {
              state.consecutiveAutoSkips++;
              dom.playerArtist.innerHTML = `<span class="text-red-600 dark:text-red-400">Restricted on external sites — skipping...</span>`;
              dom.fsPlayerArtist.innerHTML = `<span class="text-red-600 dark:text-red-400">Restricted on external sites — skipping...</span>`;
              showToast("Playback restricted on external sites — skipping track");
              state.autoSkipTimeout = setTimeout(() => {
                state.autoSkipTimeout = null;
                if (state.lastNavDirection === -1 && !state.shuffleMode) {
                  playPrevTrack(true);
                } else {
                  playNextTrack(true);
                }
              }, 350);
              return;
            }
          }

          if (isEmbedRestricted) {
            dom.playerArtist.innerHTML = `<span class="text-red-600 dark:text-red-400">Playback restricted on external sites</span>`;
            dom.fsPlayerArtist.innerHTML = `<span class="text-red-600 dark:text-red-400">Playback restricted on external sites</span>`;
          } else {
            dom.playerArtist.innerHTML = `<span class="text-red-600 dark:text-red-400">Video unavailable</span>`;
            dom.fsPlayerArtist.innerHTML = `<span class="text-red-600 dark:text-red-400">Video unavailable</span>`;
          }
        },
      },
    });

    configureYTPlayerIframe(state.ytPlayer);
  };
}

function onPlayerStateChange(event) {
  if (event.data === 1) { // Playing
    state.autoplayRequested = false;
    state.consecutiveAutoSkips = 0;
    clearAutoplayFallback();
    clearAutoSkipTimeout();
    dom.playerIconLoading.classList.add("hidden");
    dom.playerIconPlay.classList.add("hidden");
    dom.playerIconPause.classList.remove("hidden");
    
    dom.fsPlayerIconLoading.classList.add("hidden");
    dom.fsPlayerIconPlay.classList.add("hidden");
    dom.fsPlayerIconPause.classList.remove("hidden");
    
    dom.playerPlayPause.disabled = false;
    dom.fsPlayerPlayPause.disabled = false;
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "playing";
      } catch {
        /* ignore */
      }
    }
    startProgressInterval();
  } else if (event.data === 2 || event.data === 0) { // Paused or Ended
    state.autoplayRequested = false;
    clearAutoplayFallback();
    showPlayIconsReady();
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "paused";
      } catch {
        /* ignore */
      }
    }
    stopProgressInterval();

    if (event.data === 0 && (state.currentVideoIndex >= 0 || state.shuffleMode)) {
      playNextTrack();
    }
  } else if (event.data === 3) { // Buffering
    dom.playerIconLoading.classList.remove("hidden");
    dom.playerIconPlay.classList.add("hidden");
    dom.playerIconPause.classList.add("hidden");
    
    dom.fsPlayerIconLoading.classList.remove("hidden");
    dom.fsPlayerIconPlay.classList.add("hidden");
    dom.fsPlayerIconPause.classList.add("hidden");
  } else if (event.data === 5) { // Video cued (mobile browsers often cue on loadVideoById)
    dom.playerPlayPause.disabled = false;
    dom.fsPlayerPlayPause.disabled = false;
    if (state.autoplayRequested) {
      state.autoplayRequested = false;
      event.target?.playVideo?.();
      scheduleAutoplayFallbackCheck(900);
    } else {
      showPlayIconsReady();
    }
  } else if (event.data === -1) { // Unstarted
    dom.playerPlayPause.disabled = false;
    dom.fsPlayerPlayPause.disabled = false;
    if (state.autoplayRequested) {
      scheduleAutoplayFallbackCheck(1200);
    }
  }
}

function playVideo(
  videoId,
  title,
  artist,
  thumbUrl,
  channelUrl,
  index = -1,
  fromShuffleNav = false,
) {
  stopProgressInterval();
  clearAutoplayFallback();
  clearAutoSkipTimeout();
  if (state.shuffleMode && !fromShuffleNav) {
    if (state.shuffleHistory[state.shuffleHistoryPos] !== videoId) {
      state.shuffleHistory = state.shuffleHistory.slice(0, state.shuffleHistoryPos + 1);
      state.shuffleHistory.push(videoId);
      state.shuffleHistoryPos = state.shuffleHistory.length - 1;
    }
  }
  state.currentVideoId = videoId;
  state.currentVideoIndex = index;
  updatePrevNextButtons();

  dom.bottomPlayer.classList.remove("translate-y-full", "invisible");
  document.body.style.paddingBottom = "72px"; // Height of bottom player
  
  if (dom.fastScrubber) {
    dom.fastScrubber.classList.remove("bottom-6");
    dom.fastScrubber.classList.add("bottom-24");
    scheduleScrubberLayoutRefresh();
  }

  // Reset progress UI for the new track
  dom.fsPlayerProgress.value = 0;
  dom.bottomPlayerProgressBar.style.width = "0%";
  dom.fsPlayerTimeCurrent.innerText = "0:00";
  dom.fsPlayerTimeTotal.innerText = "-:--";
  dom.playerTimeCurrent.innerText = "0:00";
  dom.playerTimeTotal.innerText = "-:--";
  
  dom.playerThumbnail.src = thumbUrl;
  dom.playerTitle.innerText = title;
  
  const cleanArtist = cleanArtistName(artist || "Unknown channel");
  updateMediaSessionMetadata(videoId, title, cleanArtist);
  
  if (channelUrl) {
    const safeUrl = escapeHtml(channelUrl);
    const safeArtist = escapeHtml(cleanArtist);
    dom.playerArtist.innerHTML = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="hover:underline">${safeArtist}</a>`;
    dom.fsPlayerArtist.innerHTML = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="hover:underline">${safeArtist}</a>`;
  } else {
    dom.playerArtist.innerText = cleanArtist;
    dom.fsPlayerArtist.innerText = cleanArtist;
  }
  
  // Use guaranteed borderless mqdefault.jpg for mini-player ambient tinting so YouTube's
  // 120x90 gray maxresdefault placeholder never washes out the collapsed mini-player.
  dom.bottomPlayerBg.style.backgroundImage = `url(${thumbUrl})`;

  // Full-screen player updates (prefer maxresdefault, falling back when missing or 120x90 placeholder)
  const maxResUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const hqResUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const stepDownFsArt = () => {
    if (dom.fsPlayerThumbnail.src === maxResUrl) {
      dom.fsPlayerThumbnail.src = hqResUrl;
      dom.fsPlayerBg.style.backgroundImage = `url(${hqResUrl})`;
    } else if (dom.fsPlayerThumbnail.src === hqResUrl) {
      dom.fsPlayerThumbnail.src = thumbUrl;
      dom.fsPlayerBg.style.backgroundImage = `url(${thumbUrl})`;
    }
  };

  dom.fsPlayerThumbnail.onload = () => {
    if (dom.fsPlayerThumbnail.naturalWidth > 0 && dom.fsPlayerThumbnail.naturalWidth <= 120) {
      stepDownFsArt();
    }
  };
  dom.fsPlayerThumbnail.onerror = stepDownFsArt;

  dom.fsPlayerThumbnail.src = maxResUrl;
  dom.fsPlayerBg.style.backgroundImage = `url(${maxResUrl})`;
  dom.fsPlayerTitle.innerText = title;
  
  dom.playerIconLoading.classList.remove("hidden");
  dom.playerIconPlay.classList.add("hidden");
  dom.playerIconPause.classList.add("hidden");

  dom.fsPlayerIconLoading.classList.remove("hidden");
  dom.fsPlayerIconPlay.classList.add("hidden");
  dom.fsPlayerIconPause.classList.add("hidden");

  state.autoplayRequested = true;

  if (state.isPlayerReady && state.ytPlayer) {
    state.pendingVideoId = null;
    dom.playerPlayPause.disabled = false;
    dom.fsPlayerPlayPause.disabled = false;
    state.ytPlayer.loadVideoById(videoId);
    state.ytPlayer.playVideo?.();
    scheduleAutoplayFallbackCheck(1400);
  } else {
    state.pendingVideoId = videoId;
  }
}

function updatePrevNextButtons() {
  if (state.currentVideoIndex === -1 && !state.currentVideoId) {
    dom.fsPlayerPrev.disabled = true;
    dom.fsPlayerNext.disabled = true;
    dom.playerPrev.disabled = true;
    dom.playerNext.disabled = true;
  } else {
    let hasNext = false;
    if (state.shuffleMode) {
      const playable = getPlayableIndices();
      hasNext =
        playable.length > 1 ||
        (playable.length === 1 &&
          state.filteredVideos[playable[0]].video_id !== state.currentVideoId);
    } else {
      hasNext =
        state.currentVideoIndex >= 0 &&
        findAdjacentPlayableIndex(state.currentVideoIndex, 1) !== -1;
    }
    dom.fsPlayerPrev.disabled = false; // Always allow seeking to start
    dom.fsPlayerNext.disabled = !hasNext;
    dom.playerPrev.disabled = false;
    dom.playerNext.disabled = !hasNext;
  }
}

function playTrackByIndex(index, fromShuffleNav = false) {
  if (index >= 0 && index < state.filteredVideos.length) {
    const video = state.filteredVideos[index];
    const baseUrl = video.is_music ? "https://music.youtube.com" : "https://www.youtube.com";
    const channelUrl = video.channel_id ? `${baseUrl}/channel/${encodeURIComponent(video.channel_id)}` : null;
    let title = video.title || "Unavailable";
    if (state.mode === "dislike") {
      title = title.replace(/^\[.*?\]\s*/, "");
    }
    const thumbnail = `https://i.ytimg.com/vi/${video.video_id}/mqdefault.jpg`;
    playVideo(
      video.video_id,
      title,
      video.artist || "Unknown channel",
      thumbnail,
      channelUrl,
      index,
      fromShuffleNav,
    );
  }
}

function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function startProgressInterval() {
  stopProgressInterval();
  state.progressInterval = setInterval(() => {
    if (state.ytPlayer && state.ytPlayer.getCurrentTime) {
      const current = state.ytPlayer.getCurrentTime();
      const duration = state.ytPlayer.getDuration();
      if (duration > 0) {
        const percent = (current / duration) * 100;
        dom.fsPlayerProgress.value = percent;
        dom.bottomPlayerProgressBar.style.width = `${percent}%`;
        
        const currentFormatted = formatTime(current);
        const totalFormatted = formatTime(duration);
        dom.fsPlayerTimeCurrent.innerText = currentFormatted;
        dom.fsPlayerTimeTotal.innerText = totalFormatted;
        dom.playerTimeCurrent.innerText = currentFormatted;
        dom.playerTimeTotal.innerText = totalFormatted;

        if ("mediaSession" in navigator && navigator.mediaSession.setPositionState) {
          try {
            navigator.mediaSession.setPositionState({
              duration,
              playbackRate: 1,
              position: Math.min(Math.max(0, current), duration),
            });
          } catch {
            /* ignore */
          }
        }
      }
    }
  }, 500);
}

function stopProgressInterval() {
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
    state.progressInterval = null;
  }
}

// Start
init();

// --- Configuration ---
const CLIENT_ID =
  "932685095666-31l2s1psd94msj2a59d2ok7m4dfj3922.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/youtube.readonly";
const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest";
// VERSION is now defined in version.js

// --- State ---
const state = {
  gapiInited: false,
  gisInited: false,
  tokenClient: null,
  isAuthenticated: false,
  theme: localStorage.getItem("dislikes-theme") || "system",
  compactMode: localStorage.getItem("dislikes-compact") !== null ? localStorage.getItem("dislikes-compact") === "true" : true,
  musicOnly: localStorage.getItem("dislikes-music-only") !== null ? localStorage.getItem("dislikes-music-only") === "true" : true,
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
  showInsights: false,
  isFetchAll: false,
  mode: localStorage.getItem("dislikes-mode") || "like", // 'dislike' or 'like'
  iconCache: {},
  sidebarCategory: "channels",
  activeFilter: null,
  renderLimit: 50,
  forceRefetch: false,
  sidebarBaseVideos: [],
  ytPlayer: null,
  isPlayerReady: false,
  currentVideoIndex: -1,
  progressInterval: null,
};

// --- DOM Elements ---
const dom = {
  authIndicator: document.getElementById("auth-indicator"),
  authButton: document.getElementById("auth-button"),
  authText: document.getElementById("auth-text"),
  heroAuthButton: document.getElementById("hero-auth-button"),
  heroDemoButton: document.getElementById("hero-demo-button"),
  signoutButton: document.getElementById("signout-button"),

  viewWelcome: document.getElementById("view-welcome"),
  viewContent: document.getElementById("view-content"),

  errorContainer: document.getElementById("error-container"),
  errorMessage: document.getElementById("error-message"),

  resultsCount: document.getElementById("results-count"),
  searchInput: document.getElementById("search-input"),
  sortSelect: document.getElementById("sort-select"),

  contentLoader: document.getElementById("content-loader"),
  emptyState: document.getElementById("empty-state"),
  videoGrid: document.getElementById("video-grid"),
  copyIdsButton: document.getElementById("copy-ids-button"),
  exportJsonButton: document.getElementById("export-json-button"),
  uploadJsonButton: document.getElementById("upload-json-button"),
  uploadJsonInput: document.getElementById("upload-json-input"),
  clearCacheButton: document.getElementById("clear-cache-button"),
  loadAllButton: document.getElementById("load-all-button"),
  sidebarFilterSelect: document.getElementById("sidebar-filter-select"),
  sidebarListContainer: document.getElementById("sidebar-list-container"),

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

  quickScrollContainer: document.getElementById("quick-scroll-container"),
  backToTop: document.getElementById("back-to-top"),
  scrollToBottom: document.getElementById("scroll-to-bottom"),

  videoTemplate: document.getElementById("video-card-template"),
  skeletonTemplate: document.getElementById("skeleton-template"),
  modeToggle: document.getElementById("mode-toggle"),
  modeText: document.getElementById("mode-text"),
  welcomeTitle: document.getElementById("welcome-title"),
  welcomeDesc: document.getElementById("welcome-desc"),

  settingsButton: document.getElementById("settings-button"),
  settingsMenu: document.getElementById("settings-menu"),
  themeSelect: document.getElementById("theme-select"),
  compactToggle: document.getElementById("compact-toggle"),
  musicToggle: document.getElementById("music-toggle"),
  unavailableToggle: document.getElementById("unavailable-toggle"),

  favicon: document.getElementById("favicon"),
  appleIcon: document.getElementById("apple-icon"),
  siteLogo: document.getElementById("site-logo"),
  footerResetButton: document.getElementById("footer-reset-button"),
  resetAppLink: document.getElementById("reset-app-link"),
  initializationTrouble: document.getElementById("initialization-trouble"),
};

// --- Initialization ---

function init() {
  console.log(`Dislikes v${APP_VERSION} initializing...`);
  document.getElementById("app-version").textContent = `v${APP_VERSION}`;

  initGapi();
  initGis();
  initYTPlayer();
  
  applyTheme(state.theme);
  dom.themeSelect.value = state.theme;
  
  dom.compactToggle.checked = state.compactMode;
  applyCompactMode(state.compactMode);

  setupEventListeners();
  render();

  // If it's taking too long (e.g. 8 seconds), show the troubleshooting link
  setTimeout(() => {
    if (!state.gapiInited || !state.gisInited) {
      dom.initializationTrouble.classList.remove("hidden");
    }
  }, 8000);
}

function initGapi() {
  let attempts = 0;
  const maxAttempts = 100; // 10 seconds
  const checkGapi = setInterval(() => {
    attempts++;
    if (window.gapi) {
      clearInterval(checkGapi);
      window.gapi.load("client", async () => {
        try {
          await window.gapi.client.load("youtube", "v3");
          state.gapiInited = true;
          checkReady();
        } catch (err) {
          console.error(err);
          showError("Failed to initialize Google API client.");
        }
      });
    } else if (attempts > maxAttempts) {
      clearInterval(checkGapi);
      console.error("GAPI load timeout");
      // We don't show error yet, checkReady will handle the visual feedback
      checkReady();
    }
  }, 100);
}

function initGis() {
  let attempts = 0;
  const maxAttempts = 100; // 10 seconds
  const checkGis = setInterval(() => {
    attempts++;
    if (window.google) {
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

          // Explicitly set the token for gapi client
          if (window.gapi && window.gapi.client) {
            window.gapi.client.setToken({
              access_token: resp.access_token,
              expires_in: resp.expires_in,
              scope: resp.scope,
              token_type: resp.token_type,
            });
          }

          state.isAuthenticated = true;
          render();
          fetchVideos();
        },
      });
      state.tokenClient = client;
      state.gisInited = true;
      checkReady();
    } else if (attempts > maxAttempts) {
      clearInterval(checkGis);
      console.error("GIS load timeout");
      checkReady();
    }
  }, 100);
}

function saveToken(resp) {
  const expiresIn = parseInt(resp.expires_in) || 3600;
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
    const expiresAt = parseInt(tokenData.expires_at);

    if (isNaN(expiresAt) || now > expiresAt - 300000) {
      console.log("Token expired or invalid expiration date");
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
  if (state.gapiInited && state.gisInited) {
    dom.initializationTrouble.classList.add("hidden");
    const token = loadToken();
    if (token && !state.isAuthenticated) {
      console.log("Restoring session from token");
      // Only pass the necessary token properties to gapi
      window.gapi.client.setToken({
        access_token: token.access_token,
        expires_in: token.expires_in,
        scope: token.scope,
        token_type: token.token_type,
      });
      state.isAuthenticated = true;
      // Initialize with loading state to avoid "All 0 loaded" flash
      state.loading = true;
      render();
      fetchVideos();
    } else {
      console.log("No token found or already authenticated");
      render(); // Update UI to enable buttons
    }
  }
}

function setupEventListeners() {
  dom.authButton.addEventListener("click", handleAuthClick);
  dom.heroAuthButton.addEventListener("click", handleAuthClick);
  if (dom.heroDemoButton) {
    dom.heroDemoButton.addEventListener("click", loadDemoData);
  }
  dom.signoutButton.addEventListener("click", handleSignout);

  dom.playerPlayPause.addEventListener("click", () => {
    if (!state.isPlayerReady || !state.ytPlayer) return;
    const playerState = state.ytPlayer.getPlayerState();
    if (playerState === 1) { // Playing
      state.ytPlayer.pauseVideo();
    } else {
      state.ytPlayer.playVideo();
    }
  });

  dom.fsPlayerPlayPause.addEventListener("click", () => {
    if (!state.isPlayerReady || !state.ytPlayer) return;
    const playerState = state.ytPlayer.getPlayerState();
    if (playerState === 1) { // Playing
      state.ytPlayer.pauseVideo();
    } else {
      state.ytPlayer.playVideo();
    }
  });

  dom.fsPlayerThumbnail.addEventListener("click", () => {
    if (!state.isPlayerReady || !state.ytPlayer) return;
    const playerState = state.ytPlayer.getPlayerState();
    if (playerState === 1) { // Playing
      state.ytPlayer.pauseVideo();
    } else {
      state.ytPlayer.playVideo();
    }
  });

  dom.bottomPlayer.addEventListener("click", (e) => {
    // Don't trigger if they clicked a button, the progress bar, or a link
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("a") || e.target.closest("#bottom-player-progress-container")) {
      return;
    }
    dom.fsPlayer.classList.remove("translate-y-full");
    // Make sure we stop body scrolling while full screen is open
    document.body.style.overflow = "hidden";
  });

  dom.fsPlayerClose.addEventListener("click", () => {
    dom.fsPlayer.classList.add("translate-y-full");
    document.body.style.overflow = "";
  });

  document.addEventListener("keydown", (e) => {
    // Ignore key presses when typing in inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (e.key === "Escape" && !dom.fsPlayer.classList.contains("translate-y-full")) {
      dom.fsPlayer.classList.add("translate-y-full");
      document.body.style.overflow = "";
    } else if (e.code === "Space" || e.key === " ") {
      e.preventDefault(); // Prevent page scrolling
      if (!state.isPlayerReady || !state.ytPlayer) return;
      const playerState = state.ytPlayer.getPlayerState();
      if (playerState === 1) { // Playing
        state.ytPlayer.pauseVideo();
      } else {
        state.ytPlayer.playVideo();
      }
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

  const handlePrevClick = () => {
    if (state.ytPlayer && state.ytPlayer.getCurrentTime) {
      if (state.ytPlayer.getCurrentTime() > 3) {
        state.ytPlayer.seekTo(0, true);
        return;
      }
    }
    if (state.currentVideoIndex > 0) {
      playTrackByIndex(state.currentVideoIndex - 1);
    } else {
      if (state.ytPlayer) state.ytPlayer.seekTo(0, true);
    }
  };

  dom.fsPlayerPrev.addEventListener("click", handlePrevClick);
  dom.playerPrev.addEventListener("click", handlePrevClick);

  const handleNextClick = () => {
    playTrackByIndex(state.currentVideoIndex + 1);
  };

  dom.fsPlayerNext.addEventListener("click", handleNextClick);
  dom.playerNext.addEventListener("click", handleNextClick);

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

  dom.playerClose.addEventListener("click", () => {
    if (state.ytPlayer) {
      state.ytPlayer.stopVideo();
    }
    dom.bottomPlayer.classList.add("translate-y-full");
    document.body.style.paddingBottom = "0px";
    
    if (dom.quickScrollContainer) {
      dom.quickScrollContainer.classList.remove("-translate-y-[80px]");
    }
  });

  const debouncedSearch = debounce((value) => {
    state.debouncedSearchTerm = value;
    filterVideos();
    render();
  }, 300);

  dom.sidebarFilterSelect.addEventListener("change", (e) => {
    state.sidebarCategory = e.target.value;
    renderSidebar();
  });

  dom.sidebarListContainer.addEventListener("click", (e) => {
    // Check if clicked on a filter item
    const filterItem = e.target.closest(".sidebar-filter-item");
    if (filterItem) {
      const type = filterItem.dataset.type;
      const value = filterItem.dataset.value;
      
      // Toggle off if already active
      if (state.activeFilter && state.activeFilter.type === type && state.activeFilter.value === value) {
        state.activeFilter = null;
      } else {
        state.activeFilter = { type, value };
      }
      
      filterVideos();
      render();
    }
  });

  dom.searchInput.addEventListener("input", (e) => {
    state.searchTerm = e.target.value;
    debouncedSearch(e.target.value);
  });

  dom.sortSelect.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    filterVideos();
    render();
  });

  dom.copyIdsButton.addEventListener("click", handleCopyIds);
  dom.exportJsonButton.addEventListener("click", handleExportJson);
  dom.uploadJsonButton.addEventListener("click", () => dom.uploadJsonInput.click());
  dom.uploadJsonInput.addEventListener("change", handleUploadJson);
  dom.clearCacheButton.addEventListener("click", handleClearCache);
  dom.loadAllButton.addEventListener("click", handleLoadAll);


  // Infinite Scroll Observer
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        if (state.renderLimit < state.filteredVideos.length) {
          // Render more from local memory
          state.renderLimit += 50;
          renderVideoList(true);
          updateSentinel();
        } else if (
          state.nextPageToken &&
          !state.loading &&
          !state.debouncedSearchTerm
        ) {
          handleLoadMore();
        }
      }
    },
    { threshold: 0.1 },
  );

  observer.observe(dom.scrollSentinel);

  // Quick Scroll Logic
  dom.backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  dom.scrollToBottom.addEventListener("click", async () => {
    // Instantly expand the render limit to show everything we have
    state.renderLimit = state.filteredVideos.length;
    renderVideoList();
    updateSentinel();

    if (state.nextPageToken && !state.isFetchAll) {
      // handleLoadAll will fetch all remaining pages and update renderLimit when done
      await handleLoadAll();
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
  });

  window.addEventListener("scroll", () => {
    if (window.scrollY > 500) {
      dom.quickScrollContainer.classList.remove("opacity-0", "pointer-events-none");
      dom.quickScrollContainer.classList.add("opacity-100");
    } else {
      dom.quickScrollContainer.classList.add("opacity-0", "pointer-events-none");
      dom.quickScrollContainer.classList.remove("opacity-100");
    }
  });

  dom.modeToggle.addEventListener("click", () => {
    state.mode = state.mode === "dislike" ? "like" : "dislike";
    localStorage.setItem("dislikes-mode", state.mode);

    // Clear state for new mode
    state.videos = [];
    state.filteredVideos = [];
    state.nextPageToken = null;
    state.totalResults = null;
    state.isFetchAll = false;
    state.searchTerm = "";
    state.debouncedSearchTerm = "";
    dom.searchInput.value = "";
    state.activeFilter = null;

    if (state.isAuthenticated) {
      fetchVideos();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  });

  // Settings Menu Logic
  dom.settingsButton.addEventListener("click", (e) => {
    e.stopPropagation();
    dom.settingsMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!dom.settingsMenu.contains(e.target) && !dom.settingsButton.contains(e.target)) {
      dom.settingsMenu.classList.add("hidden");
    }
  });

  // Theme Logic
  dom.themeSelect.addEventListener("change", (e) => {
    const newTheme = e.target.value;
    state.theme = newTheme;
    localStorage.setItem("dislikes-theme", newTheme);
    applyTheme(newTheme);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
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
    filterVideos();
    render();
  });

  // Unavailable Only Logic
  dom.unavailableToggle.checked = state.unavailableOnly;
  dom.unavailableToggle.addEventListener("change", (e) => {
    const isUnavailableOnly = e.target.checked;
    state.unavailableOnly = isUnavailableOnly;
    localStorage.setItem("dislikes-unavailable-only", isUnavailableOnly);
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
  // Clear Google API token
  const token = window.gapi.client.getToken();
  if (token !== null) {
    window.google.accounts.oauth2.revoke(token.access_token, () => {
      console.log("Token revoked");
    });
    window.gapi.client.setToken(null);
  }

  // Clear local storage
  localStorage.removeItem("yt_dislikes_token");

  // Reset state
  state.isAuthenticated = false;
  state.videos = [];
  state.filteredVideos = [];
  state.nextPageToken = null;
  state.searchTerm = "";
  state.debouncedSearchTerm = "";

  // Clear UI
  dom.searchInput.value = "";

  render();
}

function handleClearCache() {
  localStorage.removeItem(`yt_dislikes_cache_${state.mode}`);
  state.videos = [];
  state.filteredVideos = [];
  state.nextPageToken = null;
  state.totalResults = null;
  state.isFetchAll = false;
  state.forceRefetch = true;
  fetchVideos();
}

function loadFromCache() {
  try {
    const data = localStorage.getItem(`yt_dislikes_cache_${state.mode}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load cache:", e);
  }
  return null;
}

function saveToCache() {
  try {
    const data = {
      videos: state.videos,
      nextPageToken: state.nextPageToken,
      totalResults: state.totalResults,
      timestamp: Date.now()
    };
    localStorage.setItem(`yt_dislikes_cache_${state.mode}`, JSON.stringify(data));
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
  }

  return {
    title: v.snippet?.title || "Unavailable",
    artist: v.snippet?.channelTitle || "Unknown",
    video_id: v.id,
    channel_id: v.snippet?.channelId || null,
    views: v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : 0,
    comments: v.statistics?.commentCount ? parseInt(v.statistics.commentCount, 10) : 0,
    duration: v.contentDetails?.duration || null,
    published_at: inferredDate || v.snippet?.publishedAt || null,
    label: inferredLabel,
    copyright: inferredCopyright,
    is_deleted: isDeleted,
    is_music: v.snippet?.categoryId === "10"
  };
}

let activeFetchPromise = null;

async function fetchVideos(pageToken = null) {
  if (activeFetchPromise) {
    return activeFetchPromise;
  }

  activeFetchPromise = (async () => {
    const isLoadMore = !!pageToken;
    setLoading(true, isLoadMore);
    setError(null);

  if (!isLoadMore && !state.forceRefetch) {
    const cached = loadFromCache();
    if (cached) {
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
    if (!window.gapi?.client?.youtube) {
      throw new Error("YouTube API client not loaded.");
    }

    let items = [];
    let nextToken = null;
    let total = 0;

    if (state.mode === "like") {
      // Use playlistItems for Likes to bypass the 1000-item limit of videos.list(myRating='like')
      // 'LL' is the magic ID for the Liked Videos playlist
      const plResponse = await window.gapi.client.youtube.playlistItems.list({
        playlistId: "LL",
        part: "contentDetails",
        maxResults: 50,
        pageToken: pageToken || "",
      });

      console.log("PlaylistItems API Response:", plResponse);

      const videoIds = (plResponse.result.items || []).map(
        (item) => item.contentDetails.videoId,
      );
      nextToken = plResponse.result.nextPageToken || null;
      total = plResponse.result.pageInfo?.totalResults || 0;

      if (videoIds.length > 0) {
        const vResponse = await window.gapi.client.youtube.videos.list({
          id: videoIds.join(","),
          part: "snippet,contentDetails,statistics,status",
        });

        const fetchedItems = vResponse.result.items || [];
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
            snippet: null
          };
        });
      }
    } else {
      // Use videos.list for Dislikes
      // NOTE: This filter is known to be capped at 1000 items by the YouTube API.
      // Since there is no "Disliked Videos" playlist, this is the only way to fetch them.
      // Timeout wrapper for GAPI calls
      const apiCall = window.gapi.client.youtube.videos.list({
        myRating: state.mode,
        part: "snippet,contentDetails,statistics,status",
        maxResults: 50,
        pageToken: pageToken || "",
      });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out")), 30000),
        );

        const response = await Promise.race([apiCall, timeoutPromise]);

        items = response.result.items || [];
        nextToken = response.result.nextPageToken || null;
        total = response.result.pageInfo?.totalResults || 0;
      }

      if (isLoadMore) {
        state.videos = [...state.videos, ...items.map(slimVideo)];
      } else {
        state.videos = items.map(slimVideo);
      }

      state.nextPageToken = nextToken;
      state.totalResults = total;
      saveToCache();
      filterVideos();

      // The zero-yield fix for infinite scroll
      if (!state.isFetchAll && state.nextPageToken && !state.debouncedSearchTerm) {
        requestAnimationFrame(() => {
          const rect = dom.scrollSentinel.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            handleLoadMore();
          }
        });
      }
    } catch (err) {
      console.error("Fetch error detail:", err);
      const status = err?.status || err?.result?.error?.code;
      if (status === 401) {
        localStorage.removeItem("yt_dislikes_token");
        state.isAuthenticated = false;
        setError("Session expired. Please sign in again.");
      } else {
        setError(
          err?.result?.error?.message ||
            err?.message ||
            `Failed to fetch ${state.mode === "dislike" ? "disliked" : "liked"} videos.`,
        );
      }
    } finally {
      if (!state.isFetchAll) {
        setLoading(false, isLoadMore);
      }
    }
  })();

  try {
    await activeFetchPromise;
  } finally {
    activeFetchPromise = null;
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
    updateSentinel(); // Force "Loading all videos..." UI immediately
    try {
      while (state.isFetchAll && state.nextPageToken) {
        await fetchVideos(state.nextPageToken);
      }
    } finally {
      state.isFetchAll = false;
      // Ensure renderLimit covers all newly fetched videos so sentinel hides properly
      state.renderLimit = state.filteredVideos.length;
      renderVideoList();
      setLoading(false, false);
      if (!state.nextPageToken) {
        triggerCelebration();
      }
    }
  }
}

async function handleCopyIds() {
  if (state.filteredVideos.length === 0) return;

  const ids = state.filteredVideos.map((v) => v.video_id).join("\n");

  try {
    await navigator.clipboard.writeText(ids);

    // Visual feedback
    const originalBg = dom.copyIdsButton.innerHTML;
    dom.copyIdsButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
        `;
    dom.copyIdsButton.classList.add("border-green-500");

    setTimeout(() => {
      dom.copyIdsButton.innerHTML = originalBg;
      dom.copyIdsButton.classList.remove("border-green-500");
    }, 2000);
  } catch (err) {
    console.error("Failed to copy IDs:", err);
    showError("Failed to copy to clipboard.");
  }
}

async function handleExportJson() {
  if (state.filteredVideos.length === 0) return;

  const exportData = state.filteredVideos;

  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  const fileName = state.mode === "dislike" ? "dislikes.json" : "likes.json";
  downloadAnchorNode.setAttribute("download", fileName);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();

  // Visual feedback
  const originalBg = dom.exportJsonButton.innerHTML;
  dom.exportJsonButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
  `;
  dom.exportJsonButton.classList.add("border-green-500");

  setTimeout(() => {
    dom.exportJsonButton.innerHTML = originalBg;
    dom.exportJsonButton.classList.remove("border-green-500");
  }, 2000);
}

async function loadDemoData() {
  const originalText = dom.heroDemoButton.textContent;
  dom.heroDemoButton.textContent = "Loading...";
  dom.heroDemoButton.disabled = true;

  try {
    const response = await fetch('likes.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    if (Array.isArray(data)) {
      state.mode = 'like';
      state.videos = data;
      localStorage.setItem(`dislikes-data-${state.mode}`, JSON.stringify(data));
      localStorage.setItem(`dislikes-data-${state.mode}-timestamp`, Date.now());
      
      state.activeFilter = null;
      state.isAuthenticated = true; // Act as if authenticated
      
      filterVideos();
      render();
    } else {
      alert("Invalid JSON format in demo data.");
    }
  } catch (err) {
    alert("Error loading demo data. Make sure likes.json exists.");
    console.error(err);
  } finally {
    dom.heroDemoButton.textContent = originalText;
    dom.heroDemoButton.disabled = false;
  }
}

function handleUploadJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        state.videos = data;
        localStorage.setItem(`dislikes-data-${state.mode}`, JSON.stringify(data));
        localStorage.setItem(`dislikes-data-${state.mode}-timestamp`, Date.now());
        
        state.activeFilter = null;
        filterVideos();
        render();
        alert(`Successfully loaded ${data.length} videos!`);
      } else {
        alert("Invalid JSON format. Expected an array of videos.");
      }
    } catch (err) {
      alert("Error parsing JSON file.");
      console.error(err);
    }
  };
  reader.readAsText(file);
  
  // Reset the input so the same file can be uploaded again if needed
  event.target.value = "";
}

function filterVideos() {
  let results = [...state.videos];

  if (state.unavailableOnly) {
    results = results.filter((v) => checkIfDeleted(v));
  }

  if (state.musicOnly) {
    results = results.filter((v) => v.is_music);
  }

  // Search
  if (state.debouncedSearchTerm) {
    const lower = state.debouncedSearchTerm.toLowerCase();
    results = results.filter(
      (v) =>
        v.title.toLowerCase().includes(lower) ||
        v.artist.toLowerCase().includes(lower),
    );
  }

  // Save the base list for sidebar analytics (so other options don't disappear)
  state.sidebarBaseVideos = results;

  // Sidebar Filters
  if (state.activeFilter) {
    const { type, value } = state.activeFilter;
    if (type === "channel") {
      results = results.filter((v) => {
        const isDeleted = checkIfDeleted(v);
        let chName = isDeleted && !v.artist ? "Unavailable" : v.artist || "Unknown";
        if (chName.endsWith(" - Topic")) chName = chName.slice(0, -8);
        return chName === value;
      });
    } else if (type === "album") {
      // value is "artist|YYYY-MM-DD"
      const [artist, dateStr] = value.split("|");
      results = results.filter((v) => {
        if (!v.published_at || !v.artist) return false;
        let chName = v.artist;
        if (chName.endsWith(" - Topic")) chName = chName.slice(0, -8);
        if (chName !== artist) return false;
        return v.published_at.split('T')[0] === dateStr;
      });
    } else if (type === "year") {
      results = results.filter((v) => {
        if (!v.published_at) return false;
        return new Date(v.published_at).getFullYear().toString() === value;
      });
    } else if (type === "label") {
      results = results.filter((v) => v.label === value);
    } else if (type === "copyright") {
      results = results.filter((v) => v.copyright === value);
    }
  }

  // Sort
  results.sort((a, b) => {
    switch (state.sortBy) {
      case "date-new":
        return 0;
      case "duration-long":
        return (
          parseDuration(b.duration || "PT0S") -
          parseDuration(a.duration || "PT0S")
        );
      case "upload-new":
        return (
          new Date(b.published_at || 0) - new Date(a.published_at || 0)
        );
      case "comments-most":
        return b.comments - a.comments;
      case "views-high":
        return b.views - a.views;
      case "channel-az": {
        const artistCompare = a.artist.localeCompare(b.artist);
        if (artistCompare !== 0) return artistCompare;
        
        // Truncate to just the day (YYYY-MM-DD)
        const dateA = a.published_at ? a.published_at.split('T')[0] : '';
        const dateB = b.published_at ? b.published_at.split('T')[0] : '';
        
        if (dateA !== dateB) {
          // Sort chronologically by date
          return new Date(dateA || 0) - new Date(dateB || 0);
        }
        
        // If uploaded on the same day, sort by title (useful if tracks have track numbers)
        return a.title.localeCompare(b.title);
      }
      case "title-az":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  state.filteredVideos = results;
  state.renderLimit = 50; // Reset render limit on filter/sort
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
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function applyCompactMode(isCompact) {
  if (isCompact) {
    document.body.classList.add("compact-mode");
    dom.videoGrid.classList.remove("grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3", "gap-x-6", "gap-y-10");
    dom.videoGrid.classList.add("grid-cols-2", "sm:grid-cols-3", "md:grid-cols-4", "xl:grid-cols-6", "gap-x-4", "gap-y-6");
  } else {
    document.body.classList.remove("compact-mode");
    dom.videoGrid.classList.remove("grid-cols-2", "sm:grid-cols-3", "md:grid-cols-4", "xl:grid-cols-6", "gap-x-4", "gap-y-6");
    dom.videoGrid.classList.add("grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3", "gap-x-6", "gap-y-10");
  }
}

// --- Fetching Data ---

function render() {
  const isReady = state.gapiInited && state.gisInited;
  const isLoadMore = state.isLoadMore;

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
  if (dom.modeText) {
    dom.modeText.textContent = isDislike ? "Dislikes" : "Likes";
  } else {
    dom.modeToggle.textContent = isDislike ? "Dislikes" : "Likes";
  }
  dom.welcomeTitle.textContent = `Your YouTube ${isDislike ? "disliked" : "liked"} videos.`;
  dom.welcomeDesc.innerHTML = `View, filter, and sort your ${isDislike ? "dislikes" : "likes"}.<br>Simple, private, and minimal.`;

  document.title = isDislike ? "Dislikes" : "Likes";
  updateFavicon(state.mode);

  // Auth State Views
  if (state.isAuthenticated) {
    dom.viewWelcome.classList.add("hidden");
    dom.viewContent.classList.remove("hidden");

    dom.authIndicator.classList.remove("hidden");

    // Hide sign-in button in header when authenticated if desired,
    // but user might want to switch accounts.
    // Current design keeps it but maybe we change text?
    // For now, let's just update the views.
    dom.authButton.classList.add("hidden"); // Hide header login button when auth'd
  } else {
    dom.viewWelcome.classList.remove("hidden");
    dom.viewContent.classList.add("hidden");
    dom.authIndicator.classList.add("hidden");
    dom.authButton.classList.remove("hidden");
  }

  // Error
  if (state.error) {
    dom.errorContainer.classList.remove("hidden");
    dom.errorMessage.textContent = state.error;
  } else {
    dom.errorContainer.classList.add("hidden");
  }

  // Results Count
  let countText = "";
  const currentCount = state.filteredVideos.length;
  const totalCount = state.totalResults;
  const fmt = (n) => new Intl.NumberFormat().format(n);

  if (state.loading && !isLoadMore) {
    countText = "Loading...";
  } else if (!state.debouncedSearchTerm && !state.musicOnly && !state.unavailableOnly) {
    if (state.nextPageToken) {
      if (totalCount && totalCount > currentCount) {
        countText = `${fmt(currentCount)} of about ${fmt(totalCount)} loaded`;
      } else {
        countText = `${fmt(currentCount)} loaded`;
      }
    } else {
      countText = `All ${fmt(currentCount)} loaded`;
    }
  } else {
    let modifiers = [];
    if (state.unavailableOnly) modifiers.push('unavailable');
    if (state.musicOnly) modifiers.push('music');
    let modsStr = modifiers.length > 0 && !state.debouncedSearchTerm ? ' ' + modifiers.join(' ') : '';
    countText = `Found ${fmt(currentCount)}${modsStr} videos`;
  }

  dom.resultsCount.textContent = countText;

  // Load All Button State
  if (state.nextPageToken && !state.debouncedSearchTerm) {
    dom.loadAllButton.classList.remove("hidden");
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
  }

  renderSidebar();

  // Loading & Empty States
  if (state.isAuthenticated) {
    if (state.loading && !isLoadMore) {
      dom.emptyState.classList.add("hidden");
      dom.videoGrid.classList.remove("hidden");
      renderSkeletons();
    } else if (state.videos.length === 0) {
      dom.emptyState.classList.remove("hidden");
      dom.videoGrid.classList.add("hidden");
    } else {
      dom.emptyState.classList.add("hidden");
      dom.videoGrid.classList.remove("hidden");

      // Re-render the full list to ensure sorting/filtering is accurate
      renderVideoList();
    }

    updateSentinel();
  }
}

function updateSentinel() {
  if (state.isFetchAll) {
    dom.scrollSentinel.classList.remove("hidden");
    dom.scrollSentinel.innerHTML = `
        <div class="loading-spinner inline-block w-4 h-4 border-2 border-gray-100 border-t-gray-400 rounded-full mr-2 align-middle"></div>
        <span>Loading all videos...</span>
    `;
    return;
  }

  if (
    state.renderLimit < state.filteredVideos.length ||
    (state.nextPageToken && !state.debouncedSearchTerm)
  ) {
    dom.scrollSentinel.classList.remove("hidden");
    if (state.loading && state.isLoadMore) {
      dom.scrollSentinel.innerHTML = `
                  <div class="loading-spinner inline-block w-4 h-4 border-2 border-gray-100 border-t-gray-400 rounded-full mr-2 align-middle"></div>
                  <span>Loading more...</span>
              `;
    } else {
      dom.scrollSentinel.textContent = "Scroll for more";
    }
  } else {
    dom.scrollSentinel.classList.add("hidden");
  }
}

function renderVideoList(append = false) {
  if (!append) {
    dom.videoGrid.innerHTML = "";
  }

  const start = append ? state.renderLimit - 50 : 0;
  const end = Math.min(state.renderLimit, state.filteredVideos.length);
  const itemsToRender = state.filteredVideos.slice(start, end);

  itemsToRender.forEach((video) => {
    const clone = dom.videoTemplate.content.cloneNode(true);

    const title = video.title;
    const isDeleted = checkIfDeleted(video);
    const thumbnail = `https://i.ytimg.com/vi/${video.video_id}/mqdefault.jpg`;
    const viewCount = video.views
      ? new Intl.NumberFormat("en-US", {
          notation: "compact",
          compactDisplay: "short",
        }).format(video.views)
      : "N/A";

    // Image & Link
    const img = clone.querySelector(".video-thumbnail");
    const overlay = clone.querySelector(".deleted-overlay");

    img.src = thumbnail || "";
    img.alt = title;

    if (isDeleted) {
      overlay.classList.remove("hidden");
    }

    // 404 check (thumbnail doesn't exist)
    img.onerror = () => {
      if (!video._is404) {
        video._is404 = true;
        // If the user is currently sorting by deleted, we should refresh the list
        if (state.sortBy === "deleted-first") {
          filterVideos();
          renderVideoList();
        }
      }
      overlay.classList.remove("hidden");
      img.src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Transparent pixel
    };

    const baseUrl = video.is_music ? "https://music.youtube.com" : "https://www.youtube.com";
    
    // Internal Playback Button
    const playBtn = clone.querySelector(".video-play-btn");
    if (!isDeleted) {
      playBtn.addEventListener("click", () => {
        const index = state.filteredVideos.findIndex(v => v.video_id === video.video_id);
        const channelUrl = video.channel_id ? `${baseUrl}/channel/${video.channel_id}` : null;
        playVideo(video.video_id, title, video.artist || "Unknown channel", thumbnail, channelUrl, index);
      });
    } else {
      playBtn.classList.add("cursor-not-allowed");
    }

    // External Links (Title + Icon)
    const links = clone.querySelectorAll(".video-link");
    links.forEach(
      (l) => (l.href = `${baseUrl}/watch?v=${video.video_id}`),
    );

    // Title
    const titleEl = clone.querySelector(".video-title");
    titleEl.innerHTML = highlightMatch(title, state.debouncedSearchTerm);

    // Channel Info
    const channelEl = clone.querySelector(".channel-title");
    let chName = video.artist || "Unknown channel";
    if (chName.endsWith(" - Topic")) chName = chName.slice(0, -8);
    const chId = video.channel_id;

    if (chId && !isDeleted) {
      channelEl.innerHTML = `<a href="${baseUrl}/channel/${chId}" target="_blank" class="hover:text-black hover:underline">${highlightMatch(chName, state.debouncedSearchTerm)}</a>`;
    } else {
      channelEl.innerHTML = highlightMatch(chName, state.debouncedSearchTerm);
    }

    // Dynamic Metadata
    const metadataEl = clone.querySelector(".dynamic-metadata");
    metadataEl.textContent = isDeleted ? "No stats" : getDynamicMetadata(video);

    dom.videoGrid.appendChild(clone);
  });
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
  dom.videoGrid.innerHTML = "";
  // Show 12 skeleton cards (typical grid count)
  for (let i = 0; i < 12; i++) {
    const clone = dom.skeletonTemplate.content.cloneNode(true);
    dom.videoGrid.appendChild(clone);
  }
}

function renderSidebar() {
  if (state.videos.length === 0) return;

  const data = calculateAnalytics();
  let html = "";
  
  if (state.sidebarCategory === "channels") {
    html = data.topChannels.map((ch) => {
      const isActive = state.activeFilter && state.activeFilter.type === "channel" && state.activeFilter.value === ch.name;
      const bgClass = isActive ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-900";
      
      return `
        <div class="sidebar-filter-item flex items-center gap-3 text-sm text-gray-900 dark:text-gray-100 p-1.5 rounded cursor-pointer transition-colors ${bgClass}" data-type="channel" data-value="${ch.name}">
            <span class="w-8 flex justify-center font-bold text-gray-700 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 rounded text-[10px] py-1 shrink-0">${ch.count}</span>
            <span class="truncate pr-2">${ch.name}</span>
        </div>
      `;
    }).join("");
  } else if (state.sidebarCategory === "albums") {
    html = data.topAlbums.map((album) => {
      const val = `${album.artist}|${album.date}`;
      const isActive = state.activeFilter && state.activeFilter.type === "album" && state.activeFilter.value === val;
      const bgClass = isActive ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-900";
      
      return `
        <div class="sidebar-filter-item flex gap-3 items-center p-1.5 rounded cursor-pointer transition-colors ${bgClass}" data-type="album" data-value="${val}">
          <div class="shrink-0 relative group">
             <img src="${album.thumbnail}" alt="${album.artist}" class="w-12 h-12 object-cover rounded border border-gray-200 dark:border-gray-800 shadow-sm transition-opacity">
          </div>
          <div class="flex flex-col gap-0.5 overflow-hidden">
            <span class="text-[13px] font-medium text-gray-900 dark:text-gray-100 line-clamp-1">${album.artist}</span>
            <div class="flex items-center gap-2 text-[11px] text-gray-500">
              <span class="truncate">${album.year}</span>
              <span class="shrink-0">•</span>
              <span class="shrink-0 font-bold">${album.count} tracks</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  } else if (state.sidebarCategory === "years") {
    html = data.releaseYears.map((ry) => {
      const isActive = state.activeFilter && state.activeFilter.type === "year" && state.activeFilter.value === ry.year.toString();
      const bgClass = isActive ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-900";
      
      return `
        <div class="sidebar-filter-item flex items-center gap-3 text-sm text-gray-900 dark:text-gray-100 p-1.5 rounded cursor-pointer transition-colors ${bgClass}" data-type="year" data-value="${ry.year}">
          <span class="w-10 font-mono text-gray-500 shrink-0">${ry.year}</span>
          <div class="flex-1 bg-gray-200 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-gray-400 dark:bg-gray-500 h-full rounded-full" style="width: ${ry.percent}%"></div>
          </div>
          <span class="text-[10px] text-gray-500 font-mono whitespace-nowrap text-right shrink-0 min-w-[70px]">${ry.count}</span>
        </div>
      `;
    }).join("");
  } else if (state.sidebarCategory === "labels") {
    html = data.topLabels.map((lbl) => {
      const isActive = state.activeFilter && state.activeFilter.type === "label" && state.activeFilter.value === lbl.name;
      const bgClass = isActive ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-900";
      
      return `
        <div class="sidebar-filter-item flex items-center gap-3 text-sm text-gray-900 dark:text-gray-100 p-1.5 rounded cursor-pointer transition-colors ${bgClass}" data-type="label" data-value="${lbl.name}">
            <span class="w-8 flex justify-center font-bold text-gray-700 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 rounded text-[10px] py-1 shrink-0">${lbl.count}</span>
            <span class="truncate pr-2">${lbl.name}</span>
        </div>
      `;
    }).join("");
  } else if (state.sidebarCategory === "copyrights") {
    html = data.topCopyrights.map((cpy) => {
      const isActive = state.activeFilter && state.activeFilter.type === "copyright" && state.activeFilter.value === cpy.name;
      const bgClass = isActive ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-900";
      
      return `
        <div class="sidebar-filter-item flex items-center gap-3 text-sm text-gray-900 dark:text-gray-100 p-1.5 rounded cursor-pointer transition-colors ${bgClass}" data-type="copyright" data-value="${cpy.name}">
            <span class="w-8 flex justify-center font-bold text-gray-700 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 rounded text-[10px] py-1 shrink-0">${cpy.count}</span>
            <span class="truncate pr-2">${cpy.name}</span>
        </div>
      `;
    }).join("");
  }

  dom.sidebarListContainer.innerHTML = html || '<div class="text-gray-500 text-[12px] p-2">No data</div>';
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
    let chName =
      isDeleted && !v.artist
        ? "Unavailable"
        : v.artist || "Unknown";
    if (chName.endsWith(" - Topic")) chName = chName.slice(0, -8);
    const chId = v.channel_id;

    if (!channels[chName]) {
      channels[chName] = { count: 0, id: isDeleted ? null : chId };
    }
    channels[chName].count++;

    // Release Years
    if (!isDeleted && v.published_at) {
      const year = new Date(v.published_at).getFullYear();
      if (!isNaN(year)) {
        years[year] = (years[year] || 0) + 1;
      }
    }

    // Top Albums (cluster by channel + exact day)
    if (!isDeleted && v.published_at && v.artist && chName !== "Music Library Uploads") {
      const date = v.published_at.split('T')[0];
      const albumKey = `${chName}|${date}`;
      if (!albums[albumKey]) {
        albums[albumKey] = {
           artist: chName,
           date: date,
           year: new Date(v.published_at).getFullYear(),
           thumbnail: `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`,
           video_id: v.video_id,
           count: 0
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

  const totalVideos = (state.sidebarBaseVideos || state.filteredVideos).length;
  const releaseYears = Object.entries(years)
    .map(([year, count]) => ({
      year,
      count,
      percent: (count / totalVideos) * 100,
    }))
    .sort((a, b) => b.year - a.year);

  const topAlbums = Object.values(albums)
    // Only consider it an album if there's at least 3 tracks
    .filter(a => a.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

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
  const compact = (n) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
    }).format(n || 0);
  const full = (n) => new Intl.NumberFormat("en-US").format(n || 0);

  switch (state.sortBy) {
    case "views-high":
      return `${compact(video.views)} views`;
    case "duration-long":
      return formatDuration(video.duration);
    case "upload-new":
      return new Date(video.published_at).toLocaleDateString(
        undefined,
        { year: "numeric", month: "short", day: "numeric" },
      );
    case "comments-most":
      return `${compact(video.comments)} comments`;
    default:
      // For Recent, Channel, Title, Deleted, etc.
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
  if (!term) return text;
  const regex = new RegExp(`(${term})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
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
    if (dom.siteLogo) dom.siteLogo.src = state.iconCache[mode];
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
    if (dom.siteLogo) dom.siteLogo.src = dataUrl;
  };
}

// --- YouTube Player Logic ---
function initYTPlayer() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  window.onYouTubeIframeAPIReady = function() {
    state.ytPlayer = new YT.Player("ytplayer", {
      height: "1",
      width: "1",
      videoId: "",
      playerVars: {
        playsinline: 1,
        autoplay: 1,
        controls: 0,
      },
      events: {
        onReady: () => {
          state.isPlayerReady = true;
          dom.playerPlayPause.disabled = false;
          dom.fsPlayerPlayPause.disabled = false;
        },
        onStateChange: onPlayerStateChange,
        onError: (event) => {
          console.error("YouTube API Error:", event.data);
          dom.playerIconLoading.classList.add("hidden");
          dom.playerIconPlay.classList.remove("hidden");
          dom.playerIconPause.classList.add("hidden");
          
          dom.fsPlayerIconLoading.classList.add("hidden");
          dom.fsPlayerIconPlay.classList.remove("hidden");
          dom.fsPlayerIconPause.classList.add("hidden");
          
          if (event.data === 101 || event.data === 150) {
            dom.playerArtist.innerHTML = `<span class="text-red-500">Playback restricted on external sites</span>`;
            dom.fsPlayerArtist.innerHTML = `<span class="text-red-500">Playback restricted on external sites</span>`;
          } else {
            dom.playerArtist.innerHTML = `<span class="text-red-500">Video unavailable</span>`;
            dom.fsPlayerArtist.innerHTML = `<span class="text-red-500">Video unavailable</span>`;
          }
        }
      }
    });
  };
}

function onPlayerStateChange(event) {
  if (event.data === 1) { // Playing
    dom.playerIconLoading.classList.add("hidden");
    dom.playerIconPlay.classList.add("hidden");
    dom.playerIconPause.classList.remove("hidden");
    
    dom.fsPlayerIconLoading.classList.add("hidden");
    dom.fsPlayerIconPlay.classList.add("hidden");
    dom.fsPlayerIconPause.classList.remove("hidden");
    
    dom.fsPlayerPlayPause.disabled = false;
    startProgressInterval();
  } else if (event.data === 2 || event.data === 0) { // Paused or Ended
    dom.playerIconLoading.classList.add("hidden");
    dom.playerIconPlay.classList.remove("hidden");
    dom.playerIconPause.classList.add("hidden");
    
    dom.fsPlayerIconLoading.classList.add("hidden");
    dom.fsPlayerIconPlay.classList.remove("hidden");
    dom.fsPlayerIconPause.classList.add("hidden");
    
    dom.fsPlayerPlayPause.disabled = false;
    stopProgressInterval();

    if (event.data === 0 && state.currentVideoIndex >= 0 && state.currentVideoIndex < state.filteredVideos.length - 1) {
      // Autoplay next track when finished
      playTrackByIndex(state.currentVideoIndex + 1);
    }
  } else if (event.data === 3) { // Buffering
    dom.playerIconLoading.classList.remove("hidden");
    dom.playerIconPlay.classList.add("hidden");
    dom.playerIconPause.classList.add("hidden");
    
    dom.fsPlayerIconLoading.classList.remove("hidden");
    dom.fsPlayerIconPlay.classList.add("hidden");
    dom.fsPlayerIconPause.classList.add("hidden");
  }
}

function playVideo(videoId, title, artist, thumbUrl, channelUrl, index = -1) {
  state.currentVideoIndex = index;
  updatePrevNextButtons();

  dom.bottomPlayer.classList.remove("translate-y-full");
  document.body.style.paddingBottom = "72px"; // Height of bottom player
  
  if (dom.quickScrollContainer) {
    dom.quickScrollContainer.classList.add("-translate-y-[80px]");
  }
  
  dom.playerThumbnail.src = thumbUrl;
  dom.playerTitle.innerText = title;
  
  let cleanArtist = artist || "Unknown channel";
  if (cleanArtist.endsWith(" - Topic")) cleanArtist = cleanArtist.slice(0, -8);
  
  if (channelUrl) {
    dom.playerArtist.innerHTML = `<a href="${channelUrl}" target="_blank" class="hover:underline">${cleanArtist}</a>`;
    dom.fsPlayerArtist.innerHTML = `<a href="${channelUrl}" target="_blank" class="hover:underline">${cleanArtist}</a>`;
  } else {
    dom.playerArtist.innerText = cleanArtist;
    dom.fsPlayerArtist.innerText = cleanArtist;
  }
  
  // Full-screen player updates
  const maxResUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const hqResUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  
  dom.fsPlayerThumbnail.src = maxResUrl;
  dom.fsPlayerBg.style.backgroundImage = `url(${maxResUrl})`;
  dom.bottomPlayerBg.style.backgroundImage = `url(${maxResUrl})`;
  
  // Fallbacks if maxres doesn't exist
  dom.fsPlayerThumbnail.onerror = () => {
    if (dom.fsPlayerThumbnail.src === maxResUrl) {
      dom.fsPlayerThumbnail.src = hqResUrl;
      dom.fsPlayerBg.style.backgroundImage = `url(${hqResUrl})`;
      dom.bottomPlayerBg.style.backgroundImage = `url(${hqResUrl})`;
    } else if (dom.fsPlayerThumbnail.src === hqResUrl) {
      dom.fsPlayerThumbnail.src = thumbUrl;
      dom.fsPlayerBg.style.backgroundImage = `url(${thumbUrl})`;
      dom.bottomPlayerBg.style.backgroundImage = `url(${thumbUrl})`;
    }
  };
  dom.fsPlayerTitle.innerText = title;
  
  dom.playerIconLoading.classList.remove("hidden");
  dom.playerIconPlay.classList.add("hidden");
  dom.playerIconPause.classList.add("hidden");

  dom.fsPlayerIconLoading.classList.remove("hidden");
  dom.fsPlayerIconPlay.classList.add("hidden");
  dom.fsPlayerIconPause.classList.add("hidden");

  if (state.isPlayerReady && state.ytPlayer) {
    state.ytPlayer.loadVideoById(videoId);
  }
}

function updatePrevNextButtons() {
  if (state.currentVideoIndex === -1) {
    dom.fsPlayerPrev.disabled = true;
    dom.fsPlayerNext.disabled = true;
    dom.playerPrev.disabled = true;
    dom.playerNext.disabled = true;
  } else {
    dom.fsPlayerPrev.disabled = false; // Always allow seeking to start
    dom.fsPlayerNext.disabled = state.currentVideoIndex >= state.filteredVideos.length - 1;
    dom.playerPrev.disabled = false;
    dom.playerNext.disabled = state.currentVideoIndex >= state.filteredVideos.length - 1;
  }
}

function playTrackByIndex(index) {
  if (index >= 0 && index < state.filteredVideos.length) {
    const video = state.filteredVideos[index];
    const baseUrl = video.is_music ? "https://music.youtube.com" : "https://www.youtube.com";
    const channelUrl = video.channel_id ? `${baseUrl}/channel/${video.channel_id}` : null;
    let title = video.title;
    if (state.mode === "dislike") {
      title = video.title.replace(/^\[.*?\]\s*/, '');
    }
    const thumbnail = video.thumbnails?.high?.url || video.thumbnails?.default?.url || "";
    playVideo(video.video_id, title, video.artist || "Unknown channel", thumbnail, channelUrl, index);
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

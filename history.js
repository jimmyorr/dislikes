// Watch history (Google Takeout) import, play counts, and the Insights page.
// Loaded after app.js and shares its globals (state, dom, storage helpers, player).
// The parsed history lives in IndexedDB under WH_KEY; the raw Takeout file is never kept.

const WH_KEY = "watch_history";
const WH_DAY_MS = 86400000;

const wh = {
  data: null, // { videos, music, t, vi, meta }
  plays: null, // Uint32Array per history video
  firstT: null, // Uint32Array per history video (unix seconds)
  lastT: null,
  idToIdx: new Map(),
  artistOf: null, // string key per history video
  artistFirst: new Map(), // artist key -> first play (s)
  importing: false,
  demo: false, // showing the bundled demo history (not saved, real history untouched)
  insightsOpen: false,
  period: { type: "week", anchor: null },
  musicOnly: true,
};

function whHasData() {
  return Boolean(wh.data && wh.data.t && wh.data.t.length);
}

function whPlaysFor(videoId) {
  const i = wh.idToIdx.get(videoId);
  return i === undefined ? 0 : wh.plays[i];
}

function whLastPlayedFor(videoId) {
  const i = wh.idToIdx.get(videoId);
  return i === undefined ? 0 : wh.lastT[i];
}

function whArtistKey(channelId, channel) {
  return channelId || `name:${cleanArtistName(channel || "").toLowerCase()}`;
}

function whSetData(data) {
  wh.data = data;
  wh.idToIdx = new Map();
  wh.artistFirst = new Map();
  if (!data) {
    wh.plays = wh.firstT = wh.lastT = wh.artistOf = null;
    whAfterDataChange();
    return;
  }
  const n = data.videos.length;
  wh.plays = new Uint32Array(n);
  wh.firstT = new Uint32Array(n);
  wh.lastT = new Uint32Array(n);
  wh.artistOf = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = data.videos[i];
    wh.idToIdx.set(v.id, i);
    wh.artistOf[i] = whArtistKey(v.channelId, v.channel);
  }
  const { t, vi } = data;
  for (let k = 0; k < t.length; k++) {
    const v = vi[k];
    if (wh.plays[v] === 0) wh.firstT[v] = t[k];
    wh.plays[v]++;
    wh.lastT[v] = t[k];
    const a = wh.artistOf[v];
    if (!wh.artistFirst.has(a)) wh.artistFirst.set(a, t[k]);
  }
  whAfterDataChange();
}

function whAfterDataChange() {
  const has = whHasData();
  if (!has && (state.sortBy === "plays-most" || state.sortBy === "played-recent")) {
    state.sortBy = "date-new";
  }
  if (!has) state.neverPlayedOnly = false;
  whSyncUi();
  if (state.videos && state.videos.length) {
    filterVideos();
    render();
  }
  if (wh.insightsOpen) whRenderInsights();
}

// Show or hide every history-dependent control
function whSyncUi() {
  const has = whHasData();
  document.querySelectorAll("[data-requires-history]").forEach((el) => {
    el.classList.toggle("hidden", !has);
  });
  document.querySelectorAll("[data-requires-no-history]").forEach((el) => {
    el.classList.toggle("hidden", has);
  });
  const sortMenu = document.getElementById("sort-menu");
  if (sortMenu) {
    sortMenu.querySelectorAll(".dropdown-option").forEach((opt) => {
      const selected = opt.dataset.value === state.sortBy;
      opt.setAttribute("aria-selected", String(selected));
      opt.querySelector(".check-icon")?.classList.toggle("opacity-0", !selected);
      if (selected) {
        const label = document.getElementById("sort-label");
        const text = opt.querySelector("span")?.textContent;
        if (label && text) label.textContent = text.trim();
      }
    });
  }
  const neverToggle = document.getElementById("never-played-toggle");
  if (neverToggle) neverToggle.checked = Boolean(state.neverPlayedOnly);
  const status = document.getElementById("wh-settings-status");
  if (status) {
    status.textContent = has
      ? `${wh.demo ? "Demo: " : ""}${formatCount(wh.data.meta.plays)} plays, ${whFormatMonth(wh.data.meta.first)} to ${whFormatMonth(wh.data.meta.last)}`
      : "Not imported";
  }
  if (typeof updateFiltersUI === "function") updateFiltersUI();
}

// --- Storage ---

async function whLoadStored() {
  try {
    const db = await libraryDbReady;
    if (!db) return;
    const data = await idbRequest(db, "readonly", (store) => store.get(WH_KEY));
    if (wh.demo) return; // the demo's history is showing; the stored one comes back on exit
    if (data && data.version === 1 && data.t && data.vi) whSetData(data);
    else whSyncUi();
  } catch (e) {
    console.warn("Couldn't load watch history:", e);
    whSyncUi();
  }
}

async function whSave(data) {
  const db = await libraryDbReady;
  if (!db) return false;
  try {
    await idbRequest(db, "readwrite", (store) => store.put(data, WH_KEY));
    return true;
  } catch (e) {
    console.warn("Couldn't save watch history:", e);
    return false;
  }
}

async function whRemove() {
  if (wh.demo) {
    whExitDemo();
    return;
  }
  try {
    const db = await libraryDbReady;
    if (db) await idbRequest(db, "readwrite", (store) => store.delete(WH_KEY));
  } catch {
    /* ignore */
  }
  whSetData(null);
  if (wh.insightsOpen) whCloseInsights();
  showToast("Watch history removed");
}

// --- Demo (?demo=1): a bundled copy of a real history (demo-history.json), kept in memory only ---

async function whLoadDemoHistory() {
  try {
    const res = await fetch("demo-history.json");
    if (!res.ok) return;
    const raw = await res.json();
    if (!raw || raw.version !== 1 || !Array.isArray(raw.videos)) return;
    const n = raw.t.length;
    const t = new Uint32Array(n);
    let acc = 0;
    for (let k = 0; k < n; k++) {
      acc += raw.t[k];
      t[k] = acc;
    }
    const data = {
      version: 1,
      videos: raw.videos.map(([id, title, channel, channelId]) => ({ id, title, channel, channelId })),
      music: Uint8Array.from(raw.videos, (v) => (v[4] === undefined ? 1 : v[4] ? 1 : 0)),
      t,
      vi: Uint32Array.from(raw.vi),
      meta: { importedAt: Date.now(), entries: n, plays: n, distinct: raw.videos.length, musicPlays: n, skippedAds: 0, skippedOther: 0, collapsed: 0, first: n ? t[0] : null, last: n ? t[n - 1] : null },
    };
    if (state.dataSource !== "demo") return; // demo was exited while loading
    wh.demo = true;
    whSetData(data);
  } catch (e) {
    console.warn("Couldn't load demo history:", e);
  }
}

// Leaving the demo puts back the user's own imported history, if any
function whExitDemo() {
  if (!wh.demo) return;
  wh.demo = false;
  whSetData(null);
  whLoadStored();
}

// --- Import ---

function whLooksLikeHistoryFile(file) {
  const name = (file && file.name ? file.name : "").toLowerCase();
  return name.endsWith(".zip") || name.includes("watch-history") || name.includes("takeout");
}

function whIsTakeoutArray(data) {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.slice(0, 20).some((d) => d && typeof d === "object" && "header" in d && "time" in d && !("video_id" in d))
  );
}

function whImportFile(file) {
  if (!file || wh.importing) return;
  whOpenDialog("progress");
  whSetProgress("Reading file", 0, 0);
  wh.importing = true;
  let worker;
  try {
    worker = new Worker(`history-worker.js?v=${APP_VERSION}`);
  } catch (e) {
    wh.importing = false;
    whShowDialogError("This browser can't run the importer.");
    return;
  }
  worker.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type === "progress") {
      whSetProgress(msg.stage, msg.done, msg.total);
      return;
    }
    worker.terminate();
    wh.importing = false;
    if (msg.type === "error") {
      console.warn("History import failed:", msg.detail);
      whShowDialogError(msg.message);
      return;
    }
    const data = msg.result;
    if (!data || !data.t.length) {
      whShowDialogError("No plays found in that file.");
      return;
    }
    whSetProgress("Saving", 1, 1);
    const saved = await whSave(data);
    wh.demo = false;
    whSetData(data);
    whShowDialogDone(saved);
  };
  worker.onerror = (err) => {
    worker.terminate();
    wh.importing = false;
    console.warn(err);
    whShowDialogError("Something went wrong while reading the file.");
  };
  worker.postMessage({ file });
}

// --- Import dialog ---

function whDialog() {
  return document.getElementById("wh-dialog");
}

function whOpenDialog(stateName = "intro") {
  const dlg = whDialog();
  if (!dlg) return;
  closeAllPopovers?.();
  whShowDialogState(stateName);
  if (!dlg.open) {
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute("open", "");
    }
  }
}

function whCloseDialog() {
  const dlg = whDialog();
  if (dlg && dlg.open) dlg.close();
}

function whShowDialogState(name) {
  const dlg = whDialog();
  if (!dlg) return;
  dlg.querySelectorAll("[data-wh-state]").forEach((el) => {
    el.hidden = el.dataset.whState !== name;
  });
  dlg.dataset.state = name;
}

function whSetProgress(stage, done, total) {
  whShowDialogState("progress");
  const label = document.getElementById("wh-progress-label");
  const bar = document.getElementById("wh-progress-bar");
  if (label) {
    label.textContent =
      total > 0 && stage === "Reading plays"
        ? `Reading ${formatCount(done)} of ${formatCount(total)} entries`
        : `${stage}…`;
  }
  if (bar) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 8;
    bar.style.width = `${Math.max(4, pct)}%`;
  }
}

function whShowDialogError(message) {
  wh.importing = false;
  const el = document.getElementById("wh-error-message");
  if (el) el.textContent = message;
  whOpenDialog("error");
}

function whShowDialogDone(saved) {
  const m = wh.data.meta;
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("wh-done-plays", formatCount(m.plays));
  set("wh-done-videos", formatCount(m.distinct));
  const years = m.first && m.last ? (m.last - m.first) / (365.25 * 86400) : 0;
  set("wh-done-years", years >= 1 ? `${years.toFixed(1)} yrs` : `${Math.max(1, Math.round(years * 12))} mo`);
  set(
    "wh-done-range",
    `${whFormatMonth(m.first)} to ${whFormatMonth(m.last)}. Skipped ${formatCount(m.skippedAds)} ads and ${formatCount(m.skippedOther)} other entries.`,
  );
  const musicPct = m.plays ? Math.round((m.musicPlays / (m.entries - m.skippedAds - m.skippedOther || 1)) * 100) : 0;
  const bar = document.getElementById("wh-done-music-bar");
  if (bar) bar.style.width = `${Math.min(100, musicPct)}%`;
  set("wh-done-split", `YouTube Music ${Math.min(100, musicPct)}%, YouTube ${Math.max(0, 100 - musicPct)}%`);
  let liked = "";
  if (state.mode === "like" && state.videos && state.videos.length) {
    const played = state.videos.filter((v) => whPlaysFor(v.video_id) > 0).length;
    liked = `${formatCount(played)} of your ${formatCount(state.videos.length)} loaded likes have plays.`;
  }
  set("wh-done-liked", liked);
  set("wh-done-saved", saved ? "" : "Couldn't save it in this browser, so it will be gone after a reload.");
  const libBtn = document.getElementById("wh-done-library");
  if (libBtn) libBtn.classList.toggle("hidden", !(state.videos && state.videos.length));
  whOpenDialog("done");
}

// --- Formatting helpers ---

const WH_MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const WH_DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const WH_SHORT_DAY_FMT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const WH_LONG_DAY_FMT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const WH_MONTH_LONG_FMT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const WH_WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const WH_MONTH_ONLY_FMT = new Intl.DateTimeFormat(undefined, { month: "short" });
const WH_HOUR_FMT = new Intl.DateTimeFormat(undefined, { hour: "numeric" });

function whFormatMonth(sec) {
  return sec ? WH_MONTH_FMT.format(new Date(sec * 1000)) : "?";
}

function whRelativeTime(sec) {
  if (!sec) return "";
  const days = Math.floor((Date.now() / 1000 - sec) / 86400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  const yrs = Math.floor(days / 365);
  return `${yrs} yr${yrs > 1 ? "s" : ""} ago`;
}

function whPlural(n, word) {
  return `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
}

// Card metadata line for the history sorts (used by getDynamicMetadata in app.js)
function whMetadataFor(video, sortBy) {
  const plays = whPlaysFor(video.video_id);
  if (sortBy === "played-recent") {
    return plays ? `Played ${whRelativeTime(whLastPlayedFor(video.video_id))}` : "Never played";
  }
  if (!plays) return "Never played";
  return `${whPlural(plays, "play")} · last ${whRelativeTime(whLastPlayedFor(video.video_id))}`;
}

// --- Periods ---

function whStartOf(type, date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (type === "week") {
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
  } else if (type === "month") {
    d.setDate(1);
  } else if (type === "year") {
    d.setMonth(0, 1);
  }
  return d;
}

function whShift(type, date, n) {
  const d = new Date(date);
  if (type === "week") d.setDate(d.getDate() + 7 * n);
  else if (type === "month") d.setMonth(d.getMonth() + n);
  else if (type === "year") d.setFullYear(d.getFullYear() + n);
  return d;
}

function whPeriodRange(type, anchorMs) {
  if (type === "all") {
    const m = wh.data.meta;
    return { start: whStartOf("day", m.first * 1000), end: new Date(m.last * 1000 + 1000) };
  }
  const start = whStartOf(type, anchorMs);
  return { start, end: whShift(type, start, 1) };
}

function whPeriodLabel(type, range) {
  if (type === "all") return "All time";
  if (type === "week") {
    const last = new Date(range.end.getTime() - 1);
    return `${WH_SHORT_DAY_FMT.format(range.start)} to ${WH_LONG_DAY_FMT.format(last)}`;
  }
  if (type === "month") return WH_MONTH_LONG_FMT.format(range.start);
  return String(range.start.getFullYear());
}

function whLowerBound(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// --- Aggregation ---

function whLikedMap() {
  const map = new Map();
  if (state.mode === "like" && Array.isArray(state.videos)) {
    for (const v of state.videos) map.set(v.video_id, v);
  }
  return map;
}

function whMusicMask(liked) {
  const vids = wh.data.videos;
  const mask = new Uint8Array(vids.length);
  for (let i = 0; i < vids.length; i++) {
    const lv = liked.get(vids[i].id);
    mask[i] =
      wh.data.music[i] || /\s-\sTopic$/.test(vids[i].channel || "") || (lv && lv.is_music) ? 1 : 0;
  }
  return mask;
}

function whAggregate(startSec, endSec, ctx, light = false) {
  const { t, vi } = wh.data;
  const lo = whLowerBound(t, startSec);
  const hi = whLowerBound(t, endSec);
  const trackCounts = new Map();
  const artistCounts = new Map();
  const activeDays = new Set();
  const hours = new Array(24).fill(0);
  const dayCounts = new Map();
  let plays = 0;
  let newTrackPlays = 0;
  let oldTrackPlays = 0;
  let likedPlays = 0;
  let knownSeconds = 0;
  let knownPlays = 0;

  for (let k = lo; k < hi; k++) {
    const v = vi[k];
    if (ctx.musicOnly && !ctx.mask[v]) continue;
    plays++;
    trackCounts.set(v, (trackCounts.get(v) || 0) + 1);
    const a = wh.artistOf[v];
    artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
    if (wh.firstT[v] >= startSec) newTrackPlays++;
    else oldTrackPlays++;
    const d = new Date(t[k] * 1000);
    const dayKey = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    activeDays.add(dayKey);
    if (light) continue;
    hours[d.getHours()]++;
    dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
    const lv = ctx.liked.get(wh.data.videos[v].id);
    if (lv) {
      likedPlays++;
      const secs = lv.duration ? parseDuration(lv.duration) : 0;
      if (secs > 0 && secs < 4 * 3600) {
        knownSeconds += secs;
        knownPlays++;
      }
    }
  }

  let newArtists = 0;
  for (const a of artistCounts.keys()) {
    if ((wh.artistFirst.get(a) || 0) >= startSec) newArtists++;
  }
  let top5 = 0;
  if (artistCounts.size) {
    const sorted = Array.from(artistCounts.values()).sort((x, y) => y - x);
    for (let i = 0; i < Math.min(5, sorted.length); i++) top5 += sorted[i];
  }

  // A period the data ends inside only counts the days that have data so far
  const spanDays = Math.max(1, Math.ceil((Math.min(endSec, wh.data.meta.last + 1) - startSec) / 86400));
  const fingerprint = plays
    ? {
        consistency: Math.min(1, activeDays.size / spanDays),
        discovery: artistCounts.size ? newArtists / artistCounts.size : 0,
        variety: trackCounts.size / plays,
        concentration: top5 / plays,
        replay: oldTrackPlays / plays,
      }
    : null;

  return {
    lo,
    hi,
    plays,
    trackCounts,
    artistCounts,
    activeDays: activeDays.size,
    spanDays,
    hours,
    dayCounts,
    newArtists,
    newTrackPlays,
    likedPlays,
    knownSeconds,
    knownPlays,
    fingerprint,
  };
}

// Average fingerprint over every period of this type that has plays (the "typical" week/month/year)
function whTypicalFingerprint(type, ctx) {
  if (type === "all") return null;
  const m = wh.data.meta;
  let cursor = whStartOf(type, m.first * 1000);
  const endMs = m.last * 1000;
  const sums = { consistency: 0, discovery: 0, variety: 0, concentration: 0, replay: 0 };
  let n = 0;
  let guard = 0;
  while (cursor.getTime() <= endMs && guard++ < 2000) {
    const next = whShift(type, cursor, 1);
    const agg = whAggregate(cursor.getTime() / 1000, next.getTime() / 1000, ctx, true);
    if (agg.fingerprint && agg.plays >= 5) {
      for (const k in sums) sums[k] += agg.fingerprint[k];
      n++;
    }
    cursor = next;
  }
  if (!n) return null;
  for (const k in sums) sums[k] /= n;
  return sums;
}

function whBuckets(type, range, agg) {
  // Returns [{label, key, value}] for the hero bars
  const out = [];
  if (type === "week" || type === "month") {
    const d = new Date(range.start);
    while (d < range.end) {
      const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      out.push({
        label: type === "week" ? WH_WEEKDAY_FMT.format(d) : String(d.getDate()),
        value: agg.dayCounts.get(key) || 0,
      });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  if (type === "year") {
    const months = new Array(12).fill(0);
    agg.dayCounts.forEach((c, key) => {
      months[Math.floor((key % 10000) / 100) - 1] += c;
    });
    for (let i = 0; i < 12; i++) {
      out.push({ label: WH_MONTH_ONLY_FMT.format(new Date(2000, i, 1)), value: months[i] });
    }
    return out;
  }
  const years = new Map();
  agg.dayCounts.forEach((c, key) => {
    const y = Math.floor(key / 10000);
    years.set(y, (years.get(y) || 0) + c);
  });
  const y0 = range.start.getFullYear();
  const y1 = new Date(range.end.getTime() - 1).getFullYear();
  for (let y = y0; y <= y1; y++) out.push({ label: String(y), value: years.get(y) || 0 });
  return out;
}

// --- Insights rendering ---

function whOpenInsights(pushHistory = true) {
  if (!whHasData()) {
    wh.openInsightsAfterImport = true;
    whOpenDialog("intro");
    return;
  }
  wh.insightsOpen = true;
  document.body.classList.add("wh-insights-open");
  const view = document.getElementById("view-insights");
  if (view) view.hidden = false;
  if (pushHistory && location.hash !== "#insights") {
    history.pushState({ insights: true }, "", "#insights");
  }
  whRenderInsights();
  window.scrollTo(0, 0);
}

function whCloseInsights(fromPop = false) {
  wh.insightsOpen = false;
  document.body.classList.remove("wh-insights-open");
  const view = document.getElementById("view-insights");
  if (view) view.hidden = true;
  if (!fromPop && location.hash === "#insights") {
    history.replaceState(null, "", location.pathname + location.search);
  }
  if (typeof scheduleScrubberLayoutRefresh === "function") scheduleScrubberLayoutRefresh();
  if (typeof renderVirtualGrid === "function" && state.filteredVideos?.length) renderVirtualGrid(true);
}

function whThumb(id) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
}

function whDelta(cur, prev) {
  if (!prev) return cur ? { text: "New this period", cls: "wh-up" } : { text: "", cls: "" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: "Same as before", cls: "" };
  return pct > 0 ? { text: `Up ${pct}%`, cls: "wh-up" } : { text: `Down ${-pct}%`, cls: "wh-down" };
}

function whRenderInsights() {
  const root = document.getElementById("insights-body");
  if (!root || !whHasData()) return;

  const type = wh.period.type;
  const m = wh.data.meta;
  if (!wh.period.anchor) {
    // Default to the last complete period (like last.fm's "last week"), not a half-finished one
    wh.period.anchor = m.last * 1000;
    if (type !== "all") {
      const cur = whPeriodRange(type, wh.period.anchor);
      const prevStart = whShift(type, cur.start, -1);
      if (cur.end.getTime() > m.last * 1000 + WH_DAY_MS && prevStart.getTime() >= whStartOf(type, m.first * 1000).getTime()) {
        wh.period.anchor = prevStart.getTime();
      }
    }
  }
  const range = whPeriodRange(type, wh.period.anchor);
  // The data ends inside this period: compare it with the same stretch of the previous one
  const partial = type !== "all" && range.end.getTime() > m.last * 1000 + 1000;
  const startSec = Math.floor(range.start.getTime() / 1000);
  const endSec = Math.floor(range.end.getTime() / 1000);

  const liked = whLikedMap();
  const ctx = { liked, mask: whMusicMask(liked), musicOnly: wh.musicOnly };
  const agg = whAggregate(startSec, endSec, ctx);

  let prevAgg = null;
  let prevFull = null;
  let prevLabel = "";
  if (type !== "all") {
    const prevStartSec = Math.floor(whShift(type, range.start, -1).getTime() / 1000);
    prevFull = whAggregate(prevStartSec, startSec, ctx);
    prevAgg = partial ? whAggregate(prevStartSec, prevStartSec + (m.last + 1 - startSec), ctx) : prevFull;
    prevLabel = partial ? `the same point last ${type}` : `last ${type}`;
  }
  const typical = whTypicalFingerprint(type, ctx);

  // Period controls
  document.querySelectorAll("#insights-period-tabs [data-period]").forEach((btn) => {
    const active = btn.dataset.period === type;
    btn.setAttribute("aria-pressed", String(active));
  });
  const label = document.getElementById("insights-period-label");
  if (label) label.textContent = `${whPeriodLabel(type, range)}${partial ? " (so far)" : ""}`;
  const prevBtn = document.getElementById("insights-prev");
  const nextBtn = document.getElementById("insights-next");
  if (prevBtn) prevBtn.disabled = type === "all" || range.start.getTime() <= m.first * 1000;
  if (nextBtn) nextBtn.disabled = type === "all" || range.end.getTime() > m.last * 1000;
  const musicToggle = document.getElementById("insights-music-toggle");
  if (musicToggle) musicToggle.checked = wh.musicOnly;
  const likesNote = document.getElementById("insights-likes-note");
  if (likesNote) likesNote.hidden = liked.size > 0;

  if (!agg.plays) {
    root.innerHTML = `<div class="wh-empty">No ${wh.musicOnly ? "music " : ""}plays in this period. Try another ${type === "all" ? "filter" : type}.</div>`;
    return;
  }

  const sections = [];
  sections.push(whHeroHtml(type, range, agg, prevAgg, prevLabel, prevFull));
  sections.push(`<div class="wh-cards">${whArtistsCard(agg, prevAgg, ctx)}${whAlbumsCard(agg, prevAgg, ctx)}${whTracksCard(agg, prevAgg, ctx)}</div>`);
  sections.push(`<div class="wh-row">${whClockHtml(agg)}${whFingerprintHtml(agg, typical, type)}</div>`);
  sections.push(whFactsHtml(type, range, agg, prevAgg, ctx));
  const decade = whDecadeHtml(agg, ctx);
  const likes = whLikesHtml(agg, ctx);
  if (decade || likes) sections.push(`<div class="wh-row">${likes}${decade}</div>`);
  root.innerHTML = sections.join("");
}

function whHeroHtml(type, range, agg, prevAgg, prevLabel, prevFull) {
  const cur = whBuckets(type, range, agg);
  let prev = null;
  if (prevFull && type !== "all") {
    const prevRange = { start: whShift(type, range.start, -1), end: range.start };
    prev = whBuckets(type, prevRange, prevFull);
  }
  const max = Math.max(1, ...cur.map((b) => b.value), ...(prev ? prev.map((b) => b.value) : []));
  const many = cur.length > 14;
  const bars = cur
    .map((b, i) => {
      const p = prev && prev[i] ? prev[i].value : null;
      const h = (b.value / max) * 100;
      const ph = p !== null ? (p / max) * 100 : 0;
      const showLabel = !many || i === 0 || (i + 1) % 5 === 0;
      const title = `${b.label}: ${whPlural(b.value, "play")}${p !== null ? ` (vs ${formatCount(p)})` : ""}`;
      return `<div class="wh-bar-group" title="${escapeHtml(title)}"><div class="wh-bar-pair">${
        prev ? `<span class="wh-bar wh-bar-prev" style="height:${ph}%"></span>` : ""
      }<span class="wh-bar" style="height:${h}%"></span></div><span class="wh-bar-label">${showLabel ? escapeHtml(b.label) : ""}</span></div>`;
    })
    .join("");
  const d = prevAgg ? whDelta(agg.plays, prevAgg.plays) : { text: "", cls: "" };
  return `<section class="wh-hero">
    <div class="wh-hero-total">
      ${d.text ? `<span class="wh-delta ${d.cls}">${escapeHtml(d.text)} vs ${escapeHtml(prevLabel)}</span>` : ""}
      <span class="wh-hero-number">${formatCount(agg.plays)}</span>
      <span class="wh-hero-unit">${agg.plays === 1 ? "play" : "plays"}</span>
    </div>
    <div class="wh-hero-chart">
      ${prev ? `<div class="wh-legend"><span><i class="wh-key"></i>This ${type}</span><span><i class="wh-key wh-key-prev"></i>Last ${type}</span></div>` : ""}
      <div class="wh-bars ${many ? "wh-bars-many" : ""}">${bars}</div>
    </div>
  </section>`;
}

function whTopList(entries, render) {
  return entries.map((e, i) => render(e, i)).join("");
}

function whCardShell(cls, title, count, prevCount, newShare, newWord, firstHtml, restHtml, note = "") {
  const d = prevCount !== null ? whDelta(count, prevCount) : null;
  return `<section class="wh-card ${cls}">
    <header class="wh-card-head"><span class="wh-card-title">${escapeHtml(title)}</span><span class="wh-card-count">${formatCount(count)}${
      d && d.text ? ` <span class="${d.cls}">${escapeHtml(d.text.replace("Up ", "+").replace("Down ", "−"))}</span>` : ""
    }</span></header>
    <div class="wh-card-body">
      ${firstHtml}
      <ol class="wh-list">${restHtml}</ol>
      <p class="wh-card-foot">${newShare !== null ? `${Math.round(newShare * 100)}% new ${newWord}` : ""}${note ? ` ${note}` : ""}</p>
    </div>
  </section>`;
}

function whArtistInfo(key) {
  // Find a representative video for this artist key (for name, channel link, thumbnail)
  return wh.artistSample.get(key);
}

function whBuildArtistSamples(trackCounts) {
  wh.artistSample = new Map();
  const vids = wh.data.videos;
  for (const [v, c] of trackCounts) {
    const key = wh.artistOf[v];
    const cur = wh.artistSample.get(key);
    if (!cur || c > cur.c) {
      wh.artistSample.set(key, { v, c, name: cleanArtistName(vids[v].channel || "Unknown"), channelId: vids[v].channelId });
    }
  }
}

function whArtistsCard(agg, prevAgg) {
  whBuildArtistSamples(agg.trackCounts);
  const top = Array.from(agg.artistCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const first = top[0];
  const info = whArtistInfo(first[0]);
  const firstHtml = `<button type="button" class="wh-top" data-wh-artist="${escapeHtml(info.name)}">
      <img src="${whThumb(wh.data.videos[info.v].id)}" alt="" loading="lazy" />
      <span><span class="wh-top-rank">#1</span><span class="wh-top-name">${escapeHtml(info.name)}</span><span class="wh-top-sub">${whPlural(first[1], "play")}</span></span>
    </button>`;
  const rest = whTopList(top.slice(1), ([key, c], i) => {
    const inf = whArtistInfo(key);
    return `<li><button type="button" class="wh-list-item" data-wh-artist="${escapeHtml(inf.name)}"><span class="wh-rank">${i + 2}</span><span class="wh-name">${escapeHtml(inf.name)}</span><span class="wh-num">${formatCount(c)}</span></button></li>`;
  });
  return whCardShell(
    "wh-card-artists",
    "Artists",
    agg.artistCounts.size,
    prevAgg ? prevAgg.artistCounts.size : null,
    agg.artistCounts.size ? agg.newArtists / agg.artistCounts.size : null,
    "artists",
    firstHtml,
    rest,
  );
}

function whAlbumsCard(agg, prevAgg, ctx) {
  // Albums are inferred like the library sidebar does: same artist + same release day, liked tracks only
  const albumsOf = (a) => {
    const map = new Map();
    for (const [v, c] of a.trackCounts) {
      const lv = ctx.liked.get(wh.data.videos[v].id);
      if (!lv || !lv.published_at) continue;
      const artist = cleanArtistName(lv.artist);
      const key = `${artist}|${lv.published_at.split("T")[0]}`;
      const cur = map.get(key) || { artist, year: getVideoYear(lv.published_at), plays: 0, tracks: 0, v };
      cur.plays += c;
      cur.tracks++;
      map.set(key, cur);
    }
    return map;
  };
  const albums = albumsOf(agg);
  if (!ctx.liked.size || !albums.size) {
    return `<section class="wh-card wh-card-albums"><header class="wh-card-head"><span class="wh-card-title">Albums</span></header><div class="wh-card-body"><p class="wh-muted">Albums come from your liked tracks' release info. ${
      ctx.liked.size ? "None of this period's plays were liked tracks with a release date." : "Load your likes to see them."
    }</p></div></section>`;
  }
  const prevAlbums = prevAgg ? albumsOf(prevAgg) : null;
  const top = Array.from(albums.values()).sort((a, b) => b.plays - a.plays).slice(0, 5);
  const label = (a) => `${a.artist}${a.year ? ` (${a.year})` : ""}`;
  const firstHtml = `<button type="button" class="wh-top" data-wh-artist="${escapeHtml(top[0].artist)}">
      <img src="${whThumb(wh.data.videos[top[0].v].id)}" alt="" loading="lazy" />
      <span><span class="wh-top-rank">#1</span><span class="wh-top-name">${escapeHtml(label(top[0]))}</span><span class="wh-top-sub">${whPlural(top[0].plays, "play")}, ${whPlural(top[0].tracks, "track")}</span></span>
    </button>`;
  const rest = whTopList(top.slice(1), (a, i) => `<li><button type="button" class="wh-list-item" data-wh-artist="${escapeHtml(a.artist)}"><span class="wh-rank">${i + 2}</span><span class="wh-name">${escapeHtml(label(a))}</span><span class="wh-num">${formatCount(a.plays)}</span></button></li>`);
  return whCardShell("wh-card-albums", "Albums", albums.size, prevAlbums ? prevAlbums.size : null, null, "", firstHtml, rest, "Liked tracks only, grouped by release.");
}

function whTrackTitle(v) {
  const hv = wh.data.videos[v];
  const lv = whLikedLookup(hv.id);
  return (lv && lv.title) || hv.title || "Removed video";
}

function whLikedLookup(id) {
  return state.mode === "like" && wh.likedCache ? wh.likedCache.get(id) : null;
}

function whTracksCard(agg, prevAgg, ctx) {
  wh.likedCache = ctx.liked;
  const top = Array.from(agg.trackCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const [v0, c0] = top[0];
  const hv0 = wh.data.videos[v0];
  const firstHtml = `<button type="button" class="wh-top" data-wh-play="${escapeHtml(hv0.id)}">
      <img src="${whThumb(hv0.id)}" alt="" loading="lazy" />
      <span><span class="wh-top-rank">#1</span><span class="wh-top-name">${escapeHtml(whTrackTitle(v0))}</span><span class="wh-top-sub">${escapeHtml(cleanArtistName(hv0.channel || ""))}${hv0.channel ? ", " : ""}${whPlural(c0, "play")}</span></span>
    </button>`;
  const rest = whTopList(top.slice(1), ([v, c], i) => `<li><button type="button" class="wh-list-item" data-wh-play="${escapeHtml(wh.data.videos[v].id)}"><span class="wh-rank">${i + 2}</span><span class="wh-name">${escapeHtml(whTrackTitle(v))}</span><span class="wh-num">${formatCount(c)}</span></button></li>`);
  return whCardShell(
    "wh-card-tracks",
    "Tracks",
    agg.trackCounts.size,
    prevAgg ? prevAgg.trackCounts.size : null,
    agg.plays ? agg.newTrackPlays / agg.plays : null,
    "plays",
    firstHtml,
    rest,
  );
}

function whClockHtml(agg) {
  const max = Math.max(1, ...agg.hours);
  const busiest = agg.hours.indexOf(Math.max(...agg.hours));
  const hourName = (h) => WH_HOUR_FMT.format(new Date(2000, 0, 1, h));
  const bars = agg.hours
    .map((c, h) => `<div class="wh-clock-col" title="${escapeHtml(`${hourName(h)}: ${whPlural(c, "play")}`)}"><span class="wh-bar ${h === busiest ? "wh-bar-hot" : ""}" style="height:${(c / max) * 100}%"></span></div>`)
    .join("");
  const ticks = [0, 6, 12, 18].map((h) => `<span style="left:${(h / 24) * 100}%">${escapeHtml(hourName(h))}</span>`).join("");
  return `<section class="wh-panel wh-clock">
    <header class="wh-panel-head"><span class="wh-card-title">Listening clock</span><span class="wh-muted">Busiest hour ${escapeHtml(hourName(busiest))}, ${whPlural(agg.hours[busiest], "play")}</span></header>
    <div class="wh-clock-bars">${bars}</div>
    <div class="wh-clock-ticks">${ticks}</div>
  </section>`;
}

const WH_FINGERPRINT = [
  ["consistency", "Consistency", "Share of days you listened"],
  ["discovery", "Discovery", "Share of artists that were new to you"],
  ["variety", "Variety", "Distinct tracks per play"],
  ["concentration", "Concentration", "Share of plays from your top 5 artists"],
  ["replay", "Replay rate", "Share of plays of tracks you already knew"],
];

function whFingerprintHtml(agg, typical, type) {
  const fp = agg.fingerprint;
  const rows = WH_FINGERPRINT.map(([key, name, desc]) => {
    const v = Math.round(fp[key] * 100);
    const avg = typical ? Math.round(typical[key] * 100) : null;
    return `<div class="wh-fp-row" title="${escapeHtml(`${desc}: ${v}%${avg !== null ? ` (typical ${type}: ${avg}%)` : ""}`)}">
      <span class="wh-fp-name">${name}</span>
      <span class="wh-fp-track"><span class="wh-fp-fill" style="width:${v}%"></span>${avg !== null ? `<span class="wh-fp-avg" style="left:${avg}%"></span>` : ""}</span>
      <span class="wh-num">${v}%</span>
    </div>`;
  }).join("");
  return `<section class="wh-panel wh-fingerprint">
    <header class="wh-panel-head"><span class="wh-card-title">Listening fingerprint</span></header>
    ${rows}
    <p class="wh-muted wh-small">${typical ? `Tick marks your typical ${type}.` : "Compared across your whole history."} Hover a row for what it measures.</p>
  </section>`;
}

function whFactsHtml(type, range, agg, prevAgg, ctx) {
  const facts = [];
  const lastData = wh.data.meta.last * 1000;
  const effectiveEnd = Math.min(range.end.getTime(), lastData + 1000);
  const days = Math.max(1, Math.ceil((effectiveEnd - range.start.getTime()) / WH_DAY_MS));
  const perDay = agg.plays / days;
  const prevPerDay = prevAgg ? prevAgg.plays / Math.max(1, prevAgg.spanDays) : null;
  facts.push({
    value: perDay >= 10 ? formatCount(Math.round(perDay)) : perDay.toFixed(1),
    label: "plays a day",
    sub: prevPerDay !== null ? `vs ${prevPerDay >= 10 ? formatCount(Math.round(prevPerDay)) : prevPerDay.toFixed(1)} ${prevLabelFor(type)}` : `over ${whPlural(days, "day")}`,
  });

  let busiestKey = null;
  let busiest = 0;
  agg.dayCounts.forEach((c, k) => {
    if (c > busiest) {
      busiest = c;
      busiestKey = k;
    }
  });
  if (busiestKey) {
    const d = new Date(Math.floor(busiestKey / 10000), Math.floor((busiestKey % 10000) / 100) - 1, busiestKey % 100);
    facts.push({ value: formatCount(busiest), label: "plays on the busiest day", sub: (type === "week" || type === "month" ? WH_DAY_FMT : WH_LONG_DAY_FMT).format(d) });
  }

  facts.push({
    value: `${formatCount(agg.activeDays)}`,
    label: `of ${whPlural(days, "day")} with plays`,
    sub: prevAgg ? `vs ${formatCount(prevAgg.activeDays)} ${prevLabelFor(type)}` : "",
  });

  if (ctx.liked.size && agg.knownPlays) {
    const hours = agg.knownSeconds / 3600;
    facts.push({
      value: `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} h+`,
      label: "listening time",
      sub: `from the ${Math.round((agg.knownPlays / agg.plays) * 100)}% of plays with a known length`,
    });
  }

  return `<section class="wh-facts">${facts
    .map((f) => `<div class="wh-fact"><span class="wh-fact-value">${escapeHtml(f.value)}</span><span class="wh-fact-label">${escapeHtml(f.label)}</span><span class="wh-muted wh-small">${escapeHtml(f.sub || "")}</span></div>`)
    .join("")}</section>`;
}

function prevLabelFor(type) {
  return type === "all" ? "" : `last ${type}`;
}

function whLikesHtml(agg, ctx) {
  if (!ctx.liked.size) return "";
  const likedShare = agg.plays ? agg.likedPlays / agg.plays : 0;
  const notLiked = Array.from(agg.trackCounts.entries())
    .filter(([v]) => !ctx.liked.has(wh.data.videos[v].id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  let neverPlayed = 0;
  for (const v of state.videos) {
    if (!checkIfDeleted(v) && (!wh.musicOnly || v.is_music) && whPlaysFor(v.video_id) === 0) neverPlayed++;
  }
  const list = notLiked
    .map(([v, c]) => {
      const hv = wh.data.videos[v];
      return `<li><a class="wh-list-item" href="https://music.youtube.com/watch?v=${encodeURIComponent(hv.id)}" target="_blank" rel="noopener noreferrer"><img src="${whThumb(hv.id)}" alt="" loading="lazy" /><span class="wh-name">${escapeHtml(hv.title || "Removed video")}<span class="wh-muted"> · ${escapeHtml(cleanArtistName(hv.channel || ""))}</span></span><span class="wh-num">${formatCount(c)}</span></a></li>`;
    })
    .join("");
  return `<section class="wh-panel wh-likes">
    <header class="wh-panel-head"><span class="wh-card-title">Likes vs plays</span></header>
    <div class="wh-likes-stats">
      <div><span class="wh-fact-value">${Math.round(likedShare * 100)}%</span><span class="wh-fact-label">of plays were liked tracks</span></div>
      <div><span class="wh-fact-value">${formatCount(neverPlayed)}</span><span class="wh-fact-label">liked tracks never played</span>${
        neverPlayed ? `<button type="button" class="wh-link" data-wh-never>Show them</button>` : ""
      }</div>
    </div>
    ${list ? `<p class="wh-subhead">Played most, not liked</p><ol class="wh-list wh-list-thumbs">${list}</ol>` : ""}
  </section>`;
}

function whDecadeHtml(agg, ctx) {
  if (!ctx.liked.size) return "";
  const decades = new Map();
  let total = 0;
  for (const [v, c] of agg.trackCounts) {
    const lv = ctx.liked.get(wh.data.videos[v].id);
    if (!lv || !lv.published_at) continue;
    const y = getVideoYear(lv.published_at);
    if (!y || isNaN(y)) continue;
    const dec = Math.floor(y / 10) * 10;
    const cur = decades.get(dec) || { plays: 0, top: null, topC: 0 };
    cur.plays += c;
    if (c > cur.topC) {
      cur.topC = c;
      cur.top = v;
    }
    decades.set(dec, cur);
    total += c;
  }
  if (!decades.size) return "";
  const keys = Array.from(decades.keys()).sort((a, b) => a - b);
  const max = Math.max(...keys.map((k) => decades.get(k).plays));
  const best = keys.reduce((a, b) => (decades.get(b).plays > decades.get(a).plays ? b : a));
  const rows = keys
    .map((k) => {
      const d = decades.get(k);
      return `<div class="wh-fp-row"><span class="wh-fp-name">${k}s</span><span class="wh-fp-track"><span class="wh-fp-fill ${k === best ? "" : "wh-fill-soft"}" style="width:${(d.plays / max) * 100}%"></span></span><span class="wh-num">${formatCount(d.plays)}</span></div>`;
    })
    .join("");
  const top = decades.get(best).top;
  return `<section class="wh-panel wh-decades">
    <header class="wh-panel-head"><span class="wh-card-title">Music by decade</span><span class="wh-muted">${formatCount(total)} plays of liked tracks</span></header>
    ${rows}
    <p class="wh-muted wh-small">Top ${best}s track: ${escapeHtml(whTrackTitle(top))}</p>
  </section>`;
}

// --- Event wiring ---

function whFindInLibrary(videoId) {
  const idx = state.filteredVideos ? state.filteredVideos.findIndex((v) => v.video_id === videoId) : -1;
  return idx;
}

function whPlayFromInsights(videoId) {
  const idx = whFindInLibrary(videoId);
  if (idx >= 0) {
    playTrackByIndex(idx);
    return;
  }
  const i = wh.idToIdx.get(videoId);
  const hv = i !== undefined ? wh.data.videos[i] : null;
  const liked = whLikedMap().get(videoId);
  const title = (liked && liked.title) || (hv && hv.title) || "Unknown";
  const artist = (liked && liked.artist) || (hv && hv.channel) || "Unknown channel";
  const chId = (liked && liked.channel_id) || (hv && hv.channelId);
  playVideo(videoId, title, artist, whThumb(videoId), chId ? `https://music.youtube.com/channel/${encodeURIComponent(chId)}` : null, -1);
}

function whShowArtistInLibrary(name) {
  if (!state.videos || !state.videos.length) return;
  whCloseInsights();
  applySearchQuery(name);
}

function whSetupEvents() {
  const on = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  };

  // Entry points
  document.querySelectorAll("[data-wh-import]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      whOpenDialog("intro");
    }),
  );
  document.querySelectorAll("[data-wh-insights]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeAllPopovers?.();
      if (wh.insightsOpen) whCloseInsights();
      else whOpenInsights();
    }),
  );
  on("wh-settings-remove", "click", (e) => {
    e.preventDefault();
    closeAllPopovers?.();
    if (window.confirm("Remove your imported watch history from this browser?")) whRemove();
  });

  // Dialog
  const dlg = whDialog();
  const input = document.getElementById("wh-file-input");
  on("wh-choose", "click", () => input && input.click());
  on("wh-retry", "click", () => whShowDialogState("intro"));
  if (input) {
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      input.value = "";
      if (f) whImportFile(f);
    });
  }
  if (dlg) {
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg && !wh.importing) whCloseDialog();
      if (e.target.closest("[data-wh-close]") && !wh.importing) whCloseDialog();
    });
    dlg.addEventListener("cancel", (e) => {
      if (wh.importing) e.preventDefault();
    });
    const zone = document.getElementById("wh-dropzone");
    if (zone) {
      ["dragenter", "dragover"].forEach((ev) =>
        zone.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          zone.classList.add("wh-drag");
        }),
      );
      zone.addEventListener("dragleave", () => zone.classList.remove("wh-drag"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove("wh-drag");
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) whImportFile(f);
      });
      zone.addEventListener("click", (e) => {
        if (!e.target.closest("button") && input) input.click();
      });
    }
  }
  on("wh-done-library", "click", () => {
    whCloseDialog();
    if (wh.insightsOpen) whCloseInsights();
    state.sortBy = "plays-most";
    whSyncUi();
    filterVideos();
    render();
    window.scrollTo(0, 0);
  });
  on("wh-done-insights", "click", () => {
    whCloseDialog();
    wh.period.anchor = null;
    whOpenInsights();
  });

  // Filters popover toggle
  on("never-played-toggle", "change", (e) => {
    state.neverPlayedOnly = e.target.checked;
    updateFiltersUI();
    filterVideos();
    render();
  });

  // Insights controls
  const tabs = document.getElementById("insights-period-tabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-period]");
      if (!btn) return;
      wh.period.type = btn.dataset.period;
      whRenderInsights();
    });
  }
  const step = (n) => {
    const type = wh.period.type;
    if (type === "all") return;
    const range = whPeriodRange(type, wh.period.anchor);
    wh.period.anchor = whShift(type, range.start, n).getTime();
    whRenderInsights();
  };
  on("insights-prev", "click", () => step(-1));
  on("insights-next", "click", () => step(1));
  on("insights-music-toggle", "change", (e) => {
    wh.musicOnly = e.target.checked;
    whRenderInsights();
  });
  on("insights-close", "click", () => {
    if (history.state && history.state.insights) history.back();
    else whCloseInsights();
  });
  const body = document.getElementById("insights-body");
  if (body) {
    body.addEventListener("click", (e) => {
      const play = e.target.closest("[data-wh-play]");
      if (play) {
        whPlayFromInsights(play.dataset.whPlay);
        return;
      }
      const artist = e.target.closest("[data-wh-artist]");
      if (artist) {
        whShowArtistInLibrary(artist.dataset.whArtist);
        return;
      }
      if (e.target.closest("[data-wh-never]")) {
        whCloseInsights();
        state.neverPlayedOnly = true;
        applySearchQuery("");
        whSyncUi();
        filterVideos();
        render();
      }
    });
  }

  window.addEventListener("popstate", () => {
    if (location.hash === "#insights") {
      if (!wh.insightsOpen && whHasData()) whOpenInsights(false);
    } else if (wh.insightsOpen) {
      whCloseInsights(true);
    }
  });
}

whSetupEvents();
whLoadStored().then(() => {
  if (location.hash === "#insights" && whHasData()) whOpenInsights(false);
});

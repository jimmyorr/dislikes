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
  showPodcasts: true,
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
    await storeDelete(WH_ALBUMS_KEY);
    wh.albums = null;
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

// Podcasts and other talk shows reach the history as "YouTube Music" plays too, so they are split out
// by a heuristic: show-like channel names, episode-style titles ("Ep 12", "#379", "| Show Name"), and
// any channel where a good share of the videos look like episodes. "- Topic" channels and liked tracks
// marked as music are never talk.
const WH_TALK_TITLE = /\bpod(cast)?\b|\b(ep|eps|episode)\.?\s*#?\d+|[-|:]\s*#\d{2,}\s*$|\bpart (one|two|three|four|five|\d+):|'the daily'/i;
const WH_TALK_CHANNEL = /podcast|\bpod\b|\bradio(?!head)|\bnpr\b(?!\s*music)|\bthe .* show\b|freakonomics|\bcomedy\b/i;
const WH_TALK_HOST = /\swith\s[A-Z][a-z]+\s[A-Z]/; // "Offline with Jon Favreau"
const WH_MUSICY_TITLE = /sounds? like|lo-?fi|\bcover\b|instrumental|remix|\bost\b|slowed|reverb|playlist|\bmix\b|full album|tiny desk|concert/i;

function whIsTopic(channel) {
  return /\s-\sTopic$/.test(channel || "");
}

function whTitleEndsWithChannel(title, channel) {
  // "Bill Hader | SmartLess" on the SmartLess channel
  const c = (channel || "").trim().toLowerCase();
  const t = (title || "").trim().toLowerCase();
  return c.length > 2 && t.endsWith(c) && t.lastIndexOf("|") !== -1 && t.lastIndexOf("|") < t.length - c.length;
}

function whTalkFlags(liked) {
  const vids = wh.data.videos;
  const looksTalk = new Uint8Array(vids.length);
  const perChannel = new Map();
  for (let i = 0; i < vids.length; i++) {
    const { title, channel, channelId } = vids[i];
    if (whIsTopic(channel)) continue;
    const hit =
      WH_TALK_CHANNEL.test(channel || "") ||
      WH_TALK_HOST.test(channel || "") ||
      (!WH_MUSICY_TITLE.test(title || "") && (WH_TALK_TITLE.test(title || "") || whTitleEndsWithChannel(title, channel)));
    if (hit) looksTalk[i] = 1;
    if (channelId) {
      const c = perChannel.get(channelId) || { n: 0, hits: 0 };
      c.n++;
      c.hits += hit ? 1 : 0;
      perChannel.set(channelId, c);
    }
  }
  const talk = new Uint8Array(vids.length);
  for (let i = 0; i < vids.length; i++) {
    const v = vids[i];
    if (whIsTopic(v.channel)) continue;
    const lv = liked.get(v.id);
    if (lv && lv.is_music) continue;
    const c = v.channelId ? perChannel.get(v.channelId) : null;
    if (looksTalk[i] || (c && c.hits >= 2 && c.hits / c.n >= 0.25)) talk[i] = 1;
  }
  return talk;
}

function whMusicMask(liked, talk) {
  const vids = wh.data.videos;
  const mask = new Uint8Array(vids.length);
  for (let i = 0; i < vids.length; i++) {
    const lv = liked.get(vids[i].id);
    mask[i] = !talk[i] && (wh.data.music[i] || whIsTopic(vids[i].channel) || (lv && lv.is_music)) ? 1 : 0;
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

  const talkCounts = new Map();
  let talkPlays = 0;

  for (let k = lo; k < hi; k++) {
    const v = vi[k];
    if (ctx.talk[v] && !ctx.showTalk) continue;
    if (!light && ctx.talk[v]) {
      talkPlays++;
      talkCounts.set(v, (talkCounts.get(v) || 0) + 1);
    }
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
    if (ctx.liked.has(wh.data.videos[v].id)) likedPlays++;
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
    talkCounts,
    talkPlays,
    activeDays: activeDays.size,
    spanDays,
    hours,
    dayCounts,
    newArtists,
    newTrackPlays,
    likedPlays,
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
  const talk = whTalkFlags(liked);
  const ctx = { liked, talk, mask: whMusicMask(liked, talk), musicOnly: wh.musicOnly, showTalk: wh.showPodcasts };
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
  const podcastToggle = document.getElementById("insights-podcast-toggle");
  if (podcastToggle) podcastToggle.checked = wh.showPodcasts;
  const likesNote = document.getElementById("insights-likes-note");
  if (likesNote) likesNote.hidden = liked.size > 0;

  if (!agg.plays) {
    root.innerHTML = `<div class="wh-empty">No ${wh.musicOnly ? "music " : ""}plays in this period. Try another ${type === "all" ? "filter" : type}.</div>`;
    return;
  }

  const sections = [];
  sections.push(whHeroHtml(type, range, agg, prevAgg, prevLabel, prevFull));
  sections.push(`<div class="wh-cards">${whArtistsCard(agg, prevAgg, ctx)}${whAlbumsCard(agg, prevAgg, ctx)}${whTracksCard(agg, prevAgg, ctx)}${whPodcastsCard(agg, prevAgg)}</div>`);
  sections.push(`<div class="wh-row">${whClockHtml(agg)}${whFingerprintHtml(agg, typical, type)}</div>`);
  sections.push(whFactsHtml(type, range, agg, prevAgg, ctx));
  const decade = whDecadeHtml(agg, ctx);
  const likes = whLikesHtml(agg, ctx);
  if (decade || likes) sections.push(`<div class="wh-row">${likes}${decade}</div>`);
  root.innerHTML = sections.join("");
  if (!wh.albums) whLoadAlbumCache().then(() => wh.insightsOpen && whRenderInsights());
  else if (!wh.albumLookup.running && !wh.albumLookup.error) whLookupAlbums();
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

// Liked tracks per release (same artist + same release day), which is how the library sidebar infers albums
function whReleaseKey(lv) {
  if (!lv || !lv.published_at || !lv.artist || checkIfDeleted(lv)) return null;
  const artist = cleanArtistName(lv.artist);
  if (artist === "Music Library Uploads") return null;
  return `${artist}|${lv.published_at.split("T")[0]}`;
}

function whReleaseSizes(liked) {
  if (wh.releaseSizes && wh.releaseSizesFor === liked.size) return wh.releaseSizes;
  const sizes = new Map();
  for (const lv of liked.values()) {
    const key = whReleaseKey(lv);
    if (key) sizes.set(key, (sizes.get(key) || 0) + 1);
  }
  wh.releaseSizes = sizes;
  wh.releaseSizesFor = liked.size;
  return sizes;
}

// A release only counts as an album when the library has at least this many liked tracks from it
// (matches the sidebar), so singles and one-off likes don't show up as one-track "albums".
const WH_ALBUM_MIN_TRACKS = 3;

function whLikedAlbumsCard(agg, prevAgg, ctx, hint = "") {
  const sizes = whReleaseSizes(ctx.liked);
  const albumsOf = (a) => {
    const map = new Map();
    for (const [v, c] of a.trackCounts) {
      const lv = ctx.liked.get(wh.data.videos[v].id);
      const key = whReleaseKey(lv);
      if (!key || (sizes.get(key) || 0) < WH_ALBUM_MIN_TRACKS) continue;
      let cur = map.get(key);
      if (!cur) {
        cur = { artist: cleanArtistName(lv.artist), date: key.split("|")[1], year: getVideoYear(lv.published_at), plays: 0, tracks: 0, size: sizes.get(key), v, best: 0 };
        map.set(key, cur);
      }
      cur.plays += c;
      cur.tracks++;
      // Art comes from the album's most played track
      if (c > cur.best) {
        cur.best = c;
        cur.v = v;
      }
    }
    return map;
  };
  const albums = albumsOf(agg);
  if (!ctx.liked.size || !albums.size) {
    return `<section class="wh-card wh-card-albums"><header class="wh-card-head"><span class="wh-card-title">Albums</span></header><div class="wh-card-body"><p class="wh-muted">Albums come from your liked tracks: ${WH_ALBUM_MIN_TRACKS}+ liked tracks by one artist released the same day. ${
      ctx.liked.size ? "None were played in this period." : "Load your likes to see them."
    }</p></div></section>`;
  }
  const prevAlbums = prevAgg ? albumsOf(prevAgg) : null;
  const top = Array.from(albums.values())
    .sort((a, b) => b.plays - a.plays || b.tracks - a.tracks)
    .slice(0, 5);
  // Same artist twice in one year: show the full date so the rows can be told apart
  const yearClash = new Set();
  const seen = new Set();
  for (const a of albums.values()) {
    const k = `${a.artist}|${a.year}`;
    if (seen.has(k)) yearClash.add(k);
    seen.add(k);
  }
  const when = (a) => (yearClash.has(`${a.artist}|${a.year}`) ? a.date : a.year ? String(a.year) : "");
  const query = (a) => `${a.artist} ${when(a)}`.trim();
  const sub = (a) => `${whPlural(a.plays, "play")}, ${a.tracks} of ${whPlural(a.size, "liked track")}`;
  const thumb = (a) => whThumb(wh.data.videos[a.v].id);
  const f = top[0];
  const firstHtml = `<button type="button" class="wh-top" data-wh-artist="${escapeHtml(query(f))}" title="Show in library">
      <img src="${thumb(f)}" alt="" loading="lazy" />
      <span><span class="wh-top-rank">#1</span><span class="wh-top-name">${escapeHtml(f.artist)}</span><span class="wh-top-sub">${escapeHtml(when(f))}${when(f) ? " · " : ""}${sub(f)}</span></span>
    </button>`;
  const rest = whTopList(
    top.slice(1),
    (a, i) =>
      `<li><button type="button" class="wh-list-item" data-wh-artist="${escapeHtml(query(a))}" title="${escapeHtml(sub(a))}"><span class="wh-rank">${i + 2}</span><img src="${thumb(a)}" alt="" loading="lazy" /><span class="wh-name"><span class="wh-name-main">${escapeHtml(a.artist)}</span><span class="wh-name-sub">${escapeHtml(when(a))}${when(a) ? " · " : ""}${a.tracks} of ${a.size} tracks</span></span><span class="wh-num">${formatCount(a.plays)}</span></button></li>`,
  );
  return whCardShell(
    "wh-card-albums wh-card-art",
    "Albums",
    albums.size,
    prevAlbums ? prevAlbums.size : null,
    null,
    "",
    firstHtml,
    rest,
    `Albums you've liked ${WH_ALBUM_MIN_TRACKS}+ tracks from, matched by artist and release date.${hint ? ` ${hint}` : ""}`,
  );
}

// --- Album lookup ---
// Takeout has no album info, but "- Topic" art tracks name their album in the description. While signed
// in, look those up for played tracks (most played first, 50 per call) and keep them in IndexedDB.
const WH_ALBUMS_KEY = "watch_history_albums";
wh.albums = null; // Map videoId -> [album, releaseDate] or 0 (no album)
wh.albumLookup = { running: false, done: 0, total: 0, error: "" };

async function whLoadAlbumCache() {
  if (wh.albums) return;
  let raw = null;
  try {
    raw = await storeGet(WH_ALBUMS_KEY);
  } catch {
    /* ignore */
  }
  if (!wh.albums) wh.albums = new Map(raw && typeof raw === "object" ? Object.entries(raw) : []);
}

function whSaveAlbumCache() {
  if (!wh.albums) return;
  storeSet(WH_ALBUMS_KEY, Object.fromEntries(wh.albums)).catch(() => {});
}

function whAlbumPending() {
  if (!whHasData()) return [];
  const vids = wh.data.videos;
  const liked = whLikedMap();
  const todo = [];
  for (let i = 0; i < vids.length; i++) {
    if (!wh.plays[i] || !whIsTopic(vids[i].channel) || (wh.albums && wh.albums.has(vids[i].id))) continue;
    const lv = liked.get(vids[i].id);
    if (lv && lv.album) continue;
    todo.push(i);
  }
  return todo.sort((x, y) => wh.plays[y] - wh.plays[x]);
}

async function whLookupAlbums() {
  if (wh.albumLookup.running || !state.accessToken || !whHasData()) return;
  await whLoadAlbumCache();
  const todo = whAlbumPending();
  if (!todo.length) return;
  const vids = wh.data.videos;
  const run = (wh.albumLookup = { running: true, done: 0, total: todo.length, error: "" });
  const rerender = () => {
    if (wh.insightsOpen) whRenderInsights();
  };
  rerender();
  try {
    for (let s = 0; s < todo.length; s += 50) {
      if (!state.accessToken || !whHasData() || wh.data.videos !== vids) break;
      const ids = todo.slice(s, s + 50).map((i) => vids[i].id);
      const res = await youtubeApiGet("videos", { part: "snippet", id: ids.join(","), maxResults: 50, fields: "items(id,snippet/description)" });
      const seen = new Set();
      for (const item of res.items || []) {
        const info = parseArtTrackDescription(item.snippet?.description || "");
        wh.albums.set(item.id, info.album ? [info.album, info.date || ""] : 0);
        seen.add(item.id);
      }
      for (const id of ids) if (!seen.has(id)) wh.albums.set(id, 0); // removed videos
      run.done += ids.length;
      const batch = s / 50;
      if (batch % 10 === 9) whSaveAlbumCache();
      if (batch < 4 || batch % 8 === 7) rerender();
    }
  } catch (e) {
    console.warn("Album lookup stopped:", e);
    run.error = e && e.status === 401 ? "Sign in again to finish looking up albums." : "Album lookup stopped early. It picks up again next time.";
  } finally {
    run.running = false;
    whSaveAlbumCache();
    rerender();
  }
}

function whAlbumOf(v, ctx) {
  const id = wh.data.videos[v].id;
  const lv = ctx.liked.get(id);
  if (lv && lv.album) return { name: lv.album, date: lv.published_at ? lv.published_at.slice(0, 10) : "" };
  const c = wh.albums ? wh.albums.get(id) : null;
  return c ? { name: c[0], date: c[1] } : null;
}

const whNorm = (x) => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function whAlbumsCard(agg, prevAgg, ctx) {
  wh.likedCache = ctx.liked;
  const lookedUp = wh.albums && wh.albums.size > 0;
  const hasLikedAlbums = Array.from(ctx.liked.values()).some((lv) => lv.album);
  const L = wh.albumLookup;
  if (!lookedUp && !hasLikedAlbums && !L.running) {
    // Nothing looked up yet: fall back to albums inferred from likes
    return whLikedAlbumsCard(agg, prevAgg, ctx, state.accessToken ? "" : "Sign in to look up album names for everything you play.");
  }
  const albumsOf = (a) => {
    const map = new Map();
    for (const [v, c] of a.trackCounts) {
      const al = whAlbumOf(v, ctx);
      if (!al) continue;
      // A single's "album" is just the song again; leave those out
      if (whNorm(al.name) === whNorm(whTrackTitle(v))) continue;
      const key = `${wh.artistOf[v]}|${whNorm(al.name)}`;
      let cur = map.get(key);
      if (!cur) {
        cur = { name: al.name, artist: whTrackArtist(v), year: al.date ? al.date.slice(0, 4) : "", plays: 0, tracks: 0, v, best: 0 };
        map.set(key, cur);
      }
      cur.plays += c;
      cur.tracks++;
      if (c > cur.best) {
        cur.best = c;
        cur.v = v;
      }
    }
    return map;
  };
  const albums = albumsOf(agg);
  const progress = L.running ? `Looking up albums: ${formatCount(L.done)} of ${formatCount(L.total)} tracks.` : L.error;
  if (!albums.size) {
    return `<section class="wh-card wh-card-albums"><header class="wh-card-head"><span class="wh-card-title">Albums</span></header><div class="wh-card-body"><p class="wh-muted">${escapeHtml(
      progress || "No album tracks played in this period. Singles are left out.",
    )}</p></div></section>`;
  }
  const prevAlbums = prevAgg ? albumsOf(prevAgg) : null;
  const top = Array.from(albums.values())
    .sort((a, b) => b.plays - a.plays || b.tracks - a.tracks)
    .slice(0, 5);
  const meta = (a) => [a.artist, a.year].filter(Boolean).join(" · ");
  const thumb = (a) => whThumb(wh.data.videos[a.v].id);
  const f = top[0];
  const firstHtml = `<button type="button" class="wh-top" data-wh-artist="${escapeHtml(f.artist)}" title="Show ${escapeHtml(f.artist)} in library">
      <img src="${thumb(f)}" alt="" loading="lazy" />
      <span><span class="wh-top-rank">#1</span><span class="wh-top-name">${escapeHtml(f.name)}</span><span class="wh-top-sub">${escapeHtml(meta(f))}</span><span class="wh-top-sub">${whPlural(f.plays, "play")} across ${whPlural(f.tracks, "track")}</span></span>
    </button>`;
  const rest = whTopList(
    top.slice(1),
    (a, i) =>
      `<li><button type="button" class="wh-list-item" data-wh-artist="${escapeHtml(a.artist)}" title="${escapeHtml(`${whPlural(a.plays, "play")} across ${whPlural(a.tracks, "track")}`)}"><span class="wh-rank">${i + 2}</span><img src="${thumb(a)}" alt="" loading="lazy" /><span class="wh-name"><span class="wh-name-main">${escapeHtml(a.name)}</span><span class="wh-name-sub">${escapeHtml(meta(a))}</span></span><span class="wh-num">${formatCount(a.plays)}</span></button></li>`,
  );
  return whCardShell(
    "wh-card-albums wh-card-art",
    "Albums",
    albums.size,
    prevAlbums && !L.running ? prevAlbums.size : null,
    null,
    "",
    firstHtml,
    rest,
    progress || "Album names from YouTube. Singles are left out.",
  );
}

function whTrackTitle(v) {
  const hv = wh.data.videos[v];
  const lv = whLikedLookup(hv.id);
  return (lv && lv.title) || hv.title || "Removed video";
}

function whTrackArtist(v) {
  const hv = wh.data.videos[v];
  const lv = whLikedLookup(hv.id);
  const raw = (lv && lv.artist) || hv.channel || "";
  return cleanArtistName(raw).replace(/VEVO$/i, "").trim();
}

// "Artist - Song Title", unless the title already names the artist (typical of non-Topic uploads)
function whTrackLabel(v) {
  const title = whTrackTitle(v);
  const artist = whTrackArtist(v);
  if (!artist || / [-–—] /.test(title) || title.toLowerCase().includes(artist.toLowerCase())) return title;
  return `${artist} - ${title}`;
}

function whLikedLookup(id) {
  return state.mode === "like" && wh.likedCache ? wh.likedCache.get(id) : null;
}

function whTracksCard(agg, prevAgg, ctx) {
  wh.likedCache = ctx.liked;
  const top = Array.from(agg.trackCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const [v0, c0] = top[0];
  const hv0 = wh.data.videos[v0];
  const artist0 = whTrackArtist(v0);
  const firstHtml = `<button type="button" class="wh-top" data-wh-play="${escapeHtml(hv0.id)}">
      <img src="${whThumb(hv0.id)}" alt="" loading="lazy" />
      <span><span class="wh-top-rank">#1</span><span class="wh-top-name">${escapeHtml(whTrackTitle(v0))}</span><span class="wh-top-sub">${escapeHtml(artist0)}${artist0 ? ", " : ""}${whPlural(c0, "play")}</span></span>
    </button>`;
  const rest = whTopList(top.slice(1), ([v, c], i) => `<li><button type="button" class="wh-list-item" data-wh-play="${escapeHtml(wh.data.videos[v].id)}"><span class="wh-rank">${i + 2}</span><span class="wh-name">${escapeHtml(whTrackLabel(v))}</span><span class="wh-num">${formatCount(c)}</span></button></li>`);
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

// Podcasts and talk shows, grouped by show (channel). Always kept out of the music cards when "Music only" is on.
function whPodcastsCard(agg, prevAgg) {
  if (!agg.talkPlays) return "";
  const showsOf = (a) => {
    const map = new Map();
    for (const [v, c] of a.talkCounts) {
      const key = wh.artistOf[v];
      let cur = map.get(key);
      if (!cur) {
        cur = { name: cleanArtistName(wh.data.videos[v].channel || "Unknown show"), plays: 0, episodes: 0, v, best: 0 };
        map.set(key, cur);
      }
      cur.plays += c;
      cur.episodes++;
      if (c > cur.best) {
        cur.best = c;
        cur.v = v;
      }
    }
    return map;
  };
  const shows = showsOf(agg);
  const prevShows = prevAgg && prevAgg.talkCounts ? showsOf(prevAgg) : null;
  const top = Array.from(shows.values()).sort((a, b) => b.plays - a.plays).slice(0, 5);
  const f = top[0];
  const fid = wh.data.videos[f.v].id;
  const firstHtml = `<button type="button" class="wh-top" data-wh-play="${escapeHtml(fid)}" title="${escapeHtml(whTrackTitle(f.v))}">
      <img src="${whThumb(fid)}" alt="" loading="lazy" />
      <span><span class="wh-top-rank">#1</span><span class="wh-top-name">${escapeHtml(f.name)}</span><span class="wh-top-sub">${whPlural(f.plays, "play")}, ${whPlural(f.episodes, "episode")}</span></span>
    </button>`;
  const rest = whTopList(top.slice(1), (s, i) => {
    const id = wh.data.videos[s.v].id;
    return `<li><button type="button" class="wh-list-item" data-wh-play="${escapeHtml(id)}" title="${escapeHtml(whTrackTitle(s.v))}"><span class="wh-rank">${i + 2}</span><img src="${whThumb(id)}" alt="" loading="lazy" /><span class="wh-name">${escapeHtml(s.name)}</span><span class="wh-num">${formatCount(s.plays)}</span></button></li>`;
  });
  const note = wh.musicOnly ? `${whPlural(agg.talkPlays, "play")}, kept out of the music stats.` : `${whPlural(agg.talkPlays, "play")}, also counted above.`;
  return whCardShell("wh-card-podcasts wh-card-art", "Podcasts", shows.size, prevShows ? prevShows.size : null, null, "", firstHtml, rest, note);
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
      <span class="wh-fp-desc">${escapeHtml(desc)}</span>
    </div>`;
  }).join("");
  return `<section class="wh-panel wh-fingerprint">
    <header class="wh-panel-head"><span class="wh-card-title">Listening fingerprint</span></header>
    ${rows}
    <p class="wh-muted wh-small">${typical ? `Tick marks your typical ${type}.` : "Compared across your whole history."}<span class="wh-hover-only"> Hover a row for what it measures.</span></p>
  </section>`;
}

function whTypicalTrackSeconds(liked) {
  if (wh.typicalSecsFor === liked.size) return wh.typicalSecs;
  const secs = [];
  for (const lv of liked.values()) {
    if (!lv.is_music || !lv.duration) continue;
    const d = parseDuration(lv.duration);
    if (d > 30 && d < 20 * 60) secs.push(d);
  }
  secs.sort((a, b) => a - b);
  wh.typicalSecs = secs.length >= 20 ? secs[secs.length >> 1] : 0;
  wh.typicalSecsFor = liked.size;
  return wh.typicalSecs;
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

  // Lengths are only known for liked tracks, so estimate from a typical liked track's length
  const typical = whTypicalTrackSeconds(ctx.liked);
  const musicPlays = agg.plays - (ctx.musicOnly ? 0 : agg.talkPlays);
  if (typical && musicPlays > 0) {
    const hours = (musicPlays * typical) / 3600;
    const mins = Math.round(typical / 60);
    facts.push({
      value: `~${hours >= 10 ? formatCount(Math.round(hours)) : hours.toFixed(1)} h`,
      label: "of music, roughly",
      sub: `${whPlural(musicPlays, "play")} × ${mins} min, your typical liked track`,
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
    .filter(([v]) => !ctx.talk[v] && !ctx.liked.has(wh.data.videos[v].id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  // Likes go back much further than the history, so only tracks released after the history starts
  // could really have been played; older likes with no plays say nothing.
  const historyStart = wh.data.meta.first * 1000;
  let neverPlayed = 0;
  for (const v of state.videos) {
    if (checkIfDeleted(v) || (wh.musicOnly && !v.is_music) || !v.published_at) continue;
    if (Date.parse(v.published_at) >= historyStart && whPlaysFor(v.video_id) === 0) neverPlayed++;
  }
  let likedTracksPlayed = 0;
  for (const v of agg.trackCounts.keys()) if (ctx.liked.has(wh.data.videos[v].id)) likedTracksPlayed++;
  const list = notLiked
    .map(([v, c]) => {
      const hv = wh.data.videos[v];
      return `<li><a class="wh-list-item" href="https://music.youtube.com/watch?v=${encodeURIComponent(hv.id)}" target="_blank" rel="noopener noreferrer"><img src="${whThumb(hv.id)}" alt="" loading="lazy" /><span class="wh-name">${escapeHtml(whTrackLabel(v))}</span><span class="wh-num">${formatCount(c)}</span></a></li>`;
    })
    .join("");
  return `<section class="wh-panel wh-likes">
    <header class="wh-panel-head"><span class="wh-card-title">Likes vs plays</span></header>
    <div class="wh-likes-stats">
      <div><span class="wh-fact-value">${Math.round(likedShare * 100)}%</span><span class="wh-fact-label">of plays were liked tracks</span></div>
      <div><span class="wh-fact-value">${formatCount(likedTracksPlayed)}</span><span class="wh-fact-label">liked tracks played</span></div>
    </div>
    ${
      neverPlayed
        ? `<p class="wh-muted wh-small">${whPlural(neverPlayed, "liked track")} released since ${escapeHtml(WH_MONTH_FMT.format(new Date(historyStart)))}, when your history starts, ${neverPlayed === 1 ? "has" : "have"} no plays. <button type="button" class="wh-link" data-wh-never>Show all unplayed</button></p>`
        : ""
    }
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
  on("insights-podcast-toggle", "change", (e) => {
    wh.showPodcasts = e.target.checked;
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

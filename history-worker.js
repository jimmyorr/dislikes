// Parses a Google Takeout YouTube watch history (watch-history.json, or the Takeout .zip that
// contains it) off the main thread and returns a compact play index:
//   videos: one entry per distinct video (id, title, channel, channel id, music flag)
//   vi / t: parallel typed arrays, one entry per play (video index, unix seconds), oldest first
// The raw file is never stored; only this index is.

const REPEAT_WINDOW_S = 30; // the same video logged again within 30s counts as one play

self.onmessage = async (e) => {
  const { file } = e.data || {};
  try {
    if (!file) throw userError("No file was received.");
    progress("Reading file");
    const text = await readHistoryText(file);
    const result = parseHistoryText(text);
    self.postMessage({ type: "done", result }, [result.vi.buffer, result.t.buffer, result.music.buffer]);
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err && err.userMessage ? err.userMessage : "Couldn't read that file. Is it watch-history.json from Google Takeout?",
      detail: String((err && err.message) || err),
    });
  }
};

function progress(stage, done = 0, total = 0) {
  self.postMessage({ type: "progress", stage, done, total });
}

function userError(message) {
  const err = new Error(message);
  err.userMessage = message;
  return err;
}

async function readHistoryText(file) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!isZip) return await file.text();
  progress("Unzipping");
  return await extractWatchHistoryFromZip(file);
}

// --- Minimal zip reader: finds watch-history.json via the central directory and inflates it
// with the browser's own DecompressionStream, so no library is needed.
async function extractWatchHistoryFromZip(file) {
  const tailSize = Math.min(file.size, 65557 + 22);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw userError("That zip file looks damaged. Try unzipping it and importing watch-history.json.");

  let entries = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  // Zip64: the real values live in the zip64 end-of-central-directory record
  if (cdOffset === 0xffffffff || entries === 0xffff) {
    const locator = eocd - 20;
    if (locator >= 0 && tail.getUint32(locator, true) === 0x07064b50) {
      const z64Offset = Number(tail.getBigUint64(locator + 8, true));
      const z64 = new DataView(await file.slice(z64Offset, z64Offset + 56).arrayBuffer());
      entries = Number(z64.getBigUint64(32, true));
      cdSize = Number(z64.getBigUint64(40, true));
      cdOffset = Number(z64.getBigUint64(48, true));
    }
  }

  const cd = new DataView(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const decoder = new TextDecoder();
  let p = 0;
  let found = null;
  for (let n = 0; n < entries && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const method = cd.getUint16(p + 10, true);
    let compSize = cd.getUint32(p + 20, true);
    let uncompSize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOffset = cd.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(cd.buffer, p + 46, nameLen));

    // Zip64 extra field holds sizes/offset that overflowed 32 bits
    let q = p + 46 + nameLen;
    const extraEnd = q + extraLen;
    while (q + 4 <= extraEnd) {
      const id = cd.getUint16(q, true);
      const size = cd.getUint16(q + 2, true);
      if (id === 0x0001) {
        let r = q + 4;
        if (uncompSize === 0xffffffff) { uncompSize = Number(cd.getBigUint64(r, true)); r += 8; }
        if (compSize === 0xffffffff) { compSize = Number(cd.getBigUint64(r, true)); r += 8; }
        if (localOffset === 0xffffffff) { localOffset = Number(cd.getBigUint64(r, true)); }
      }
      q += 4 + size;
    }

    if (/(^|\/)watch-history\.json$/i.test(name)) {
      found = { name, method, compSize, localOffset };
      break;
    }
    if (/(^|\/)watch-history\.html$/i.test(name)) {
      found = found || { html: true };
    }
    p += 46 + nameLen + extraLen + commentLen;
  }

  if (!found || found.html) {
    throw userError(
      found && found.html
        ? "This export is in HTML. Export again with History set to JSON (see the steps)."
        : "No watch-history.json in this zip. Make sure YouTube history was included in the export.",
    );
  }

  const local = new DataView(await file.slice(found.localOffset, found.localOffset + 30).arrayBuffer());
  const dataStart = found.localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  const blob = file.slice(dataStart, dataStart + found.compSize);

  if (found.method === 0) return await blob.text();
  if (found.method !== 8 || typeof DecompressionStream === "undefined") {
    throw userError("This browser can't open that zip. Unzip it and import watch-history.json instead.");
  }
  const stream = blob.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

function extractVideoId(url) {
  // Only real video plays: youtube.com / music.youtube.com /watch?v=ID. Skips YouTube TV
  // (tv.youtube.com/watch/ID, not a video id), community posts and other activity.
  if (!url || url.indexOf("/watch?v") === -1) return null;
  const m = /[?&]v(?:=|\\u003d)([A-Za-z0-9_-]{11})/.exec(url);
  return m ? m[1] : null;
}

function parseHistoryText(text) {
  const trimmedStart = text.slice(0, 200).trimStart();
  if (trimmedStart.startsWith("<")) {
    throw userError("This is the HTML version of your history. Export again with History set to JSON (see the steps).");
  }
  progress("Parsing");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw userError("That file isn't valid JSON. Is it watch-history.json from Google Takeout?");
  }
  text = null;
  if (!Array.isArray(data) || (data.length && !data.some((d) => d && typeof d.time === "string" && "header" in d))) {
    throw userError("That doesn't look like a Takeout watch history. Look for watch-history.json in the export.");
  }
  // search-history.json has the same shape (and even some "Watched" ad entries), so check the mix
  let searched = 0;
  let watched = 0;
  for (const d of data) {
    const title = d && typeof d.title === "string" ? d.title : "";
    if (title.startsWith("Searched for")) searched++;
    else if (title.startsWith("Watched") && !Array.isArray(d.details)) watched++;
  }
  if (searched > watched) {
    throw userError("That's your search history. Import watch-history.json from the same folder instead.");
  }
  if (!watched) {
    throw userError("No plays found in that file. Look for watch-history.json in the export.");
  }

  const total = data.length;
  const idIndex = new Map();
  const ids = [];
  const titles = [];
  const channels = [];
  const channelIds = [];
  const musicFlags = [];
  const events = []; // [seconds, videoIndex]
  let skippedAds = 0;
  let skippedOther = 0;
  let musicPlays = 0;

  for (let i = 0; i < total; i++) {
    const e = data[i];
    if (i % 5000 === 0) progress("Reading plays", i, total);
    if (!e || typeof e !== "object") { skippedOther++; continue; }
    if (Array.isArray(e.details) && e.details.some((d) => d && /ads/i.test(d.name || ""))) {
      skippedAds++;
      continue;
    }
    const id = extractVideoId(e.titleUrl);
    const ts = Date.parse(e.time);
    if (!id || !Number.isFinite(ts)) { skippedOther++; continue; }

    const isMusic = e.header === "YouTube Music" || e.titleUrl.indexOf("music.youtube.com") !== -1;
    if (isMusic) musicPlays++;

    let vi = idIndex.get(id);
    if (vi === undefined) {
      vi = ids.length;
      idIndex.set(id, vi);
      ids.push(id);
      titles.push("");
      channels.push("");
      channelIds.push("");
      musicFlags.push(0);
    }
    // Takeout lists newest first, so the first title/channel seen is the most recent one.
    // Removed videos show their URL as the title; ignore that.
    if (!titles[vi] && typeof e.title === "string") {
      const t = e.title.replace(/^Watched\s+/, "");
      if (t && !/^https?:\/\//.test(t)) titles[vi] = t;
    }
    const sub = Array.isArray(e.subtitles) ? e.subtitles[0] : null;
    if (sub && !channels[vi]) {
      channels[vi] = sub.name || "";
      const cm = /\/channel\/([A-Za-z0-9_-]+)/.exec(sub.url || "");
      channelIds[vi] = cm ? cm[1] : "";
    }
    if (isMusic) musicFlags[vi] = 1;
    events.push(Math.floor(ts / 1000), vi);
  }
  data = null;

  progress("Indexing", total, total);
  const count = events.length / 2;
  const order = new Uint32Array(count);
  for (let k = 0; k < count; k++) order[k] = k;
  order.sort((a, b) => events[2 * a] - events[2 * b]);

  const t = new Uint32Array(count);
  const vi = new Uint32Array(count);
  const lastSeen = new Float64Array(ids.length).fill(-Infinity);
  let n = 0;
  let collapsed = 0;
  for (let k = 0; k < count; k++) {
    const s = events[2 * order[k]];
    const v = events[2 * order[k] + 1];
    if (s - lastSeen[v] < REPEAT_WINDOW_S) {
      collapsed++;
      continue;
    }
    lastSeen[v] = s;
    t[n] = s;
    vi[n] = v;
    n++;
  }

  const videos = ids.map((id, k) => ({
    id,
    title: titles[k],
    channel: channels[k],
    channelId: channelIds[k],
  }));

  return {
    version: 1,
    videos,
    music: Uint8Array.from(musicFlags),
    t: t.slice(0, n),
    vi: vi.slice(0, n),
    meta: {
      importedAt: Date.now(),
      entries: total,
      plays: n,
      distinct: ids.length,
      musicPlays,
      skippedAds,
      skippedOther,
      collapsed,
      first: n ? t[0] : null,
      last: n ? t[n - 1] : null,
    },
  };
}

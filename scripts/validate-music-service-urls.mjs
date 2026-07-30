import { readFile } from "node:fs/promises";

const playlistSource = await readFile(
  new URL("../playlist.js", import.meta.url),
  "utf8",
);
const playlistModule = await import(
  `data:text/javascript;charset=utf-8,${encodeURIComponent(playlistSource)}`
);
const activeTracks = playlistModule.playlist.filter((track) => !track.disabled);
const errors = [];
const seen = {
  appleMusicUrl: new Map(),
  spotifyUrl: new Map(),
};

function validateUrl(track, key, host, pathPattern) {
  const raw = track[key];
  if (typeof raw !== "string" || !raw.trim()) {
    errors.push(`${track.title}: ${key} is missing`);
    return;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    errors.push(`${track.title}: ${key} is not a valid URL`);
    return;
  }
  if (url.protocol !== "https:" || url.hostname !== host) {
    errors.push(`${track.title}: ${key} must use https://${host}`);
  }
  if (!pathPattern.test(url.pathname)) {
    errors.push(`${track.title}: ${key} has an invalid path`);
  }
  if (url.hostname === "big-up.style" || /big-up\.style/i.test(raw)) {
    errors.push(`${track.title}: ${key} points to BIG UP!`);
  }
  const previousTitle = seen[key].get(raw);
  if (previousTitle && previousTitle !== track.title) {
    errors.push(`${track.title}: ${key} duplicates ${previousTitle}`);
  } else {
    seen[key].set(raw, track.title);
  }
}

for (const track of activeTracks) {
  validateUrl(track, "appleMusicUrl", "music.apple.com", /^\/jp\/album\//);
  validateUrl(track, "spotifyUrl", "open.spotify.com", /^\/track\/[^/]+$/);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${activeTracks.length} active tracks.`);
}

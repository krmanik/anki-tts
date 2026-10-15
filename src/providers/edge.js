import { playAudio } from "../player.js";
// Loaded lazily via dynamic ESM import, same as the original anki_tts.js.
let ttsInstance = null;
let edgeVoices = null;
const EDGE_TTS_LIB_URL = "https://cdn.jsdelivr.net/npm/edge-tts-browser@latest/+esm";
async function loadLib() {
    return import(/* @vite-ignore */ EDGE_TTS_LIB_URL);
}
let initPromise = null;
export function initEdgeTts() {
    if (edgeVoices)
        return Promise.resolve(true);
    if (!initPromise) {
        initPromise = (async () => {
            try {
                console.log("Loading Edge TTS…");
                const { default: EdgeTtsBrowser } = await loadLib();
                ttsInstance = new EdgeTtsBrowser();
                edgeVoices = await EdgeTtsBrowser.getVoices();
                console.log("Edge TTS ready:", edgeVoices?.length, "voices");
                return true;
            }
            catch (error) {
                console.error("Failed to initialize Edge TTS:", error);
                initPromise = null;
                return false;
            }
        })();
    }
    return initPromise;
}
export function getEdgeVoices() {
    return edgeVoices;
}
// Microsoft's Edge TTS endpoints only accept websocket connections from the real Microsoft
// Edge browser (verified: identical request 403s from Chrome, succeeds from Edge). Browsers
// forbid JS from overriding the User-Agent header used for that check, so it can't be worked
// around from this file directly. Instead a relay (local Node process, see
// relay-ts/edge-tts-relay.ts, or a hosted Cloudflare Worker, see worker/) makes the same
// connection from outside the browser sandbox, where custom headers are legal.
// We try that relay first and only fall back to the direct in-browser connection (which only
// works in real Edge) if it isn't reachable. URL/token are configurable in Settings so a
// hosted worker can be used instead of the local default.
const RELAY_BASE_DEFAULT = "http://127.0.0.1:8811";
let relayAvailable = null;
let relayCheckedUrl = "";
function getRelayConfig() {
    return {
        url: (localStorage.getItem("ttsRelayUrl") || RELAY_BASE_DEFAULT).replace(/\/+$/, ""),
        token: localStorage.getItem("ttsRelayToken") || ""
    };
}
function relayHeaders(token) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}
function checkRelay() {
    const { url, token } = getRelayConfig();
    if (!relayAvailable || relayCheckedUrl !== url) {
        relayCheckedUrl = url;
        relayAvailable = fetch(`${url}/health`, { headers: relayHeaders(token), signal: AbortSignal.timeout(1500) })
            .then(res => res.ok)
            .catch(() => false)
            .then(ok => {
            console.log(ok ? "Edge TTS relay detected at " + url : "Edge TTS relay not running — using direct connection (real Microsoft Edge only)");
            return ok;
        });
    }
    return relayAvailable;
}
async function playViaRelay(text, voice) {
    const { url, token } = getRelayConfig();
    const params = new URLSearchParams({ text, voice });
    const res = await fetch(`${url}/tts?${params}`, { headers: relayHeaders(token) });
    if (!res.ok)
        throw new Error(`Edge TTS relay error: ${await res.text()}`);
    console.log("Playing audio");
    await playAudio(await res.blob());
}
async function playDirect(text, voice) {
    if (!ttsInstance && !(await initEdgeTts())) {
        throw new Error("Failed to initialize Edge TTS");
    }
    ttsInstance.tts.setVoiceParams({ text, voice });
    const fileName = `tts-output-${crypto.randomUUID()}-${ttsInstance.tts.fileType.ext}`;
    let blob;
    try {
        blob = await ttsInstance.ttsToFile(fileName);
    }
    catch (error) {
        console.error("Edge TTS websocket failed:", error);
        throw new Error("Edge TTS only works in the real Microsoft Edge browser, or with the local relay " +
            "running (npm run relay). Microsoft's server rejects this connection from Chrome, " +
            "Firefox, Safari, and Anki's own review window otherwise. Switch to the Piper engine " +
            "in Settings (offline, works everywhere) as another option.");
    }
    console.log("Playing audio");
    await playAudio(blob);
}
export async function edgeTtsPlay(text, voice = "zh-CN-XiaoxiaoNeural") {
    if (!text || !text.trim()) {
        console.warn("No text provided for TTS");
        return;
    }
    const trimmed = text.trim();
    console.log("edgeTtsPlay:", voice, JSON.stringify(trimmed));
    if (await checkRelay()) {
        await playViaRelay(trimmed, voice);
    }
    else {
        await playDirect(trimmed, voice);
    }
}

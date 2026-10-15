/**
 * Cloudflare Worker version of the Edge TTS relay (see ../../relay-ts/edge-tts-relay.ts for
 * the Node/localhost version - same protocol, same header spoofing, different runtime).
 *
 * Microsoft's Edge TTS endpoints only accept websocket connections from the real Microsoft Edge
 * browser, checked server-side via the User-Agent header. Browser JS can never set that header
 * (Fetch/WebSocket spec forbids it) - but Workers' fetch() isn't a browser page, so it isn't
 * subject to that restriction, same as Node. Cloudflare's outbound-websocket pattern is
 * fetch(url, {headers}) -> response.webSocket -> .accept(), instead of `new WebSocket()`.
 *
 * Free tier (100k requests/day, no credit card) is easily enough for personal TTS use, always
 * warm (no cold-start sleep), and gives HTTPS on a *.workers.dev subdomain automatically.
 *
 * Every request except /health requires RELAY_TOKEN (set via `wrangler secret put
 * RELAY_TOKEN`) - without this, anyone who finds the URL can burn your Microsoft rate limit.
 */

export interface Env {
  RELAY_TOKEN: string;
}

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const BASE_URL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
// Workers' fetch() only accepts http(s) schemes, even for an outbound websocket upgrade -
// the Upgrade header below is what actually switches the protocol, not the URL scheme
// (unlike Node's `ws`, which wants a real wss:// URL).
// In October 2026, Microsoft began requiring Sec-MS-GEC v2 tokens on speech.platform.bing.com,
// causing synthesis requests using legacy v1 tokens to fail with HTTP 403.
// This workaround routes synthesis through api.msedgeservices.com, which currently still
// accepts legacy v1 tokens when passed via Ocp-Apim-Subscription-Key (undocumented compatibility).
// NOTE: This Cloudflare Worker route relies on this undocumented behavior and has not been
// verified on Cloudflare's edge runtime.
// The voice list continues to be served by the legacy host.
const WSS_URL =
  "https://api.msedgeservices.com/tts/cognitiveservices/websocket/v1" +
  `?Ocp-Apim-Subscription-Key=${TRUSTED_CLIENT_TOKEN}`;
const VOICE_LIST_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
const WIN_EPOCH = 11644473600;

// Must track a recent real Chromium/Edge release - Microsoft's WAF rejects implausibly old
// version strings (this is what actually 403s edge-tts-browser's stale hardcoded 130.x).
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

function connectId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// Same algorithm as the Node relay: SHA-256 of the current time, rounded down to a 5-minute
// window in Windows file-time ticks, concatenated with the trusted token.
async function generateSecMsGec(): Promise<string> {
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  const ticksHns = Math.floor((ticks * 1e9) / 100);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ticksHns}${TRUSTED_CLIENT_TOKEN}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function dateToString(): string {
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

function ssmlMessage(requestId: string, voice: string, pitch: string, rate: string, volume: string, text: string): string {
  const ssml =
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${text}</prosody>` +
    "</voice></speak>";
  return `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${dateToString()}Z\r\nPath:ssml\r\n\r\n${ssml}`;
}

function commandMessage(): string {
  return (
    `X-Timestamp:${dateToString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,` +
    `"wordBoundaryEnabled":false},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
  );
}

function parseHeaderText(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i)] = line.slice(i + 1);
  }
  return headers;
}

interface SynthesizeParams {
  text: string;
  voice: string;
  pitch: string;
  rate: string;
  volume: string;
}

async function synthesize({ text, voice, pitch, rate, volume }: SynthesizeParams): Promise<ArrayBuffer> {
  const wsUrl =
    `${WSS_URL}&Sec-MS-GEC=${await generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
    `&ConnectionId=${connectId()}`;

  // Header content and order both matter here - both were tuned against the live endpoint.
  const upstream = await fetch(wsUrl, {
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "Sec-WebSocket-Version": "13",
      "User-Agent": USER_AGENT,
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: `muid=${crypto.randomUUID().replace(/-/g, "").toUpperCase()};`,
      Upgrade: "websocket"
    }
  });

  const ws = upstream.webSocket;
  if (!ws) throw new Error(`Upstream refused websocket upgrade (HTTP ${upstream.status})`);
  ws.accept();
  // Workers' WebSocket defaults to delivering binary frames as Blob (browser default), not
  // ArrayBuffer - without this, `new Uint8Array(blob)` silently produces garbage instead of
  // throwing, so audio frames looked like they never arrived at all.
  ws.binaryType = "arraybuffer";

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let gotAudio = false;
    const timeout = setTimeout(() => { ws.close(); reject(new Error("Relay: timed out")); }, 20000);

    ws.addEventListener("message", event => {
      (async () => {
        try {
          if (typeof event.data === "string") {
            // Don't close the instant turn.end arrives - audio frames sent just before it may
            // still be queued for delivery. Give them a short grace window first.
            if (parseHeaderText(event.data).Path === "turn.end") setTimeout(() => ws.close(1000), 300);
            return;
          }
          const raw = event.data as ArrayBuffer | Blob;
          const buf = new Uint8Array(raw instanceof Blob ? await raw.arrayBuffer() : raw);
          if (buf.length < 2) return;
          const headerLength = (buf[0] << 8) | buf[1];
          const headers = parseHeaderText(new TextDecoder().decode(buf.subarray(2, 2 + headerLength)));
          const payload = buf.subarray(2 + headerLength);
          if (headers.Path !== "audio") return;
          if (payload.length) { chunks.push(payload); gotAudio = true; }
        } catch {
          // Ignore malformed frames; a fully failed synthesis surfaces via gotAudio below.
        }
      })();
    });

    ws.addEventListener("close", event => {
      clearTimeout(timeout);
      if (!gotAudio) {
        return reject(new Error(`Relay: no audio received (upstream closed: code=${event.code})`));
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      resolve(out.buffer);
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Relay: upstream websocket error"));
    });

    ws.send(commandMessage());
    ws.send(ssmlMessage(connectId(), voice, pitch, rate, volume, text));
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/health") return new Response("ok", { headers: CORS });

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("token");
    if (!env.RELAY_TOKEN || token !== env.RELAY_TOKEN) {
      return new Response("Unauthorized", { status: 401, headers: CORS });
    }

    if (url.pathname === "/voices") {
      const upstream = await fetch(VOICE_LIST_URL, { headers: { "User-Agent": USER_AGENT } });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/tts") {
      const text = url.searchParams.get("text");
      if (!text) return new Response("Missing ?text=", { status: 400, headers: CORS });
      try {
        const audio = await synthesize({
          text,
          voice: url.searchParams.get("voice") || "en-US-GuyNeural",
          pitch: url.searchParams.get("pitch") || "+0Hz",
          rate: url.searchParams.get("rate") || "+0%",
          volume: url.searchParams.get("volume") || "+0%"
        });
        return new Response(audio, { headers: { ...CORS, "Content-Type": "audio/mpeg" } });
      } catch (error) {
        return new Response(error instanceof Error ? error.message : String(error), { status: 502, headers: CORS });
      }
    }

    return new Response("Not found", { status: 404, headers: CORS });
  }
};

/**
 * Local relay for the Edge TTS engine.
 *
 * speech.platform.bing.com only accepts its websocket connection from the real Microsoft
 * Edge browser, checked server-side via the User-Agent header. Browser JS is forbidden from
 * setting that header (Fetch/WebSocket spec), so this can never work from Chrome/Firefox/
 * Safari, or from Anki's own review window, no matter what the client-side library does.
 *
 * This relay makes the connection from a process that isn't sandboxed like a browser tab,
 * where custom headers are legal. It runs on your machine, listens on localhost only, and
 * the card template's JS (src-ts/providers/edge.ts) tries it first, falling back to the
 * direct in-browser connection (real Edge only) if this isn't running.
 *
 * Run: npm run relay   (after npm run build:relay)
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import WebSocket from "ws";
import { generateSecMsGecV2 } from "../scripts/drm.js";

// Not 8765 - that's AnkiConnect's well-known default port.
const PORT = Number(process.argv[2] || process.env.PORT || 8811);

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const BASE_URL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const VOICE_LIST_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

// Must track a recent real Chromium/Edge release - Microsoft's WAF appears to reject
// implausibly old version strings (the edge-tts-browser JS library's stale hardcoded 130.x
// is exactly why it 403s).
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

function connectId(): string {
  return randomUUID().replace(/-/g, "");
}

function buildWebSocketUrl(): string {
  return `${WSS_URL}&Sec-MS-GEC=${generateSecMsGecV2(TRUSTED_CLIENT_TOKEN)}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectId()}`;
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

function synthesize({ text, voice, pitch, rate, volume }: SynthesizeParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let gotAudio = false;
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error("Edge TTS relay: timed out")); }, 20000);

    // Header content and order both matter here - both were tuned against the live endpoint.
    const ws = new WebSocket(buildWebSocketUrl(), {
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Sec-WebSocket-Version": "13",
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: `muid=${randomUUID().replace(/-/g, "").toUpperCase()};`
      }
    });

    ws.on("open", () => {
      ws.send(commandMessage());
      ws.send(ssmlMessage(connectId(), voice, pitch, rate, volume, text));
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const buf = data as Buffer;
        if (buf.length < 2) return;
        const headerLength = buf.readUInt16BE(0);
        const headerText = buf.subarray(2, 2 + headerLength).toString("utf-8");
        const headers = parseHeaderText(headerText);
        if (headers.Path !== "audio") return;
        const payload = buf.subarray(2 + headerLength);
        if (payload.length) { chunks.push(Buffer.from(payload)); gotAudio = true; }
      } else {
        const headers = parseHeaderText(data.toString("utf-8"));
        if (headers.Path === "turn.end") ws.close();
      }
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      if (!gotAudio) reject(new Error("Edge TTS relay: no audio received (upstream rejected the request)"));
      else resolve(Buffer.concat(chunks));
    });

    ws.on("error", err => {
      clearTimeout(timeout);
      reject(new Error(`Edge TTS relay: upstream websocket error: ${err.message}`));
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }

  if (url.pathname === "/voices") {
    try {
      const upstream = await fetch(VOICE_LIST_URL, { headers: { "User-Agent": USER_AGENT } });
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      return res.end(String(error));
    }
  }

  if (url.pathname === "/tts") {
    const text = url.searchParams.get("text");
    if (!text) { res.writeHead(400); return res.end("Missing ?text="); }
    try {
      const audio = await synthesize({
        text,
        voice: url.searchParams.get("voice") || "en-US-GuyNeural",
        pitch: url.searchParams.get("pitch") || "+0Hz",
        rate: url.searchParams.get("rate") || "+0%",
        volume: url.searchParams.get("volume") || "+0%"
      });
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length });
      return res.end(audio);
    } catch (error) {
      console.error(error);
      res.writeHead(502, { "Content-Type": "text/plain" });
      return res.end(error instanceof Error ? error.message : String(error));
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Edge TTS relay listening on http://127.0.0.1:${PORT}`);
  console.log("The card template's Edge engine will use this automatically while it's running.");
});

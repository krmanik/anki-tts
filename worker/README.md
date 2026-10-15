# Edge TTS relay - Cloudflare Worker

Same job as `../relay-ts/edge-tts-relay.ts` (the Node/localhost version): connects to
Microsoft's Edge TTS endpoints with headers spoofed to look like real Microsoft Edge, which
Microsoft's server only accepts from outside a browser sandbox. Hosted here instead of on
your own machine, so it's always on without needing `npm run relay` running.

Free tier (100k requests/day, no credit card) comfortably covers personal TTS use, always
warm (no cold-start sleep), free HTTPS on a `*.workers.dev` subdomain.

> [!NOTE]
> This worker routes speech synthesis through `api.msedgeservices.com`, relying on its undocumented acceptance of legacy v1 tokens with `Ocp-Apim-Subscription-Key`. Note that this Worker deployment path has not been verified live from Cloudflare's edge runtime.

## Setup (one-time)

```bash
cd worker
npm install
npx wrangler login          # opens your browser, no credit card needed
```

Generate a random token and store it as a secret (never goes in the repo):

```bash
openssl rand -hex 32
npx wrangler secret put RELAY_TOKEN
# paste the generated value when prompted
```

## Test for real before deploying

Local `wrangler dev` (default) **cannot** test this - its local simulator (Miniflare)
doesn't support the outbound-websocket-via-fetch pattern this relies on, so `/tts` will
always fail locally with "Fetch API cannot load: wss://...". Use `--remote` instead, which
runs your Worker on Cloudflare's real edge:

```bash
npx wrangler dev --remote
```

Then, in another terminal:

```bash
curl http://localhost:8787/health
curl "http://localhost:8787/tts?text=Hello&voice=en-US-GuyNeural&token=<your RELAY_TOKEN>" -o test.mp3
file test.mp3   # should say "MPEG ADTS, layer III..."
```

## Deploy

```bash
npx wrangler deploy
```

Prints your live URL: `https://anki-tts-edge-relay.<your-subdomain>.workers.dev`. Test the
same way as above against that URL instead of localhost.

## Use it in Anki

In the card template's Settings panel (gear icon → Microsoft Edge engine), fill in:

- **Relay URL**: your deployed `https://anki-tts-edge-relay.<your-subdomain>.workers.dev`
- **Relay Token**: the same value you set via `wrangler secret put RELAY_TOKEN`

Both are stored in the browser's `localStorage`, so they persist across cards and Anki
restarts. Leave both blank to use the local relay (`http://127.0.0.1:8811`) instead - that's
still the default if nothing is set here.

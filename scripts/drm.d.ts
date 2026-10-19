/**
 * Sec-MS-GEC v2 token generator for Microsoft Edge TTS.
 *
 * Reverse-engineered from Microsoft Edge 155+ (see upstream rany2/edge-tts#492).
 * In October 2026, speech.platform.bing.com started requiring v2 tokens
 * formatted as "<16 hex CS64 checksum>-<64 hex modified SHA256>".
 */
/**
 * Generates a v2 Sec-MS-GEC token.
 * Output format: "<16 hex CS64>-<64 hex SHA256>".
 */
export declare function generateSecMsGecV2(trustedToken: string, unixTimestamp?: number): string;

/**
 * Sec-MS-GEC v2 token generator for Microsoft Edge TTS.
 *
 * Reverse-engineered from Microsoft Edge 155+ (see upstream rany2/edge-tts#492).
 * In October 2026, speech.platform.bing.com started requiring v2 tokens
 * formatted as "<16 hex CS64 checksum>-<64 hex modified SHA256>".
 */

const WIN_EPOCH = 11644473600;

const _SHA256_INITIAL: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19
];

const _SHA256_STATE: readonly number[] = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab,
  0xfeb0a7e4, 0x03effbd2
];

const _SHA256_SCHEDULE: readonly number[] = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491,
  0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564
];

const _SHA256_ROUND_CONSTANTS: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const _SHA256_ADJUSTMENT = 0xc9dc06a7;
const _SHA256_BLOCK_CONSTANTS: readonly number[] = [
  ..._SHA256_ROUND_CONSTANTS.slice(0, 14),
  _SHA256_ADJUSTMENT,
  ..._SHA256_ROUND_CONSTANTS.slice(15)
];
const _SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80;
const _SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0;

const _CS64_COEFFICIENTS: ReadonlyArray<readonly [number, number]> = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167]
];
const _CS64_FACTOR = 0x82893933;
const _CS64_ADJUSTMENT0 = 0xf2f90b1a;
const _CS64_ADJUSTMENT1 = 0x0b1a0000;

function rol16(value: number): number {
  const v = value >>> 0;
  return ((v << 16) | (v >>> 16)) >>> 0;
}

function sigma0(value: number): number {
  const v = value >>> 0;
  return ((v >>> 7) ^ (v << 25) ^ (v >>> 18) ^ (v << 14) ^ (v >>> 3)) >>> 0;
}

function sigma1(value: number): number {
  const v = value >>> 0;
  return ((v >>> 17) ^ (v << 15) ^ (v >>> 19) ^ (v << 13) ^ (v >>> 10)) >>> 0;
}

function sha256Rounds(
  state: readonly number[],
  words: readonly number[],
  firstRound = 0
): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants =
    firstRound === 14 ? _SHA256_BLOCK_CONSTANTS : _SHA256_ROUND_CONSTANTS;
  const aligned = Math.min(64, Math.floor((firstRound + 7) / 8) * 8);

  for (let index = firstRound; index < aligned; index++) {
    const rotE = BigInt(e) * 0x100000001n;
    const rotA = BigInt(a) * 0x100000001n;
    const t1 = Number(
      (BigInt(h) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(g ^ (e & (f ^ g))) +
        BigInt(constants[index]) +
        BigInt(words[index])) &
        0xffffffffn
    );
    const t2 = Number(
      (((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((a & b) | (c & (a | b)))) &
        0xffffffffn
    );
    [a, b, c, d, e, f, g, h] = [
      (t1 + t2) >>> 0,
      a,
      b,
      c,
      (d + t1) >>> 0,
      e,
      f,
      g
    ];
  }

  for (let index = aligned; index < 64; index += 8) {
    let rotE = BigInt(e) * 0x100000001n;
    let rotA = BigInt(a) * 0x100000001n;
    let t1 = Number(
      (BigInt(h) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(g ^ (e & (f ^ g))) +
        BigInt(constants[index]) +
        BigInt(words[index])) &
        0xffffffffn
    );
    d = (d + t1) >>> 0;
    h = Number(
      (BigInt(t1) +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((a & b) | (c & (a | b)))) &
        0xffffffffn
    );

    rotE = BigInt(d) * 0x100000001n;
    rotA = BigInt(h) * 0x100000001n;
    t1 = Number(
      (BigInt(g) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(f ^ (d & (e ^ f))) +
        BigInt(constants[index + 1]) +
        BigInt(words[index + 1])) &
        0xffffffffn
    );
    c = (c + t1) >>> 0;
    g = Number(
      (BigInt(t1) +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((h & a) | (b & (h | a)))) &
        0xffffffffn
    );

    rotE = BigInt(c) * 0x100000001n;
    rotA = BigInt(g) * 0x100000001n;
    t1 = Number(
      (BigInt(f) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(e ^ (c & (d ^ e))) +
        BigInt(constants[index + 2]) +
        BigInt(words[index + 2])) &
        0xffffffffn
    );
    b = (b + t1) >>> 0;
    f = Number(
      (BigInt(t1) +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((g & h) | (a & (g | h)))) &
        0xffffffffn
    );

    rotE = BigInt(b) * 0x100000001n;
    rotA = BigInt(f) * 0x100000001n;
    t1 = Number(
      (BigInt(e) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(d ^ (b & (c ^ d))) +
        BigInt(constants[index + 3]) +
        BigInt(words[index + 3])) &
        0xffffffffn
    );
    a = (a + t1) >>> 0;
    e = Number(
      (BigInt(t1) +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((f & g) | (h & (f | g)))) &
        0xffffffffn
    );

    rotE = BigInt(a) * 0x100000001n;
    rotA = BigInt(e) * 0x100000001n;
    t1 = Number(
      (BigInt(d) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(c ^ (a & (b ^ c))) +
        BigInt(constants[index + 4]) +
        BigInt(words[index + 4])) &
        0xffffffffn
    );
    h = (h + t1) >>> 0;
    d = Number(
      (BigInt(t1) +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((e & f) | (g & (e | f)))) &
        0xffffffffn
    );

    rotE = BigInt(h) * 0x100000001n;
    rotA = BigInt(d) * 0x100000001n;
    t1 = Number(
      (BigInt(c) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(b ^ (h & (a ^ b))) +
        BigInt(constants[index + 5]) +
        BigInt(words[index + 5])) &
        0xffffffffn
    );
    g = (g + t1) >>> 0;
    c = Number(
      (BigInt(t1) +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((d & e) | (f & (d | e)))) &
        0xffffffffn
    );

    rotE = BigInt(g) * 0x100000001n;
    rotA = BigInt(c) * 0x100000001n;
    t1 = Number(
      (BigInt(b) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(a ^ (g & (h ^ a))) +
        BigInt(constants[index + 6]) +
        BigInt(words[index + 6])) &
        0xffffffffn
    );
    f = (f + t1) >>> 0;
    b = Number(
      (BigInt(t1) +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((c & d) | (e & (c | d)))) &
        0xffffffffn
    );

    rotE = BigInt(f) * 0x100000001n;
    rotA = BigInt(b) * 0x100000001n;
    t1 = Number(
      (BigInt(a) +
        ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
        BigInt(h ^ (f & (g ^ h))) +
        BigInt(constants[index + 7]) +
        BigInt(words[index + 7])) &
        0xffffffffn
    );
    e = (e + t1) >>> 0;
    a = Number(
      (BigInt(t1) +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        BigInt((b & c) | (d & (b | c)))) &
        0xffffffffn
    );
  }

  return [a, b, c, d, e, f, g, h];
}

function expandSchedule(words: number[], firstWord = 16): void {
  for (let index = firstWord; index < 64; index++) {
    const x = words[index - 2];
    const y = words[index - 15];
    words.push(
      (sigma1(x) + words[index - 7] + sigma0(y) + words[index - 16]) >>> 0
    );
  }
}

function sha256Init(data: Uint8Array): number[] {
  const words: number[] = new Array(14).fill(0);
  words.push((data[0] << 16) | (data[1] << 8) | data[2]);
  words.push((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]);

  for (let index = 16; index < 30; index++) {
    let value = _SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      value +=
        index === 16
          ? sigma1(words[index - 2]) ^ _SHA256_SIGMA1_ADJUSTMENT
          : sigma1(words[index - 2]);
    }
    if (index - 7 >= 14) value += words[index - 7];
    if (index - 15 >= 14) {
      value +=
        index === 29
          ? sigma0(words[index - 15]) ^ _SHA256_SIGMA0_ADJUSTMENT
          : sigma0(words[index - 15]);
    }
    words.push(value >>> 0);
  }

  words.push(
    (sigma1(words[28]) +
      words[23] +
      sigma0(words[15]) +
      words[14] +
      _SHA256_ADJUSTMENT -
      _SHA256_ROUND_CONSTANTS[14]) >>>
      0
  );

  expandSchedule(words, 31);
  const working = sha256Rounds(_SHA256_STATE, words, 14);
  return _SHA256_INITIAL.map((x, idx) => (x + working[idx]) >>> 0);
}

function sha256Digest(data: Uint8Array): Uint8Array {
  const length = 57 + data.length;
  const padLen = (55 - length) % 64;
  const totalPad = padLen < 0 ? padLen + 64 : padLen;

  const padded = new Uint8Array(data.length - 7 + 1 + totalPad + 8);
  padded.set(data.subarray(7), 0);
  padded[data.length - 7] = 0x80;

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  view.setBigUint64(padded.length - 8, BigInt(length * 8), false);

  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words: number[] = [];
    for (let j = 0; j < 16; j++) {
      words.push(view.getUint32(offset + j * 4, false));
    }
    expandSchedule(words);
    const working = sha256Rounds(state, words);
    state = state.map((x, idx) => (x + working[idx]) >>> 0);
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let j = 0; j < 8; j++) {
    outView.setUint32(j * 4, state[j], false);
  }
  return out;
}

function wordsLe4Even(data: Uint8Array): number[] {
  const pad = (4 - (data.length % 4)) % 4;
  const padded = new Uint8Array(data.length + pad);
  padded.set(data, 0);

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  const words: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    words.push(view.getUint32(i, true));
  }
  if (words.length % 2 !== 0) words.push(0);
  return words;
}

function cs64Digest(data: Uint8Array, digest: Uint8Array): [number, number] {
  const digestView = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength
  );
  const keyA = digestView.getUint32(0, true) | 1;
  const keyB = digestView.getUint32(4, true) | 1;

  const factors = [
    Number((BigInt(keyA) * BigInt(_CS64_FACTOR)) & 0xffffffffn),
    Number((BigInt(keyB) * BigInt(_CS64_FACTOR)) & 0xffffffffn)
  ];

  const terms: number[] = _CS64_COEFFICIENTS.map(([coef], idx) =>
    Number((BigInt(coef) * BigInt(factors[idx % 2])) & 0xffffffffn)
  );
  const offsets: number[] = _CS64_COEFFICIENTS.map(([, offset]) => offset);

  const prefixed = new Uint8Array(data.length + 1);
  prefixed[0] = 0;
  prefixed.set(data, 1);

  const words = wordsLe4Even(prefixed);
  for (let idx = 0; idx < words.length; idx++) {
    const word = words[idx];
    let term = BigInt(word) * BigInt(idx % 2 === 0 ? keyA : keyB);
    let offset =
      BigInt(rol16(word)) * BigInt(idx % 2 === 0 ? 0xef0569fb : 0xc31713db);
    if (idx === 0) {
      term += BigInt(_CS64_ADJUSTMENT0) * BigInt(factors[0]);
      offset += BigInt(_CS64_ADJUSTMENT1);
    }
    terms.push(Number(term & 0xffffffffn));
    offsets.push(Number(offset & 0xffffffffn));
  }

  let swapAcc = 0n;
  let swapLast = 0n;
  let state = 0n;
  let acc = 0n;
  const mask = 0xffffffffn;

  for (let idx = 0; idx < terms.length; idx += 2) {
    const x = BigInt(terms[idx]);
    const y = BigInt(terms[idx + 1]);

    let t = BigInt(rol16(Number((BigInt(offsets[idx]) + x) & mask)));
    let q = (t * 0x76f50f34n) & mask;
    swapAcc = (swapAcc + BigInt(rol16(Number(q))) * 0xc3efea97n + q) & mask;

    t = BigInt(rol16(Number((BigInt(offsets[idx + 1]) + y) & mask)));
    q = (t * 0x1881ce3cn) & mask;
    swapLast = (BigInt(rol16(Number(q))) * 0x35bd1ec9n + q) & mask;
    swapAcc = (swapAcc + swapLast) & mask;

    state = (state * BigInt(keyA) + x) & mask;
    state = (BigInt(rol16(Number(state))) * 0xcf98b111n) & mask;
    state = (BigInt(rol16(Number(state))) * 0x87085b9fn) & mask;
    state = (BigInt(rol16(Number(state))) * 0x12ceb96dn) & mask;
    state = (BigInt(rol16(Number(state))) * 0x257e1d83n) & mask;
    acc = (acc + state) & mask;

    t = (state * BigInt(keyB) + y) & mask;
    t = (BigInt(rol16(Number(t))) * 0xa27416f5n) & mask;
    t = (BigInt(rol16(Number(t))) * 0xd38396ffn) & mask;
    state =
      (BigInt(rol16(Number((BigInt(rol16(Number(t))) * 0x7c932b89n) & mask))) *
        0xbfa49f69n) &
      mask;
    acc = (acc + state) & mask;
  }

  return [Number((swapLast ^ state) & mask), Number((swapAcc ^ acc) & mask)];
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Generates a v2 Sec-MS-GEC token.
 * Output format: "<16 hex CS64>-<64 hex SHA256>".
 */
export function generateSecMsGecV2(
  trustedToken: string,
  unixTimestamp?: number
): string {
  let ticks = (unixTimestamp ?? Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks = Math.floor((ticks * 1e9) / 100);

  const strToHash = new TextEncoder().encode(`${ticks}${trustedToken}`);
  const digest = sha256Digest(strToHash);
  const [cs0, cs1] = cs64Digest(strToHash, digest);

  const csBytes = new Uint8Array(8);
  const csView = new DataView(csBytes.buffer);
  csView.setUint32(0, cs0, true);
  csView.setUint32(4, cs1, true);

  return `${bytesToHex(csBytes)}-${bytesToHex(digest)}`;
}

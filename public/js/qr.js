// Minimal QR code encoder (byte mode, error correction M, versions 1-10). Returns a 2D array of booleans.
const EC_M = { // version: [ec codewords per block, [[blocks, dataPerBlock], ...]]
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= gmul(g[j], EXP[i]); } g = ng; } return g; }
function rsEncode(data, n) {
  const g = rsGen(n), res = new Array(n).fill(0);
  for (const d of data) { const f = d ^ res[0]; res.shift(); res.push(0); for (let j = 0; j < n; j++) res[j] ^= gmul(g[j + 1], f); }
  return res;
}
function bch(value, poly, bits) {             // value followed by its BCH remainder (bits = remainder length)
  let rem = value;
  for (let i = 0; i < bits; i++) rem = (rem << 1) ^ ((rem >> (bits - 1)) * poly);
  return (value << bits) | (rem & ((1 << bits) - 1));
}

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 0;
  for (let v = 1; v <= 10; v++) {
    const cap = EC_M[v][1].reduce((s, [b, d]) => s + b * d, 0);
    const bits = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    if (bits <= cap * 8) { ver = v; break; }
  }
  if (!ver) throw new Error('Text too long for QR');
  const [ecn, groups] = EC_M[ver], dataCap = groups.reduce((s, [b, d]) => s + b * d, 0);
  // bit stream
  const bitsArr = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bitsArr.push((val >> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataCap * 8 - bitsArr.length));
  while (bitsArr.length % 8) bitsArr.push(0);
  const data = []; for (let i = 0; i < bitsArr.length; i += 8) data.push(parseInt(bitsArr.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCap; pad ^= 0xec ^ 0x11) data.push(pad);
  // blocks + interleave
  const blocks = [], ecs = []; let k = 0;
  for (const [b, d] of groups) for (let i = 0; i < b; i++) { const blk = data.slice(k, k + d); k += d; blocks.push(blk); ecs.push(rsEncode(blk, ecn)); }
  const final = [], maxD = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) final.push(b[i]);
  for (let i = 0; i < ecn; i++) for (const e of ecs) final.push(e[i]);
  // matrix
  const N = ver * 4 + 17, M = [], F = [];
  for (let i = 0; i < N; i++) { M.push(new Array(N).fill(false)); F.push(new Array(N).fill(false)); }
  const set = (r, c, v) => { M[r][c] = v; F[r][c] = true; };
  const finder = (r, c) => {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const rr = r + i, cc = c + j; if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
      const on = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
      set(rr, cc, on);
    }
  };
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
  for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[ver];
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1);
  }
  set(N - 8, 8, true); // dark module
  // reserve format + version areas
  for (let i = 0; i < 9; i++) { if (!F[8][i]) set(8, i, false); if (!F[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { if (!F[8][N - 1 - i]) set(8, N - 1 - i, false); if (!F[N - 1 - i][8]) set(N - 1 - i, 8, false); }
  if (ver >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(i, N - 11 + j, false); set(N - 11 + j, i, false); }
  // place data
  const bitsOut = []; for (const b of final) for (let i = 7; i >= 0; i--) bitsOut.push((b >> i) & 1);
  let bi = 0, up = true;
  for (let c = N - 1; c > 0; c -= 2) {
    if (c === 6) c--;
    for (let n = 0; n < N; n++) {
      const r = up ? N - 1 - n : n;
      for (let j = 0; j < 2; j++) { const cc = c - j; if (F[r][cc]) continue; M[r][cc] = bi < bitsOut.length ? !!bitsOut[bi] : false; bi++; }
    }
    up = !up;
  }
  const masks = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  const withMask = (mi) => {
    const A = M.map((row) => row.slice());
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!F[r][c] && masks[mi](r, c)) A[r][c] = !A[r][c];
    // format info (EC level M = 00)
    const fmt = bch((0 << 3) | mi, 0x537, 10) ^ 0x5412;
    for (let i = 0; i < 15; i++) {
      const bit = ((fmt >> i) & 1) === 1;
      if (i < 6) A[i][8] = bit; else if (i < 8) A[i + 1][8] = bit; else A[N - 15 + i][8] = bit;
      if (i < 8) A[8][N - 1 - i] = bit; else if (i < 9) A[8][15 - i - 1 + 1] = bit; else A[8][15 - i - 1] = bit;
    }
    A[N - 8][8] = true;
    if (ver >= 7) {
      const vb = bch(ver, 0x1f25, 12);
      for (let i = 0; i < 18; i++) { const bit = ((vb >> i) & 1) === 1; const r = Math.floor(i / 3), c = N - 11 + (i % 3); A[r][c] = bit; A[c][r] = bit; }
    }
    return A;
  };
  const penalty = (A) => {
    let p = 0;
    for (let r = 0; r < N; r++) for (const line of [A[r], A.map((row) => row[r])]) {
      let run = 1;
      for (let c = 1; c < N; c++) { if (line[c] === line[c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
      for (let c = 0; c + 10 < N; c++) {
        const s = line.slice(c, c + 11).map((v) => (v ? 1 : 0)).join('');
        if (s === '10111010000' || s === '00001011101') p += 40;
      }
    }
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) { const v = A[r][c]; if (A[r + 1][c] === v && A[r][c + 1] === v && A[r + 1][c + 1] === v) p += 3; }
    let dark = 0; for (const row of A) for (const v of row) if (v) dark++;
    p += Math.floor(Math.abs((dark * 100) / (N * N) - 50) / 5) * 10;
    return p;
  };
  let best = null, bestP = Infinity;
  for (let mi = 0; mi < 8; mi++) { const A = withMask(mi), pn = penalty(A); if (pn < bestP) { bestP = pn; best = A; } }
  return best;
}

// draw a QR (with a 4-module white quiet zone) into a square of `size` px at (x, y)
export function drawQR(ctx, text, x, y, size) {
  const m = qrMatrix(text), n = m.length, total = n + 8, s = size / total;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!m[r][c]) continue;
    const x0 = Math.round(x + (c + 4) * s), y0 = Math.round(y + (r + 4) * s), x1 = Math.round(x + (c + 5) * s), y1 = Math.round(y + (r + 5) * s);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}

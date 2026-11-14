// Loads qos/pcb.bin (written by tools/qos/pcb_pack.py) into three.js geometry.
// File: 'QPCB', u32 meta length, JSON meta, then per part 4-byte-aligned chunks:
// u16 xyz positions quantised over meta.span, u8 rgb colours, u16|u32 indices.
// OBJ units are 10 mil; scene units are millimetres, Y up, origin at the board's centre and bottom face.

export const MM = 0.254;

export async function loadPCB(THREE, url, onProgress = () => {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pcb.bin: HTTP ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  let buf;
  if (res.body && total) {
    const reader = res.body.getReader(), chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(Math.min(1, got / total));
    }
    const all = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    buf = all.buffer;
  } else {
    buf = await res.arrayBuffer();
  }
  onProgress(1);

  const dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'QPCB') throw new Error('pcb.bin: bad magic');
  const metaLen = dv.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, metaLen)));
  const { lo, span } = meta;
  let off = 8 + metaLen;
  const align = () => { off = (off + 3) & ~3; };

  const raw = meta.parts.map(p => {
    align(); const pos = new Uint16Array(buf, off, p.v * 3); off += p.v * 6;
    align(); const col = new Uint8Array(buf, off, p.v * 3); off += p.v * 3;
    align(); const idx = p.w ? new Uint32Array(buf, off, p.i) : new Uint16Array(buf, off, p.i); off += p.i * (p.w ? 4 : 2);
    return { name: p.name, pos, col, idx };
  });

  // board centre in OBJ units, from the board part's extent
  const b = raw.find(p => p.name === 'board');
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < b.pos.length; i += 3) {
    const x = b.pos[i], y = b.pos[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const k = span / 65535;
  const cx = lo[0] + (x0 + x1) / 2 * k, cy = lo[1] + (y0 + y1) / 2 * k;
  const size = { x: (x1 - x0) * k * MM, z: (y1 - y0) * k * MM };

  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }

  const parts = raw.map(p => {
    const n = p.pos.length / 3, P = new Float32Array(n * 3), C = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      P[i * 3] = (lo[0] + p.pos[i * 3] * k - cx) * MM;
      P[i * 3 + 1] = (lo[2] + p.pos[i * 3 + 2] * k) * MM;
      P[i * 3 + 2] = -(lo[1] + p.pos[i * 3 + 1] * k - cy) * MM;
      C[i * 3] = lin[p.col[i * 3]]; C[i * 3 + 1] = lin[p.col[i * 3 + 1]]; C[i * 3 + 2] = lin[p.col[i * 3 + 2]];
    }
    return { name: p.name, P, C, idx: p.idx };
  });

  // one BufferGeometry per part, optionally keeping only triangles whose centroid height is in [minY, maxY)
  // (used to split button caps and toggle bats from their bodies)
  function geometry(part, minY = -Infinity, maxY = Infinity) {
    const { P, C, idx } = part, keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b2 = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const y = (P[a + 1] + P[b2 + 1] + P[c + 1]) / 3;
      if (y >= minY && y < maxY) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setIndex(keep);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  return { parts, size, geometry, tris: raw.reduce((s, p) => s + p.idx.length / 3, 0) };
}

// The board's outline and holes as line segments: the top edges of its vertical side faces.
// (EdgesGeometry can't be used: the export's top face is full of T-junctions, so every strip
// seam reads as an open edge.)
export function boardOutline(THREE, geo) {
  const P = geo.attributes.position.array, idx = geo.index.array, out = [];
  let top = -Infinity;
  for (let i = 1; i < P.length; i += 3) top = Math.max(top, P[i]);
  const at = (i, k) => P[idx[i] * 3 + k];
  for (let t = 0; t < idx.length; t += 3) {
    const ys = [at(t, 1), at(t + 1, 1), at(t + 2, 1)];
    if (Math.max(...ys) - Math.min(...ys) < 1e-3) continue;          // flat face: skip
    for (let e = 0; e < 3; e++) {
      const a = t + e, b = t + (e + 1) % 3;
      if (Math.abs(at(a, 1) - top) < 1e-3 && Math.abs(at(b, 1) - top) < 1e-3) {
        out.push(at(a, 0), top + 0.02, at(a, 2), at(b, 0), top + 0.02, at(b, 2));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

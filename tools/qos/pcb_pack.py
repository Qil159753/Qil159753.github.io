"""Pack the EasyEDA joystick-controller OBJ into a small binary for qOS's robot3d app.

Faces are split into connected pieces, pieces whose footprints overlap are merged into parts,
and each part is stored as quantised positions + per-vertex colour + indices.
Usage: python3 tools/qos/pcb_pack.py IN.obj IN.mtl OUT.bin [--list]
"""
import json, struct, sys
from collections import defaultdict

src, mtl, out = sys.argv[1:4]
LIST = '--list' in sys.argv

kd, cur = {}, None
for line in open(mtl):
    p = line.split()
    if not p: continue
    if p[0] == 'newmtl': cur = p[1]
    elif p[0] == 'Kd': kd[cur] = tuple(float(x) for x in p[1:4])

V, F = [], []                      # F: (a, b, c, material)
cur = None
for line in open(src):
    if line.startswith('v '):
        V.append(tuple(float(x) for x in line.split()[1:4]))
    elif line.startswith('usemtl'):
        cur = line.split()[1]
    elif line.startswith('f '):
        ids = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
        for k in range(1, len(ids) - 1):
            F.append((ids[0], ids[k], ids[k + 1], cur))

# connected pieces over shared vertices
par = list(range(len(V)))
def find(i):
    while par[i] != i:
        par[i] = par[par[i]]; i = par[i]
    return i
for a, b, c, _ in F:
    ra, rb, rc = find(a), find(b), find(c)
    par[rb] = ra; par[find(rc)] = ra
pieces = defaultdict(list)
for fi, f in enumerate(F):
    pieces[find(f[0])].append(fi)

def bbox(fis):
    lo, hi = [1e9] * 3, [-1e9] * 3
    for fi in fis:
        for vi in F[fi][:3]:
            for k in range(3):
                lo[k] = min(lo[k], V[vi][k]); hi[k] = max(hi[k], V[vi][k])
    return lo, hi

allx = [v[0] for v in V]; ally = [v[1] for v in V]
BW, BH = max(allx) - min(allx), max(ally) - min(ally)
board, small = [], []
for fis in pieces.values():
    lo, hi = bbox(fis)
    big = (hi[0] - lo[0]) * (hi[1] - lo[1]) > 0.2 * BW * BH
    (board if big else small).append((fis, lo, hi))

# merge small pieces whose XY footprints overlap
n = len(small); up = list(range(n))
def f2(i):
    while up[i] != i:
        up[i] = up[up[i]]; i = up[i]
    return i
E = 0.5
for i in range(n):
    _, a0, a1 = small[i]
    for j in range(i + 1, n):
        _, b0, b1 = small[j]
        if a0[0] < b1[0] - E and b0[0] < a1[0] - E and a0[1] < b1[1] - E and b0[1] < a1[1] - E:
            up[f2(j)] = f2(i)
groups = defaultdict(list)
for i in range(n):
    groups[f2(i)] += small[i][0]

# name each group from its centre (OBJ units are 10 mil; layout read off the top view)
NAMED = {'xbee': (4361, -3015), 'tog_r': (4537, -3000), 'tog_l': (4184, -3000),
         'l1': (4119, -3000), 'up': (4119, -3059), 'left': (4060, -3096), 'right': (4178, -3096), 'down': (4119, -3131),
         'r1': (4603, -3000), 'tri': (4603, -3059), 'sq': (4544, -3096), 'cir': (4662, -3095), 'cross': (4603, -3131),
         'reset': (4290, -3198), 'jst': (4440, -3237), 'reg': (4362, -3204), 'reg_l': (4390, -3204)}
named = defaultdict(list)
for fis in groups.values():
    lo_, hi_ = bbox(fis)
    cx, cy = (lo_[0] + hi_[0]) / 2, (lo_[1] + hi_[1]) / 2
    name = next((k for k, (x, y) in NAMED.items() if abs(cx - x) < 3 and abs(cy - y) < 3), None)
    if name is None:
        only7 = all(F[fi][3] == 'mtl7' for fi in fis)          # the SOIC-8's gull-wing pins
        name = 'reg' if only7 else 'passives'
    named['reg' if name == 'reg_l' else name] += fis
named['board'] = sum((b[0] for b in board), [])
ORDER = ['board', 'xbee', 'tog_l', 'tog_r', 'l1', 'up', 'left', 'right', 'down', 'r1', 'tri', 'sq', 'cir', 'cross', 'reset', 'reg', 'jst', 'passives']
assert set(named) == set(ORDER), set(named) ^ set(ORDER)
parts = [named[k] for k in ORDER]

if LIST:
    for i, fis in enumerate(parts):
        lo, hi = bbox(fis)
        mats = defaultdict(int)
        for fi in fis: mats[F[fi][3]] += 1
        print(i, len(fis), 'c=(%.0f,%.0f) size=(%.0f,%.0f,%.0f) z=%.0f..%.0f' % (
            (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], lo[2], hi[2]),
            dict(sorted(mats.items(), key=lambda x: -x[1])[:4]))
    sys.exit()

lo = [min(v[k] for v in V) for k in range(3)]
hi = [max(v[k] for v in V) for k in range(3)]
span = max(hi[k] - lo[k] for k in range(3))
q = lambda x, k: max(0, min(65535, round((x - lo[k]) / span * 65535)))

head, blob = [], bytearray()
for fis in parts:
    remap, pos, col, idx = {}, bytearray(), bytearray(), []
    for fi in fis:
        a, b, c, m = F[fi]
        for vi in (a, b, c):
            # weld by quantised position: the export repeats vertices per face strip, which would
            # show up as false boundary edges in the viewer
            qp = tuple(q(V[vi][k], k) for k in range(3))
            key = (qp, m)
            if key not in remap:
                remap[key] = len(remap)
                pos += struct.pack('<3H', *qp)
                col += bytes(round(255 * x) for x in kd[m])
            idx.append(remap[key])
    nv = len(remap)
    wide = nv > 65535
    ib = struct.pack('<%d%s' % (len(idx), 'I' if wide else 'H'), *idx)
    entry = {'name': ORDER[len(head)], 'v': nv, 'i': len(idx), 'w': int(wide)}
    for chunk in (pos, col, ib):
        while len(blob) % 4: blob.append(0)
        blob += chunk
    head.append(entry)

meta = json.dumps({'lo': lo, 'span': span, 'parts': head}).encode()
meta += b' ' * (-len(meta) % 4)
with open(out, 'wb') as fh:
    fh.write(b'QPCB' + struct.pack('<I', len(meta)) + meta + blob)
print('wrote', out, len(blob) + len(meta) + 8, 'bytes,', len(parts), 'parts')

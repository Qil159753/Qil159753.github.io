"""Pack CAD meshes for the CAD bench (js/cad-bench.js) into one small binary per tab.

File: 'QCAD', u32 meta length, JSON meta, then per part 4-byte-aligned chunks: u16 xyz positions
quantised over the part's own box (meta lo/span), then u16|u32 triangle indices. Units are mm.

  hand   — MioNex Starter concept mechanism (CadQuery STLs + BOM.csv), REAL_* parts left out:
           they come from the team's CAD, not Q's.
  prints — Q's own 3D prints (.3mf), one part per printed object.

Usage: python3 tools/cad/pack_cad.py
"""
import csv, json, struct, zipfile, os
import xml.etree.ElementTree as ET
import numpy as np

HAND_DIR = os.path.expanduser('~/Documents/work/Robot_lab/prosthetic/SIBB/graphics/starter_cad/out_open')
PRINTS_DIR = os.path.expanduser("~/Desktop/Q's")
PRINTS = [  # file, label th, label en
    ('BatlyR1_keychain.3mf', 'พวงกุญแจ BATLY R1', 'BATLY R1 keychain'),
    ('Gear.3mf', 'เฟือง', 'Gear'),
    ('GEAR2.3mf', 'เฟือง (แบบที่ 2)', 'Gear, second design'),
    ('keycap_1.3mf', 'คีย์แคป', 'Keycap'),
    ('keycap_socket (~recovered).3mf', 'ฐานคีย์แคป', 'Keycap socket'),
    ('CONGRATULATIONS_Band.3mf', 'ป้าย CONGRATULATIONS', 'CONGRATULATIONS band'),
]
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'cad')


def read_stl(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[80:84])[0]
    a = np.frombuffer(b, dtype=np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')]), count=n, offset=84)
    return a['v'].reshape(-1, 3).astype(np.float64)


def weld(tri_verts, tol=1e-4):
    """Unindexed triangle soup -> (unique vertices, indices)."""
    q = np.round(tri_verts / tol).astype(np.int64)
    uniq, inv = np.unique(q, axis=0, return_inverse=True)
    inv = inv.ravel()
    v = np.zeros((len(uniq), 3))
    np.add.at(v, inv, tri_verts)
    v /= np.bincount(inv)[:, None]
    return v, inv.astype(np.uint32)


def mat(s):
    M = np.eye(4)
    if s:
        a = [float(x) for x in s.split()]
        M[:3, :3] = np.array(a[:9]).reshape(3, 3).T   # 3MF row-vector 3x4 -> column-vector 4x4
        M[:3, 3] = a[9:12]
    return M


def read_3mf(path):
    """All build items of a .3mf as (vertices, indices) in mm, transforms applied."""
    root = ET.fromstring(zipfile.ZipFile(path).read('3D/3dmodel.model'))
    ns = {'m': root.tag[1:root.tag.index('}')]}
    unit = {'micron': 1e-3, 'millimeter': 1, 'centimeter': 10, 'inch': 25.4}.get(root.get('unit', 'millimeter'), 1)
    objs = {}
    for o in root.iter(f"{{{ns['m']}}}object"):
        mesh = o.find('m:mesh', ns)
        if mesh is not None:
            v = np.array([[float(e.get(k)) for k in 'xyz'] for e in mesh.find('m:vertices', ns)])
            t = np.array([[int(e.get(k)) for k in ('v1', 'v2', 'v3')] for e in mesh.find('m:triangles', ns)])
            objs[o.get('id')] = [('mesh', v, t)]
        else:
            comps = o.find('m:components', ns)
            objs[o.get('id')] = [('ref', c.get('objectid'), mat(c.get('transform'))) for c in comps] if comps is not None else []

    def flat(oid, M):
        out = []
        for item in objs.get(oid, []):
            if item[0] == 'ref':
                out += flat(item[1], M @ item[2])
            else:
                out.append(((np.c_[item[1], np.ones(len(item[1]))] @ M.T)[:, :3], item[2]))
        return out

    meshes = []
    for it in root.find('m:build', ns):
        meshes += flat(it.get('objectid'), mat(it.get('transform')))
    v = np.concatenate([m[0] for m in meshes]) * unit
    off, idx = 0, []
    for m in meshes:
        idx.append(m[1] + off); off += len(m[0])
    return v, np.concatenate(idx).ravel().astype(np.uint32)


def pack(parts, path):
    meta, blobs = {'unit': 'mm', 'parts': []}, []
    for p in parts:
        v, i = p.pop('v'), p.pop('i')
        lo, hi = v.min(0), v.max(0)
        span = np.maximum(hi - lo, 1e-6)
        qv = np.round((v - lo) / span * 65535).astype('<u2')
        wide = len(v) > 65535
        blobs.append((qv.tobytes(), i.astype('<u4' if wide else '<u2').tobytes()))
        meta['parts'].append({**p, 'v': len(v), 'i': len(i), 'w': wide, 'lo': [round(x, 4) for x in lo], 'span': [round(x, 4) for x in span]})
    mj = json.dumps(meta, ensure_ascii=False, separators=(',', ':')).encode()
    out = bytearray(b'QCAD' + struct.pack('<I', len(mj)) + mj)
    for a, b in blobs:
        for chunk in (a, b):
            out += b'\0' * (-len(out) % 4)
            out += chunk
    open(path, 'wb').write(out)
    return len(out)


def hand():
    bom = {r['part']: r for r in csv.DictReader(open(os.path.join(HAND_DIR, 'BOM.csv'), encoding='utf-8'))}
    parts = []
    for name, row in bom.items():
        if name.startswith('REAL_'):
            continue
        v, i = weld(read_stl(os.path.join(HAND_DIR, name + '.stl')))
        parts.append({'name': name, 'mat': row['material'], 'note': row['note'], 'v': v, 'i': i})
    return parts


def prints():
    parts = []
    for f, th, en in PRINTS:
        v, i = read_3mf(os.path.join(PRINTS_DIR, f))
        parts.append({'name': os.path.splitext(f)[0], 'th': th, 'en': en, 'v': v, 'i': i})
    return parts


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (('hand', hand), ('prints', prints)):
        ps = fn()
        n = pack(ps, os.path.join(OUT, name + '.bin'))
        print(f'{name}.bin: {len(ps)} parts, {n / 1024:.0f} KB')

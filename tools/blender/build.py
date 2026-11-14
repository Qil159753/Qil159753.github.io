"""Story chapter 1 (Build): wooden syringe digger -> toy truck exploding into its 11 numbered parts
-> my Nano board with its traces routing. Frames 1-34 digger, 35-64 truck, 65-96 board.
Usage and encoding: see common.py. Everything is modelled here from primitives.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

N = 96
floor()

# ---------------------------------------------------------------- 1. wooden syringe digger (around x=0)
box('base', (3.4, 2.4, 0.1), (0.2, 0, 0.05), M['ply'], bevel=0.02)
box('soil', (1.3, 1.6, 0.14), (2.55, 0, 0.12), M['soil'], bevel=0.05)
for x, y, r in ((2.2, 0.3, 0.16), (2.7, -0.4, 0.2), (2.9, 0.45, 0.13), (2.45, -0.1, 0.11)):
    sphere('clod', r, (x, y, 0.16), M['soil'], seg=12).scale.z = 0.5

swing = empty('swing', (0, 0, 0.1))
adopt(cyl('turntable', 0.75, 0.16, (0, 0, 0), M['wood']), swing, (0, 0, 0.08))
for y in (-0.28, 0.28):
    adopt(plate('tower', [(-0.45, 0.16), (0.5, 0.16), (0.42, 1.45), (-0.02, 1.45)], 0.08, M['wood']), swing, (0, y, 0))
adopt(box('brace', (0.2, 0.48, 0.5), (0, 0, 0), M['wood'], bevel=0.02), swing, (-0.3, 0, 0.6))


def bolt(parent, at, length):
    adopt(cyl('bolt', 0.04, length, (0, 0, 0), M['steel'], rot=(math.pi / 2, 0, 0), bevel=False), parent, at)
    for s in (-1, 1):
        adopt(cyl('nut', 0.075, 0.05, (0, 0, 0), M['steel'], rot=(math.pi / 2, 0, 0), verts=6), parent, (at[0], s * length / 2, at[2]))


boom = empty('boom', (0.3, 0, 1.35), parent=swing, rot=(0, math.radians(-30), 0))
for y in (-0.17, 0.17):
    adopt(plate('boomp', [(-0.1, -0.11), (-0.1, 0.11), (1.9, 0.08), (2.0, 0.0), (1.9, -0.11)], 0.06, M['ply']), boom, (0, y, 0))
adopt(box('spacer', (0.25, 0.28, 0.16), (0, 0, 0), M['wood'], bevel=0.01), boom, (1.0, 0, 0))
bolt(boom, (0, 0, 0), 0.7)
stick = empty('stick', (1.9, 0, 0), parent=boom, rot=(0, math.radians(100), 0))
adopt(plate('stickp', [(-0.12, -0.09), (-0.12, 0.09), (1.3, 0.07), (1.38, -0.06), (1.3, -0.09)], 0.12, M['ply']), stick, (0, 0, 0))
bolt(stick, (0, 0, 0), 0.46)
bucket = empty('bucket', (1.33, 0, 0), parent=stick, rot=(0, math.radians(30), 0))
adopt(plate('scoop', [(-0.08, 0.1), (0.36, 0.06), (0.48, -0.24), (0.18, -0.38), (-0.06, -0.12)], 0.5, M['toy'], bevel=0.03), bucket, (0, 0, 0))
bolt(bucket, (0, 0, 0), 0.62)

# arm syringes (barrel on the parent, rod on the child side of the joint) with water inside
for par, at, rot, ln in ((swing, (0.05, 0, 0.75), -55, 0.8), (boom, (0.9, 0, 0.26), 15, 0.7), (stick, (0.55, 0, -0.17), 0, 0.6)):
    s = adopt(cyl('asyr', 0.075, ln, (0, 0, 0), M['glass'], rot=(0, math.radians(90 + rot), 0)), par, at)
    adopt(cyl('ah2o', 0.06, ln * 0.55, (0, 0, 0), M['water'], rot=(0, math.radians(90 + rot), 0)), par, at)

# control syringes in a holder at the back, plungers pushed in turn
box('holder', (0.5, 1.3, 0.35), (-1.25, 0, 0.27), M['wood'], bevel=0.02)
plungers = []
for i, y in enumerate((-0.4, 0, 0.4)):
    cyl('csyr', 0.1, 0.9, (-1.25, y, 0.85), M['glass'])
    cyl('ch2o', 0.085, 0.45, (-1.25, y, 0.64), M['water'])
    p = empty('pl', (-1.25, y, 1.45))
    adopt(cyl('rod', 0.03, 0.6, (0, 0, 0), M['plunger']), p, (0, 0, -0.1))
    adopt(cyl('pad', 0.11, 0.03, (0, 0, 0), M['plunger']), p, (0, 0, 0.2))
    plungers.append(p)
    curve('tube', [(-1.25, y, 0.4), (-1.0, y * 1.3, 0.2), (-0.5, y * 0.6, 0.35), (0.0, y * 0.2, 0.9 + i * 0.15)], M['water'], depth=0.03, kind='BEZIER')

for f, sw, b, s, k in ((1, -12, -30, 100, 30), (12, -4, -14, 70, -15), (22, 6, -36, 112, 40), (34, 10, -30, 100, 30)):   # dig cycle
    key(swing, 'rotation_euler', f, (0, 0, math.radians(sw)))
    for o, deg in ((boom, b), (stick, s), (bucket, k)):
        key(o, 'rotation_euler', f, (0, math.radians(deg), 0))
for i, p in enumerate(plungers):
    z = p.location.z
    keys(p, 'location', [(1 + i * 4, (p.location.x, p.location.y, z)), (8 + i * 4, (p.location.x, p.location.y, z - 0.3)), (20 + i * 4, (p.location.x, p.location.y, z))])
studio(0.6, z=0.9)

# ---------------------------------------------------------------- 2. toy truck, 11 parts, balloons (around x=9)
TX = 9.0
parts = []
chassis = box('chassis', (3.0, 0.9, 0.14), (TX, 0, 0.45), M['body'], bevel=0.03)
for y in (-0.35, 0.35): adopt(box('rail', (2.9, 0.08, 0.12), (0, 0, 0), M['body'], bevel=0.01), chassis, (0, y, -0.1))
parts.append((chassis, (0, 0, -0.1)))
bumper = box('bumper', (0.14, 1.2, 0.22), (TX + 1.6, 0, 0.5), M['steel'], bevel=0.04)
for y in (-0.4, 0.4): adopt(cyl('lamp', 0.07, 0.04, (0, 0, 0), M['glow'], rot=(0, math.pi / 2, 0)), bumper, (0.08, y, 0.02))
parts.append((bumper, (0.9, 0, 0)))
cab = box('cab', (0.95, 1.1, 0.95), (TX + 1.0, 0, 1.0), M['toy'], bevel=0.1)
for loc, size in (((0.49, 0, 0.14), (0.03, 0.88, 0.42)), ((0.05, 0.56, 0.16), (0.55, 0.03, 0.36)), ((0.05, -0.56, 0.16), (0.55, 0.03, 0.36))):
    adopt(box('win', size, (0, 0, 0), M['chip'], bevel=0.01), cab, loc)
parts.append((cab, (0.8, 0, 0.6)))
bed = box('bed', (1.85, 1.15, 0.1), (TX - 0.5, 0, 0.62), M['toy'], bevel=0.03)
for size, loc in (((1.85, 0.08, 0.6), (0, 0.55, 0.3)), ((1.85, 0.08, 0.6), (0, -0.55, 0.3)), ((0.08, 1.15, 0.6), (-0.9, 0, 0.3)), ((0.08, 1.15, 0.75), (0.9, 0, 0.38))):
    adopt(box('wall', size, (0, 0, 0), M['toy'], bevel=0.025), bed, loc)
for x in (-0.6, -0.2, 0.2, 0.6): adopt(box('rib', (0.05, 0.03, 0.5), (0, 0, 0), M['toy'], bevel=0.01), bed, (x, -0.6, 0.3))
parts.append((bed, (-0.5, 0, 1.0)))
light = box('lightbar', (0.45, 0.85, 0.06), (TX + 1.0, 0, 1.52), M['chip'], bevel=0.02)
for y in (-0.3, -0.1, 0.1, 0.3): adopt(box('led', (0.1, 0.12, 0.03), (0, 0, 0), M['glow'], bevel=0), light, (0.12, y, 0.03))
parts.append((light, (0.8, 0, 1.4)))
for x in (TX - 0.9, TX + 0.95):
    parts.append((cyl('axle', 0.05, 1.5, (x, 0, 0.32), M['steel'], rot=(math.pi / 2, 0, 0)), (0, 0, -0.32)))
    for y in (-0.72, 0.72):
        w = cyl('tyre', 0.32, 0.28, (x, y, 0.32), M['rubber'], rot=(math.pi / 2, 0, 0), verts=48)
        adopt(cyl('rim', 0.18, 0.3, (0, 0, 0), M['steel']), w)
        for k in range(5):
            a = k * 2 * math.pi / 5
            adopt(cyl('lug', 0.025, 0.32, (0, 0, 0), M['chip'], bevel=False), w, (0.1 * math.cos(a), 0.1 * math.sin(a), 0))
        parts.append((w, (0, 1.0 if y > 0 else -1.0, 0)))
assert len(parts) == 11
balloons = []
for i, (o, d) in enumerate(parts):
    rest = o.location.copy()
    o.keyframe_insert('location', frame=40)
    o.location = rest + Vector(d); o.keyframe_insert('location', frame=54)
    # SolidWorks-style balloon: a ring with the part number, on a leader line from the part
    at = o.location + Vector((0.15 * (i % 3 - 1), -0.9, 0.55 + 0.1 * (i % 2)))
    b = empty('balloon', at)
    adopt(text('n', str(i + 1), (0, 0, 0), M['white'], size=0.16), b, (0, -0.01, 0))
    ring = adopt(cyl('ring', 0.13, 0.01, (0, 0, 0), M['glow_soft'], rot=(math.pi / 2, 0, 0), bevel=False), b)
    ring.modifiers.new('w', 'WIREFRAME').thickness = 0.012
    lead = curve('lead', [tuple(o.location), tuple(at + Vector((0, 0, -0.13)))], M['glow_soft'], depth=0.006)
    for e in (b, lead):
        e.scale = (0, 0, 0); e.keyframe_insert('scale', frame=54 + i * 0.6)
        e.scale = (1, 1, 1); e.keyframe_insert('scale', frame=58 + i * 0.6)
studio(TX + 0.3, z=0.8)

# ---------------------------------------------------------------- 3. Nano board (around x=18, lying flat)
BX = 18.0
box('pcb', (4.5, 1.8, 0.08), (BX, 0, 0.55), M['pcb'], bevel=0.02)
for y in (-0.78, 0.78):
    box('hdr', (4.0, 0.24, 0.26), (BX + 0.1, y, 0.72), M['chip'], bevel=0.02)
    for i in range(15):
        box('pin', (0.07, 0.07, 0.04), (BX - 1.65 + i * 0.25, y, 0.86), M['gold'], bevel=0)
box('mcu', (0.72, 0.72, 0.1), (BX + 0.2, 0, 0.64), M['chip'], bevel=0.02)
for i in range(8):
    t = -0.26 + i * 0.075
    for x, y, sx, sy in ((t, 0.41, 0.03, 0.1), (t, -0.41, 0.03, 0.1), (0.41, t, 0.1, 0.03), (-0.41, t, 0.1, 0.03)):
        box('mpin', (sx, sy, 0.02), (BX + 0.2 + x, y, 0.6), M['steel'], bevel=0)
box('ch340', (0.95, 0.42, 0.1), (BX - 1.25, 0, 0.64), M['chip'], bevel=0.02)
for i in range(8):
    for y in (0.27, -0.27):
        box('spin', (0.04, 0.12, 0.02), (BX - 1.6 + i * 0.1, y, 0.6), M['steel'], bevel=0)
box('xtal', (0.5, 0.36, 0.09), (BX + 1.05, 0, 0.63), M['steel'], bevel=0.03)
box('xtop', (0.42, 0.28, 0.01), (BX + 1.05, 0, 0.68), mat('xtal', (0.62, 0.6, 0.9), rough=0.4), bevel=0)
box('usbc', (0.5, 0.62, 0.22), (BX + 2.1, 0, 0.7), M['steel'], bevel=0.08)
for x, y in ((0.75, 0.35), (0.75, -0.35), (1.5, 0.35), (1.5, -0.35), (-0.6, 0.45), (-0.6, -0.45)):
    box('smd', (0.12, 0.07, 0.05), (BX + x, y, 0.61), M['chip'], bevel=0)
trace = mat('trace', COPPER, metal=1.0, rough=0.3, emit=(1.0, 0.55, 0.25), estr=1.6)
for pts in (
    [(2.1, 0.12), (1.7, 0.12), (1.5, 0.2), (-0.6, 0.2), (-0.78, 0.14)],
    [(2.1, -0.12), (1.7, -0.12), (1.5, -0.2), (-0.6, -0.2), (-0.78, -0.14)],
    [(-0.78, 0.0), (-0.3, 0.0), (-0.16, 0.05)],
    [(0.56, 0.05), (0.8, 0.05)],
    [(0.56, -0.05), (0.8, -0.05)],
    [(0.2, 0.41), (0.2, 0.55), (0.45, 0.62), (1.9, 0.62)],
    [(0.2, -0.41), (0.2, -0.55), (-0.1, -0.62), (-1.9, -0.62)],
    [(-1.25, 0.27), (-1.25, 0.5), (-1.7, 0.62)],
):
    c = curve('trace', [(BX + x, y, 0.595) for x, y in pts], trace, depth=0.018)
    c.data.bevel_factor_end = 0.0; c.data.keyframe_insert('bevel_factor_end', frame=70)
    c.data.bevel_factor_end = 1.0; c.data.keyframe_insert('bevel_factor_end', frame=88)
studio(BX, z=0.6)

camera([
    (1, (-3.2, -5.4, 2.6), (1.2, 0, 0.9)),
    (30, (1.0, -5.8, 2.2), (1.6, 0, 0.8)),
    (40, (6.4, -6.4, 2.6), (TX + 0.9, 0, 0.8)),
    (62, (10.8, -7.4, 3.6), (TX + 1.2, 0, 1.0)),
    (72, (16.6, -4.8, 5.2), (BX + 0.7, 0, 0.6)),
    (96, (19.2, -4.2, 3.9), (BX + 0.8, 0, 0.6)),
])
render(N)

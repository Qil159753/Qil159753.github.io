"""Story chapter 2 (Pitch): a dark stage, the spotlight finds 3rd (Startup Thailand League) then
1st (Pitch Your IP); then 540 beads, one per ELP4 applicant: 531 dim, 9 rise and fly an arc from
Chonburi to SKKU in Suwon. Frames 1-24 3rd, 25-48 1st, 49-96 ELP4. Usage: see common.py.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

N = 96
floor(rough=0.28, near=7.0, far=20.0)


# ---------------------------------------------------------------- stage and podium (around x=0)
slat = mat('slat', COPPER, emit=(1.0, 0.55, 0.25), estr=0.7)
for x in [i * 0.7 - 2.8 for i in range(9)]:                    # backdrop light slats
    box('slat', (0.03, 0.03, 3.0), (x, 3.2, 1.5), slat, bevel=0)
podium = mat('podium', (0.03, 0.033, 0.04), metal=0.3, rough=0.25, coat=0.8)
number = mat('number', COPPER, metal=1.0, rough=0.3, emit=(1.0, 0.55, 0.25), estr=0.4)
steps = {}
for place, x, h in ((2, -1.25, 1.0), (1, 0.0, 1.5), (3, 1.25, 0.7)):
    box('step', (1.2, 1.2, h), (x, 0, h / 2), podium, bevel=0.03)
    text('num', str(place), (x, -0.61, h * 0.55), number, size=0.55, extrude=0.03)
    steps[place] = (x, h)
trophy = empty('trophy', (0, 0, 1.5))
adopt(cyl('cup', 0.16, 0.32, (0, 0, 0), M['gold']), trophy, (0, 0, 0.34))
adopt(cyl('stem', 0.04, 0.16, (0, 0, 0), M['gold']), trophy, (0, 0, 0.1))
adopt(cyl('foot', 0.12, 0.05, (0, 0, 0), M['gold']), trophy, (0, 0, 0.02))
keys(trophy, 'scale', [(30, (0, 0, 0)), (38, (1, 1, 1))])

target = empty('spot_t', (steps[3][0], 0, steps[3][1]))
keys(target, 'location', [(1, (steps[3][0], 0, steps[3][1])), (24, (steps[3][0], 0, steps[3][1])), (32, (0, 0, 1.5))])
beam = spot((0.4, -1.5, 6.5), target, 3500, (1.0, 0.85, 0.7), angle=0.32, blend=0.3)
keys(beam.data, 'energy', [(1, 0), (6, 3500), (24, 3500), (28, 1500), (34, 6000)])
# haze only inside the beam: a cone of volume scatter riding on the spotlight, so the
# background stays the page colour
L = 6.4
haze = mat('haze', (1, 1, 1)); hn = haze.node_tree.nodes
vs = hn.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value = 0.09
vs.inputs['Color'].default_value = (1.0, 0.86, 0.7, 1)
haze.node_tree.links.remove(hn['Material Output'].inputs['Surface'].links[0])
haze.node_tree.links.new(vs.outputs['Volume'], hn['Material Output'].inputs['Volume'])
bpy.ops.mesh.primitive_cone_add(radius1=L * math.tan(0.16) * 1.15, radius2=0.02, depth=L, vertices=48)
cone = bpy.context.active_object; cone.data.materials.append(haze)
cone.parent = beam; cone.location = (0, 0, -L / 2)
spot((-3.5, -2.0, 5.0), empty('c', (0, 0, 0.6)), 600, (0.5, 0.65, 1.0), angle=0.9, blend=0.6)   # cool wash
studio(0, z=0.9, key_w=180, rim_w=600, fill_w=150)

# ---------------------------------------------------------------- 540 beads (around x=9), 9 picked
GX, GY = 9.0, 0.0
bead_on = mat('bead_on', COPPER, emit=(1.0, 0.55, 0.25), estr=3.0)
bead_dim = mat('bead_dim', (0.05, 0.05, 0.055), rough=0.4, emit=(1.0, 0.55, 0.25), estr=3.0)
keys(bead_dim.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'], 'default_value', [(60, 3.0), (68, 0.05)])
proto = sphere('bead', 0.05, (0, 0, 0), bead_dim, seg=12)
picks = {33, 97, 151, 208, 262, 319, 377, 433, 488}
movers = []
for i in range(540):
    c, r = i % 30, i // 30
    o = proto.copy(); sc.collection.objects.link(o)
    if i in picks:
        o.data = proto.data.copy(); o.data.materials[0] = bead_on
        movers.append(o)
    o.location = (GX - 2.0 + c * 0.14, GY - 1.2 + r * 0.14, 0.05)
    d = math.hypot(c - 15, r - 9)
    keys(o, 'scale', [(48 + d * 0.5, (0, 0, 0)), (52 + d * 0.5, (1, 1, 1))])
bpy.data.objects.remove(proto)

# the arc to Korea: start at the grid, land on a ring marker
KX, KY = 15.5, 6.0
arc = curve('arc', [(GX + 0.2, GY, 0.3), (GX + 2.0, GY + 1.5, 2.2), (KX - 1.8, KY - 1.2, 2.4), (KX, KY, 0.15)], mat('arcm', COPPER, emit=(1.0, 0.55, 0.25), estr=2.5), depth=0.012, kind='BEZIER')
keys(arc.data, 'bevel_factor_end', [(72, 0.0), (90, 1.0)])
ring = cyl('ring', 0.5, 0.02, (KX, KY, 0.02), M['glow'], bevel=False)
ring.modifiers.new('w', 'WIREFRAME').thickness = 0.02
keys(ring, 'scale', [(80, (0, 0, 1)), (90, (1, 1, 1))])
text('kr', 'SKKU · SUWON', (KX, KY - 0.9, 0.02), M['white'], size=0.22, rot=(0, 0, 0))
text('th', 'CHONBURI', (GX, GY - 1.6, 0.02), M['white'], size=0.2, rot=(0, 0, 0))
for k, o in enumerate(movers):      # rise, gather, fly the arc and land in the ring
    start = o.location.copy()
    keys(o, 'location', [(66, tuple(start)), (72, (start.x, start.y, 0.6)),
                         (76 + k * 0.4, (GX + 0.2, GY, 0.3 + k * 0.03)),
                         (82 + k * 0.4, (GX + 3.6, GY + 2.5, 2.3)),
                         (90 + k * 0.4, (KX + 0.25 * math.cos(k * 0.7), KY + 0.25 * math.sin(k * 0.7), 0.15))])
area((GX, GY - 2, 4), empty('g', (GX, GY, 0)), 300, (1.0, 0.8, 0.6), size=4)

camera([
    (1, (2.4, -6.2, 2.4), (0.9, 0, 1.0)),
    (24, (1.6, -6.0, 2.3), (0.7, 0, 1.1)),
    (46, (0.6, -5.4, 2.8), (0.5, 0, 1.3)),
    (56, (6.8, -5.6, 4.6), (GX + 0.5, GY, 0)),
    (74, (8.4, -4.8, 4.2), (GX + 1.5, GY + 0.8, 0.4)),
    (96, (12.6, -2.6, 5.0), (KX - 0.6, KY - 1.0, 0.6)),
], lens=34, shift_x=-0.24, fstop=2.4)
render(N)

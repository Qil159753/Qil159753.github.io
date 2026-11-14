"""Story chapter 4 (Navigate): BATLY R1 maps a mock factory with SLAM (the occupancy grid rises
tile by tile outward from the robot as its LiDAR sweeps), then drives the A -> B -> C loop that my
loop_navigator node sends. Frames 1-28 mapping, 30-90 the loop. Usage: see common.py.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from mathutils import Matrix

N = 96
floor(near=8.0, far=20.0)

COLS, ROWS, CS = 24, 16, 0.3
X0, Y0 = -COLS * CS / 2, -ROWS * CS / 2
BLOCKS = [(7, 6, 16, 8), (3, 10, 6, 13), (18, 10, 21, 13), (10, 1, 13, 2)]       # c0 r0 c1 r1
A, B, C = (4, 4), (19, 4), (11, 12)


def at(c, r, z=0.0):
    return (X0 + (c + 0.5) * CS, Y0 + (r + 0.5) * CS, z)


tile_free = mat('tile', (0.03, 0.045, 0.06), rough=0.4, coat=0.4)
tile_obst = mat('obst', (0.35, 0.2, 0.1), metal=0.4, rough=0.35, emit=(1.0, 0.55, 0.25), estr=0.15)
tile_wall = mat('wall', (0.55, 0.58, 0.62), rough=0.45)
for r in range(ROWS):
    for c in range(COLS):
        wall = r in (0, ROWS - 1) or c in (0, COLS - 1)
        obst = any(c0 <= c <= c1 and r0 <= r <= r1 for c0, r0, c1, r1 in BLOCKS)
        h, m = (0.6, tile_wall) if wall else (0.35, tile_obst) if obst else (0.04, tile_free)
        o = box('tile', (CS * 0.92, CS * 0.92, h), at(c, r), m, bevel=0.012)
        o.data.transform(Matrix.Translation((0, 0, h / 2)))     # grow up from the floor, not both ways
        f = 3 + math.hypot(c - A[0], r - A[1]) * 0.95             # seen in a ripple from the robot
        keys(o, 'scale', [(f, (1, 1, 0.001)), (f + 4, (1, 1, 1))])

# stations: a glowing ring and a floating letter
for name, cell in (('A', A), ('B', B), ('C', C)):
    x, y, _ = at(*cell)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.22, minor_radius=0.015, location=(x, y, 0.06))
    bpy.context.active_object.data.materials.append(M['glow'])
    text('st', name, (x, y + 0.02, 0.75), M['glow_soft'], size=0.3, extrude=0.02)

# the loop: A -> B -> C -> A round the obstacles
route = [A, (17, 4), B, (19, 7), (17, 9), (14, 11), C, (6, 9), (4, 7), A]
path = curve('route', [at(c, r, 0.08) for c, r in route], mat('routem', COPPER, emit=(1.0, 0.55, 0.25), estr=2.0), depth=0.022)
keys(path.data, 'bevel_factor_end', [(30, 0.0), (90, 1.0)])

# BATLY-style robot: round base, deck, LiDAR puck with three red rays that sweep
bot = empty('batly')
fp = bot.constraints.new('FOLLOW_PATH'); fp.target = path; fp.use_curve_follow = True
fp.forward_axis = 'FORWARD_X'; fp.use_fixed_location = True
keys(fp, 'offset_factor', [(30, 0.0), (90, 1.0)])
bot.location = (0, 0, -0.08)          # the path already sits at z=0.08
adopt(cyl('base', 0.26, 0.16, (0, 0, 0), M['body']), bot, (0, 0, 0.16))
adopt(cyl('band', 0.265, 0.03, (0, 0, 0), M['copper']), bot, (0, 0, 0.2))
adopt(cyl('deck', 0.22, 0.02, (0, 0, 0), M['alu']), bot, (0, 0, 0.27))
adopt(cyl('puck', 0.09, 0.08, (0, 0, 0), M['chip']), bot, (0, 0, 0.32))
head = adopt(empty('head'), bot, (0, 0, 0.36))
adopt(cyl('lens', 0.07, 0.04, (0, 0, 0), M['red_led']), head)
ray = mat('ray', (1, 0.15, 0.08), emit=(1, 0.12, 0.05), estr=6.0)
for k in range(3):
    a = k * 2 * math.pi / 3
    r = adopt(box('ray', (1.6, 0.008, 0.008), (0, 0, 0), ray, bevel=0), head, (0.8 * math.cos(a), 0.8 * math.sin(a), 0))
    r.rotation_euler = (0, 0, a)
keys(head, 'rotation_euler', [(1, (0, 0, 0)), (96, (0, 0, 2 * math.pi * 6))])
studio(0, z=0.3, key_w=900, rim_w=900, fill_w=300)

cam, aim = camera([
    (1, (-1.6, -5.4, 4.8), at(*A)),
    (28, (-0.6, -6.0, 5.6), (0.4, 0.2, 0.0)),
    (60, (1.6, -6.0, 5.2), (0.8, 0.4, 0.0)),
    (96, (3.4, -5.0, 4.6), (1.0, 0.6, 0.0)),
], lens=30, shift_x=-0.27, fstop=4.0)
render(N)

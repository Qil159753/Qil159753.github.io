"""Story chapter 3 (Compete): Robotrace at TMIRC, a line robot learns the course (lap 1) then races
it with the tape glowing copper (lap 2); then my ABU Robocon mecanum robot takes radio frames from its
handheld controller and strafes. Frames 1-50 Robotrace, 51-96 ABU. Usage: see common.py.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

N = 96
floor(near=7.0, far=20.0)

# ---------------------------------------------------------------- Robotrace course (around x=0)
box('mat', (7.0, 4.4, 0.02), (0.6, 0.6, 0.01), M['mat_black'], bevel=0)
course = [(-2.2, -0.6), (-2.4, 1.0), (-1.2, 2.2), (0.4, 1.4), (1.4, 2.4),
          (3.2, 1.8), (3.4, 0.0), (2.0, -0.6), (0.6, 0.2), (-0.8, -1.2)]
# flattened by object scale, so the points sit at z=0 and the object is lifted onto the mat
line = curve('line', [(x, y, 0.0) for x, y in course], M['line'], depth=0.045, kind='BEZIER', closed=True)
line.scale.z = 0.12; line.location.z = 0.022
path = curve('path', [(x, y, 0.0) for x, y in course], M['line'], depth=0.0, kind='BEZIER', closed=True)
path.hide_render = True
# the race lap lights the tape copper
ln = M['line'].node_tree.nodes['Principled BSDF']
ln.inputs['Emission Color'].default_value = (1.0, 0.55, 0.25, 1)
keys(ln.inputs['Emission Strength'], 'default_value', [(29, 0.0), (33, 2.5), (48, 2.5)])
keys(ln.inputs['Base Color'], 'default_value', [(29, (0.92, 0.92, 0.9, 1)), (33, (1.0, 0.5, 0.2, 1))])
for x, y in ((-2.2, -0.6), (0.4, 1.4), (3.4, 0.0)):              # curvature markers beside the line
    box('marker', (0.06, 0.18, 0.005), (x + 0.25, y, 0.025), M['line'], bevel=0)

bot = empty('tracer')
bot.scale = (1.7, 1.7, 1.7)          # real size would be a speck at this distance
fp = bot.constraints.new('FOLLOW_PATH'); fp.target = path; fp.use_curve_follow = True
fp.forward_axis = 'FORWARD_X'; fp.use_fixed_location = True
# lap 1 learns the course in 29 frames; lap 2 races the same loop in 18
keys(fp, 'offset_factor', [(1, 0.0), (29, 1.0), (30, 0.0), (48, 1.0)])
adopt(box('chassis', (0.5, 0.32, 0.03), (0, 0, 0), M['green'], bevel=0.01), bot, (0, 0, 0.1))
adopt(box('bar', (0.06, 0.5, 0.02), (0, 0, 0), M['green'], bevel=0.005), bot, (0.32, 0, 0.07))
for j in range(8):
    adopt(box('led', (0.025, 0.025, 0.01), (0, 0, 0), M['red_led'], bevel=0), bot, (0.33, -0.21 + j * 0.06, 0.055))
for y in (-0.19, 0.19):
    adopt(cyl('wheel', 0.09, 0.05, (0, 0, 0), M['rubber'], rot=(math.pi / 2, 0, 0)), bot, (-0.14, y, 0.09))
adopt(box('mcu', (0.14, 0.14, 0.03), (0, 0, 0), M['chip'], bevel=0.005), bot, (0.02, 0, 0.13))
adopt(box('batt', (0.2, 0.12, 0.06), (0, 0, 0), M['body'], bevel=0.01), bot, (-0.12, 0, 0.15))
red = bpy.data.lights.new('ledlight', 'POINT'); red.energy = 6; red.color = (1, 0.15, 0.08); red.shadow_soft_size = 0.2
adopt(bpy.data.objects.new('ledlight', red), bot, (0.36, 0, 0.04)); sc.collection.objects.link(bpy.data.objects['ledlight'])
studio(0.6, z=0.2, key_w=500, rim_w=700, fill_w=250)

# ---------------------------------------------------------------- ABU mecanum robot (around x=11)
AX = 11.0
box('field', (6.0, 5.0, 0.02), (AX + 0.5, 0.5, 0.01), mat('fieldm', (0.05, 0.08, 0.12), rough=0.7), bevel=0)
for y in (-1.5, 0.5, 2.5):
    box('fline', (6.0, 0.04, 0.003), (AX + 0.5, y, 0.022), M['line'], bevel=0)
rob = empty('abu', (AX, 0, 0))
adopt(box('frame', (1.1, 1.0, 0.08), (0, 0, 0), M['alu'], bevel=0.02), rob, (0, 0, 0.32))
for y in (-0.42, 0.42):
    adopt(box('rail', (1.1, 0.06, 0.18), (0, 0, 0), M['alu'], bevel=0.01), rob, (0, y, 0.42))
adopt(box('deck', (0.7, 0.6, 0.02), (0, 0, 0), M['body'], bevel=0.005), rob, (-0.05, 0, 0.47))
adopt(box('teensy', (0.26, 0.1, 0.02), (0, 0, 0), M['green'], bevel=0.003), rob, (0.15, 0.1, 0.49))
adopt(box('lipo', (0.34, 0.2, 0.12), (0, 0, 0), mat('lipo', (0.05, 0.12, 0.35), rough=0.4), bevel=0.02), rob, (-0.2, -0.1, 0.54))
adopt(cyl('ant', 0.012, 0.4, (0, 0, 0), M['chip']), rob, (-0.38, 0.3, 0.68))
adopt(sphere('ant_tip', 0.03, (0, 0, 0), M['glow']), rob, (-0.38, 0.3, 0.88))
wheels = []
for x, y, hand in ((0.45, 0.62, 1), (-0.45, 0.62, -1), (0.45, -0.62, -1), (-0.45, -0.62, 1)):
    w = adopt(empty('wheel', rot=(math.pi / 2, 0, 0)), rob, (x, y, 0.22))
    adopt(cyl('hub', 0.14, 0.16, (0, 0, 0), M['alu']), w)
    for k in range(10):          # rollers round the rim, tilted 45 degrees left- or right-handed
        a = k * 2 * math.pi / 10
        r = adopt(cyl('roller', 0.034, 0.15, (0, 0, 0), M['rubber'], verts=16), w, (0.165 * math.cos(a), 0.165 * math.sin(a), 0))
        r.rotation_mode = 'ZXY'; r.rotation_euler = (math.radians(45 * hand), 0, a)
    wheels.append((w, hand))
keys(rob, 'location', [(56, (AX, 0, 0)), (70, (AX + 0.2, 1.0, 0)), (84, (AX + 0.9, 0.4, 0)), (96, (AX + 0.9, 0.4, 0))])
keys(rob, 'rotation_euler', [(56, (0, 0, 0)), (84, (0, 0, math.radians(-15)))])
for w, hand in wheels:
    keys(w, 'rotation_euler', [(56, (math.pi / 2, 0, 0)), (84, (math.pi / 2, 0, hand * 8 * math.pi))])
# handheld controller; radio rings travel from it to the robot
pad = empty('pad', (AX - 2.6, -0.6, 0.9), rot=(math.radians(-25), 0, math.radians(20)))
adopt(box('padb', (0.5, 0.9, 0.12), (0, 0, 0), M['body'], bevel=0.05), pad)
for y in (-0.25, 0.25):
    adopt(cyl('stick', 0.06, 0.12, (0, 0, 0), M['rubber']), pad, (0.05, y, 0.1))
adopt(box('scr', (0.16, 0.22, 0.01), (0, 0, 0), M['cyan'], bevel=0), pad, (0.12, 0, 0.065))
wave = mat('wave', COPPER, emit=(1.0, 0.55, 0.25), estr=3.0)
for k in range(4):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.008, location=(AX - 2.3, -0.4, 0.9), rotation=(0, math.pi / 2, 0))
    ring = bpy.context.active_object; ring.data.materials.append(wave)
    f0 = 54 + k * 7
    keys(ring, 'scale', [(f0, (0, 0, 0)), (f0 + 1, (1, 1, 1)), (f0 + 10, (3.2, 3.2, 3.2)), (f0 + 11, (0, 0, 0))])
    keys(ring, 'location', [(f0, (AX - 2.3, -0.4, 0.9)), (f0 + 10, (AX - 0.6, -0.1, 0.6))])
studio(AX, z=0.4)

cam, aim = camera([
    (1, (-2.4, -3.6, 2.4), (0.2, 0.6, 0.0)),
    (30, (-0.8, -3.8, 2.2), (0.8, 0.8, 0.0)),
    (48, (1.0, -3.6, 2.6), (1.4, 0.8, 0.0)),
    (60, (8.6, -4.2, 2.4), (AX + 0.3, 0.2, 0.3)),
    (96, (10.4, -3.6, 2.2), (AX + 1.0, 0.4, 0.3)),
], lens=34, shift_x=-0.22, fstop=2.8)
follow = aim.constraints.new('COPY_LOCATION'); follow.target = bot      # keep the line robot in frame
keys(follow, 'influence', [(1, 0.55), (48, 0.55), (54, 0.0)])
render(N)

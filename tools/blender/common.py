"""Shared scene kit for the Journey story films (tools/blender/<chapter>.py).

Each chapter script does `from common import *`, builds its scene with these helpers, calls
camera() with its shots, then render(). Run a chapter with:
  blender -b --python tools/blender/<chapter>.py -- OUT_DIR [--frames 1,40,80] [--samples 40]
then encode with:  for f in OUT_DIR/f*.png; do ffmpeg -i "$f" -c:v libwebp -quality 68 img/story/<chapter>/$(basename "${f%.png}").webp; done
"""
import sys, math
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/film'
FRAMES, SAMPLES = None, 40
for i, a in enumerate(argv):
    if a == '--frames': FRAMES = [int(x) for x in argv[i + 1].split(',')]
    if a == '--samples': SAMPLES = int(argv[i + 1])

BG = (0.0021, 0.0027, 0.0037)   # page background #07090c in linear light (Standard view transform)
COPPER = (0.93, 0.6, 0.35)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = 'Standard'
for attr in ('use_raytracing', 'use_shadows', 'use_gtao'):
    if hasattr(sc.eevee, attr): setattr(sc.eevee, attr, True)
sc.eevee.taa_render_samples = SAMPLES
world = bpy.data.worlds.new('w'); sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*BG, 1)


# ---------------------------------------------------------------- materials
def mat(name, color, metal=0.0, rough=0.5, emit=None, estr=0.0, trans=0.0, coat=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if trans: p.inputs['Transmission Weight'].default_value = trans
    if coat: p.inputs['Coat Weight'].default_value = coat
    if alpha < 1: p.inputs['Alpha'].default_value = alpha
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = estr
    return m


def wood(name, light=(0.62, 0.43, 0.24), dark=(0.47, 0.3, 0.15), scale=6.0):
    """Procedural grain: stretched wave bands with a little bump, between two tones."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links
    p = n['Principled BSDF']; p.inputs['Roughness'].default_value = 0.62
    tc = n.new('ShaderNodeTexCoord'); mp = n.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0, scale, scale)
    wv = n.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 7.0
    wv.inputs['Distortion'].default_value = 2.5; wv.inputs['Detail'].default_value = 4.0
    rp = n.new('ShaderNodeValToRGB')
    rp.color_ramp.elements[0].color = (*dark, 1); rp.color_ramp.elements[1].color = (*light, 1)
    l.new(tc.outputs['Object'], mp.inputs['Vector']); l.new(mp.outputs['Vector'], wv.inputs['Vector'])
    l.new(wv.outputs['Fac'], rp.inputs['Fac']); l.new(rp.outputs['Color'], p.inputs['Base Color'])
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08
    l.new(wv.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m


M = {
    'rubber': mat('rubber', (0.012, 0.013, 0.015), rough=0.8),
    'body': mat('body', (0.022, 0.025, 0.03), metal=0.5, rough=0.32, coat=0.5),
    'alu': mat('alu', (0.62, 0.64, 0.67), metal=1.0, rough=0.35),
    'copper': mat('copper', COPPER, metal=1.0, rough=0.28),
    # frosted: clear glass on this near-black page renders as black tubes
    'glass': mat('glass', (0.9, 0.93, 0.97), rough=0.18, trans=0.55, emit=(0.7, 0.8, 0.9), estr=0.06),
    'plunger': mat('plunger', (0.85, 0.86, 0.88), rough=0.4),
    'water': mat('water', (0.2, 0.5, 0.95), rough=0.1, trans=0.6, emit=(0.25, 0.55, 1.0), estr=1.2),
    'steel': mat('steel', (0.75, 0.76, 0.78), metal=1.0, rough=0.25),
    'pcb': mat('pcb', (0.01, 0.045, 0.22), rough=0.3, coat=0.6),
    'green': mat('green', (0.01, 0.09, 0.04), rough=0.3, coat=0.6),
    'chip': mat('chip', (0.015, 0.015, 0.017), rough=0.55),
    'gold': mat('gold', (1.0, 0.78, 0.35), metal=1.0, rough=0.2),
    'toy': mat('toy', (1.0, 0.62, 0.02), rough=0.35, coat=0.4),
    'white': mat('white', (0.9, 0.9, 0.9), rough=0.5),
    'glow': mat('glow', COPPER, emit=(1.0, 0.55, 0.25), estr=8.0),
    'glow_soft': mat('glow_soft', COPPER, emit=(1.0, 0.55, 0.25), estr=2.0),
    'cyan': mat('cyan', (0.3, 0.8, 1.0), emit=(0.3, 0.75, 1.0), estr=6.0),
    'green_glow': mat('green_glow', (0.31, 0.82, 0.55), emit=(0.31, 0.82, 0.55), estr=5.0),
    'red_led': mat('red_led', (1, 0.1, 0.05), emit=(1, 0.08, 0.03), estr=12.0),
    'mat_black': mat('mat_black', (0.008, 0.008, 0.009), rough=0.9),
    'line': mat('line', (0.92, 0.92, 0.9), rough=0.6),
    'wood': wood('wood'),
    'ply': wood('ply', light=(0.72, 0.55, 0.33), dark=(0.6, 0.43, 0.24), scale=3.0),
    'soil': mat('soil', (0.12, 0.07, 0.035), rough=1.0),
}


def floor(color=(0.006, 0.007, 0.009), rough=0.55, near=6.0, far=16.0, size=200, at=(0, 0, 0)):
    """A floor that melts into the page colour with camera distance, so frames sit on the page."""
    m = bpy.data.materials.new('floor'); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links
    p = n['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Roughness'].default_value = rough
    cd = n.new('ShaderNodeCameraData'); fade = n.new('ShaderNodeMapRange')
    fade.inputs['From Min'].default_value, fade.inputs['From Max'].default_value = near, far
    l.new(cd.outputs['View Z Depth'], fade.inputs['Value'])
    em = n.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*BG, 1)
    mx = n.new('ShaderNodeMixShader')
    l.new(fade.outputs['Result'], mx.inputs['Fac'])
    l.new(p.outputs['BSDF'], mx.inputs[1]); l.new(em.outputs['Emission'], mx.inputs[2])
    l.new(mx.outputs['Shader'], n['Material Output'].inputs['Surface'])
    bpy.ops.mesh.primitive_plane_add(size=size, location=at)
    bpy.context.active_object.data.materials.append(m)
    return bpy.context.active_object


# ---------------------------------------------------------------- geometry helpers
def adopt(o, parent, local=(0, 0, 0)):
    o.parent = parent; o.location = local
    return o


def box(name, size, loc, m, bevel=0.03, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.scale = size
    # Blender 5 applies location and rotation too unless told not to; only the size is baked in.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = 3
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def cyl(name, r, h, loc, m, rot=(0, 0, 0), verts=32, bevel=True):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object; o.name = name
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bev', 'BEVEL'); b.width = min(r, h) * 0.15; b.segments = 2
    bpy.ops.object.shade_smooth()
    return o


def sphere(name, r, loc, m, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.active_object; o.name = name
    o.data.materials.append(m); bpy.ops.object.shade_smooth()
    return o


def plate(name, pts, thick, m, loc=(0, 0, 0), bevel=0.02):
    """Extruded 2D outline in the XZ plane (a cut plywood part), thickness along Y."""
    me = bpy.data.meshes.new(name)
    n = len(pts)
    verts = [(x, -thick / 2, z) for x, z in pts] + [(x, thick / 2, z) for x, z in pts]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    o.location = loc; o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
    return o


def empty(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0)):
    o = bpy.data.objects.new(name, None); o.location = loc; o.rotation_euler = rot
    sc.collection.objects.link(o)
    if parent: o.parent = parent
    return o


def curve(name, pts, m, depth=0.03, kind='POLY', closed=False):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = depth; cu.bevel_resolution = 3
    sp = cu.splines.new(kind)
    if kind == 'BEZIER':
        sp.bezier_points.add(len(pts) - 1)
        for i, q in enumerate(pts):
            bp = sp.bezier_points[i]; bp.co = q; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    else:
        sp.points.add(len(pts) - 1)
        for i, q in enumerate(pts): sp.points[i].co = (*q, 1)
    sp.use_cyclic_u = closed
    o = bpy.data.objects.new(name, cu); o.data.materials.append(m)
    sc.collection.objects.link(o)
    return o


def text(name, body, loc, m, size=0.3, rot=(math.pi / 2, 0, 0), extrude=0.01, align='CENTER'):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size; cu.extrude = extrude
    cu.align_x = align; cu.align_y = 'CENTER'
    o = bpy.data.objects.new(name, cu); o.location = loc; o.rotation_euler = rot
    o.data.materials.append(m); sc.collection.objects.link(o)
    return o


def area(loc, target, power, color, size=3.0):
    d = bpy.data.lights.new('a', 'AREA'); d.energy = power; d.color = color; d.size = size
    o = bpy.data.objects.new('a', d); o.location = loc
    sc.collection.objects.link(o)
    o.constraints.new('TRACK_TO').target = target
    return o


def spot(loc, target, power, color, angle=0.45, blend=0.4):
    d = bpy.data.lights.new('s', 'SPOT'); d.energy = power; d.color = color
    d.spot_size = angle; d.spot_blend = blend
    o = bpy.data.objects.new('s', d); o.location = loc
    sc.collection.objects.link(o)
    o.constraints.new('TRACK_TO').target = target
    return o


def studio(x, z=0.8, y=0.0, key_w=650, rim_w=900, fill_w=350):
    """Warm key, cool rim, low copper kicker around one subject."""
    t = empty('t', (x, y, z))
    area((x - 2.5, y - 3.0, 5.5), t, key_w, (1.0, 0.8, 0.62), size=3)
    area((x + 1.5, y + 4.0, 4.5), t, rim_w, (0.5, 0.65, 1.0), size=1.5)
    area((x + 3.0, y - 1.0, 3.0), t, fill_w, (1.0, 0.6, 0.3), size=1.0)
    return t


def key(o, path, frame, value):
    setattr(o, path, value); o.keyframe_insert(path, frame=frame)


def keys(o, path, frames_values):
    for f, v in frames_values: key(o, path, f, v)


# ---------------------------------------------------------------- camera and render
def camera(shots, lens=34, shift_x=-0.26, fstop=2.8):
    """shots: [(frame, camera_xyz, aim_xyz)]. shift_x keeps the subject right of the copy column."""
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.shift_x = shift_x
    cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    aim = empty('aim', shots[0][2])
    cam.constraints.new('TRACK_TO').target = aim
    cd.dof.focus_object = aim
    for f, c, a in shots:
        key(cam, 'location', f, c); key(aim, 'location', f, a)
    return cam, aim


def render(n):
    sc.frame_start, sc.frame_end = 1, n
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    for f in (FRAMES or range(1, n + 1)):
        sc.frame_set(f)
        sc.render.filepath = f'{OUT}/f{f:03d}.png'
        bpy.ops.render.render(write_still=True)
    print('DONE', OUT)

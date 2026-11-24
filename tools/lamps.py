"""Turkish mosaic lamps for the Nasip Et hero, rendered in Cycles with a transparent background.
Each lamp is rendered twice: unlit (room light only) and lit (glass glowing from inside),
so the page can switch them on for real.

blender -b -P tools/lamps.py -- <out_dir> [samples]
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.abspath('lamps_out')
SAMPLES = int(argv[1]) if len(argv) > 1 else 96
os.makedirs(OUT, exist_ok=True)

# palettes modelled on the lamps in the restaurant photos
PALETTES = {
    'ruby':   [(0.55, 0.02, 0.04), (0.80, 0.06, 0.10), (0.95, 0.85, 0.80), (0.35, 0.01, 0.03), (0.90, 0.55, 0.20)],
    'pearl':  [(0.92, 0.90, 0.86), (0.70, 0.66, 0.60), (0.30, 0.28, 0.27), (0.95, 0.78, 0.45), (0.55, 0.50, 0.48)],
    'iznik':  [(0.02, 0.35, 0.55), (0.05, 0.60, 0.62), (0.95, 0.92, 0.85), (0.80, 0.08, 0.06), (0.95, 0.70, 0.05)],
    'amber':  [(0.95, 0.45, 0.04), (0.85, 0.20, 0.03), (0.98, 0.75, 0.20), (0.60, 0.08, 0.04), (0.98, 0.92, 0.70)],
    'carnival': [(0.95, 0.80, 0.05), (0.05, 0.45, 0.85), (0.85, 0.10, 0.25), (0.10, 0.65, 0.30), (0.95, 0.55, 0.05)],
}
# (name, palette, globe rotation for a different tile layout, globe squash)
LAMPS = [
    ('ruby', 'ruby', 0, 0.94),
    ('pearl', 'pearl', 30, 0.9),
    ('iznik', 'iznik', 60, 0.96),
    ('amber', 'amber', 15, 0.92),
    ('carnival', 'carnival', 45, 0.95),
]

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'GPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices: d.use = True
    except Exception as e:
        print('GPU setup:', e)
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = 'OPTIX'
    except Exception: pass
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 640, 1500
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.use_persistent_data = True
    return sc

def lathe(name, prof, steps=64):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, axis=(0, 0, 1), cent=(0, 0, 0), steps=steps, angle=math.tau, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    return ob

def brass_mat():
    m = bpy.data.materials.new('brass'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.62, 0.42, 0.16, 1)
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = 0.32
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 180
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

def glass_mat(name, pal, lit):
    m = bpy.data.materials.new('glass_' + name); m.use_nodes = True
    nt = m.node_tree; L = nt.links; N = nt.nodes
    b = N['Principled BSDF']
    coord = N.new('ShaderNodeTexCoord')
    vor = N.new('ShaderNodeTexVoronoi'); vor.voronoi_dimensions = '3D'; vor.inputs['Scale'].default_value = 78; vor.inputs['Randomness'].default_value = 0.55
    vor_e = N.new('ShaderNodeTexVoronoi'); vor_e.voronoi_dimensions = '3D'; vor_e.feature = 'DISTANCE_TO_EDGE'; vor_e.inputs['Scale'].default_value = 78; vor_e.inputs['Randomness'].default_value = 0.55
    L.new(coord.outputs['Object'], vor.inputs['Vector']); L.new(coord.outputs['Object'], vor_e.inputs['Vector'])
    # banded layout like real lamps: latitude bands shift which colours a band uses
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(coord.outputs['Object'], sep.inputs['Vector'])
    band = N.new('ShaderNodeMath'); band.operation = 'MULTIPLY'; band.inputs[1].default_value = 30
    L.new(sep.outputs['Z'], band.inputs[0])
    flo = N.new('ShaderNodeMath'); flo.operation = 'FLOOR'; L.new(band.outputs[0], flo.inputs[0])
    bandk = N.new('ShaderNodeMath'); bandk.operation = 'MULTIPLY'; bandk.inputs[1].default_value = 0.137
    L.new(flo.outputs[0], bandk.inputs[0])
    cellsep = N.new('ShaderNodeSeparateColor'); L.new(vor.outputs['Color'], cellsep.inputs['Color'])
    cellk = N.new('ShaderNodeMath'); cellk.operation = 'MULTIPLY'; cellk.inputs[1].default_value = 0.55
    L.new(cellsep.outputs[0], cellk.inputs[0])
    add = N.new('ShaderNodeMath'); add.operation = 'ADD'; L.new(bandk.outputs[0], add.inputs[0]); L.new(cellk.outputs[0], add.inputs[1])
    fr = N.new('ShaderNodeMath'); fr.operation = 'FRACT'; L.new(add.outputs[0], fr.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    while len(els) < len(pal): els.new(0.5)
    for i, c in enumerate(pal):
        els[i].position = i / len(pal); els[i].color = (*c, 1)
    L.new(fr.outputs[0], ramp.inputs['Fac'])
    # grout lines between tesserae
    grout = N.new('ShaderNodeMapRange'); grout.inputs['From Min'].default_value = 0.0; grout.inputs['From Max'].default_value = 0.09
    L.new(vor_e.outputs['Distance'], grout.inputs['Value'])     # 0 on the line, 1 inside a tile
    # mirror tiles: cells with a high green channel
    mir = N.new('ShaderNodeMath'); mir.operation = 'GREATER_THAN'; mir.inputs[1].default_value = 0.86
    L.new(cellsep.outputs[1], mir.inputs[0])
    tile_metal = N.new('ShaderNodeMath'); tile_metal.operation = 'MULTIPLY'
    L.new(mir.outputs[0], tile_metal.inputs[0]); L.new(grout.outputs['Result'], tile_metal.inputs[1])
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    L.new(grout.outputs['Result'], inv.inputs[1])
    metal = N.new('ShaderNodeMath'); metal.operation = 'ADD'
    L.new(tile_metal.outputs[0], metal.inputs[0]); L.new(inv.outputs[0], metal.inputs[1])   # grout is brass
    gcol = N.new('ShaderNodeMix'); gcol.data_type = 'RGBA'
    # Blender 5: Mix sockets share names, so address them by identifier
    sin = lambda node, ident: next(s for s in node.inputs if s.identifier == ident)
    sout = lambda node, ident: next(s for s in node.outputs if s.identifier == ident)
    L.new(grout.outputs['Result'], sin(gcol, 'Factor_Float'))
    sin(gcol, 'A_Color').default_value = (0.10, 0.06, 0.03, 1)
    L.new(ramp.outputs['Color'], sin(gcol, 'B_Color'))
    L.new(sout(gcol, 'Result_Color'), b.inputs['Base Color'])
    L.new(metal.outputs[0], b.inputs['Metallic'])
    b.inputs['Roughness'].default_value = 0.12
    # slight facet per tile
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35
    L.new(vor.outputs['Distance'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    if lit:
        L.new(ramp.outputs['Color'], b.inputs['Emission Color'])
        em = N.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; em.inputs[1].default_value = 2.4
        nomir = N.new('ShaderNodeMath'); nomir.operation = 'SUBTRACT'; nomir.inputs[0].default_value = 1.0
        L.new(metal.outputs[0], nomir.inputs[1])
        L.new(nomir.outputs[0], em.inputs[0])
        L.new(em.outputs[0], b.inputs['Emission Strength'])
    return m

def chain(top_z, length, link=0.011):
    obs = []
    n = int(length / (link * 1.55))
    for i in range(n):
        bpy.ops.mesh.primitive_torus_add(major_radius=link, minor_radius=link * 0.22, major_segments=20, minor_segments=8,
                                         location=(0, 0, top_z + i * link * 1.55))
        o = bpy.context.active_object
        o.rotation_euler = (math.pi / 2, 0, (math.pi / 2) * (i % 2))
        o.scale = (0.75, 1.0, 1.0)
        obs.append(o)
    return obs

def build(name, pal, rot, squash, lit):
    reset()
    sc = bpy.context.scene
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    grad_tex = world.node_tree.nodes.new('ShaderNodeTexGradient')
    sky = world.node_tree.nodes.new('ShaderNodeValToRGB')
    sky.color_ramp.elements[0].color = (0.04, 0.012, 0.008, 1); sky.color_ramp.elements[1].color = (0.35, 0.16, 0.07, 1)
    tc = world.node_tree.nodes.new('ShaderNodeTexCoord')
    mp = world.node_tree.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, math.pi / 2, 0)
    world.node_tree.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    world.node_tree.links.new(mp.outputs['Vector'], grad_tex.inputs['Vector'])
    world.node_tree.links.new(grad_tex.outputs['Fac'], sky.inputs['Fac'])
    world.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.6 if not lit else 0.35

    brass = brass_mat()
    glass = glass_mat(name, PALETTES[pal], lit)
    # globe
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=0.1, location=(0, 0, 0))
    globe = bpy.context.active_object
    globe.scale = (1, 1, squash); globe.rotation_euler = (0, 0, math.radians(rot))
    bpy.ops.object.shade_smooth()
    globe.data.materials.append(glass)
    top = 0.1 * squash
    # cap with a little pierced crown, then the hook ring
    cap = lathe('cap', [(0.0, top + 0.05), (0.010, top + 0.05), (0.012, top + 0.04), (0.02, top + 0.032), (0.034, top + 0.022),
                        (0.046, top + 0.008), (0.050, top - 0.004), (0.044, top - 0.010)])
    cap.data.materials.append(brass)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.012, minor_radius=0.003, location=(0, 0, top + 0.062))
    ring = bpy.context.active_object; ring.rotation_euler = (math.pi / 2, 0, 0); ring.data.materials.append(brass)
    bot = -0.1 * squash
    bowl = lathe('bowl', [(0.052, bot + 0.022), (0.060, bot + 0.012), (0.058, bot - 0.004), (0.046, bot - 0.022), (0.030, bot - 0.034),
                          (0.034, bot - 0.044), (0.022, bot - 0.062), (0.012, bot - 0.080), (0.016, bot - 0.090), (0.007, bot - 0.108),
                          (0.010, bot - 0.116), (0.002, bot - 0.135), (0.0, bot - 0.137)])
    bowl.data.materials.append(brass)
    for o in chain(top + 0.074, 0.62):
        o.data.materials.append(brass)
    # light: a soft key from the front left, a warm rim; inside light only when lit
    def area(loc, power, size, color, rot):
        l = bpy.data.lights.new('a', 'AREA'); l.energy = power; l.size = size; l.color = color
        o = bpy.data.objects.new('a', l); o.location = loc; o.rotation_euler = rot; bpy.context.collection.objects.link(o)
        o.visible_camera = False
    area((-0.6, -0.8, 0.5), 18 if not lit else 6, 0.8, (1.0, 0.82, 0.62), (math.radians(60), 0, math.radians(-35)))
    area((0.7, 0.5, 0.3), 10, 0.6, (1.0, 0.5, 0.3), (math.radians(70), 0, math.radians(130)))
    if lit:
        pl = bpy.data.lights.new('in', 'POINT'); pl.energy = 9; pl.shadow_soft_size = 0.03; pl.color = (1.0, 0.78, 0.5)
        po = bpy.data.objects.new('in', pl); po.location = (0, 0, -0.01); bpy.context.collection.objects.link(po)
        po.visible_camera = False
    # camera: a little below the lamp, looking up, long lens
    cam = bpy.data.cameras.new('c'); cam.lens = 135; cam.clip_end = 50
    co = bpy.data.objects.new('c', cam); bpy.context.collection.objects.link(co); sc.camera = co
    co.location = (0, -3.4, -0.32)
    target = Vector((0, 0, 0.18))
    co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.view_settings.view_transform = 'Standard'
    sc.render.filepath = os.path.join(OUT, f'lamp-{name}-{"on" if lit else "off"}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', sc.render.filepath)

only = os.environ.get('LAMP_ONLY')
for name, pal, rot, sq in LAMPS:
    if only and name != only: continue
    for lit in (False, True):
        build(name, pal, rot, sq, lit)

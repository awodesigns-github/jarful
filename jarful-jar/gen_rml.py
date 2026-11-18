"""Generate jar/scene.rml (Rive Markup) from jar-layers.svg (exported from Figma)."""
import xml.etree.ElementTree as ET, re, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, 'jar-layers.svg')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'rive', 'scene.rml')
NS = '{http://www.w3.org/2000/svg}'
DEG = math.pi / 180

# ---------------------------------------------------------------- ids
class Ids:
    def __init__(self, start=10): self.n = start
    def __call__(self):
        self.n += 1; return f'0:{self.n}'
nid = Ids()

def f(v): return ('%.3f' % v).rstrip('0').rstrip('.') if abs(v) > 1e-9 else '0'

# ---------------------------------------------------------------- view model
VM = nid(); VMI = nid()
ENUM = nid(); EV = {k: nid() for k in ('waiting', 'happy', 'sleepy')}
P = {}
for name in ['fillLevel', 'face', 'noteColour', 'reducedMotion', 'glassColour', 'lineColour', 'labelColour',
             'dropNote', 'revealNote', 'tapJar', 'seal', 'celebrate', 'noteLanded', 'noteRevealed']:
    P[name] = nid()
def path(p): return f'{VM}-{P[p]}'

LINE = '2E2A26'; GLASS = 'FFFFFF'; LABEL = 'FBF6EC'

# ---------------------------------------------------------------- svg -> shapes
def colour(c, alpha=1.0):
    if c is None or c == 'none': return None
    c = c.strip()
    named = {'white': 'FFFFFF', 'black': '000000'}
    hexv = named.get(c.lower(), c.lstrip('#').upper())
    if len(hexv) == 3: hexv = ''.join(ch * 2 for ch in hexv)
    return '%02X%s' % (round(alpha * 255), hexv)

def bind_for(kind, hexv, theme):
    """Return a view model property to bind this paint to (light/dark), or None."""
    if not theme: return None
    rgb = hexv[2:]
    if rgb == LINE: return 'lineColour'
    if kind == 'fill' and rgb == GLASS: return 'glassColour'
    if kind == 'fill' and rgb == LABEL: return 'labelColour'
    return None

def paint_xml(kind, hexv, el, theme, ind):
    prop = bind_for(kind, hexv, theme)
    b = f'\n{ind}    <DataBindContext sourcePathIds="{path(prop)}" propertyKey="37"/>\n{ind}' if prop else ''
    sc = f'<SolidColor colorValue="{hexv}" name="Colour">{b}</SolidColor>' if prop else f'<SolidColor colorValue="{hexv}" name="Colour"/>'
    if kind == 'fill':
        return f'{ind}<Fill name="Fill">{sc}</Fill>'
    cap = el.get('stroke-linecap', 'butt'); join = el.get('stroke-linejoin', 'miter')
    return f'{ind}<Stroke thickness="{f(float(el.get("stroke-width", "1")))}" cap="{cap}" join="{join}" name="Stroke">{sc}</Stroke>'

def tokenize(d):
    return re.findall(r'[MmLlHhVvCcZz]|-?\d*\.?\d+(?:e-?\d+)?', d)

def parse_path(d):
    toks = tokenize(d); i = 0; cmd = None; contours = []; cur = None; pt = (0, 0)
    def num():
        nonlocal i; v = float(toks[i]); i += 1; return v
    while i < len(toks):
        t = toks[i]
        if re.match(r'[A-Za-z]', t): cmd = t; i += 1
        if cmd in 'Mm':
            x, y = num(), num()
            if cmd == 'm': x, y = pt[0] + x, pt[1] + y
            cur = {'nodes': [{'p': (x, y), 'in': None, 'out': None}], 'closed': False}; contours.append(cur); pt = (x, y)
            cmd = 'L' if cmd == 'M' else 'l'
        elif cmd in 'LlHhVv':
            if cmd == 'L': x, y = num(), num()
            elif cmd == 'l': x, y = pt[0] + num(), pt[1] + num()
            elif cmd == 'H': x, y = num(), pt[1]
            elif cmd == 'h': x, y = pt[0] + num(), pt[1]
            elif cmd == 'V': x, y = pt[0], num()
            else: x, y = pt[0], pt[1] + num()
            cur['nodes'].append({'p': (x, y), 'in': None, 'out': None}); pt = (x, y)
        elif cmd in 'Cc':
            vals = [num() for _ in range(6)]
            if cmd == 'c': vals = [vals[k] + pt[k % 2] for k in range(6)]
            cur['nodes'][-1]['out'] = (vals[0], vals[1])
            cur['nodes'].append({'p': (vals[4], vals[5]), 'in': (vals[2], vals[3]), 'out': None}); pt = (vals[4], vals[5])
        elif cmd in 'Zz':
            cur['closed'] = True
            n = cur['nodes']
            if len(n) > 1 and abs(n[-1]['p'][0] - n[0]['p'][0]) < 0.01 and abs(n[-1]['p'][1] - n[0]['p'][1]) < 0.01:
                n[0]['in'] = n[-1]['in']; n.pop()
            pt = n[0]['p']; cmd = None
        else:
            raise ValueError('unsupported path command %r in %s' % (cmd, d[:60]))
    return contours

def vertex_xml(node, ox, oy, ind):
    x, y = node['p']
    if not node['in'] and not node['out']:
        return f'{ind}<StraightVertex x="{f(x - ox)}" y="{f(y - oy)}"/>'
    def polar(h):
        if not h: return 0.0, 0.0
        dx, dy = h[0] - x, h[1] - y
        return math.atan2(dy, dx), math.hypot(dx, dy)
    ir, idist = polar(node['in']); orot, odist = polar(node['out'])
    if not node['in']: ir = orot + math.pi
    if not node['out']: orot = ir + math.pi
    return (f'{ind}<CubicDetachedVertex x="{f(x - ox)}" y="{f(y - oy)}" inRotation="{f(ir)}" inDistance="{f(idist)}" '
            f'outRotation="{f(orot)}" outDistance="{f(odist)}"/>')

def clockwise(nodes):
    a = 0
    for k in range(len(nodes)):
        x1, y1 = nodes[k]['p']; x2, y2 = nodes[(k + 1) % len(nodes)]['p']
        a += x1 * y2 - x2 * y1
    return a >= 0   # y-down coordinates

def element_shape(el, tx, ty, ox, oy, theme, ind, name, sid=None):
    """One SVG element -> one <Shape>. (tx,ty) = accumulated svg translate, (ox,oy) = parent node's absolute origin."""
    tag = el.tag.replace(NS, '')
    op = float(el.get('opacity', '1'))
    fill = colour(el.get('fill'), float(el.get('fill-opacity', '1')))
    stroke = colour(el.get('stroke'), float(el.get('stroke-opacity', '1')))
    if el.get('stroke') and el.get('stroke-width') is None and tag == 'path' and fill: stroke = None  # figma hairline helper
    idattr = f' id="{sid}"' if sid else ''
    opattr = f' opacity="{f(op)}"' if op != 1 else ''
    geo = []; sx = sy = 0.0; rot = 0.0
    if tag == 'rect':
        x, y = float(el.get('x', 0)) + tx, float(el.get('y', 0)) + ty
        w, h = float(el.get('width')), float(el.get('height')); rx = float(el.get('rx', 0))
        m = re.match(r'rotate\(([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\)', el.get('transform', ''))
        if m: rot = float(m.group(1)) * DEG
        sx, sy = x, y
        geo.append(f'{ind}    <Rectangle width="{f(w)}" height="{f(h)}" originX="0" originY="0" cornerRadiusTL="{f(rx)}" name="Path"/>')
    elif tag in ('ellipse', 'circle'):
        cx, cy = float(el.get('cx')) + tx, float(el.get('cy')) + ty
        rx = float(el.get('rx', el.get('r'))); ry = float(el.get('ry', el.get('r')))
        sx, sy = cx, cy
        geo.append(f'{ind}    <Ellipse width="{f(2 * rx)}" height="{f(2 * ry)}" originX="0.5" originY="0.5" name="Path"/>')
    elif tag == 'path':
        for c in parse_path(el.get('d')):
            for nd in c['nodes']:
                nd['p'] = (nd['p'][0] + tx, nd['p'][1] + ty)
                if nd['in']: nd['in'] = (nd['in'][0] + tx, nd['in'][1] + ty)
                if nd['out']: nd['out'] = (nd['out'][0] + tx, nd['out'][1] + ty)
            cw = 'true' if clockwise(c['nodes']) else 'false'
            closed = ' isClosed="true"' if c['closed'] else ''
            vs = '\n'.join(vertex_xml(nd, ox, oy, ind + '        ') for nd in c['nodes'])
            geo.append(f'{ind}    <PointsPath isClockwise="{cw}"{closed} name="Path">\n{vs}\n{ind}    </PointsPath>')
        sx, sy = ox, oy
    else:
        raise ValueError(tag)
    paints = []
    if fill: paints.append(paint_xml('fill', fill, el, theme, ind + '    '))
    if stroke: paints.append(paint_xml('stroke', stroke, el, theme, ind + '    '))  # stroke after fill = on top
    rattr = f' rotation="{f(rot)}"' if rot else ''
    return (f'{ind}<Shape x="{f(sx - ox)}" y="{f(sy - oy)}"{rattr}{opattr} name="{name}"{idattr}>\n'
            + '\n'.join(geo + paints) + f'\n{ind}</Shape>')

svg = ET.parse(SVG).getroot()
GROUPS = {g.get('id'): g for g in svg.iter(NS + 'g') if g.get('id')}

def leaves(g, tx=0.0, ty=0.0):
    """Yield (element, tx, ty) in SVG paint order (bottom first)."""
    m = re.match(r'translate\(([-\d.e]+)\s+([-\d.e]+)\)', g.get('transform', '') or '')
    if m: tx, ty = tx + float(m.group(1)), ty + float(m.group(2))
    for c in g:
        if c.tag == NS + 'g': yield from leaves(c, tx, ty)
        else: yield c, tx, ty

def group_shapes(gid, ox, oy, theme, ind, order=None):
    items = list(leaves(GROUPS[gid]))
    if order: items = [items[k] for k in order]
    items = list(reversed(items))  # Rive: first declared draws on top
    return '\n'.join(element_shape(el, tx, ty, ox, oy, theme, ind, f'{gid}_{k + 1}') for k, (el, tx, ty) in enumerate(items))

# ---------------------------------------------------------------- jar body builder
RIG_X, RIG_Y = 130.0, 322.0       # pivot: bottom centre of the jar
LID_X, LID_Y = 50.0, 14.0         # lid top-left (closed)
LID_OPEN = (132.11, -6.40, 22 * DEG)   # Figma "Lid=Open" pose: top-left and rotation
WAX_X, WAX_Y = 130.0, 33.0

def node(name, x, y, inner, ind, nid_=None, extra=''):
    i = f' id="{nid_}"' if nid_ else ''
    return f'{ind}<Node x="{f(x)}" y="{f(y)}"{extra} name="{name}"{i}>\n{inner}\n{ind}</Node>'

def slip_group(nums, ox, oy, ind, theme=False):
    return '\n'.join(group_shapes(f'slip_{n:02d}', ox, oy, theme, ind) for n in reversed(nums))

def slip_shape(name, ind, colour_bind=None, colour_hex='FFE8432E', sid=None):
    """A free-standing note slip centred on its node origin (44 x 30, r7) with its writing line."""
    b = (f'<SolidColor colorValue="{colour_hex}" name="Colour">\n{ind}            <DataBindContext sourcePathIds="{path(colour_bind)}" propertyKey="37"/>\n{ind}        </SolidColor>'
         if colour_bind else f'<SolidColor colorValue="{colour_hex}" name="Colour"/>')
    i = f' id="{sid}"' if sid else ''
    return (f'{ind}<Shape name="{name}_line">\n{ind}    <PointsPath isClosed="false" name="Path">\n'
            f'{ind}        <StraightVertex x="-17" y="0"/>\n{ind}        <StraightVertex x="17" y="0"/>\n{ind}    </PointsPath>\n'
            f'{ind}    <Stroke thickness="1.5" cap="round" join="round" name="Stroke"><SolidColor colorValue="FF2E2A26" name="Colour"/></Stroke>\n{ind}</Shape>\n'
            f'{ind}<Shape name="{name}"{i}>\n{ind}    <Rectangle width="44" height="30" originX="0.5" originY="0.5" cornerRadiusTL="7" name="Path"/>\n'
            f'{ind}    <Fill name="Fill">{b}</Fill>\n'
            f'{ind}    <Stroke thickness="2" name="Stroke"><SolidColor colorValue="FF2E2A26" name="Colour"/></Stroke>\n{ind}</Shape>')

# ================================================================= JAR ARTBOARD
J = {k: nid() for k in ['artboard', 'rig', 'lid', 'wax_pop', 'wax_vis', 'zz', 'face_waiting', 'face_happy', 'face_sleepy',
                        'drop', 'drop_body', 'notes', 'few', 'half', 'full', 'clip', 'ripples', 'ring1', 'ring2', 'celebrate']}
CEL = [nid() for _ in range(6)]
R = '            '  # indent inside rig

rig_children = []
rig_children.append(node('wax_pop', WAX_X - RIG_X, WAX_Y - RIG_Y,
    node('wax_vis', 0, 0, group_shapes('wax_seal', WAX_X, WAX_Y, False, R + '        ', order=[3, 1, 0, 2]), R + '    ', J['wax_vis'], ' opacity="0"'),
    R, J['wax_pop']))
rig_children.append(node('lid', LID_X - RIG_X, LID_Y - RIG_Y, group_shapes('lid', LID_X, LID_Y, True, R + '    '), R, J['lid']))
rig_children.append(node('zz', 0, 0, group_shapes('zz', RIG_X, RIG_Y, False, R + '    '), R, J['zz'], ' opacity="0"'))
rig_children.append(node('face_sleepy', 0, 0, group_shapes('face_sleepy', RIG_X, RIG_Y, True, R + '    '), R, J['face_sleepy'], ' opacity="0"'))
rig_children.append(node('face_happy', 0, 0, group_shapes('face_happy', RIG_X, RIG_Y, True, R + '    '), R, J['face_happy'], ' opacity="0"'))
rig_children.append(node('face_waiting', 0, 0, group_shapes('face_waiting', RIG_X, RIG_Y, True, R + '    '), R, J['face_waiting']))
for g in ['label', 'rim', 'highlight', 'outline']:
    rig_children.append(group_shapes(g, RIG_X, RIG_Y, True, R))
rig_children.append(node('drop', 0, -300 - RIG_Y + 300, node('drop_body', 0, 0, slip_shape('drop_slip', R + '        ', 'noteColour', 'FFF7C31B'),
                         R + '    ', J['drop_body']), R, J['drop'], ' opacity="0"'))
notes_inner = (node('slips_full', 0, 0, slip_group(range(19, 37), RIG_X, RIG_Y, R + '        '), R + '    ', J['full'], ' opacity="0"') + '\n'
               + node('slips_half', 0, 0, slip_group(range(6, 19), RIG_X, RIG_Y, R + '        '), R + '    ', J['half'], ' opacity="0"') + '\n'
               + node('slips_few', 0, 0, slip_group(range(1, 6), RIG_X, RIG_Y, R + '        '), R + '    ', J['few'], ' opacity="0"') + '\n'
               + f'{R}    <ClippingShape sourceId="{J["clip"]}" name="Glass clip"/>')
rig_children.append(node('notes', 0, 0, notes_inner, R, J['notes']))
# clip source: the glass outline, no paint
clip_el = list(leaves(GROUPS['notes_clip']))[0]
cs = element_shape(clip_el[0], clip_el[1], clip_el[2], RIG_X, RIG_Y, False, R, 'notes_clip', J['clip'])
cs = re.sub(r'\n\s*<Fill name="Fill">.*?</Fill>', '', cs)
rig_children.append(cs)
rig_children.append(group_shapes('glass', RIG_X, RIG_Y, True, R))

ring = lambda name, rid: (f'            <Node scaleX="0.5" scaleY="0.5" opacity="0" name="{name}" id="{rid}">\n'
                          f'                <Shape name="{name}_shape"><Ellipse width="180" height="180" originX="0.5" originY="0.5" name="Path"/>\n'
                          f'                    <Stroke thickness="4" cap="round" name="Stroke"><SolidColor colorValue="FFC8755A" name="Colour"/></Stroke></Shape>\n'
                          f'            </Node>')
CEL_COLOURS = ['FFE8432E', 'FFF7C31B', 'FF2FA35B', 'FF2459D6', 'FFF2629B', 'FF3DB8E8']
cel_nodes = '\n'.join(f'            <Node x="0" y="0" opacity="0" name="burst_{k + 1}" id="{CEL[k]}">\n'
                      + slip_shape(f'burst_slip_{k + 1}', '                ', None, CEL_COLOURS[k]) + '\n            </Node>' for k in range(6))

# ---------------------------------------------------------------- animation helpers
EASE_OUT = (0.215, 0.61, 0.355, 1.0)
EASE_IN = (0.55, 0.055, 0.675, 0.19)
EASE_IO = (0.42, 0, 0.58, 1)

def kf(frame, value, interp='hold', curve=None, kind='Double'):
    if interp == 'cubic':
        c = curve or EASE_OUT
        return (f'<KeyFrame{kind} frame="{frame}" value="{f(value)}" interpolationType="cubic">'
                f'<CubicEaseInterpolator x1="{c[0]}" y1="{c[1]}" x2="{c[2]}" y2="{c[3]}"/></KeyFrame{kind}>')
    return f'<KeyFrame{kind} frame="{frame}" value="{f(value)}" interpolationType="{interp}"/>'

def anim(name, aid, duration, tracks, loop='oneShot'):
    """tracks: {objectId: {prop: [kf strings]}}"""
    body = []
    for oid, props in tracks.items():
        kp = ''.join(f'\n            <KeyedProperty property="{p}">' + ''.join('\n                ' + k for k in ks) + '\n            </KeyedProperty>'
                     for p, ks in props.items())
        body.append(f'        <KeyedObject objectId="{oid}">{kp}\n        </KeyedObject>')
    return f'    <LinearAnimation duration="{duration}" loopValue="{loop}" name="{name}" id="{aid}">\n' + '\n'.join(body) + '\n    </LinearAnimation>'

def hold(v): return [kf(0, v)]
A = {}
def new_anim(name): A[name] = nid(); return A[name]
anims = []

# rest values for everything the action layer animates
LIDX, LIDY = LID_X - RIG_X, LID_Y - RIG_Y
LOX, LOY, LOR = LID_OPEN[0] - RIG_X, LID_OPEN[1] - RIG_Y, LID_OPEN[2]
DROP_TOP, DROP_LAND = -10 - RIG_Y, 250 - RIG_Y   # in rig space
def lid_rest(): return {J['lid']: {'x': hold(LIDX), 'y': hold(LIDY), 'rotation': hold(0)}}
def rest_tracks():
    t = {J['lid']: {'x': hold(LIDX), 'y': hold(LIDY), 'rotation': hold(0)},
         J['drop']: {'opacity': hold(0), 'y': hold(DROP_TOP)},
         J['drop_body']: {'scaleY': hold(1), 'rotation': hold(0)},
         J['rig']: {'rotation': hold(0)},
         J['wax_pop']: {'scaleX': hold(1), 'scaleY': hold(1)},
         J['ring1']: {'opacity': hold(0), 'scaleX': hold(0.5), 'scaleY': hold(0.5)},
         J['ring2']: {'opacity': hold(0), 'scaleX': hold(0.5), 'scaleY': hold(0.5)}}
    for c in CEL: t[c] = {'opacity': hold(0), 'x': hold(0), 'y': hold(0)}
    return t

def merged(base, extra):
    out = {k: dict(v) for k, v in base.items()}
    for k, v in extra.items(): out.setdefault(k, {}).update(v)
    return out

def lid_move(f0, f1, opening, curve=EASE_OUT):
    a, b = ((LIDX, LIDY, 0), (LOX, LOY, LOR)) if opening else ((LOX, LOY, LOR), (LIDX, LIDY, 0))
    return {J['lid']: {'x': [kf(0, a[0]), kf(f0, a[0], 'cubic', curve), kf(f1, b[0])],
                       'y': [kf(0, a[1]), kf(f0, a[1], 'cubic', curve), kf(f1, b[1])],
                       'rotation': [kf(0, a[2]), kf(f0, a[2], 'cubic', curve), kf(f1, b[2])]}}

anims.append(anim('idle', new_anim('idle'), 1, rest_tracks()))
# 1.5 drop: lid opens 250 ms, slip falls 550 ms
anims.append(anim('drop_fall', new_anim('drop_fall'), 48, merged(rest_tracks(), {**lid_move(0, 15, True),
    J['drop']: {'opacity': hold(1), 'y': [kf(0, DROP_TOP), kf(15, DROP_TOP, 'cubic', EASE_IN), kf(48, DROP_LAND)]},
    J['drop_body']: {'rotation': [kf(15, -10 * DEG, 'cubic'), kf(48, 8 * DEG)]}})))
# landing: squash, slip joins the pile, lid closes, wobble +-2 deg once
anims.append(anim('drop_land', new_anim('drop_land'), 36, merged(rest_tracks(), {**lid_move(4, 19, False),
    J['drop']: {'opacity': [kf(0, 1), kf(8, 1, 'cubic'), kf(18, 0)], 'y': hold(DROP_LAND)},
    J['drop_body']: {'scaleY': [kf(0, 0.85, 'cubic'), kf(8, 1)], 'rotation': hold(8 * DEG)},
    J['rig']: {'rotation': [kf(0, 0, 'cubic'), kf(7, 2 * DEG, 'cubic', EASE_IO), kf(16, -2 * DEG, 'cubic', EASE_IO), kf(26, 0)]}})))
# 7.3 reduced drop: 200 ms fade in place
anims.append(anim('drop_reduced', new_anim('drop_reduced'), 12, merged(rest_tracks(), {
    J['drop']: {'opacity': [kf(0, 0, 'cubic'), kf(12, 1)], 'y': hold(DROP_LAND)}})))
anims.append(anim('drop_reduced_end', new_anim('drop_reduced_end'), 12, merged(rest_tracks(), {
    J['drop']: {'opacity': [kf(0, 1, 'cubic'), kf(12, 0)], 'y': hold(DROP_LAND)}})))
# 3.2 reveal: lid opens 250 ms, note rises 500 ms
REVEAL_FROM, REVEAL_TO = 230 - RIG_Y, -40 - RIG_Y
anims.append(anim('reveal', new_anim('reveal'), 45, merged(rest_tracks(), {**lid_move(0, 15, True),
    J['drop']: {'opacity': [kf(0, 0), kf(12, 0, 'cubic'), kf(18, 1)], 'y': [kf(0, REVEAL_FROM), kf(15, REVEAL_FROM, 'cubic'), kf(45, REVEAL_TO)]},
    J['drop_body']: {'rotation': [kf(15, 6 * DEG, 'cubic'), kf(45, -4 * DEG)]}})))
anims.append(anim('reveal_end', new_anim('reveal_end'), 18, merged(rest_tracks(), {**lid_move(3, 18, False),
    J['drop']: {'opacity': [kf(0, 1, 'cubic'), kf(6, 0)], 'y': hold(REVEAL_TO)}, J['drop_body']: {'rotation': hold(-4 * DEG)}})))
anims.append(anim('reveal_reduced', new_anim('reveal_reduced'), 12, merged(rest_tracks(), {
    J['drop']: {'opacity': [kf(0, 0, 'cubic'), kf(12, 1)], 'y': hold(REVEAL_TO)}})))
anims.append(anim('reveal_reduced_end', new_anim('reveal_reduced_end'), 12, merged(rest_tracks(), {
    J['drop']: {'opacity': [kf(0, 1, 'cubic'), kf(12, 0)], 'y': hold(REVEAL_TO)}})))
# 3.1 ripple: 2 rings, 400 ms
def ring_track(start):
    return {'opacity': [kf(0, 0), kf(start, 0.7, 'cubic'), kf(start + 18, 0)],
            'scaleX': [kf(0, 0.5), kf(start, 0.5, 'cubic'), kf(start + 18, 1.25)],
            'scaleY': [kf(0, 0.5), kf(start, 0.5, 'cubic'), kf(start + 18, 1.25)]}
anims.append(anim('ripple', new_anim('ripple'), 24, merged(rest_tracks(), {J['ring1']: ring_track(0), J['ring2']: ring_track(6)})))
anims.append(anim('ripple_reduced', new_anim('ripple_reduced'), 24, merged(rest_tracks(), {
    J['ring1']: {'opacity': [kf(0, 0, 'cubic'), kf(8, 0.45, 'cubic'), kf(24, 0)], 'scaleX': hold(1), 'scaleY': hold(1)}})))
# 7.4 empty-jar wiggle +-3 deg
anims.append(anim('wiggle', new_anim('wiggle'), 30, merged(rest_tracks(), {
    J['rig']: {'rotation': [kf(0, 0, 'cubic', EASE_IO), kf(5, -3 * DEG, 'cubic', EASE_IO), kf(12, 3 * DEG, 'cubic', EASE_IO),
                            kf(19, -2 * DEG, 'cubic', EASE_IO), kf(26, 0)]}})))
# 5.3 seal: lid pressed down, wax 1.4 -> 1
anims.append(anim('seal', new_anim('seal'), 36, merged(rest_tracks(), {
    J['lid']: {'x': hold(LIDX), 'rotation': hold(0), 'y': [kf(0, LIDY, 'cubic'), kf(6, LIDY - 6, 'cubic', EASE_IN), kf(12, LIDY)]},
    J['wax_pop']: {'scaleX': [kf(0, 1.4), kf(12, 1.4, 'cubic'), kf(30, 1)], 'scaleY': [kf(0, 1.4), kf(12, 1.4, 'cubic'), kf(30, 1)]}})))
anims.append(anim('seal_reduced', new_anim('seal_reduced'), 12, rest_tracks()))
# 2.5 celebrate: 6 slips burst out of the mouth (600 ms), then fall
BURST = [(-100, 10, -30), (-60, -30, 20), (-20, -48, -10), (22, -46, 15), (62, -28, -25), (102, 12, 30)]
cel = {}
for k, c in enumerate(CEL):
    bx, by, br = BURST[k]
    cel[c] = {'opacity': [kf(0, 1), kf(52, 1, 'cubic'), kf(72, 0)],
              'x': [kf(0, 130, 'cubic'), kf(36, 130 + bx, 'linear'), kf(72, 130 + bx * 1.15)],
              'y': [kf(0, 75, 'cubic'), kf(36, 75 + by, 'cubic', EASE_IN), kf(72, 380)],
              'rotation': [kf(0, 0, 'cubic'), kf(72, br * DEG * 3)]}
anims.append(anim('celebrate', new_anim('celebrate'), 72, merged(merged(rest_tracks(), cel), {J['lid']: {
    'x': [kf(0, LIDX, 'cubic'), kf(8, LOX), kf(40, LOX, 'cubic'), kf(55, LIDX)],
    'y': [kf(0, LIDY, 'cubic'), kf(8, LOY), kf(40, LOY, 'cubic'), kf(55, LIDY)],
    'rotation': [kf(0, 0, 'cubic'), kf(8, LOR), kf(40, LOR, 'cubic'), kf(55, 0)]}})))
celr = {c: {'opacity': [kf(0, 0, 'cubic'), kf(12, 1), kf(36, 1, 'cubic'), kf(48, 0)], 'x': hold(130 + BURST[k][0]), 'y': hold(115 + BURST[k][1])}
        for k, c in enumerate(CEL)}
anims.append(anim('celebrate_reduced', new_anim('celebrate_reduced'), 48, merged(rest_tracks(), celr)))
# fill poses
FILL = [(0, 0, 0, 0), (1, 0, 0, 0), (1, 1, 0, 0), (1, 1, 1, 0), (1, 1, 1, 1)]
for lvl, (a, b, c, w) in enumerate(FILL):
    anims.append(anim(f'fill_{lvl}', new_anim(f'fill_{lvl}'), 1, {J['few']: {'opacity': hold(a)}, J['half']: {'opacity': hold(b)},
                                                                     J['full']: {'opacity': hold(c)}, J['wax_vis']: {'opacity': hold(w)}}))
# faces
for fc in ['waiting', 'happy', 'sleepy']:
    anims.append(anim(f'face_{fc}', new_anim(f'face_{fc}'), 1, {J['face_waiting']: {'opacity': hold(1 if fc == 'waiting' else 0)},
        J['face_happy']: {'opacity': hold(1 if fc == 'happy' else 0)}, J['face_sleepy']: {'opacity': hold(1 if fc == 'sleepy' else 0)},
        J['zz']: {'opacity': hold(1 if fc == 'sleepy' else 0)}}))
# 5.2 full idle float (3 s loop) and its still pose
def bob(amp, phase):
    q = 45
    pts = [(0, 0), (q, -amp), (2 * q, 0), (3 * q, amp), (4 * q, 0)]
    out = []
    for k, (fr, v) in enumerate(pts):
        out.append(kf((fr + phase) % 180 if k < 4 else 180, v if k < 4 else 0, 'cubic', EASE_IO) if False else kf(fr, v, 'cubic', EASE_IO))
    return out
anims.append(anim('full_float', new_anim('full_float'), 180, {
    J['full']: {'y': bob(2, 0)}, J['half']: {'y': [kf(0, 1.5, 'cubic', EASE_IO), kf(45, 0, 'cubic', EASE_IO), kf(90, -1.5, 'cubic', EASE_IO), kf(135, 0, 'cubic', EASE_IO), kf(180, 1.5)]},
    J['few']: {'y': [kf(0, -1, 'cubic', EASE_IO), kf(90, 1, 'cubic', EASE_IO), kf(180, -1)]}}, loop='loop'))
anims.append(anim('still', new_anim('still'), 1, {J['full']: {'y': hold(0)}, J['half']: {'y': hold(0)}, J['few']: {'y': hold(0)}}))

# ---------------------------------------------------------------- state machine helpers
def cond_trigger(p):
    return (f'<TransitionViewModelCondition><TransitionPropertyViewModelComparator><BindablePropertyTrigger>'
            f'<DataBindContext sourcePathIds="{path(p)}" propertyKey="686"/></BindablePropertyTrigger></TransitionPropertyViewModelComparator>'
            f'<TransitionValueTriggerComparator/></TransitionViewModelCondition>')
def cond_bool(p, v):
    return (f'<TransitionViewModelCondition><TransitionPropertyViewModelComparator><BindablePropertyBoolean>'
            f'<DataBindContext sourcePathIds="{path(p)}" propertyKey="634"/></BindablePropertyBoolean></TransitionPropertyViewModelComparator>'
            f'<TransitionValueBooleanComparator value="{str(v).lower()}"/></TransitionViewModelCondition>')
def cond_num(p, v, op='equal'):
    return (f'<TransitionViewModelCondition opValue="{op}"><TransitionPropertyViewModelComparator><BindablePropertyNumber>'
            f'<DataBindContext sourcePathIds="{path(p)}" propertyKey="636"/></BindablePropertyNumber></TransitionPropertyViewModelComparator>'
            f'<TransitionValueNumberComparator value="{v}"/></TransitionViewModelCondition>')
def cond_enum(p, valid):
    return (f'<TransitionViewModelCondition><TransitionPropertyViewModelComparator><BindablePropertyEnum>'
            f'<DataBindContext sourcePathIds="{path(p)}" propertyKey="637"/></BindablePropertyEnum></TransitionPropertyViewModelComparator>'
            f'<TransitionValueEnumComparator value="{valid}"/></TransitionViewModelCondition>')
def tr(to, conds=(), duration=0, exit_full=False):
    ex = ' enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"' if exit_full else ''
    d = f' duration="{duration}"' if duration else ''
    return f'<StateTransition stateToId="{to}"{d}{ex}>' + ''.join(conds) + '</StateTransition>'
def fire(p): return f'<StateMachineFireTrigger viewModelPathIds="{path(p)}" occursValue="atStart"/>'
def set_enum(p, valid):
    return (f'<ListenerViewModelChange><BindablePropertyEnum propertyValue="{valid}">'
            f'<DataBindContext sourcePathIds="{path(p)}" propertyKey="637" direction="true"/></BindablePropertyEnum></ListenerViewModelChange>')
def set_num(p, v):
    return (f'<ListenerViewModelChange><BindablePropertyNumber propertyValue="{v}">'
            f'<DataBindContext sourcePathIds="{path(p)}" propertyKey="636" direction="true"/></BindablePropertyNumber></ListenerViewModelChange>')
def state(sid, anim_name, x, y, children=(), label=None):
    lab = f' stateName="{label or anim_name}"'
    return (f'            <AnimationState x="{x}" y="{y}" animationId="{A[anim_name]}"{lab} id="{sid}">\n'
            + ''.join(f'                {c}\n' for c in children) + '            </AnimationState>')
def layer(name, lid, entry_children, states, ay=-160):
    return (f'        <StateMachineLayer name="{name}" id="{lid}">\n            <AnyState x="560" y="{ay}"/>\n            <ExitState x="720" y="{ay}"/>\n'
            f'            <EntryState x="0" y="0">' + ''.join(entry_children) + '</EntryState>\n' + '\n'.join(states) + '\n        </StateMachineLayer>')

S = {k: nid() for k in ['idle', 'drop_fall', 'drop_land', 'drop_reduced', 'drop_reduced_end', 'reveal', 'reveal_end', 'reveal_reduced',
                        'reveal_reduced_end', 'ripple', 'ripple_reduced', 'wiggle', 'seal', 'seal_reduced', 'celebrate', 'celebrate_reduced']}
RM0, RM1 = cond_bool('reducedMotion', False), cond_bool('reducedMotion', True)
back = lambda: tr(S['idle'], exit_full=True)
action_states = [
    state(S['idle'], 'idle', 160, 0, [
        tr(S['drop_fall'], [cond_trigger('dropNote'), RM0]), tr(S['drop_reduced'], [cond_trigger('dropNote'), RM1]),
        tr(S['reveal'], [cond_trigger('revealNote'), RM0]), tr(S['reveal_reduced'], [cond_trigger('revealNote'), RM1]),
        tr(S['wiggle'], [cond_trigger('tapJar'), RM0, cond_num('fillLevel', 0)]),
        tr(S['ripple'], [cond_trigger('tapJar'), RM0, cond_num('fillLevel', 0, 'notEqual')]),
        tr(S['ripple_reduced'], [cond_trigger('tapJar'), RM1, cond_num('fillLevel', 0, 'notEqual')]),
        tr(S['seal'], [cond_trigger('seal'), RM0]), tr(S['seal_reduced'], [cond_trigger('seal'), RM1]),
        tr(S['celebrate'], [cond_trigger('celebrate'), RM0]), tr(S['celebrate_reduced'], [cond_trigger('celebrate'), RM1])]),
    state(S['drop_fall'], 'drop_fall', 400, -300, [tr(S['drop_land'], exit_full=True)]),
    state(S['drop_land'], 'drop_land', 640, -300, [fire('noteLanded'), set_enum('face', EV['happy']), back()]),
    state(S['drop_reduced'], 'drop_reduced', 400, -200, [tr(S['drop_reduced_end'], exit_full=True)]),
    state(S['drop_reduced_end'], 'drop_reduced_end', 640, -200, [fire('noteLanded'), set_enum('face', EV['happy']), back()]),
    state(S['reveal'], 'reveal', 400, -100, [tr(S['reveal_end'], exit_full=True)]),
    state(S['reveal_end'], 'reveal_end', 640, -100, [fire('noteRevealed'), back()]),
    state(S['reveal_reduced'], 'reveal_reduced', 400, 0, [tr(S['reveal_reduced_end'], exit_full=True)]),
    state(S['reveal_reduced_end'], 'reveal_reduced_end', 640, 0, [fire('noteRevealed'), back()]),
    state(S['ripple'], 'ripple', 400, 100, [back()]),
    state(S['ripple_reduced'], 'ripple_reduced', 400, 200, [back()]),
    state(S['wiggle'], 'wiggle', 400, 300, [back()]),
    state(S['seal'], 'seal', 400, 400, [set_num('fillLevel', 4), set_enum('face', EV['sleepy']), back()]),
    state(S['seal_reduced'], 'seal_reduced', 400, 500, [set_num('fillLevel', 4), set_enum('face', EV['sleepy']), back()]),
    state(S['celebrate'], 'celebrate', 400, 600, [back()]),
    state(S['celebrate_reduced'], 'celebrate_reduced', 400, 700, [back()]),
]
FS = [nid() for _ in range(5)]
fill_states = [state(FS[k], f'fill_{k}', 160 + 200 * k, 0 if k % 2 == 0 else 120,
                     [tr(FS[j], [cond_num('fillLevel', j)], duration=200) for j in range(5) if j != k]) for k in range(5)]
FCS = {fc: nid() for fc in ['waiting', 'happy', 'sleepy']}
face_states = [state(FCS[fc], f'face_{fc}', 160 + 220 * k, 0 if k != 1 else 120,
                     [tr(FCS[o], [cond_enum('face', EV[o])], duration=150) for o in FCS if o != fc]) for k, fc in enumerate(FCS)]
FL = {'still': nid(), 'float': nid()}
float_states = [state(FL['still'], 'still', 160, 0, [tr(FL['float'], [cond_num('fillLevel', 3), RM0], duration=300)]),
                state(FL['float'], 'full_float', 400, 0, [tr(FL['still'], [cond_num('fillLevel', 3, 'notEqual')], duration=300),
                                                          tr(FL['still'], [RM1], duration=200)])]
SM = nid(); JSTYLE = nid(); ISTYLE = nid()
sm = (f'    <StateMachine name="Jar" id="{SM}">\n'
      + layer('actions', nid(), [tr(S['idle'])], action_states, -420) + '\n'
      + layer('fill', nid(), [tr(FS[k], [cond_num('fillLevel', k)]) for k in range(5)], fill_states) + '\n'
      + layer('face', nid(), [tr(FCS[fc], [cond_enum('face', EV[fc])]) for fc in FCS], face_states) + '\n'
      + layer('float', nid(), [tr(FL['still'])], float_states) + '\n    </StateMachine>')

jar_artboard = (f'<Artboard defaultStateMachineId="{SM}" viewModelId="{VM}" viewModelInstanceId="{VMI}" clip="true" width="260" height="340" styleId="{JSTYLE}" name="Jar" id="{J["artboard"]}">\n    <LayoutComponentStyle name="Jar Style" id="{JSTYLE}"/>\n'
    + sm + '\n'
    + f'    <Node name="celebrate" id="{J["celebrate"]}">\n{cel_nodes}\n    </Node>\n'
    + f'    <Node x="130" y="195" name="ripples" id="{J["ripples"]}">\n{ring("ring1", J["ring1"])}\n{ring("ring2", J["ring2"])}\n    </Node>\n'
    + f'    <Node x="{f(RIG_X)}" y="{f(RIG_Y)}" name="jar" id="{J["rig"]}">\n' + '\n'.join(rig_children) + '\n    </Node>\n'
    + '\n'.join(anims) + '\n</Artboard>')

# ================================================================= INTRO ARTBOARD (pin 2.1)
I = {k: nid() for k in ['artboard', 'lid', 'face_waiting', 'face_happy', 'clip', 'vm', 'vmi', 'rm', 's1', 's2', 's3', 'sm']}
IA = {k: nid() for k in ['loop', 'hold', 'still']}
IR = '        '
slip_nodes = []
SLIP_POS = []
for k, n in enumerate([1, 2, 3]):
    sid = I[f's{k + 1}']
    slip_nodes.append(node(f'drop_{k + 1}', 0, 0, group_shapes(f'slip_{n:02d}', RIG_X, RIG_Y, False, IR + '        '), IR + '    ', sid, ' opacity="0"'))
intro_children = [
    node('lid', LID_X - RIG_X, LID_Y - RIG_Y, group_shapes('lid', LID_X, LID_Y, False, IR + '    '), IR, I['lid']),
    node('face_happy', 0, 0, group_shapes('face_happy', RIG_X, RIG_Y, False, IR + '    '), IR, I['face_happy'], ' opacity="0"'),
    node('face_waiting', 0, 0, group_shapes('face_waiting', RIG_X, RIG_Y, False, IR + '    '), IR, I['face_waiting']),
] + [group_shapes(g, RIG_X, RIG_Y, False, IR) for g in ['label', 'rim', 'highlight', 'outline']] + [
    node('notes', 0, 0, '\n'.join(reversed(slip_nodes)) + f'\n{IR}    <ClippingShape sourceId="{I["clip"]}" name="Glass clip"/>', IR),
    re.sub(r'\n\s*<Fill name="Fill">.*?</Fill>', '', element_shape(clip_el[0], clip_el[1], clip_el[2], RIG_X, RIG_Y, False, IR, 'notes_clip', I['clip'])),
    group_shapes('glass', RIG_X, RIG_Y, False, IR)]
# 3 s loop: lid opens, three slips drop in 0.4 s apart, lid closes, face turns happy, then resets
il = {I['lid']: {'x': [kf(0, LIDX, 'cubic'), kf(15, LOX), kf(110, LOX, 'cubic'), kf(125, LIDX)],
                 'y': [kf(0, LIDY, 'cubic'), kf(15, LOY), kf(110, LOY, 'cubic'), kf(125, LIDY)],
                 'rotation': [kf(0, 0, 'cubic'), kf(15, LOR), kf(110, LOR, 'cubic'), kf(125, 0)]},
      I['face_waiting']: {'opacity': [kf(0, 1), kf(120, 1, 'linear'), kf(129, 0), kf(170, 0, 'linear'), kf(179, 1)]},
      I['face_happy']: {'opacity': [kf(0, 0), kf(120, 0, 'linear'), kf(129, 1), kf(170, 1, 'linear'), kf(179, 0)]}}
for k in range(3):
    s0 = 20 + 24 * k
    il[I[f's{k + 1}']] = {'opacity': [kf(0, 0), kf(s0, 1), kf(165, 1, 'linear'), kf(178, 0)],
                          'y': [kf(0, -260), kf(s0, -260, 'cubic', EASE_IN), kf(s0 + 33, 0)]}
ih = {I['lid']: {'x': hold(LIDX), 'y': hold(LIDY), 'rotation': hold(0)}, I['face_waiting']: {'opacity': hold(0)}, I['face_happy']: {'opacity': hold(1)}}
for k in range(3): ih[I[f's{k + 1}']] = {'opacity': hold(1), 'y': hold(0)}
intro_anims = [anim('intro_loop', IA['loop'], 180, il), anim('intro_hold', IA['hold'], 1, ih)]
IS = {k: nid() for k in ['play1', 'play2', 'hold']}
irm = (f'<TransitionViewModelCondition><TransitionPropertyViewModelComparator><BindablePropertyBoolean>'
       f'<DataBindContext sourcePathIds="{I["vm"]}-{I["rm"]}" propertyKey="634"/></BindablePropertyBoolean></TransitionPropertyViewModelComparator>'
       f'<TransitionValueBooleanComparator value="VAL"/></TransitionViewModelCondition>')
intro_sm = (f'    <StateMachine name="Intro" id="{I["sm"]}">\n        <StateMachineLayer name="intro" id="{nid()}">\n'
            f'            <AnyState x="560" y="-160"/>\n            <ExitState x="720" y="-160"/>\n'
            f'            <EntryState x="0" y="0"><StateTransition stateToId="{IS["play1"]}">{irm.replace("VAL", "false")}</StateTransition>'
            f'<StateTransition stateToId="{IS["hold"]}">{irm.replace("VAL", "true")}</StateTransition></EntryState>\n'
            f'            <AnimationState x="160" y="0" animationId="{IA["loop"]}" stateName="play 1" id="{IS["play1"]}">'
            f'<StateTransition stateToId="{IS["play2"]}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"/></AnimationState>\n'
            f'            <AnimationState x="360" y="0" animationId="{IA["loop"]}" reset="true" stateName="play 2" id="{IS["play2"]}">'
            f'<StateTransition stateToId="{IS["hold"]}" duration="300" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"/></AnimationState>\n'
            f'            <AnimationState x="560" y="0" animationId="{IA["hold"]}" stateName="hold happy" id="{IS["hold"]}"/>\n'
            f'        </StateMachineLayer>\n    </StateMachine>')
intro_artboard = (f'<Artboard x="320" y="0" defaultStateMachineId="{I["sm"]}" viewModelId="{I["vm"]}" viewModelInstanceId="{I["vmi"]}" clip="true" width="260" height="340" styleId="{ISTYLE}" name="Intro" id="{I["artboard"]}">\n    <LayoutComponentStyle name="Intro Style" id="{ISTYLE}"/>\n'
    + intro_sm + '\n'
    + f'    <Node x="{f(RIG_X)}" y="{f(RIG_Y)}" name="jar">\n' + '\n'.join(intro_children) + '\n    </Node>\n'
    + '\n'.join(intro_anims) + '\n</Artboard>')

# ================================================================= view models + enum
def inst(kind, prop, value=None):
    v = f' propertyValue="{value}"' if value is not None else ''
    return f'        <ViewModelInstance{kind}{v} viewModelPropertyId="{P[prop]}"/>'
vm = f'''<DataEnumCustom name="JarFace" id="{ENUM}">
    <DataEnumValue key="waiting" value="Waiting" id="{EV['waiting']}"/>
    <DataEnumValue key="happy" value="Happy" id="{EV['happy']}"/>
    <DataEnumValue key="sleepy" value="Sleepy" id="{EV['sleepy']}"/>
</DataEnumCustom>

<ViewModel defaultInstanceId="{VMI}" name="JarVM" id="{VM}">
    <ViewModelPropertyNumber name="fillLevel" id="{P['fillLevel']}"/>
    <ViewModelPropertyEnumCustom enumId="{ENUM}" name="face" id="{P['face']}"/>
    <ViewModelPropertyColor name="noteColour" id="{P['noteColour']}"/>
    <ViewModelPropertyBoolean name="reducedMotion" id="{P['reducedMotion']}"/>
    <ViewModelPropertyColor name="glassColour" id="{P['glassColour']}"/>
    <ViewModelPropertyColor name="lineColour" id="{P['lineColour']}"/>
    <ViewModelPropertyColor name="labelColour" id="{P['labelColour']}"/>
''' + '\n'.join(f'    <ViewModelPropertyTrigger name="{t}" id="{P[t]}"/>' for t in
                ['dropNote', 'revealNote', 'tapJar', 'seal', 'celebrate', 'noteLanded', 'noteRevealed']) + f'''
    <ViewModelInstance exports="true" name="Default" id="{VMI}">
{inst('Number', 'fillLevel', 0)}
{inst('Enum', 'face', EV['waiting'])}
{inst('Color', 'noteColour', 'FFF7C31B')}
{inst('Boolean', 'reducedMotion', 'false')}
{inst('Color', 'glassColour', 'FFFFFFFF')}
{inst('Color', 'lineColour', 'FF2E2A26')}
{inst('Color', 'labelColour', 'FFFBF6EC')}
''' + '\n'.join(inst('Trigger', t) for t in ['dropNote', 'revealNote', 'tapJar', 'seal', 'celebrate', 'noteLanded', 'noteRevealed']) + f'''
    </ViewModelInstance>
</ViewModel>

<ViewModel defaultInstanceId="{I['vmi']}" name="IntroVM" id="{I['vm']}">
    <ViewModelPropertyBoolean name="reducedMotion" id="{I['rm']}"/>
    <ViewModelInstance exports="true" name="Default" id="{I['vmi']}">
        <ViewModelInstanceBoolean propertyValue="false" viewModelPropertyId="{I['rm']}"/>
    </ViewModelInstance>
</ViewModel>'''

doc = ('<!-- Generated by gen_rml.py from jar-layers.svg (Figma Jar component set 14:1607). Edit the generator, not this file. -->\n'
       '<Rive version="1" kind="fragment">\n' + jar_artboard + '\n\n' + intro_artboard + '\n\n' + vm + '\n</Rive>\n')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w').write(doc)
print('wrote', OUT, len(doc), 'bytes; last id', nid.n)

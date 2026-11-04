# ASCII FBX 6.1 (Tree IT) -> OBJ: вершины, UV по вершинам, треугольники; единицы см -> м
import re, sys
src = open(sys.argv[1], encoding='latin-1').read()
models = re.split(r'\n\s*Model: "Model::', src)[1:]
out = open(sys.argv[2], 'w'); vo = 0
def arr(block, key):
    m = re.search(key + r':\s*([-0-9.,eE\s]+)', block)
    return [float(x) for x in m.group(1).replace('\n', '').split(',') if x.strip()] if m else []
for mdl in models:
    name = mdl.split('"', 1)[0]
    V = arr(mdl, r'\n\s*Vertices'); I = [int(x) for x in arr(mdl, 'PolygonVertexIndex')]
    uvb = mdl[mdl.index('LayerElementUV'):]; UV = arr(uvb, r'\n\s*UV')
    nb = mdl[mdl.index('LayerElementNormal'):]; N = arr(nb, r'\n\s*Normals')
    out.write(f'o {"bark" if "bark" in name else "leaves"}\nusemtl {"bark" if "bark" in name else "leaves"}\n')
    nv = len(V) // 3
    for i in range(nv): out.write(f'v {V[i*3]/100:.4f} {V[i*3+1]/100:.4f} {V[i*3+2]/100:.4f}\n')
    for i in range(len(UV) // 2): out.write(f'vt {UV[i*2]:.5f} {UV[i*2+1]:.5f}\n')
    for i in range(len(N) // 3): out.write(f'vn {N[i*3]:.4f} {N[i*3+1]:.4f} {N[i*3+2]:.4f}\n')
    poly = []
    for x in I:
        if x < 0: poly.append(-x - 1); 
        else: poly.append(x); continue
        for k in range(1, len(poly) - 1):
            a, b, c = poly[0], poly[k], poly[k + 1]
            out.write('f ' + ' '.join(f'{j+1+vo}/{j+1+vo}/{j+1+vo}' for j in (a, b, c)) + '\n')
        poly = []
    print(name[:30], 'verts', nv, 'uv', len(UV) // 2, 'normals', len(N) // 3, 'idx', len(I))
    vo += nv

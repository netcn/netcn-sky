# -*- coding: utf-8 -*-
"""把 Natural Earth 1:50m 国界简化成 sky 站用的区域矢量底图。
输入：_audit/ne50.json（ne_50m_admin_0_countries.geojson，公有领域）
输出：sky/assets/map/region.json
用法：python sky/tools/build_map.py
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, '_audit', 'ne50.json')
OUT = os.path.join(ROOT, 'sky', 'assets', 'map', 'region.json')

WANTED = {
    'China': 'CN', 'Taiwan': 'TW', 'Japan': 'NB', 'South Korea': 'NB', 'North Korea': 'NB',
    'Mongolia': 'NB', 'Russia': 'NB', 'India': 'NB', 'Nepal': 'NB', 'Bhutan': 'NB',
    'Bangladesh': 'NB', 'Myanmar': 'NB', 'Laos': 'NB', 'Vietnam': 'NB', 'Thailand': 'NB',
    'Cambodia': 'NB', 'Philippines': 'NB', 'Malaysia': 'NB', 'Indonesia': 'NB',
    'Kazakhstan': 'NB', 'Kyrgyzstan': 'NB', 'Tajikistan': 'NB', 'Pakistan': 'NB',
    'Afghanistan': 'NB', 'Sri Lanka': 'NB', 'Brunei': 'NB', 'Singapore': 'NB', 'Timor-Leste': 'NB'
}
BOX = (58, -12, 156, 62)  # lon_min, lat_min, lon_max, lat_max


def rdp(points, eps):
    # 环的首尾点相同，若直接拿首尾当弦会退化成零长度，所有点都会被丢掉。
    # 先去掉重复的收尾点，简化后再补回来。
    closed = len(points) > 2 and points[0] == points[-1]
    pts = points[:-1] if closed else points
    if len(pts) < 4:
        return points
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-12
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if dist > best:
                best, bi = dist, i
        if best > eps:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    out = [p for p, k in zip(pts, keep) if k]
    if closed:
        out.append(pts[0])
    return out


def rings_of(geom):
    if not geom:
        return []
    t = geom.get('type')
    c = geom.get('coordinates')
    if t == 'Polygon':
        return [c[0]]
    if t == 'MultiPolygon':
        return [poly[0] for poly in c]
    return []


def main():
    if not os.path.exists(SRC):
        print('缺少输入：' + SRC)
        return 1
    data = json.load(open(SRC, encoding='utf-8'))
    out = []
    for f in data.get('features', []):
        p = f.get('properties') or {}
        name = p.get('ADMIN') or p.get('NAME')
        if name not in WANTED:
            continue
        rings = []
        for ring in rings_of(f.get('geometry')):
            pts = [(round(x, 2), round(y, 2)) for x, y in ring]
            if not any(BOX[0] <= x <= BOX[2] and BOX[1] <= y <= BOX[3] for x, y in pts):
                continue
            simp = rdp(pts, 0.06)
            if len(simp) >= 4:
                rings.append([[x, y] for x, y in simp])
        if rings:
            out.append({'n': WANTED[name], 'rings': rings})

    js = json.dumps({'countries': out}, ensure_ascii=False, separators=(',', ':'))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(js)
    total_pts = sum(len(r) for c in out for r in c['rings'])
    print('countries=%d rings=%d points=%d bytes=%d' % (
        len(out), sum(len(c['rings']) for c in out), total_pts, len(js.encode('utf-8'))))
    return 0


if __name__ == '__main__':
    sys.exit(main())

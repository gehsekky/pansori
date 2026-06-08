#!/usr/bin/env python3
"""
Generates the seamless `dirt` and `sand` local-floor tiles
(public/art/floors/{dirt,sand}_{1,2,3}.png) as ORIGINAL procedural art.

Why this exists: the SBS Tiny Texture Pack (CC0) supplies grass +
cobblestone, but has no earth or fine-sand texture. Rather than pull a
second third-party pack, we generate dirt + sand here so the entire floor
set is unencumbered (CC0 + original) and the project stays commercial-clean.

Method: tileable value-noise (a lattice that wraps at its period, summed
over octaves) → seamless edges. dirt = brown tone ramp + darker pebble
speckles; sand = tan tone ramp + a gentle tileable ripple. 3 variants each
(different seeds) feed the engine's per-cell variant picker (FLOOR_VARIANTS).

Run:  python3 src/frontend/scripts/gen-floor-dirt-sand.py
Requires: Pillow.
"""
import math
import os
import random
from PIL import Image

SIZE = 128
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "art", "floors")


def make_sampler(period, seed):
    rng = random.Random(seed)
    lat = [[rng.random() for _ in range(period)] for _ in range(period)]

    def s(x, y):
        fx = x / SIZE * period
        fy = y / SIZE * period
        ix, iy = int(fx), int(fy)
        x0, y0 = ix % period, iy % period
        x1, y1 = (x0 + 1) % period, (y0 + 1) % period
        tx, ty = fx - ix, fy - iy
        tx = tx * tx * (3 - 2 * tx)  # smoothstep
        ty = ty * ty * (3 - 2 * ty)
        a = lat[y0][x0] * (1 - tx) + lat[y0][x1] * tx
        b = lat[y1][x0] * (1 - tx) + lat[y1][x1] * tx
        return a * (1 - ty) + b * ty

    return s


def fbm(seed, periods=(4, 8, 16, 32), amps=(1, 0.5, 0.25, 0.125)):
    samplers = [make_sampler(p, seed * 97 + i) for i, p in enumerate(periods)]
    tot = sum(amps)
    return [
        [sum(a * sm(x, y) for a, sm in zip(amps, samplers)) / tot for x in range(SIZE)]
        for y in range(SIZE)
    ]


def clamp(v):
    return max(0, min(255, int(v)))


def ramp(t, dark, base, lite):
    if t < 0.5:
        f = t / 0.5
        return tuple(dark[i] + (base[i] - dark[i]) * f for i in range(3))
    f = (t - 0.5) / 0.5
    return tuple(base[i] + (lite[i] - base[i]) * f for i in range(3))


def gen_dirt(seed):
    n = fbm(seed)
    n2 = fbm(seed + 5, periods=(16, 32), amps=(1, 0.5))
    rng = random.Random(seed * 31 + 7)
    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b = ramp(n[y][x], (74, 52, 32), (120, 90, 58), (150, 116, 78))
            if n2[y][x] > 0.78:  # pebble speckles
                r, g, b = r * 0.7, g * 0.7, b * 0.7
            grain = rng.randint(-7, 7)
            px[x, y] = (clamp(r + grain), clamp(g + grain), clamp(b + grain))
    return img


def gen_sand(seed):
    n = fbm(seed, periods=(8, 16, 32), amps=(1, 0.5, 0.25))
    rng = random.Random(seed * 53 + 3)
    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    for y in range(SIZE):
        for x in range(SIZE):
            ripple = 0.12 * math.sin((x / SIZE) * 2 * math.pi * 6 + n[y][x] * 3)
            t = min(1, max(0, n[y][x] + ripple))
            r, g, b = ramp(t, (186, 160, 118), (214, 190, 148), (232, 212, 172))
            grain = rng.randint(-5, 5)
            px[x, y] = (clamp(r + grain), clamp(g + grain), clamp(b + grain))
    return img


if __name__ == "__main__":
    for i in (1, 2, 3):
        gen_dirt(i).save(os.path.join(OUT, f"dirt_{i}.png"))
        gen_sand(i).save(os.path.join(OUT, f"sand_{i}.png"))
    print("[gen-floor-dirt-sand] wrote dirt_1..3, sand_1..3")

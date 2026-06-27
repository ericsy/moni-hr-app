#!/usr/bin/env python3
"""从 assets/moni-hr-logo-icon.png 生成 App 图标（1024×1024，无四周阴影）。"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
SOURCE = ASSETS / 'moni-hr-logo-icon.png'
SIZE = 1024
FILL = 0.88
PAD_X = 10
PAD_TOP = 10
PAD_BOTTOM = 6


def is_neutral_gray(r: int, g: int, b: int) -> bool:
    """浅灰/蓝灰投影（四周边缘与底部阴影），不含 Logo 实色蓝。"""
    lum = (r + g + b) / 3
    if lum <= 155 or lum >= 254:
        return False

    sat = max(r, g, b) - min(r, g, b)
    b_excess = b - r

    # 实色 Logo 蓝（M、日历条、时钟描边）
    if b_excess > 38:
        return False
    if b > 170 and sat > 48:
        return False

    mean = lum
    channel_dev = max(abs(r - mean), abs(g - mean), abs(b - mean))

    if channel_dev <= 16 and sat < 42:
        return True
    if lum > 200 and sat < 38 and b_excess < 34:
        return True
    return False


def neutralize_gray_shadows(img: Image.Image) -> Image.Image:
    out = img.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if is_neutral_gray(r, g, b):
                px[x, y] = (255, 255, 255)
    return out


def is_logo_pixel(r: int, g: int, b: int) -> bool:
    if is_neutral_gray(r, g, b):
        return False
    lum = (r + g + b) / 3
    if lum > 253:
        return False
    if b > r + 10:
        return True
    sat = max(r, g, b) - min(r, g, b)
    return sat >= 18 and lum < 252


def content_bottom_row(img: Image.Image) -> int:
    """自下而上找最后一行含实色 Logo 像素的行。"""
    px = img.load()
    w, h = img.size
    for y in range(h - 1, -1, -1):
        strong = sum(1 for x in range(w) if px[x, y][2] > px[x, y][0] + 38)
        if strong >= 4:
            return y
        light = sum(1 for x in range(w) if px[x, y][2] > 95 and px[x, y][2] > px[x, y][0] + 18)
        if light >= 12:
            return y
    return h - 1


def main() -> None:
    src = Image.open(SOURCE).convert('RGB')
    w, h = src.size
    clean = neutralize_gray_shadows(src)

    xs: list[int] = []
    ys_top: list[int] = []
    cp = clean.load()
    for y in range(h):
        for x in range(w):
            if is_logo_pixel(*cp[x, y]):
                xs.append(x)
                ys_top.append(y)
    if not xs:
        raise SystemExit('未识别到 Logo 主体')

    y_bottom = content_bottom_row(clean)

    x0 = max(0, min(xs) - PAD_X)
    y0 = max(0, min(ys_top) - PAD_TOP)
    x1 = min(w - 1, max(xs) + PAD_X)
    y1 = min(h - 1, y_bottom + PAD_BOTTOM)
    logo = clean.crop((x0, y0, x1 + 1, y1 + 1))
    logo = neutralize_gray_shadows(logo)

    lw, lh = logo.size
    scale = min(SIZE * FILL / lw, SIZE * FILL / lh)
    nw, nh = int(lw * scale + 0.5), int(lh * scale + 0.5)
    logo_r = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    logo_r = neutralize_gray_shadows(logo_r)

    canvas = Image.new('RGB', (SIZE, SIZE), (255, 255, 255))
    canvas.paste(logo_r, ((SIZE - nw) // 2, (SIZE - nh) // 2))
    canvas = neutralize_gray_shadows(canvas)

    for name in ('icon-1024.png', 'icon.png', 'adaptive-icon.png', 'splash-icon.png'):
        canvas.save(ASSETS / name, 'PNG', optimize=True)
    canvas.resize((48, 48), Image.Resampling.LANCZOS).save(ASSETS / 'favicon.png', 'PNG')
    print(f'OK: crop=({x0},{y0})-({x1},{y1}) bottom_row={y_bottom} -> {SIZE}x{SIZE}')


if __name__ == '__main__':
    main()

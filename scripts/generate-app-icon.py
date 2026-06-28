#!/usr/bin/env python3
"""从 assets/moni-hr-logo-icon.png 生成 App 图标（1024×1024，无四周阴影）。"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
SOURCE = ASSETS / 'moni-hr-logo-icon.png'
SIZE = 1024
FILL = 0.88  # iOS icon / splash
# Android 安全区直径 66dp / 108dp；再留 10% 内边距，确保任意遮罩下 Logo 不被裁切
ADAPTIVE_SAFE_RATIO = (66 / 108) * 0.90
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


def render_icon(logo: Image.Image, fill: float) -> Image.Image:
    lw, lh = logo.size
    scale = min(SIZE * fill / lw, SIZE * fill / lh)
    nw, nh = int(lw * scale + 0.5), int(lh * scale + 0.5)
    logo_r = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    logo_r = neutralize_gray_shadows(logo_r)

    canvas = Image.new('RGB', (SIZE, SIZE), (255, 255, 255))
    canvas.paste(logo_r, ((SIZE - nw) // 2, (SIZE - nh) // 2))
    return neutralize_gray_shadows(canvas)


def max_logo_distance_from_center(img: Image.Image) -> float:
    cx, cy = SIZE / 2, SIZE / 2
    px = img.load()
    max_dist = 0.0
    for y in range(SIZE):
        for x in range(SIZE):
            if is_logo_pixel(*px[x, y]):
                dist = math.hypot(x - cx, y - cy)
                if dist > max_dist:
                    max_dist = dist
    return max_dist


def render_adaptive_icon(logo: Image.Image) -> tuple[Image.Image, float]:
    """自动最大化缩放 Logo，同时保证所有实色像素落在 Android 安全区内。"""
    lw, lh = logo.size
    safe_radius = SIZE * ADAPTIVE_SAFE_RATIO / 2
    fill = min(SIZE * ADAPTIVE_SAFE_RATIO / lw, SIZE * ADAPTIVE_SAFE_RATIO / lh)

    while fill >= 0.25:
        canvas = render_icon(logo, fill)
        if max_logo_distance_from_center(canvas) <= safe_radius:
            return canvas, fill
        fill *= 0.98

    raise SystemExit('无法将 Logo 完全放入 Android 安全区，请检查源图')


def save_safezone_preview(icon: Image.Image, path: Path) -> None:
    img = icon.convert('RGBA')
    overlay = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = SIZE // 2, SIZE // 2
    safe_r = int(SIZE * 66 / 108 / 2)
    draw.ellipse((cx - safe_r, cy - safe_r, cx + safe_r, cy + safe_r), outline=(255, 0, 0, 200), width=6)
    draw.ellipse((0, 0, SIZE - 1, SIZE - 1), outline=(0, 120, 255, 120), width=3)
    Image.alpha_composite(img, overlay).save(path, 'PNG', optimize=True)


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

    ios_canvas = render_icon(logo, FILL)
    adaptive_canvas, adaptive_fill = render_adaptive_icon(logo)
    max_dist = max_logo_distance_from_center(adaptive_canvas)
    safe_radius = SIZE * ADAPTIVE_SAFE_RATIO / 2

    for name in ('icon-1024.png', 'icon.png', 'splash-icon.png'):
        ios_canvas.save(ASSETS / name, 'PNG', optimize=True)
    adaptive_canvas.save(ASSETS / 'adaptive-icon.png', 'PNG', optimize=True)
    save_safezone_preview(adaptive_canvas, ASSETS / 'adaptive-icon-safezone-preview.png')
    ios_canvas.resize((48, 48), Image.Resampling.LANCZOS).save(ASSETS / 'favicon.png', 'PNG')
    print(
        f'OK: crop=({x0},{y0})-({x1},{y1}) bottom_row={y_bottom} '
        f'-> ios_fill={FILL} adaptive_fill={adaptive_fill:.3f} '
        f'logo_max_dist={max_dist:.1f}px safe_radius={safe_radius:.1f}px'
    )


if __name__ == '__main__':
    main()

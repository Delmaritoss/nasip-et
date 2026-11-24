"""Cut the real mosaic lamps out of the restaurant photos (GrabCut, local, nothing uploaded).
Writes RGBA PNGs to assets/_raw/cut/ and a check sheet over light and dark grounds.
Usage: python -I tools/cutout.py <build_root>
"""
import sys, os
import numpy as np
import cv2

ROOT = sys.argv[1]
RAW = os.path.join(ROOT, 'assets', '_raw', 'room')
OUT = os.path.join(ROOT, 'assets', '_raw', 'cut')
os.makedirs(OUT, exist_ok=True)

# name: (photo, crop box x0,y0,x1,y1 in original pixels, inner rect margin)
LAMPS = {
    'lamp-red':    ('room-08.jpg', (1585, 290, 1800, 625)),
    'lamp-grey':   ('room-09.jpg', (1345, 120, 1595, 505)),
    'lamp-colour': ('room-10.jpg', (196, 150, 448, 520)),
}

def cut(name, photo, box):
    img = cv2.imread(os.path.join(RAW, photo))
    x0, y0, x1, y1 = box
    crop = img[y0:y1, x0:x1].copy()
    h, w = crop.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    m = 6
    rect = (m, m, w - 2 * m, h - 2 * m)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(crop, mask, rect, bgd, fgd, 10, cv2.GC_INIT_WITH_RECT)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # keep the largest connected piece (the lamp), drop specks of background
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = np.where(lab == big, 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # fill holes inside the silhouette
    inv = cv2.bitwise_not(fg)
    ff = inv.copy()
    cv2.floodFill(ff, None, (0, 0), 0)
    fg = cv2.bitwise_or(fg, ff)
    fg = cv2.erode(fg, np.ones((3, 3), np.uint8), 1)
    alpha = cv2.GaussianBlur(fg, (5, 5), 0)
    rgba = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    ys, xs = np.where(alpha > 8)
    rgba = rgba[max(0, ys.min() - 4):ys.max() + 5, max(0, xs.min() - 4):xs.max() + 5]
    cv2.imwrite(os.path.join(OUT, name + '.png'), rgba)
    return rgba

def over(rgba, bg):
    a = rgba[:, :, 3:4].astype(np.float32) / 255
    base = np.full(rgba[:, :, :3].shape, bg, np.float32)
    return (rgba[:, :, :3] * a + base * (1 - a)).astype(np.uint8)

tiles = []
for name, (photo, box) in LAMPS.items():
    r = cut(name, photo, box)
    H = 360
    s = H / r.shape[0]
    r = cv2.resize(r, (int(r.shape[1] * s), H), interpolation=cv2.INTER_AREA)
    tiles.append(np.hstack([over(r, (235, 235, 235)), over(r, (12, 8, 14)), over(r, (40, 160, 40))]))
    print(name, r.shape)
W = max(t.shape[1] for t in tiles)
sheet = np.vstack([np.pad(t, ((0, 10), (0, W - t.shape[1]), (0, 0)), constant_values=128) for t in tiles])
cv2.imwrite(os.path.join(OUT, 'sheet.jpg'), sheet)

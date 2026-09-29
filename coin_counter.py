"""
coin_counter.py — classical (non-deep-learning) coin counter.

Pipeline
--------
1. Background model : the pad and the lighting are estimated with a very large
                      median filter (objects much smaller than the window vanish).
2. Foreground map   : per-pixel difference from that background in Lab space —
                      lightness difference (both darker bronze and brighter
                      silver coins) and colour difference.
3. Pad mask         : detections are accepted only on the pad (bright, colourless
                      region) — ignores knees, floor, bed etc. around it.
4. Blob detection   : multi-scale, scale-normalised Laplacian of Gaussian (LoG).
                      A disk of radius r gives a strong peak at scale σ = r/√2;
                      thin pad folds give weak responses. Touching coins still
                      give separate peaks.
5. Verification     : each LoG candidate must be (a) round, not ridge-like
                      (Hessian eigenvalue ratio), (b) a strong enough peak,
                      (c) close to the typical coin size of the image, (d)
                      "survive" a grayscale opening (thin structures don't),
                      (e) not too close to an already accepted, stronger one.
6. Hough circles    : circle Hough transform with the radius range fixed around
                      the coin size found in step 5. Separates coins in piles
                      and overlapping coins, which LoG merges. LoG blobs not
                      explained by any circle are added (blurred / dark photos
                      have no sharp edges for Hough).
7. Classification   : coin vs. button. Buttons are recognised by their sewing
                      holes (2-4 small dark round spots near the centre) and by
                      colours coins never have (blue, pink/red).
"""

from dataclasses import dataclass, field

import cv2
import numpy as np


# ── Parameters ─────────────────────────────────────────────────────
# Coin radius range as a fraction of the image width (photos are taken from
# roughly the same height, so coins are 5-11 % of the width across).
R_MIN_FRAC = 0.025
R_MAX_FRAC = 0.055
N_SCALES = 12

BG_WINDOW_FRAC = 0.45       # median-filter window for the background, × image width
PEAK_REL = 0.20             # min LoG response, × median response of the strong peaks
SIZE_REL = 0.70             # min radius, × typical coin radius
MIN_DIST_REL = 0.95         # min distance between two coins, × typical coin radius
SURVIVAL_MIN = 0.40         # min fraction of the response left after opening
HOUGH_PERFECTNESS = 0.75    # HOUGH_GRADIENT_ALT param2: how perfect a circle must be
HOUGH_MIN_DIST = 0.6        # min distance between Hough centres, × coin radius
HOUGH_FG_REL = 0.45         # Hough circle inside must reach this × typical coin contrast
MERGE_DIST = 0.9            # LoG blob closer than this to a Hough circle = same coin
ISOTROPY_MIN = 0.25         # min Hessian eigenvalue ratio (1 = round, 0 = line)


# ── Data structures ────────────────────────────────────────────────
@dataclass
class DetectedObject:
    label: str                 # "coin" | "button"
    center: tuple              # (x, y)
    radius: float
    response: float            # detection strength (LoG peak / mean foreground for Hough)
    holes: int
    hue: float
    saturation: float
    reason: str = ""


@dataclass
class CountResult:
    coins: int
    buttons: int
    objects: list = field(default_factory=list)
    coin_radius: float = 0.0


# ── Image I/O ──────────────────────────────────────────────────────
# cv2.imread / cv2.imwrite fail on Windows paths with non-ASCII characters
# (e.g. a Hebrew user name), so read/write through NumPy instead.
def load_image(path) -> np.ndarray:
    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot read image: {path}")
    return img


def save_image(path, img: np.ndarray) -> None:
    ext = str(path).rsplit(".", 1)[-1]
    ok, buf = cv2.imencode("." + ext, img)
    if not ok:
        raise ValueError(f"Cannot encode image: {path}")
    buf.tofile(str(path))


# ── Helpers ────────────────────────────────────────────────────────
def _disk(r: float) -> np.ndarray:
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def _disk_mask(shape, cx, cy, r) -> np.ndarray:
    m = np.zeros(shape[:2], np.uint8)
    cv2.circle(m, (int(round(cx)), int(round(cy))), max(1, int(round(r))), 1, -1)
    return m.astype(bool)


# ── 1. Background model ────────────────────────────────────────────
def background(lab: np.ndarray) -> np.ndarray:
    """Per-channel median filter at 1/4 resolution with a window much bigger than a coin pile."""
    h, w = lab.shape[:2]
    small = cv2.resize(lab, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    k = int(BG_WINDOW_FRAC * w / 4) | 1           # odd kernel size
    bg = np.dstack([cv2.medianBlur(small[..., c], k) for c in range(3)])
    return cv2.resize(bg, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)


def _center_level(x: np.ndarray) -> float:
    h, w = x.shape[:2]
    return float(np.median(x[h // 4: 3 * h // 4, w // 4: 3 * w // 4]))


# ── 2. Foreground map ──────────────────────────────────────────────
def foreground_map(lab: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """0-255 score: how much each pixel differs from the local background."""
    L, a, b = cv2.split(lab.astype(np.float32))
    bgL, bga, bgb = cv2.split(bg)

    # Relative lightness difference in both directions (bronze coins are darker
    # than the pad, polished silver ones brighter). Normalising by the
    # background level handles dark photos; the floor stops near-black image
    # borders from amplifying sensor noise.
    denom = np.maximum(bgL, 0.5 * _center_level(bgL))
    darker = np.clip(bgL - L, 0, None) / denom * 510.0
    # Brighter-than-pad counts half: white pad folds are brighter too
    brighter = np.clip(L - bgL, 0, None) / denom * 255.0
    chroma = np.sqrt((a - bga) ** 2 + (b - bgb) ** 2) * 4.0

    fmap = cv2.GaussianBlur(np.maximum(np.maximum(darker, brighter), chroma), (0, 0), 2)
    return np.clip(fmap, 0, 255).astype(np.uint8)


# ── 3. Pad mask ────────────────────────────────────────────────────
def pad_mask(bg: np.ndarray) -> np.ndarray:
    """The pad = bright, colourless background region connected to the image centre."""
    bgL = bg[..., 0]
    bgC = np.hypot(bg[..., 1] - 128, bg[..., 2] - 128)
    pad = (bgL > 0.8 * _center_level(bgL)) & (bgC < _center_level(bgC) + 5)
    pad = pad.astype(np.uint8)

    n, labels, stats, _ = cv2.connectedComponentsWithStats(pad)
    if n <= 1:
        return np.ones_like(pad, bool)
    h, w = pad.shape
    lab_c = labels[h // 2, w // 2]
    keep = lab_c if lab_c != 0 else 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return labels == keep


# ── 4. Multi-scale LoG blob detection ──────────────────────────────
def log_blobs(fmap: np.ndarray, radii: np.ndarray):
    """
    Scale-normalised LoG, maximised over scales.
    Returns (response, best_radius, smoothed-per-scale). −σ²·∇²G is positive at
    the centre of bright blobs; σ = r/√2 matches a disk of radius r.
    """
    f = fmap.astype(np.float32)
    best = np.full(f.shape, -np.inf, np.float32)
    best_r = np.zeros(f.shape, np.float32)
    smoothed = {}
    for r in radii:
        s = r / np.sqrt(2)
        g = cv2.GaussianBlur(f, (0, 0), s)
        smoothed[round(float(r), 1)] = g
        resp = -(s * s) * cv2.Laplacian(g, cv2.CV_32F, ksize=3)
        better = resp > best
        best[better] = resp[better]
        best_r[better] = r
    return best, best_r, smoothed


def blob_isotropy(g: np.ndarray, cx: float, cy: float, r: float) -> float:
    """
    Ratio of the Hessian eigenvalues (small/large) at the blob centre.
    ≈1 for round blobs, ≈0 for ridges such as pad folds (same idea as SIFT's
    edge-response elimination).
    """
    d = max(1, int(round(r / 2)))
    x, y = int(round(cx)), int(round(cy))
    h, w = g.shape
    if not (d <= x < w - d and d <= y < h - d):
        return 0.0
    c = g[y, x]
    dxx = g[y, x + d] + g[y, x - d] - 2 * c
    dyy = g[y + d, x] + g[y - d, x] - 2 * c
    dxy = (g[y + d, x + d] - g[y + d, x - d] - g[y - d, x + d] + g[y - d, x - d]) / 4
    tr, det = dxx + dyy, dxx * dyy - dxy * dxy
    disc = np.sqrt(max(tr * tr / 4 - det, 0))
    l1, l2 = tr / 2 + disc, tr / 2 - disc          # both negative for a bright blob
    big, small = max(abs(l1), abs(l2)), min(abs(l1), abs(l2))
    if big == 0 or l1 > 0:                         # not a bright blob
        return 0.0
    return float(small / big)


def find_candidates(resp, best_r, pad, r_min):
    """Local maxima of the LoG response inside the pad, strongest first."""
    peaks = (resp == cv2.dilate(resp, _disk(0.5 * r_min))) & (resp > 10) & pad
    ys, xs = np.nonzero(peaks)
    order = np.argsort(-resp[ys, xs])
    return [(float(xs[i]), float(ys[i]), float(resp[ys[i], xs[i]]), float(best_r[ys[i], xs[i]]))
            for i in order]


def typical_radius(cands) -> tuple:
    """Coin radius and reference strength from the strongest peaks (coins dominate them)."""
    top = [c for c in cands if c[2] >= 0.5 * cands[0][2]][:15]
    return float(np.median([c[3] for c in top])), float(np.median([c[2] for c in top]))


# ── 5. Verification ────────────────────────────────────────────────
def survival_maps(fmap: np.ndarray, coin_r: float):
    """
    closed : grayscale closing fills the inside of ring-like silver coins.
    opened : grayscale opening with a half-coin disk removes everything
             thinner than that (folds, seams); coins survive almost unchanged.
    """
    closed = cv2.morphologyEx(fmap, cv2.MORPH_CLOSE, _disk(0.45 * coin_r))
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, _disk(0.5 * coin_r))
    return closed.astype(np.float32), opened.astype(np.float32)


def survival(closed, opened, cx, cy, r) -> float:
    m = _disk_mask(closed.shape, cx, cy, 0.5 * r)
    return float(opened[m].mean() / max(closed[m].mean(), 1.0))


# ── 5b. Hough circles (separates touching / overlapping coins) ─────
def hough_circles(gray: np.ndarray, coin_r: float, pad: np.ndarray,
                  fmap: np.ndarray, min_fmap: float) -> list:
    """
    Circle Hough transform with the radius range fixed around the coin size.
    Every visible arc of a coin votes for its centre, so coins in a pile or
    partly covered by another coin are still found. Needs sharp edges — in
    dark / blurred photos it simply finds nothing and LoG does the work.
    A circle is kept only if it lies on the pad and its inside differs from
    the background (rejects circles "seen" in the pad texture).
    """
    g = cv2.medianBlur(gray, 5)
    found = cv2.HoughCircles(
        g, cv2.HOUGH_GRADIENT_ALT, dp=1.5, minDist=HOUGH_MIN_DIST * coin_r,
        param1=150, param2=HOUGH_PERFECTNESS,
        minRadius=int(0.6 * coin_r), maxRadius=int(1.3 * coin_r),
    )
    if found is None:
        return []
    circles = []
    for cx, cy, r in found[0]:
        x, y = int(cx), int(cy)
        if not (0 <= x < pad.shape[1] and 0 <= y < pad.shape[0]) or not pad[y, x]:
            continue
        m = _disk_mask(fmap.shape, cx, cy, 0.7 * r)
        if fmap[m].mean() < min_fmap:
            continue
        # HOUGH_GRADIENT_ALT can return (nearly) concentric circles for one coin
        if any(np.hypot(cx - c[0], cy - c[1]) < 0.3 * coin_r for c in circles):
            continue
        circles.append((float(cx), float(cy), float(fmap[m].mean()), float(r)))
    return circles


def merge_detections(hough: list, log: list, coin_r: float) -> list:
    """
    Hough circles are precise, so they come first; a LoG blob is added only if
    no Hough circle already explains it (blurred / dark coins without edges).
    """
    merged = list(hough)
    for c in log:
        if all(np.hypot(c[0] - m[0], c[1] - m[1]) > MERGE_DIST * coin_r for m in merged):
            merged.append(c)
    return merged


# ── 6. Button detection ────────────────────────────────────────────
def count_holes(gray: np.ndarray, cx: float, cy: float, r: float) -> int:
    """
    Sewing holes: 2-4 small, dark, round spots of similar size, grouped
    symmetrically around the centre. Black-hat (closing − image) highlights
    dark details smaller than the structuring element.
    """
    pad = int(1.2 * r)
    x0, y0 = max(0, int(cx) - pad), max(0, int(cy) - pad)
    x1, y1 = min(gray.shape[1], int(cx) + pad), min(gray.shape[0], int(cy) + pad)
    patch = gray[y0:y1, x0:x1]
    lcx, lcy = cx - x0, cy - y0

    inner = _disk_mask(patch.shape, lcx, lcy, 0.5 * r)
    blackhat = cv2.morphologyEx(patch, cv2.MORPH_BLACKHAT, _disk(max(3, 0.25 * r)))
    vals = blackhat[inner]
    if vals.size == 0:
        return 0
    # Relative to the darkest detail: holes are the strongest dark spots on a button
    thr = max(25, 0.45 * float(vals.max()))
    spots = ((blackhat >= thr) & inner).astype(np.uint8)

    contours, _ = cv2.findContours(spots, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    min_a, max_a = 0.004 * np.pi * r * r, 0.05 * np.pi * r * r
    holes = []
    for c in contours:
        a = cv2.contourArea(c)
        per = cv2.arcLength(c, True)
        if not (min_a <= a <= max_a) or per == 0:
            continue
        if 4 * np.pi * a / per ** 2 < 0.5:
            continue
        m = cv2.moments(c)
        holes.append((m["m10"] / m["m00"], m["m01"] / m["m00"], a))

    if not 2 <= len(holes) <= 4:
        return 0
    areas = np.array([h[2] for h in holes])
    if areas.max() > 3 * areas.min():
        return 0
    hx = np.mean([h[0] for h in holes])
    hy = np.mean([h[1] for h in holes])
    if np.hypot(hx - lcx, hy - lcy) > 0.25 * r:
        return 0
    return len(holes)


def object_colour(hsv: np.ndarray, cx, cy, r) -> tuple:
    """Circular-mean hue and median saturation of the object's core."""
    m = _disk_mask(hsv.shape, cx, cy, 0.6 * r)
    h, s = hsv[..., 0][m], hsv[..., 1][m]
    ang = h.astype(np.float32) * np.pi / 90.0          # OpenCV hue is 0..180
    hue = (np.degrees(np.arctan2(np.sin(ang).mean(), np.cos(ang).mean())) / 2.0) % 180
    return float(hue), float(np.median(s))


def classify(hue: float, sat: float, holes: int) -> tuple:
    """
    Coins are gold (yellow-orange) or silver (grey). Anything else is a button.
    """
    if sat > 60 and 95 <= hue <= 165:
        return "button", "blue/purple colour"
    if sat > 70 and (hue >= 165 or hue <= 6):
        return "button", "pink/red colour"
    if holes >= 2:
        return "button", f"{holes} holes"
    return "coin", ""


# ── Full pipeline ──────────────────────────────────────────────────
def count_coins(img: np.ndarray) -> CountResult:
    h, w = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    bg = background(lab)
    fmap = foreground_map(lab, bg)
    pad = pad_mask(bg)

    radii = np.linspace(R_MIN_FRAC * w, R_MAX_FRAC * w, N_SCALES)
    resp, best_r, smoothed = log_blobs(fmap, radii)
    cands = find_candidates(resp, best_r, pad, radii[0])
    # Drop ridge-like peaks (pad folds) before estimating the coin size
    cands = [c for c in cands if blob_isotropy(smoothed[round(c[3], 1)], c[0], c[1], c[3]) >= ISOTROPY_MIN]
    if not cands:
        return CountResult(coins=0, buttons=0)

    coin_r, ref = typical_radius(cands)
    closed, opened = survival_maps(fmap, coin_r)

    accepted = []
    for cx, cy, val, r in cands:
        if val < PEAK_REL * ref or r < SIZE_REL * coin_r:
            continue
        if any(np.hypot(cx - ax, cy - ay) < MIN_DIST_REL * coin_r for ax, ay, _, _ in accepted):
            continue
        if survival(closed, opened, cx, cy, coin_r) < SURVIVAL_MIN:
            continue
        accepted.append((cx, cy, val, r))

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Foreground level of the accepted blobs → minimum for a Hough circle
    levels = [fmap[_disk_mask(fmap.shape, cx, cy, 0.7 * coin_r)].mean() for cx, cy, _, _ in accepted]
    min_fmap = HOUGH_FG_REL * float(np.median(levels)) if levels else 30.0
    circles = hough_circles(gray, coin_r, pad, fmap, min_fmap)
    detections = merge_detections(circles, accepted, coin_r)

    result = CountResult(coins=0, buttons=0, coin_radius=coin_r)
    for cx, cy, val, r in detections:
        hue, sat = object_colour(hsv, cx, cy, r)
        holes = count_holes(gray, cx, cy, r)
        label, reason = classify(hue, sat, holes)
        result.objects.append(DetectedObject(label, (cx, cy), r, val, holes, hue, sat, reason))

    result.coins = sum(o.label == "coin" for o in result.objects)
    result.buttons = sum(o.label == "button" for o in result.objects)
    return result


def draw_result(img: np.ndarray, result: CountResult) -> np.ndarray:
    """Annotated copy: green circle = coin, red circle + X = button."""
    out = img.copy()
    for o in result.objects:
        x, y, r = int(o.center[0]), int(o.center[1]), int(o.radius)
        if o.label == "coin":
            cv2.circle(out, (x, y), r, (0, 200, 0), 3)
        else:
            cv2.circle(out, (x, y), r, (0, 0, 255), 3)
            d = int(r * 0.6)
            cv2.line(out, (x - d, y - d), (x + d, y + d), (0, 0, 255), 3)
            cv2.line(out, (x - d, y + d), (x + d, y - d), (0, 0, 255), 3)
    text = f"Coins: {result.coins}   Buttons: {result.buttons}"
    cv2.rectangle(out, (0, 0), (out.shape[1], 60), (0, 0, 0), -1)
    cv2.putText(out, text, (15, 42), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
    return out

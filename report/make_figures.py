"""
make_figures.py — regenerate every figure and number used in the report/poster.

    python report/make_figures.py

Writes PNGs to report/figures/ and the per-image table to report/figures/stats.json.
"""

import csv
import json
import sys
import time
from pathlib import Path

import cv2
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import coin_counter as cc  # noqa: E402

DATA = ROOT / "data"
OUT = ROOT / "report" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

NAVY = "#0B3C74"
ACCENT = "#2E9E6B"
GREY = "#7A8BA3"
CAT_COLOURS = {"clean": "#2E9E6B", "noisy": "#64A8E8", "damaged": "#0B3C74"}
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11,
                     "axes.spines.top": False, "axes.spines.right": False})


def img_path(short: str) -> Path:
    """'12.48.26 (18)' → data/WhatsApp Image 2026-09-01 at 12.48.26 (18).jpeg"""
    return DATA / f"WhatsApp Image 2026-09-01 at {short}.jpeg"


def rgb(bgr):
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def save(fig, name):
    fig.savefig(OUT / name, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def label_panels(axes, titles):
    for ax, t in zip(axes, titles):
        ax.set_title(t, fontsize=11, color=NAVY, fontweight="bold")
        ax.axis("off")


# ── Pipeline internals (same calls as count_coins, but kept for display) ──
def stages(img):
    h, w = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    bg = cc.background(lab)
    fmap = cc.foreground_map(lab, bg)
    pad = cc.pad_mask(bg)
    radii = np.linspace(cc.R_MIN_FRAC * w, cc.R_MAX_FRAC * w, cc.N_SCALES)
    resp, best_r, smoothed = cc.log_blobs(fmap, radii)
    raw = cc.find_candidates(resp, best_r, pad, radii[0])
    iso = [c for c in raw if cc.blob_isotropy(smoothed[round(c[3], 1)], c[0], c[1], c[3]) >= cc.ISOTROPY_MIN]
    return dict(fmap=fmap, pad=pad, resp=resp, raw=raw, iso=iso, result=cc.count_coins(img))


def draw_circles(img, circles, colour, thick=4):
    out = img.copy()
    for c in circles:
        cv2.circle(out, (int(c[0]), int(c[1])), int(c[3]), colour, thick)
    return out


def read_gt():
    lines = [l for l in open(ROOT / "ground_truth.csv", encoding="utf-8-sig") if not l.startswith("sep=")]
    return {r["filename"]: r for r in csv.DictReader(lines)}


# ── Figures ──────────────────────────────────────────────────────────
def fig_pipeline_diagram():
    steps = ["Input\nphoto", "Background\nmodel", "Foreground\nmap", "Pad\nmask",
             "Multi-scale\nLoG", "Blob\nverification", "Hough\ncircles", "Coin or\nbutton?"]
    fig, ax = plt.subplots(figsize=(13, 1.9))
    ax.set_xlim(0, len(steps) * 1.6)
    ax.set_ylim(0, 1.4)
    ax.axis("off")
    for i, s in enumerate(steps):
        x = i * 1.6 + 0.1
        colour = ACCENT if i in (4, 6, 7) else NAVY
        ax.add_patch(matplotlib.patches.FancyBboxPatch((x, 0.25), 1.3, 0.9, boxstyle="round,pad=0.03",
                                                       fc=colour, ec="none"))
        ax.text(x + 0.65, 0.7, s, ha="center", va="center", color="white", fontsize=9.5, fontweight="bold")
        if i < len(steps) - 1:
            ax.annotate("", xy=(x + 1.6, 0.7), xytext=(x + 1.32, 0.7),
                        arrowprops=dict(arrowstyle="-|>", color=GREY, lw=1.8))
    save(fig, "fig01_pipeline.png")


def fig_stages(short="12.48.26 (3)"):
    img = cc.load_image(img_path(short))
    s = stages(img)
    pad_vis = img.copy()
    pad_vis[~s["pad"]] = (pad_vis[~s["pad"]] * 0.3).astype(np.uint8)
    resp = np.clip(s["resp"], 0, None)
    resp = (255 * resp / resp.max()).astype(np.uint8)
    panels = [
        (rgb(img), "1. Input"),
        (s["fmap"], "2. Foreground map"),
        (rgb(pad_vis), "3. Pad mask"),
        (cv2.applyColorMap(resp, cv2.COLORMAP_INFERNO)[..., ::-1], "4. LoG response"),
        (rgb(draw_circles(img, s["raw"][:60], (0, 200, 255), 3)), f"5. Raw peaks ({min(60, len(s['raw']))} shown)"),
        (rgb(cc.draw_result(img, s["result"])), f"6. Final: {s['result'].coins} coins"),
    ]
    fig, axes = plt.subplots(1, 6, figsize=(16, 5.2))
    for ax, (im, t) in zip(axes, panels):
        ax.imshow(im, cmap="gray")
    label_panels(axes, [p[1] for p in panels])
    save(fig, "fig02_stages.png")


def fig_synthetic():
    rng = np.random.default_rng(0)
    syn = np.full((1600, 900, 3), 200, np.uint8)
    syn = (syn + rng.normal(0, 4, syn.shape)).clip(0, 255).astype(np.uint8)
    for x, y in [(200, 400), (450, 450), (700, 380), (300, 800), (600, 850), (450, 1150)]:
        cv2.circle(syn, (x, y), 34, (60, 140, 190), -1)
    r = cc.count_coins(syn)
    cc.save_image(OUT / "synthetic_input.png", syn)
    fig, axes = plt.subplots(1, 2, figsize=(6, 5.2))
    axes[0].imshow(rgb(syn))
    axes[1].imshow(rgb(cc.draw_result(syn, r)))
    label_panels(axes, ["Synthetic input (6 discs)", f"Result: {r.coins} detected"])
    save(fig, "fig03_synthetic.png")
    return r.coins


def fig_folds(short="12.48.26 (21)"):
    """Why the Hessian test exists: pad folds give LoG peaks too."""
    img = cc.load_image(img_path(short))
    s = stages(img)
    coin_r, ref = cc.typical_radius(s["raw"])
    strong_raw = [c for c in s["raw"] if c[2] >= cc.PEAK_REL * ref]
    rejected = [c for c in strong_raw if c not in s["iso"]]
    final = [(o.center[0], o.center[1], 0, o.radius) for o in s["result"].objects]
    a = draw_circles(img, rejected, (0, 0, 255), 4)
    a = draw_circles(a, final, (0, 200, 0), 4)
    fig, axes = plt.subplots(1, 2, figsize=(8, 7))
    axes[0].imshow(rgb(img))
    axes[1].imshow(rgb(a))
    label_panels(axes, ["Pad with folds and seams", f"Red: {len(rejected)} ridge peaks rejected\nGreen: {len(final)} final detections"])
    save(fig, "fig07_folds.png")
    return len(rejected)


def fig_buttons():
    shorts = ["12.48.26 (18)", "12.48.26 (19)", "12.48.26 (20)"]
    fig, axes = plt.subplots(1, 3, figsize=(13, 7))
    for ax, sh in zip(axes, shorts):
        img = cc.load_image(img_path(sh))
        r = cc.count_coins(img)
        ax.imshow(rgb(cc.draw_result(img, r)[200:1400]))
        ax.set_title(f"{r.coins} coins, {r.buttons} of 4 buttons flagged", fontsize=11, color=NAVY, fontweight="bold")
        ax.axis("off")
    save(fig, "fig08_buttons.png")

    # Close-up: black-hat shows the sewing holes
    img = cc.load_image(img_path("12.48.26 (18)"))
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    crops = []
    for (x, y) in [(351, 1069), (454, 510)]:           # a button, then a coin
        p = g[y - 45:y + 45, x - 45:x + 45]
        bh = cv2.morphologyEx(p, cv2.MORPH_BLACKHAT, cc._disk(6))
        crops.append((rgb(img[y - 45:y + 45, x - 45:x + 45]), cv2.normalize(bh, None, 0, 255, cv2.NORM_MINMAX)))
    fig, axes = plt.subplots(1, 4, figsize=(10, 3))
    ims = [crops[0][0], crops[0][1], crops[1][0], crops[1][1]]
    for ax, im in zip(axes, ims):
        ax.imshow(im, cmap="gray")
    label_panels(axes, ["Button", "Black-hat: holes light up", "Coin", "Black-hat: no holes"])
    save(fig, "fig09_holes.png")


def fig_examples(items, name):
    fig, axes = plt.subplots(1, len(items), figsize=(4.3 * len(items), 7))
    for ax, (sh, title) in zip(axes, items):
        img = cc.load_image(img_path(sh))
        ax.imshow(rgb(cc.draw_result(img, cc.count_coins(img))))
        ax.set_title(title, fontsize=11, color=NAVY, fontweight="bold")
        ax.axis("off")
    save(fig, name)


def fig_per_image(rows):
    rows = sorted(rows, key=lambda r: (["clean", "noisy", "damaged"].index(r["category"]), r["short"]))
    err = [r["pred"] - r["true"] for r in rows]
    fig, ax = plt.subplots(figsize=(13, 4))
    ax.bar(range(len(rows)), err, color=[CAT_COLOURS[r["category"]] for r in rows])
    ax.axhline(0, color="black", lw=0.8)
    ax.set_xticks(range(len(rows)))
    ax.set_xticklabels([r["id"] for r in rows], fontsize=9)
    ax.set_xlabel("Photo")
    ax.set_ylabel("Predicted − true coins")
    for c, col in CAT_COLOURS.items():
        ax.bar(0, 0, color=col, label=c)
    ax.legend(frameon=False, ncol=3, loc="upper left")
    save(fig, "fig04_per_image.png")


def fig_progress():
    versions = ["Threshold +\nwatershed", "LoG\nblobs", "+ Hessian\nshape test", "+ Hough\ncircles", "+ button\nclassifier"]
    mae = [7.38, 5.81, 2.54, 1.19, 1.27]
    fig, ax = plt.subplots(figsize=(8, 3.6))
    ax.plot(range(len(mae)), mae, "-o", color=NAVY, lw=2.5, ms=10, mfc=ACCENT, mec=ACCENT)
    for i, m in enumerate(mae):
        ax.text(i, m + 0.35, f"{m:.2f}", ha="center", color=NAVY, fontweight="bold")
    ax.set_xticks(range(len(mae)))
    ax.set_xticklabels(versions, fontsize=9)
    ax.set_ylabel("Mean absolute error\n(coins per photo)")
    ax.set_ylim(0, 8.5)
    save(fig, "fig06_progress.png")


def fig_all_inputs(rows):
    rows = sorted(rows, key=lambda r: (["clean", "noisy", "damaged"].index(r["category"]), r["short"]))
    cols = 7
    n_rows = int(np.ceil(len(rows) / cols))
    fig, axes = plt.subplots(n_rows, cols, figsize=(14, 4.6 * n_rows))
    for ax in axes.flat:
        ax.axis("off")
    for ax, r in zip(axes.flat, rows):
        ax.imshow(rgb(cv2.resize(cc.load_image(r["path"]), (270, 480))))
        ax.set_title(f"{r['id']} · {r['category']}\n{r['true']} coins", fontsize=10)
    save(fig, "figA_inputs.png")


def main():
    gt = read_gt()
    rows, times = [], []
    for p in sorted(DATA.glob("*.jpeg")):
        img = cc.load_image(p)
        t0 = time.perf_counter()
        r = cc.count_coins(img)
        times.append((time.perf_counter() - t0) * 1000)
        g = gt[p.name]
        rows.append(dict(path=str(p), short=p.stem.replace("WhatsApp Image 2026-09-01 at ", ""),
                         category=g["category"], true=int(g["true_count"]), pred=r.coins,
                         true_buttons=int(g["true_buttons"]), pred_buttons=r.buttons, ms=times[-1]))

    # Stable photo IDs (P01…) ordered by category, used everywhere in the report
    order = ["clean", "noisy", "damaged"]
    rows.sort(key=lambda r: (order.index(r["category"]), r["short"]))
    for i, r in enumerate(rows, 1):
        r["id"] = f"P{i:02d}"

    fig_pipeline_diagram()
    fig_stages()
    syn = fig_synthetic()
    fig_per_image(rows)
    fig_examples([("12.48.26 (4)", "Clean: 14 of 14"), ("12.48.26 (1)", "Clean: 7 of 7"),
                  ("12.48.26 (12)", "Dark: 14 of 14")], "fig05_exact.png")
    fig_progress()
    folds = fig_folds()
    fig_buttons()
    fig_examples([("12.48.26 (15)", "Motion blur: 22 vs 14"), ("12.48.25", "Dense pile: 10 vs 14"),
                  ("12.48.26 (6)", "Cut at frame: 8 vs 11")], "fig10_errors.png")
    fig_all_inputs(rows)

    stats = dict(rows=[{k: v for k, v in r.items() if k != "path"} for r in rows],
                 synthetic_detected=syn, folds_rejected=folds,
                 runtime_ms_mean=float(np.mean(times)), runtime_ms_min=float(min(times)),
                 runtime_ms_max=float(max(times)))
    (OUT / "stats.json").write_text(json.dumps(stats, indent=1), encoding="utf-8")
    print(f"Figures written to {OUT}")


if __name__ == "__main__":
    main()

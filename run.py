"""
run.py — count coins in every image of the data folder and evaluate.

Usage:
    python run.py                      # all images under data/
    python run.py path/to/image.jpg    # a single image
    python run.py --data data --gt ground_truth.csv --review detection_review.csv --out results

Outputs (in --out):
    <image name>.jpg   annotated image (green = counted coin, red X = round object rejected as not a coin)
    results.csv        machine count vs. true count per image (+ TP / FP / FN from the manual review)

The manual review (detection_review.csv) was made by checking every circle the program drew:
TP = circle on a real coin, FP = circle on something that is not a coin, FN = real coin without a circle.
It describes this version of coin_counter.py; if the code changes and the machine count of a photo no
longer matches the reviewed count, that photo's TP/FP/FN are left empty.
"""

import argparse
import csv
import sys
from pathlib import Path

from coin_counter import count_coins, draw_result, load_image, save_image

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}


def read_csv(path: Path, key: str) -> dict:
    """key column -> row dict. Skips Excel's 'sep=,' hint line if present."""
    if not path.is_file():
        return {}
    with open(path, encoding="utf-8-sig") as f:
        lines = [l for l in f if not l.startswith("sep=")]
    return {row[key]: row for row in csv.DictReader(lines)}


def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def fmt(v, spec=""):
    return "" if v is None else format(v, spec)


def main() -> None:
    # Windows console defaults to a legacy code page; make printing safe
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser(description="Classical coin counter")
    ap.add_argument("images", nargs="*", help="image files (default: everything under --data)")
    ap.add_argument("--data", default="data", help="folder with images (searched recursively)")
    ap.add_argument("--gt", default="ground_truth.csv", help="ground-truth CSV (true coin counts)")
    ap.add_argument("--review", default="detection_review.csv", help="manual circle-by-circle review")
    ap.add_argument("--out", default="results", help="output folder")
    args = ap.parse_args()

    if args.images:
        paths = [Path(p) for p in args.images]
    else:
        paths = sorted(p for p in Path(args.data).rglob("*") if p.suffix.lower() in IMAGE_EXTS)
    if not paths:
        sys.exit(f"No images found in {args.data}")

    gt = read_csv(Path(args.gt), "filename")
    review = read_csv(Path(args.review), "filename")
    out_dir = Path(args.out)
    out_dir.mkdir(exist_ok=True)

    rows = []
    print(f"{'image':<48} {'category':<9} {'coins':>5} {'true':>5} {'error':>6} {'TP':>4} {'FP':>4} {'FN':>4}")
    for path in paths:
        result = count_coins(load_image(path))
        save_image(out_dir / (path.stem + ".jpg"), draw_result(load_image(path), result))

        g = gt.get(path.name, {})
        category = g.get("category") or (path.parent.name if path.parent.name != Path(args.data).name else "")
        true = to_int(g.get("true_count"))
        err = None if true is None else result.coins - true

        # Review applies only if the machine still reports the reviewed count
        rv = review.get(path.name, {})
        tp = fp = fn = None
        if to_int(rv.get("machine_coins")) == result.coins:
            tp, fp, fn = to_int(rv.get("tp")), to_int(rv.get("fp")), to_int(rv.get("fn"))

        rows.append(dict(filename=path.name, category=category, machine_coins=result.coins,
                         true_count=fmt(true), error=fmt(err), tp=fmt(tp), fp=fmt(fp), fn=fmt(fn)))
        print(f"{path.name:<48} {category:<9} {result.coins:>5} {fmt(true):>5} {fmt(err, '+d'):>6} "
              f"{fmt(tp):>4} {fmt(fp):>4} {fmt(fn):>4}")

    with open(out_dir / "results.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # ── Evaluation (only images that have a true count) ─────────────
    scored = [r for r in rows if r["error"] != ""]
    if scored:
        print("\nEvaluation")
        groups = {"all": scored}
        for r in scored:
            groups.setdefault(r["category"] or "-", []).append(r)
        for name, grp in groups.items():
            errs = [int(r["error"]) for r in grp]
            line = (f"  {name:<9} images={len(grp):>2}  MAE={sum(map(abs, errs)) / len(grp):.2f}  "
                    f"exact={sum(e == 0 for e in errs)}/{len(grp)}")
            reviewed = [r for r in grp if r["tp"] != ""]
            if len(reviewed) == len(grp):
                tp, fp, fn = (sum(int(r[k]) for r in grp) for k in ("tp", "fp", "fn"))
                line += (f"  TP={tp} FP={fp} FN={fn}  "
                         f"precision={tp / (tp + fp):.1%}  recall={tp / (tp + fn):.1%}")
            print(line)
    print(f"\nAnnotated images and results.csv saved to: {out_dir.resolve()}")


if __name__ == "__main__":
    main()

"""
run.py — count coins in every image of the data folder and evaluate.

Usage:
    python run.py                      # all images under data/
    python run.py path/to/image.jpg    # a single image
    python run.py --data data --gt ground_truth.csv --out results

Outputs (in --out):
    <image name>.jpg   annotated image (green = coin, red X = button)
    results.csv        predicted vs. true counts per image
"""

import argparse
import csv
import sys
from pathlib import Path

from coin_counter import count_coins, draw_result, load_image, save_image

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}


def read_ground_truth(path: Path) -> dict:
    """filename -> row dict. Skips Excel's 'sep=,' hint line if present."""
    if not path.is_file():
        return {}
    with open(path, encoding="utf-8-sig") as f:
        lines = [l for l in f if not l.startswith("sep=")]
    return {row["filename"]: row for row in csv.DictReader(lines)}


def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def main() -> None:
    # Windows console defaults to a legacy code page; make printing safe
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser(description="Classical coin counter")
    ap.add_argument("images", nargs="*", help="image files (default: everything under --data)")
    ap.add_argument("--data", default="data", help="folder with images (searched recursively)")
    ap.add_argument("--gt", default="ground_truth.csv", help="ground-truth CSV")
    ap.add_argument("--out", default="results", help="output folder")
    args = ap.parse_args()

    if args.images:
        paths = [Path(p) for p in args.images]
    else:
        paths = sorted(p for p in Path(args.data).rglob("*") if p.suffix.lower() in IMAGE_EXTS)
    if not paths:
        sys.exit(f"No images found in {args.data}")

    gt = read_ground_truth(Path(args.gt))
    out_dir = Path(args.out)
    out_dir.mkdir(exist_ok=True)

    rows = []
    print(f"{'image':<48} {'category':<9} {'coins':>5} {'true':>5} {'error':>6} {'buttons':>8}")
    for path in paths:
        result = count_coins(load_image(path))
        save_image(out_dir / (path.stem + ".jpg"), draw_result(load_image(path), result))

        g = gt.get(path.name, {})
        category = g.get("category") or (path.parent.name if path.parent.name != Path(args.data).name else "")
        true = to_int(g.get("true_count"))
        err = None if true is None else result.coins - true
        rows.append(dict(filename=path.name, category=category, predicted_coins=result.coins,
                         predicted_buttons=result.buttons, true_count="" if true is None else true,
                         true_buttons=g.get("true_buttons", ""), error="" if err is None else err))
        print(f"{path.name:<48} {category:<9} {result.coins:>5} {'' if true is None else true:>5} "
              f"{'' if err is None else f'{err:+d}':>6} {result.buttons:>8}")

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
            mae = sum(abs(r["error"]) for r in grp) / len(grp)
            exact = sum(r["error"] == 0 for r in grp)
            within1 = sum(abs(r["error"]) <= 1 for r in grp)
            print(f"  {name:<9} images={len(grp):>2}  MAE={mae:.2f}  "
                  f"exact={exact}/{len(grp)}  within±1={within1}/{len(grp)}")
    print(f"\nAnnotated images and results.csv saved to: {out_dir.resolve()}")


if __name__ == "__main__":
    main()

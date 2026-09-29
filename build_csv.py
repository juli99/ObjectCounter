import os
import csv

DATA_DIR = "data"
CATEGORIES = ["clean", "noisy", "damaged"]
OUTPUT_CSV = "ground_truth.csv"

rows = []
for category in CATEGORIES:
    folder = os.path.join(DATA_DIR, category)
    if not os.path.isdir(folder):
        print(f"אזהרה: התיקייה {folder} לא נמצאה, מדלג")
        continue
    for filename in sorted(os.listdir(folder)):
        if filename.lower().endswith((".jpg", ".jpeg", ".png")):
            rows.append({
                "filename": filename,
                "category": category,
                "true_count": ""
            })

with open(OUTPUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
    f.write("sep=,\n")
    writer = csv.DictWriter(f, fieldnames=["filename", "category", "true_count"])
    writer.writeheader()
    writer.writerows(rows)

print(f"נוצר {OUTPUT_CSV} עם {len(rows)} שורות. מלאי את עמודת true_count ידנית.")
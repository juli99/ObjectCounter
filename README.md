# Every Coin Counts: ספירת מטבעות בעיבוד תמונה קלאסי

**Counting coins with classical image processing.** Given a phone photo of coins on a white, folded pad, the program counts only the coins, even when the photo is dark or blurred, coins touch or overlap, and buttons of the same size are mixed in. No machine learning is used: a large-median background model and Lab foreground map, multi-scale Laplacian-of-Gaussian blob detection, a Hessian eigenvalue test that rejects fold lines, grayscale morphology, a Hough circle transform for touching coins, and a black-hat transform that finds a button's sewing holes.

On 26 photos (340 coins, 12 buttons) it reaches **90.3% count accuracy**, a mean error of **1.27 coins per photo** (0.13 on clean photos), and excludes 9 of 12 buttons. Run `python run.py` to process every image in `data/` and write annotated results to `results/`. The full report and poster are in [`report/`](report/).


פרויקט בעיבוד תמונה קלאסי (ללא למידה עמוקה): ספירת מטבעות בתמונה, כולל הבחנה בין מטבעות לכפתורים.

## הרצה

```bash
pip install -r requirements.txt
python run.py                         # כל התמונות בתיקייה data (כולל תתי-תיקיות)
python run.py "data/some image.jpeg"  # תמונה בודדת
```

התוצאות נשמרות בתיקייה `results/`:
- תמונה מסומנת לכל קלט: עיגול ירוק = מטבע, עיגול אדום עם X = כפתור.
- `results.csv`: ספירה מול ה-ground truth לכל תמונה.

אם בקובץ `ground_truth.csv` מולאה העמודה `true_count`, התוכנית מדפיסה גם הערכה: MAE, התאמה מדויקת ו-±1, לפי קטגוריה.

## שלבי האלגוריתם (`coin_counter.py`)

| שלב | שיטה | מטרה |
|---|---|---|
| 1. מודל רקע | מסנן חציון גדול מאוד (Median) במרחב Lab | הערכת המשטח והתאורה הלא-אחידה |
| 2. מפת חזית | הפרש בהירות יחסי (כהה/בהיר מהרקע) + הפרש צבע | הדגשת עצמים; עובד גם בתמונות חשוכות |
| 3. מסכת משטח | סף על בהירות וצבע הרקע + רכיב קשירות | התעלמות מרצפה, ברכיים, מיטה סביב המשטח |
| 4. גלאי כתמים | LoG רב-סקאלי מנורמל (σ = r/√2) | מציאת מרכזי מטבעות וגודלם |
| 5. אימות | יחס ערכים עצמיים של ההסיאן, סף תגובה יחסי, גודל, פתיחה אפורה ("הישרדות") | סינון קפלים וקווי תפר במשטח |
| 6. Hough למעגלים | `HOUGH_GRADIENT_ALT` עם טווח רדיוס סביב גודל המטבע | הפרדת מטבעות צמודים / חופפים בערימה |
| 7. סיווג | Black-hat לזיהוי 2–4 חורי תפירה, גוון (כחול/ורוד) | הבחנה בין כפתור למטבע |

כל הספים מוגדרים **יחסית** (לגודל התמונה, לגודל המטבע שנמדד ולעוצמת התגובה בתמונה), ולכן אותם פרמטרים עובדים גם בתמונות בהירות, חשוכות ומטושטשות.

## Ground truth וקטגוריות

`ground_truth.csv` מולא בספירה ידנית (כדאי לעבור ולוודא):
- **clean**: תמונות חדות, מטבעות מפוזרים.
- **noisy**: תמונות חשוכות ו/או עם טשטוש תנועה (10–19 לפי סדר הקבצים).
- **damaged**: מקרים קשים: ערימת מטבעות חופפים, מטבעות חתוכים בקצה התמונה, כפתורים בין המטבעות.

בתמונות עם ערימה נספרו רק מטבעות **שנראים** בתמונה. מטבע שמוסתר לגמרי לא נספר.

> שימו לב: הרצת `build_csv.py` תדרוס את `ground_truth.csv` עם עמודה ריקה.

## תוצאות נוכחיות (26 תמונות)

| קטגוריה | תמונות | MAE | התאמה מדויקת | בטווח ±1 |
|---|---|---|---|---|
| clean | 8 | 0.13 | 7/8 | 8/8 |
| noisy | 10 | 1.60 | 3/10 | 7/10 |
| damaged | 8 | 2.00 | 1/8 | 4/8 |
| **הכל** | 26 | 1.27 | 11/26 | 19/26 |

## מגבלות ידועות

- **טשטוש תנועה חזק** (למשל `(15).jpeg`): מטבע מרוח נראה ככמה כתמים ונספר יותר מפעם אחת.
- **ערימה צפופה** (`12.48.25.jpeg`): מטבעות שמוסתרים ברובם לא נמצאים.
- **מטבעות חתוכים בקצה התמונה** (`(6).jpeg`): חצי מטבע לא מזוהה כעיגול.
- **כפתור אפור-משויש**: דומה בצבע למטבע כסוף. כשהחורים לא נמצאים, הוא נספר כמטבע.

## דוח ופוסטר

בתיקייה `report/`:
- `Every_Coin_Counts_Report.docx` / `.pdf`: דוח הפרויקט המלא (21 עמודים, באנגלית).
- `Every_Coin_Counts_Poster.docx` / `.pdf`: פוסטר בגודל A3. אפשר להדפיס אותו מוגדל ל-A1 או 70×100 ס"מ.
- `make_figures.py`: מייצר מחדש את כל האיורים והמספרים (`python report/make_figures.py`).
- `build_report.js`, `build_poster.js`: בונים את קובצי ה-Word מהאיורים (`npm install docx`, ואז `node report/build_report.js .` מתיקיית הפרויקט).

את השמות, המרצה, המוסד והסמסטר צריך למלא ב-Word במקום הסוגריים המרובעים.

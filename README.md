# Every Coin Counts: ספירת מטבעות בעיבוד תמונה קלאסי

**Counting coins with classical image processing.** Given a phone photo of coins on a white, folded pad, the program counts only the coins, even when the photo is dark or blurred, coins touch or overlap, and buttons of the same size are mixed in. No machine learning is used: a large-median background model and Lab foreground map, multi-scale Laplacian-of-Gaussian blob detection, a Hessian eigenvalue test that rejects fold lines, grayscale morphology, a Hough circle transform for touching coins, and a black-hat transform that finds a button's sewing holes.

On 26 hand-counted photos (328 coins, 12 buttons), with every detection reviewed by hand, it finds **89.6% of the coins (recall)** with **88.3% precision** (39 false detections, 34 missed coins), finds every coin on clean photos, and rejects 9 of 12 buttons. Run `python run.py` to process every image in `data/` and write annotated results to `results/`. The full report and poster are in [`report/`](report/).


פרויקט בעיבוד תמונה קלאסי (ללא למידה עמוקה): ספירת מטבעות בתמונה, כולל הבחנה בין מטבעות לכפתורים.

## הרצה

```bash
pip install -r requirements.txt
python run.py                         # כל התמונות בתיקייה data (כולל תתי-תיקיות)
python run.py "data/some image.jpeg"  # תמונה בודדת
```

התוצאות נשמרות בתיקייה `results/`:
- תמונה מסומנת לכל קלט: עיגול ירוק = מטבע שנספר, עיגול אדום עם X = עצם עגול שאינו מטבע ולא נספר.
- `results.csv`: ספירה מול ה-ground truth לכל תמונה.

התוכנית מדפיסה לכל תמונה את הספירה מול הספירה האמיתית (`ground_truth.csv`) ואת TP / FP / FN מהבדיקה הידנית (`detection_review.csv`), ובסוף הערכה לפי קטגוריה: MAE, ספירות מדויקות, Precision ו-Recall.

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

## נתוני אמת ובדיקת הזיהויים

- `ground_truth.csv`: ספירה ידנית מהתמונות המקוריות. כמה מטבעות יש בכל תמונה (`true_count`) וכמה עצמים עגולים שאינם מטבע (`true_noncoin_round`).
- `detection_review.csv`: בדיקה של כל עיגול שהתוכנית ציירה מול התמונה המקורית:
  - **TP**: עיגול על מטבע אמיתי.
  - **FP**: עיגול על משהו שאינו מטבע, עם סיבה: קפל או רקע, מטבע מטושטש שנספר פעמיים, קצה המשטח, או כפתור אפור.
  - **FN**: מטבע אמיתי בלי עיגול.
- `coin_study.xlsx`: אותם נתונים בטבלת Excel עם נוסחאות וסיכום לפי קטגוריה.

הבדיקה מתייחסת לגרסה הנוכחית של `coin_counter.py`. אם הקוד משתנה והספירה של תמונה כבר לא תואמת לבדיקה, `run.py` משאיר את TP/FP/FN שלה ריקים.

קטגוריות:
- **clean**: תמונות חדות, מטבעות מפוזרים.
- **noisy**: תמונות חשוכות ו/או עם טשטוש תנועה.
- **damaged**: ערימות, מטבעות חתוכים בקצה התמונה, כפתורים בין המטבעות.

> שימו לב: `build_csv.py` דורס את `ground_truth.csv` עם עמודה ריקה.

## תוצאות נוכחיות (26 תמונות, 328 מטבעות)

| קטגוריה | מטבעות | נספרו | TP | FP | FN | Precision | Recall | ספירה מדויקת |
|---|---|---|---|---|---|---|---|---|
| clean | 98 | 99 | 98 | 1 | 0 | 99.0% | 100% | 7/8 |
| noisy | 127 | 142 | 116 | 26 | 11 | 81.7% | 91.3% | 3/10 |
| damaged | 103 | 92 | 80 | 12 | 23 | 87.0% | 77.7% | 2/8 |
| **הכל** | **328** | **333** | **294** | **39** | **34** | **88.3%** | **89.6%** | **12/26** |

מתוך 12 התמונות עם ספירה מדויקת, רק 7 בלי אף טעות. ב-5 האחרות זיהוי שגוי ופספוס ביטלו זה את זה.

## מה המכונה טעתה לזהות כמטבע (39 FP)

| סיבה | כמות |
|---|---|
| קפל של המשטח / רקע (בעיקר בתמונות חשוכות) | 22 |
| מטבע מטושטש שנספר פעמיים | 8 |
| קצה המשטח (השוליים הלבנים) | 7 |
| כפתור אפור | 2 |

## מגבלות ידועות

- **טשטוש תנועה חזק** (`(15).jpeg`): מטבע מרוח נראה ככמה כתמים. נספרו 22 במקום 12.
- **ערימה צפופה** (`12.48.25.jpeg`): נמצאו 10 מתוך 14. מטבעות שמוסתרים ברובם לא נמצאים.
- **מטבעות חתוכים בקצה התמונה** (`(6).jpeg`): נמצאו 8 מתוך 11.
- **קצה המשטח**: השוליים הלבנים בקצה העליון או התחתון מזוהים לפעמים כמטבע.
- **כפתור אפור-משויש**: כשהחורים לא נמצאים, הוא נספר כמטבע.

## דוח ופוסטר

בתיקייה `report/`:
- `Every Coin Counts - Report (Yulia Rapana).docx` / `.pdf`: דוח הפרויקט המלא (23 עמודים, באנגלית, בלשון סבילה).
- `Every Coin Counts - Poster (Yulia Rapana).pptx` / `.pdf`: פוסטר PowerPoint בגודל B1 (70×100 ס"מ), לפי דרישות HIT R03. גופנים: שם הפרויקט 76, כותרות הסעיפים ושמות 54, קורס וסמסטר 40, טקסט 32–34. הסעיפים: Introduction, Method, Results, Conclusions, Discussions, ו-QR לריפו.
- `make_figures.py`: מייצר מחדש את כל האיורים והמספרים (`python report/make_figures.py`).
- `build_poster_pptx.js`: בונה את הפוסטר (`npm install pptxgenjs`, ואז `node report/build_poster_pptx.js` מתיקיית הפרויקט).
- `build_report.js`: בנה את גרסת הבסיס של הדוח. הדוח נערך אחר כך ב-Word, ולכן הרצה מחדש תמחק את העריכות.

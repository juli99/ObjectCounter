// Builds the B1 (70 x 100 cm) PowerPoint poster required by HIT.
// Font sizes follow "Details of the poster requirements" R03 (14.10.2024):
//   project name 74-78 · section titles 52-56 · lecturer / participants 52-56
//   course name 38-42 · year & semester 38-42 · body text 32-38
// Usage (from the project folder):  node report/build_poster_pptx.js
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const FIG = path.join(ROOT, "report", "figures");
const OUT = process.argv[2] || path.join(ROOT, "report", "Every Coin Counts - Poster (Yulia Rapana).pptx");
const stats = JSON.parse(fs.readFileSync(path.join(FIG, "stats.json"), "utf8"));
const rows = stats.rows;

// ── Numbers ────────────────────────────────────────────────────────
const sum = (a) => a.reduce((x, y) => x + y, 0);
const T = sum(rows.map((r) => r.true)), P = sum(rows.map((r) => r.pred));
const TP = sum(rows.map((r) => r.tp)), FP = sum(rows.map((r) => r.fp)), FN = sum(rows.map((r) => r.fn));
const recall = (100 * TP / (TP + FN)).toFixed(1), precision = (100 * TP / (TP + FP)).toFixed(1);
const exact = rows.filter((r) => r.pred === r.true).length;
const perfect = rows.filter((r) => r.fp === 0 && r.fn === 0).length;
const clean = rows.filter((r) => r.category === "clean");
const cleanCoins = sum(clean.map((r) => r.true)), cleanFP = sum(clean.map((r) => r.fp));
const nonCoin = sum(rows.map((r) => r.true_noncoin)), rejected = sum(rows.map((r) => r.rejected_noncoin));

// ── Font sizes (pt) — all inside the required ranges ───────────────
const F = { project: 76, section: 54, names: 54, course: 40, semester: 40, body: 34, caption: 32, bigNumber: 72 };

// ── Palette & geometry (inches) ────────────────────────────────────
const C = { navy: "0B3C74", blue: "1565C0", tint: "EAF2FC", green: "2E9E6B", greenSoft: "A9E3C6",
  greenTint: "E7F6EE", text: "1E2A3A", grey: "5F6B7A", white: "FFFFFF", pale: "D6E4F5" };
const W = 27.559, H = 39.37, M = 0.8, CW = W - 2 * M, GAP = 0.7, COL = (CW - GAP) / 2;
const X2 = M + COL + GAP;
const FONT = "Calibri";

const pres = new pptxgen();
pres.defineLayout({ name: "B1_PORTRAIT", width: W, height: H });
pres.layout = "B1_PORTRAIT";
pres.title = "Every Coin Counts";
pres.author = "Yulia Rapana";
const s = pres.addSlide();
s.background = { color: C.white };

const text = (t, o) => s.addText(t, { isTextBox: true, fontFace: FONT, color: C.text, margin: 0, valign: "top", ...o });
const img = (name, x, y, w) => {
  const buf = fs.readFileSync(path.join(FIG, name));
  const h = (w * buf.readUInt32BE(20)) / buf.readUInt32BE(16);
  s.addImage({ path: path.join(FIG, name), x, y, w, h });
  return h;
};
// Section title: green number + navy title, 54 pt
const section = (num, title, x, y, w) => text([
  { text: num + "  ", options: { color: C.green } },
  { text: title, options: { color: C.navy } },
], { x, y, w, h: 1.0, fontSize: F.section, bold: true });
const body = (t, x, y, w, h, o = {}) => text(t, { x, y, w, h, fontSize: F.body, lineSpacingMultiple: 1.05, paraSpaceAfter: 10, ...o });
const caption = (t, x, y, w) => text(t, { x, y, w, h: 1.0, fontSize: F.caption, color: C.grey, italic: true, align: "center" });

// ── Header (project name, participant, course, lecturer, semester) ──
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 7.0, fill: { color: C.navy }, line: { color: C.navy } });
text("Every Coin Counts", { x: M, y: 0.75, w: 17, h: 1.4, fontSize: F.project, bold: true, color: C.white });
text("Counting coins on a textured pad with classical image processing", { x: M, y: 2.25, w: 17, h: 0.8, fontSize: F.body, color: C.pale });
text("Yulia Rapana", { x: M, y: 3.55, w: 17, h: 1.0, fontSize: F.names, bold: true, color: C.greenSoft });
text("Image Processing  ·  Holon Institute of Technology (HIT)", { x: M, y: 4.8, w: 17, h: 0.8, fontSize: F.course, color: C.white });
text("Lecturer", { x: 18.6, y: 2.25, w: 8.1, h: 0.7, fontSize: F.caption, color: C.pale });
text("Dr. Cornel Lustig", { x: 18.6, y: 3.0, w: 8.1, h: 1.0, fontSize: F.names, bold: true, color: C.white });
text("Summer semester 2026", { x: 18.6, y: 4.8, w: 8.1, h: 0.8, fontSize: F.semester, color: C.white });

// ── 01 Introduction ────────────────────────────────────────────────
let y = 7.6;
section("01", "Introduction", M, y, CW);
y += 1.25;
body([
  { text: "People count coins at a glance; a computer sees only pixels. These phone photos add three traps: a white pad full of folds, dark or motion-blurred shots, and round buttons the size of a coin.", options: { breakLine: true } },
  { text: "Goal  ", options: { bold: true, color: C.green } },
  { text: "count only the coins with fixed classical rules, with no training and no machine learning.", options: { breakLine: true } },
  { text: "Question  ", options: { bold: true, color: C.green } },
  { text: "can such rules cope with these conditions, and which objects does the program get wrong?" },
], M, y, COL, 6.0);
const hIn = img("poster_inputs.png", X2 + COL * 0.06, y - 0.2, COL * 0.88);

// ── 02 Method ──────────────────────────────────────────────────────
y = 14.35;
section("02", "Method", M, y, CW);
y += 1.25;
const bullet = (label, t, last) => [
  { text: label + ": ", options: { bold: true, color: C.navy, bullet: { indent: 30 } } },
  { text: t, options: last ? {} : { breakLine: true } },
];
body([
  ...bullet("Background", "a very large median filter models the pad and light; each pixel gets a Lab difference score."),
  ...bullet("Blobs", "multi-scale Laplacian of Gaussian finds round, coin-sized peaks."),
  ...bullet("Folds", "a Hessian shape test rejects ridges; grayscale opening removes seams."),
  ...bullet("Touching coins", "Hough circles separate what LoG merges."),
  ...bullet("Not a coin", "black-hat finds sewing holes; blue or pink is rejected."),
  ...bullet("Evaluation", `${rows.length} photos, ${T} hand-counted coins; every circle checked as TP, FP or FN.`, true),
], M, y, COL, 7.2, { paraSpaceAfter: 8 });
let yr = y;
yr += img("fig01_pipeline.png", X2, yr, COL) + 0.35;
yr += img("fig02_stages.png", X2, yr, COL) + 0.1;
caption("Photo → foreground map → pad mask → LoG → raw peaks (mostly folds) → 14 coins", X2, yr, COL);

// ── 03 Results ─────────────────────────────────────────────────────
y = 22.95;
section("03", "Results", M, y, CW);
y += 1.2;
const tiles = [[`${recall}%`, "recall", `${TP} of ${T} coins found`], [`${precision}%`, "precision", `${TP} of ${P} detections`],
  [`${FP} / ${FN}`, "false / missed", "FP non-coins · FN coins"], [`${exact}/${rows.length}`, "exact counts", `only ${perfect} with no mistake`]];
const TW = (CW - 3 * 0.4) / 4;
tiles.forEach(([big, label, note], i) => {
  const x = M + i * (TW + 0.4);
  const dark = i % 2 === 0;
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: TW, h: 2.7, fill: { color: dark ? C.blue : C.greenTint }, line: { color: dark ? C.blue : C.greenTint } });
  text(big, { x, y: y + 0.2, w: TW, h: 1.1, fontSize: F.bigNumber, bold: true, align: "center", color: dark ? C.white : C.navy });
  text(label, { x, y: y + 1.3, w: TW, h: 0.6, fontSize: F.body, bold: true, align: "center", color: dark ? C.greenSoft : C.green });
  text(note, { x, y: y + 1.9, w: TW, h: 0.6, fontSize: F.caption, align: "center", color: dark ? C.pale : C.grey });
});
y += 3.0;
const wc = COL * 0.84;
const h4 = img("poster_fp_fn.png", M + (COL - wc) / 2, y, wc);
const h11 = img("poster_fp_causes.png", X2 + (COL - wc) / 2, y, wc);
const hc = Math.max(h4, h11);
caption("False detections (up) and missed coins (down) per photo", M, y + hc + 0.05, COL);
caption(`What was mistaken for a coin (${FP} FP)`, X2, y + hc + 0.05, COL);

// ── 04 Conclusions · 05 Discussions ────────────────────────────────
y = y + hc + 0.85;
section("04", "Conclusions", M, y, COL);
section("05", "Discussions", X2, y, COL);
y += 1.2;
body([
  { text: "Target: ", options: { bold: true, color: C.green } },
  { text: "count only the coins under changing conditions.", options: { breakLine: true } },
  { text: "Achieved: ", options: { bold: true, color: C.green } },
  { text: `${recall}% recall, ${precision}% precision with classical rules only; all ${cleanCoins} coins found on clean photos and ${rejected} of ${nonCoin} buttons rejected. Dark photos add false coins; piles hide real ones.` },
], M, y, COL, H - M - y);
const QR = 2.7;
body([
  { text: "Next: merge detections along the blur direction, drop the pad's white hem from the mask, fit partial circles at the frame, and use rim colour for grey buttons." },
], X2, y, COL - QR - 0.4, H - M - y);
s.addImage({ path: path.join(FIG, "qr_repo.png"), x: X2 + COL - QR, y: y + 0.05, w: QR, h: QR });
text("Source code", { x: X2 + COL - QR - 0.2, y: y + QR + 0.1, w: QR + 0.4, h: 0.6, fontSize: F.caption, color: C.grey, align: "center" });
console.log("bottom of text boxes at", (y).toFixed(2), "of", H.toFixed(2));

pres.writeFile({ fileName: OUT }).then((f) => console.log("wrote", f));

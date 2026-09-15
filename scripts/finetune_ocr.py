#!/usr/bin/env python3
"""OCR 모델을 우리 의사록에 맞춰 다시 학습시킨다 (`docs/minutes-ocr.md` 4-11).

    # ① 줄 이미지와 정답을 만든다 — 사람이 정답을 적는 곳은 없다
    python3 scripts/finetune_ocr.py lines <생성기 출력 폴더> <나갈 폴더>

    # ② 학습 파일(.box·.lstmf)로 바꾸고 문서 단위로 가른다
    python3 scripts/finetune_ocr.py prepare <줄 폴더> --tessdata <실수 모델 폴더>

**왜 규칙이 아니라 모델인가** — 규칙으로 못 잡는 오독이 남는다. `증`→`중`,
`득`→`독` 같은 받침 오독은 어떤 정규식으로도 되살릴 수 없다 (4-8).

**왜 정답을 사람이 안 적어도 되는가** — 생성기가 같은 시드에서 깨끗한 PDF 와 정답을
함께 낸다. 깨끗한 PDF 에서 줄 글자와 좌표를 얻고(PyMuPDF), **같은 자리를 열화본에서
오려낸다.** 기하 변형만 끄면 좌표가 그대로 맞는다.

준비물:
    apt-get install tesseract-ocr tesseract-ocr-kor     # 훈련 도구가 함께 들어 있다
    curl -o kor.traineddata https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/kor.traineddata

**정수화 모델로는 학습이 안 된다.** 우리가 싣는 두 모델(apt 판, npm `4.0.0`)이 모두
정수화라 출발점은 `tessdata_best` 하나뿐이다.
"""
from __future__ import annotations

import argparse
import random
import re
import subprocess
import sys
from pathlib import Path

import pymupdf

# 기하 변형은 끈다 — 켜면 깨끗한 PDF 의 좌표가 열화본에서 어긋나 **정답이 틀어진다.**
# 흐림·잡티·명암·이진화 같은 광학적 열화는 그대로 둔다. 고치려는 것이 그쪽이다.
GEOMETRIC = ("rotate", "perspective", "fold", "border")

# 오려낼 때 둘레 여유(픽셀). 너무 붙여 자르면 획이 잘린다.
PAD = 4

DEFAULT_PROFILES = ("photocopy", "aged", "low_dpi", "office_scan", "mobile_photo")


def _scan_module(generator_dir: Path):
    """`minutes_generator` 의 열화 모듈을 빌려 온다. 이 저장소에는 열화기가 없다."""
    sys.path.insert(0, str(generator_dir))
    from minutes_generator import scan  # noqa: PLC0415

    return scan


def lines_of(pdf: Path):
    """(페이지, bbox(pt), 글자). 표처럼 벌려 쓴 줄도 한 줄로 잡는다."""
    doc = pymupdf.open(pdf)
    try:
        for pno, page in enumerate(doc):
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    text = "".join(s["text"] for s in line["spans"]).strip()
                    if len(text) >= 2:
                        yield pno, line["bbox"], text
    finally:
        doc.close()


def build_lines(pdf: Path, profile: str, out_dir: Path, rng: random.Random, scan) -> int:
    params = scan.sample_params(profile, rng)
    for key in GEOMETRIC:
        params.pop(key, None)

    pages = [scan.apply(im, params, rng) for im in scan.rasterize(pdf.read_bytes(), params.get("dpi", 300))]
    doc = pymupdf.open(pdf)
    try:
        scales = [(pages[i].width / doc[i].rect.width, pages[i].height / doc[i].rect.height)
                  for i in range(len(pages))]
    finally:
        doc.close()

    written = 0
    for pno, (x0, y0, x1, y1), text in lines_of(pdf):
        sx, sy = scales[pno]
        box = (max(0, int(x0 * sx) - PAD), max(0, int(y0 * sy) - PAD),
               min(pages[pno].width, int(x1 * sx) + PAD),
               min(pages[pno].height, int(y1 * sy) + PAD))
        if box[2] - box[0] < 12 or box[3] - box[1] < 8:
            continue
        stem = out_dir / f"{pdf.stem}_{profile}_{pno}_{written:03d}"
        pages[pno].crop(box).convert("L").save(stem.with_suffix(".tif"))
        stem.with_suffix(".gt.txt").write_text(text + "\n", encoding="utf-8")
        written += 1
    return written


def write_box(tif: Path) -> bool:
    """정답 텍스트에서 상자 파일을 만든다.

    LSTM 학습은 글자마다의 좌표를 쓰지 않는다 — 줄의 글자 차례만 있으면 된다. 그래서
    글자마다 이미지 전체를 상자로 준다. **OCR 로 상자를 만들면 오독이 정답으로 굳는다.**
    """
    from PIL import Image  # noqa: PLC0415

    gt = Path(str(tif)[:-4] + ".gt.txt")
    if not gt.exists():
        return False
    line = gt.read_text(encoding="utf-8").strip("\n")
    if not line.strip():
        return False
    with Image.open(tif) as im:
        w, h = im.size
    rows = [f"{ch} 0 0 {w} {h} 0" for ch in line]
    rows.append(f"\t 0 0 {w} {h} 0")  # 줄 끝 표시
    Path(str(tif)[:-4] + ".box").write_text("\n".join(rows) + "\n", encoding="utf-8")
    return True


def cmd_lines(args: argparse.Namespace) -> int:
    scan = _scan_module(args.generator)
    args.out.mkdir(parents=True, exist_ok=True)
    profiles = args.profiles.split(",")
    total = docs = 0
    for pdf in sorted(args.src.glob("*/*.pdf")):
        if pdf.name.endswith("_scan.pdf") or docs >= args.limit:
            continue
        total += build_lines(pdf, profiles[docs % len(profiles)], args.out,
                             random.Random(hash(pdf.name) & 0xFFFF), scan)
        docs += 1
    print(f"문서 {docs}건 → 줄 {total}건")
    return 0


def cmd_prepare(args: argparse.Namespace) -> int:
    tifs = sorted(args.lines.glob("*.tif"))
    boxes = sum(write_box(t) for t in tifs)
    print(f"상자 {boxes}건")

    env = {"TESSDATA_PREFIX": str(args.tessdata)}
    for tif in tifs:
        subprocess.run(["tesseract", tif.name, tif.stem, "--psm", "13", "-l", "kor", "lstm.train"],
                       cwd=args.lines, env={**dict(__import__("os").environ), **env},
                       capture_output=True)
    lstmf = sorted(str(p) for p in args.lines.glob("*.lstmf"))
    print(f"lstmf {len(lstmf)}건")

    # **줄이 아니라 문서로 가른다.** 같은 문서의 줄이 학습과 평가에 걸치면 누수다.
    stem = lambda p: re.match(r"(.+?)_(?:[a-z_]+)_\d+_\d+\.lstmf$", Path(p).name).group(1)  # noqa: E731
    docs = sorted({stem(p) for p in lstmf})
    random.Random(args.seed).shuffle(docs)
    held = set(docs[: max(1, len(docs) // args.eval_ratio)])
    train = [p for p in lstmf if stem(p) not in held]
    evals = [p for p in lstmf if stem(p) in held]
    (args.lines / "train.txt").write_text("\n".join(train) + "\n")
    (args.lines / "eval.txt").write_text("\n".join(evals) + "\n")
    print(f"문서 {len(docs)}건 → 학습 {len(train)}줄 / 평가 {len(evals)}줄")

    print(f"""
다음은 이렇게 돈다 — **조기에 멈춰야 한다** (4-11):

  combine_tessdata -e {args.tessdata}/kor.traineddata kor.lstm
  lstmtraining --continue_from kor.lstm \\
      --traineddata {args.tessdata}/kor.traineddata \\
      --train_listfile {args.lines}/train.txt \\
      --eval_listfile {args.lines}/eval.txt \\
      --model_output out/kormin --max_iterations 1200
  lstmtraining --stop_training --continue_from out/kormin_checkpoint \\
      --traineddata {args.tessdata}/kor.traineddata --model_output kor.traineddata

**학습 오차를 보고 고르지 마라.** 8,000 회까지 돌리면 학습 BCER 이 0.29% 까지
떨어지는데 파이프라인 정확도는 오히려 내려간다. 판정은 항상 봉인 구간에서
`bench_minutes.py --source scan` 으로 한다.
""")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("lines", help="줄 이미지와 정답을 만든다")
    a.add_argument("src", type=Path, help="생성기 출력 폴더 (깨끗한 PDF 가 있는 곳)")
    a.add_argument("out", type=Path, help="줄을 담을 폴더")
    a.add_argument("--generator", type=Path, default=Path("../minutes_generator"),
                   help="`minutes_generator` 저장소 경로. 열화 프로파일을 빌려 온다")
    a.add_argument("--profiles", default=",".join(DEFAULT_PROFILES))
    a.add_argument("--limit", type=int, default=150)
    a.set_defaults(func=cmd_lines)

    b = sub.add_parser("prepare", help="상자·lstmf 를 만들고 문서 단위로 가른다")
    b.add_argument("lines", type=Path)
    b.add_argument("--tessdata", type=Path, required=True,
                   help="실수 모델이 `kor.traineddata` 로 있는 폴더. `configs/` 도 함께 있어야 한다")
    b.add_argument("--eval-ratio", type=int, default=12, help="평가로 뺄 문서 비율의 역수 (기본 1/12)")
    b.add_argument("--seed", type=int, default=7)
    b.set_defaults(func=cmd_prepare)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

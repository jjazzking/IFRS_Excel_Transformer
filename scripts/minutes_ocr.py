#!/usr/bin/env python3
"""
스캔 페이지의 글자를 읽는다. `docs/minutes-ocr.md` 설계의 구현이다.

텍스트 레이어가 있는 페이지에는 쓰지 않는다. 거기서는 PyMuPDF 가 글자와 좌표를
정확히 주므로 OCR 은 돈과 정확도를 동시에 버리는 일이다.

이 모듈이 지키는 약속은 하나다 — **텍스트 경로와 똑같은 모양을 내놓는다.**
낱말 하나에 글자·PDF 좌표·줄 번호·신뢰도. 그러면 그 뒤의 좌표계와 규칙은 한 줄도
바뀌지 않는다. 클라우드 엔진을 붙일 때도 이 모양만 맞추면 된다.

    from minutes_ocr import TesseractEngine
    words = TesseractEngine()(page)      # list[OcrWord]

설치:  apt-get install tesseract-ocr tesseract-ocr-kor
"""
from __future__ import annotations

import csv
import io
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import NamedTuple

import pymupdf

# 해상도를 올려도 좋아지지 않는다. 글자 간격이 벌어져 낱말이 더 잘게 쪼개진다
# (`docs/minutes-ocr.md` 2-2). 150dpi 가 가장 깨끗했고 파일도 제일 작다.
DEFAULT_DPI = 150

# 스캔 PDF 는 페이지 크기를 **픽셀 그대로** 잡아 두는 경우가 많다. 300dpi 로 뜬
# A4 가 595×842 가 아니라 2481×3508 포인트로 들어온다. 여기에 dpi 를 그대로
# 곱하면 5169×7308 로 렌더되어 OCR 이 네 배 느려지고 낱말은 더 잘게 쪼개진다.
# 그래서 배율이 아니라 **목표 가로 픽셀**로 맞춘다. A4 를 150dpi 로 뜬 크기다.
TARGET_WIDTH_PX = 1240

# 페이지 평균 신뢰도가 이 아래면 방향이 틀어졌다고 보고 돌려 가며 다시 읽는다.
# 정상 88 대 90도 회전 43 으로 뚜렷이 갈린다. 방향 감지(OSD)는 쓰지 않는다 —
# 한국어 페이지에서 90도를 180도라고 답했다.
ORIENTATION_THRESHOLD = 70.0
ROTATIONS = (0, 90, 180, 270)

# 이 아래로 떨어진 낱말은 실제로 틀린 낱말이었다. 검증에서 필드를 내리는 데 쓴다.
LOW_CONFIDENCE = 60.0


class OcrWord(NamedTuple):
    """낱말 하나. bbox 는 **PDF 포인트**다 — 픽셀 변환은 이 모듈 안에서 끝낸다."""

    text: str
    bbox: tuple[float, float, float, float]
    line: int
    confidence: float


class OcrUnavailable(RuntimeError):
    """엔진이 설치되어 있지 않다. 규칙 전용 경로는 이 예외 없이 그대로 돈다."""


class TesseractEngine:
    """로컬 Tesseract. 파일이 기계 밖으로 나가지 않으므로 보안 심의를 기다리지 않는다."""

    name = "tesseract"

    def __init__(self, lang: str = "kor", dpi: int = DEFAULT_DPI, psm: str = "6"):
        self.lang, self.dpi, self.psm = lang, dpi, psm
        self.last_rotation = 0
        self.last_mean_confidence = 0.0
        self._hint = 0
        self._settled = False

    # ------------------------------------------------------------------ 실행

    @staticmethod
    def available() -> bool:
        return shutil.which("tesseract") is not None

    def __call__(self, page: pymupdf.Page) -> list[OcrWord]:
        if not self.available():
            raise OcrUnavailable(
                "tesseract 가 없다.  apt-get install tesseract-ocr tesseract-ocr-kor"
            )

        # 방향은 한 문서 안에서 같다. 한 번 정해지면 그다음 페이지는 찾지 않는다.
        # 열화가 심한 스캔본은 바로 놓여 있어도 평균 신뢰도가 문턱에 못 미쳐,
        # 페이지마다 네 방향을 다 돌면 비용이 네 배가 된다.
        words = self._read(page, self._hint)
        mean = _mean_confidence(words)
        best: tuple[float, int, list[OcrWord]] = (mean, self._hint, words)

        if mean < ORIENTATION_THRESHOLD and not self._settled:
            for rotation in (r for r in ROTATIONS if r != self._hint):
                other = self._read(page, rotation)
                score = _mean_confidence(other)
                if score > best[0]:
                    best = (score, rotation, other)
                if score >= ORIENTATION_THRESHOLD:
                    break
            self._settled = True
        elif mean >= ORIENTATION_THRESHOLD:
            self._settled = True

        self.last_mean_confidence, self.last_rotation = best[0], best[1]
        self._hint = best[1]
        return best[2]

    # ------------------------------------------------------------------ 내부

    def _read(self, page: pymupdf.Page, rotation: int) -> list[OcrWord]:
        # 원래 크기가 작은 페이지는 dpi 대로, 이미 큰 페이지는 목표 폭으로 줄인다.
        zoom = min(self.dpi / 72, TARGET_WIDTH_PX / max(page.rect.width, 1))
        mat = pymupdf.Matrix(zoom, zoom).prerotate(rotation)
        pix = page.get_pixmap(matrix=mat)

        # 픽셀 → PDF 포인트. get_pixmap 은 변환된 사각형을 원점으로 당겨 놓으므로
        # 그 이동량을 되돌린 뒤 역행렬을 건다. 이걸 밖으로 흘리면 하이라이트가
        # 페이지마다 어긋난다.
        moved = page.rect * mat
        inverse = ~mat

        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "page.png"
            pix.save(png)
            proc = subprocess.run(
                ["tesseract", str(png), "stdout", "-l", self.lang, "--psm", self.psm, "tsv"],
                capture_output=True, text=True,
            )
        if proc.returncode != 0:
            raise OcrUnavailable(f"tesseract 실패: {proc.stderr.strip()[:200]}")

        words: list[OcrWord] = []
        lines: dict[tuple[int, int, int], int] = {}
        for row in csv.DictReader(io.StringIO(proc.stdout), delimiter="\t"):
            text = (row.get("text") or "").strip()
            if not text:
                continue
            try:
                left, top = float(row["left"]), float(row["top"])
                width, height = float(row["width"]), float(row["height"])
                conf = float(row["conf"])
            except (KeyError, ValueError):
                continue

            key = (int(row["block_num"]), int(row["par_num"]), int(row["line_num"]))
            line = lines.setdefault(key, len(lines))

            p0 = pymupdf.Point(left + moved.x0, top + moved.y0) * inverse
            p1 = pymupdf.Point(left + width + moved.x0, top + height + moved.y0) * inverse
            bbox = (min(p0.x, p1.x), min(p0.y, p1.y), max(p0.x, p1.x), max(p0.y, p1.y))
            words.append(OcrWord(text=text, bbox=bbox, line=line, confidence=conf))
        return words


def _mean_confidence(words: list[OcrWord]) -> float:
    return sum(w.confidence for w in words) / len(words) if words else 0.0


def engine_or_none(name: str | None) -> object | None:
    """이름으로 엔진을 고른다. `None` 이면 OCR 을 쓰지 않는다 (기본값)."""
    if not name:
        return None
    if name == "tesseract":
        return TesseractEngine()
    raise SystemExit(f"모르는 OCR 엔진: {name} (지금은 tesseract 만 있다)")

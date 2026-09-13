#!/usr/bin/env python3
"""
이사회 의사록 PDF 를 '글자 위치를 되찾을 수 있는 본문'으로 바꾼다.

여기서 만드는 좌표계에 이후 모든 근거가 매달린다. 규칙이든 모델이든, 뽑아낸 값은
`(start, end)` 문자 구간 하나로만 원문을 가리키고, 그 구간을 페이지·좌표로 되돌리는
일은 전부 이 모듈이 한다. 모델에게 좌표를 묻지 않는 이유가 이것이다
(`docs/minutes-plan.md` 1장).

본문 문자열을 페이지 텍스트가 아니라 **낱말 목록에서 직접 쌓는다.** 그래야 문자
오프셋과 낱말 bbox 가 어긋나지 않는다. PyMuPDF 의 `get_text()` 결과를 쓰고 bbox 는
따로 받아오면, 공백 처리가 미세하게 달라 구간이 한두 글자씩 밀린다.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

# 이 글자 수에 못 미치는 페이지는 이미지로 본다. 날인·서명 페이지가 여기 걸린다.
# 머리글·쪽번호만 텍스트로 깔린 스캔 페이지가 있어 0 이 아니라 여유를 둔다.
SCAN_PAGE_CHAR_THRESHOLD = 40

# 페이지 사이에 넣는 구분자. 본문 문자열에서 페이지가 섞이지 않게만 하면 되므로
# 빈 줄 하나면 충분하다. 길이가 바뀌면 오프셋 계산도 같이 바뀐다.
PAGE_SEPARATOR = "\n\n"


@dataclass
class Word:
    """낱말 하나 — 본문 문자열에서의 구간과 페이지 위에서의 자리."""

    start: int  # 문서 전체 본문에서의 시작 오프셋
    end: int
    bbox: tuple[float, float, float, float]
    page: int
    line: int
    source: str = "text"  # 'text' | 'ocr'
    confidence: float | None = None  # OCR 로 읽은 낱말만. 0~100


@dataclass
class Page:
    index: int  # 0-based
    kind: str  # 'text' | 'scan'
    start: int  # 문서 전체 본문에서 이 페이지가 시작하는 오프셋
    end: int
    width: float
    height: float
    rotation: int
    ocr_rotation: int | None = None  # OCR 이 고른 방향
    ocr_confidence: float | None = None  # 그 방향에서의 평균 신뢰도


@dataclass
class Evidence:
    """값 하나가 원문 어디에서 왔는지. 스키마의 모든 필드에 같은 모양으로 붙는다."""

    page: int  # 1-based (사람이 보는 쪽번호)
    start: int
    end: int
    text: str
    bbox: list[list[float]] = field(default_factory=list)
    source: str = "text"  # 'text' | 'ocr' | 'model'

    def to_json(self) -> dict:
        return {
            "page": self.page,
            "start": self.start,
            "end": self.end,
            "text": self.text,
            "bbox": [[round(v, 1) for v in b] for b in self.bbox],
            "source": self.source,
        }


class MinutesText:
    """PDF 한 건의 본문과 좌표계."""

    def __init__(self, path: Path, ocr=None):
        """`ocr` 를 주면 **스캔 페이지에서만** 그 엔진을 부른다.

        안 주면 지금까지와 똑같이 돈다 — 스캔 페이지는 읽지 않고 표시만 남긴다.
        OCR 이 없는 환경에서 깨지지 않아야 하고, 스캔본을 다루지 않는 사람에게
        설치를 강요할 이유도 없다.
        """
        self.path = Path(path)
        self.ocr = ocr
        self.pages: list[Page] = []
        self.words: list[Word] = []
        self.text: str = ""
        self._load()

    # ------------------------------------------------------------------ 읽기

    def _load(self) -> None:
        doc = pymupdf.open(self.path)
        chunks: list[str] = []
        cursor = 0

        for page_no, page in enumerate(doc):
            if chunks:
                chunks.append(PAGE_SEPARATOR)
                cursor += len(PAGE_SEPARATOR)

            page_start = cursor
            native = sorted(page.get_text("words"), key=lambda w: (w[5], w[6], w[7]))
            native_chars = sum(len(w[4]) for w in native)
            kind = "text" if native_chars >= SCAN_PAGE_CHAR_THRESHOLD else "scan"

            rotation = confidence = None
            if kind == "text":
                items = [(w[4], (w[0], w[1], w[2], w[3]), (w[5], w[6]), "text", None) for w in native]
            elif self.ocr is not None:
                words = self.ocr(page)
                rotation = getattr(self.ocr, "last_rotation", None)
                confidence = getattr(self.ocr, "last_mean_confidence", None)
                items = [(w.text, w.bbox, (0, w.line), "ocr", w.confidence) for w in words]
            else:
                items = []  # 읽지 않는다. `SCAN_PAGE` 로 표시하고 넘어간다.

            prev_line = None
            for text, bbox, line_key, source, conf in items:
                if prev_line is None:
                    sep = ""
                elif line_key != prev_line:
                    sep = "\n"
                else:
                    sep = " "
                prev_line = line_key

                if sep:
                    chunks.append(sep)
                    cursor += len(sep)

                # 전각 숫자·영문과 특수 공백을 정규화한다. 길이가 변하면 오프셋이
                # 깨지므로, 길이를 보존하는 변환만 한다.
                norm = _normalize_keeping_length(text)
                chunks.append(norm)
                self.words.append(
                    Word(start=cursor, end=cursor + len(norm), bbox=tuple(bbox), page=page_no,
                         line=line_key[1], source=source, confidence=conf)
                )
                cursor += len(norm)

            self.pages.append(
                Page(
                    index=page_no,
                    kind=kind,
                    start=page_start,
                    end=cursor,
                    width=page.rect.width,
                    height=page.rect.height,
                    rotation=page.rotation,
                    ocr_rotation=rotation,
                    ocr_confidence=confidence,
                )
            )

        doc.close()
        self.text = "".join(chunks)

    # ------------------------------------------------------------------ 되찾기

    def page_of(self, offset: int) -> int:
        """문자 오프셋이 몇 쪽인지 (1-based)."""
        for page in self.pages:
            if page.start <= offset <= page.end:
                return page.index + 1
        return self.pages[-1].index + 1 if self.pages else 1

    def bboxes_for(self, start: int, end: int) -> list[list[float]]:
        """구간에 걸친 낱말들의 좌표를 줄 단위로 묶는다. 하이라이트 사각형이 된다."""
        hits = [w for w in self.words if w.start < end and w.end > start]
        merged: dict[tuple[int, int], list[float]] = {}
        for w in hits:
            key = (w.page, w.line)
            box = merged.get(key)
            if box is None:
                merged[key] = list(w.bbox)
            else:
                box[0] = min(box[0], w.bbox[0])
                box[1] = min(box[1], w.bbox[1])
                box[2] = max(box[2], w.bbox[2])
                box[3] = max(box[3], w.bbox[3])
        return list(merged.values())

    def words_in(self, start: int, end: int) -> list[Word]:
        return [w for w in self.words if w.start < end and w.end > start]

    def min_confidence(self, start: int, end: int) -> float | None:
        """구간에 걸친 낱말의 **최저** 신뢰도. 평균이 아니라 최저를 본다.

        평균 88 인 페이지 안에 신뢰도 24 짜리 낱말이 섞여 있었고, 틀린 것은 그
        낱말이었다. 금액·인원수처럼 한 글자가 결과를 바꾸는 필드에서 특히 그렇다.
        """
        scores = [w.confidence for w in self.words_in(start, end) if w.confidence is not None]
        return min(scores) if scores else None

    def evidence(self, start: int, end: int, source: str | None = None) -> Evidence:
        """구간 하나를 근거로 만든다. 글자는 여기서 원문을 잘라 담는다 — 누구도 다시 쓰지 않는다."""
        start = max(0, start)
        end = min(len(self.text), end)
        hits = self.words_in(start, end)
        if source is None:
            source = "ocr" if any(w.source == "ocr" for w in hits) else "text"
        return Evidence(
            page=self.page_of(start),
            start=start,
            end=end,
            text=self.text[start:end].strip(),
            bbox=self.bboxes_for(start, end),
            source=source,
        )

    # ------------------------------------------------------------------ 요약 정보

    @property
    def scan_pages(self) -> list[int]:
        """이미지 페이지의 쪽번호 (1-based)."""
        return [p.index + 1 for p in self.pages if p.kind == "scan"]

    @property
    def unread_pages(self) -> list[int]:
        """읽지 못한 쪽번호. OCR 을 붙이면 여기가 빈다."""
        return [p.index + 1 for p in self.pages if p.kind == "scan" and p.ocr_rotation is None]

    def summary(self) -> dict:
        return {
            "fileName": self.path.name,
            "pageCount": len(self.pages),
            "pageKinds": [p.kind for p in self.pages],
            "charCount": len(self.text),
            "scanPages": self.scan_pages,
            "unreadPages": self.unread_pages,
            "ocr": [
                {"page": p.index + 1, "rotation": p.ocr_rotation,
                 "meanConfidence": round(p.ocr_confidence, 1) if p.ocr_confidence else None}
                for p in self.pages if p.ocr_rotation is not None
            ],
        }


def _normalize_keeping_length(word: str) -> str:
    """길이를 보존하는 정규화만 한다 — 오프셋이 밀리면 근거 추적이 전부 무너진다."""
    out = []
    for ch in word:
        if ch in "    ​　":
            out.append(" ")
        elif unicodedata.category(ch) == "Nd" and not ch.isascii():
            out.append(unicodedata.digit(ch).__str__())
        elif "！" <= ch <= "～":  # 전각 영문·기호
            out.append(chr(ord(ch) - 0xFEE0))
        else:
            out.append(ch)
    return "".join(out)

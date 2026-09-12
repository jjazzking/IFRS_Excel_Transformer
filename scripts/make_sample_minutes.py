#!/usr/bin/env python3
"""
검증용 **합성** 이사회 의사록 PDF 와 정답(golden) JSON 을 만든다.

    python3 scripts/make_sample_minutes.py -o samples/minutes

실제 의사록은 미공개 중요정보라 저장소에 둘 수 없다. 그렇다고 표본 없이 규칙을
고치면 무엇이 좋아졌는지 알 수 없다. 그래서 **현장에서 실제로 보이는 서식 변형**을
담은 가짜 의사록을 만들어 둔다. 회사명·금액·사람은 전부 지어낸 것이다.

네 건이 각각 다른 것을 시험한다.

    sample-01  표준형        — `제N호 의안`, `재적이사 N명 중 M명 출석`, 함정으로 사외이사 수
    sample-02  표 라벨형     — `이사 총수 : N명`, `의안 제N호`, 부결·보류
    sample-03  스캔 혼재형   — 2쪽이 이미지다. 규칙이 어디서 멈추는지 보여 준다
    sample-04  번호 누락형   — 제1호 다음이 제3호. 검증 규칙이 잡아내야 한다

여기서 만든 정답으로 `scripts/eval_minutes.py` 가 채점한다. 실제 의사록을 쓸 수 있게
되면 같은 모양의 정답 파일만 손으로 만들면 된다.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf

FONT = "korea"
SIZE = 10.5
MARGIN = 56

SAMPLES: list[dict] = [
    {
        "name": "sample-01-표준형",
        "pages": [
            """이 사 회 의 사 록


1. 일    시 : 2026년 3월 15일(금) 오전 10시 00분

2. 장    소 : 본사 3층 대회의실

3. 출석현황 : 재적이사 7명 중 6명 출석
             (그 중 사외이사 3명 중 3명 출석)
             재적 감사위원 3명 중 3명 출석

의장인 대표이사 김OO은 위와 같이 이사회가 적법하게 성립되었음을 알리고
개회를 선언하다.


제1호 의안 : 운영자금 조달을 위한 유상증자의 건

의장은 운영자금 조달을 위하여 금 50,000,000,000원 규모의 주주배정 후
실권주 일반공모 방식 유상증자를 실시할 것을 제안하고, 발행예정 주식수와
발행가액 산정방법 및 납입기일에 관하여 상세히 설명하였다.
표결 결과 찬성 6명, 반대 0명, 기권 0명으로 원안대로 가결하다.


제2호 의안 : 본사 사옥 임대차 계약 체결의 건

의장은 본사 사옥의 임대차 계약 체결에 관하여 설명하였다. 계약기간은 5년이며
연간 임차료는 금 1,200,000,000원으로 한다.
표결 결과 만장일치로 가결하다.


보고사항 제1호 : 제25기 재무제표 외부감사 진행상황 보고

감사위원회 위원장은 외부감사인의 기말감사 진행상황과 주요 감사사항을
보고하였으며, 이사회는 이를 청취하였다.


폐    회 : 오전 11시 30분

위 결의를 명확히 하기 위하여 이 의사록을 작성하고 출석한 이사 및 감사위원이
기명날인하다.

                                            2026년 3월 15일
"""
        ],
        "golden": {
            "meeting": {"date": "2026-03-15", "startTime": "10:00", "endTime": "11:30",
                        "place": "본사 3층 대회의실"},
            "attendance": {"directors": {"total": 7, "present": 6},
                           "auditCommittee": {"total": 3, "present": 3}},
            "agenda": [
                {"number": 1, "kind": "결의", "title": "운영자금 조달을 위한 유상증자의 건", "resolution": "원안가결"},
                {"number": 2, "kind": "결의", "title": "본사 사옥 임대차 계약 체결의 건", "resolution": "원안가결"},
                {"number": 1, "kind": "보고", "title": "제25기 재무제표 외부감사 진행상황 보고", "resolution": "해당없음"},
            ],
        },
    },
    {
        "name": "sample-02-표라벨형",
        "pages": [
            """주식회사 OO전자 이사회 의사록


개    회 : 2026년 5월 20일 오후 2시 00분
장    소 : 서울특별시 강남구 테헤란로 000, 20층 회의실

이사 총수 : 7명            출석 이사 수 : 5명
감사위원 총수 : 3명        출석 감사위원 수 : 2명


의안 제1호 : 계열회사에 대한 금전 대여의 건

의장은 계열회사인 주식회사 OO소재에 대하여 운영자금 명목으로
금 3,000,000,000원을 대여하는 안건을 상정하고 대여조건을 설명하였다.
이에 대하여 대여조건이 시장금리에 비하여 불리하다는 의견이 제시되었다.
심의 결과 찬성 2명, 반대 3명으로 부결하다.


의안 제2호 : 신규 사업 진출을 위한 타법인 주식 양수의 건

의장은 신규 사업 진출을 위한 타법인 주식 양수 계획을 설명하였다.
실사 결과에 대한 검토가 더 필요하다는 의견에 따라 차기 이사회로 연기하기로 하다.


의안 제3호 : 제3회 무기명식 이권부 무보증 사채 발행의 건

의장은 금 20,000,000,000원 규모의 사채 발행 계획을 설명하였다.
표결 결과 이의 없이 원안대로 가결하다.


폐    회 : 오후 3시 10분
"""
        ],
        "golden": {
            "meeting": {"date": "2026-05-20", "startTime": "14:00", "endTime": "15:10",
                        "place": "서울특별시 강남구 테헤란로 000, 20층 회의실"},
            "attendance": {"directors": {"total": 7, "present": 5},
                           "auditCommittee": {"total": 3, "present": 2}},
            "agenda": [
                {"number": 1, "kind": "결의", "title": "계열회사에 대한 금전 대여의 건", "resolution": "부결"},
                {"number": 2, "kind": "결의", "title": "신규 사업 진출을 위한 타법인 주식 양수의 건", "resolution": "보류"},
                {"number": 3, "kind": "결의", "title": "제3회 무기명식 이권부 무보증 사채 발행의 건", "resolution": "원안가결"},
            ],
        },
    },
    {
        "name": "sample-03-스캔혼재형",
        "pages": [
            """이 사 회 의 사 록


일    시 : 2026년 7월 8일 오전 9시 30분
장    소 : OO시 OO구 공장 2층 회의실
출석현황 : 재적이사 5명 중 5명 전원 출석
          재적 감사위원 2명 중 2명 출석


제1호 의안 : 공장 증설을 위한 유형자산 취득의 건

의장은 생산능력 확충을 위한 제2공장 증설 계획을 설명하고, 총 투자금액
금 8,000,000,000원의 집행 승인을 요청하였다.
표결 결과 만장일치로 가결하다.
""",
            ("SCAN", """제2호 의안 : 금융기관 차입 한도 약정 체결의 건

의장은 운전자금 조달을 위한 금융기관 차입 한도 약정의 체결을 제안하였다.
한도 금액은 금 5,000,000,000원이다.
표결 결과 원안대로 가결하다.


폐    회 : 오전 10시 40분
"""),
        ],
        "golden": {
            "meeting": {"date": "2026-07-08", "startTime": "09:30", "endTime": "10:40",
                        "place": "OO시 OO구 공장 2층 회의실"},
            "attendance": {"directors": {"total": 5, "present": 5},
                           "auditCommittee": {"total": 2, "present": 2}},
            "agenda": [
                {"number": 1, "kind": "결의", "title": "공장 증설을 위한 유형자산 취득의 건", "resolution": "원안가결"},
                {"number": 2, "kind": "결의", "title": "금융기관 차입 한도 약정 체결의 건", "resolution": "원안가결"},
            ],
        },
    },
    {
        "name": "sample-04-번호누락형",
        "pages": [
            """이 사 회 의 사 록


일 시 : 2026. 9. 2. 10:00
장 소 : 본사 대회의실
출석 : 재적이사 9명 중 7명 출석, 재적 감사위원 3명 중 2명 출석


제1호 의안 : 임원 주식매수선택권 부여의 건

의장은 핵심 임원에 대한 주식매수선택권 부여안을 설명하였다.
표결 결과 찬성 7명, 반대 0명으로 원안대로 가결하다.


제3호 의안 : 특수관계자와의 부동산 임대차 거래 승인의 건

의장은 특수관계자인 주식회사 OO개발과의 부동산 임대차 거래 승인을 요청하였다.
연간 거래금액은 금 450,000,000원이다.
표결 결과 찬성 6명, 반대 1명으로 가결하다.


폐 회 : 11:05
"""
        ],
        "golden": {
            "meeting": {"date": "2026-09-02", "startTime": "10:00", "endTime": "11:05",
                        "place": "본사 대회의실"},
            "attendance": {"directors": {"total": 9, "present": 7},
                           "auditCommittee": {"total": 3, "present": 2}},
            "agenda": [
                {"number": 1, "kind": "결의", "title": "임원 주식매수선택권 부여의 건", "resolution": "원안가결"},
                {"number": 3, "kind": "결의", "title": "특수관계자와의 부동산 임대차 거래 승인의 건", "resolution": "원안가결"},
            ],
        },
    },
]


def _draw(page: pymupdf.Page, body: str) -> None:
    rect = pymupdf.Rect(MARGIN, MARGIN, page.rect.width - MARGIN, page.rect.height - MARGIN)
    left = page.insert_textbox(rect, body, fontname=FONT, fontsize=SIZE, lineheight=1.6)
    if left < 0:
        raise SystemExit(f"본문이 한 쪽에 안 들어간다 ({left:.0f}pt 초과). 표본을 줄이거나 쪽을 나눠라.")


def build(spec: dict, out_dir: Path) -> Path:
    doc = pymupdf.open()
    for page_spec in spec["pages"]:
        scanned = isinstance(page_spec, tuple)
        body = page_spec[1] if scanned else page_spec
        if scanned:
            # 텍스트 레이어가 없는 쪽을 만든다 — 글자를 그려서 그림으로 구운 뒤 얹는다.
            tmp = pymupdf.open()
            _draw(tmp.new_page(), body)
            pix = tmp[0].get_pixmap(dpi=150)
            page = doc.new_page()
            page.insert_image(page.rect, pixmap=pix)
            tmp.close()
        else:
            _draw(doc.new_page(), body)

    pdf_path = out_dir / f"{spec['name']}.pdf"
    doc.save(pdf_path)
    doc.close()

    golden = dict(spec["golden"])
    golden["_note"] = "합성 표본의 정답. 회사·금액·사람은 지어낸 것이다."
    (out_dir / f"{spec['name']}.golden.json").write_text(
        json.dumps(golden, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return pdf_path


def main() -> int:
    ap = argparse.ArgumentParser(description="합성 이사회 의사록 표본 만들기")
    ap.add_argument("-o", "--out", type=Path, default=Path("samples/minutes"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    for spec in SAMPLES:
        path = build(spec, args.out)
        print(f"  {path}")
    print(f"\n{len(SAMPLES)}건 → {args.out}/ (PDF + 정답 JSON)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# 이자율 작업대 — 계획과 금투협 자료 출처

## 무엇을 만드는가

금융투자협회 채권정보센터의 **채권시가평가수익률** 표(종류·신용등급 × 잔존만기)를 기준일별로
그대로 보여주고, 고른 행·열에 음영을 칠해 조서에 붙여넣는다. 환율 작업대처럼 단계별 버튼으로 좁혀 간다.

1. **용도**: 리스 / 충당부채 / 퇴직급여 (고르면 기준서 문단 안내 + 권장 행 미리 음영)
2. **기준일**
3. **종류·등급 (행)**: 여러 개
4. **만기 (열)**: 여러 개. 표에 없는 만기는 **선형보간** 옵션

### 용도별 근거 문단

| 용도 | 문단 | 요지 | 권장 행 |
| --- | --- | --- | --- |
| 리스 | 1116 26, 41, 45 | 내재이자율, 쉽게 산정할 수 없으면 증분차입이자율. 재평가·리스변경 때는 그 시점의 수정 할인율 | 회사 신용등급의 회사채 |
| 충당부채 | 1037 45~47, 60 | 세전 이율. 화폐의 시간가치와 부채 특유의 위험을 반영하되, 현금흐름에 반영한 위험은 빼고 할인 | 국고채 |
| 퇴직급여 | 1019 83~86 | 보고기간 말 우량회사채 시장수익률. 깊은 시장이 없으면 국공채. 지급 시기를 반영 | 우량회사채 (AA 이상) |

### 나중에 넣을 용도 (잊지 말 것)

- **변동금리 차입금 검토**
- **보증금 현재가치할인차금 계산**

## 자료 출처 — kofiabond ProFrame 서비스

이 컨테이너와 브라우저에서는 kofiabond.or.kr 에 닿지 않는다 (CORS · 네트워크 정책).
**GitHub Actions 러너에서는 닿는다** — 환율과 같이 Actions 에서 받아 JSON 으로 커밋한다.

메뉴 *시가평가 › 채권시가평가수익률 › 일자별* (`/xml/startest/BISBndSrtPrcDay.xml`) 이 쓰는 요청:

```
POST https://www.kofiabond.or.kr/proframeWeb/XMLSERVICES/
Content-Type: application/xml; charset=UTF-8

<message>
  <proframeHeader>
    <pfmAppName>BIS-KOFIABOND</pfmAppName>
    <pfmSvcName>BISBndSrtPrcSrchSO</pfmSvcName>
    <pfmFnName>selectDay</pfmFnName>          <!-- 열 머리글은 getHeadList -->
  </proframeHeader>
  <systemHeader></systemHeader>
  <BISBndSrtPrcDayDTO>
    <standardDt>20260930</standardDt>
    <reportCompCd>A20000</reportCompCd>       <!-- 아래 표 -->
    <applyGbCd>C00</applyGbCd>
    <val1>A10002</val1> … <val5>A10006</val5> <!-- 평균에 넣을 평가사 (A20000 일 때) -->
  </BISBndSrtPrcDayDTO>
</message>
```

- `reportCompCd`: `""` 통합표(평가사별 전부) · `A20000` 평가사 평균(2023-01-09~) · `A10000` 평가사 평균(~2023-01-08)
  · 개별 `A10002` 나이스피앤아이 `A10003` 한국자산평가 `A10004` KIS자산평가 `A10005` 에프앤자산평가 `A10006` 이지자산평가(2023-01-09~)
- 응답 행 `BISBndSrtPrcDayDTO`: `largeCategoryMrk`(종류) · `typeNmMrk`(종류명) · `creditRnkMrk`(신용등급) ·
  `koreanShotNm`(고시기관) · `sigaBrnCd`(행 코드) · `val1…val16`(만기별 수익률, %)
- 열(`getHeadList` 의 `remainTrmCtgy`): 3월 6월 9월 1년 1년6월 2년 2년6월 3년 4년 5년 7년 10년 15년 20년 30년 50년
- 2026-09-30 평가사 평균: 43행 (국고채, 국민주택, 지방채, 특수채 등급별, 통안, 은행채, 금융기관채, 회사채 공모·사모 AAA~BBB-)
- 응답이 중간에 끊기는 일(IncompleteRead)이 잦다. 재시도가 필요하다.

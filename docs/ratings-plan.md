# 신용등급 찾기 — 금투협 자료 정찰 결과

이자율 작업대(리스 증분차입이자율)에서 회사 신용등급에 맞는 회사채 행을 고를 때 쓴다.
회사명을 넣으면 공시된 회사채 신용등급(평가사별 등급 · 평정일 · Outlook)을 보여 준다.

## 범위 — 못 찾으면 거기서 멈춘다

- 금투협 채권정보센터에 **공시된 채권(회사채 · CP 등) 신용등급만** 보여 준다.
- 비상장사 · 미발행사처럼 공시된 등급이 없는 회사는 **"공시된 신용등급 없음"으로 끝낸다.**
  재무비율로 등급을 추정하거나 비슷한 회사 등급을 끌어오지 않는다 (2026-10-06 결정).
- 발행한 회사채가 없고 기업신용등급(ICR)만 받은 회사도 여기서는 나오지 않는다.
  예: 삼성전자 — 최근 3년 속보에 회사채 등급이 없다. 비교공시에는 2004년 등급만 남아 있다.

## 정찰 결과 (2026-10-06, `.github/workflows/kofia-ratings-probe.yml`)

메뉴 *신용평가정보* (`MBIS0105…`). 요청 양식은 이자율과 같은 ProFrame XML 이다 (docs/rates-plan.md).

| 화면 | 서비스 | 쓰임 |
| --- | --- | --- |
| 신용등급 속보 `/xml/cdttest/BISCdtRnkHot.xml` | `BISCdtRnkHotSrchSO.select` | **기간 안에 매겨진 등급 전부** — 수집에 쓴다 |
| 신용등급 비교공시 › 발행회사별 `/xml/cdttest/BISRnkAnnComp.xml` | `BISCdtRnkCmpSrchSO.selectData` (`val10=1`) | 회사 한 곳의 종목별 · 평가사별 등급 |
| 비교공시 › 발행기간별 / 평정기간별 | 같은 서비스, `val10=2` / `val10=3` | 기간 안에 발행된 / 평정된 종목 |
| 회사 찾기 팝업 `/xml/Com/pop/BISRnkAnnIssCompPop.xml` | `BISIssCompPopSrchSO.listRnkAnnComp` | 회사명 → 법인등록번호 |

### 속보 — `BISCdtRnkHotSrchSO.select`

```xml
<BISCdtRnkHotDTO>
  <schField>1</schField>          <!-- 탭: 1 채권 · 2 기업어음 · 4 전자단기사채 · 3+val1 ABS 류 · 5 커버드본드 -->
  <creditEstCd></creditEstCd>     <!-- 평가사: 빈칸 종합 · A10001 한기평 · A15001 한신평 · A15002 NICE · A15003 서신평 -->
  <companyNm></companyNm>         <!-- 회사명 일부 (부분 일치) -->
  <schData>1</schData>            <!-- 1 모두 · 2 변동사항만 -->
  <standardDt1>20260901</standardDt1><standardDt2>20260930</standardDt2>
</BISCdtRnkHotDTO>
```

- 응답 행 `BISCdtRnkHotDTO`: `companyNm` · `issueTimeDiff`(회차) · `koreanShotNm`(평가사) · `creditEstRnkNm`(등급)
  · `estimateDay`(평정일) · `outlook` · `creditWatch` · `fileNm`(평가 보고서 PDF 경로) · `val1`(평가사 코드) · `bondGb`
- 법인등록번호는 없다 — 회사는 이름으로만 묶인다.
- 2026-09 채권 탭: 971행, 회사 126곳. 등급 빈칸이 232행 있다 (원인 미확인).
- 한 달 응답이 0.5MB 쯤이고 가끔 중간에 끊긴다(IncompleteRead) — 재시도하면 받힌다. 3년을 한 번에 물으면 수 MB 라 달 단위로 나눠 받는다.

### 비교공시 — `BISCdtRnkCmpSrchSO.selectData`

- 회사 한 곳: `<schData>법인등록번호</schData><inquiryStd>1</inquiryStd><schField>1</schField><val10>1</val10>`
- 응답 행은 종목(`itemNm`, KR코드 `val2`) × 평가사(한기평 · 한신평 · NICE · 서신평) — 등급이 없는 평가사 칸은 `-`.
- 평정기간별(`val10=3`)은 한 달이면 1MB 넘게 와서 끊긴다. 한 주(108행)는 받힌다.

### 회사 찾기 — `BISIssCompPopSrchSO.listRnkAnnComp`

`<issueManNm>에스케이</issueManNm><processGb>1</processGb>` → `corporateRegNo` · `issueManNm` 64곳.
'삼성전자' 는 '(주)삼성전자무비스비투비' 한 곳만 나온다 — 비교공시에 남은 회사만 목록에 있다.

## 만든 것

- 수집: `scripts/fetch_kofia_ratings.py` · `.github/workflows/kofia-ratings.yml` (매 영업일 최근 40일)
  - `src/data/ratings/events-YYYY.json` 평정 한 건이 한 줄 · `latest.json` 회사 · 평가사별 최근 평정
  - 대표 등급은 지급보증 · 신용공여 종목을 빼고 고른다. 같은 날 다른 종목의 다른 등급은 `others` 에 남긴다.
  - 한계: 한국기업평가는 회차 칸에 보증 여부를 적지 않는 일이 있다 (예: 한국투자캐피탈 145 — 보증 AA- / 자체 A).
    그날 종목 수가 많은 등급을 대표로 고르므로 보증 등급이 대표가 될 수 있다. 화면은 다른 등급을 경고로 함께 보여 준다.
- 화면: 이자율 작업대 › 종류·등급(행) 단계의 *회사 신용등급 찾기* (`src/components/RatingLookup.tsx`)
  - 등급마다 종류 배지 — **채권등급**(`kind: 'bond'`) / **기업신용등급**(`kind: 'icr'`, 아직 자료 없음)
  - 등급의 회사채 공모 무보증 행 고르기, 조서 각주에 등급 · 종류 · 평가사 · 평정일
  - 없으면 "공시된 신용등급 없음" 에서 멈춘다.

## 기업신용등급(ICR) 보완 — 출처 조사 (2026-10-06)

금투협은 채권 · CP · ABS 등급만 공시한다. ICR 은 신평사 3사 사이트에 있다.

| 신평사 | robots.txt | ICR 이 보이는 화면 |
| --- | --- | --- |
| 한국신용평가 kisrating.com | `User-agent: *` `Disallow: /` (검색엔진만 허용) | 등급검색 `/ratingsSearch/corp_search.do` |
| 한국기업평가 korearatings.com | 없음 (404) | 유효등급 List `MENU_ID=400`, 기업신용평가 `MENU_ID=870` |
| NICE신용평가 nicerating.com | 없음 | 유효등급 리스트 `/disclosure/validRatingSearch.do`, `/datacenter/validRating.do` |

- 한신평은 자동 수집을 막고 있다 — 받지 않는다.
- robots.txt 가 없다고 수집이 허락된 것은 아니다. 한기평 · NICE 는 이용약관을 먼저 확인한다.
- 다른 길: 사용자가 신평사 보고서를 보고 ICR 을 직접 적는 칸 (등급 · 평가사 · 평정일 · 근거),
  OpenDART 사업보고서의 신용등급 내역 (API 키 필요, 서술형이라 뽑기 어렵다).

## 처음 세운 수집 계획

1. 속보를 최근 3년 · 달 단위로 받아 `src/data/ratings/` 에 저장 (이자율 · 환율과 같이 Actions 에서 받아 커밋).
2. 회사 · 평가사마다 가장 최근 평정만 남긴 색인을 만든다. 정기 실행은 최근 한 달만 다시 받는다.
3. 화면: 회사명 검색 → 평가사별 최근 등급 · 평정일 · Outlook · 보고서 링크. 고른 등급의 회사채 행을 이자율 표에서 칠한다.
   없으면 "공시된 신용등급 없음" 에서 멈춘다.

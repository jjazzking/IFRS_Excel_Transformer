# 회계기준서 조서 추출기 (Workpaper Assistant)

사내 회계기준서 DB를 검색 및 선택하여 엑셀 조서 양식에 맞게 스마트 문장 분할 및 클립보드 서식 복사를 지원하는 웹 애플리케이션입니다.

---

## 🚀 GitHub Pages 배포 방법

본 프로젝트는 GitHub Actions 자동 배포 워크플로우(`.github/workflows/deploy.yml`)가 구성되어 있어, 리포지토리에 푸시하기만 하면 자동으로 GitHub Pages에 배포됩니다.

### 1단계: GitHub 리포지토리 생성 및 코드 푸시

로컬 터미널에서 다음 명령어를 실행합니다:

```bash
# 1. git 초기화 (아직 안 되어 있다면)
git init
git add .
git commit -m "feat: 회계기준서 조서 추출기 초기 구현"

# 2. main 브랜치 지정 및 원격 리포지토리 연결
git branch -M main
git remote add origin https://github.com/<본인_아이디>/<리포지토리명>.git

# 3. 코드 푸시
git push -u origin main
```

### 2단계: GitHub Pages 소스 설정 (GitHub 웹사이트)

1. GitHub의 본인 프로젝트 저장소 페이지로 이동합니다.
2. 상단 메뉴에서 **Settings** 탭을 클릭합니다.
3. 좌측 사이드바에서 **Pages**를 클릭합니다.
4. **Build and deployment** 섹션의 **Source** 드롭다운에서 **`GitHub Actions`**를 선택합니다.
5. 상단 **Actions** 탭으로 이동하면 자동으로 빌드 및 배포가 진행되는 것을 확인할 수 있습니다. (약 1~2분 소요)
6. 배포가 완료되면 발급된 `https://<본인_아이디>.github.io/<리포지토리명>/` 주소로 접속하여 사용하시면 됩니다!

---

## 💻 로컬 개발 환경 실행 방법

```bash
# 의존성 패키지 설치
npm install

# 로컬 개발 서버 실행
npm run dev

# 프로덕션 빌드 테스트
npm run build
```

---

## 📋 주요 기능

- **문장 보존형 스마트 텍스트 분할**: 지정한 글자 수(기본 45자) 단위로 문맥과 단어가 자연스럽게 연결되도록 다음 행에 배분
- **상대 위치(A1, B1 등) 매핑**: 엑셀 조서의 특정 셀(예: C26)을 기준으로 순수 내용만 추출
- **엑셀 서식 클립보드 복사**: HTML Table 및 TSV를 동시에 클립보드에 담아 엑셀에 붙여넣을 때 음영/테두리 서식 유지
- **엑셀 단축키 및 VBA 매크로 지원**: `Ctrl + +` (복사한 셀 삽입) 및 원클릭 매크로 코드 제공
- **사내 DB 가져오기**: JSON 형태의 사내 기준서 DB 즉시 임포트 기능 제공

---

## 🗂️ HWP 기준서 원문 → 기준서 DB 변환

한국회계기준원에서 배포하는 기준서 HWP(한글 5.0) 파일을 애플리케이션의 기준서 DB
스키마(`src/types.ts` 의 `AccountingStandard[]`)에 맞는 JSON으로 변환하는 스크립트입니다.

```bash
pip install -r scripts/requirements.txt

# 기본: 기준서 본문(문단 1~140 및 '한' 문단)만 추출
python3 scripts/parse_kifrs_hwp.py 기업회계기준서_제1001호.hwp -o src/data/standards/k-ifrs-1001.json

# 실무적용지침(IG)도 별도 기준서 항목으로 함께 추출
python3 scripts/parse_kifrs_hwp.py 기업회계기준서_제1001호.hwp --include-ig -o out.json

# 추출된 원문 텍스트를 확인하고 싶을 때
python3 scripts/parse_kifrs_hwp.py 기업회계기준서_제1001호.hwp --dump-text raw.txt
```

### 파싱 방식

| 단계 | 처리 내용 |
| --- | --- |
| 1. 텍스트 추출 | OLE 복합문서에서 `BodyText/Section*` 스트림을 zlib 해제 후 `HWPTAG_PARA_TEXT` 레코드만 디코딩 |
| 2. 목차 분석 | 목차의 제목 목록과 문단번호 범위를 짝지어, 범위 포함관계로 제목의 계층(level)을 계산 |
| 3. 본문 파싱 | `문단번호 + 탭/공백 + 본문` 패턴으로 문단을 분리하고, ⑴ ㈎ 등 하위 항목은 `\n` 으로 이어붙임 |
| 4. 메타데이터 | 계층 경로에서 `sectionTitle`(상위 제목) / `subTitle`(최하위 제목)을 부여하고, 회계 용어 사전 기반으로 `keywords` 생성 |

### 산출물

`src/data/standards/` 아래 JSON 39개 파일에 **기준서 43건 / 문단 3,395건**이 들어 있습니다
(제1001·1101·1102·1107·1108호는 실무적용지침을 별도 항목으로 포함).

#### 기준서 추가 방법

`src/data/standards/` 폴더에 **JSON 파일만 넣으면 됩니다.** 코드 수정은 필요 없습니다.
`standardsData.ts` 가 `import.meta.glob` 으로 해당 폴더의 `*.json` 을 전부 자동으로 읽어들입니다.

- 파일명 규칙: `k-ifrs-XXXX.json` (파일명 오름차순으로 목록에 표시됨)
- 파일 형식: 기준서 **배열** `[{ "id": ..., "paragraphs": [...] }]`
- `id` 는 다른 기준서와 겹치지 않아야 합니다

검증까지 함께 하려면 배치용 스크립트를 쓰면 됩니다. 문제가 하나라도 있으면
아무 파일도 복사하지 않고 무엇이 잘못됐는지 알려줍니다.

```bash
# 디렉터리째 검증 + 배치
python3 scripts/ingest_standards.py ~/parsed_json/

# 검증만
python3 scripts/ingest_standards.py ~/parsed_json/ --check-only
```

검사 항목: 배열 형식 / 기준서·문단 필수 필드 / `category` 유효값 /
기준서·문단 id 중복 / 빈 `content` / 문단의 `standardId`·`standardCode`·`standardTitle` 일치.

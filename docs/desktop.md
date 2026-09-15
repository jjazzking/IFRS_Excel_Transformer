# 실행파일로 내보내기 — 설치 없이 켜지는 창 하나

## 왜 굳이 exe 인가

이 앱은 이미 브라우저만 있으면 돈다. 그런데 감사 현장에서 걸리는 것이 셋이다.

1. **주소를 매번 찾아 들어가야 한다.** 조서 만드는 중에 탭을 뒤지는 일이 는다.
2. **"이거 웹사이트에 의사록을 올리는 거 아니냐"** 는 질문을 매번 받는다. 실제로는
   아무것도 올라가지 않는데(`docs/minutes-plan.md` 0장 벽 2), 주소창이 있는 한
   그 말을 믿어 달라고 부탁해야 한다.
3. **설치 권한이 없는 노트북**이 많다.

창 하나로 내보내면 셋 다 없어진다. 3번 때문에 installer 가 아니라 **portable** 로 낸다 —
받아서 더블클릭하면 그게 끝이고, 레지스트리도 시작 메뉴도 건드리지 않는다.

## 화면 코드는 한 줄도 따로 두지 않는다

`electron/main.cjs` 는 껍데기다. **브라우저 판이 내는 `dist/` 를 그대로 띄운다.**
작업대 코드가 갈라지면 어느 쪽이 맞는지 알 수 없게 되므로, 갈라질 자리를 만들지 않는다.

```
bun run build       →  dist/          (브라우저 판 · GitHub Pages 가 쓰는 것)
bun run desk:build  →  dist/ + 껍데기 → release/기준서데스크-0.0.0-portable.exe
```

## `file://` 로 띄우면 OCR 이 죽는다

가장 먼저 부딪힌 곳이다. 껍데기가 `dist/index.html` 을 `file://` 로 여는 것이 가장
쉬운 길인데, **그러면 스캔 페이지를 만나는 순간 조용히 죽는다.**

OCR 엔진은 워커에서 WebAssembly 를 `fetch` 로 받아 온다. Chromium 은 `file://` 에
대한 `fetch` 를 막는다. 화면은 멀쩡히 떠 있고 다른 작업대도 다 도는데 의사록만 안 된다 —
가장 나쁜 종류의 고장이다.

그래서 **로컬 전용 스킴**을 하나 만들어 거기서 낸다.

```
desk://app/index.html   →  asar 안의 dist/index.html
```

표준 스킴으로 등록하면 origin 이 생기고, origin 이 생기면 워커·wasm·fetch 가 모두
정상으로 돈다. **포트를 열지 않으므로 서버가 아니다.**

포장본에서 실제로 확인한 값이다.

| | |
| --- | ---: |
| OCR 모델 (`kor.traineddata.gz`) | 1,572,336 B |
| OCR 엔진 (`tesseract-core-simd-lstm.wasm.js`) | 3,899,472 B |
| OCR 워커 | 111,307 B |
| pdf.js 한국어 대응표 (`Adobe-Korea1-UCS2.bcmap`) | 23,293 B |
| `new Worker(...)` | ok |

## 바깥으로 나가는 길

`session.webRequest` 에서 **`http`·`https`·`ws`·`wss`·`ftp` 를 막는다.** 실수로 CDN 을
하나 끼워 넣어도 여기서 걸리고, 화면이 조용히 이상해지는 대신 로그에 찍힌다.

**`file:` 까지 막으면 안 된다.** 우리 스킴 핸들러가 `net.fetch(file://…)` 로 asar 안을
읽기 때문에, 그것까지 막으면 앱이 아예 안 뜬다. 실제로 그렇게 만들었다가 포장본을
켜 보고 잡았다 — 포장 전에는 안 나오는 고장이다.

> **남아 있는 것 하나.** 위 차단기로 재 보면 화면이 바깥을 부른 적은 **0건**이다.
> 다만 Chromium 자체가 시작할 때 `redirector.gvt1.com` 으로 한 번 조회를 시도하는 것이
> 관측됐다. `--disable-background-networking` 등을 걸어도 이 환경에서는 남았다.
> 문서 내용은 실리지 않지만, **"아무 말도 걸지 않는다"고 말하려면 이것까지 없애야 한다.**
> 사내망에서 정책으로 막아도 앱 동작에는 지장이 없다.

## Windows exe 는 Windows 에서 굽는다

`.github/workflows/desk-exe.yml` 이 `windows-latest` 에서 굽고 결과물을 artifact 로 올린다.
리눅스에서 wine 으로 굽는 길도 있지만 그렇게 나온 파일은 **직접 켜 볼 수가 없다.**
켜 보지 않은 실행파일을 사람에게 주는 것은 하지 않는다.

```
Actions → 데스크톱 실행파일 → Run workflow
  → standards-desk-windows-portable 내려받기
```

태그를 밀어도(`v*`) 같은 것이 돈다.

## 크기

| | |
| --- | ---: |
| `dist/` (화면·모델·엔진 전부) | 26 MB |
| Electron 런타임 | 약 250 MB (압축 전) |
| **나오는 exe** | **압축돼서 이보다 훨씬 작다** |

`node_modules` 를 빼는 것이 중요하다. 렌더러가 Node 를 쓰지 않으므로 런타임 의존성이
없는데, electron-builder 는 `dependencies` 를 기본으로 싣는다. 안 빼면 asar 가
**166MB**, 빼면 **26MB** 다.

## 서명

인증서가 없어서 서명하지 않고 굽는다. 서명 없는 exe 는 Windows SmartScreen 이
"알 수 없는 게시자" 로 경고한다. 사내 배포라면 법인 인증서로 서명하는 편이 낫다 —
그 전까지는 받는 사람에게 이 경고를 미리 알려 두어야 한다.

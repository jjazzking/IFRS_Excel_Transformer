# 작업 메모

## 이사회 의사록 읽기 (`minutes`) — 숨김, 동결

- 사용자에게 보이지 않게 숨겨 두었다 (`src/workspaces/registry.ts` 의 `hidden: true`).
  첫 화면 카드에서 빠지고, `#/minutes` 로 직접 들어와도 첫 화면으로 돌아간다.
- 코드(`src/workspaces/MinutesWorkspace.tsx`, `src/lib/minutes/`, `src/components/minutes/`,
  `scripts/*minutes*`)는 지우지 않고 그대로 둔다.
- **저장소 주인이 따로 말하기 전까지 다시 켜거나, 이 기능을 고치거나 발전시키지 않는다.**

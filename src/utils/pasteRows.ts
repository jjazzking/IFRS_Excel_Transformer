/**
 * 엑셀에서 복사한 범위(탭·줄바꿈 구분)를 행 × 칸으로 읽는다. 행 순서는 그대로 지킨다.
 * - 칸 안에 줄바꿈이 있으면 엑셀은 그 칸을 "…" 로 감싸 보낸다 — 한 칸으로 읽는다.
 * - 끝에 붙는 빈 행은 버리고, 중간 빈 행은 남긴다 (다시 붙여넣을 때 줄이 어긋나지 않게).
 * - 칸 안의 줄바꿈·연속 공백은 공백 하나로 접는다.
 */
export function parsePastedRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') cell += text[++i];
      else quoted = false;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === '\t') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  while (rows.length && rows[rows.length - 1].every(v => !v.trim())) rows.pop();
  return rows.map(r => r.map(v => v.replace(/\s+/g, ' ').trim()));
}

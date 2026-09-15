#!/usr/bin/env python3
"""나눠 줄 꾸러미를 만든다 — `dist/` + 실행기 + 안내문 한 벌.

    bun run build && python3 desktop/pack.py

**이 꾸러미는 갈래를 안 탄다.** 파이썬 표준 라이브러리만 쓰므로 윈도우에서 굽지
않아도 되고, 굽는 기계가 무엇이든 같은 파일이 나온다. 실행파일(.exe)과 다른 점이다.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = ROOT / "release"
SHIPPED = ("실행.py", "실행.bat", "읽어보세요.txt")


def main() -> int:
    if not (DIST / "index.html").is_file():
        print("dist 가 없다. 먼저 `bun run build` 를 돌린다.", file=sys.stderr)
        return 1

    OUT.mkdir(exist_ok=True)
    target = OUT / "기준서데스크-파이썬.zip"
    files = 0
    # 압축은 deflate 로 한다. 화면 파일은 잘 줄고, 이미 압축된 모델은 그대로 지나간다.
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in SHIPPED:
            z.write(ROOT / "desktop" / name, name)
            files += 1
        for path in sorted(DIST.rglob("*")):
            if path.is_file():
                z.write(path, f"dist/{path.relative_to(DIST).as_posix()}")
                files += 1

    size = target.stat().st_size
    print(f"{target}")
    print(f"  파일 {files}개 · {size / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

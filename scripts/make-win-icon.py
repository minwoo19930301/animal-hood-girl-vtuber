#!/usr/bin/env python3
"""기본 아바타(곰)의 얼굴 렌더에서 Windows용 build/icon.ico를 만든다.

  PORT=5321 CDP_PORT=9521 SIZE=640x640 npm run shot -- harness.html shots/win-icon-src.png "avatar=bear&cam=face&bg=1"
  python3 scripts/make-win-icon.py                       # shots/win-icon-src.png → build/icon.ico
  python3 scripts/make-win-icon.py path/to/render.png    # 다른 렌더를 쓸 때

하네스 렌더(bg=1 = 라군 하늘색 배경)에서 후드 쓴 머리 부분을 정사각형으로 잘라 둥근 사각형 마스크를 씌우고
16~256px를 한 .ico에 담는다. 결과(.ico)를 커밋해 두므로 `npm run pack:win`은 Pillow 없이도 돈다 —
아이콘을 바꿀 때만 이 스크립트를 쓴다.

CROP은 640x640 SIZE로 찍은 곰 렌더 기준 좌표다 (실제 이미지는 브라우저 창 크기 때문에 640x553이 된다).
다른 아바타나 크기로 찍으면 CROP을 맞춰야 한다.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "shots" / "win-icon-src.png"
DST = ROOT / "build" / "icon.ico"
SIZES = [16, 24, 32, 48, 64, 128, 256]
CROP = (195, 5, 445, 255)  # 후드 + 얼굴 + 리본까지 (250x250)
RADIUS = 0.22  # 모서리 반지름 (한 변 대비)
SS = 4  # 마스크 슈퍼샘플링 배율 (모서리를 부드럽게)

if not SRC.exists():
    raise SystemExit(f"{SRC} 없음 — 위 npm run shot 명령으로 먼저 렌더하세요")

im = Image.open(SRC).convert("RGBA").crop(CROP)
big = 256
im = im.resize((big, big), Image.LANCZOS)

mask = Image.new("L", (big * SS, big * SS), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, big * SS - 1, big * SS - 1), radius=round(big * SS * RADIUS), fill=255)
mask = mask.resize((big, big), Image.LANCZOS)
im.putalpha(mask)

DST.parent.mkdir(exist_ok=True)
im.save(DST, format="ICO", sizes=[(s, s) for s in SIZES])
print(f"{DST.relative_to(ROOT)} ({DST.stat().st_size} bytes, {SIZES})")

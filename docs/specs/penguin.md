# 펭귄 / Penguin — 슬롯 `7` (Pack v3 실제 계약)

`./models/penguin.vrm` + `src/model/animals/penguin.ts` 프로시저럴 후드. 코덱스 v2 스펙의
달성 불가 항목(케이프 날개 패널+보조 본, 부리형 챙, 스노보드 아노락, 보드 쇼츠+레깅스,
얼음 물고기 키체인, 하이컷 스노 러너)은 폐기 — v3는 고정 의상 메시 컬러 블로킹 +
hoodKit 후드 + 장식이 정본.

## 얼굴·헤어 (VRM 텍스처 수술 — 빌드 파이프라인 소유)

| 항목 | 실제 구현 |
|---|---|
| 헤어 | 미드나잇 네이비(#172335) 틴트, 귀선 크롭(컷 row 512 — DESIGN-PACK-V3 헤어 컷 레시피). |
| 홍채 | 아이스블루 3단 램프 (카탈로그 iris dark/mid/light) |
| 표정 | eyeSharpen 카탈로그값 → registry 클램프(0.06..0.20). blink+mouth 무결 검증됨 |

## 의상 (고정 메시 리페인트 — 빌드 파이프라인 소유)

네이비 몸판 집업 베스트 + 화이트 가슴 빕 패널(펭귄 배 실루엣) + 옐로 지퍼,
화이트 이너, 네이비 플리츠 스커트, 네이비 니삭스, 블랙 로퍼,
옐로 보타이(AccessoryNeck 노출).

## 후드 (src/model/animals/penguin.ts — 이 파일이 계약 소유)

- **셸/안감**: 블랙(다크네이비) `0x31394A/0x1E2532` / 화이트 `0xF6F8FA/0xD2D8DE`
  (hoodKit buildHoodBase, SHELL_AP/LINING_AP 공통 개구부 — 얼굴 침범 0).
- **화이트 프론트 밴드**: 개구부 림을 감싸는 흰 판(펭귄 배). 파라메트릭 스트립
  지오메트리 `frontBandGeo` — cutShellGeo와 동일한 개구부 콘 공식으로 안쪽 가장자리
  콘각을 구해 바깥으로 폭 0.27~0.36 rad(아래쪽이 더 넓음) 펼치고, 셸 타원체 반경
  ×1.006에 얹는다. 안쪽 콘 {ax 0.94, ayUp 0.485, ayDown 1.06} = LINING_AP보다 살짝
  넓게 → 흰 안감 림과 이어져 연속 화이트 서라운드. 정하방 ±0.62 rad 섹터는 비움
  (셸 바닥 컷 밖 부유 방지, 양끝 폭 테이퍼 마감). 안감과 동일 색 페어, doubleSide,
  무윤곽(열린 스트립 — inverted-hull 불성립, 흑백 대비로 충분).
- **오렌지 미니 부리**: `0xF4952E/0xC76F15` taperedTube (radii 0.17→0.045·crownH,
  scaleY 0.85), 폴리라인 (0, 0.02, 0.12) → (0, −0.035, −0.17) → (0, −0.21, −0.285)·L —
  끝이 앞(-Z)·아래로 강한 훅. 플라밍고 부리 소형판. muzzleAnchor 자식으로
  부착 + 메시 position (0, −0.07, −0.05)·crownH 오프셋 → 림 위 화이트 밴드에 걸침.
  앵커 rotation은 index.ts 스프링 소유(직접 세팅 금지) — 부리가 통째로 출렁인다.
  앵커가 셸 표면보다 ~0.09rz 안쪽이므로 전방 돌출 0.285L + 팁 y −0.21L 확보
  (0.17L은 셸에 파묻혀 단추, 0.24L·팁 −0.11L은 폼폼 볼, 팁 −0.16L도 밑동
  하단(−0.125L)과 차이가 3px대라 볼로 읽힌 사고 이력 — 재판정 라운드에서 −0.21L로
  하강, 정면 실루엣에서 팁이 밑동 하단보다 확실히 아래로 내려와 부리로 판독).
  hitMeshes 등록.
- **pitch 0.4에서도 부리는 림 위** — 눈썹~턱 가림 0 검증됨.

## 액세서리 (buildAccessories 오버라이드)

bandBase `0xF6F8FA` / bandStripe `0x26324A` / bandLine·cord `0xF5B940` / tip `0x20242E`
(셰이드 각 명도 −18~22%p + hue 미세 회전). 손목밴드 2 + 드로스트링 2가닥,
update에서 acc.sway (Follower 스프링, 결정적).

## 판정 샷 (shots/dev/penguin-*.png — 전부 통과 확인, 2026-07-25)

| 샷 | 쿼리 | 통과 기준 |
|---|---|---|
| face | `avatar=penguin&cam=face&bg=1` | 화이트 서라운드+부리 판독, 개구부 침범 0 |
| front | `avatar=penguin&bg=1` | 팔레트-의상 조화 (베스트 빕과 후드 밴드 호응) |
| pitch | `avatar=penguin&pitch=0.4&bg=1` | 부리·림이 눈썹 위 유지 |
| orbit | `avatar=penguin&orbit=1.2&bg=1` | 측면 밴드 곡선·부리 프로파일, 관통 없음 |
| blink | `avatar=penguin&blink=1&mouth=0.6&cam=face&bg=1` | 표정 무결 |
| back(보조) | `avatar=penguin&orbit=3.1&bg=1&cam=face` | 후면 셸 무결(밴드/부리 후면 누출 없음) |

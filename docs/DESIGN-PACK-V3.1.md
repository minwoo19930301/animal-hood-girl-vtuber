# Pack v3.1 — 눈매·얼굴형·헤어 자유화 (플라밍고 제외 12종)

2026-07-25. 사용자 디렉션: ①12종 눈매를 종별로 다르게 ②얼굴 성형(메시 워프) 도입
③헤어 색을 의상 팔레트 깔맞춤에서 해방 — 플라밍고(네이비 헤어 × 핑크 후드 × 화이트 탑)처럼
자유로운 조합. **플라밍고(avatar.vrm)는 무수정.** 별도 브랜치 avatar-pack-v3.1-faces, 별도 PR.

## 1. 눈매 프로필 (텍스처: eyeline 5 / lash 7 / brow 8 / iris 9 / highlight 10 + 런타임 표정 바이어스)

축: lift(눈꼬리 상승 px, 음수=처짐) / thick(윗라인 두께 배) / lower(아랫라인 존재감 0~1) /
irisScale(홍채 크기 배) / browShape(straight|arch|thick|thin) / runtimeBias(relaxed|angry|none 소량)

| slug | 인상 | lift | thick | lower | irisScale | brow | bias |
|---|---|---|---|---|---|---|---|
| bear | 순한 처진 눈 | -5 | 1.15 | 0.5 | 1.06 | thick-straight | relaxed 0.06 |
| monkey | 장난기 올라간 눈 | +7 | 1.0 | 0.3 | 1.0 | arch | none |
| turtle | 나른한 반개 직선 | 0 | 1.25(윗라인 낮게) | 0.2 | 0.95 | straight-thin | relaxed 0.10 |
| rabbit | 세로로 큰 동그란 눈 | +2 | 0.95 | 0.6(애교살) | 1.10 | thin-arch | none |
| fox | 날카로운 폭스아이 | +10 | 1.2 | 0.2 | 0.90 | sharp-arch | angry 0.12 |
| panda | 동글 순둥 | -3 | 1.05 | 0.55 | 1.10 | thick-short | relaxed 0.08 |
| penguin | 시원한 직선 윗꺼풀 | +3 | 1.15 | 0.25 | 0.97 | straight | none |
| owl | 크게 뜬 원형 | +1 | 1.3 | 0.4 | 1.12 | arch-high | none |
| lion | 대담한 굵은 라인 | +6 | 1.35 | 0.35 | 1.0 | thick-arch | angry 0.08 |
| tiger | 가장 좁은 캣아이 | +12 | 1.25 | 0.15 | 0.88 | sharp-low | angry 0.15 |
| elephant | 길고 낮은 순한 눈 | -7 | 1.0 | 0.45 | 1.02 | soft-straight | relaxed 0.08 |
| giraffe | 와이드 아몬드+긴 속눈썹 | +4 | 1.05 | 0.35 | 1.04 | thin-long | none |

- 속눈썹(7)은 lift/thick에 연동하되 giraffe는 가닥 길이 +30%, fox/tiger는 바깥 가닥 강조.
- 홍채(9)는 v3 3단 램프 색 유지, irisScale만 중심 기준 스케일 (동공 위치 불변).
- 하이라이트(10): rabbit/owl/panda는 대형 원형 유지·소폭 확대, fox/tiger는 축소 샤프.
- runtimeBias는 catalog eyeSharpen 대체가 아니라 소량 가산 — 클램프 0.06..0.20 유지.

## 2. 얼굴형 워프 (신규 scripts/lib/face-warp.mjs — GLB 버텍스 결정적 변형)

원리: Face/Body 메시에서 head 본 근방(목 위) 버텍스를 부드러운 falloff 필드로 이동.
모프타깃 델타는 보존(베이스 이동과 독립). 노멀 재계산. **눈 소켓·눈 메시 영역은 이동 금지**
(lookAt·홍채 정렬 파괴). 진폭 상한: 폭 ±4%, 볼 ±0.006m, 턱 z ±0.004m, 턱 길이 ±5%.

| 계열 | slug | 파라미터 |
|---|---|---|
| 라운드 (볼 통통, 턱 짧게) | bear, panda, rabbit | cheek +0.005, chinLen -4%, width +2.5% |
| 샤프 (턱선 좁게, 턱 살짝 길게) | fox, tiger, lion | jawWidth -3%, chinLen +3%, cheek -0.002 |
| 롱 소프트 (갸름·온화) | elephant, giraffe | faceLen +3%, width -2%, cheek 0 |
| 뉴트럴 (미세) | monkey, turtle, penguin, owl | width ±1% 이내 개성 소폭 |

검증 필수: blink/mouth 모프 무결, 측면 프로필 자연스러움, 후드 FaceBounds 자동 적응,
목-얼굴 경계 심 없음. 파일럿(bear 라운드 + fox 샤프) 통과 후 전개.

## 3. 헤어 컬러 자유화 (의상 팔레트와 독립 — 패션 컬러 12색, 팩 전체 중복 없음)

원칙: 의상 primary와 같은 hue 계열 금지(깔맞춤 해제), 후드 색과는 명도 대비 확보.
눈썹 틴트는 새 헤어색 동조. 헤어핀은 v3.1에서도 액센트 유지(자유 색과 조화 확인).

| slug | 현 v3 (깔맞춤) | v3.1 자유 컬러 | 의도 |
|---|---|---|---|
| bear | 체스트넛(카멜 매치) | 블루블랙 #23283E | 크림 의상과 대비, 차분 |
| monkey | 코퍼(오커 매치) | 쿨 애시브라운 #6E5F58 | 오커/버건디와 분리 |
| turtle | 블루블랙 | 로즈 브라운 #8A5A55 | 그린 의상 위 웜 포인트 |
| rabbit | 애시라벤더 | 페일 골드 블론드 #E8D3A4 | 핑크와 크림 파스텔 |
| fox | 번트코퍼(러스트 매치) | 플래티넘 실버 #D9DCE3 | 러스트 후드와 강대비 |
| panda | 잉크블랙(의상 매치) | 밀크티 베이지 #C7AD8E | 흑백 의상 위 웜 팝 |
| penguin | 미드나잇(네이비 매치) | 초콜릿 브라운 #4A342A | 네이비/옐로와 분리 |
| owl | 코코아(의상 매치) | 다크 그레이 애시 #55565E | 브라운 의상과 쿨 대비 |
| lion | 허니골드(골드 매치) | 다크 버건디 #58242C | 골드 의상 위 딥 포인트 |
| tiger | 앰버(오렌지 매치) | 순흑 #1B1A1E | 오렌지 후드와 아이코닉 대비 |
| elephant | 스모키블루(슬레이트 매치) | 허니 브라운 #9A6B3F | 쿨 슬레이트 위 웜 |
| giraffe | 캐러멜(새프런 매치) | 그레이지 #8D8378 | 웜 새프런과 뉴트럴 대비 |

셰이드는 각 색 명도 -22%p + hue 미세 회전(v3 관례). 틴트 곱셈 감쇠 보상은
HAIR_TINT_COMPENSATION 메커니즘 재사용 (스펙 값은 위 표, 보상값은 렌더 실측으로).
헤어 길이 컷 4종(bear/fox/turtle/penguin)은 유지.

## 게이트

v3 게이트 + 추가: ①12종 눈매가 face 콘택트시트에서 서로 구분됨 ②워프 후 blink/mouth/
프로필 무결 ③헤어-의상 hue 중복 0(깔맞춤 해제 확인) ④플라밍고 바이트 무변경.

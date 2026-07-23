# mingo-mate

macOS 화면 위에 떠 있는 카메라 추적 3D 동물 아바타 앱이다. 곰, 원숭이, 거북이의 얼굴과
의상이 각각 다르며 숫자키 `1`/`2`/`3` 또는 앱 메뉴로 즉시 전환할 수 있다.

카메라 영상은 로컬 MediaPipe 처리에만 쓰고 저장하거나 외부 서버로 보내지 않는다.
표정, 고개, 팔, 손과 손가락 움직임은 공통 VRM 리그로 전달된다.

## 실행

```bash
npm install
npm start
```

개발 모드는 `npm run dev`, 타입 검사는 `npm run typecheck`, 프로덕션 빌드는
`npm run build`로 실행한다.

## 캐릭터

- `1`: 곰 — 포레스트 그린 바시티 재킷
- `2`: 원숭이 — 머스터드 봄버 재킷
- `3`: 거북이 — 민트 후디와 등딱지 백팩

모델 구조와 검증 방법은 [Animal Avatar Pack](docs/ANIMAL-AVATAR-PACK.md), 새 외형을 추가하는
절차는 [Avatar Pipeline](docs/AVATAR-PIPELINE.md)에 정리되어 있다.


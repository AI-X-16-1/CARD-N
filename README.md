# CARD:N

**한 장의 명함에서 N개의 관계로**
AI 명함 스캔 · 대화 요약 · 관계도 시각화 · 카드 배틀 게임이 결합된 업무 인맥 관리 앱

## 소개

CARD:N은 명함을 스캔해 인물을 등록하고, 만남 이후의 대화를 녹음/요약하여 기록하고, 이렇게 쌓인 인맥을 관계도로 시각화하며, 등록된 인물들을 카드 배틀 게임의 카드로 활용하는 업무 네트워킹 앱입니다.

```
명함 OCR → 인물 등록 → 대화 기록/요약 → 관계도 시각화 → 카드 배틀 게임
```

## 기술 스택

| 영역 | 스택 |
|------|------|
| Frontend | React Native (Android-first), TypeScript |
| Backend | FastAPI (Python 3.11+), async |
| Database | MySQL 8+ (메인) + Neo4j Community Edition (관계도 그래프) |
| AI/ML | PaddleOCR (self-hosted, 명함 OCR), faster-whisper STT, Google Gemini (대화 요약) |
| Asset | ComfyUI, Krea2 (게임 카드 일러스트, 아이콘) |
| Infra | Docker Compose (로컬 개발 전용, 배포 없음) |

## 폴더 구조

```
/
├── CLAUDE.md              ← AI agent 진입점 (팀원별 작업 규칙)
├── docs/                  ← 프로젝트 문서 (아키텍처, API 스펙, UI 스펙 등)
├── frontend/              ← React Native 앱
│   └── CLAUDE.md
├── backend/               ← FastAPI 서버
│   └── CLAUDE.md
└── assets/                ← 그래픽 에셋 (카드 일러스트, 아이콘)
```

## 팀 구성

5명이 feature별로 나눠서 개발합니다.

| 담당자 | 역할 |
|------|------|
| 김민경 | 관계도 (Graph) |
| 박재경 | 녹음/요약 (Conversation) |
| 강민구 | 명함 인식 + 연락처 (Scan & Contacts) |
| 문민재 | 그래픽 에셋 (ComfyUI & Krea2) |
| 이승환 | 게임 클라이언트 (Game) |

각자 담당 feature 폴더 외의 코드는 수정하지 않으며, `shared/` 변경은 2인 이상 승인을 받은 PR로만 반영합니다. 자세한 규칙은 [CLAUDE.md](./CLAUDE.md)를 참고하세요.

## 로컬 개발 환경

이 프로젝트는 별도 배포 없이 로컬 Docker Compose 환경에서만 동작합니다.

```bash
# DB (MySQL + Neo4j) 및 백엔드 실행
docker compose up -d

# 프론트엔드
cd frontend
npm install
npm run android
```

## 문서

작업 전 아래 문서 중 담당 영역에 해당하는 문서를 반드시 읽어주세요.

| 문서 | 경로 | 설명 |
|------|------|------|
| 아키텍처 | [`docs/architecture.md`](./docs/architecture.md) | 모노레포 구조, feature 폴더, Neo4j 구성 |
| 컨벤션 | [`docs/conventions.md`](./docs/conventions.md) | Git flow, 브랜치/커밋/PR 규칙, 코드 스타일 |
| UI 스펙 | [`docs/ui-spec.md`](./docs/ui-spec.md) | 전체 화면별 UI 명세 |
| 디자인 토큰 | [`docs/design-tokens.md`](./docs/design-tokens.md) | 컬러, 타이포, 스페이싱, 모션 토큰 |
| API 스펙 | [`docs/api-spec.md`](./docs/api-spec.md) | REST API 엔드포인트, 요청/응답 스키마 |
| Feature 분담 | [`docs/features.md`](./docs/features.md) | 5인 역할 분담, feature 경계, 의존성 |
| 게임 룰 | [`docs/game-rules.md`](./docs/game-rules.md) | 카드 배틀 상세 규칙, 스탯, 스킬, AI 로직 |

## 기여 규칙

- `main`에 직접 push하지 않고, 항상 PR을 통해 머지합니다.
- 브랜치명: `{type}/{feature}-{description}` (예: `feat/scan-batch-mode`)
- 커밋 메시지: [Conventional Commits](https://www.conventionalcommits.org/) 형식을 따릅니다.

자세한 내용은 [`docs/conventions.md`](./docs/conventions.md)를 참고하세요.

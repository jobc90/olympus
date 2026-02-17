# Olympus Dashboard Refactoring Plan v1.0

> **벤치마킹 소스**: [agent-monitor](https://github.com/ruiqili2/agent-monitor) (OpenClaw Agent Dashboard)
> **대상**: `packages/web/` (Vite + React 18 SPA)
> **작성일**: 2026-02-12
> **목표**: agent-monitor의 Isometric Office + 픽셀아트 캐릭터 시스템을 Olympus에 완전 이식

---

## 1. 개념 매핑 (Concept Mapping)

### 엔티티 매핑

| agent-monitor | Olympus | 설명 |
|---------------|---------|------|
| **Owner** (boss) | **Codex** | 서버 시작 시 자동 생성되는 감시자/AI 비서 |
| **Agent** (session) | **Worker** | `olympus start`로 생성하는 Claude 인스턴스 |
| **AgentBehavior** (18종) | **WorkerBehavior** | 워커 상태 기반 행동 매핑 |
| **AgentConfig** | **WorkerConfig** | 워커 시각적 설정 (이름, 색상, 아바타) |
| **AgentDashboardState** | **WorkerDashboardState** | 워커 대시보드 상태 |
| OpenClaw Gateway (WS) | Olympus Gateway (WS) | 이미 존재하는 WebSocket 연결 |
| SSE `/api/gateway/events` | WebSocket 이벤트 | Olympus는 이미 WS 사용 중 (변환 불필요) |
| `sessions.list` RPC | `GET /api/workers` REST | 워커 목록 |
| `chat.send` RPC | `POST /api/codex/chat` | Codex 대화 |

### 행동(Behavior) 매핑

| WorkerBehavior | 발동 조건 | Zone | Animation | Particle |
|----------------|----------|------|-----------|----------|
| `working` | worker.status='running' + 활성 태스크 | own_desk | sit_typing | code |
| `idle` | worker.status='running' + 태스크 없음 | lounge/break_room | sit_idle | none |
| `thinking` | CLI 실행 중 (스트림 활성) | own_desk | sit_idle | question |
| `completed` | 최근 태스크 성공 완료 | own_desk | thumbs_up | sparkle |
| `error` | worker.status='failed' 또는 태스크 실패 | own_desk | stand | error |
| `offline` | worker.status='offline' (하트비트 타임아웃) | entrance | sleep | zzz |
| `chatting` | Codex chat 진행 중 | meeting_room | raise_hand | none |
| `reviewing` | 코드 리뷰 중 | whiteboard | hand_task | check |
| `deploying` | 배포 태스크 진행 | server_room | run | lightning |
| `resting` | 장시간 idle | break_room | drink_coffee | coffee_steam |
| `collaborating` | 다중 워커 동시 작업 | meeting_room | sit_typing | sparkle |
| `supervising` | Codex 전용 (감시 중) | boss_office | stand | none |

### Codex(감시자) 전용 행동

| Behavior | 조건 | Zone | Animation |
|----------|------|------|-----------|
| `supervising` | 기본 (워커 감시 중) | boss_office | stand |
| `directing` | 워커에 태스크 할당 중 | boss_office | hand_task |
| `analyzing` | Codex chat 응답 생성 중 | boss_office | sit_typing |
| `meeting` | 워커와 협업 필요 시 | meeting_room | raise_hand |

---

## 2. 아키텍처 결정

### 유지하는 것 (Olympus 기존)

| 항목 | 이유 |
|------|------|
| **Vite + React 18** | 프로젝트 빌드 시스템 통일 (Next.js 전환 비용 > 이득) |
| **WebSocket (OlympusClient)** | 이미 완성된 실시간 통신 (SSE로 변경 불필요) |
| **`@olympus-dev/protocol` 타입** | 공유 타입 시스템 유지 |
| **`@olympus-dev/client` 클라이언트** | WebSocket 클라이언트 유지 |
| **Tailwind CSS 3.4** | Tailwind 4로 업그레이드 불필요 (3.4 충분) |
| **Gateway REST API** | 기존 API 엔드포인트 유지 |

### 새로 도입하는 것 (agent-monitor에서 이식)

| 항목 | 소스 | 설명 |
|------|------|------|
| **Isometric Office Canvas** | `engine/`, `office/`, `sprites/` | 핵심 비주얼. 캔버스 기반 아이소메트릭 오피스 |
| **Pixel Art Sprite System** | `sprites/characters.ts` | 프로시저럴 캐릭터 렌더링 |
| **Furniture Sprites** | `sprites/furniture.ts` | 24종 가구 렌더링 |
| **Decoration Sprites** | `sprites/decorations.ts` | 벽, 배경, 야간 오버레이 |
| **Particle Effects** | `sprites/effects.ts` | 9종 파티클 + 말풍선 |
| **A* Pathfinding** | `engine/pathfinding.ts` | 캐릭터 이동 경로 |
| **Isometric Math** | `engine/isometric.ts` | 좌표 변환 |
| **Animation System** | `engine/animation.ts` | 프레임 기반 애니메이션 |
| **Canvas Renderer** | `engine/canvas.ts` | 메인 렌더 루프 |
| **Zone System** | `office/zones.ts` | 14개 구역 정의 |
| **Behavior System** | `office/behaviors.ts` | 행동→구역/애니메이션 매핑 |
| **Office Layout** | `office/layout.ts` | 맵 치수, 가구 배치, 보행 그리드 |
| **Theme System** | 4 테마 CSS 변수 | Midnight, Void, Warm, Neon |
| **AgentCard (재설계)** | `AgentCard.tsx` | 픽셀 아바타 + StatusBadge + 토큰바 |
| **SystemStats** | `SystemStats.tsx` | 애니메이션 숫자 통계 |
| **ActivityFeed** | `ActivityFeed.tsx` | 이벤트 피드 |
| **StatusBadge** | `StatusBadge.tsx` | 행동별 상태 배지 |
| **ChatWindow** | `ChatWindow.tsx` | Codex 대화 (우측 슬라이드 패널) |
| **Press Start 2P 폰트** | layout.tsx | 픽셀 스타일 폰트 |
| **Day/Night Cycle** | decorations.ts | 하루 주기 시각 효과 |
| **Navbar (재설계)** | `Navbar.tsx` | Dashboard/Office 탭 네비게이션 |

### 제거하는 것 (리팩토링 대상)

| 항목 | 이유 |
|------|------|
| `@dnd-kit/*` 의존성 | 미사용 dead dependency |
| `SparkyMascot.tsx` | 픽셀 아바타로 대체 |
| `mascot_nobg.png`, `mascot-removebg-preview.png` | 이미지 애셋 불필요 (프로시저럴 렌더링) |
| `SessionOutputPanel.tsx` | 사용 빈도 낮음, LogPanel로 통합 |
| `PhaseProgress.tsx` | 유지하되 오케스트레이션 전용 뷰로 이동 |

---

## 3. 디렉토리 구조 설계

```
packages/web/src/
├── main.tsx                          -- 진입점 (유지)
├── App.tsx                           -- 루트 (대폭 리팩토링)
├── index.css                         -- 글로벌 CSS (테마 시스템 통합)
├── vite-env.d.ts                     -- 타입 선언 (유지)
│
├── engine/                           -- [NEW] Canvas 렌더링 엔진
│   ├── isometric.ts                  -- 아이소메트릭 좌표 수학
│   ├── pathfinding.ts                -- A* 경로 탐색
│   ├── animation.ts                  -- 프레임 기반 애니메이션
│   └── canvas.ts                     -- 메인 렌더 루프
│
├── sprites/                          -- [NEW] 프로시저럴 픽셀아트 스프라이트
│   ├── characters.ts                 -- Codex + Worker 캐릭터 렌더링
│   ├── furniture.ts                  -- 24종 가구
│   ├── decorations.ts                -- 벽, 배경, 야간 오버레이
│   └── effects.ts                    -- 9종 파티클 + 말풍선
│
├── office/                           -- [NEW] 오피스 레이아웃 & 로직
│   ├── layout.ts                     -- 맵 치수, 가구 배치, 보행 그리드
│   ├── zones.ts                      -- 14개 구역 정의
│   └── behaviors.ts                  -- WorkerBehavior → 구역/애니메이션 매핑
│
├── lib/                              -- [NEW] 유틸리티 & 설정
│   ├── types.ts                      -- 대시보드 전용 타입
│   ├── config.ts                     -- 설정 관리 (localStorage, URL params)
│   └── state-mapper.ts              -- 워커 상태 → 행동 변환 + 데모 데이터
│
├── hooks/                            -- 훅 (리팩토링)
│   ├── useOlympus.ts                 -- WebSocket 상태 (리팩토링: 워커 행동 추가)
│   ├── useOffice.ts                  -- [NEW] 오피스 애니메이션 상태 머신
│   └── useContextTree.ts            -- Context OS (유지)
│
├── components/
│   ├── dashboard/                    -- [NEW] 메인 대시보드 컴포넌트
│   │   ├── Navbar.tsx                -- 상단 네비게이션 (Dashboard/Office 탭)
│   │   ├── SystemStats.tsx           -- 통계 (워커 수, 활성, 토큰, 실패)
│   │   ├── WorkerGrid.tsx            -- [REWRITE] 워커 카드 그리드
│   │   ├── WorkerCard.tsx            -- [NEW] 픽셀 아바타 + StatusBadge + 토큰바
│   │   └── ActivityFeed.tsx          -- [NEW] 이벤트 피드
│   │
│   ├── office/                       -- [NEW] 오피스 뷰 컴포넌트
│   │   ├── OfficeCanvas.tsx          -- 캔버스 렌더링
│   │   ├── MiniOffice.tsx            -- 대시보드 미니 프리뷰
│   │   └── OfficeControls.tsx        -- 오피스 컨트롤 바
│   │
│   ├── chat/                         -- [NEW] 채팅 컴포넌트
│   │   └── ChatWindow.tsx            -- Codex 대화 (우측 슬라이드 패널)
│   │
│   ├── shared/                       -- [NEW] 공유 컴포넌트
│   │   ├── ConnectionStatus.tsx      -- [REWRITE] 연결 상태
│   │   └── StatusBadge.tsx           -- [NEW] 행동별 상태 배지
│   │
│   ├── settings/                     -- [NEW] 설정 컴포넌트
│   │   └── SettingsPanel.tsx         -- [REWRITE] 설정 모달 (Gateway + Agents + Theme)
│   │
│   └── legacy/                       -- 기존 컴포넌트 (유지, 점진적 통합)
│       ├── AgentPanel.tsx            -- Agent 상태 머신
│       ├── AgentHistoryPanel.tsx     -- CLI 이력
│       ├── AgentStream.tsx           -- 에이전트 스트리밍
│       ├── Card.tsx                  -- 기본 카드
│       ├── CodexPanel.tsx            -- Codex Q&A
│       ├── CommandInput.tsx          -- 명령 입력
│       ├── ContextExplorer.tsx       -- Context OS
│       ├── EmptyState.tsx            -- 빈 상태
│       ├── LiveOutputPanel.tsx       -- CLI 스트리밍
│       ├── LogPanel.tsx              -- 로그
│       ├── PhaseProgress.tsx         -- 단계 진행률
│       ├── ProjectBrowser.tsx        -- 프로젝트 탐색
│       ├── SessionCostTracker.tsx    -- 비용 추적
│       ├── SessionList.tsx           -- 세션 목록
│       ├── TaskList.tsx              -- 작업 목록
│       └── TaskTimeline.tsx          -- 작업 타임라인
```

---

## 4. 구현 단계 (Implementation Phases)

### Phase 1: 엔진 & 스프라이트 이식 (Engine Layer)

**목표**: Canvas 렌더링 엔진과 스프라이트 시스템을 Olympus에 이식

**작업 목록**:

1.1. `engine/isometric.ts` — 아이소메트릭 좌표 변환 이식
  - `TILE_W=48, TILE_H=24, MAP_OFFSET_X=500, MAP_OFFSET_Y=80`
  - `gridToScreen()`, `screenToGrid()` 함수

1.2. `engine/pathfinding.ts` — A* 경로 탐색 이식
  - `GridPos`, `TileType`, `findPath()` 함수
  - 맨해튼 거리 휴리스틱

1.3. `engine/animation.ts` — 프레임 애니메이션 시스템 이식
  - `AnimState`, `createAnimState()`, `tickAnim()` 함수
  - 프레임 간격 제어

1.4. `engine/canvas.ts` — 메인 렌더 루프 이식
  - `Drawable` 인터페이스, `renderFrame()` 함수
  - 깊이 정렬 (depth = row + col)

1.5. `sprites/characters.ts` — 캐릭터 스프라이트 이식 + Olympus 커스텀
  - `px()` 헬퍼, `CharPalette`, `CharacterAnim` (12종)
  - `drawCharacter()` (12x15 그리드 @ 2x 스케일)
  - 7 에이전트 아바타 + 3 오너 아바타 → Olympus 커스텀:
    - **Codex**: `boss` 팔레트 (인디고 수트, 안경) + ⚡ 심볼
    - **Worker**: 7종 아바타 중 워커 인덱스별 순환 할당
  - 눈 깜빡임 (120틱 주기), 방향 시스템 (n/s/e/w), 이모지 호버

1.6. `sprites/furniture.ts` — 24종 가구 이식
  - 모든 가구 렌더링 함수 (desk, chair, monitor, coffee_machine, etc.)
  - 애니메이션: 모니터 깜빡임, 커피 머신 증기, 시계 바늘, 서버 LED

1.7. `sprites/decorations.ts` — 배경 데코레이션 이식
  - `drawWalls()`, `drawFloorTile()`, `drawBackground()`
  - Day/Night Cycle (사인파 phase)
  - 구역별 바닥 색조 (체커보드 패턴)

1.8. `sprites/effects.ts` — 파티클 & 말풍선 이식
  - 9종 파티클: zzz, sparkle, code, question, check, coffee_steam, smoke, error, lightning
  - `drawSpeechBubble()`, TTL 기반 알파 페이드

**검증 기준**: 각 모듈을 독립적으로 import하여 타입 체크 통과

---

### Phase 2: 오피스 레이아웃 & 행동 시스템 (Office Layer)

**목표**: 오피스 공간 정의 + 워커/Codex 행동 매핑

**작업 목록**:

2.1. `office/layout.ts` — 오피스 레이아웃 이식
  - MAP_COLS=24, MAP_ROWS=20
  - `buildWalkGrid()` — 보행 가능 타일 맵
  - `FURNITURE_PLACEMENTS[]` — 가구 위치/타입 배열
  - 내부 벽 파티션 (boss_office, meeting_room, break_room, server_room, lounge)

2.2. `office/zones.ts` — 구역 정의 이식 + Olympus 매핑
  - 14개 구역 (desk_0~5, boss_office, meeting_room, break_room, whiteboard, library, lounge, server_room, entrance)
  - `resolveZone()` — `_own_desk` → 워커 인덱스별 실제 데스크
  - `getZoneCenter()`, `getRandomPointInZone()` 함수
  - **Olympus 커스텀**: desk 동적 할당 (워커 수에 따라 0~5 순환)

2.3. `office/behaviors.ts` — 행동 시스템 이식 + Olympus 매핑
  - `BEHAVIOR_MAP` — 행동 → {zone, anim, bubble, particle, priority}
  - `BEHAVIOR_INFO` — 행동 → {label, emoji, category, color, neonColor}
  - **Olympus 매핑**: WorkerBehavior 12종 + Codex 4종 (위 섹션 1 참조)
  - `workerStatusToBehavior()` — RegisteredWorker + WorkerTaskRecord → WorkerBehavior 변환

2.4. `lib/types.ts` — 대시보드 전용 타입 정의
  - `WorkerBehavior` (12+4종 유니온 타입)
  - `WorkerConfig` (id, name, emoji, color, avatar)
  - `WorkerDashboardState` (behavior, officeState, tokens, logs, currentTask)
  - `BehaviorInfo` (label, emoji, category, color, neonColor)
  - `OfficeAgentState` (pos, targetPos, path, anim, direction, behavior, bubble, particles)
  - `ActivityEvent` (id, type, agentId, agentName, message, timestamp, color)
  - `SystemStats` (totalWorkers, activeWorkers, totalTokens, failedTasks)
  - `DashboardConfig` (gateway, agents[], theme)

2.5. `lib/state-mapper.ts` — 상태 매핑 유틸리티
  - `workerToConfig()` — RegisteredWorker → WorkerConfig
  - `workerToDashboardState()` — RegisteredWorker + TaskRecord → WorkerDashboardState
  - `generateDemoData()` — 데모 모드용 가짜 워커/Codex 데이터
  - 색상 팔레트: 6색 순환 할당

2.6. `lib/config.ts` — 설정 관리
  - localStorage 기반 설정 저장/로드
  - URL 파라미터 오버라이드
  - 테마 설정 (4 테마)
  - 에이전트별 커스텀 (이름, 이모지, 아바타, 색상)

**검증 기준**: 데모 모드에서 Codex 1명 + Worker 3명 생성, 각각 행동 할당 확인

---

### Phase 3: 테마 시스템 & CSS (Theme Layer)

**목표**: 4-테마 시스템 + 리디자인된 CSS

**작업 목록**:

3.1. `index.css` 리팩토링
  - 기존 Tailwind 커스텀 색상 유지 (하위 호환)
  - `[data-theme]` 기반 CSS 변수 시스템 추가
  - 4 테마: Midnight(기본), Void, Warm, Neon
  - 각 테마 12개 CSS 변수 (`--bg-primary`, `--bg-secondary`, `--bg-card`, `--text-primary`, `--text-secondary`, `--accent-primary`, `--accent-success`, `--accent-warning`, `--accent-danger`, `--accent-info`, `--border`, `--shadow`)
  - 커스텀 스크롤바 (6px, 투명 트랙)
  - 애니메이션: `slide-in`, `pulse-glow`, `float`
  - `.font-pixel`, `.font-mono` 유틸리티 클래스

3.2. `tailwind.config.ts` 업데이트
  - CSS 변수 참조 색상 추가 (`theme-bg`, `theme-text`, `theme-accent` 등)
  - Press Start 2P 폰트 추가 (`fontFamily.pixel`)

3.3. `index.html` 업데이트
  - Google Fonts CDN: Press Start 2P, JetBrains Mono, Inter 추가
  - `data-theme="midnight"` 기본 속성

**검증 기준**: 4 테마 전환 시 모든 컴포넌트 색상 변경 확인

---

### Phase 4: 핵심 컴포넌트 구현 (Component Layer)

**목표**: 새 대시보드 UI 컴포넌트 구현

**작업 목록**:

4.1. `components/shared/StatusBadge.tsx` — 상태 배지
  - Props: `{ behavior: WorkerBehavior; size?: 'sm'|'md'|'lg'; pulse?: boolean }`
  - 행동별 neonColor 배경, 이모지 + 라벨
  - Active: ping 애니메이션, Error: pulse, Idle: static

4.2. `components/shared/ConnectionStatus.tsx` — 연결 상태 (재작성)
  - Props: `{ connected: boolean; demoMode?: boolean; error?: string; compact?: boolean }`
  - 초록(연결) + ping, 노랑(데모), 빨강(오류) + pulse

4.3. `components/dashboard/Navbar.tsx` — 네비게이션 바
  - Props: `{ connected, demoMode, activeTab, onTabChange, onSettingsClick }`
  - 로고 "Olympus" (Press Start 2P 폰트)
  - 탭: Dashboard, Office
  - ConnectionStatus (compact)
  - 설정 기어 아이콘
  - `fixed top-0 z-50`

4.4. `components/dashboard/SystemStats.tsx` — 시스템 통계
  - Props: `{ stats: SystemStats }`
  - 4열 그리드: Workers, Active, Tokens, Failed
  - `AnimatedNumber` 서브컴포넌트 (30ms 보간)
  - SSR-safe (hydration 전 대시 표시)

4.5. `components/dashboard/WorkerCard.tsx` — 워커 카드
  - Props: `{ worker: WorkerConfig; state?: WorkerDashboardState; onChatClick; onDetailClick? }`
  - `PixelAvatar` 서브컴포넌트 (48x48 캔버스에 캐릭터 렌더링)
  - `TokenBar` 서브컴포넌트 (토큰 사용률 프로그레스 바)
  - StatusBadge, 에이전트 이름, 모델, 채널 정보
  - 호버: `scale-[1.02]` + neonColor box-shadow 글로우
  - 버튼: Chat, Detail (링크)

4.6. `components/dashboard/WorkerGrid.tsx` — 워커 그리드 (재작성)
  - Props: `{ workers: WorkerConfig[]; workerStates: Record<string, WorkerDashboardState>; onChatClick }`
  - 반응형 그리드: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
  - Codex 카드 + Worker 카드들
  - 빈 상태: "No workers running" 안내

4.7. `components/dashboard/ActivityFeed.tsx` — 활동 피드
  - Props: `{ events: ActivityEvent[]; maxHeight?: number }`
  - 스크롤 리스트, 새 이벤트 상단 삽입
  - 이벤트 타입별 색상 (8종)
  - 상대 시간 표시

4.8. `components/office/OfficeCanvas.tsx` — 오피스 캔버스
  - Props: `{ officeState; workers; codex; onTick; width?; height?; scale?; demoMode?; connected? }`
  - `<canvas>` 1100x620 내부 해상도
  - `requestAnimationFrame` 30fps 렌더 루프
  - `image-rendering: pixelated`
  - Props를 refs에 저장 (stale closure 방지)

4.9. `components/office/MiniOffice.tsx` — 미니 오피스
  - Props: `{ workers; workerStates; codexConfig; theme }`
  - 1100x620 캔버스 → 900x510 CSS 표시
  - 호버: "Click to expand" 배지
  - 자체 `useOffice` 인스턴스

4.10. `components/office/OfficeControls.tsx` — 오피스 컨트롤
  - Props: `{ workers; workerStates; demoMode; onSetBehavior }`
  - 접기/펼치기 바
  - 데모 모드: 에이전트 선택 + 14개 행동 버튼

4.11. `components/chat/ChatWindow.tsx` — 채팅 윈도우
  - Props: `{ agentId; agentName; agentEmoji; agentColor; messages; onSend; onClose }`
  - 우측 고정 패널 (384px), slide-in 애니메이션
  - 메시지 버블: 사용자(우측), 에이전트(좌측)
  - 스마트 auto-scroll
  - Enter 전송, Shift+Enter 줄바꿈

4.12. `components/settings/SettingsPanel.tsx` — 설정 패널 (재작성)
  - Props: `{ config; onUpdate; onClose }`
  - 3탭: Gateway, Agents, Theme
  - Gateway: URL, Token, 데모 모드 토글
  - Agents: 이름/이모지/아바타/색상 커스텀
  - Theme: 4테마 선택 그리드

**검증 기준**: 각 컴포넌트가 독립적으로 렌더링되고 Props 타입 일치

---

### Phase 5: 훅 & 데이터 플로우 (Hook Layer)

**목표**: useOffice 훅 구현 + useOlympus 확장

**작업 목록**:

5.1. `hooks/useOffice.ts` — 오피스 애니메이션 훅
  - Params: `{ workers: WorkerConfig[]; workerStates: Record<string, WorkerDashboardState>; codexConfig: WorkerConfig; codexState: WorkerDashboardState }`
  - 내부 상태: `officeAgents: Map<string, OfficeAgentState>` (위치, 경로, 애니메이션)
  - `tick()` 함수:
    - 행동 변경 감지 → 새 목표 구역 결정 → A* 경로 계산
    - 경로를 따라 이동 (1타일/프레임)
    - 구역 도착 → 애니메이션 전환 + 파티클 스폰
    - 말풍선 TTL 관리
    - 파티클 수명 관리
  - 30fps `requestAnimationFrame` → `tick()` + 콜백
  - 새 워커 등장 시 entrance에서 시작 → 할당된 desk로 이동
  - 워커 오프라인 시 → entrance로 이동 → sleep

5.2. `hooks/useOlympus.ts` — 기존 훅 확장
  - 워커 이벤트 핸들러 보강:
    - `worker:started` → WorkerConfig 추가, `ActivityEvent` 생성
    - `worker:output` → WorkerDashboardState.logs 업데이트
    - `worker:done` → 상태 업데이트, ActivityEvent
  - 워커 행동 자동 판단:
    - `cliStreams` 활성 → `working`/`thinking`
    - `cli:complete` → `completed` (5초) → `idle`
    - 에러 → `error`
    - 장시간 idle → `resting`
  - Codex 상태 관리:
    - 서버 연결됨 → `supervising`
    - 워커 태스크 할당 → `directing`
    - chat 응답 중 → `analyzing`
  - 워커 목록 정기 폴링 (`GET /api/workers`, 10초 간격)
  - 활동 이벤트 생성 (behavior 변경 시)
  - SystemStats 계산 (워커 수, 활성, 누적 토큰, 실패)

**검증 기준**: 워커 등록/삭제 시 오피스에 캐릭터 등장/퇴장 확인

---

### Phase 6: App.tsx 리팩토링 & 라우팅 (Integration Layer)

**목표**: 새 컴포넌트 통합 + 탭 기반 뷰 전환

**작업 목록**:

6.1. `App.tsx` 리팩토링
  - 탭 시스템: `activeTab: 'dashboard' | 'office'`
  - Dashboard 탭:
    ```
    Navbar
    MiniOffice (클릭 → Office 탭)
    SystemStats
    grid 3열:
      좌: WorkerGrid (Codex + Workers)
      중: CommandInput + LiveOutputPanel + AgentHistoryPanel
      우: ActivityFeed + CodexPanel + SessionCostTracker
    ```
  - Office 탭:
    ```
    Navbar
    OfficeCanvas (full-width)
    OfficeControls
    ChatWindow (슬라이드)
    ```
  - 기존 오케스트레이션 뷰 (런 선택 시 표시):
    ```
    PhaseProgress + TaskList + AgentStream + LogPanel
    ```
  - 기존 세션 뷰 (세션 선택 시 표시):
    ```
    SessionOutputPanel
    ```

6.2. 테마 전환 로직
  - `document.documentElement.dataset.theme` 변경
  - localStorage 저장/복원
  - SettingsPanel 테마 탭과 연결

6.3. 설정 관리 통합
  - 기존 SettingsModal → 새 SettingsPanel로 교체
  - DashboardConfig 타입 사용
  - `window.__OLYMPUS_CONFIG__` 서버 주입 유지

**검증 기준**: Dashboard/Office 탭 전환, 테마 변경, 워커 카드 → 오피스 캐릭터 동기화

---

### Phase 7: 데모 모드 & 빌드 검증 (Polish Layer)

**목표**: 데모 모드 + 전체 빌드/타입 체크

**작업 목록**:

7.1. 데모 모드 구현
  - 게이트웨이 미연결 시 자동 활성화
  - Codex 1명 + Worker 3명 (Atlas, Nova, Spark) 생성
  - 5초마다 랜덤 행동 변경
  - 3초마다 활동 이벤트 생성

7.2. 전체 빌드 검증
  - `pnpm lint` (tsc --noEmit) 통과
  - `pnpm build` (vite build) 통과
  - 미사용 import 제거
  - `@dnd-kit` 의존성 제거

7.3. 기존 기능 호환성 확인
  - CLI 명령 실행 (CommandInput → POST /api/cli/run)
  - 실시간 스트리밍 (LiveOutputPanel)
  - 워커 관리 (등록/삭제/태스크)
  - Codex Q&A (CodexPanel)
  - 오케스트레이션 모니터링 (PhaseProgress + TaskList)
  - Context OS (ContextExplorer)

**검증 기준**: `pnpm build` 성공, 모든 기존 기능 정상 작동

---

## 5. 팀 구성 (Team Structure)

### 리더 (코딩 금지)
- **역할**: 방향/디테일 감시, 계획 준수 확인, 진행 상황 조율
- **도구**: TaskList, TaskUpdate, SendMessage, Read (코드 리뷰)

### Teammate 1: Engine Worker
- **담당**: Phase 1 전체 (engine/ + sprites/)
- **타입**: `sisyphus-junior`

### Teammate 2: Office Worker
- **담당**: Phase 2 전체 (office/ + lib/)
- **타입**: `sisyphus-junior`

### Teammate 3: Theme Worker
- **담당**: Phase 3 전체 (CSS + Tailwind + fonts)
- **타입**: `sisyphus-junior`

### Teammate 4: Component Worker
- **담당**: Phase 4 (dashboard/, office/, chat/, shared/, settings/ 컴포넌트)
- **타입**: `sisyphus-junior`

### Teammate 5: Hook & Integration Worker
- **담당**: Phase 5 + 6 + 7 (훅, App.tsx, 데모 모드, 빌드 검증)
- **타입**: `sisyphus-junior`

### 병렬 실행 순서
```
Phase 1 (Engine Worker) ─────┐
Phase 2 (Office Worker) ─────┼──→ Phase 4 (Component Worker) ──→ Phase 5+6+7 (Hook Worker)
Phase 3 (Theme Worker)  ─────┘
```

Phase 1, 2, 3은 독립적이므로 완전 병렬 실행.
Phase 4는 Phase 1, 2, 3의 타입에 의존하므로 순차.
Phase 5, 6, 7은 Phase 4 컴포넌트에 의존하므로 순차.

---

## 6. 품질 기준

1. **타입 안전**: 모든 파일 `tsc --noEmit` 통과, `any` 사용 금지
2. **빌드**: `pnpm build` 0 에러, 0 경고
3. **기존 기능**: 리팩토링 후 모든 기존 대시보드 기능 정상 작동
4. **새 기능**: 오피스 뷰, 픽셀 캐릭터, 테마 전환, 활동 피드, 채팅 정상 작동
5. **성능**: 60fps 캔버스 렌더링 (30fps tick), 메모리 누수 없음
6. **코드 품질**: 미사용 코드 없음, 일관된 네이밍, Olympus 컨벤션 준수

# Codex Control Plane Redesign

> Date: 2026-03-24

## Background

Olympus의 현재 구조는 `Codex가 사용자와 대화하고 Claude 워커에게 작업을 위임한다`는 목표를 일부 구현했지만, 실제 운영에서는 다음 문제가 반복되었다.

- 사용자는 Codex 하나와만 대화하고 싶지만, 실제 실행 모델은 Codex, Gateway, WorkerRegistry, PTY, Dashboard 상태 추론 로직으로 분산되어 있다.
- Claude 워커의 실제 진행상황과 Codex가 알고 있는 상태가 자주 어긋난다.
- PTY 출력이 `완료 판정`, `상태 판정`, `웹 대시보드 표시`까지 동시에 담당하면서 싱크 불일치와 텍스트 깨짐이 시스템 전체에 영향을 준다.
- 프로젝트 단위 지휘보다 워커 단위 이벤트가 앞서 있어, “프로젝트별 현재 상태”를 안정적으로 집계하기 어렵다.

사용자 목표는 다음과 같다.

- 사용자는 Codex와만 대화한다.
- Codex는 모든 프로젝트의 진행상황을 파악하고 요약/상세 보고를 모두 제공한다.
- Claude 워커는 Codex가 작성한 작업지시 문서를 구현한다.
- Claude 워커는 시작 확인과 완료 보고를 Codex가 읽기 쉬운 구조화된 산출물로 남긴다.
- macOS 전용 운영 환경에서 tmux를 런타임 substrate로 사용해 Claude 워커와 병렬 에이전트의 터미널 작업을 항상 가시화한다.

## Current State

현재 코드에서 확인되는 주요 병목은 다음과 같다.

### 1. PTY가 너무 많은 책임을 가진다

`packages/cli/src/pty-worker.ts`는 아래 책임을 동시에 가진다.

- Claude CLI 세션 실행
- 로컬 stdin passthrough
- 원격 입력 전달
- idle/complete 감지
- 결과 텍스트 추출
- TUI 아티팩트 필터링
- 로컬 입력을 상위 시스템 이벤트로 간주하는 보조 로직

이 구조는 `표현 채널`과 `상태 판정 채널`을 분리하지 못한다.

### 2. Codex 위임 경로가 Gateway API에 직접 박혀 있다

`packages/gateway/src/api.ts`의 `/api/codex/chat`는 다음을 한 엔드포인트에서 처리한다.

- 사용자 메시지 해석
- 워커 목록/상태를 system prompt로 주입
- `@workerName` 기반 직접 위임
- Codex가 직접 답할지 워커에게 넘길지 판단

즉, Codex 대화 모델과 워커 오케스트레이션 계약이 분리되어 있지 않다.

### 3. Gateway가 너무 많은 런타임 책임을 가진다

`packages/gateway/src/server.ts`는 다음을 한 프로세스에서 모두 가진다.

- RunManager
- SessionManager
- CliSessionStore
- WorkerRegistry
- LocalContextStoreManager
- TeamOrchestrator
- CodexAdapter
- GeminiAdvisor
- UsageMonitor

이 상태에서는 “무엇이 Control Plane이고 무엇이 Runtime Plane인가”가 불명확하다.

### 4. Dashboard 상태는 WebSocket + polling + output 추론을 섞어서 만든다

`packages/web/src/hooks/useOlympus.ts`는 아래 입력원을 동시에 합성한다.

- WebSocket 이벤트
- `/api/workers` polling
- `/api/workers/tasks` polling
- `/api/usage` polling
- `cli:stream`
- `session:screen`
- worker behavior 추론

결과적으로 UI는 풍부하지만, 단일 진실 원천 없이 여러 관측값을 추론 결합한다.

### 5. 프로젝트 중심이 아니라 워커 중심 모델에 가깝다

현재 설계는 WorkerRegistry 중심으로 워커를 등록하고, Codex가 워커를 보고 작업을 넘기는 방식이다. 하지만 사용자의 운영 목표는 워커가 아니라 프로젝트 단위 지휘다.

## Architecture

새 아키텍처는 다음 두 평면으로 분리한다.

### 1. Codex Control Plane

사용자와의 단일 대화 상태와 작업 계약을 관리한다.

핵심 책임:

- 사용자 명령 해석
- 프로젝트 명시 검증
- 상위 작업 생성
- 프로젝트별 하위 작업 분해
- 멀티프로젝트 DAG 관리
- 작업지시 문서 작성
- 상태 집계 및 위험도 기반 보고
- 실패 보고를 읽고 재계획

핵심 원칙:

- 사용자는 Codex와만 대화한다.
- Codex는 작업을 항상 프로젝트 단위로 발행한다.
- 프로젝트 미지정 실행 명령은 거부한다.

### 2. Project Runtime Plane

각 프로젝트의 실제 실행을 관리한다.

구성 요소:

- `Project Scheduler`
- `Project Runtime Adapter`
- `Tmux Session Manager`
- `Worker Host`
- `Terminal Projection Service`

핵심 원칙:

- 프로젝트당 기본 워커 1개를 상주 유지한다.
- 추가 워커는 필요 시 생성하고 제거한다.
- 기본 워커는 메인 작업공간을 사용한다.
- 임시 워커는 별도 git worktree를 사용한다.
- 워커는 항상 단일 프로젝트 작업만 수행한다.
- 모든 Claude CLI 세션은 tmux pane 또는 window 안에서 실행한다.

## Key Decisions

### 1. tmux를 런타임 substrate로 사용한다

새 구조에서 Claude CLI 세션의 실제 실행 기반은 tmux다.

- 프로젝트마다 tmux session을 가진다.
- 기본 워커는 기본 pane/window에 상주한다.
- 추가 병렬 워커는 별도 pane 또는 window로 생성한다.
- 사용자는 `tmux attach`만으로 실제 작업 중인 병렬 에이전트 화면을 직접 볼 수 있다.
- 웹 대시보드는 tmux `capture-pane` 기반으로 콘솔을 투영한다.

중요한 점은 tmux 역시 `시스템의 진실 원천`이 아니라는 것이다. tmux는 실행과 가시화를 위한 substrate이고, 공식 상태는 계속해서 작업 아티팩트와 Task Authority가 가진다.

### 2. 시스템의 진실 원천은 파일 아티팩트 + SQLite 인덱스다

공식 진실은 다음 조합으로 정의한다.

- 작업지시 문서
- 시작 확인 JSON / Markdown
- 완료 보고 JSON / Markdown
- 작업 상태 저장소(SQLite)

웹 콘솔, 로컬 콘솔, 이벤트 스트림은 모두 이 진실의 투영이다.

### 3. macOS 전용으로 단순화한다

이번 재설계는 macOS만 지원한다.

- Windows 대응 설계는 범위에서 제외한다.
- 로컬 제어 채널은 Unix domain socket만 고려한다.
- 터미널 런처와 attach 경험은 macOS 기준으로 최적화한다.
- tmux를 설치 가능한 운영 환경이라는 가정을 명시한다.

### 4. 프로젝트 중심 모델을 최상위 뷰로 둔다

최상위 기본 뷰는 `프로젝트`다.

- 프로젝트
- 프로젝트 아래 워커 풀
- 프로젝트 아래 현재/최근 작업

전체 진행 보고는 프로젝트 기반이되, 표시 순서는 `위험도/문제 우선`으로 한다.

### 5. 작업은 상위 작업과 프로젝트 작업으로 분리한다

- 상위 작업: 사용자 요청 단위
- 프로젝트 작업: 실제 실행 단위

멀티프로젝트 요청은 허용하되, 반드시 프로젝트별 하위 작업으로 분해한다.

### 6. 직접 입력도 Codex가 관측하는 공식 이벤트로 흡수한다

사용자는 다음 채널 모두로 입력할 수 있다.

- Codex 대화
- tmux attach 세션 직접 입력
- 웹 대시보드 명령 박스
- 웹 raw 입력

그러나 실행 질서는 모두 프로젝트 큐와 락을 거친다. 직접 입력 역시 Codex 이벤트 로그에 기록되며, 현재 작업의 수동 개입인지 별도 작업 후보인지 Codex가 판단한다.

### 7. 소프트 선점은 `blocked` 상태로 남긴다

긴급 작업이 들어오면 현재 작업을 즉시 죽이지 않는다.

- 안전 지점까지 정리
- 현재 작업은 `blocked`
- 새 작업을 `assigned -> in_progress`

재개 여부는 이후 Codex가 판단한다.

### 8. 결과 반영은 자동 시도하되 충돌 시 Codex가 개입한다

임시 워커 worktree 결과는 다음 원칙을 따른다.

- 충돌 없으면 자동 병합 시도
- 충돌 있으면 Codex가 개입

## Implementation Details

### A. 핵심 컴포넌트

#### Codex Orchestrator

새 Codex Orchestrator는 다음 파이프라인을 따른다.

1. 명령 해석
2. 프로젝트 명시 검증
3. 기존 작업/충돌 확인
4. 상위 작업 생성
5. 프로젝트별 하위 작업 생성
6. 작업지시 문서 작성
7. 프로젝트 스케줄러에 배정
8. 시작 확인/완료 보고 수집
9. 사용자 요약 보고

#### Task Authority

SQLite 기반 상태 저장소다.

관리 대상:

- parent task
- project task
- 상태 전이
- 큐
- 락
- 선점 기록
- 의존관계
- 취소 범위

권장 상태 전이:

- `draft`
- `ready`
- `assigned`
- `in_progress`
- `blocked`
- `completed`
- `failed`
- `cancelled`

#### Instruction Artifact Store

작업 아티팩트 저장 규칙:

- 중앙 원본
  `~/.olympus/control/projects/<project-id>/tasks/<task-id>/`
- 프로젝트 로컬 사본
  `<project>/.olympus/tasks/<task-id>/`

중앙 저장소는 Codex 집계용 source of truth이고, 프로젝트 로컬 사본은 워커 실행용 mirror다.

#### Project Scheduler

워커 선택 규칙:

- 맥락 연속성
- 전문화/역할/필요 스킬
- idle 여부

프로젝트마다 기본 워커 1개는 유지한다. 추가 워커는 필요 시 생성한다.

#### Worker Host

Worker Host는 tmux 안에서 Claude CLI를 감싸는 실제 워커 프로세스다.

역할:

- tmux session/window/pane 생성 및 연결
- Claude CLI 세션 시작/재연결/리셋
- 런처 프롬프트 + 지시서 파일 경로 전달
- 시작 확인 아티팩트 생성
- 완료 보고 아티팩트 생성
- tmux pane 출력 캡처/투영 이벤트 방출

#### Tmux Session Manager

tmux session manager는 프로젝트별 세션 레이아웃을 관리한다.

권장 기본 구조:

- session: `olympus:<project-id>`
- window 0: 기본 워커
- 추가 window/pane: 병렬 임시 워커

필수 책임:

- pane와 worker/task ID 매핑
- attach 대상 식별
- pane 출력 스냅샷 수집
- pane 입력 전달
- 병렬 워커 종료 후 pane/window 정리

### B. 작업지시 문서 계약

작업지시 문서는 영어로 작성된다. 필수 섹션:

1. Goal
2. Project context
3. Exact instructions
4. Constraints
5. Allowed autonomy
6. Required verification
7. Expected outputs
8. Escalation/reporting rules

### C. 시작 확인 / 완료 보고 계약

시작 시:

- `start-ack.json`
- `start-ack.ko.md`

완료 시:

- `final-report.json`
- `final-report.ko.md`

기계용 JSON은 영어 중심으로 작성한다. 사람용 Markdown은 사용자에게 보여줄 한국어 요약으로 작성한다.

### D. 콘솔 모델

#### tmux + Terminal

실제 인터랙티브 환경은 macOS 터미널에서 attach된 tmux 세션이다.

- 기본 실행 단위는 tmux session
- 사용자는 Terminal/iTerm에서 `tmux attach`로 직접 들어갈 수 있다
- 필요하면 Olympus가 attach 명령까지 자동 실행할 수 있다
- 병렬 에이전트는 pane/window로 동시에 가시화된다

#### Dashboard

대시보드는 두 탭을 제공한다.

- `Live Console`
- `Projected View`

또한 입력 모드는 두 가지다.

- 기본 `명령 박스`
- 선택적 `raw 입력`

### E. 승인 정책

위험 작업은 정책 기반 혼합 승인으로 처리한다.

- 저위험: 자동
- 중위험: Codex 정책 확인
- 고위험: 사용자 승인 필요

### F. 전역 대화 상태

모든 채널은 하나의 공통 Codex 대화 상태를 공유한다.

- CLI
- 웹 대시보드
- 향후 Telegram

전역 메모리에는 프로젝트 요약만 유지하고, 상세는 관련 프로젝트만 동적으로 로드한다.

## Constraints and Caveats

- Claude 워커는 반드시 Claude CLI 기반이어야 한다. Claude API/SDK 전환은 범위 밖이다.
- 현재 운영체제 범위는 macOS only다.
- tmux는 필수 런타임 의존성이다.
- 기존 `Gateway`, `WorkerRegistry`, `pty-worker`, `Dashboard hook`에 강하게 결합된 로직이 많아 점진적 전환이 필요하다.
- PTY를 중심으로 한 직접 미러링 대신 tmux pane capture/send-keys 기반 제어로 이동한다.
- `packages/mcp/`의 현재 상태는 별도 재검토가 필요하므로 본 설계에서는 핵심 실행 축에 포함하지 않는다. `[TODO: 확인 필요]`

## References

- `packages/cli/src/pty-worker.ts`
- `packages/cli/src/commands/start.ts`
- `packages/gateway/src/api.ts`
- `packages/gateway/src/server.ts`
- `packages/gateway/src/worker-registry.ts`
- `packages/gateway/src/codex-adapter.ts`
- `packages/web/src/hooks/useOlympus.ts`
- `packages/web/src/components/LiveOutputPanel.tsx`

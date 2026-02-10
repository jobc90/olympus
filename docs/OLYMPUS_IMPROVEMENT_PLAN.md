# Olympus 개선 계획서: OpenClaw 벤치마킹 기반 아키텍처 혁신

- 작성일: 2026-02-10
- 버전: v1.2 (Phase 1 구현 완료 반영, 문서 리뷰 보완)
- 기반 분석: OpenClaw `d85f056` (2026.2.9) vs Olympus `b203224` (v0.4.0)

### 구현 상태

| Phase | 설명 | 상태 | 비고 |
|-------|------|------|------|
| **사전 검증** | `claude -p --output-format json` 동작 확인 | **완료** | 5개 테스트 전부 통과 |
| **Phase 1** | CliRunner 모듈 + 세션 저장소 + API + 테스트 | **완료** | 8파일 (신규4+수정4), 27개 테스트, 1155줄 |
| Phase 2 | 텔레그램 봇 단순화 | 미착수 | |
| Phase 3 | 메모리 활성화 | 미착수 | |
| Phase 4 | tmux 역할 재정의 | 미착수 | |
| Phase 5 | 대시보드 업데이트 | 미착수 | |
| Phase 6 | /orchestration 통합 | 미착수 | |

---

## 목차

1. [경영진 요약 (Executive Summary)](#1-경영진-요약)
2. [핵심 문제 진단: 왜 텔레그램 응답이 안 되는가](#2-핵심-문제-진단)
3. [아키텍처 비교: OpenClaw vs Olympus](#3-아키텍처-비교)
4. [통신 방식 비교: 구조화 출력 vs 터미널 스크래핑](#4-통신-방식-비교)
5. [세션 관리 비교](#5-세션-관리-비교)
6. [텔레그램 통합 비교](#6-텔레그램-통합-비교)
7. [메모리/DB 비교](#7-메모리db-비교)
8. [게이트웨이 프로토콜 비교](#8-게이트웨이-프로토콜-비교)
9. [목표 아키텍처 설계](#9-목표-아키텍처-설계)
10. [구현 계획: Phase별 마이그레이션](#10-구현-계획)
11. [파일별 변경 명세](#11-파일별-변경-명세)
12. [리스크 분석 및 대응](#12-리스크-분석)
13. [검증 계획](#13-검증-계획)

---

## 1. 경영진 요약

### 현재 상태

Olympus는 Codex CLI(메인세션)와 Claude CLI(워크세션)를 tmux 기반으로 오케스트레이션하는 플랫폼이다. 텔레그램에서 명령을 내리면 Gateway가 tmux `send-keys`로 CLI에 입력하고, `capture-pane`으로 터미널 화면을 폴링하여 출력을 추출한다.

**근본 문제**: 터미널 UI 출력(ANSI 코드, 스피너, 상태바, 프롬프트)을 정규식으로 필터링하여 "의미 있는 응답"을 추출하는 방식은 **본질적으로 취약**하다.

### OpenClaw의 해법

OpenClaw는 **같은 문제를 완전히 다른 방식**으로 해결했다:

```
OpenClaw:  claude -p --output-format json → 구조화된 JSON 응답 → 파싱
Olympus:   tmux send-keys → capture-pane → regex 필터링 → 추측성 응답 추출
```

OpenClaw은 Claude CLI의 **비대화형 모드** (`-p` 플래그)와 **JSON 출력 포맷** (`--output-format json`)을 사용하여, 터미널 UI 자체를 우회한다. 출력은 깨끗한 JSON이므로 파싱이 확정적이다.

### 개선 방향

Olympus의 통신 레이어를 **tmux 터미널 스크래핑 → 구조화 CLI 출력**으로 전환한다. 이것이 이 문서의 핵심이다.

### 영향 범위

| 패키지 | 변경 규모 | 설명 |
|--------|----------|------|
| `gateway` | **대규모** | SessionManager 통신 방식 전면 교체 |
| `cli` | **중규모** | createMainSession, createWorkSession 로직 변경 |
| `telegram-bot` | **소규모** | filterOutput 의존성 제거, 응답 처리 단순화 |
| `codex` | **소규모** | OutputMonitor 방식 교체 |
| `protocol` | **소규모** | 새 메시지 타입 추가 |

---

## 2. 핵심 문제 진단

### 2.1 "텔레그램에 응답이 안 온다"의 근본 원인

현재 데이터 흐름을 추적하면:

```
텔레그램 메시지: "빌드해줘"
  ↓
Telegram Bot → POST /api/sessions/{id}/input → Gateway API
  ↓
SessionManager.sendInput() → tmux send-keys -t main -l "빌드해줘" + Enter
  ↓
Codex CLI (tmux 내부): "빌드해줘" 수신 → 처리 시작
  ↓
[여기서 문제 시작]
  ↓
SessionManager.startOutputPolling() — 500ms마다:
  → tmux capture-pane -t main -p -S -50
  → filterOutput(captured)    ← ⚠️ 여기서 응답이 사라짐
  → 이전 캡처와 비교 (Set diff)
  → 새 줄 추출
  → broadcastSessionEvent()
  ↓
Telegram Bot: session:output 수신 → DigestSession → Telegram 전송
```

**실패 지점들**:

#### (A) capture-pane의 타이밍 문제
- 500ms 폴링이므로, CLI가 빠르게 출력하고 프롬프트로 돌아가면 **중간 출력을 놓칠 수 있음**
- capture-pane은 "현재 화면에 보이는 것"만 반환 — 스크롤아웃된 내용은 `-S -50`으로 제한

#### (B) filterOutput의 과도한 필터링
- `session-manager.ts:954-1133` (약 180줄의 필터 로직)
- Allowlist: `⏺`, `⎿`, `•` 마커가 있는 줄만 통과
- Blocklist: 배너, 프롬프트, 상태바, 스피너, 도구호출 등 수십 가지 패턴
- **문제**: Codex CLI의 실제 응답이 `⏺` 마커 없이 출력되면? → **전부 필터됨**

#### (C) Set diff의 한계
- `prevLines = new Set(...)` → `newLines = currentLines.filter(l => !prevLines.has(l))`
- 같은 줄이 반복되면 (예: "빌드 성공") → 새 줄로 인식 안 됨
- 줄 순서가 바뀌면 → false positive

#### (D) 디바운스/스로틀의 충돌
- OUTPUT_DEBOUNCE_MS: 1000ms (출력 안정화 대기)
- OUTPUT_MIN_INTERVAL: 2000ms (최소 전송 간격)
- OUTPUT_MIN_CHANGE: 5자 (최소 변화량)
- 이 3개 조건이 **모두** 통과해야 전송 — 빠른 짧은 응답은 묻힘

### 2.2 OpenClaw에는 이 문제가 없는 이유

OpenClaw의 CLI 실행 방식:

```typescript
// openclaw/src/agents/cli-runner.ts:236
const result = await runCommandWithTimeout([backend.command, ...args], {
  timeoutMs: params.timeoutMs,
  cwd: workspaceDir,
  env,
  input: stdinPayload,
});

const stdout = result.stdout.trim();  // ← 깨끗한 JSON
const parsed = parseCliJson(stdout, backend);  // ← 확정적 파싱
```

**CLI 실행 인자**:
```bash
claude -p --output-format json --dangerously-skip-permissions \
  --model opus --session-id abc123 \
  --append-system-prompt "..." \
  "빌드해줘"
```

**응답 (stdout)**:
```json
{
  "content": [{"type": "text", "text": "빌드를 시작합니다..."}],
  "session_id": "abc123-def456",
  "usage": {"input_tokens": 150, "output_tokens": 80}
}
```

**핵심 차이점 요약**:

| 항목 | OpenClaw | Olympus |
|------|----------|---------|
| CLI 모드 | `-p` (비대화형, 단발) | REPL (대화형, 상시) |
| 출력 형식 | `--output-format json` (구조화) | 터미널 UI (비구조화) |
| 출력 수집 | stdout 파이프 (확정적) | capture-pane 폴링 (확률적) |
| 파싱 | `JSON.parse()` (1줄) | regex 필터 180줄 (취약) |
| 세션 유지 | `--session-id` + `--resume` | tmux 세션 상시 유지 |
| 프로세스 모델 | 요청마다 spawn → 완료 → 종료 | 상시 실행 (REPL) |

### 2.3 진단 결론

> **Olympus의 텔레그램 응답 문제는 filterOutput 버그가 아니라, 터미널 스크래핑이라는 아키텍처 자체의 한계다.**
> 정규식을 아무리 정교하게 만들어도, CLI UI가 업데이트되면 깨진다.
> OpenClaw처럼 구조화 출력으로 전환해야 근본적으로 해결된다.

---

## 3. 아키텍처 비교

### 3.1 OpenClaw 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                  메시징 채널 (20+ 지원)                       │
│  Telegram(grammY) │ WhatsApp(Baileys) │ Discord(discord.js) │
│  Slack(Bolt) │ Signal │ iMessage │ WebChat │ ...             │
└──────────────────────────┬──────────────────────────────────┘
                           │ 메시지 수신/발신
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Gateway 단일 프로세스 (ws://127.0.0.1:18789)    │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ WS RPC   │ │ 세션관리  │ │ 채널매니저│ │ 플러그인  │      │
│  │ 라우터   │ │          │ │          │ │ 레지스트리│      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │     CLI Backend Runner (핵심)                     │      │
│  │                                                    │      │
│  │  runCliAgent() → spawn claude -p --json → parse  │      │
│  │  enqueueCliRun() → 직렬화 큐                      │      │
│  │  세션 ID 영속 → --session-id / --resume           │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                     │ WS RPC
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    CLI 클라이언트  Web UI     macOS/iOS 앱
```

**핵심**: Gateway가 Claude CLI를 **child_process로 실행**하고, **JSON stdout을 파싱**한다. tmux 없음.

### 3.2 Olympus 현재 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                  클라이언트 레이어                            │
│  Telegram Bot │ Web Dashboard │ TUI │ CLI                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket + REST
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Gateway (ws://127.0.0.1:18789)                  │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│  │ API/RPC  │ │ Channels │ │ Codex    │                   │
│  │ 라우터   │ │ 매니저   │ │ Adapter  │                   │
│  └──────────┘ └──────────┘ └──────────┘                   │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │     SessionManager (핵심 — 문제의 근원)            │      │
│  │                                                    │      │
│  │  sendInput() → tmux send-keys -l (입력)           │      │
│  │  startOutputPolling() → tmux capture-pane (출력)  │      │
│  │  filterOutput() → regex 180줄 (필터링)            │      │
│  │  broadcastSessionEvent() → WS 브로드캐스트         │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                     │ tmux IPC
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   main 세션     work-1 세션   work-2 세션
   (Codex CLI    (Claude CLI   (Claude CLI
    REPL 모드)    REPL 모드)    REPL 모드)
```

**핵심**: Gateway가 tmux를 통해 CLI와 통신한다. **입력은 send-keys, 출력은 capture-pane.**

### 3.3 핵심 차이 요약

| 차원 | OpenClaw | Olympus | 개선 방향 |
|------|----------|---------|----------|
| **CLI 실행 모델** | spawn → 완료 → exit (요청/응답) | 상시 REPL (tmux) | spawn 모델로 전환 |
| **출력 형식** | JSON (구조화) | 터미널 UI (비구조화) | JSON 전환 |
| **출력 수집** | stdout 파이프 | capture-pane 폴링 | stdout 파이프 |
| **필터링 필요** | 없음 (JSON이므로) | 180줄 regex | 제거 가능 |
| **세션 유지** | --session-id / --resume | tmux 세션 상시 | CLI 세션 메커니즘 활용 |
| **프로세스 수** | 요청 시만 1개 | 상시 N개 | 온디맨드 전환 |
| **tmux 의존** | 없음 | 전면 의존 | 선택적으로 축소 |

---

## 4. 통신 방식 비교

### 4.1 OpenClaw: 구조화 CLI 출력

#### 입력 전달

```typescript
// openclaw/src/agents/cli-runner.ts:236
const result = await runCommandWithTimeout(
  [backend.command, ...args],
  {
    timeoutMs: params.timeoutMs,  // 기본 600초
    cwd: workspaceDir,
    env,
    input: stdinPayload,  // stdin으로 프롬프트 전달 (긴 프롬프트)
  }
);
```

**프로세스 실행 인자** (Claude CLI 기본):
```bash
claude \
  -p \                              # 비대화형 모드 (pipe mode)
  --output-format json \            # JSON 출력
  --dangerously-skip-permissions \  # 권한 자동 승인
  --model opus \                    # 모델 선택
  --session-id abc123 \             # 세션 ID (대화 컨텍스트 유지)
  --append-system-prompt "..." \    # 시스템 프롬프트 추가
  "빌드해줘"                         # 사용자 프롬프트 (인자로)
```

**세션 재개 시**:
```bash
claude \
  -p \
  --output-format json \
  --dangerously-skip-permissions \
  --resume abc123-def456            # 이전 세션 재개
```

#### 출력 파싱

```typescript
// openclaw/src/agents/cli-runner/helpers.ts

function parseCliJson(raw: string, backend: CliBackendConfig): CliOutput | null {
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed);

  // 세션 ID 추출 (여러 필드명 시도)
  const sessionId = pickSessionId(parsed);
  // → session_id, sessionId, conversation_id, conversationId

  // 텍스트 추출 (OpenClaw은 여러 백엔드를 지원하므로 fallback 체인 사용)
  const text = collectText(parsed);
  // → parsed.message || parsed.content[].text || parsed.result
  // ※ Claude CLI -p --output-format json 에서는 parsed.result 만 사용

  // 사용량 추출
  const usage = toUsage(parsed.usage);
  // → input_tokens, output_tokens, cache_read_input_tokens

  return { text, sessionId, usage };
}
```

**실제 Claude CLI JSON 출력 예시** (2026-02-10 사전 검증으로 확인):
```json
{
  "result": "2",
  "session_id": "932c8b68-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "is_error": false,
  "total_cost_usd": 0.259269,
  "num_turns": 1,
  "duration_ms": 3195,
  "duration_api_ms": 2784,
  "usage": {
    "input_tokens": 3,
    "output_tokens": 5,
    "cache_creation_input_tokens": 41555,
    "cache_read_input_tokens": 0
  }
}
```

> **참고** (2026-02-10 검증): Claude CLI 2.1.38에서 `type`, `subtype` 필드가 **존재**한다 (예: `"type":"result","subtype":"success"`). 추가로 `modelUsage`, `permission_denials`, `uuid` 등도 포함된다. `parseClaudeJson()`은 필요한 필드(`result`, `session_id`, `usage` 등)만 추출하므로 추가 필드는 무시해도 무방하다.

**핵심**:
- 출력이 **JSON 한 객체**로 온다
- `result` 필드에 **순수 텍스트 응답**만 들어있다
- 터미널 UI 노이즈 없음 — 파싱 실패 불가능
- 세션 ID, 비용, 토큰 사용량 등 메타데이터까지 포함

#### 직렬화 큐

```typescript
// openclaw/src/agents/cli-runner/helpers.ts

const CLI_RUN_QUEUE = new Map<string, Promise<unknown>>();

export function enqueueCliRun<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prior = CLI_RUN_QUEUE.get(key) ?? Promise.resolve();
  const chained = prior.catch(() => undefined).then(task);
  CLI_RUN_QUEUE.set(key, chained);
  chained.finally(() => {
    if (CLI_RUN_QUEUE.get(key) === chained) {
      CLI_RUN_QUEUE.delete(key);
    }
  });
  return chained;
}
```

- `serialize: true` (기본) → 같은 백엔드(예: claude-cli)는 순차 실행
- 다른 백엔드(예: claude-cli + codex-cli)는 병렬 실행
- 큐 키: `backendId` (직렬화) 또는 `backendId:runId` (병렬)

### 4.2 Olympus: 터미널 스크래핑

#### 입력 전달

```typescript
// olympus/packages/gateway/src/session-manager.ts:540-570

private sendKeys(keys: string, tmuxTarget: string): boolean {
  // 텍스트 입력 (literal mode)
  execFileSync('tmux', ['send-keys', '-t', tmuxTarget, '-l', keys], {
    stdio: 'pipe',
  });

  // 0.1초 대기 (CLI TUI 입력 처리 시간)
  execFileSync('sleep', ['0.1'], { stdio: 'pipe' });

  // Enter 키
  execFileSync('tmux', ['send-keys', '-t', tmuxTarget, 'Enter'], {
    stdio: 'pipe',
  });

  return true;
}
```

**문제점**:
1. `sleep 0.1` — CLI가 0.1초 안에 입력을 처리하지 못하면? (CPU 부하 시)
2. 멀티바이트 문자(한글)가 tmux에서 깨질 수 있음
3. 특수 문자(`\n`, `\t`, 따옴표)가 의도치 않게 해석될 수 있음
4. CLI가 이전 명령을 아직 처리 중이면? → 명령이 큐잉되거나 무시됨

#### 출력 수집

```typescript
// olympus/packages/gateway/src/session-manager.ts:734-839

private startOutputPolling(sessionId: string): void {
  const poller = setInterval(() => {
    // 1. tmux capture-pane으로 화면 캡처
    const captured = execFileSync('tmux', [
      'capture-pane', '-t', target, '-p', '-S', '-50'
    ], { encoding: 'utf-8', timeout: 3000 });

    // 2. filterOutput으로 노이즈 제거 (180줄 regex)
    const filtered = this.filterOutput(captured);

    // 3. 이전 캡처와 비교
    const previousFiltered = this.filterOutput(previousCapture);
    if (filtered === previousFiltered) return;

    // 4. Set diff로 새 줄 추출
    const prevLines = new Set(previousFiltered.split('\n'));
    const newLines = currentLines.filter(l => !prevLines.has(l));

    // 5. 디바운스 + 스로틀 후 이벤트 발행
    // ...
  }, 500);
}
```

**문제점 상세**:

| 문제 | 설명 | OpenClaw에서는? |
|------|------|----------------|
| 폴링 간격 | 500ms — 빠른 출력 놓침 | 해당 없음 (프로세스 완료까지 대기) |
| 스크롤백 한계 | -S -50 (50줄) — 긴 출력 잘림 | 전체 stdout 수집 |
| regex 필터링 | 180줄 규칙 — 유지보수 어려움, 엣지케이스 | 불필요 (JSON) |
| Set diff | 같은 줄 반복 시 누락 | 불필요 |
| 디바운스 | 1초 대기 — 짧은 응답 지연 | 불필요 |
| 스로틀 | 2초 간격 — 연속 응답 병합 | 불필요 |
| ANSI 잔여 | 불완전한 스트립 | 해당 없음 |

### 4.3 비교 정량 분석

| 지표 | OpenClaw | Olympus |
|------|----------|---------|
| **응답 수집 코드량** | ~50줄 (parseCliJson) | ~400줄 (polling+filter+diff) |
| **응답 신뢰도** | 100% (JSON 파싱) | ~70-85% (추정, 필터 엣지케이스) |
| **응답 지연** | 0ms (프로세스 종료 즉시) | 1500-3500ms (폴링+디바운스+스로틀) |
| **프로세스 오버헤드** | spawn당 ~100ms | 상시 N개 프로세스 + 500ms 폴링 |
| **유지보수 비용** | 낮음 (JSON 스키마 변경 시만) | 높음 (CLI 업데이트마다 regex 수정) |
| **tmux 의존성** | 없음 | 전면 의존 (Windows 불가) |

---

## 5. 세션 관리 비교

### 5.1 OpenClaw 세션 관리

```
세션 생명주기:
1. 첫 요청: claude -p --session-id <새 UUID> "안녕" → 응답 + session_id 반환
2. 후속 요청: claude -p --resume <session_id> "다음 질문" → 컨텍스트 유지
3. 세션 리셋: 새 UUID 발급 → 이전 세션 아카이브

저장소:
~/.openclaw/sessions/<agent-id>.json  ← 세션 메타데이터 (JSON5)
  - provider별 cliSessionIds 맵
  - deliveryContext (마지막 채널 정보)
  - metadata (모델, 토큰, 비용, 타임스탬프)

캐시:
SESSION_STORE_CACHE = Map<string, { store, loadedAt, mtimeMs }>
TTL: 45초 (파일 mtime 변경 시 무효화)
```

**장점**:
- CLI 자체의 세션 메커니즘(`--session-id`, `--resume`) 활용
- 프로세스가 종료되어도 세션 컨텍스트 유지
- 파일 기반이므로 재시작 시에도 세션 복원
- 프로세스를 상시 유지할 필요 없음

### 5.2 Olympus 세션 관리

```
세션 생명주기:
1. olympus server start → createMainSession() → tmux new-session -d -s "main" codex ...
2. 텔레그램 메시지 → sendInput() → tmux send-keys → CLI가 REPL에서 처리
3. 세션 종료 → tmux kill-session

저장소:
Gateway SessionManager.store (인메모리 Map)
  - sessionId → { tmuxSession, tmuxWindow, status, lastActivity }

문제:
- 프로세스 종료 = 세션 소멸 (tmux 세션이 죽으면 끝)
- 재시작 시 세션 복원 불가 (새로 생성해야 함)
- 상시 프로세스 유지 필요 (리소스 소비)
```

**비교**:

| 항목 | OpenClaw | Olympus |
|------|----------|---------|
| 프로세스 모델 | 온디맨드 (요청 시만) | 상시 실행 (REPL) |
| 세션 영속성 | 파일 기반 (재시작 가능) | 인메모리 (재시작 시 소멸) |
| 세션 복원 | `--resume` 플래그 | 불가 (새 세션 생성) |
| 리소스 사용 | 요청 시만 CPU/메모리 | 상시 CPU/메모리 |
| 동시성 | 직렬화 큐 (같은 백엔드) | tmux 윈도우 기반 |
| 스케일링 | 백엔드당 큐 | tmux 세션당 1개 |

---

## 6. 텔레그램 통합 비교

### 6.1 OpenClaw 텔레그램

```typescript
// openclaw/src/telegram/bot.ts

// grammY 프레임워크 사용
const bot = new Bot(token, clientConfig);

// API 스로틀링 (Telegram rate limit 준수)
bot.api.config.use(apiThrottler());

// 채팅별 순차 처리 (동일 채팅 메시지를 직렬화)
bot.use(sequentialize(getTelegramSequentialKey));

// 메시지 처리 흐름
// 1. Telegram 메시지 수신
// 2. 채널 매니저에서 세션 키 해석
// 3. Gateway에 agent 요청 (RPC)
// 4. CLI 실행 → JSON 응답
// 5. 응답 텍스트를 Telegram으로 전송

// 중복 제거
const dedupe = createTelegramUpdateDedupe();
// → lastUpdateId 추적, 이전 ID 이하는 스킵
```

**핵심**: 텔레그램 메시지 → Gateway RPC → CLI 실행 → JSON 응답 → 텔레그램 응답. **단방향 파이프라인, 필터링 불필요.**

### 6.2 Olympus 텔레그램

```typescript
// olympus/packages/telegram-bot/src/index.ts

// Telegraf 프레임워크 사용
const bot = new Telegraf(token);

// 메시지 처리 흐름
// 1. Telegram 메시지 수신
// 2. sendToClaude() → POST /api/sessions/{id}/input (즉시 반환)
// 3. [비동기] Gateway SessionManager가 tmux send-keys
// 4. [비동기] 500ms 폴링으로 capture-pane
// 5. [비동기] filterOutput() → 180줄 regex 필터
// 6. [비동기] broadcastSessionEvent() → WebSocket
// 7. [비동기] Telegram Bot이 session:output 수신
// 8. [비동기] DigestSession으로 추가 필터링
// 9. [비동기] Telegram 전송

// 추가 레이어:
// - Digest 모드: 6개 카테고리 분류 (build/test/commit/error/phase/change)
// - 비밀 마스킹: API 키, Bearer 토큰, GitHub PAT, hex 문자열
// - 세션별 메시지 큐: 순서 보장
// - 4000자 분할: sendLongMessage()
```

**핵심 차이**:
- OpenClaw: **동기적 요청/응답** (RPC → CLI → JSON → 응답)
- Olympus: **비동기 이벤트 체인** (HTTP → tmux → 폴링 → 필터 → WS → 필터 → 전송)

| 항목 | OpenClaw | Olympus |
|------|----------|---------|
| 봇 프레임워크 | grammY | Telegraf |
| 메시지 흐름 | 동기 RPC (요청→응답) | 비동기 이벤트 체인 (7단계) |
| 필터링 | 없음 | 2단계 (filterOutput + Digest) |
| 응답 지연 | CLI 실행 시간만 | +1.5~3.5초 (폴링/디바운스) |
| 응답 신뢰도 | 100% | 불확실 |
| 코드 복잡도 | 단순 | 매우 복잡 (~500줄 추가 로직) |

---

## 7. 메모리/DB 비교

### 7.1 OpenClaw 메모리

```
SQLite + sqlite-vec + FTS 하이브리드

~/.openclaw/memory.db
  - 세션 히스토리
  - 벡터 임베딩 (sqlite-vec)
  - 전문 검색 (FTS5)

임베딩 프로바이더:
  - OpenAI (text-embedding-3-small)
  - Gemini
  - Voyage AI
  - 로컬 모델

세션 히스토리:
~/.openclaw/sessions/<agent-id>/<timestamp>_<uuid>.jsonl
  - 각 줄: {"type": "message", "message": {"role": "user/assistant", "content": "..."}}
```

**핵심**: 메모리가 **실제로 사용**됨. 임베딩 기반 유사 세션 검색, 컨텍스트 자동 주입.

### 7.2 Olympus 메모리

```
두 개의 Memory 시스템 — 둘 다 사실상 미사용

1. Gateway MemoryStore (gateway/src/memory/store.ts)
   - SQLite + FTS5
   - codex 모드(기본)에서 초기화 안 됨 (server.ts:114)
   - ~/.olympus/memory.db 파일 디스크에 존재하지 않음

2. Codex ContextManager (codex/src/context-manager.ts)
   - SQLite + FTS5 per-project shard
   - DB 파일 생성됨 (~/.olympus/global.db, ~/.olympus/projects/*/memory.db)
   - BUT saveTask() 호출자 0개 (프로덕션 코드에서)
   - 항상 빈 결과 반환
```

**현실**: Olympus의 메모리 시스템은 코드는 있지만 **데이터가 없다**. 상세 분석: `memory/memory-store-analysis.md`

---

## 8. 게이트웨이 프로토콜 비교

### 8.1 OpenClaw Gateway 프로토콜

```
WebSocket 텍스트 프레임 + JSON 페이로드

메시지 타입 3종:
  req:   { type: "req",   id, method, params }
  res:   { type: "res",   id, ok: true/false, payload/error }
  event: { type: "event", event, payload, seq?, stateVersion? }

핸드셰이크:
  1. 서버 → connect.challenge { nonce, timestamp }
  2. 클라이언트 → connect { role, scopes, device, auth.token }
  3. 서버 → hello-ok { version, policy: { tickIntervalMs: 15000 } }

Role 체계:
  - operator: 제어면 (CLI/UI/자동화)
  - node: 기능 호스트 (카메라/화면/실행)

Scope 체계:
  - operator.read / operator.write / operator.admin
  - operator.approvals / operator.pairing

신뢰성:
  - idempotency key (side-effect 메서드)
  - seq + stateVersion (상태 추적)
  - 이벤트 재전송 없음 (클라이언트 책임)
```

### 8.2 Olympus Gateway 프로토콜

```
WebSocket JSON 메시지 + REST API

메시지 타입:
  요청: { type: string, payload: unknown }
  응답: { type: string, payload: unknown }
  이벤트: { type: string, payload: unknown }

인증:
  - Bearer 토큰 (API key)
  - Nonce 핸드셰이크 (Phase 5.0 P2에서 구현)

REST 엔드포인트:
  POST /api/sessions/connect       → 세션 연결
  POST /api/sessions/:id/input     → 메시지 전송
  GET  /api/sessions               → 세션 목록
  GET  /api/health                 → 헬스 체크
  POST /api/codex/*                → Codex RPC

WebSocket 이벤트:
  session:output  → 세션 출력 (필터링됨)
  session:screen  → 터미널 스냅샷
  session:error   → 에러
  session:closed  → 세션 종료
```

### 8.3 비교

| 항목 | OpenClaw | Olympus |
|------|----------|---------|
| 프레임 구조 | 3타입 정형화 (req/res/event) | 자유 형식 |
| 핸드셰이크 | challenge-nonce → connect → hello-ok | 있음 (Nonce) |
| Role/Scope | operator/node + 5개 scope | 단순 인증 |
| idempotency | 필수 (send/agent) | 없음 |
| 이벤트 순서 | seq + stateVersion | 없음 |
| RPC 표면 | 40+ 메서드 | ~10개 엔드포인트 |

---

## 9. 목표 아키텍처 설계

### 9.1 비전

사용자의 원래 비전을 정리하면:

```
Codex CLI (메인세션) = 사용자 소통 창구, 미들웨어
  ↕
Claude CLI (워크세션) = 실제 작업 실행 (/orchestration 활용)
  ↕
Gateway = 텔레그램 연동, 대시보드 서빙, 세션/작업 관리
  ↕
로컬 DB = AI 에이전트 컨텍스트 유지
```

### 9.2 목표 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    클라이언트 레이어                          │
│  Telegram Bot │ Web Dashboard │ TUI │ CLI                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket + REST
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Gateway (ws://127.0.0.1:18789)                  │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ API/RPC  │ │ Channels │ │ Session  │ │ Memory   │      │
│  │ 라우터   │ │ 매니저   │ │ Store    │ │ (SQLite) │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │     CliRunner (NEW — OpenClaw 방식)               │      │
│  │                                                    │      │
│  │  runCli({provider:'codex'}) → spawn codex --json │      │
│  │  runCli({provider:'claude'}) → spawn claude -p --json│      │
│  │  CliRunQueue → 백엔드별 직렬화                     │      │
│  │  세션 ID 영속 → --session-id / --resume           │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │     TmuxSessionManager (LEGACY — 선택적 유지)     │      │
│  │                                                    │      │
│  │  Dashboard 터미널 미러용 (screen 이벤트만)        │      │
│  │  사용자가 직접 tmux attach 시 필요                 │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 핵심 변경 사항

#### (1) 새 CliRunner 모듈 (핵심)

OpenClaw의 `cli-runner.ts`를 참고하여 Olympus에 맞게 구현:

```typescript
// 새 파일: packages/gateway/src/cli-runner.ts

interface CliRunParams {
  provider: 'codex' | 'claude';
  model?: string;
  prompt: string;
  sessionId?: string;     // 이전 세션 재개
  workspaceDir: string;
  timeoutMs?: number;     // 기본 600초
  systemPrompt?: string;
}

interface CliRunResult {
  text: string;           // 응답 텍스트
  sessionId: string;      // 세션 ID (다음 요청에 사용)
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  cost?: number;
  durationMs: number;
}

async function runCli(params: CliRunParams): Promise<CliRunResult> {
  const args = buildArgs(params);
  const result = await runWithTimeout(
    [getCliCommand(params.provider), ...args],
    { timeoutMs: params.timeoutMs ?? 600_000, cwd: params.workspaceDir }
  );
  return parseOutput(result.stdout, params.provider);
}
```

#### (2) Codex CLI 비대화형 모드

현재 Codex CLI는 `exec` 서브커맨드로 비대화형 실행을 지원:

```bash
codex exec --json --color never --sandbox read-only \
  --model gpt-5.3-codex \
  "빌드해줘"
```

OpenClaw의 DEFAULT_CODEX_BACKEND 참고:
```typescript
const DEFAULT_CODEX_BACKEND = {
  command: "codex",
  args: ["exec", "--json", "--color", "never", "--sandbox", "read-only", "--skip-git-repo-check"],
  output: "jsonl",  // Codex는 JSONL 형식
  resumeArgs: ["exec", "resume", "{sessionId}", "--color", "never", ...],
  serialize: true,
};
```

#### (3) Claude CLI 비대화형 모드

현재 Claude CLI는 `-p` 플래그로 비대화형 실행 지원:

```bash
claude -p --output-format json --dangerously-skip-permissions \
  --model opus --session-id <id> \
  "빌드해줘"
```

**핵심 플래그**:
- `-p`: pipe mode (비대화형, stdin/stdout 사용)
- `--output-format json`: JSON 형식 출력
- `--session-id <id>`: 세션 컨텍스트 유지
- `--resume <id>`: 이전 세션 재개
- `--dangerously-skip-permissions`: 권한 자동 승인

#### (4) 두 CLI의 역할 분리

```
[사용자 메시지 "프로젝트 빌드해줘"]
  ↓
Gateway CliRunner:
  ↓
  Step 1: Codex CLI로 라우팅 결정 (메인세션 역할)
    codex exec --json "사용자가 '프로젝트 빌드해줘'라고 요청함.
                       어느 프로젝트의 빌드인지 판단하고,
                       적절한 명령을 생성해줘."
    → JSON 응답: { "action": "build", "project": "olympus", "command": "pnpm build" }
  ↓
  Step 2: Claude CLI로 실제 작업 실행 (워크세션 역할)
    claude -p --output-format json --session-id work-123 \
      "/orchestration 'olympus 프로젝트 빌드 실행: pnpm build'"
    → JSON 응답: { "result": "빌드 성공 (9/9 패키지)...", "session_id": "..." }
  ↓
  Step 3: 결과를 텔레그램으로 전송
    "빌드 성공 (9/9 패키지). 테스트 483개 통과."
```

#### (5) SessionStore 영속화

```typescript
// 새 파일: packages/gateway/src/session-store.ts

// OpenClaw의 file-based store를 참고하되, SQLite 사용 (기존 인프라 활용)

interface SessionRecord {
  sessionKey: string;
  provider: 'codex' | 'claude';
  cliSessionId: string;        // CLI에서 반환한 세션 ID
  metadata: {
    model: string;
    lastPrompt: string;
    lastResponse: string;
    totalTokens: number;
    totalCost: number;
    createdAt: number;
    updatedAt: number;
  };
}

class SessionStore {
  private db: Database;  // better-sqlite3

  async saveSession(record: SessionRecord): Promise<void> { ... }
  async getSession(sessionKey: string): Promise<SessionRecord | null> { ... }
  async resumeSession(sessionKey: string, prompt: string): Promise<CliRunResult> { ... }
}
```

### 9.4 데이터 흐름 (개선 후)

```
[텔레그램 메시지: "빌드해줘"]
  ↓
Telegram Bot:
  POST /api/cli/run
  body: { prompt: "빌드해줘", sessionKey: "telegram:123", provider: "claude" }
  ↓ (동기 응답 대기 — timeout 600초)

Gateway API Handler:
  1. SessionStore에서 세션 조회 (또는 새 세션 생성)
  2. CliRunner.runCli({
       provider: 'claude',
       prompt: "빌드해줘",
       sessionId: existingSessionId,  // 컨텍스트 유지
       workspaceDir: '/path/to/project',
     })
  ↓

CliRunner.runCli():
  1. buildArgs() → ['-p', '--output-format', 'json', '--session-id', '...', '빌드해줘']
  2. spawn('claude', args)
  3. 프로세스 완료 대기 (최대 600초)
  4. stdout 수집 → JSON.parse()
  5. return { text: "빌드 성공...", sessionId: "...", usage: {...} }
  ↓

Gateway API Handler:
  1. SessionStore에 세션 업데이트 (sessionId, metadata)
  2. MemoryStore에 작업 기록 저장 (saveTask)
  3. WebSocket 이벤트 브로드캐스트 (대시보드용)
  4. HTTP 응답 반환: { text: "빌드 성공...", sessionId: "..." }
  ↓

Telegram Bot:
  HTTP 응답 수신 → Telegram 메시지 전송
  "📩 빌드 성공 (9/9 패키지). 테스트 483개 통과."

✅ 끝. filterOutput 필요 없음. Digest 필요 없음. 폴링 필요 없음.
```

### 9.5 tmux의 역할 변경

**현재**: 모든 통신의 중심 (입력 + 출력 + 세션)
**변경 후**: 선택적 부가 기능 (대시보드 터미널 미러, 사용자 직접 접근)

```
tmux 유지하는 이유:
1. 대시보드에서 터미널 미러 표시 (session:screen 이벤트)
2. 사용자가 tmux attach로 직접 CLI 접근
3. /orchestration 같은 장시간 작업의 진행상황 모니터링
4. 디버깅/트러블슈팅 시 터미널 직접 확인

tmux 제거하는 부분:
1. 메시지 입력 (send-keys → spawn CLI)
2. 출력 수집 (capture-pane → stdout 파이프)
3. filterOutput (불필요)
4. 폴링 루프 (불필요)
```

---

## 10. 구현 계획

### Phase 1: CliRunner 모듈 (핵심) — **완료** (2026-02-10)

**목표**: OpenClaw 방식의 CLI 실행 모듈을 Gateway에 추가
**상태**: **구현 완료** — build 9/9, lint 6/6, test 356 (신규 27개 포함)

#### 1.1 구현 결과: `packages/gateway/src/cli-runner.ts` (368줄)

> 아래는 실제 구현된 코드의 핵심 구조. 계획 대비 변경 사항은 `[변경]` 주석 참고.

```typescript
import { spawn, type ChildProcess } from 'node:child_process';  // [변경] execFile → spawn (스트리밍+타임아웃 제어)
import type { ClaudeCliOutput, CliRunParams, CliRunResult, CliBackendConfig, CliProvider, CliErrorType } from '@olympus-dev/protocol';

// [변경] 백엔드 설정을 단순화: 플래그명만 저장, 템플릿 대신 조건부 push
const CLAUDE_BACKEND = {
  name: 'claude',
  command: 'claude',
  baseArgs: ['-p', '--output-format', 'json'],  // [변경] skip-permissions는 옵션으로 분리
  resumeFlag: '--resume',
  sessionIdFlag: '--session-id',
  modelFlag: '--model',
  systemPromptFlag: '--append-system-prompt',
  skipPermissionsFlag: '--dangerously-skip-permissions',
};

// [변경] Codex 백엔드도 동일 구조
const CODEX_BACKEND = {
  name: 'codex',
  command: 'codex',
  baseArgs: ['--quiet', '--json'],
  resumeFlag: '--session',
  sessionIdFlag: '--session',
  modelFlag: '--model',
  systemPromptFlag: '--instructions',
  skipPermissionsFlag: '--full-auto',
};

// 직렬화 큐 (OpenClaw enqueueCliRun 패턴, 메모리 누수 방지 tracked 추가)
export function enqueueCliRun<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prior = CLI_RUN_QUEUE.get(key) ?? Promise.resolve();
  const chained = prior.catch(() => undefined).then(task);
  const tracked = chained.finally(() => {  // [변경] tracked로 cleanup 분리
    if (CLI_RUN_QUEUE.get(key) === tracked) CLI_RUN_QUEUE.delete(key);
  });
  CLI_RUN_QUEUE.set(key, tracked);
  return chained;
}

// [변경] buildCliArgs: 플래그명 기반 조건부 push (템플릿 대체 없음)
export function buildCliArgs(params: CliRunParams, backend: CliBackendConfig): string[] {
  const args = [...backend.baseArgs];
  if (params.sessionId) {
    args.push(params.resumeSession ? backend.resumeFlag : backend.sessionIdFlag, params.sessionId);
  }
  if (params.model) args.push(backend.modelFlag, params.model);
  if (params.systemPrompt) args.push(backend.systemPromptFlag, params.systemPrompt);
  if (params.dangerouslySkipPermissions) args.push(backend.skipPermissionsFlag);
  if (params.allowedTools?.length) args.push('--allowedTools', params.allowedTools.join(' '));
  args.push(params.prompt);  // 마지막 인자
  return args;
}

// [변경] parseClaudeJson: result 필드 직접 사용 (content[] fallback 불필요)
export function parseClaudeJson(stdout: string): ClaudeCliOutput {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('Empty stdout from CLI');
  const parsed = JSON.parse(trimmed);
  const usage = parsed.usage as Record<string, unknown> | undefined;
  return {
    result: String(parsed.result ?? ''),
    session_id: String(parsed.session_id ?? ''),
    is_error: Boolean(parsed.is_error),
    total_cost_usd: Number(parsed.total_cost_usd ?? 0),
    num_turns: Number(parsed.num_turns ?? 0),
    duration_ms: Number(parsed.duration_ms ?? 0),
    duration_api_ms: Number(parsed.duration_api_ms ?? 0),
    usage: {
      input_tokens: Number(usage?.input_tokens ?? 0),
      output_tokens: Number(usage?.output_tokens ?? 0),
      cache_creation_input_tokens: usage?.cache_creation_input_tokens != null
        ? Number(usage.cache_creation_input_tokens) : undefined,
      cache_read_input_tokens: usage?.cache_read_input_tokens != null
        ? Number(usage.cache_read_input_tokens) : undefined,
    },
  };
}

// [변경] classifyError: exit code + stderr 기반 에러 분류 (8개 타입)
export function classifyError(exitCode: number | null, stderr: string, timedOut: boolean): CliErrorType {
  if (timedOut) return 'timeout';
  const lower = stderr.toLowerCase();
  if (lower.includes('session') && lower.includes('not found')) return 'session_not_found';
  if (lower.includes('permission') || lower.includes('unauthorized')) return 'permission_denied';
  if (lower.includes('rate limit') || lower.includes('overloaded') || lower.includes('429')) return 'api_error';
  if (exitCode === 127 || lower.includes('enoent') || lower.includes('command not found')) return 'spawn_error';
  if (exitCode === 137 || exitCode === 143) return 'killed';
  return 'unknown';
}

// [변경] spawnCli: spawn 기반, SIGTERM→10초 후 SIGKILL 에스컬레이션, settlement guard
// buildSafeEnv(): OPENAI_API_KEY, ANTHROPIC_API_KEY, OLYMPUS_AGENT_API_KEY 제거 + CLAUDE_NO_TELEMETRY=1
// spawn() → stdout/stderr 수집 → close/error 이벤트 → settlement guard → SIGTERM→10s→SIGKILL

// 메인 실행 함수
export async function runCli(params: CliRunParams): Promise<CliRunResult> {
  const provider = params.provider ?? 'claude';
  const backend = BACKENDS[provider];
  if (!backend) return makeErrorResult({ type: 'spawn_error', message: `Unknown provider: ${provider}` }, 0);

  return enqueueCliRun(provider, async () => {
    const startTime = Date.now();
    const { exitCode, stdout, stderr, timedOut } = await spawnCli(backend.command, args, { cwd, timeoutMs });
    const wallDuration = Date.now() - startTime;

    if (timedOut || exitCode !== 0) {
      // 에러 시에도 부분 JSON 파싱 시도 (partialText, partialSessionId)
      return makeErrorResult({ type: classifyError(exitCode, stderr, timedOut), ... }, wallDuration);
    }
    const output = backend.parseOutput(stdout);
    return { success: !output.is_error, text: output.result, sessionId: output.session_id,
             usage: { inputTokens: ..., outputTokens: ... }, cost: output.total_cost_usd, ... };
  });
}
```

**계획 대비 주요 변경점**:

| 항목 | 계획 | 실제 구현 | 이유 |
|------|------|----------|------|
| 프로세스 실행 | `execFile` (promisified) | `spawn` | 스트리밍 stdout/stderr 수집, SIGTERM→SIGKILL 에스컬레이션 |
| 백엔드 설정 | `resumeArgs` 배열 + `{sessionId}` 템플릿 | 플래그명만 저장, 조건부 push | 단순하고 확장 용이 |
| skip-permissions | `baseArgs`에 포함 | 별도 `skipPermissionsFlag` 옵션 | 선택적 적용 필요 |
| 파싱 | `collectText()` fallback 체인 | `parsed.result` 직접 사용 | 사전 검증에서 `result` 필드 확인 |
| 에러 처리 | 없음 | `classifyError()` 8개 타입 분류 | exit code 1 + stderr text 패턴 |
| 환경 변수 | `...process.env` 그대로 | `buildSafeEnv()` API 키 제거 | 보안 (ClaudeCliWorker 패턴) |
| 타입 정의 | gateway 내부 | `protocol/src/cli-runner.ts` 10개 타입 | 크로스 패키지 재사용 |

#### 1.2 구현 결과: `packages/gateway/src/cli-session-store.ts` (167줄)

```typescript
// better-sqlite3 dynamic import (MemoryStore 패턴 동일)
// [변경] 토큰/비용 누적: ON CONFLICT DO UPDATE SET total += excluded.total

export class CliSessionStore {
  private db: Database.Database | null = null;  // [변경] null 가능 (fallback)

  async initialize(): Promise<void> {
    // dynamic import: better-sqlite3 없으면 null fallback
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cli_sessions (
        key TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'claude',
        cli_session_id TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        last_prompt TEXT NOT NULL DEFAULT '',
        last_response TEXT NOT NULL DEFAULT '',
        total_input_tokens INTEGER NOT NULL DEFAULT 0,   -- [변경] input/output 분리
        total_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_cost_usd REAL NOT NULL DEFAULT 0,
        turn_count INTEGER NOT NULL DEFAULT 0,           -- [변경] 턴 카운트 추가
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  save(record): void {
    // [변경] ON CONFLICT DO UPDATE — 토큰/비용/턴을 누적 (+=)
    // → 세션의 전체 사용량 추적
  }
  get(key): CliSessionRecord | null { ... }
  getByCliSessionId(cliSessionId): CliSessionRecord | null { ... }
  list(provider?, limit?): CliSessionRecord[] { ... }
  delete(key): boolean { ... }
  close(): void { ... }
}
```

**계획 대비 주요 변경점**:
- `tokenCount` 단일 필드 → `total_input_tokens` + `total_output_tokens` 분리
- `turn_count` 필드 추가 (대화 턴 수 추적)
- `ON CONFLICT` 시 **누적** 갱신 (기존 토큰 + 새 토큰)
- `getByCliSessionId()` 메서드 추가 (세션 ID로 역조회)
- DB 경로: `~/.olympus/cli-sessions.db` (계획의 `sessions.db`에서 변경)

#### 1.3 구현 결과: API 엔드포인트 3개

> [변경] 엔드포인트 경로: `/api/agent` → `/api/cli/run` (명확한 네이밍)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/cli/run` | 동기 CLI 실행 (prompt → runCli → JSON 응답) |
| GET | `/api/cli/sessions` | 저장된 CLI 세션 목록 (?provider=claude&limit=50) |
| DELETE | `/api/cli/sessions/:id` | CLI 세션 삭제 |

```typescript
// POST /api/cli/run — 실제 구현 핵심 흐름
if (path === '/api/cli/run' && method === 'POST') {
  // 1. sessionKey → 저장소 조회 → cliSessionId 복원 → resumeSession=true
  if (body.sessionKey && cliSessionStore) {
    const existing = cliSessionStore.get(body.sessionKey);
    if (existing) { params.sessionId = existing.cliSessionId; params.resumeSession = true; }
  }
  // 2. runCli(params)
  const result = await runCli(params);
  // 3. 세션 영속화 (토큰/비용 누적)
  if (result.sessionId && body.sessionKey) cliSessionStore.save({...});
  // 4. WebSocket 브로드캐스트
  onCliComplete?.(result);  // → broadcastToAll('cli:complete', result)
  // 5. 응답
  sendJson(res, 200, { result });
}
```

**server.ts 변경**: CliSessionStore 초기화 + createApiHandler에 `cliSessionStore`, `onCliComplete` 전달

### Phase 2: 텔레그램 봇 단순화 (3일)

**목표**: 비동기 이벤트 체인 → 동기 HTTP 요청/응답

#### 2.1 텔레그램 메시지 핸들러 변경

```typescript
// packages/telegram-bot/src/index.ts — 변경

// 기존 (비동기 7단계):
// bot.on('text') → sendToClaude(POST /input) → ... → WS event → digest → send

// 변경 (동기 2단계):
this.bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const chatId = ctx.chat.id;

  // 타이핑 표시
  await ctx.sendChatAction('typing');

  try {
    // 동기 API 호출 (응답까지 대기)
    const response = await fetch(`${this.config.gatewayUrl}/api/cli/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        prompt: text,
        sessionKey: `telegram:${chatId}`,
        provider: 'claude',
      }),
      signal: AbortSignal.timeout(600_000), // 10분 타임아웃
    });

    const { result } = await response.json() as { result: CliRunResult };

    // 응답 전송 (단순!)
    if (!result.success) {
      await ctx.reply(`❌ ${result.error?.type}: ${result.error?.message}`);
      return;
    }

    const footer = result.usage
      ? `\n\n📊 ${result.usage.inputTokens + result.usage.outputTokens} 토큰 | $${result.cost?.toFixed(4)} | ${result.durationMs}ms`
      : '';

    await this.sendLongMessage(chatId, `${result.text}${footer}`);

  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      await ctx.reply('⏰ 응답 시간 초과 (10분)');
    } else {
      await ctx.reply(`❌ 오류: ${(err as Error).message}`);
    }
  }
});
```

#### 2.2 제거 가능한 코드

| 현재 코드 | 줄 수 | 이유 |
|-----------|-------|------|
| `filterOutput()` | ~180줄 | JSON 출력이므로 불필요 |
| `startOutputPolling()` | ~110줄 | stdout 파이프이므로 불필요 |
| `DigestSession` | ~200줄 | 응답이 구조화되어 있으므로 불필요 |
| `handleWebSocketMessage('session:output')` | ~70줄 | 직접 HTTP 응답이므로 불필요 |
| Digest 모듈 전체 | ~400줄 | 노이즈가 없으므로 불필요 |
| **합계** | **~960줄** | **제거 가능** (11.3절 상세 분석: ~710줄) |

### Phase 3: 메모리 활성화 (3일)

**목표**: CliRunner 응답을 MemoryStore에 자동 저장

#### 3.1 saveTask 호출 추가

```typescript
// POST /api/cli/run 핸들러에서 (Phase 1의 API)

// CLI 실행 후:
const result = await runCli(params);

// 메모리에 저장 (현재 누락된 부분!)
if (memoryStore) {
  await memoryStore.saveTask({
    prompt: params.prompt,
    response: result.text,
    model: params.model ?? 'opus',
    provider: params.provider,
    tokenCount: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
    durationMs: result.durationMs,
    timestamp: Date.now(),
  });
}
```

#### 3.2 MemoryStore 초기화 수정

```typescript
// packages/gateway/src/server.ts:114 — 현재:
if (this.mode !== 'codex') {
  this.memoryStore = new MemoryStore(v2Config.memory);
}

// 변경: codex 모드에서도 초기화
this.memoryStore = new MemoryStore(v2Config.memory);
```

### Phase 4: tmux 역할 재정의 (3일)

**목표**: tmux를 선택적 부가 기능으로 전환

#### 4.1 createMainSession 변경

```typescript
// packages/cli/src/commands/server.ts

// 현재: tmux 세션 생성 → CLI REPL 시작 → waitForCliReady
// 변경: tmux 세션은 선택적 (대시보드 미러 + 사용자 직접 접근용)

async function createMainSession(config, projectRoot) {
  // tmux 세션은 여전히 생성 (대시보드 터미널 미러용)
  // 하지만 통신은 CliRunner를 통해 (spawn 방식)

  // tmux 세션 생성 (선택적)
  if (hasTmux()) {
    execSync(`tmux new-session -d -s "main" -c "${projectRoot}" ${agentPath}${trustFlag}`);
    console.log('   tmux 세션 생성됨 (대시보드 터미널 미러용)');
  }

  // CliRunner 초기화 (핵심 통신)
  const cliRunner = new CliRunner({
    defaultProvider: 'claude',
    defaultModel: 'opus',
    workspaceDir: projectRoot,
    sessionStore: new CliSessionStore(`${homeDir}/.olympus/sessions.db`),
  });

  return cliRunner;
}
```

#### 4.2 SessionManager 리팩토링

```
현재 SessionManager 책임:
1. tmux 세션 생성/관리        → 유지 (대시보드용)
2. sendInput (tmux send-keys)  → CliRunner로 이관
3. startOutputPolling          → 대시보드 screen 이벤트만 유지
4. filterOutput               → 제거
5. broadcastSessionEvent       → CliRunner 이벤트로 대체

변경 후 SessionManager 책임:
1. tmux 세션 생성/관리 (선택적)
2. startScreenPolling (대시보드 터미널 미러만)
3. broadcastScreenEvent (screen 이벤트만)
```

### Phase 5: 대시보드 업데이트 (2일)

**목표**: 새 통신 방식에 맞게 대시보드 UI 업데이트

#### 5.1 새 이벤트 타입

```typescript
// protocol/src/events.ts

// 기존
type SessionEvent =
  | { type: 'output'; content: string }  // filterOutput 결과
  | { type: 'screen'; content: string }  // 터미널 스냅샷
  | { type: 'error'; error: string }
  | { type: 'closed' };

// 추가
type AgentEvent =
  | { type: 'agent:start'; sessionKey: string; prompt: string }
  | { type: 'agent:complete'; sessionKey: string; text: string; usage?: Usage; durationMs: number }
  | { type: 'agent:error'; sessionKey: string; error: string }
  | { type: 'agent:progress'; sessionKey: string; status: string };  // 장시간 작업용
```

#### 5.2 대시보드 컴포넌트

```
새/변경 컴포넌트:
- AgentHistoryPanel: CLI 세션 이력 표시 (프롬프트 → 응답 쌍)
- SessionCostTracker: 토큰/비용 실시간 추적
- TerminalMirror: tmux screen 이벤트 (기존 유지)
```

### Phase 6: /orchestration 통합 (3일)

**목표**: Claude CLI의 `/orchestration` 명령을 CliRunner에서 활용

#### 6.1 장시간 작업 지원

`/orchestration`은 Claude CLI 내에서 실행되는 10단계 워크플로우로, 수 분~수십 분이 소요될 수 있다.

**방식 A: 폴링 기반**
```bash
# 비대화형으로 /orchestration 실행
claude -p --output-format json --session-id orch-123 \
  "/orchestration '카트 기능 구현'"
```
- 프로세스가 완료될 때까지 대기 (최대 30분)
- 완료 시 JSON 응답 반환
- **문제**: HTTP 연결이 30분간 열려 있어야 함

**방식 B: 비동기 + 상태 폴링**
```
1. POST /api/cli/run/async → 작업 ID 반환
2. GET /api/cli/run/{id}/status → 진행 상태 조회
3. GET /api/cli/run/{id}/result → 완료 시 결과 조회
4. WebSocket 'agent:progress' 이벤트로 실시간 알림
```

**권장: 방식 B**

```typescript
// 비동기 실행 API
app.post('/api/cli/run/async', async (req, res) => {
  const taskId = randomUUID();

  // 백그라운드에서 CLI 실행
  runCli(params).then(result => {
    taskResults.set(taskId, result);
    broadcastEvent('agent:complete', { taskId, ...result });
  }).catch(err => {
    taskErrors.set(taskId, err.message);
    broadcastEvent('agent:error', { taskId, error: err.message });
  });

  // 즉시 taskId 반환
  res.json({ taskId, status: 'running' });
});

// 상태 조회 API
app.get('/api/cli/run/:id/status', (req, res) => {
  const taskId = req.params.id;
  if (taskResults.has(taskId)) {
    res.json({ status: 'completed', result: taskResults.get(taskId) });
  } else if (taskErrors.has(taskId)) {
    res.json({ status: 'failed', error: taskErrors.get(taskId) });
  } else {
    res.json({ status: 'running' });
  }
});
```

#### 6.2 텔레그램에서 /orchestration

```typescript
// 텔레그램 명령어 핸들러
this.bot.command('orchestration', async (ctx) => {
  const args = ctx.message.text.replace('/orchestration', '').trim();

  await ctx.reply(`🔄 오케스트레이션 시작: ${args}`);

  // 비동기 실행
  const { taskId } = await fetch(`${gatewayUrl}/api/cli/run/async`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: `/orchestration "${args}"`,
      sessionKey: `orch:${ctx.chat.id}`,
      provider: 'claude',
    }),
  }).then(r => r.json());

  // 주기적 상태 체크
  const checker = setInterval(async () => {
    const status = await fetch(`${gatewayUrl}/api/cli/run/${taskId}/status`).then(r => r.json());

    if (status.status === 'completed') {
      clearInterval(checker);
      await this.sendLongMessage(ctx.chat.id, `✅ 완료\n\n${status.result.text}`);
    } else if (status.status === 'failed') {
      clearInterval(checker);
      await ctx.reply(`❌ 실패: ${status.error}`);
    }
    // running 상태면 계속 대기
  }, 10_000); // 10초마다 체크

  // 30분 타임아웃
  setTimeout(() => {
    clearInterval(checker);
    ctx.reply('⏰ 오케스트레이션 타임아웃 (30분)');
  }, 30 * 60 * 1000);
});
```

---

## 11. 파일별 변경 명세

### 11.1 새 파일

| 파일 | 패키지 | 설명 | 줄 수 | 상태 |
|------|--------|------|-------|------|
| `protocol/src/cli-runner.ts` | protocol | 10개 타입 정의 | 129줄 | **완료** |
| `gateway/src/cli-runner.ts` | gateway | CLI 실행 모듈 (핵심) | 368줄 | **완료** |
| `gateway/src/cli-session-store.ts` | gateway | CLI 세션 영속 저장소 | 167줄 | **완료** |
| `gateway/src/__tests__/cli-runner.test.ts` | gateway | 27개 테스트 (통합) | 491줄 | **완료** |

### 11.2 주요 변경 파일

| 파일 | 변경 내용 | 규모 | 상태 |
|------|----------|------|------|
| `protocol/src/index.ts` | CLI Runner 타입 10개 export 추가 | +14줄 | **완료** |
| `gateway/src/api.ts` | POST /api/cli/run, GET/DELETE /api/cli/sessions 추가 | +120줄 | **완료** |
| `gateway/src/server.ts` | CliSessionStore 초기화, cli:complete broadcast | +15줄 | **완료** |
| `gateway/src/index.ts` | runCli, CliSessionStore export 추가 | +2줄 | **완료** |
| `telegram-bot/src/index.ts` | 메시지 핸들러 동기화, WS 이벤트 의존성 제거 | ~200줄 변경 | Phase 2 |
| `cli/src/commands/server.ts` | createMainSession CliRunner 연동 | ~50줄 변경 | Phase 4 |

### 11.3 제거 가능한 코드

| 파일 | 제거 대상 | 줄 수 |
|------|----------|-------|
| `gateway/src/session-manager.ts` | filterOutput() | ~180줄 |
| `gateway/src/session-manager.ts` | startOutputPolling() 출력 부분 | ~60줄 |
| `telegram-bot/src/index.ts` | handleWebSocketMessage session:output 로직 | ~70줄 |
| `telegram-bot/src/digest/` | 전체 모듈 | ~400줄 |
| **합계** | | **~710줄 제거 가능** |

### 11.4 변경 없는 파일

| 파일 | 이유 |
|------|------|
| `web/` | 대시보드 — Phase 5에서 변경, 기본 구조 유지 |
| `client/` | WebSocket 클라이언트 — 새 이벤트 타입만 추가 |
| `core/` | 오케스트레이션 코어 — 변경 불필요 |
| `codex/` | Codex Orchestrator — 대부분 유지 |
| `tui/` | TUI — 변경 불필요 |

---

## 12. 리스크 분석

### 12.1 기술적 리스크

| 리스크 | 심각도 | 확률 | 대응 |
|--------|--------|------|------|
| Claude CLI `-p` 모드에서 `/orchestration` 지원 여부 | 높음 | 중간 | 사전 테스트 필수 — `-p` 모드에서 슬래시 명령 사용 가능 확인 |
| Codex CLI `exec --json` 세션 재개 지원 여부 | 중간 | 중간 | OpenClaw의 `resumeArgs` 참고, 실제 테스트 |
| 장시간 작업(30분+)의 HTTP 타임아웃 | 중간 | 높음 | 비동기 API + 상태 폴링으로 해결 |
| CLI 프로세스 좀비화 | 낮음 | 중간 | OpenClaw의 `cleanupSuspendedCliProcesses` 참고 |
| 기존 tmux 기반 기능 호환성 깨짐 | 중간 | 높음 | 점진적 마이그레이션, tmux 레이어 유지 |

### 12.2 가장 먼저 검증해야 할 것

**사전 테스트 (구현 전)**:

```bash
# 1. Claude CLI -p 모드에서 JSON 출력 확인
claude -p --output-format json "안녕"
# → JSON 응답이 나오는지 확인

# 2. 세션 유지 확인
claude -p --output-format json --session-id test-123 "1+1은?"
# → session_id가 응답에 포함되는지 확인

claude -p --output-format json --resume test-123 "아까 답이 뭐였지?"
# → 이전 대화 컨텍스트가 유지되는지 확인

# 3. /orchestration 같은 슬래시 명령 지원 확인
claude -p --output-format json '/orchestration "간단한 테스트"'
# → 슬래시 명령이 처리되는지, 아니면 일반 텍스트로 취급되는지

# 4. Codex CLI exec 모드 확인
codex exec --json "안녕"
# → JSON/JSONL 출력 확인

# 5. 장시간 작업 타임아웃
claude -p --output-format json "100줄짜리 함수를 작성해줘"
# → 60초+ 작업이 정상 완료되는지
```

### 12.3 호환성 리스크

| 기존 기능 | 영향 | 대응 |
|----------|------|------|
| `olympus start` (tmux 세션) | 유지 | tmux는 선택적으로 유지 |
| 대시보드 터미널 미러 | 유지 | screen 폴링은 유지 |
| `/use direct <session>` | 변경 | CliRunner 세션으로 대체 |
| `/mode raw\|digest` | 제거 가능 | JSON 응답이므로 불필요 |
| `/last` (마지막 출력) | 변경 | SessionStore에서 조회 |
| `/codex <question>` | 유지 | CliRunner로 라우팅 |

---

## 13. 검증 계획

### 13.1 단위 테스트 — **27개 통과** (2026-02-10)

```
packages/gateway/src/__tests__/cli-runner.test.ts (단일 파일, 27개 테스트)

parseClaudeJson (6개):
  ✓ 정상 전체 JSON 파싱 (result, session_id, usage, cost 등)
  ✓ 최소 필드 + 기본값 처리
  ✓ 빈 stdout → 에러
  ✓ 잘못된 JSON → 에러
  ✓ is_error=true 파싱
  ✓ usage 부분 누락 시 graceful 처리

buildCliArgs (5개):
  ✓ 기본 인자 (baseArgs + prompt)
  ✓ --resume 플래그 (resumeSession=true)
  ✓ --session-id 플래그 (resumeSession=false)
  ✓ --model + --append-system-prompt
  ✓ --dangerously-skip-permissions + --allowedTools

classifyError (7개):
  ✓ timeout
  ✓ session_not_found (stderr "Session not found")
  ✓ permission_denied (stderr "Permission" / "Unauthorized")
  ✓ api_error (stderr "Rate limit" / "overloaded" / "429")
  ✓ spawn_error (exit 127 / "ENOENT" / "command not found")
  ✓ killed (exit 137/143)
  ✓ unknown (매칭 안 되는 에러)

enqueueCliRun (3개):
  ✓ 같은 키 직렬화 보장
  ✓ 다른 키 병렬 실행
  ✓ 이전 실패 후 체인 유지

runCli (1개):
  ✓ unknown provider → spawn_error
  ※ ESM에서 vi.spyOn(cp, 'spawn') 불가 → 순수 함수 테스트 집중

CliSessionStore (5개):
  ✓ DB 없이 graceful fallback
  ✓ save + get 저장/조회
  ✓ 토큰/비용 누적 (ON CONFLICT)
  ✓ list + provider 필터
  ✓ delete + 존재하지 않는 키
```

### 13.2 통합 테스트

```
packages/gateway/src/__tests__/cli-runner-integration.test.ts
  ✓ 텔레그램 메시지 → POST /api/cli/run → CLI 실행 → 응답
  ✓ 세션 유지: 첫 요청 → 두 번째 요청 (컨텍스트 유지)
  ✓ 타임아웃: 600초 초과 시 에러 응답
  ✓ 동시 요청: 같은 백엔드 직렬화 확인
  ✓ 비동기 API: POST /api/cli/run/async → GET /status → 결과
  ✓ WebSocket 이벤트: agent:complete 브로드캐스트
  ✓ MemoryStore: 작업 결과 자동 저장
```

### 13.3 E2E 테스트

```
1. 텔레그램 → Gateway → Claude CLI → 텔레그램 응답 (전체 파이프라인)
2. /orchestration 명령 비동기 실행 → 진행 알림 → 완료 알림
3. 대시보드에서 세션 이력 표시
4. 세션 재개: 이전 대화 컨텍스트 유지 확인
5. CLI 프로세스 실패 시 에러 전파 확인
```

---

## 부록 A: OpenClaw 핵심 코드 참조

### A.1 CLI 백엔드 설정 (cli-backends.ts)

```typescript
// /Users/jobc/dev/openclaw/src/agents/cli-backends.ts:30-53

const DEFAULT_CLAUDE_BACKEND: CliBackendConfig = {
  command: "claude",
  args: ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
  resumeArgs: [
    "-p", "--output-format", "json", "--dangerously-skip-permissions",
    "--resume", "{sessionId}",
  ],
  output: "json",
  input: "arg",
  modelArg: "--model",
  modelAliases: CLAUDE_MODEL_ALIASES,
  sessionArg: "--session-id",
  sessionMode: "always",
  sessionIdFields: ["session_id", "sessionId", "conversation_id", "conversationId"],
  systemPromptArg: "--append-system-prompt",
  systemPromptMode: "append",
  systemPromptWhen: "first",
  clearEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY_OLD"],
  serialize: true,
};

const DEFAULT_CODEX_BACKEND: CliBackendConfig = {
  command: "codex",
  args: ["exec", "--json", "--color", "never", "--sandbox", "read-only", "--skip-git-repo-check"],
  resumeArgs: [
    "exec", "resume", "{sessionId}",
    "--color", "never", "--sandbox", "read-only", "--skip-git-repo-check",
  ],
  output: "jsonl",
  resumeOutput: "text",
  input: "arg",
  modelArg: "--model",
  sessionIdFields: ["thread_id"],
  sessionMode: "existing",
  imageArg: "--image",
  imageMode: "repeat",
  serialize: true,
};
```

### A.2 CLI 실행 (cli-runner.ts)

```typescript
// /Users/jobc/dev/openclaw/src/agents/cli-runner.ts:236-286

// 핵심 실행 부분
const result = await runCommandWithTimeout([backend.command, ...args], {
  timeoutMs: params.timeoutMs,
  cwd: workspaceDir,
  env,
  input: stdinPayload,
});

const stdout = result.stdout.trim();
const stderr = result.stderr.trim();

if (result.code !== 0) {
  const err = stderr || stdout || "CLI failed.";
  const reason = classifyFailoverReason(err) ?? "unknown";
  const status = resolveFailoverStatus(reason);
  throw new FailoverError(err, { reason, provider: params.provider, model: modelId, status });
}

const outputMode = useResume ? (backend.resumeOutput ?? backend.output) : backend.output;

if (outputMode === "text") {
  return { text: stdout, sessionId: undefined };
}
if (outputMode === "jsonl") {
  return parseCliJsonl(stdout, backend) ?? { text: stdout };
}
return parseCliJson(stdout, backend) ?? { text: stdout };
```

### A.3 직렬화 큐 (helpers.ts)

```typescript
// /Users/jobc/dev/openclaw/src/agents/cli-runner/helpers.ts

const CLI_RUN_QUEUE = new Map<string, Promise<unknown>>();

export function enqueueCliRun<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prior = CLI_RUN_QUEUE.get(key) ?? Promise.resolve();
  const chained = prior.catch(() => undefined).then(task);
  CLI_RUN_QUEUE.set(key, chained);
  chained.finally(() => {
    if (CLI_RUN_QUEUE.get(key) === chained) {
      CLI_RUN_QUEUE.delete(key);
    }
  });
  return chained;
}
```

---

## 부록 B: Olympus 현재 문제 코드 참조

### B.1 sendInput (tmux send-keys)

```typescript
// /Users/jobc/dev/olympus/packages/gateway/src/session-manager.ts:540-570

private sendKeys(keys: string, tmuxTarget: string, sessionId?: string): boolean {
  execFileSync('tmux', ['send-keys', '-t', tmuxTarget, '-l', keys], { stdio: 'pipe' });
  execFileSync('sleep', ['0.1'], { stdio: 'pipe' });
  execFileSync('tmux', ['send-keys', '-t', tmuxTarget, 'Enter'], { stdio: 'pipe' });
  return true;
}
```

### B.2 startOutputPolling (capture-pane 폴링)

```typescript
// /Users/jobc/dev/olympus/packages/gateway/src/session-manager.ts:734-839

private startOutputPolling(sessionId: string): void {
  const poller = setInterval(() => {
    const captured = execFileSync('tmux', ['capture-pane', '-t', target, '-p', '-S', '-50'], ...);
    const filtered = this.filterOutput(captured);  // ← 180줄 regex 필터
    const previousFiltered = this.filterOutput(previousCapture);
    const newLines = currentLines.filter(l => !prevLines.has(l));  // ← Set diff
    // ... 디바운스/스로틀 ...
    this.onSessionEvent?.(sessionId, { type: 'output', content: capturedNewContent });
  }, 500);
}
```

### B.3 createMainSession (tmux 세션 생성)

```typescript
// /Users/jobc/dev/olympus/packages/cli/src/commands/server.ts:731-736

execSync(
  `tmux new-session -d -s "${MAIN_SESSION}" -c "${resolvedRoot}" ${agentPath}${trustFlag}`,
  { stdio: 'pipe' }
);
// → Codex/Claude CLI가 tmux 내에서 REPL 모드로 실행
```

---

## 부록 C: 마이그레이션 체크리스트

### Phase 1 사전 준비

- [x] Claude CLI `-p --output-format json` 동작 확인 (2026-02-10)
- [x] Claude CLI `--session-id` / `--resume` 동작 확인 (2026-02-10)
- [x] Codex CLI `exec --json` 동작 확인 (2026-02-10) — **JSONL 형식**, `thread_id` 반환
- [x] Codex CLI `exec resume --json <id> "prompt"` 세션 재개 확인 (2026-02-10) — 컨텍스트 유지됨
- [x] `/orchestration` 명령이 `-p` 모드에서 작동하는지 확인 (2026-02-10) — Phase -1 완전 실행됨
- [x] better-sqlite3 Gateway 패키지에 이미 있는지 확인 (optionalDependencies로 존재)

#### 사전 검증에서 발견된 이슈 (Phase 2 이전 수정 필요)

1. **Codex JSONL 파서 필요**: Claude는 JSON 단일 객체, Codex는 JSONL (4줄). `parseCodexJsonl()` 별도 구현 필요.
2. **CODEX_BACKEND.baseArgs 수정**: `['--quiet', '--json']` → `['exec', '--json']` (exec 서브커맨드 필수)
3. **Codex resume 인자 다름**: `exec resume --json <session_id> "prompt"` (--color, --sandbox 불가)
4. **Claude CLI type/subtype 필드 존재**: 문서의 "없다" 기술 오류 → parseClaudeJson은 무시하므로 코드 변경 불필요

### Phase 1 구현 — **완료** (2026-02-10)

- [x] `protocol/src/cli-runner.ts` 타입 정의 (10개 타입)
- [x] `gateway/src/cli-runner.ts` 핵심 모듈 (370줄)
- [x] `gateway/src/cli-session-store.ts` 세션 저장소 (165줄)
- [x] `POST /api/cli/run` 엔드포인트 (계획: /api/agent → 실제: /api/cli/run)
- [x] `GET /api/cli/sessions` + `DELETE /api/cli/sessions/:id` 세션 관리
- [x] 단위 테스트 27개 작성 및 통과
- [x] server.ts 초기화 + gateway/src/index.ts export
- [x] build 9/9, lint 6/6, test 356 통과
- [ ] `POST /api/cli/run/async` 비동기 실행 API + `GET /api/cli/run/:id/status` (Phase 6에서 구현 예정)

### Phase 2 텔레그램

- [ ] 텔레그램 메시지 핸들러를 동기 HTTP 방식으로 변경
- [ ] `/orchestration` 명령 비동기 핸들러 추가
- [ ] Digest 모듈 의존성 제거
- [ ] 통합 테스트 통과

### Phase 3 메모리

- [ ] MemoryStore 초기화 조건 수정 (codex 모드에서도 활성화)
- [ ] saveTask 호출 추가
- [ ] 메모리 검색 동작 확인

### Phase 4 tmux

- [ ] createMainSession에 CliRunner 통합
- [ ] SessionManager에서 통신 책임 분리
- [ ] screen 폴링만 유지
- [ ] filterOutput → 대시보드 screen 전용으로 축소

### Phase 5 대시보드

- [ ] AgentEvent 타입 추가
- [ ] AgentHistoryPanel 컴포넌트
- [ ] SessionCostTracker 컴포넌트

### Phase 6 /orchestration

- [ ] 비동기 실행 + 상태 폴링
- [ ] 텔레그램 진행 알림
- [ ] E2E 테스트

### 최종 검증

- [x] `pnpm build` — 전체 빌드 통과 (9/9) ✅ 2026-02-10
- [x] `pnpm test` — 전체 테스트 통과 (356개) ✅ 2026-02-10
- [x] `pnpm lint` — 전체 린트 통과 (6/6) ✅ 2026-02-10
- [ ] 텔레그램 → Gateway → CLI → 텔레그램 E2E (Phase 2)
- [ ] 대시보드 세션 이력 표시 (Phase 5)
- [ ] 메모리 저장/검색 동작 (Phase 3)

---

## 부록 D: 용어 정리

| 용어 | 설명 |
|------|------|
| **REPL 모드** | Read-Eval-Print Loop. CLI가 상시 실행되어 입력을 기다리는 대화형 모드 |
| **비대화형 모드** | `-p` 플래그. 단일 프롬프트를 받아 단일 응답을 출력하고 종료 |
| **capture-pane** | tmux 명령. 현재 화면에 렌더링된 텍스트를 추출 |
| **send-keys** | tmux 명령. 터미널에 키 입력을 시뮬레이션 |
| **spawn** | Node.js child_process. 새 프로세스를 생성하여 실행 |
| **stdout 파이프** | 프로세스의 표준 출력을 파이프로 수집 |
| **직렬화 큐** | 같은 리소스에 대한 요청을 순차적으로 처리하는 큐 |
| **filterOutput** | Olympus의 터미널 출력 노이즈 제거 함수 (180줄 regex) |
| **Digest 모드** | Olympus 텔레그램 봇의 출력 요약 모드 (6개 카테고리) |

---

## 결론

Olympus의 텔레그램 응답 문제는 **터미널 스크래핑**이라는 아키텍처 선택에서 비롯된다. OpenClaw는 이 문제를 **구조화 CLI 출력** (`-p --output-format json`)으로 완전히 해결했다.

이 문서의 핵심 제안:

1. **CliRunner 모듈**: OpenClaw의 `cli-runner.ts` 방식으로 CLI를 child_process로 실행하고 JSON 출력을 파싱
2. **세션 영속화**: CLI 세션 ID를 SQLite에 저장하여 `--resume`으로 컨텍스트 유지
3. **텔레그램 단순화**: 비동기 이벤트 체인 → 동기 HTTP 요청/응답
4. **tmux 역할 축소**: 통신 → 선택적 모니터링
5. **메모리 활성화**: CliRunner 결과를 MemoryStore에 자동 저장

예상 효과:
- 텔레그램 응답 신뢰도: ~70-85% → **100%**
- 응답 지연: 1.5-3.5초 추가 → **0ms 추가**
- 코드 복잡도: ~960줄 제거 가능
- 유지보수 비용: CLI 업데이트마다 regex 수정 → **불필요**

### 진행 상황 (2026-02-10)

**Phase 1 완료** (2026-02-10): CliRunner 핵심 모듈이 구현되었다.
- `gateway/src/cli-runner.ts` (368줄) — spawn 기반 CLI 실행 + JSON 파싱 + 에러 분류 + 직렬화 큐
- `gateway/src/cli-session-store.ts` (167줄) — SQLite 세션 영속화 (토큰/비용 누적)
- `protocol/src/cli-runner.ts` (129줄) — 10개 타입 정의 (크로스 패키지)
- API: `POST /api/cli/run` + `GET /api/cli/sessions` + `DELETE /api/cli/sessions/:id`
- 테스트: 27개 통과 (491줄), 전체 파이프라인 build 9/9, lint 6/6, test 356

다음 단계는 **Phase 2 (텔레그램 봇 단순화)** — 텔레그램 메시지 핸들러를 `POST /api/cli/run` 동기 호출로 전환하여 비동기 7단계 이벤트 체인을 제거하는 것이다.

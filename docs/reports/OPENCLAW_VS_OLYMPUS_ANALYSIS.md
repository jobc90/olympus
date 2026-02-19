# OpenClaw vs Olympus 비교 분석 보고서

> **작성일**: 2026-02-19
> **분석 대상**: OpenClaw (https://github.com/openclaw/openclaw)
> **비교 대상**: Olympus v0.5.1
> **분석 범위**: 아키텍처, 멀티세션 통신, 텔레그램 연동, AI 에이전트 완료 감지, 응답 표시 방식

---

## 목차

1. [프로젝트 개요 비교](#1-프로젝트-개요-비교)
2. [아키텍처 비교](#2-아키텍처-비교)
3. [멀티세션 통신 메커니즘](#3-멀티세션-통신-메커니즘)
4. [텔레그램 원격 응답 수신](#4-텔레그램-원격-응답-수신)
5. [AI 에이전트 작업 완료 감지](#5-ai-에이전트-작업-완료-감지)
6. [AI 에이전트 응답 표시 방식](#6-ai-에이전트-응답-표시-방식)
7. [종합 비교표](#7-종합-비교표)
8. [핵심 인사이트 및 제안](#8-핵심-인사이트-및-제안)

---

## 1. 프로젝트 개요 비교

### OpenClaw

- **정체성**: 멀티채널 개인 AI 어시스턴트 플랫폼
- **진화**: Warelay → Clawdbot → Moltbot → OpenClaw
- **핵심 철학**: "AI that actually does things — runs on your devices, in your channels, with your rules"
- **규모**: 3,238개 TypeScript 소스 파일, 단일 패키지 구조
- **채널**: 20+ 메시징 플랫폼 (Telegram, Discord, Slack, WhatsApp, Signal 등)
- **AI 모델**: 멀티 모델 지원 (Claude, GPT, Gemini, Deepseek 등)
- **런타임**: Pi agent (임베디드 LLM 실행) + CLI 기반 실행
- **확장성**: 플러그인 기반 채널 시스템 (`ChannelPlugin` 인터페이스)

### Olympus

- **정체성**: Claude CLI 중심 멀티 AI 협업 개발 플랫폼
- **핵심 철학**: "Team Engineering Protocol + Multi-AI Orchestration"
- **규모**: 9개 패키지 모노레포 (protocol, core, gateway, cli, web, tui, client, telegram-bot, codex)
- **채널**: 텔레그램 단일 채널 + 웹 대시보드 + TUI
- **AI 모델**: Claude CLI 전용 (Codex CLI 부차적 지원, Gemini CLI 보조)
- **런타임**: CLI spawn → stdout 파싱 + PTY Worker
- **확장성**: 19개 커스텀 에이전트 + Team Engineering Protocol v3.2

### 핵심 차이점

| 차원 | OpenClaw | Olympus |
|------|----------|---------|
| **지향점** | 범용 개인 AI 어시스턴트 | 개발팀 AI 협업 플랫폼 |
| **채널 전략** | 다채널 (20+) | 단일 채널 + 대시보드 |
| **AI 전략** | 멀티 모델 (수평 확장) | 멀티 에이전트 (수직 확장) |
| **코드 구조** | 단일 패키지 + 플러그인 | 모노레포 (9 패키지) |
| **대상 사용자** | 일반 사용자/개발자 | 개발팀 리더/오퍼레이터 |

---

## 2. 아키텍처 비교

### 2.1 OpenClaw 아키텍처

```
WhatsApp / Telegram / Slack / Discord / Signal / ... / WebChat
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│                   Gateway (제어 평면)                    │
│               ws://127.0.0.1:18789                    │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ NodeRegistry │  │ SessionStore │  │  Broadcaster │ │
│  │ (클라이언트  │  │ (JSON 파일)  │  │ (이벤트 분배)│ │
│  │  디바이스)   │  │              │  │              │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                │                  │         │
│  ┌──────┴────────────────┴──────────────────┴───────┐ │
│  │            Channel Plugin System                  │ │
│  │  telegram / discord / slack / whatsapp / ...      │ │
│  └──────────────────┬───────────────────────────────┘ │
│                     │                                  │
│  ┌──────────────────┴───────────────────────────────┐ │
│  │              Agent Runtime (Pi)                    │ │
│  │  CLI 기반 (Claude CLI) / Embedded (OpenAI SDK)    │ │
│  └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
         │
         ├─ ACP Bridge (IDE 통합, stdio NDJSON)
         ├─ CLI (openclaw ...)
         ├─ WebChat UI
         └─ macOS / iOS / Android 노드
```

**핵심 특징**:
- **단일 프로세스 게이트웨이**: WebSocket + HTTP 하이브리드 서버 (포트 18789)
- **플러그인 채널 시스템**: `ChannelPlugin` 인터페이스로 20+ 채널 통합
- **파일 기반 세션 저장**: `~/.openclaw/state/sessions.json` + 인메모리 캐시 (45초 TTL)
- **디바이스 페어링**: 8자리 코드 기반 보안 (60분 TTL)
- **ACP 브리지**: IDE (Zed 등) 연동을 위한 stdio 기반 프로토콜

### 2.2 Olympus 아키텍처

```
┌──────────────────────── CLI ──────────────────────────┐
│  olympus server start / olympus start / start-trust   │
└──────────────────────────┬────────────────────────────┘
                           │
┌──────────────────────── Gateway ─────────────────────────┐
│                                                           │
│  Claude CLI ◄── CliRunner ──────► stdout 실시간 스트림    │
│  Codex CLI  ◄── CodexAdapter ◄──► codex 패키지           │
│  Gemini CLI ◄── GeminiAdvisor ──► 컨텍스트 보강          │
│                     │                                     │
│  WorkerRegistry · MemoryStore · SessionStore             │
│  LocalContextStore (SQLite + FTS5)                       │
└───────────────────────┬──────────────────────────────────┘
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
┌──────────┐    ┌──────────┐    ┌──────────────┐
│ Web 대시보드│    │   TUI    │    │ Telegram Bot │
│ (WebSocket)│    │(WebSocket)│    │  (HTTP API)  │
└──────────┘    └──────────┘    └──────────────┘
```

**핵심 특징**:
- **모노레포 구조**: 9개 패키지 (protocol → core → gateway → cli + web/tui/telegram-bot/codex)
- **CLI spawn 기반**: Claude CLI를 subprocess로 생성 → JSON/JSONL 파싱
- **PTY Worker**: node-pty로 Claude CLI TUI 직접 관리
- **멀티 AI 오케스트레이션**: CliRunner (Claude) + CodexAdapter (Codex) + GeminiAdvisor (Gemini)
- **SQLite 기반 컨텍스트**: LocalContextStore (프로젝트/워커 컨텍스트 + FTS5 검색)

### 2.3 아키텍처 비교 요약

| 측면 | OpenClaw | Olympus |
|------|----------|---------|
| **서버 구조** | 단일 프로세스 Gateway | 단일 프로세스 Gateway |
| **포트** | 18789 (WebSocket + HTTP) | 18789 (HTTP API) + 18791 (대시보드) |
| **채널 확장** | ChannelPlugin 인터페이스 | 하드코딩 (텔레그램 전용) |
| **세션 저장** | JSON 파일 + 인메모리 캐시 | 인메모리 + JSON 백업 + SQLite |
| **인증** | 토큰/비밀번호/디바이스/Tailscale | API Key 단일 방식 |
| **클라이언트 추적** | NodeRegistry (디바이스 매핑) | WebSocket 클라이언트 세트 |
| **AI 실행** | 임베디드 SDK + CLI 폴백 | CLI spawn 전용 |
| **프로토콜** | JSON-over-WebSocket (시퀀스 번호) | Socket.IO 이벤트 |

---

## 3. 멀티세션 통신 메커니즘

### 3.1 OpenClaw: 계층적 세션 키 기반 멀티플렉싱

#### 세션 키 구조

OpenClaw의 세션 격리는 **계층적 세션 키**로 구현됩니다:

```
agent:{agentId}:{channel}:{chatType}:{peerId}
```

**파일**: `src/routing/session-key.ts`

```typescript
// DM 스코프에 따른 세션 키 생성
export function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string;
  channel: string;
  accountId?: string | null;
  peerKind?: ChatType | null;      // "direct" | "group" | "channel"
  peerId?: string | null;
  dmScope?: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
}): string
```

**세션 키 예시**:
- `agent:main:main` — 메인 에이전트 기본 세션
- `agent:main:telegram:direct:12345` — 텔레그램 사용자 12345와의 1:1 대화
- `agent:design:discord:group:guild123` — 디자인 에이전트의 디스코드 그룹 세션
- `acp:<uuid>` — IDE 통합 ACP 세션

**DM 스코프 4단계**:

| 스코프 | 세션 키 형식 | 설명 |
|--------|------------|------|
| `main` | `agent:main:main` | 모든 DM이 단일 세션으로 수렴 |
| `per-peer` | `agent:main:direct:{peerId}` | 피어별 독립 세션 |
| `per-channel-peer` | `agent:main:{channel}:direct:{peerId}` | 채널+피어별 격리 |
| `per-account-channel-peer` | `agent:main:{channel}:{accountId}:direct:{peerId}` | 계정+채널+피어 완전 격리 |

#### 에이전트 라우팅

**파일**: `src/routing/resolve-route.ts`

메시지가 도착하면 **7단계 우선순위 바인딩**으로 에이전트를 결정합니다:

```
1. binding.peer          — 특정 피어에 에이전트 매핑 (가장 높은 우선순위)
2. binding.peer.parent   — 스레드의 부모 피어 매핑
3. binding.guild+roles   — Discord 길드 + 역할 기반
4. binding.guild         — Discord 길드 기반
5. binding.team          — Slack 팀 기반
6. binding.account       — 계정별 기본 에이전트
7. binding.channel       — 채널별 기본 에이전트
→ default                — 설정된 기본 에이전트
```

#### 동시성 제어: Lane 기반 큐잉

**파일**: `src/agents/pi-embedded-runner/run.ts`

```typescript
// 2중 Lane 격리
return enqueueSession(() =>         // 세션 Lane: sessionKey별 1개씩 순차 실행
  enqueueGlobal(async () => {       // 글로벌 Lane: 인증 프로파일 충돌 방지
    // 실제 AI 에이전트 실행
  })
);
```

**동시성 보장**:
- **세션 Lane**: sessionKey별 큐 → 같은 세션의 메시지는 순차 처리 (컨텍스트 오염 방지)
- **글로벌 Lane**: 전체 세션 공유 큐 → 인증 프로파일 회전 직렬화
- **교차 세션**: 서로 다른 세션은 **완전 병렬** (Lane이 독립)

#### 세션 저장소

```
~/.openclaw/state/sessions.json              ← 세션 메타데이터 (에이전트별)
~/.openclaw/state/transcripts/{agentId}/{sessionId}.jsonl  ← 대화 기록
```

- **인메모리 캐시**: `SESSION_STORE_CACHE` (Map, 45초 TTL)
- **파일 잠금**: `acquireSessionWriteLock()` — 동시 쓰기 방지
- **아카이브**: 세션 리셋/삭제 시 `{timestamp}-{reason}.jsonl` 보관

### 3.2 Olympus: API 기반 세션 관리

#### 세션 구조

Olympus는 **게이트웨이 API + 인메모리 세션**으로 관리합니다:

```typescript
// gateway/src/session-manager.ts
interface ManagedSession {
  id: string;           // 세션 UUID
  name: string;         // 세션 이름 (기본: "main")
  status: 'active' | 'idle' | 'terminated';
  createdAt: number;
}
```

**세션 저장소**:
- **인메모리**: `sessions.json` (JSON 파일 저장소)
- **CLI 세션**: `cli-session-store.ts` (SQLite, 토큰/비용 누적)
- **컨텍스트**: `local-context-store.ts` (SQLite + FTS5, 워커 이력 보관)

#### 동시성 제어: ConcurrencyLimiter

```typescript
// gateway/src/cli-runner.ts
const CLI_LIMITER = new ConcurrencyLimiter(5);  // 최대 5개 동시 CLI spawn
```

- **세션 격리**: 각 CLI spawn이 독립 프로세스
- **동시 실행**: 최대 5개 CLI 프로세스 병렬 (조정 가능: `setMaxConcurrentCli(n)`)
- **작업 추적**: `ActiveCliTask` — 오케스트레이터의 `trackTask/completeTask`

#### 워커 레지스트리

```typescript
// gateway/src/worker-registry.ts
interface RegisteredWorker {
  id: string;
  name: string;
  mode?: 'pty' | 'spawn';
  lastHeartbeat: number;
}
```

- **인메모리 등록**: Map 기반 워커 관리
- **하트비트**: 15초 체크, 60초 타임아웃
- **작업 할당**: `POST /api/workers/:id/task` → 결과 폴링

### 3.3 멀티세션 비교

| 측면 | OpenClaw | Olympus |
|------|----------|---------|
| **세션 키 형식** | `agent:{id}:{channel}:{type}:{peer}` | 단순 문자열 ID |
| **세션 격리 수준** | 4단계 DM 스코프 | 프로세스 수준 (CLI spawn) |
| **동시성 모델** | Lane 기반 큐잉 (세션/글로벌 2중) | ConcurrencyLimiter (최대 5) |
| **저장소** | JSON 파일 + 인메모리 캐시 | SQLite + 인메모리 |
| **스레드 지원** | `resolveThreadSessionKeys()` 내장 | 없음 |
| **에이전트 라우팅** | 7단계 바인딩 우선순위 | 단일 에이전트 |
| **멀티 에이전트** | 설정 기반 (agents.list) | 19개 커스텀 에이전트 (Team Protocol) |
| **Identity Linking** | 크로스 채널 사용자 통합 | 없음 |

---

## 4. 텔레그램 원격 응답 수신

### 4.1 OpenClaw 텔레그램: 플러그인 기반 + Draft 스트리밍

#### 아키텍처

- **프레임워크**: Grammy (not Telegraf)
- **플러그인**: `extensions/telegram/index.ts` → `api.registerChannel({ plugin: telegramPlugin })`
- **수신 모드**: 폴링 (`@grammyjs/runner`) 또는 웹훅 (둘 다 지원)
- **멀티 계정**: 지원 (`accounts.{id}.botToken`)

#### 메시지 수신 플로우 (14단계)

```
[사용자 텔레그램 앱]
  │
  ▼
[텔레그램 서버]
  │ (폴링: getUpdates / 웹훅: HTTP POST)
  ▼
1. monitorTelegramProvider()         ← monitor.ts
   ├─ 폴링: @grammyjs/runner.run(bot)
   └─ 웹훅: Express HTTP 서버
  │
  ▼
2. createTelegramBot()               ← bot.ts
   ├─ apiThrottler() (API 제한 준수)
   ├─ sequentialize() (채팅별 순차 처리)
   └─ 중복 업데이트 제거
  │
  ▼
3. bot.on("message") 핸들러          ← bot-handlers.ts
   ├─ 미디어 그룹 버퍼링 (100ms)
   ├─ 텍스트 조각 머징
   └─ 3층 권한 검사 (DM/그룹/명령어)
  │
  ▼
4. processMessage()                  ← bot-message.ts
   ├─ buildTelegramMessageContext() → MsgContext
   └─ 그룹 히스토리 추가
  │
  ▼
5. dispatchTelegramMessage()         ← bot-message-dispatch.ts
   ├─ Draft 스트리밍 준비 (createTelegramDraftStream)
   └─ 블록 청킹 준비 (EmbeddedBlockChunker)
  │
  ▼
6. dispatchReplyWithBufferedBlockDispatcher()
  │
  ▼
7-8. getReplyFromConfig()            ← get-reply.ts
   ├─ 에이전트 ID 해석 (sessionKey → agentId)
   ├─ 워크스페이스 준비
   ├─ 미디어/링크 이해 (비전 모델)
   └─ 디렉티브 해석 (@model, @think 등)
  │
  ▼
9-11. runReplyAgent()                ← agent-runner.ts
   ├─ 블록 스트리밍 파이프라인 생성
   ├─ AI 모델 호출 (CLI / Embedded SDK)
   └─ 응답 페이로드 빌드
  │
  ▼
12-13. 스트리밍 업데이트 (병렬)
   ├─ onBlockReply() → draftStream.update()
   │   └─ bot.api.editMessageText()   ← 실시간 메시지 수정
   └─ onToolResult() → 도구 결과 스트리밍
  │
  ▼
14. deliverReplies()                 ← delivery.ts
   ├─ Draft 메시지 플러시
   ├─ 텍스트 청킹 (4096자 제한)
   └─ 미디어 첨부 (이미지, 오디오, 문서)
  │
  ▼
[텔레그램 서버 → 사용자 앱]
```

#### Draft 스트리밍 (핵심 차별화)

```typescript
// telegram/draft-stream.ts
class TelegramDraftStream {
  async update(text: string) {
    if (!this.messageId) {
      // 첫 메시지 전송 (최소 30자 수집 후 — 푸시 알림 UX)
      const sent = await api.sendMessage(chatId, text, { ... });
      this.messageId = sent.message_id;
    } else {
      // 기존 메시지 수정 (1Hz 스로틀링)
      await api.editMessageText(chatId, this.messageId, text);
    }
  }
}
```

**작동 방식**:
1. AI 모델이 텍스트를 스트리밍으로 생성
2. 최소 30자 수집 후 첫 메시지 전송 (push notification 최적화)
3. 이후 `editMessageText()`로 1초마다 실시간 업데이트
4. 마크다운 블록 단위 청킹으로 깨짐 방지 (`block` 모드)
5. 4096자 초과 시 스트리밍 중단 → 별도 메시지로 계속

#### 보안 모델 (3층)

| 레이어 | 정책 | 설명 |
|--------|------|------|
| DM 정책 | `pairing` / `allowlist` / `open` | 1:1 대화 접근 제어 |
| 그룹 정책 | `allowlist` + `requireMention` | 그룹 대화 접근 + 멘션 필터 |
| 명령어 정책 | `commands.allowFrom` | 특정 명령어별 권한 |

### 4.2 Olympus 텔레그램: HTTP API 기반 동기/비동기

#### 아키텍처

- **프레임워크**: Telegraf
- **통신 방식**: HTTP API (`POST /api/cli/run` + `POST /api/cli/run/async`)
- **수신 모드**: 폴링 전용 (`bot.launch()` — fire-and-forget)
- **계정**: 단일 봇 계정

#### 메시지 수신 플로우

```
[사용자 텔레그램 앱]
  │
  ▼
[텔레그램 서버]
  │ (long polling)
  ▼
1. bot.on('text')                    ← telegram-bot 패키지
   └─ 메시지 파싱 + 명령어 분류
  │
  ▼
2-A. 동기 모드: forwardToCli()
   └─ POST /api/cli/run             ← Gateway HTTP API
       └─ CliRunner.runCli()         ← CLI spawn → JSON 파싱
           └─ 전체 결과 수신 후 응답 전송
  │
2-B. 비동기 모드: forwardToCliAsync()
   └─ POST /api/cli/run/async       ← 즉시 taskId 반환
       └─ pollTaskStatus()           ← 주기적 상태 확인
           └─ 완료 시 결과 전송
  │
  ▼
3. 워커 위임 모드:
   └─ @멘션 → POST /api/workers/:id/task
       └─ pollWorkerTask()           ← 결과 폴링
           └─ 결과 전송
  │
  ▼
4. ctx.reply(result)                 ← 최종 응답 (전체 텍스트)
  │
  ▼
[텔레그램 서버 → 사용자 앱]
```

#### 워커 위임 메커니즘

```
사용자: "@apollo 코드 리뷰해줘"
  │
  ▼
텔레그램 봇: @멘션 감지
  │
  ▼
POST /api/workers/apollo/task
  body: { prompt: "코드 리뷰해줘" }
  │
  ▼
워커 레지스트리: apollo 워커에 작업 할당
  │
  ▼
PTY Worker (또는 spawn): Claude CLI 실행
  │
  ▼
pollWorkerTask(taskId, { interval: 5s, timeout: 300s })
  │
  ▼
결과 수신 → ctx.reply(result)
```

### 4.3 텔레그램 비교

| 측면 | OpenClaw | Olympus |
|------|----------|---------|
| **프레임워크** | Grammy | Telegraf |
| **수신 모드** | 폴링 + 웹훅 | 폴링만 |
| **AI 통신** | 직접 SDK 호출 (인프로세스) | HTTP API (프로세스 간) |
| **스트리밍** | Draft 스트리밍 (`editMessageText` 1Hz) | 없음 (전체 완료 후 전송) |
| **멀티 계정** | 지원 | 단일 계정 |
| **워커 위임** | 없음 (에이전트 라우팅으로 대체) | @멘션 → 워커 위임 |
| **보안** | 3층 (DM/그룹/명령어) | `allowFrom` 단일 체크 |
| **미디어 처리** | 비전 모델 자동 캡션 | 미지원 |
| **그룹 지원** | 완전 (활성화 모드, 멘션 필터) | 기본 |
| **스레드** | Forum topics 지원 | 미지원 |
| **중복 방지** | 업데이트 오프셋 SQLite 영속화 | 없음 |
| **에러 복구** | Exponential backoff + 자동 재시작 | 없음 (수동 재시작) |

---

## 5. AI 에이전트 작업 완료 감지

### 5.1 OpenClaw: 이벤트 기반 감지

OpenClaw은 **스트리밍 이벤트 구독** 방식으로 완료를 감지합니다. 폴링 없이 LLM SDK의 스트리밍 콜백에 의존합니다.

#### Lifecycle 이벤트 체계

```
┌─────────────┐
│ agent_start  │  ← lifecycle.phase = "start"
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ text_delta   │  ← 스트리밍 텍스트 청크 (반복)
│ text_start   │  ← 어시스턴트 메시지 시작
│ message_start│  ← 새 메시지 블록 시작 (상태 리셋)
│ text_end     │  ← 현재 메시지 블록 완료
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ agent_end / error    │  ← lifecycle.phase = "end" 또는 "error"
│ + flushBlockReply()  │  ← 잔여 스트리밍 버퍼 플러시
└─────────────────────┘
```

#### 핵심 코드

**파일**: `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts`

```typescript
export function handleAgentEnd(ctx: EmbeddedPiSubscribeContext) {
  const lastAssistant = ctx.state.lastAssistant;
  const isError = isAssistantMessage(lastAssistant)
    && lastAssistant.stopReason === "error";

  if (isError) {
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "lifecycle",
      data: { phase: "error", error: friendlyError, endedAt: Date.now() },
    });
  } else {
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "lifecycle",
      data: { phase: "end", endedAt: Date.now() },
    });
  }

  ctx.flushBlockReplyBuffer();  // 잔여 스트리밍 버퍼 강제 플러시
}
```

#### 완료 결과 타입

```typescript
type EmbeddedPiRunMeta = {
  durationMs: number;
  stopReason?: string;        // "completed" | "tool_calls" | "error"
  aborted?: boolean;
  error?: {
    kind: "context_overflow" | "compaction_failure" | "role_ordering" | "image_size";
    message: string;
  };
};
```

#### CLI 기반 실행의 완료 감지

```typescript
// agent-runner-execution.ts
if (isCliProvider(provider)) {
  emitAgentEvent({ runId, stream: "lifecycle", data: { phase: "start" } });
  const result = await runCliAgent({...});  // CLI 프로세스 종료 = 완료
  emitAgentEvent({ runId, stream: "lifecycle", data: { phase: "end" } });
  return result;
}
```

- CLI 기반: 서브프로세스 `exit` 이벤트가 곧 완료 시그널
- Embedded: SDK 스트리밍 종료 이벤트 (`agent_end`)
- **방어 백스톱**: 에러 발생 시에도 반드시 터미널 이벤트 발행 (행 방지)

### 5.2 Olympus: 패턴 감지 기반

Olympus는 **PTY 출력 패턴 분석** + **프로세스 종료** 2가지로 완료를 감지합니다.

#### 패턴 기반 감지 (PTY Worker)

**파일**: `cli/src/pty-worker.ts`

```
완료 감지 4단계:
1. 프롬프트 패턴 (5초 settle)  ← Claude CLI의 프롬프트 패턴 매칭 후 5초 대기
2. 30초 무활동              ← stdout에 30초간 출력 없으면 완료 추정
3. 60초 강제 완료           ← 절대 타임아웃
4. 30분 절대 한계           ← 최종 안전장치
```

**백그라운드 에이전트 감지** (7개 패턴):
```
- "Task completed"
- "Conversation compacted"
- "Agent finished"
- ... 등 7개
```

- 백그라운드 에이전트 패턴 감지 시 → `AGENT_COOLDOWN_MS` (30초) 적용
- 쿨다운 동안 settle 타이머 취소 + 비활동 타임아웃 연장

#### CLI spawn 기반 감지

```typescript
// gateway/src/cli-runner.ts
const child = spawn(cliPath, args, options);

child.on('exit', (code) => {
  // 프로세스 종료 = 작업 완료
  // stdout 버퍼에서 JSON/JSONL 파싱
});
```

- Claude CLI: `-p --output-format json` → 프로세스 종료 시 JSON 파싱
- Codex CLI: `exec --json` → JSONL 스트리밍 + 프로세스 종료

#### 결과 추출

```
PTY 모드:
  ⏺ 마커 기반 추출 → stripAnsi → isTuiArtifactLine 필터 → 8000자 제한

spawn 모드:
  stdout 전체 수집 → JSON.parse() → CliResult 타입
```

### 5.3 완료 감지 비교

| 측면 | OpenClaw | Olympus |
|------|----------|---------|
| **감지 방식** | 이벤트 구독 (SDK 콜백) | 패턴 감지 + 프로세스 종료 |
| **폴링 여부** | 없음 (순수 이벤트 드리븐) | 없음 (이벤트/시그널 기반) |
| **지연** | 즉시 (밀리초 단위) | 5~30초 (settle 대기) |
| **정확도** | 높음 (SDK가 명시적 종료 시그널) | 중간 (패턴 매칭 휴리스틱) |
| **에러 처리** | `stopReason: "error"` + 친화적 메시지 | 프로세스 exit code |
| **스트리밍 연계** | 완료 시 `flushBlockReplyBuffer()` | 완료 시 stdout 버퍼 파싱 |
| **백그라운드 작업** | 에이전트 자체가 핸들링 | 7개 패턴 + 30초 쿨다운 |
| **타임아웃** | 없음 (SDK가 관리) | 제거됨 (패턴 전용으로 전환) |

---

## 6. AI 에이전트 응답 표시 방식

### 6.1 OpenClaw: 5단계 파이프라인 + 채널별 포맷팅

OpenClaw은 AI 모델의 **원문을 절대 그대로 보여주지 않습니다**. 모든 응답은 5단계 필터링 파이프라인을 거칩니다.

#### 5단계 응답 처리 파이프라인

```
[AI 모델 원문 출력]
        │
        ▼
┌─── Stage 1: Heartbeat 토큰 제거 ───┐
│ HEARTBEAT_OK 등 내부 시스템 마커 삭제 │
│ 빈 페이로드 → 드롭                    │
└──────────────┬─────────────────────┘
               │
               ▼
┌─── Stage 2: 리플라이 스레딩 ────────┐
│ replyToId 메타데이터 추가            │
│ 대화 스레드 연결                     │
└──────────────┬─────────────────────┘
               │
               ▼
┌─── Stage 3: 디렉티브 파싱 ──────────┐
│ [[audio_as_voice]], [[silent]] 추출  │
│ 정규화 + 렌더 가능 여부 필터         │
└──────────────┬─────────────────────┘
               │
               ▼
┌─── Stage 4: 메시징 도구 중복 제거 ──┐
│ 에이전트가 도구로 이미 전송한 텍스트  │
│ → 최종 페이로드에서 제거             │
└──────────────┬─────────────────────┘
               │
               ▼
┌─── Stage 5: 스트리밍 조정 ──────────┐
│ 스트리밍 성공 → 배치 페이로드 드롭   │
│ 스트리밍 실패 → 배치 모드 폴백       │
└──────────────┬─────────────────────┘
               │
               ▼
[채널별 포맷팅]
```

#### 채널별 포맷팅

**텔레그램**:
- Markdown → Telegram HTML 변환 (`markdownToTelegramChunks()`)
- 4096자 단위 청킹
- 미디어 캡션 1024자 제한 → 오버플로우는 별도 메시지
- 테이블 렌더링 모드 지원

**Discord**:
- 텍스트 스트리밍 없음 (Discord 봇 API 제한)
- **이모지 리액션 진행 표시**: 🧠 (thinking) → 🛠️ (tool use) → 💻 (coding) → ✅ (done)
- 10초 지연 시 ⏳, 30초 지연 시 ⚠️ (stall 감지)
- 2000자 메시지 제한

#### 부가 정보 추가

```typescript
// agent-runner.ts (후처리)
if (verboseEnabled && isNewSession) {
  payloads.unshift({ text: `🧭 New session: ${sessionId}` });
}
if (autoCompactionCompleted && verboseEnabled) {
  payloads.unshift({ text: `🧹 Auto-compaction complete (count ${count}).` });
}
if (responseUsageLine) {
  payloads = appendUsageLine(payloads, responseUsageLine);  // 토큰/비용 정보
}
```

### 6.2 Olympus: 원문 기반 + 최소 가공

Olympus는 AI 응답을 **최소한으로 가공**하여 전달합니다.

#### CLI spawn 모드 (주 경로)

```
[Claude CLI 실행]
  │ (-p --output-format json)
  ▼
[JSON 파싱]
  │ { result: "...", cost_usd: 0.05, ... }
  ▼
[원문 텍스트 추출]
  │ result 필드의 텍스트를 그대로 사용
  ▼
[텔레그램 전송]
  │ ctx.reply(result)  ← 마크다운 원문
  ▼
[사용자]
```

#### PTY 모드 (결과 추출)

```
[Claude CLI TUI 출력]
  │
  ▼
[stripAnsi()]          ← ANSI 이스케이프 코드 제거
  │
  ▼
[⏺ 마커 기반 추출]    ← ⏺ 마커 사이 텍스트 추출
  │
  ▼
[isTuiArtifactLine 필터] ← 스피너, "(thinking)", "Flowing..." 등 제거
  │
  ▼
[8000자 제한 적용]
  │
  ▼
[텔레그램/대시보드 전송]
```

#### 대시보드 표시

- **LiveOutputPanel**: CLI stdout 실시간 스트리밍 (auto-scroll, auto-collapse)
- **AgentHistoryPanel**: 작업 이력 목록
- **SessionCostTracker**: 세션별 토큰/비용 누적

### 6.3 응답 표시 비교

| 측면 | OpenClaw | Olympus |
|------|----------|---------|
| **원문 표시** | 절대 안 함 (5단계 파이프라인) | 거의 원문 (최소 가공) |
| **필터링** | Heartbeat/중복/디렉티브/스트리밍 조정 | ANSI 제거 + TUI 아티팩트 필터 |
| **포맷팅** | 채널별 변환 (Markdown → HTML/Discord) | 마크다운 원문 전달 |
| **스트리밍** | Draft 스트리밍 (1Hz editMessageText) | CLI stdout 실시간 (대시보드만) |
| **사용량 정보** | 선택적 (verbose 모드) | SessionCostTracker (대시보드) |
| **에러 표시** | 친화적 에러 메시지 생성 | CLI 에러 원문 전달 |
| **텔레그램 스트리밍** | 지원 (실시간 메시지 수정) | 미지원 (완료 후 전체 전송) |
| **청킹** | 채널별 자동 분할 (4096/2000자) | 수동 없음 |

---

## 7. 종합 비교표

| 카테고리 | 비교 항목 | OpenClaw | Olympus |
|----------|----------|----------|---------|
| **프로젝트** | 지향점 | 멀티채널 개인 AI 어시스턴트 | 개발팀 AI 협업 플랫폼 |
| | 규모 | 3,238 TS 파일, 단일 패키지 | 9 패키지 모노레포 |
| | 언어 | TypeScript (ESM) | TypeScript (ESM) |
| **채널** | 지원 수 | 20+ (Telegram, Discord, Slack...) | 1 (Telegram) + 대시보드 |
| | 확장 방식 | ChannelPlugin 인터페이스 | 하드코딩 |
| **AI 모델** | 지원 범위 | Claude, GPT, Gemini, Deepseek 등 | Claude CLI (주) + Codex/Gemini (보조) |
| | 실행 방식 | Embedded SDK + CLI 폴백 | CLI spawn + PTY Worker |
| **세션** | 키 구조 | `agent:{id}:{channel}:{type}:{peer}` | 단순 문자열 ID |
| | 동시성 | Lane 기반 2중 큐 | ConcurrencyLimiter (5) |
| | 저장소 | JSON 파일 + 인메모리 캐시 | SQLite + 인메모리 |
| **텔레그램** | 프레임워크 | Grammy | Telegraf |
| | 스트리밍 | Draft 스트리밍 (1Hz editMessageText) | 없음 (전체 완료 후) |
| | 보안 | 3층 (DM/그룹/명령어) | allowFrom 단일 |
| **완료 감지** | 방식 | SDK 이벤트 구독 | 패턴 감지 + 프로세스 종료 |
| | 지연 | 즉시 (ms) | 5~30초 (settle) |
| **응답 표시** | 가공 수준 | 5단계 파이프라인 | 최소 (ANSI 제거 정도) |
| | 텔레그램 스트리밍 | 실시간 메시지 수정 | 미지원 |
| **팀 협업** | 에이전트 팀 | 없음 (거부: "Agent-hierarchy는 미지원") | Team Engineering Protocol v3.2 |
| | 오케스트레이션 | 없음 | 19개 커스텀 에이전트 + DAG 실행 |
| **컨텍스트** | 장기 기억 | Memory 플러그인 (1개 활성) | LocalContextStore + GeminiAdvisor |
| | 프로젝트 분석 | 없음 | GeminiAdvisor (5분 주기 갱신) |

---

## 8. 핵심 인사이트 및 제안

### 8.1 OpenClaw에서 배울 점

#### 1. Draft 스트리밍 (텔레그램 UX)
OpenClaw의 텔레그램 Draft 스트리밍은 사용자 경험에 극적인 차이를 만듭니다. AI가 응답을 생성하는 동안 사용자는 실시간으로 텍스트가 나타나는 것을 볼 수 있습니다.

**Olympus 적용 제안**: CliRunner의 `onStream` 콜백을 텔레그램 봇에 연결하여 `editMessageText` 기반 실시간 업데이트 구현.

#### 2. 플러그인 기반 채널 확장
`ChannelPlugin` 인터페이스로 20+ 채널을 통일된 방식으로 지원하는 것은 확장성 측면에서 우수합니다.

**Olympus 적용 제안**: 현재 텔레그램 전용이지만, Discord/Slack 등 추가 시 채널 추상화 레이어 고려.

#### 3. 이벤트 기반 완료 감지
SDK 스트리밍 이벤트 구독은 패턴 매칭보다 정확하고 빠릅니다.

**Olympus 적용 제안**: Claude CLI의 `--output-format json` 출력을 스트리밍 파싱하여 이벤트 기반 완료 감지로 전환. (현재 PTY 패턴 감지의 5~30초 지연 해소)

#### 4. 세션 스코프 계층 구조
4단계 DM 스코프와 7단계 바인딩 우선순위는 복잡한 멀티테넌트 환경에 적합합니다.

**Olympus 적용 제안**: 현재는 단순 세션 ID이지만, 멀티유저 지원 시 계층적 세션 키 도입 고려.

### 8.2 Olympus만의 강점

#### 1. Team Engineering Protocol (v3.2)
OpenClaw이 명시적으로 거부한 "Agent-hierarchy frameworks"를 Olympus는 핵심 기능으로 구현했습니다. 19개 전문 에이전트 + DAG 기반 병렬 실행 + MCP 3중 검증은 OpenClaw에 없는 고유한 가치입니다.

#### 2. 멀티 AI 오케스트레이션
Claude CLI + Codex CLI + Gemini CLI 3개 AI를 동시에 관리하며, GeminiAdvisor가 장기 기억과 프로젝트 분석을 자동 보강합니다. OpenClaw은 멀티 모델을 지원하지만 협업/오케스트레이션은 없습니다.

#### 3. 컨텍스트 시스템
LocalContextStore (SQLite + FTS5)는 프로젝트/워커 수준의 컨텍스트를 구조화하여 저장합니다. OpenClaw의 Memory 플러그인은 단순 키-값 저장에 가깝습니다.

#### 4. 실시간 대시보드
OlympusMountain 대시보드는 워커 상태, CLI 스트리밍, 비용 추적을 시각적으로 보여주는 독자적인 UI입니다.

### 8.3 우선순위 제안

| 순위 | 개선 영역 | 기대 효과 | 난이도 |
|------|----------|----------|--------|
| 1 | 텔레그램 Draft 스트리밍 | 사용자 체감 반응속도 극적 향상 | 중 |
| 2 | 응답 필터링 파이프라인 | 클린한 응답 (HEARTBEAT 등 내부 마커 제거) | 하 |
| 3 | 텔레그램 보안 레이어 강화 | 그룹 정책, 명령어별 권한 | 중 |
| 4 | 이벤트 기반 완료 감지 전환 | PTY settle 지연 제거 (5~30초 → 즉시) | 상 |
| 5 | 채널 추상화 레이어 | 디스코드/슬랙 등 추가 채널 확장 기반 | 상 |

---

## 부록: 주요 소스 파일 참조

### OpenClaw

| 컴포넌트 | 파일 | 핵심 기능 |
|----------|------|----------|
| 세션 키 | `src/routing/session-key.ts` | 계층적 세션 키 생성 |
| 에이전트 라우팅 | `src/routing/resolve-route.ts` | 7단계 바인딩 매칭 |
| 세션 저장소 | `src/config/sessions/store.ts` | JSON + 인메모리 캐시 |
| ACP 세션 | `src/acp/session.ts` | 인메모리 세션 레지스트리 |
| 게이트웨이 | `src/gateway/server.impl.ts` | WebSocket + HTTP 서버 |
| 노드 레지스트리 | `src/gateway/node-registry.ts` | 디바이스 매핑 |
| 텔레그램 모니터 | `src/telegram/monitor.ts` | 폴링/웹훅 |
| 텔레그램 봇 | `src/telegram/bot.ts` | Grammy 봇 생성 |
| 텔레그램 디스패치 | `src/telegram/bot-message-dispatch.ts` | AI 디스패치 + 스트리밍 |
| Draft 스트리밍 | `src/telegram/draft-stream.ts` | 실시간 메시지 수정 |
| 완료 감지 | `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts` | 이벤트 기반 |
| 응답 필터링 | `src/auto-reply/reply/agent-runner-payloads.ts` | 5단계 파이프라인 |
| 블록 스트리밍 | `src/auto-reply/reply/block-reply-pipeline.ts` | 코얼레싱 + 백프레셔 |
| Lane 큐잉 | `src/agents/pi-embedded-runner/run.ts` | 2중 Lane 동시성 제어 |

### Olympus

| 컴포넌트 | 파일 | 핵심 기능 |
|----------|------|----------|
| CLI Runner | `gateway/src/cli-runner.ts` | CLI spawn + stdout 스트리밍 |
| PTY Worker | `cli/src/pty-worker.ts` | node-pty 기반 TUI 관리 |
| 세션 매니저 | `gateway/src/session-manager.ts` | 인메모리 세션 관리 |
| 워커 레지스트리 | `gateway/src/worker-registry.ts` | 인메모리 워커 등록 |
| 텔레그램 봇 | `packages/telegram-bot/` | Telegraf 기반 |
| Gemini Advisor | `gateway/src/gemini-advisor.ts` | 컨텍스트 보강 AI |
| 컨텍스트 저장소 | `core/src/local-context-store.ts` | SQLite + FTS5 |
| Codex Adapter | `packages/codex/` | Codex CLI 오케스트레이션 |
| 대시보드 | `packages/web/` | OlympusMountain 시각화 |

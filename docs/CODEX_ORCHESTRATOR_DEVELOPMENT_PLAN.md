# Codex Orchestrator 개발계획서

> **Olympus V3.0** — Codex CLI 기반 계층형 AI Agent 아키텍처
> 작성일: 2026-02-09
> 버전: v2.0 (Production-Ready Detail)
> 원본: v1.0 (Claude-Codex Consensus)

---

## 1. 목표 (Goal)

### 1.1 핵심 목표

현재 Gateway(WebSocket 미들웨어) 중심 아키텍처를 **Codex Orchestrator** 중심 계층형 AI Agent 아키텍처로 전환한다.

```
AS-IS: Telegram → Gateway(WS) → Agent → Worker(tmux) → Claude CLI
TO-BE: Telegram → Gateway(경량WS) → Codex Orchestrator → tmux 세션(Claude CLI들)
                                         ↕
                                    Dashboard(Q&A)
                                         ↕
                                  프로젝트 컨텍스트 DB들
```

### 1.2 성공 지표

| ID | 지표 | 목표치 |
|----|------|--------|
| M1 | Telegram 메시지 → Claude 전달 지연 | <1초 |
| M2 | Claude 응답 → Telegram 가공 전송 지연 | <2초 |
| M3 | Dashboard Q&A 응답 시간 | <3초 |
| M4 | 동시 관리 가능 tmux 세션 수 | >=5개 |
| M5 | 기존 테스트 유지율 | 100% (323개) |
| M6 | 신규 테스트 추가 | >=40개 |

### 1.3 부가 목표

- 프로젝트별 컨텍스트를 통합 관리하여 "전지적 AI Agent" 실현
- Dashboard에서 실시간 Q&A + 프로젝트 브라우징
- 점진적 마이그레이션으로 무중단 전환

---

## 2. 비목표 (Non-Goals)

### 2.1 명시적 제외

| ID | 제외 항목 | 이유 |
|----|----------|------|
| NG1 | OpenAI Codex CLI (Rust 바이너리) 직접 사용 | 자체 Codex Orchestrator 구축 |
| NG2 | 외부 메시지 브로커 (Redis Pub/Sub, RabbitMQ) 도입 | 로컬 실행 환경에 과잉 |
| NG3 | 클라우드 배포/멀티머신 지원 | 단일 머신 로컬 환경 전제 |
| NG4 | Gateway 즉시 완전 제거 | 점진적 마이그레이션 전략 |
| NG5 | DB 스키마 전면 재설계 | 기존 SQLite 구조 최대한 유지 |

### 2.2 향후 고려사항

- 멀티 AI 모델 지원 (Gemini, GPT 등 직접 API 호출)
- 원격 접속 (SSH 터널 등)
- 프로젝트 간 컨텍스트 공유/참조

---

## 3. 아키텍처 (Architecture Blueprint)

### 3.1 전체 시스템 구조

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          사용자 인터페이스                                │
│   ┌──────────────┐         ┌──────────────────────────────────┐        │
│   │  Telegram     │         │  Dashboard (React SPA)           │        │
│   │  Bot          │         │  - 실시간 Q&A                    │        │
│   │  (Telegraf)   │         │  - 프로젝트 컨텍스트 브라우저     │        │
│   │               │         │  - 세션 모니터링                  │        │
│   └───────┬───────┘         └──────────────┬───────────────────┘        │
│           │ WebSocket                       │ WebSocket                  │
│           └──────────────┬──────────────────┘                           │
│                          ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │                   Gateway (경량 WS 프록시)                        │  │
│   │  - WebSocket 서버 (포트 8200)                                   │  │
│   │  - 클라이언트 인증 (API Key)                                      │  │
│   │  - 메시지 라우팅 (→ Codex Orchestrator)                          │  │
│   │  - 구독/브로드캐스트 관리                                         │  │
│   └──────────────────────────┬───────────────────────────────────────┘  │
│                              ▼                                          │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │               ⭐ Codex Orchestrator (핵심)                       │  │
│   │                                                                  │  │
│   │  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │  │
│   │  │ Router         │  │ SessionManager  │  │ ResponseProcessor│  │  │
│   │  │ - 명령 분석    │  │ - 다중 tmux     │  │ - 응답 가공      │  │  │
│   │  │ - 세션 라우팅  │  │ - 세션 생성/삭제│  │ - Digest 엔진    │  │  │
│   │  │ - 우선순위     │  │ - 출력 모니터링 │  │ - 요약/포매팅    │  │  │
│   │  └────────────────┘  └─────────────────┘  └──────────────────┘  │  │
│   │                                                                  │  │
│   │  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │  │
│   │  │ ContextManager │  │ SecurityGuard   │  │ CommandQueue     │  │  │
│   │  │ - 프로젝트DB들 │  │ - 명령 필터링   │  │ - FIFO 큐        │  │  │
│   │  │ - 전역 인덱스  │  │ - 승인 흐름     │  │ - 우선순위 큐    │  │  │
│   │  │ - 통합 검색    │  │ - 보안 정책     │  │ - 세션별 큐      │  │  │
│   │  └────────────────┘  └─────────────────┘  └──────────────────┘  │  │
│   │                                                                  │  │
│   │  ┌────────────────┐  ┌─────────────────┐                        │  │
│   │  │ MemoryStore    │  │ AgentBrain      │                        │  │
│   │  │ - 작업 이력    │  │ - 판단/가공     │                        │  │
│   │  │ - 패턴 학습    │  │ - 컨텍스트 인지 │                        │  │
│   │  │ - 통합 기억    │  │ - 자율 행동     │                        │  │
│   │  └────────────────┘  └─────────────────┘                        │  │
│   └──────────────────────────┬───────────────────────────────────────┘  │
│                              ▼                                          │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │                   tmux 세션 풀                                    │  │
│   │                                                                  │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │  │
│   │  │ Session A    │  │ Session B    │  │ Session C    │  ...       │  │
│   │  │ claude CLI   │  │ claude CLI   │  │ claude CLI   │            │  │
│   │  │ ~/dev/projA  │  │ ~/dev/projB  │  │ ~/dev/projC  │            │  │
│   │  │ [SQLite DB]  │  │ [SQLite DB]  │  │ [SQLite DB]  │            │  │
│   │  └─────────────┘  └─────────────┘  └─────────────┘              │  │
│   └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 모듈 의존성 그래프

```
packages/protocol (타입 정의)
    ↓
packages/core (Context OS, Task Store)
    ↓
packages/gateway (경량 WS 프록시) ←── packages/client (WS 클라이언트)
    ↓                                       ↑
packages/codex (⭐ 신규 — Codex Orchestrator)   │
    ↓                                       │
    ├→ packages/telegram-bot (채널)          │
    ├→ packages/web (대시보드) ──────────────┘
    └→ packages/cli (진입점)
```

### 3.3 계층 구조 (Hierarchy)

```
Layer 0: 사용자 (Telegram, Dashboard)
         ↕ WebSocket
Layer 1: Gateway (인증, 라우팅, 브로드캐스트)
         ↕ Internal API
Layer 2: Codex Orchestrator (조율, 판단, 가공)
         ↕ tmux IPC
Layer 3: Claude CLI 인스턴스들 (실행)
         ↕ File System
Layer 4: 프로젝트 컨텍스트 DB들 (기억)
```

### 3.4 SPOF (단일 실패 지점) 분석

| SPOF | 영향 | 완화 전략 |
|------|------|----------|
| Codex Orchestrator 프로세스 크래시 | 모든 통신 중단 | Supervisor 패턴 (자동 재시작) + 상태 복원 |
| Gateway WS 서버 다운 | 클라이언트 연결 끊김 | 재연결 로직 (기존 구현) + 헬스체크 |
| tmux 서버 크래시 | 모든 세션 소멸 | 세션 상태 DB 기록 + 자동 재생성 |

---

## 4. Codex Orchestrator 상세 설계

> **구현 원칙**: 아래 모든 인터페이스·상수·SQL은 그대로 복사-구현 가능한 수준으로 작성되었다.
> 기존 코드(`packages/gateway/`, `packages/protocol/`)의 실제 타입·상수를 정확히 인용한다.

### 4.0 패키지 스캐폴딩

```
packages/codex/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # public API re-exports
│   ├── orchestrator.ts             # CodexOrchestrator 메인 클래스
│   ├── router.ts                   # Router
│   ├── session-manager.ts          # SessionManager (gateway 것 확장)
│   ├── response-processor.ts       # ResponseProcessor
│   ├── context-manager.ts          # ContextManager (Shard+GlobalIndex)
│   ├── agent-brain.ts              # AgentBrain
│   ├── output-monitor.ts           # OutputMonitor (완료 감지)
│   ├── types.ts                    # Codex 전용 타입
│   └── __tests__/
│       ├── router.test.ts
│       ├── session-manager.test.ts
│       ├── response-processor.test.ts
│       ├── context-manager.test.ts
│       ├── agent-brain.test.ts
│       ├── output-monitor.test.ts
│       └── integration.test.ts
```

**package.json 핵심 의존성**:
```json
{
  "name": "@olympus-dev/codex",
  "version": "0.3.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@olympus-dev/protocol": "workspace:*",
    "@olympus-dev/core": "workspace:*",
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "@types/better-sqlite3": "^7.6.8",
    "typescript": "^5.7.0"
  }
}
```

**tsconfig.json**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true
  },
  "include": ["src"],
  "references": [
    { "path": "../protocol" },
    { "path": "../core" }
  ]
}
```

### 4.1 핵심 모듈 상세

#### 4.1.1 Router (명령 라우팅)

**책임**: 사용자 입력을 분석하여 적절한 세션/행동으로 라우팅

**파일**: `packages/codex/src/router.ts` (~200줄)

```typescript
// ── 타입 정의 (packages/codex/src/types.ts) ──

/** 사용자 입력 소스 */
export type InputSource = 'telegram' | 'dashboard' | 'cli';

/** 라우팅된 입력 */
export interface UserInput {
  text: string;
  source: InputSource;
  chatId?: number;        // Telegram chat ID
  clientId?: string;      // Dashboard WS client ID
  timestamp: number;
}

/** 라우팅 결정 */
export interface RoutingDecision {
  type: 'SESSION_FORWARD' | 'SELF_ANSWER' | 'MULTI_SESSION' | 'CONTEXT_QUERY';
  targetSessions: string[];          // 대상 세션 ID들 (빈 배열 가능)
  processedInput: string;            // 가공된 입력 (컨텍스트 주입 후)
  contextToInject?: ProjectContext;   // 세션에 주입할 프로젝트 컨텍스트
  confidence: number;                 // 0-1 라우팅 신뢰도
  reason: string;                     // 디버깅용 판단 근거
}

// ── Router 구현 ──

export class Router {
  private projectAliases: Map<string, string> = new Map(); // alias → sessionId
  private lastActiveSession: Map<string, string> = new Map(); // source → sessionId

  constructor(
    private sessionManager: CodexSessionManager,
    private contextManager: ContextManager,
  ) {}

  /**
   * 라우팅 판단 — 4단계 우선순위
   *
   * 1. 명시적 세션 지정: `@projectA 빌드해줘` → SESSION_FORWARD
   * 2. 세션 관리 명령: `/sessions`, `/use`, `/close` → 내부 처리
   * 3. 프로젝트 키워드 매칭: `console API 수정` → SESSION_FORWARD
   * 4. 컨텍스트 질문: `지금 진행 중인 작업 전체?` → SELF_ANSWER
   * 5. 기본: 최근 활성 세션에 전달 → SESSION_FORWARD
   */
  async route(input: UserInput): Promise<RoutingDecision> {
    // Step 1: @ mention 파싱
    const mentionMatch = input.text.match(/^@(\S+)\s+(.+)/s);
    if (mentionMatch) {
      const [, target, command] = mentionMatch;
      const session = this.resolveSessionByName(target);
      if (session) {
        return {
          type: 'SESSION_FORWARD',
          targetSessions: [session.id],
          processedInput: command,
          confidence: 1.0,
          reason: `명시적 @${target} 지정`,
        };
      }
    }

    // Step 2: 전체 프로젝트 질의 감지 (정규식 기반)
    if (this.isGlobalQuery(input.text)) {
      return {
        type: 'SELF_ANSWER',
        targetSessions: [],
        processedInput: input.text,
        confidence: 0.9,
        reason: '전체 프로젝트 질의 패턴 감지',
      };
    }

    // Step 3: 다중 세션 명령 감지
    if (this.isMultiSessionCommand(input.text)) {
      const allSessions = this.sessionManager.listSessions()
        .filter(s => s.status === 'ready' || s.status === 'idle');
      return {
        type: 'MULTI_SESSION',
        targetSessions: allSessions.map(s => s.id),
        processedInput: this.extractCommand(input.text),
        confidence: 0.85,
        reason: '다중 세션 명령 감지',
      };
    }

    // Step 4: 프로젝트 키워드 매칭
    const keywordMatch = await this.matchProjectKeyword(input.text);
    if (keywordMatch) {
      return {
        type: 'SESSION_FORWARD',
        targetSessions: [keywordMatch.sessionId],
        processedInput: input.text,
        contextToInject: keywordMatch.context,
        confidence: keywordMatch.confidence,
        reason: `키워드 "${keywordMatch.keyword}" → ${keywordMatch.projectName}`,
      };
    }

    // Step 5: 기본 — 최근 활성 세션
    const lastSession = this.lastActiveSession.get(input.source);
    if (lastSession) {
      return {
        type: 'SESSION_FORWARD',
        targetSessions: [lastSession],
        processedInput: input.text,
        confidence: 0.5,
        reason: '최근 활성 세션 (기본)',
      };
    }

    // 세션 없음 → 자체 답변
    return {
      type: 'SELF_ANSWER',
      targetSessions: [],
      processedInput: input.text,
      confidence: 0.3,
      reason: '활성 세션 없음 — 자체 답변',
    };
  }

  /** 전체 프로젝트 질의 패턴 */
  private isGlobalQuery(text: string): boolean {
    const patterns = [
      /전체.*알려/,
      /모든.*프로젝트/,
      /지금.*뭐.*하/,
      /현황.*보고/,
      /진행.*상황/,
      /all\s+projects?/i,
      /what.*working\s+on/i,
      /status\s+report/i,
    ];
    return patterns.some(p => p.test(text));
  }

  /** 다중 세션 명령 패턴 */
  private isMultiSessionCommand(text: string): boolean {
    const patterns = [
      /모든.*프로젝트.*(빌드|테스트|린트)/,
      /전부.*(빌드|테스트)/,
      /all\s+projects?\s+(build|test|lint)/i,
    ];
    return patterns.some(p => p.test(text));
  }

  /**
   * 프로젝트 키워드 매칭 — 프로젝트 등록 정보(aliases)와 입력 비교
   * 정규식 기반, LLM API 호출 없음 (TD-5: 레이턴시 0)
   */
  private async matchProjectKeyword(text: string): Promise<{
    sessionId: string;
    projectName: string;
    keyword: string;
    confidence: number;
    context?: ProjectContext;
  } | null> {
    const sessions = this.sessionManager.listSessions();
    const projects = await this.contextManager.getAllProjects();

    for (const project of projects) {
      // 프로젝트 이름 + aliases 모두 체크
      const keywords = [project.name, ...(project.aliases ?? [])];
      for (const kw of keywords) {
        if (text.toLowerCase().includes(kw.toLowerCase())) {
          const session = sessions.find(s => s.projectPath === project.path);
          if (session) {
            return {
              sessionId: session.id,
              projectName: project.name,
              keyword: kw,
              confidence: 0.8,
              context: await this.contextManager.getProjectContext(project.path),
            };
          }
        }
      }
    }
    return null;
  }

  private resolveSessionByName(name: string): ManagedSession | null {
    // 1. alias 매핑 확인
    const aliasId = this.projectAliases.get(name.toLowerCase());
    if (aliasId) {
      return this.sessionManager.getSession(aliasId);
    }
    // 2. 세션 이름으로 검색
    return this.sessionManager.findByName(name) ?? null;
  }

  private extractCommand(text: string): string {
    return text
      .replace(/모든\s*프로젝트\s*/g, '')
      .replace(/전부\s*/g, '')
      .replace(/all\s+projects?\s*/gi, '')
      .trim();
  }

  /** 라우팅 후 최근 세션 기록 업데이트 */
  recordLastSession(source: InputSource, sessionId: string): void {
    this.lastActiveSession.set(source, sessionId);
  }
}

#### 4.1.2 SessionManager (세션 관리)

**책임**: 다중 tmux 세션의 전체 생명주기 관리
**파일**: `packages/codex/src/session-manager.ts` (~350줄)
**재사용**: `packages/gateway/src/session-manager.ts`의 tmux 관련 로직 추출

> **기존 Gateway SessionManager와의 차이점**:
> - Gateway 것은 chatId 기반 (Telegram 전용), Codex 것은 projectPath 기반
> - Gateway 것은 Session.status = 'active'|'closed', Codex 것은 6단계 상태
> - Codex 것은 OutputMonitor를 내장하여 Claude 응답 완료 감지 수행

```typescript
// ── 핵심 타입 ──

export type SessionStatus = 'starting' | 'ready' | 'busy' | 'idle' | 'error' | 'closed';

export interface ManagedSession {
  id: string;                     // randomUUID().slice(0, 8)
  name: string;                   // "olympus-console", "olympus-user-next" 등
  projectPath: string;            // /Users/jobc/dev/console
  tmuxSession: string;            // tmux 세션 이름 (고유)
  tmuxWindow?: string;            // 멀티윈도우 모드 시 윈도우 이름
  status: SessionStatus;
  lastActivity: number;           // Date.now()
  currentTask?: string;           // 현재 실행 중인 작업 설명 (busy 상태에서만)
  outputMonitor: OutputMonitor;   // pipe-pane 기반 출력 모니터
  contextDbPath: string;          // 프로젝트별 SQLite DB 경로
  commandQueue: string[];         // 세션별 명령 큐 (busy 시 적재)
  createdAt: number;
}

// ── 상수 (기존 Gateway SessionManager에서 추출) ──

const SESSION_CONSTANTS = {
  OUTPUT_BUFFER_SIZE: 20,           // 리플레이 버퍼 (최근 N개 출력)
  OUTPUT_MIN_INTERVAL: 2000,        // ms, 출력 이벤트 최소 간격 (스팸 방지)
  OUTPUT_MIN_CHANGE: 5,             // chars, 최소 변경량
  OUTPUT_DEBOUNCE_MS: 1000,         // ms, 출력 안정화 대기
  OUTPUT_POLL_INTERVAL: 500,        // ms, pipe-pane 로그 폴링 주기
  SESSION_MAX_COMMAND_QUEUE: 10,    // 세션별 최대 큐 크기
  TMUX_TARGET_PATTERN: /^[a-zA-Z0-9_:-]+$/,  // tmux target 허용 패턴
} as const;

// ── CodexSessionManager 클래스 ──

export class CodexSessionManager extends EventEmitter {
  private sessions: Map<string, ManagedSession> = new Map();
  private outputLogDir: string;   // tmpdir()/olympus-codex-logs (보안: 0o700)
  private logOffsets: Map<string, number> = new Map();
  private pollers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private config: { maxSessions?: number } = {}) {
    super();
    this.outputLogDir = join(tmpdir(), 'olympus-codex-logs');
    mkdirSync(this.outputLogDir, { recursive: true, mode: 0o700 });
  }

  /**
   * 세션 생성 — Claude CLI를 tmux 세션에서 시작
   *
   * 1. tmux new-session -d -s {name} -c {projectPath} {claudePath}
   * 2. tmux pipe-pane -t {name} -o 'cat >> {logPath}'
   * 3. OutputMonitor 시작 (500ms 폴링)
   * 4. 상태: starting → ready (Claude 프롬프트 감지 시)
   *
   * @param projectPath 프로젝트 절대 경로
   * @param name 세션 이름 (기본: 디렉토리 이름)
   */
  async createSession(projectPath: string, name?: string): Promise<ManagedSession> {
    const sessionName = name ?? `olympus-${basename(projectPath)}`;
    const sessionId = randomUUID().slice(0, 8);

    // Claude CLI 경로 해석
    let claudePath = 'claude';
    try {
      claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim();
    } catch { /* fallback */ }

    // tmux 세션 생성
    execFileSync('tmux', [
      'new-session', '-d',
      '-s', sessionName,
      '-c', projectPath,
      claudePath,
    ], { stdio: 'pipe' });

    // extended-keys 활성화 (tmux >= 3.2)
    try {
      execFileSync('tmux', ['set', '-t', sessionName, 'extended-keys', 'always'], { stdio: 'pipe' });
    } catch { /* tmux < 3.2 */ }

    const logPath = join(this.outputLogDir, `session-${sessionId}.log`);
    const outputMonitor = new OutputMonitor(sessionId, sessionName, logPath);

    const session: ManagedSession = {
      id: sessionId,
      name: sessionName,
      projectPath,
      tmuxSession: sessionName,
      status: 'starting',
      lastActivity: Date.now(),
      outputMonitor,
      contextDbPath: join(homedir(), '.olympus', 'projects', basename(projectPath), 'memory.db'),
      commandQueue: [],
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);

    // pipe-pane 시작 + 폴링 시작
    this.startOutputPolling(session);

    // Claude 프롬프트(❯) 감지 시 ready로 전환
    outputMonitor.on('prompt-detected', () => {
      if (session.status === 'starting' || session.status === 'busy') {
        session.status = session.commandQueue.length > 0 ? 'busy' : 'idle';
        if (session.status === 'idle') {
          session.status = 'ready';
          // 큐에 있는 다음 명령 처리
          this.drainSessionQueue(sessionId);
        }
        this.emit('session:status', { sessionId, status: session.status });
      }
    });

    return session;
  }

  /**
   * 기존 tmux 세션 자동 발견
   *
   * 기존 구현 재사용: `tmux list-sessions -F "#{session_name}:#{session_path}"`
   * main, olympus, olympus-* 이름의 세션 필터링
   */
  async discoverExistingSessions(): Promise<ManagedSession[]> {
    const discovered: ManagedSession[] = [];
    try {
      const output = execFileSync('tmux', [
        'list-sessions', '-F', '#{session_name}:#{session_path}',
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

      for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const sessionName = line.slice(0, colonIdx);
        const sessionPath = line.slice(colonIdx + 1);

        if (!sessionName.startsWith('olympus')) continue;
        if (this.findByTmuxName(sessionName)) continue; // 이미 등록됨

        const session = await this.createSession(sessionPath, sessionName);
        session.status = 'ready'; // 이미 실행 중이므로 바로 ready
        discovered.push(session);
      }
    } catch { /* tmux 미설치 또는 세션 없음 */ }
    return discovered;
  }

  /**
   * 명령 전송 — busy 시 세션 큐에 적재
   *
   * tmux send-keys -t {target} -l {input}  (literal 모드, shell injection 방지)
   * tmux send-keys -t {target} Enter
   *
   * @returns true if sent immediately, false if queued
   */
  async sendToSession(sessionId: string, input: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'closed' || session.status === 'error') {
      throw new Error(`세션 ${sessionId} 사용 불가 (status: ${session?.status ?? 'not found'})`);
    }

    if (session.status === 'busy') {
      if (session.commandQueue.length >= SESSION_CONSTANTS.SESSION_MAX_COMMAND_QUEUE) {
        throw new Error(`세션 ${sessionId} 큐 가득 참 (${SESSION_CONSTANTS.SESSION_MAX_COMMAND_QUEUE})`);
      }
      session.commandQueue.push(input);
      return false; // queued
    }

    session.status = 'busy';
    session.currentTask = input.slice(0, 100);
    session.lastActivity = Date.now();

    const target = session.tmuxWindow
      ? `${session.tmuxSession}:${session.tmuxWindow}`
      : session.tmuxSession;

    // execFileSync = shell injection 방지 (기존 보안 패턴)
    execFileSync('tmux', ['send-keys', '-t', target, '-l', input], { stdio: 'pipe' });
    execFileSync('tmux', ['send-keys', '-t', target, 'Enter'], { stdio: 'pipe' });

    this.emit('session:command-sent', { sessionId, input });
    return true; // sent immediately
  }

  // ... closeSession, listSessions, getSession, findByName, findByTmuxName 등
  // (기존 Gateway SessionManager 패턴과 동일하므로 구현 세부 생략)
}
```

**출력 모니터링 (기존 pipe-pane 패턴 재사용)**:

```
┌─────────────────────────────────────────────────────┐
│ tmux pipe-pane -t {session} -o 'cat >> {logPath}'   │
│                                                      │
│ 500ms 폴링:                                          │
│   1. stat(logPath) → 파일 크기 확인                   │
│   2. 크기 변화 없으면 skip                            │
│   3. open(logPath) → read(fd, buffer, offset)        │
│   4. filterOutput(newContent)  ← 기존 필터 재사용     │
│   5. 5자 미만 변경 → skip (OUTPUT_MIN_CHANGE)        │
│   6. 1초 debounce → 출력 안정화 대기                  │
│   7. 2초 throttle → 스팸 방지 (OUTPUT_MIN_INTERVAL)  │
│   8. emit('output', filteredContent)                 │
│   9. emit('prompt-detected') ← 프롬프트 복귀 감지    │
└─────────────────────────────────────────────────────┘
```

#### 4.1.2.1 OutputMonitor (Claude 응답 완료 감지)

**책임**: Claude CLI가 응답을 완료했는지 정확히 감지
**파일**: `packages/codex/src/output-monitor.ts` (~180줄)

> **이것이 가장 까다로운 모듈이다.** Claude CLI는 명확한 "응답 완료" 시그널이 없다.
> pipe-pane 출력에서 프롬프트 복귀 패턴을 감지해야 한다.

```typescript
export class OutputMonitor extends EventEmitter {
  private logPath: string;
  private offset: number = 0;
  private poller: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastOutputTime: number = 0;

  // ── 완료 감지 상수 ──
  static readonly POLL_INTERVAL = 500;            // ms
  static readonly NO_OUTPUT_TIMEOUT = 10_000;     // 10초 무출력 → 완료 추정
  static readonly DEBOUNCE_MS = 1000;             // 출력 안정화 대기
  static readonly MID_STREAM_FLUSH_INTERVAL = 5000; // 5초 간격 중간 플러시

  // ── 프롬프트 감지 패턴 ──
  // Claude CLI가 사용자 입력 대기 상태로 복귀하면 나타나는 패턴
  static readonly PROMPT_PATTERNS: RegExp[] = [
    /❯\s*$/m,                          // 기본 프롬프트 (빈 입력 대기)
    /^\s*❯\s+/m,                       // 프롬프트 + 이전 입력
    /\$\s*$/m,                         // bash 프롬프트 (Claude가 셸에 있을 때)
  ];

  // ── 진행 중 패턴 (아직 완료 아님) ──
  static readonly BUSY_PATTERNS: RegExp[] = [
    /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,                // 브레일 스피너
    /[✶✳✢✻✽·]/,                       // 새 스피너
    /\(thinking\)/i,                    // thinking 표시
    /Working\.\.\./i,
    /Reading\.\.\./i,
    /Searching\.\.\./i,
  ];

  // ── 완료 시그널 패턴 (즉시 완료 판정) ──
  static readonly COMPLETION_SIGNALS: RegExp[] = [
    /⏺\s*(Done|완료|Finished)/i,
    /✅\s*(All|모든).*pass/i,
    /Build\s+succeeded/i,
    /test.*\d+\s+pass/i,
  ];

  constructor(
    public readonly sessionId: string,
    private tmuxSession: string,
    logPath: string,
  ) {
    super();
    this.logPath = logPath;
  }

  start(): void {
    // pipe-pane 시작
    execFileSync('tmux', [
      'pipe-pane', '-t', this.tmuxSession, '-o', `cat >> "${this.logPath}"`,
    ], { stdio: 'pipe' });

    // 기존 로그 스킵 (재시작 시 stale 방지)
    try {
      this.offset = statSync(this.logPath).size;
    } catch { /* 파일 없으면 0 */ }

    // 500ms 폴링 시작
    this.poller = setInterval(() => this.poll(), OutputMonitor.POLL_INTERVAL);
  }

  stop(): void {
    if (this.poller) clearInterval(this.poller);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    try {
      execFileSync('tmux', ['pipe-pane', '-t', this.tmuxSession], { stdio: 'pipe' });
    } catch { /* 이미 중지됨 */ }
  }

  private poll(): void {
    try {
      const stats = statSync(this.logPath);
      if (stats.size <= this.offset) {
        // 무출력 감지 → NO_OUTPUT_TIMEOUT 후 완료 추정
        if (this.lastOutputTime > 0 &&
            Date.now() - this.lastOutputTime > OutputMonitor.NO_OUTPUT_TIMEOUT) {
          this.emit('prompt-detected');
          this.lastOutputTime = 0;
        }
        return;
      }

      // 신규 출력 읽기 (offset 기반 — 효율적)
      const bytesToRead = stats.size - this.offset;
      const buffer = Buffer.alloc(bytesToRead);
      const fd = openSync(this.logPath, 'r');
      try { readSync(fd, buffer, 0, bytesToRead, this.offset); }
      finally { closeSync(fd); }

      const newContent = buffer.toString('utf-8');
      this.offset = stats.size;
      this.lastOutputTime = Date.now();

      // 노이즈 필터링 (기존 filterOutput 로직 재사용)
      const filtered = this.filterOutput(newContent);
      if (!filtered || filtered.trim().length < 5) return;

      // 출력 이벤트 발행 (debounce 적용)
      this.emitDebounced('output', filtered);

      // 완료 시그널 체크
      for (const pattern of OutputMonitor.COMPLETION_SIGNALS) {
        if (pattern.test(filtered)) {
          this.emit('prompt-detected');
          return;
        }
      }

      // 프롬프트 복귀 체크
      for (const pattern of OutputMonitor.PROMPT_PATTERNS) {
        if (pattern.test(newContent)) { // raw content에서 체크 (ANSI 포함)
          // 진행 중 패턴이 같이 있으면 무시
          const isBusy = OutputMonitor.BUSY_PATTERNS.some(p => p.test(newContent));
          if (!isBusy) {
            this.emit('prompt-detected');
            return;
          }
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.emit('error', (err as Error).message);
    }
  }

  private emitDebounced(event: string, content: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.emit(event, content);
    }, OutputMonitor.DEBOUNCE_MS);
  }

  /** 기존 Gateway filterOutput 로직 동일 (ANSI strip + 노이즈 제거) */
  private filterOutput(content: string): string {
    // ... (gateway/session-manager.ts:904-1015 의 filterOutput 그대로 이식)
    // 핵심: stripAnsi → 블록리스트 필터 → 연속 빈줄 제거
    // 세부 구현은 gateway/session-manager.ts 참조
    return content; // placeholder
  }
}
```

**완료 감지 판정 흐름**:
```
신규 출력 도착
    │
    ├─ COMPLETION_SIGNALS 매치? ──→ YES: 즉시 prompt-detected
    │
    ├─ PROMPT_PATTERNS 매치? ──→ YES ──→ BUSY_PATTERNS 매치? ──→ NO: prompt-detected
    │                                                              YES: 무시 (아직 작업 중)
    │
    └─ 매치 없음 ──→ 10초 무출력? ──→ YES: prompt-detected (타임아웃 폴백)
                                      NO: 계속 대기
```

#### 4.1.3 ResponseProcessor (응답 가공)

**책임**: Claude CLI 응답을 채널별로 적절하게 가공
**파일**: `packages/codex/src/response-processor.ts` (~250줄)
**재사용**: `packages/telegram-bot/src/digest/` (Digest Engine 전체)

```typescript
// ── 응답 타입 ──

export type ResponseType = 'text' | 'code' | 'error' | 'progress' | 'question' | 'build' | 'test';

export interface ProcessedResponse {
  type: ResponseType;
  content: string;
  metadata: {
    projectName: string;
    sessionId: string;
    duration: number;            // ms
    tokensUsed?: number;
    filesChanged?: string[];     // 변경된 파일 목록 (⏺ Edit 파싱)
  };
  agentInsight?: string;         // Codex AgentBrain이 추가한 분석/코멘트
  rawOutput: string;             // 원본 (디버깅용)
  digestResult?: DigestResult;   // Digest Engine 결과 (재사용)
}

// ── Telegram 상수 (기존 값 그대로) ──
const TELEGRAM_MSG_LIMIT = 4000;       // telegram-bot/src/index.ts
const OUTPUT_SUMMARY_LIMIT = 1500;     // telegram-bot/src/index.ts

// ── ResponseProcessor 클래스 ──

export class ResponseProcessor {
  private digestEngine: DigestEngine;  // telegram-bot/src/digest/engine.ts 재사용

  constructor(config?: Partial<DigestConfig>) {
    this.digestEngine = new DigestEngine({
      ...DEFAULT_DIGEST_CONFIG,  // maxLength:800, bufferDebounceMs:5000, etc.
      ...config,
    });
  }

  /**
   * Claude 원시 출력 → 구조화된 응답
   *
   * 1. 타입 판별 (에러/빌드/테스트/코드/텍스트)
   * 2. Digest Engine으로 핵심 추출
   * 3. 파일 변경 목록 파싱 (⏺ Edit/Write 패턴)
   * 4. 메타데이터 첨부
   */
  process(rawOutput: string, context: {
    sessionId: string;
    projectName: string;
    startTime: number;
  }): ProcessedResponse {
    const type = this.detectType(rawOutput);
    const digestResult = this.digestEngine.digest(rawOutput);
    const filesChanged = this.parseChangedFiles(rawOutput);

    return {
      type,
      content: digestResult.summary,
      metadata: {
        projectName: context.projectName,
        sessionId: context.sessionId,
        duration: Date.now() - context.startTime,
        filesChanged,
      },
      rawOutput,
      digestResult,
    };
  }

  /**
   * Telegram 포맷 — 4000자 제한, markdown
   *
   * 구조:
   * 📂 {projectName} | ⏱ {duration}
   * {content}
   * 📎 변경: {files}
   * 💡 {agentInsight}
   */
  formatForTelegram(response: ProcessedResponse): string {
    const header = `📂 ${response.metadata.projectName} | ⏱ ${this.formatDuration(response.metadata.duration)}`;
    const files = response.metadata.filesChanged?.length
      ? `\n📎 변경: ${response.metadata.filesChanged.join(', ')}`
      : '';
    const insight = response.agentInsight ? `\n💡 ${response.agentInsight}` : '';

    let body = response.content;
    const maxBody = TELEGRAM_MSG_LIMIT - header.length - files.length - insight.length - 10;
    if (body.length > maxBody) {
      body = body.slice(0, maxBody - 3) + '...';
    }

    return `${header}\n${body}${files}${insight}`;
  }

  /**
   * Dashboard 포맷 — 풀 데이터 (제한 없음)
   */
  formatForDashboard(response: ProcessedResponse): DashboardResponse {
    return {
      ...response,
      rawOutput: response.rawOutput,  // Dashboard는 원본도 볼 수 있음
      timestamp: Date.now(),
    };
  }

  /** 응답 타입 감지 — Digest Engine 카테고리 재사용 */
  private detectType(output: string): ResponseType {
    // Digest Engine의 LineCategory → ResponseType 매핑
    // build → 'build', test → 'test', error → 'error', etc.
    if (/error|fail|exception/i.test(output) && /[1-9]\d*\s*(error|fail)/i.test(output)) return 'error';
    if (/build\s+(succeeded|완료|passed)/i.test(output)) return 'build';
    if (/test.*\d+\s+(pass|fail)/i.test(output)) return 'test';
    if (/```/.test(output)) return 'code';
    if (/\?$/.test(output.trim())) return 'question';
    return 'text';
  }

  /** ⏺ Edit/Write 패턴에서 파일명 추출 */
  private parseChangedFiles(output: string): string[] {
    const files = new Set<string>();
    // Claude CLI output patterns:
    // "⏺ Edit src/foo.ts" or "⏺ Write src/bar.ts"
    const editPattern = /⏺\s*(?:Edit|Write|Create)\s+(\S+)/g;
    let match;
    while ((match = editPattern.exec(output)) !== null) {
      files.add(match[1]);
    }
    return [...files];
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}
```

#### 4.1.4 ContextManager (프로젝트 컨텍스트 통합 관리)

**책임**: 모든 프로젝트의 로컬 DB를 통합 관리하여 전지적 정보 제공
**파일**: `packages/codex/src/context-manager.ts` (~300줄)
**재사용**: `packages/gateway/src/memory/store.ts` (MemoryStore), `packages/core/src/contextStore.ts` (ContextStore)

```typescript
// ── 타입 ──

export interface ProjectMetadata {
  name: string;                  // "console", "user-next", "olympus"
  path: string;                  // 절대 경로
  aliases: string[];             // 키워드 매칭용 별명 ["콘솔", "api", "백엔드"]
  techStack: string[];           // ["NestJS", "PostgreSQL", "Keycloak"]
  claudeMdPath?: string;         // CLAUDE.md 경로 (있으면)
  agentsMdPath?: string;         // AGENTS.md 경로 (있으면)
}

export interface ProjectContext {
  path: string;
  name: string;
  lastUpdated: number;
  recentTasks: CompletedTask[];       // 최근 20개 (MemoryStore에서)
  learningPatterns: LearningPattern[]; // 학습 패턴 (PatternManager에서)
  techStack: string[];
  activeIssues: string[];
  projectInstructions?: string;       // CLAUDE.md 내용 (있으면)
  taskCount: number;
  patternCount: number;
}

export interface GlobalSearchResult {
  projectName: string;
  projectPath: string;
  matchType: 'task' | 'pattern' | 'context' | 'instruction';
  content: string;
  score: number;                      // FTS5 rank
  timestamp: number;
}

// ── ContextManager 클래스 ──

export class ContextManager {
  private globalDb: Database.Database;
  private projectDbs: Map<string, MemoryStore> = new Map(); // path → MemoryStore
  private projectMeta: Map<string, ProjectMetadata> = new Map();

  constructor(private config: { globalDbPath?: string } = {}) {
    const dbPath = (config.globalDbPath ?? '~/.olympus/global.db')
      .replace(/^~/, homedir());

    // 디렉토리 생성
    mkdirSync(dirname(dbPath), { recursive: true });

    this.globalDb = new SqliteDb(dbPath);
    this.globalDb.pragma('journal_mode = WAL');
    this.initGlobalSchema();
  }

  /**
   * 프로젝트 등록 — global.db에 메타데이터 저장 + 프로젝트별 DB 연결
   *
   * 등록 시 자동으로:
   * 1. ~/.olympus/projects/{name}/ 디렉토리 생성
   * 2. memory.db, context.db 초기화
   * 3. CLAUDE.md 있으면 project_search_index에 색인
   * 4. global.db projects 테이블에 기록
   */
  async registerProject(meta: ProjectMetadata): Promise<void> {
    const projectDir = join(homedir(), '.olympus', 'projects', meta.name);
    mkdirSync(projectDir, { recursive: true });

    // 프로젝트별 MemoryStore 초기화
    const memoryStore = new MemoryStore({
      enabled: true,
      dbPath: join(projectDir, 'memory.db'),
      maxHistory: 1000,
    });
    await memoryStore.initialize();
    this.projectDbs.set(meta.path, memoryStore);
    this.projectMeta.set(meta.path, meta);

    // global.db에 등록
    this.globalDb.prepare(`
      INSERT OR REPLACE INTO projects (id, name, path, tech_stack, aliases, last_activity, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(
      meta.name,           // id = name (고유)
      meta.name,
      meta.path,
      JSON.stringify(meta.techStack),
      JSON.stringify(meta.aliases),
      Date.now(),
    );

    // CLAUDE.md 색인
    if (meta.claudeMdPath && existsSync(meta.claudeMdPath)) {
      const content = readFileSync(meta.claudeMdPath, 'utf-8');
      this.indexProjectContent(meta.name, content);
    }
  }

  /**
   * 전역 검색 — 모든 프로젝트 DB를 병렬 쿼리
   *
   * 알고리즘:
   * 1. global.db FTS5로 프로젝트 메타 검색 (빠름)
   * 2. 매칭된 프로젝트의 memory.db FTS5 검색 (병렬, 프로젝트당 최대 200ms)
   * 3. 결과 병합 → score 기준 정렬 → 중복 제거
   *
   * 성능 보장:
   * - 프로젝트당 타임아웃: 200ms (초과 시 해당 프로젝트 스킵)
   * - 최대 병렬 쿼리: 5개 (Promise.allSettled)
   * - 부분 실패 허용 (일부 DB 접근 불가해도 나머지 결과 반환)
   */
  async globalSearch(query: string, limit = 20): Promise<GlobalSearchResult[]> {
    const results: GlobalSearchResult[] = [];

    // Step 1: global.db에서 프로젝트 메타 검색
    try {
      const globalResults = this.globalDb.prepare(`
        SELECT p.name, p.path, psi.content, rank
        FROM project_search_index psi
        JOIN project_fts ON psi.rowid = project_fts.rowid
        JOIN projects p ON p.id = psi.project_id
        WHERE project_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(query, limit);

      for (const row of globalResults as any[]) {
        results.push({
          projectName: row.name,
          projectPath: row.path,
          matchType: 'instruction',
          content: row.content?.slice(0, 200) ?? '',
          score: Math.abs(row.rank ?? 0),
          timestamp: Date.now(),
        });
      }
    } catch { /* FTS 쿼리 실패 — 무시 */ }

    // Step 2: 각 프로젝트 memory.db FTS5 검색 (병렬)
    const projectSearches = [...this.projectDbs.entries()].map(
      ([path, store]) => this.searchProjectWithTimeout(path, store, query, 200)
    );

    const settled = await Promise.allSettled(projectSearches);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      }
      // rejected = 타임아웃 또는 DB 에러 → 스킵 (부분 실패 허용)
    }

    // Step 3: score 정렬 + 중복 제거
    return results
      .sort((a, b) => b.score - a.score)
      .filter((r, i, arr) => arr.findIndex(x => x.content === r.content) === i)
      .slice(0, limit);
  }

  /**
   * 프로젝트 컨텍스트 조회 — 단일 프로젝트의 전체 컨텍스트
   */
  async getProjectContext(projectPath: string): Promise<ProjectContext> {
    const meta = this.projectMeta.get(projectPath);
    const store = this.projectDbs.get(projectPath);

    const recentTasks = store?.getRecentTasks(20) ?? [];
    const patterns = store?.getPatterns() ?? [];

    // CLAUDE.md 읽기
    let instructions: string | undefined;
    if (meta?.claudeMdPath && existsSync(meta.claudeMdPath)) {
      instructions = readFileSync(meta.claudeMdPath, 'utf-8');
    }

    return {
      path: projectPath,
      name: meta?.name ?? basename(projectPath),
      lastUpdated: recentTasks[0]?.timestamp ?? 0,
      recentTasks,
      learningPatterns: patterns,
      techStack: meta?.techStack ?? [],
      activeIssues: [],  // TODO: 향후 GitHub 연동
      projectInstructions: instructions,
      taskCount: store?.getTaskCount() ?? 0,
      patternCount: store?.getPatternCount() ?? 0,
    };
  }

  /** 모든 프로젝트 요약 */
  async getAllProjects(): Promise<ProjectMetadata[]> {
    return [...this.projectMeta.values()];
  }

  // ── Private ──

  private async searchProjectWithTimeout(
    path: string, store: MemoryStore, query: string, timeoutMs: number
  ): Promise<GlobalSearchResult[]> {
    return Promise.race([
      this.searchProject(path, store, query),
      new Promise<GlobalSearchResult[]>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ]);
  }

  private async searchProject(
    path: string, store: MemoryStore, query: string
  ): Promise<GlobalSearchResult[]> {
    const tasks = store.searchTasks(query, 5);
    const meta = this.projectMeta.get(path);
    return tasks.map(t => ({
      projectName: meta?.name ?? basename(path),
      projectPath: path,
      matchType: 'task' as const,
      content: `${t.command} → ${t.result}`,
      score: t.success ? 2 : 1,
      timestamp: t.timestamp,
    }));
  }

  private indexProjectContent(projectId: string, content: string): void {
    this.globalDb.prepare(`
      INSERT OR REPLACE INTO project_search_index (project_id, content, updated_at)
      VALUES (?, ?, ?)
    `).run(projectId, content, Date.now());
  }

  private initGlobalSchema(): void {
    this.globalDb.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT UNIQUE NOT NULL,
        tech_stack TEXT,
        aliases TEXT,
        last_activity INTEGER,
        status TEXT DEFAULT 'active',
        created_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS project_search_index (
        project_id TEXT REFERENCES projects(id),
        content TEXT,
        updated_at INTEGER
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS project_fts USING fts5(
        content,
        content=project_search_index,
        content_rowid=rowid
      );

      CREATE TRIGGER IF NOT EXISTS psi_fts_insert AFTER INSERT ON project_search_index BEGIN
        INSERT INTO project_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;

      CREATE TRIGGER IF NOT EXISTS psi_fts_delete AFTER DELETE ON project_search_index BEGIN
        INSERT INTO project_fts(project_fts, rowid, content) VALUES ('delete', OLD.rowid, OLD.content);
      END;

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        tmux_session TEXT NOT NULL,
        status TEXT DEFAULT 'idle',
        created_at INTEGER,
        last_activity INTEGER
      );
    `);
  }

  close(): void {
    for (const [, store] of this.projectDbs) store.close();
    this.globalDb.close();
  }
}
```

**DB 전략 (Codex 합의: Shard + Global Index)**:

```
~/.olympus/
├── global.db                   # 전역 인덱스 (프로젝트 메타, FTS5 검색)
│   ├── projects                # id, name, path, tech_stack, aliases, status
│   ├── project_search_index    # project_id, content (CLAUDE.md 등)
│   ├── project_fts (FTS5)      # content 전문 검색
│   └── sessions                # id, project_id, tmux_session, status
│
├── projects/
│   ├── console/
│   │   └── memory.db           # 기존 MemoryStore (completed_tasks, learning_patterns, tasks_fts)
│   ├── user-next/
│   │   └── memory.db
│   └── olympus/
│       └── memory.db
│
├── contexts.db                 # 기존 Context OS (workspace/project/task 3-tier)
├── tasks.db                    # 기존 TaskStore
├── config.json                 # OlympusClientConfig
│
└── sessions/                   # 세션 메타데이터 (JSON)
    └── sessions.json
```

> **기존 memory.db와의 관계**: 기존 `~/.olympus/memory.db`(단일 파일)는 마이그레이션 Phase 2에서
> `~/.olympus/projects/{name}/memory.db`(프로젝트별)로 분할됩니다. 마이그레이션 스크립트는 섹션 6.3 참조.

#### 4.1.5 AgentBrain (AI Agent 판단 엔진)

**책임**: 단순 메시지 전달이 아닌 "지능형 판단"을 수행하는 핵심 모듈
**파일**: `packages/codex/src/agent-brain.ts` (~250줄)
**구현 수준**: 정규식 + 키워드 기반 (TD-5: LLM API 호출 없음, 레이턴시 0)

```typescript
// ── 의도 유형 ──

export type IntentType =
  | 'FORWARD_TO_CLAUDE'    // 특정 세션에 전달
  | 'ANSWER_FROM_CONTEXT'  // DB 조회로 직접 답변
  | 'SESSION_MANAGEMENT'   // 세션 생성/목록/전환/종료
  | 'PROJECT_QUERY'        // 프로젝트 정보 질의
  | 'MULTI_PROJECT';       // 다중 프로젝트 명령

export interface Intent {
  type: IntentType;
  sessionId?: string;          // FORWARD_TO_CLAUDE 시
  enrichedInput?: string;      // 컨텍스트 주입된 입력
  answer?: string;             // ANSWER_FROM_CONTEXT 시
  action?: 'create' | 'list' | 'switch' | 'close';  // SESSION_MANAGEMENT 시
  sessions?: string[];         // MULTI_PROJECT 시
  confidence: number;          // 0-1
}

// ── AgentBrain 클래스 ──

export class AgentBrain {
  constructor(
    private contextManager: ContextManager,
    private sessionManager: CodexSessionManager,
  ) {}

  /**
   * 입력 분석 — 정규식 패턴 매칭 기반 (LLM 미사용)
   *
   * 판단 우선순위:
   * 1. 세션 관리 명령 (/sessions, /use, /close, /new)
   * 2. 작업 이력 질의 ("어제 뭐 했지?", "최근 작업")
   * 3. 프로젝트 현황 질의 ("진행 상황", "뭐 하고 있어?")
   * 4. 크로스 프로젝트 질의 ("두 프로젝트 비교", "API 호환")
   * 5. 기본: Claude에 전달
   */
  async analyzeIntent(
    input: string,
    source: InputSource,
    currentSessionId?: string,
  ): Promise<Intent> {
    // 1. 세션 관리 명령
    const sessionCmd = this.parseSessionCommand(input);
    if (sessionCmd) return sessionCmd;

    // 2. 작업 이력 질의
    const historyQuery = this.parseHistoryQuery(input);
    if (historyQuery) {
      const answer = await this.answerHistoryQuery(historyQuery);
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.85 };
    }

    // 3. 프로젝트 현황
    if (this.isStatusQuery(input)) {
      const answer = await this.generateStatusReport();
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.9 };
    }

    // 4. 크로스 프로젝트
    if (this.isCrossProjectQuery(input)) {
      const answer = await this.crossProjectReasoning(input);
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.7 };
    }

    // 5. 기본: Claude에 전달 (컨텍스트 인리치먼트 적용)
    return {
      type: 'FORWARD_TO_CLAUDE',
      sessionId: currentSessionId,
      enrichedInput: await this.enrichInput(input, currentSessionId),
      confidence: 0.5,
    };
  }

  /**
   * 응답 인리치먼트 — Claude 응답에 Codex 인사이트 추가
   *
   * 추가하는 정보:
   * - 관련 이전 작업 참조 (비슷한 작업 이력이 있으면)
   * - 실패 패턴 경고 (같은 유형의 이전 실패가 있으면)
   * - 다음 단계 제안 (빌드 성공 후 "테스트 실행 권장" 등)
   */
  async enrichResponse(
    response: ProcessedResponse,
    projectPath: string,
  ): Promise<ProcessedResponse> {
    const context = await this.contextManager.getProjectContext(projectPath);

    // 비슷한 이전 작업 검색
    const similarTasks = context.recentTasks
      .filter(t => this.isSimilarCommand(t.command, response.metadata.sessionId))
      .slice(0, 2);

    // 실패 패턴 경고
    const failPatterns = context.learningPatterns
      .filter(p => p.trigger && response.content.includes(p.trigger))
      .slice(0, 1);

    const insights: string[] = [];

    if (similarTasks.length > 0) {
      const lastSimilar = similarTasks[0];
      if (lastSimilar.success) {
        insights.push(`이전에 비슷한 작업 성공 (${this.timeAgo(lastSimilar.timestamp)})`);
      } else {
        insights.push(`⚠️ 이전에 비슷한 작업 실패 경험 있음`);
      }
    }

    if (failPatterns.length > 0) {
      insights.push(`⚠️ 알려진 패턴: ${failPatterns[0].action}`);
    }

    // 다음 단계 제안
    if (response.type === 'build') {
      insights.push('💡 빌드 완료 — 테스트 실행 권장');
    } else if (response.type === 'error') {
      insights.push('💡 에러 발생 — 로그 확인 후 수정 필요');
    }

    if (insights.length > 0) {
      response.agentInsight = insights.join(' | ');
    }

    return response;
  }

  // ── 패턴 매칭 헬퍼 ──

  private parseSessionCommand(input: string): Intent | null {
    if (/^\/(sessions?|세션)\s*$/i.test(input)) {
      return { type: 'SESSION_MANAGEMENT', action: 'list', confidence: 1.0 };
    }
    if (/^\/use\s+(\S+)/i.test(input)) {
      return { type: 'SESSION_MANAGEMENT', action: 'switch', confidence: 1.0 };
    }
    if (/^\/close/i.test(input)) {
      return { type: 'SESSION_MANAGEMENT', action: 'close', confidence: 1.0 };
    }
    if (/^\/new\s+(.+)/i.test(input)) {
      return { type: 'SESSION_MANAGEMENT', action: 'create', confidence: 1.0 };
    }
    return null;
  }

  private parseHistoryQuery(input: string): string | null {
    const patterns = [
      /(?:어제|오늘|최근|이전에?).*(?:뭐\s*했|작업|히스토리|이력)/,
      /(?:what|recent|history|yesterday).*(?:did|work|task)/i,
    ];
    for (const p of patterns) {
      const match = input.match(p);
      if (match) return input;
    }
    return null;
  }

  private isStatusQuery(input: string): boolean {
    return /(?:진행|현황|상태|뭐.*하고|status|progress|what.*working)/i.test(input);
  }

  private isCrossProjectQuery(input: string): boolean {
    return /(?:두.*프로젝트|양쪽|비교|호환|cross.*project|compare)/i.test(input);
  }

  /**
   * 입력 인리치먼트 — Claude에 보내기 전 컨텍스트 주입
   *
   * 주입 형식:
   * "{원본 입력}
   *
   * [Codex Context]
   * - 프로젝트: {name} ({path})
   * - 기술 스택: {techStack}
   * - 최근 작업: {recentTask}
   * - 관련 패턴: {pattern}"
   */
  private async enrichInput(input: string, sessionId?: string): Promise<string> {
    if (!sessionId) return input;

    const session = this.sessionManager.getSession(sessionId);
    if (!session) return input;

    const context = await this.contextManager.getProjectContext(session.projectPath);
    if (!context.recentTasks.length && !context.learningPatterns.length) return input;

    const parts = [input, '', '[Codex Context]'];

    if (context.techStack.length > 0) {
      parts.push(`- 기술 스택: ${context.techStack.join(', ')}`);
    }
    if (context.recentTasks.length > 0) {
      const last = context.recentTasks[0];
      parts.push(`- 최근 작업: ${last.command} (${last.success ? '성공' : '실패'})`);
    }

    return parts.join('\n');
  }

  private async answerHistoryQuery(query: string): Promise<string> {
    const projects = await this.contextManager.getAllProjects();
    const lines: string[] = ['📋 최근 작업 이력:\n'];

    for (const project of projects) {
      const ctx = await this.contextManager.getProjectContext(project.path);
      if (ctx.recentTasks.length === 0) continue;

      lines.push(`**${project.name}**:`);
      for (const task of ctx.recentTasks.slice(0, 3)) {
        const icon = task.success ? '✅' : '❌';
        lines.push(`  ${icon} ${task.command.slice(0, 80)} (${this.timeAgo(task.timestamp)})`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async generateStatusReport(): Promise<string> {
    const sessions = this.sessionManager.listSessions();
    const lines: string[] = ['📊 프로젝트 현황:\n'];

    for (const session of sessions) {
      const statusIcon = { starting: '🔄', ready: '🟢', busy: '🟡', idle: '⚪', error: '🔴', closed: '⚫' };
      lines.push(`${statusIcon[session.status]} **${session.name}** — ${session.status}`);
      if (session.currentTask) {
        lines.push(`  └ ${session.currentTask}`);
      }
    }

    if (sessions.length === 0) {
      lines.push('활성 세션 없음. `/new {프로젝트경로}`로 생성하세요.');
    }

    return lines.join('\n');
  }

  private async crossProjectReasoning(question: string): Promise<string> {
    const results = await this.contextManager.globalSearch(question, 10);
    if (results.length === 0) return '관련 정보를 찾을 수 없습니다.';

    const lines: string[] = ['🔍 크로스 프로젝트 검색 결과:\n'];
    for (const r of results.slice(0, 5)) {
      lines.push(`**${r.projectName}** (${r.matchType}): ${r.content.slice(0, 100)}`);
    }
    return lines.join('\n');
  }

  private timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return '방금';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
    return `${Math.floor(diff / 86400_000)}일 전`;
  }

  private isSimilarCommand(cmd1: string, cmd2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z가-힣]/g, '');
    return normalize(cmd1).includes(normalize(cmd2).slice(0, 10));
  }
}
```

**AgentBrain 판단 시나리오 예시**:

| 시나리오 | AgentBrain 동작 | Intent.type |
|---------|-----------------|-------------|
| "빌드해줘" | 현재 세션 → enrichInput(techStack 주입) → SESSION_FORWARD | FORWARD_TO_CLAUDE |
| "지금 뭐 하고 있어?" | 전체 세션 상태 수집 → 현황 테이블 생성 → 직접 답변 | ANSWER_FROM_CONTEXT |
| "console에서 에러 났어" | console 컨텍스트에서 최근 에러 패턴 검색 → 이력 첨부 → Claude 전달 | FORWARD_TO_CLAUDE |
| "어제 user-next에서 뭐 했지?" | user-next memory.db FTS5 검색 → 작업 이력 직접 답변 | ANSWER_FROM_CONTEXT |
| "두 프로젝트 API 호환되나?" | 양쪽 프로젝트 globalSearch → 크로스 프로젝트 결과 | ANSWER_FROM_CONTEXT |
| "/sessions" | 세션 목록 명령 → SESSION_MANAGEMENT | SESSION_MANAGEMENT |

---

## 5. 통신 흐름 상세

### 5.1 Telegram → Claude 전달 흐름

```
사용자 Telegram 메시지: "console API에 유저 인증 추가해줘"
    │
    ▼
[Telegram Bot] bot.on('message')
    │ WebSocket
    ▼
[Gateway] 메시지 수신 → 인증 → Codex Orchestrator로 전달
    │
    ▼
[Router] 입력 분석
    │ "console" 키워드 감지 → console 프로젝트 세션 선택
    │ "API에 유저 인증 추가" → 작업 명령으로 분류
    ▼
[AgentBrain] 의도 분석
    │ type: FORWARD_TO_CLAUDE
    │ console 프로젝트 컨텍스트 로드
    │ → 최근 작업 이력, 현재 API 구조 정보 첨부
    │ → enrichedInput: "console/apps/api의 인증 모듈에 유저 인증을 추가해줘.
    │     참고: 현재 Keycloak 기반 인증 사용 중, 최근 Organization 모듈 작업 완료"
    ▼
[SessionManager] console 세션에 전달
    │ tmux send-keys -t olympus-console "enrichedInput" Enter
    ▼
[OutputMonitor] Claude 응답 감지 (pipe-pane)
    │ 출력 수집 → 완료 감지 (프롬프트 복귀)
    ▼
[ResponseProcessor] 응답 가공
    │ → 구조화: type=code, filesChanged=[auth.module.ts, ...]
    │ → 요약: "인증 가드 추가 완료. 3개 파일 수정."
    │ → agentInsight: "Keycloak 연동 확인 필요. E2E 테스트 권장."
    ▼
[Gateway] 브로드캐스트
    │
    ├→ [Telegram Bot] formatForTelegram → 4000자 이내 markdown
    └→ [Dashboard] formatForDashboard → 풀 데이터 + 파일 diff
```

### 5.2 Dashboard Q&A 흐름

```
Dashboard CommandInput: "현재 진행 중인 작업 모두 알려줘"
    │ WebSocket
    ▼
[Gateway] → Codex Orchestrator
    │
    ▼
[Router] 입력 분석
    │ 프로젝트 특정 ❌ → 전체 프로젝트 질문
    │ type: SELF_ANSWER (Claude 전달 불필요)
    ▼
[AgentBrain] 의도 분석
    │ type: ANSWER_FROM_CONTEXT
    │
    ▼
[ContextManager] 모든 프로젝트 현황 수집
    │ console: "API Organization 모듈 개발 중, 빌드 성공"
    │ user-next: "서브도메인 라우팅 작업 중, 테스트 3개 실패"
    │ olympus: "V2 완료, idle 상태"
    ▼
[ResponseProcessor] 응답 생성
    │ → 프로젝트별 현황 테이블
    │ → 주의사항 (user-next 테스트 실패)
    │ → 권장 행동 ("user-next 테스트 먼저 수정 권장")
    ▼
[Dashboard] 풀 데이터 렌더링
    │ → AgentPanel: 응답 표시
    │ → ProjectBrowser: 프로젝트별 상세
```

### 5.3 다중 세션 관리 흐름

```
현재 활성 세션:
  [Session A] olympus-console  ~/dev/console       idle
  [Session B] olympus-user     ~/dev/user-next     busy (빌드 중)
  [Session C] olympus-server   ~/dev/server-node   idle

사용자: "모든 프로젝트 빌드해줘"
    ▼
[Router] type: MULTI_SESSION
[AgentBrain]
    → Session B는 busy → 큐에 추가
    → Session A, C에 동시 전달
    → 순차적으로 결과 수집
    → 전체 결과 통합 보고
```

### 5.4 Gateway ↔ Codex 어댑터 프로토콜

> **이 섹션은 Codex 의견 #3 (최우선 누락 항목)에 해당한다.**

**파일**: `packages/gateway/src/codex-adapter.ts` (~150줄)

#### 5.4.1 메시지 엔벨로프

기존 WS 프로토콜(`packages/protocol/src/messages.ts`)을 확장한다.

```typescript
// 기존 WsMessage (유지)
interface WsMessage<T = unknown> {
  type: string;
  id: string;        // randomUUID
  timestamp: number;
  payload: T;
}

// 신규 Codex 전용 메시지 타입 (packages/protocol/src/codex.ts)
export type CodexMessageType =
  | 'codex:route'           // Gateway → Codex: 사용자 입력 라우팅 요청
  | 'codex:route-result'    // Codex → Gateway: 라우팅 결과
  | 'codex:session-output'  // Codex → Gateway: 세션 출력 (브로드캐스트용)
  | 'codex:answer'          // Codex → Gateway: 자체 답변 (SELF_ANSWER)
  | 'codex:status'          // 양방향: 상태 조회/응답
  | 'codex:session-cmd'     // Gateway → Codex: 세션 관리 명령
  | 'codex:session-event';  // Codex → Gateway: 세션 상태 변경

export interface CodexRoutePayload {
  requestId: string;            // 요청 추적용 (ack/result 매칭)
  input: UserInput;             // 사용자 입력
  source: InputSource;          // 'telegram' | 'dashboard' | 'cli'
  chatId?: number;
  clientId?: string;
}

export interface CodexRouteResultPayload {
  requestId: string;
  decision: RoutingDecision;    // Router 결과
  response?: ProcessedResponse; // SELF_ANSWER인 경우 즉시 응답 포함
}

export interface CodexSessionOutputPayload {
  sessionId: string;
  projectName: string;
  response: ProcessedResponse;  // 가공된 응답
  raw?: string;                 // Dashboard용 원본 (옵션)
}
```

#### 5.4.2 어댑터 통신 패턴

```
Gateway                          Codex Orchestrator
  │                                    │
  │  codex:route { input, source }     │
  │ ──────────────────────────────→    │
  │                                    │ Router.route()
  │  codex:route-result { decision }   │ AgentBrain.analyzeIntent()
  │ ←──────────────────────────────    │
  │                                    │
  │  (if SESSION_FORWARD)              │
  │                                    │ SessionManager.sendToSession()
  │                                    │ OutputMonitor watches...
  │                                    │
  │  codex:session-output { response } │ ResponseProcessor.process()
  │ ←──────────────────────────────    │ AgentBrain.enrichResponse()
  │                                    │
  │  broadcastToAll(session:output)    │
  │ ──→ Telegram / Dashboard           │
```

#### 5.4.3 어댑터 구현

```typescript
// packages/gateway/src/codex-adapter.ts

import { CodexOrchestrator } from '@olympus-dev/codex';
import type { WsMessage } from '@olympus-dev/protocol';

/**
 * Gateway ↔ Codex Orchestrator 어댑터
 *
 * Gateway는 기존 WS 메시지를 받아 Codex에 위임하고,
 * Codex 결과를 기존 브로드캐스트 시스템으로 전달한다.
 *
 * 핵심: Gateway는 라우팅 로직을 모른다. Codex에 위임만 한다.
 */
export class CodexAdapter {
  private codex: CodexOrchestrator;
  private pendingRequests: Map<string, {
    resolve: (result: any) => void;
    timer: NodeJS.Timeout;
  }> = new Map();

  static readonly REQUEST_TIMEOUT = 30_000; // 30초

  constructor(
    codex: CodexOrchestrator,
    private broadcast: (eventType: string, payload: unknown) => void,
  ) {
    this.codex = codex;

    // Codex 이벤트 → Gateway 브로드캐스트
    this.codex.on('session:output', (payload) => {
      this.broadcast('session:output', payload);
    });
    this.codex.on('session:status', (payload) => {
      this.broadcast('codex:session-event', payload);
    });
  }

  /**
   * 사용자 입력 처리 — Gateway가 호출하는 메인 엔트리
   *
   * 기존 agent.handleCommand() 대신 이것을 호출한다.
   * RPC method 'codex.route'로 등록하여 기존 RPC 시스템과 호환.
   */
  async handleInput(input: UserInput): Promise<CodexRouteResultPayload> {
    const requestId = randomUUID().slice(0, 12);

    // Codex Orchestrator에 라우팅 요청
    const result = await this.codex.processInput(input);

    return {
      requestId,
      decision: result.decision,
      response: result.response,
    };
  }

  /**
   * RPC 메서드 등록 — 기존 RpcRouter에 Codex 메서드 추가
   *
   * 기존 RPC 메서드: health, status, agent.command, agent.status, ...
   * 신규 추가: codex.route, codex.sessions, codex.projects, codex.search
   */
  registerRpcMethods(rpcRouter: RpcRouter): void {
    rpcRouter.register('codex.route', async (params) => {
      return this.handleInput(params as UserInput);
    });

    rpcRouter.register('codex.sessions', async () => {
      return this.codex.getSessions();
    });

    rpcRouter.register('codex.projects', async () => {
      return this.codex.getProjects();
    });

    rpcRouter.register('codex.search', async (params) => {
      return this.codex.globalSearch((params as { query: string }).query);
    });
  }
}
```

#### 5.4.4 인증 흐름

기존 Gateway 인증을 그대로 사용한다:
1. 클라이언트 → Gateway: `connect { apiKey }` (기존 `validateWsApiKey()`)
2. Gateway → Codex: 인증 불필요 (같은 프로세스 내 direct call)
3. API Key 형식: `oly_{48 hex chars}` (기존 `generateApiKey()`)
4. 설정 경로: `~/.olympus/config.json` (기존 `CONFIG_FILE`)

#### 5.4.5 타임아웃 및 재시도

| 구간 | 타임아웃 | 재시도 | 에러 처리 |
|------|---------|--------|----------|
| Gateway → Codex (route) | 30초 | 없음 | TIMEOUT 에러 반환 |
| Codex → tmux (send-keys) | 5초 | 2회 | 세션 에러 이벤트 |
| Codex → Claude 응답 대기 | 300초 (5분) | 없음 | 타임아웃 메시지 전달 |
| Codex → DB 쿼리 | 200ms/프로젝트 | 없음 | 부분 결과 반환 |

---

## 6. 마이그레이션 전략 (3단계 점진적 전환)

### 6.1 전환 단계

```
Phase 1: Legacy       Phase 2: Hybrid        Phase 3: Codex
(현재)                 (병렬 운영)              (최종)

Telegram               Telegram               Telegram
    ↓                      ↓                      ↓
Gateway ──→ Agent      Gateway ──→ Codex*     Gateway(경량)
    ↓                      ↓                      ↓
Worker(tmux)           Codex ──→ tmux         Codex ──→ tmux
                       Agent(deprecated)
```

### 6.2 Phase 1: 기반 구축 (현재 유지 + Codex 패키지 생성)

**목표**: 기존 시스템을 건드리지 않고 `packages/codex/` 신규 패키지 생성

**작업 항목**:

| ID | 작업 | 파일 | 예상 공수 |
|----|------|------|----------|
| P1-1 | `packages/codex/` 패키지 스캐폴딩 | package.json, tsconfig.json, src/index.ts | ~50줄 |
| P1-2 | Codex Orchestrator 코어 클래스 | src/orchestrator.ts | ~200줄 |
| P1-3 | Router 모듈 | src/router.ts | ~150줄 |
| P1-4 | SessionManager (기존 코드 추출) | src/session-manager.ts | ~300줄 |
| P1-5 | ResponseProcessor (Digest Engine 통합) | src/response-processor.ts | ~200줄 |
| P1-6 | ContextManager (Shard + Global Index) | src/context-manager.ts | ~250줄 |
| P1-7 | AgentBrain 기초 구현 | src/agent-brain.ts | ~200줄 |
| P1-8 | Protocol 확장 (Codex 메시지 타입) | protocol/src/codex.ts | ~100줄 |
| P1-9 | 단위 테스트 | src/__tests__/*.test.ts | ~400줄 |

**의존성**: `protocol → core → codex`

**성공 기준**:
- `packages/codex/` 빌드 성공
- 단위 테스트 30개+ 통과
- 기존 323개 테스트 변화 없음

### 6.3 Phase 2: Hybrid 모드 (병렬 운영)

**목표**: Gateway에 Codex Orchestrator를 연결하여 병렬 운영

**작업 항목**:

| ID | 작업 | 파일 | 예상 공수 |
|----|------|------|----------|
| P2-1 | Gateway에 Codex 연동 (어댑터 패턴) | gateway/src/codex-adapter.ts | ~150줄 |
| P2-2 | CLI에 `--mode legacy\|hybrid\|codex` 플래그 | cli/src/commands/server.ts | ~50줄 |
| P2-3 | Telegram Bot Codex 연동 | telegram-bot/src/codex-handler.ts | ~200줄 |
| P2-4 | Dashboard Codex 연동 (Q&A 패널) | web/src/components/CodexPanel.tsx | ~300줄 |
| P2-5 | Dashboard 프로젝트 브라우저 | web/src/components/ProjectBrowser.tsx | ~250줄 |
| P2-6 | 통합 테스트 (Codex ↔ Gateway) | codex/src/__tests__/integration.test.ts | ~300줄 |
| P2-7 | E2E 테스트 (Telegram → Codex → tmux) | codex/src/__tests__/e2e.test.ts | ~200줄 |

**전환 플래그**:
```typescript
// CLI에서 모드 선택
olympus server start                    // legacy (기본, 변경 없음)
olympus server start --mode hybrid      // Codex + Gateway 병렬
olympus server start --mode codex       // Codex 중심 (Phase 3 미리보기)
```

**성공 기준**:
- `--mode hybrid`로 시작 시 기존 기능 100% 동작
- Dashboard에서 Q&A 가능
- Telegram에서 프로젝트 지정 명령 가능

### 6.4 Phase 3: Codex 중심 전환

**목표**: Gateway를 경량 WS 프록시로 축소, Codex Orchestrator가 모든 로직 담당

**작업 항목**:

| ID | 작업 | 파일 | 예상 공수 |
|----|------|------|----------|
| P3-1 | Gateway 경량화 (Agent, Worker 제거) | gateway/src/server.ts | -300줄 |
| P3-2 | 기존 Agent 로직 → Codex 이전 | codex/src/agent-brain.ts 확장 | ~200줄 |
| P3-3 | 기존 Worker 로직 → Codex SessionManager | codex/src/session-manager.ts 확장 | ~150줄 |
| P3-4 | 기존 테스트 Codex 대상으로 이전 | codex/src/__tests__/migrated/ | ~600줄 |
| P3-5 | `--mode codex` 기본값 변경 | cli/src/commands/server.ts | ~10줄 |
| P3-6 | 문서 업데이트 | docs/ | ~500줄 |

#### 6.4.1 Gateway Keep/Delete/Move 매트릭스

> **Codex 의견 #2 (두 번째 우선 누락 항목)**

| 파일 | 줄 수 | 처리 | 이유 |
|------|-------|------|------|
| `gateway/src/server.ts` | 663 | **KEEP (축소)** | WS 서버 + 인증 + 브로드캐스트 유지, Agent/Worker 초기화 제거 |
| `gateway/src/auth.ts` | 208 | **KEEP** | 인증은 Gateway 책임 (변경 없음) |
| `gateway/src/cors.ts` | ~50 | **KEEP** | CORS 설정 유지 |
| `gateway/src/api.ts` | ~200 | **KEEP (축소)** | REST API 유지, Agent 엔드포인트 → Codex 위임 |
| `gateway/src/rpc/index.ts` | ~100 | **KEEP (확장)** | Codex RPC 메서드 추가 등록 |
| `gateway/src/rpc/system.ts` | ~80 | **KEEP** | health, status 유지 |
| `gateway/src/rpc/agent.ts` | ~150 | **MOVE → codex** | agent.command 등 → codex.route로 대체 |
| `gateway/src/agent/agent.ts` | 481 | **DELETE (Phase 3)** | CodexOrchestrator가 대체 |
| `gateway/src/agent/analyzer.ts` | ~150 | **MOVE → codex** | Router/AgentBrain이 대체 |
| `gateway/src/agent/planner.ts` | ~130 | **DELETE** | 세션 기반이므로 불필요 |
| `gateway/src/agent/reviewer.ts` | ~120 | **DELETE** | ResponseProcessor가 대체 |
| `gateway/src/agent/reporter.ts` | ~80 | **DELETE** | ResponseProcessor가 대체 |
| `gateway/src/agent/command-queue.ts` | 91 | **MOVE → codex** | 세션별 큐로 확장 |
| `gateway/src/agent/security-guard.ts` | 74 | **MOVE → codex** | 그대로 재사용 |
| `gateway/src/agent/providers/` | ~300 | **KEEP (옵션)** | 향후 AgentBrain LLM 전환 시 사용 |
| `gateway/src/workers/manager.ts` | 242 | **DELETE (Phase 3)** | SessionManager가 대체 |
| `gateway/src/workers/claude-worker.ts` | ~200 | **DELETE** | tmux 세션으로 대체 |
| `gateway/src/workers/api-worker.ts` | ~180 | **KEEP (옵션)** | 향후 직접 API 호출 시 사용 |
| `gateway/src/workers/tmux-worker.ts` | ~150 | **MOVE → codex** | SessionManager에 통합 |
| `gateway/src/workers/docker-worker.ts` | ~170 | **DELETE** | 비목표 (NG3) |
| `gateway/src/session-manager.ts` | 1045 | **MOVE → codex (확장)** | CodexSessionManager의 기반 |
| `gateway/src/memory/store.ts` | 289 | **MOVE → codex** | ContextManager에서 프로젝트별 인스턴스 생성 |
| `gateway/src/memory/patterns.ts` | ~150 | **MOVE → codex** | MemoryStore와 함께 이동 |
| `gateway/src/channels/` | ~200 | **KEEP** | Dashboard/Telegram 채널 유지 |
| `gateway/src/run-manager.ts` | ~250 | **DELETE** | Codex에서는 사용 안 함 |
| `gateway/src/codex-adapter.ts` | ~150 | **NEW (Phase 2)** | Gateway ↔ Codex 연결 어댑터 |

**Gateway server.ts Phase 3 변경 요약** (662줄 → ~300줄):

```diff
- import { CodexAgent } from './agent/agent.js';
- import { CommandAnalyzer } from './agent/analyzer.js';
- import { ExecutionPlanner } from './agent/planner.js';
- import { ResultReviewer } from './agent/reviewer.js';
- import { AgentReporter } from './agent/reporter.js';
- import { createAIProvider } from './agent/providers/index.js';
- import { WorkerManager } from './workers/manager.js';
- import { MemoryStore } from './memory/store.js';
+ import { CodexAdapter } from './codex-adapter.js';
+ import type { CodexOrchestrator } from '@olympus-dev/codex';

  constructor(options: GatewayOptions = {}) {
-   // 60줄의 Agent/Worker/Memory 초기화 → 삭제
+   // Codex Adapter 연결 (외부에서 주입)
+   this.codexAdapter = options.codexAdapter;
+   if (this.codexAdapter) {
+     this.codexAdapter.registerRpcMethods(this.rpcRouter);
+   }
  }
```

**성공 기준**:
- `--mode codex`가 기본
- 기존 기능 100% 동작 (회귀 없음)
- 신규 기능 (전체 프로젝트 Q&A, 다중 세션 관리) 동작
- 전체 테스트 360개+ 통과

---

## 7. 리스크 관리

### 7.1 리스크 매트릭스

| ID | 리스크 | 심각도 | 확률 | 점수 | 완화 전략 | 감지 방법 |
|----|--------|--------|------|------|----------|----------|
| R1 | 기존 테스트 대량 파손 | HIGH | HIGH | 16 | 점진적 3단계 마이그레이션 + Protocol Freeze | CI 파이프라인 자동 검증 |
| R2 | Claude CLI 응답 파싱 불안정 | MED | HIGH | 12 | Digest Engine 재사용 + 정규식 강화 + 타임아웃 | 출력 모니터 로그 + 파싱 실패율 메트릭 |
| R3 | Codex Orchestrator SPOF | HIGH | MED | 9 | Supervisor 패턴 + 상태 DB 복원 | 헬스체크 + 프로세스 모니터 |
| R4 | 다중 tmux 세션 CPU 병목 | MED | MED | 9 | pipe-pane 이벤트 드리븐 + 세션별 독립 모니터 | CPU 사용률 모니터링 |
| R5 | 프로젝트 컨텍스트 DB 성능 저하 | LOW | LOW | 4 | Shard + Global Index 전략 | 쿼리 응답시간 로깅 |
| R6 | Gateway ↔ Codex 어댑터 호환성 | MED | MED | 9 | 어댑터 패턴 + 기존 인터페이스 유지 | 통합 테스트 |
| R7 | 세션 격리 실패 (크로스 프로젝트) | HIGH | LOW | 8 | 세션별 projectPath 바인딩 강제 | 접근 로그 감사 |

### 7.2 Rollback 전략

| 단계 | Rollback 방법 |
|------|-------------|
| Phase 1 실패 | `packages/codex/` 삭제 (기존 코드 영향 없음) |
| Phase 2 실패 | `--mode legacy` 기본값 유지 (어댑터만 비활성화) |
| Phase 3 실패 | `--mode hybrid`로 복귀 (Gateway 로직 아직 존재) |

---

## 8. 테스트 전략

### 8.1 테스트 계층

| 계층 | 대상 | 도구 | 목표 수 |
|------|------|------|---------|
| 단위 테스트 | Router, SessionManager, ResponseProcessor, ContextManager, AgentBrain | vitest | 30+ |
| 통합 테스트 | Codex ↔ Gateway, Codex ↔ tmux | vitest | 10+ |
| E2E 테스트 | Telegram → Codex → Claude → Telegram | qa-tester (tmux) | 5+ |
| 회귀 테스트 | 기존 323개 | vitest | 323 (변화 없음) |

### 8.2 핵심 테스트 시나리오

| ID | 시나리오 | 예상 결과 |
|----|---------|----------|
| T1 | Telegram 메시지 → 올바른 세션 라우팅 | 프로젝트 키워드 기반 세션 선택 |
| T2 | 여러 tmux 세션 동시 관리 | 5개 세션 동시 활성 |
| T3 | Claude 응답 → Telegram 가공 전송 | 4000자 이내, markdown 포맷 |
| T4 | Dashboard Q&A | 3초 이내 응답 |
| T5 | 프로젝트 컨텍스트 전역 검색 | 모든 DB에서 결과 반환 |
| T6 | 세션 자동 발견 (기존 tmux) | 실행 중인 세션 목록 |
| T7 | 세션 크래시 → 자동 복구 | 상태 DB 기반 재생성 |
| T8 | --mode legacy 회귀 | 기존 기능 100% 동작 |

### 8.3 엣지 케이스

| 케이스 | 처리 방법 |
|--------|----------|
| 대상 세션이 busy 상태 | 세션별 CommandQueue에 큐잉 (최대 10개) → 완료 후 순차 처리 |
| 모든 세션이 closed | AgentBrain SELF_ANSWER → "활성 세션 없음. `/new {경로}`로 생성하세요." |
| Claude 응답 타임아웃 (300초) | OutputMonitor NO_OUTPUT_TIMEOUT(10초) × 30 → 타임아웃 메시지 + 재시도 옵션 |
| 프로젝트 DB 없음 (신규 프로젝트) | ContextManager.registerProject() → 자동 디렉토리 + DB 생성 |
| 동시 Telegram + Dashboard 동일 세션 접근 | Gateway broadcastToAll → 양쪽 모두 응답 수신 |
| tmux 서버 크래시 | SessionManager reconcile → 세션 status=error → 자동 재생성 제안 |
| pipe-pane 로그 파일 삭제됨 | OutputMonitor ENOENT 감지 → offset 리셋 → 파일 재생성 |
| FTS5 쿼리 문법 에러 | MemoryStore LIKE 폴백 (기존 구현 그대로) |
| 프로젝트별 DB 잠금 (WAL busy) | better-sqlite3 busy_timeout(5000) 설정 |

### 8.4 테스트 마이그레이션 계획

> **Codex 의견 #10 (세 번째 우선 누락 항목)**

**현재 테스트 분포** (323개):

| 패키지 | 테스트 수 | Phase 3 처리 |
|--------|----------|-------------|
| gateway (agent 관련) | ~60 | **MOVE → codex** |
| gateway (worker 관련) | ~40 | **MOVE → codex** (SessionManager 테스트로) |
| gateway (memory 관련) | ~30 | **MOVE → codex** (ContextManager 테스트로) |
| gateway (RPC/WS/auth) | ~50 | **KEEP** (Gateway 유지) |
| gateway (session-manager) | ~30 | **DUAL-RUN** (Gateway + Codex 양쪽 테스트) |
| gateway (channels) | ~15 | **KEEP** |
| gateway (기타) | ~23 | **KEEP** |
| telegram-bot | 51 | **KEEP** (변경 없음) |
| core | 24 | **KEEP** (변경 없음) |

**마이그레이션 매핑**:

| 기존 테스트 파일 | 신규 위치 | 변환 내용 |
|-----------------|----------|----------|
| `gateway/__tests__/agent.test.ts` | `codex/__tests__/orchestrator.test.ts` | CodexAgent → CodexOrchestrator |
| `gateway/__tests__/analyzer.test.ts` | `codex/__tests__/router.test.ts` | CommandAnalyzer → Router |
| `gateway/__tests__/command-queue.test.ts` | `codex/__tests__/session-queue.test.ts` | 단일 큐 → 세션별 큐 |
| `gateway/__tests__/security-guard.test.ts` | `codex/__tests__/security-guard.test.ts` | 그대로 복사 (인터페이스 동일) |
| `gateway/__tests__/ai-provider.test.ts` | `codex/__tests__/ai-provider.test.ts` | 향후 AgentBrain LLM 전환 시 |
| `gateway/__tests__/worker-manager.test.ts` | `codex/__tests__/session-manager.test.ts` | Worker → Session 개념 전환 |
| `gateway/__tests__/memory-store.test.ts` | `codex/__tests__/context-manager.test.ts` | 단일 DB → Shard+Index |

**Dual-Run 기준**: Phase 2 (Hybrid 모드)에서 `--mode legacy`와 `--mode hybrid` 둘 다 통과해야 함.

**CI 작업 분리** (`.github/workflows/ci.yml` 수정):
```yaml
jobs:
  test-gateway:
    # 기존 gateway 테스트 (Phase 3까지 유지)
    run: pnpm --filter @olympus-dev/gateway test

  test-codex:
    # 신규 codex 테스트
    run: pnpm --filter @olympus-dev/codex test

  test-integration:
    # Gateway ↔ Codex 통합 테스트 (Phase 2부터)
    needs: [test-gateway, test-codex]
    run: pnpm --filter @olympus-dev/codex test -- --grep integration
```

---

## 9. 수락 기준 (Acceptance Criteria)

### 9.1 기능적 수락 기준

| ID | 기준 | 검증 방법 |
|----|------|----------|
| AC1 | Telegram 메시지 → Codex → Claude tmux → 가공 → Telegram 전송 | E2E 테스트 (capture-pane) |
| AC2 | 여러 Claude tmux 세션 동시 관리 (>=5개) | 통합 테스트 |
| AC3 | Dashboard에서 Q&A 입력 → 응답 수신 | E2E 테스트 |
| AC4 | Dashboard에서 모든 프로젝트 컨텍스트 조회 | UI 테스트 |
| AC5 | Codex가 프로젝트별 DB 컨텍스트 통합 기억 | 단위 테스트 |
| AC6 | Codex가 단순 전달 아닌 판단/가공 수행 | Router + AgentBrain 테스트 |
| AC7 | 기존 323개 테스트 유지 + 신규 40개+ | CI 파이프라인 |
| AC8 | `--mode legacy/hybrid/codex` 전환 가능 | 통합 테스트 |

### 9.2 비기능적 수락 기준

| ID | 기준 | 목표치 | 검증 방법 |
|----|------|--------|----------|
| NF1 | Telegram → Claude 전달 지연 | <1초 | 타임스탬프 측정 |
| NF2 | Claude 응답 → Telegram 전송 | <2초 | 타임스탬프 측정 |
| NF3 | Dashboard Q&A 응답 | <3초 | 타임스탬프 측정 |
| NF4 | 메모리 사용량 (Codex 프로세스) | <200MB | 프로세스 모니터 |

---

## 10. DRY Audit (재사용 계획)

### 10.1 재사용할 기존 코드

| 기존 코드 | 위치 | 재사용 방법 | 변경 범위 |
|-----------|------|------------|----------|
| SessionManager | gateway/src/session-manager.ts | 코어 로직 추출 → codex/src/session-manager.ts | 인터페이스 확장 |
| MemoryStore | gateway/src/memory/store.ts | 그대로 재사용 (패키지 이동 또는 import) | DB 경로 파라미터화 |
| PatternManager | gateway/src/memory/pattern-manager.ts | 그대로 재사용 | 없음 |
| Digest Engine | telegram-bot/src/digest/ | ResponseProcessor에서 import | 없음 |
| SecurityGuard | gateway/src/security-guard.ts | 그대로 재사용 | 없음 |
| CommandQueue | gateway/src/command-queue.ts | 세션별 큐로 확장 | 세션 ID 추가 |
| filterOutput | telegram-bot/src/output-filter.ts | ResponseProcessor에서 재사용 | 없음 |
| OlympusClient | client/src/client.ts | Dashboard 연결 유지 | Codex 메시지 타입 추가 |

### 10.2 중복 생성 위험

| 위험 영역 | 기존 코드 | 대응 |
|-----------|----------|------|
| tmux 세션 관리 | gateway/session-manager + telegram-bot/session 관리 | Codex SessionManager로 단일화 |
| 출력 파싱 | telegram-bot/digest + gateway/reporter | ResponseProcessor로 통합 |
| 명령어 큐 | gateway/command-queue | Codex CommandQueue로 이전 |

---

## 11. 엔지니어링 균형 (Engineering Balance)

### 11.1 과잉 엔지니어링 위험

| 위험 | 설명 | 대응 |
|------|------|------|
| AgentBrain의 NLP | 자연어 처리를 위해 외부 LLM API 호출 | ❌ 정규식 + 키워드 매칭으로 충분. 추후 필요 시 확장 |
| 프로젝트 자동 발견 | 파일시스템 전체 스캔으로 프로젝트 탐지 | ❌ 수동 등록 + tmux 세션 발견으로 시작 |
| 분산 메시지 큐 | Redis/RabbitMQ 같은 외부 브로커 | ❌ 인메모리 EventEmitter + SQLite로 충분 |
| 마이크로서비스 분리 | Codex 모듈을 각각 별도 프로세스 | ❌ 단일 프로세스 내 모듈 분리면 충분 |

### 11.2 과소 엔지니어링 위험

| 위험 | 설명 | 대응 |
|------|------|------|
| 에러 처리 부재 | tmux 세션 크래시 무시 | ✅ Supervisor 패턴 + 자동 재시작 필수 |
| 상태 비저장 | Codex 재시작 시 세션 정보 소실 | ✅ 세션 상태 DB 저장 필수 |
| 출력 경계 미정의 | Claude 응답 완료 감지 실패 | ✅ 프롬프트 패턴 감지 + 타임아웃 이중 안전 |

---

## 12. 성능 예산 (Performance Budget)

| 메트릭 | 목표치 | 측정 방법 |
|--------|--------|----------|
| Telegram → Claude 전달 | p50: 200ms, p95: 500ms, p99: 1s | 타임스탬프 diff |
| Claude 응답 가공 | p50: 100ms, p95: 300ms | 프로세싱 타임 |
| Dashboard Q&A | p50: 500ms, p95: 2s, p99: 3s | 요청-응답 시간 |
| 프로젝트 DB 검색 | p50: 50ms, p95: 200ms | SQLite 쿼리 시간 |
| 전역 검색 (5개 DB) | p50: 200ms, p95: 500ms | 병렬 쿼리 합산 |
| Codex 프로세스 메모리 | <200MB (5세션 기준) | RSS 측정 |
| 세션 출력 모니터 CPU | <5% (유휴 시) | top/htop |

---

## 13. 데이터 모델

### 13.1 Global Index DB

```sql
-- ~/.olympus/global.db

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT UNIQUE NOT NULL,
  tech_stack TEXT, -- JSON array
  last_activity INTEGER,
  status TEXT DEFAULT 'active',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE project_search_index (
  project_id TEXT REFERENCES projects(id),
  content TEXT,  -- FTS5 인덱스용 (CLAUDE.md + 최근 작업 요약)
  updated_at INTEGER
);
-- FTS5 가상 테이블
CREATE VIRTUAL TABLE project_fts USING fts5(content, content=project_search_index);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  tmux_session TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  created_at INTEGER,
  last_activity INTEGER
);
```

### 13.2 프로젝트별 Memory DB (기존 MemoryStore 그대로)

```sql
-- ~/.olympus/projects/{name}/memory.db
-- 기존 gateway/src/memory/store.ts의 스키마를 프로젝트별로 복제

CREATE TABLE IF NOT EXISTS completed_tasks (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  analysis TEXT,              -- JSON stringified Analysis
  plan TEXT,                  -- JSON stringified ExecutionPlan
  result TEXT NOT NULL,       -- summary string
  success INTEGER NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL,
  project_path TEXT,
  worker_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS learning_patterns (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used INTEGER NOT NULL
);

-- FTS5 전문 검색 (task command/result/analysis)
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  command, result, analysis,
  content=completed_tasks,
  content_rowid=rowid
);

-- FTS 동기화 트리거 (INSERT/DELETE/UPDATE)
CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON completed_tasks BEGIN
  INSERT INTO tasks_fts(rowid, command, result, analysis)
  VALUES (NEW.rowid, NEW.command, NEW.result, NEW.analysis);
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON completed_tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, command, result, analysis)
  VALUES ('delete', OLD.rowid, OLD.command, OLD.result, OLD.analysis);
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON completed_tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, command, result, analysis)
  VALUES ('delete', OLD.rowid, OLD.command, OLD.result, OLD.analysis);
  INSERT INTO tasks_fts(rowid, command, result, analysis)
  VALUES (NEW.rowid, NEW.command, NEW.result, NEW.analysis);
END;
```

**설정**: WAL mode, maxHistory=1000, pruneHistory() on insert

### 13.3 기존 Context OS DB (변경 없음)

```sql
-- ~/.olympus/contexts.db
-- 기존 core/src/contextStore.ts의 스키마

CREATE TABLE contexts (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,         -- 'workspace' | 'project' | 'task'
  path TEXT NOT NULL UNIQUE,
  parent_id TEXT,
  status TEXT DEFAULT 'active', -- 'active' | 'merged' | 'archived'
  summary TEXT,
  content TEXT,
  version INTEGER DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- context_edges, context_versions, context_merges, operations 테이블 (기존 그대로)
```

### 13.4 기존 Task Store DB (변경 없음)

```sql
-- ~/.olympus/tasks.db
-- 기존 core/src/taskStore.ts의 스키마

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  path TEXT NOT NULL,
  depth INTEGER DEFAULT 0,
  sibling_order INTEGER DEFAULT 0,
  name TEXT NOT NULL,
  context TEXT,
  metadata TEXT,               -- JSON
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 13.5 Memory DB 마이그레이션 스크립트

기존 단일 `~/.olympus/memory.db` → 프로젝트별 분할:

```typescript
// packages/codex/src/migrate-memory.ts

/**
 * 기존 단일 memory.db를 프로젝트별로 분할
 *
 * 실행: olympus migrate-memory
 *
 * 로직:
 * 1. 기존 memory.db의 completed_tasks에서 project_path 추출
 * 2. project_path별로 그룹핑
 * 3. 각 프로젝트 디렉토리에 새 memory.db 생성
 * 4. 해당 프로젝트의 tasks만 INSERT
 * 5. learning_patterns는 모든 프로젝트에 복사 (전역 패턴)
 * 6. 원본 memory.db → memory.db.bak으로 백업
 */
export async function migrateMemoryDb(): Promise<{
  projectCount: number;
  tasksMigrated: number;
  patternsCopied: number;
}> {
  const oldPath = join(homedir(), '.olympus', 'memory.db');
  if (!existsSync(oldPath)) {
    return { projectCount: 0, tasksMigrated: 0, patternsCopied: 0 };
  }

  const oldDb = new SqliteDb(oldPath);
  const tasks = oldDb.prepare('SELECT * FROM completed_tasks').all();
  const patterns = oldDb.prepare('SELECT * FROM learning_patterns').all();

  // project_path별 그룹핑
  const grouped = new Map<string, any[]>();
  for (const task of tasks) {
    const path = (task as any).project_path || 'unknown';
    if (!grouped.has(path)) grouped.set(path, []);
    grouped.get(path)!.push(task);
  }

  let tasksMigrated = 0;
  for (const [projectPath, projectTasks] of grouped) {
    const name = basename(projectPath) || 'unknown';
    const store = new MemoryStore({
      enabled: true,
      dbPath: join(homedir(), '.olympus', 'projects', name, 'memory.db'),
      maxHistory: 1000,
    });
    await store.initialize();

    for (const task of projectTasks) {
      store.saveTask(task);
      tasksMigrated++;
    }

    // 패턴은 모든 프로젝트에 복사
    for (const pattern of patterns) {
      store.savePattern(pattern);
    }

    store.close();
  }

  // 원본 백업
  oldDb.close();
  renameSync(oldPath, oldPath + '.bak');

  return {
    projectCount: grouped.size,
    tasksMigrated,
    patternsCopied: patterns.length * grouped.size,
  };
}
```

---

## 14. 일정 계획

### 14.1 예상 일정

| Phase | 기간 | 핵심 산출물 |
|-------|------|------------|
| Phase 1: 기반 구축 | 1-2일 | packages/codex 패키지, 코어 모듈 5개, 단위 테스트 30+ |
| Phase 2: Hybrid 모드 | 2-3일 | Gateway 어댑터, Dashboard Q&A, Telegram 연동, 통합 테스트 |
| Phase 3: Codex 중심 | 1-2일 | Gateway 경량화, 기존 테스트 이전, 문서 |
| **합계** | **4-7일** | 전체 기능 + 테스트 360+ |

### 14.2 의존성 그래프

```
P1-1 (스캐폴딩)
  ├→ P1-2 (Orchestrator 코어) ──→ P1-3 (Router)
  │                              ├→ P1-5 (ResponseProcessor)
  │                              └→ P1-7 (AgentBrain)
  ├→ P1-4 (SessionManager)
  ├→ P1-6 (ContextManager)
  └→ P1-8 (Protocol 확장)

P1-* 완료 ──→ P2-1 (Gateway 어댑터) ──→ P2-2 (CLI 모드 플래그)
              ├→ P2-3 (Telegram 연동)
              ├→ P2-4 (Dashboard Q&A)
              └→ P2-5 (프로젝트 브라우저)

P2-* 완료 ──→ P3-1 (Gateway 경량화) ──→ P3-5 (기본값 변경)
              ├→ P3-2 (Agent 이전)
              ├→ P3-3 (Worker 이전)
              └→ P3-4 (테스트 이전)
```

---

## 15. 설계 결정 기록 (Trade-off Register)

| ID | 결정 | 고려 옵션 | 선택 | 근거 | 수용한 리스크 | 재검토 시점 |
|----|------|----------|------|------|-------------|------------|
| TD-1 | Gateway 처리 방식 | A: 완전 제거, B: 경량 유지, C: 현상유지+강화 | B | 기존 테스트 보호 + 인증/라우팅 분리 | Codex-Gateway 이중 프로세스 오버헤드 | 안정화 후 통합 검토 |
| TD-2 | Codex 실행 모델 | A: 상시, B: 온디맨드, C: 하이브리드 | C | 레이턴시 + 리소스 균형 | 운영 복잡도 증가 | 리소스 프로파일링 후 |
| TD-3 | Telegram 연결 방식 | A: 직접 연결, B: WS 프록시, C: 메시지 브로커 | B | 멀티채널 확장성 + 기존 코드 호환 | 추가 hop 레이턴시 | 채널 3개+ 시 |
| TD-4 | DB 전략 | A: 단일 통합, B: 프로젝트별, C: Shard+Index | C | 격리성 + 전역 검색 양립 | 마이그레이션 복잡도 | DB 10개+ 시 |
| TD-5 | AgentBrain 구현 수준 | A: 정규식, B: 로컬 LLM, C: 외부 API | A | 현재 요구에 충분, 지연 없음 | 복잡한 의도 파싱 한계 | 오탐률 높아질 때 |
| TD-6 | 마이그레이션 전략 | A: Big Bang, B: 3단계 점진 | B | 리스크 최소화, 롤백 가능 | 구현 기간 증가 | - |

---

---

## 16. Codex Orchestrator 메인 클래스

**파일**: `packages/codex/src/orchestrator.ts` (~200줄)

```typescript
import { EventEmitter } from 'node:events';
import { Router } from './router.js';
import { CodexSessionManager } from './session-manager.js';
import { ResponseProcessor } from './response-processor.js';
import { ContextManager } from './context-manager.js';
import { AgentBrain } from './agent-brain.js';
import type { UserInput, RoutingDecision, ProcessedResponse, ProjectMetadata } from './types.js';

export interface CodexOrchestratorConfig {
  maxSessions?: number;              // 최대 동시 세션 (기본: 5)
  globalDbPath?: string;             // 전역 DB 경로 (기본: ~/.olympus/global.db)
  projects?: ProjectMetadata[];      // 초기 등록 프로젝트 목록
}

export interface CodexProcessResult {
  decision: RoutingDecision;
  response?: ProcessedResponse;      // SELF_ANSWER인 경우
}

/**
 * Codex Orchestrator — 메인 진입점
 *
 * 생명주기:
 * 1. new CodexOrchestrator(config)
 * 2. await orchestrator.initialize()   ← 프로젝트 등록, DB 초기화
 * 3. orchestrator.processInput(input)  ← 메인 루프
 * 4. orchestrator.shutdown()           ← 정리
 *
 * 이벤트:
 * - 'session:output'  — 세션 출력 (브로드캐스트용)
 * - 'session:status'  — 세션 상태 변경
 * - 'error'           — 에러
 */
export class CodexOrchestrator extends EventEmitter {
  private router: Router;
  private sessionManager: CodexSessionManager;
  private responseProcessor: ResponseProcessor;
  private contextManager: ContextManager;
  private agentBrain: AgentBrain;

  constructor(private config: CodexOrchestratorConfig = {}) {
    super();
    this.contextManager = new ContextManager({
      globalDbPath: config.globalDbPath,
    });
    this.sessionManager = new CodexSessionManager({
      maxSessions: config.maxSessions ?? 5,
    });
    this.responseProcessor = new ResponseProcessor();
    this.router = new Router(this.sessionManager, this.contextManager);
    this.agentBrain = new AgentBrain(this.contextManager, this.sessionManager);

    // 세션 출력 이벤트 → ResponseProcessor → 외부 전파
    this.sessionManager.on('session:output', async (event: {
      sessionId: string;
      content: string;
    }) => {
      const session = this.sessionManager.getSession(event.sessionId);
      if (!session) return;

      const response = this.responseProcessor.process(event.content, {
        sessionId: event.sessionId,
        projectName: session.name,
        startTime: session.lastActivity,
      });

      // AgentBrain 인리치먼트
      const enriched = await this.agentBrain.enrichResponse(response, session.projectPath);

      this.emit('session:output', {
        sessionId: event.sessionId,
        projectName: session.name,
        response: enriched,
      });
    });

    // 세션 상태 변경 이벤트 전파
    this.sessionManager.on('session:status', (event) => {
      this.emit('session:status', event);
    });
  }

  /**
   * 초기화 — 프로젝트 등록 + 기존 tmux 세션 발견
   */
  async initialize(): Promise<void> {
    // 설정된 프로젝트 등록
    if (this.config.projects) {
      for (const project of this.config.projects) {
        await this.contextManager.registerProject(project);
      }
    }

    // 기존 tmux 세션 자동 발견
    await this.sessionManager.discoverExistingSessions();
  }

  /**
   * 메인 엔트리 — 사용자 입력 처리
   *
   * 1. Router.route() → 라우팅 결정
   * 2. AgentBrain.analyzeIntent() → 의도 분석
   * 3. 결정에 따라:
   *    - SESSION_FORWARD: SessionManager.sendToSession()
   *    - SELF_ANSWER: AgentBrain 직접 답변
   *    - MULTI_SESSION: 병렬 전달
   *    - CONTEXT_QUERY: ContextManager.globalSearch()
   */
  async processInput(input: UserInput): Promise<CodexProcessResult> {
    const decision = await this.router.route(input);

    switch (decision.type) {
      case 'SELF_ANSWER': {
        const intent = await this.agentBrain.analyzeIntent(
          input.text, input.source
        );
        const answer = intent.answer ?? '응답을 생성할 수 없습니다.';
        return {
          decision,
          response: {
            type: 'text',
            content: answer,
            metadata: { projectName: 'codex', sessionId: '', duration: 0 },
            rawOutput: answer,
          },
        };
      }

      case 'SESSION_FORWARD': {
        const sessionId = decision.targetSessions[0];
        await this.sessionManager.sendToSession(sessionId, decision.processedInput);
        this.router.recordLastSession(input.source, sessionId);
        return { decision };
        // 응답은 session:output 이벤트로 비동기 전달
      }

      case 'MULTI_SESSION': {
        const promises = decision.targetSessions.map(sid =>
          this.sessionManager.sendToSession(sid, decision.processedInput)
            .catch(() => false)
        );
        await Promise.allSettled(promises);
        return { decision };
      }

      case 'CONTEXT_QUERY': {
        const results = await this.contextManager.globalSearch(input.text);
        const content = results.map(r =>
          `**${r.projectName}**: ${r.content.slice(0, 100)}`
        ).join('\n');
        return {
          decision,
          response: {
            type: 'text',
            content: content || '결과 없음',
            metadata: { projectName: 'codex', sessionId: '', duration: 0 },
            rawOutput: content,
          },
        };
      }
    }
  }

  // ── 외부 API (Gateway Adapter에서 호출) ──

  getSessions() {
    return this.sessionManager.listSessions();
  }

  async getProjects() {
    return this.contextManager.getAllProjects();
  }

  async globalSearch(query: string) {
    return this.contextManager.globalSearch(query);
  }

  async shutdown(): Promise<void> {
    // 세션 정리 (tmux 세션은 유지, 모니터링만 중단)
    for (const session of this.sessionManager.listSessions()) {
      session.outputMonitor.stop();
    }
    this.contextManager.close();
  }
}
```

---

## 17. CLI 통합 (server.ts 수정)

**파일**: `packages/cli/src/commands/server.ts`

```typescript
// 기존 CLI 모드 플래그 추가

interface ServerStartOptions {
  mode?: 'legacy' | 'hybrid' | 'codex';  // 기본: 'legacy' (Phase 1-2), 'codex' (Phase 3)
  // ... 기존 옵션
}

// 모드별 초기화 흐름

async function startServer(options: ServerStartOptions) {
  const mode = options.mode ?? 'legacy';

  // 1. Gateway 시작 (모든 모드에서)
  const gateway = new Gateway({ port: 8200, host: '127.0.0.1' });
  await gateway.start();

  if (mode === 'hybrid' || mode === 'codex') {
    // 2. Codex Orchestrator 시작
    const codex = new CodexOrchestrator({
      maxSessions: 5,
      projects: loadProjectsFromConfig(), // ~/.olympus/config.json의 projects 섹션
    });
    await codex.initialize();

    // 3. Gateway ↔ Codex 어댑터 연결
    const adapter = new CodexAdapter(codex, (type, payload) => {
      gateway.broadcastToAll(type, payload);
    });
    adapter.registerRpcMethods(gateway.getRpcRouter());
  }

  if (mode === 'legacy' || mode === 'hybrid') {
    // 4. 기존 Agent/Worker 초기화 (legacy/hybrid만)
    // ... 기존 코드 유지
  }

  // 5. Dashboard 시작 (포트 8201)
  await startDashboardServer(8201, { port: 8200, host: '127.0.0.1', apiKey: config.apiKey });

  // 6. Telegram Bot 시작 (설정 있으면)
  if (isTelegramConfigured()) {
    await startTelegramBot(config);
  }
}
```

---

## 부록

### A. 용어 정의

| 용어 | 정의 |
|------|------|
| Codex Orchestrator | 이 프로젝트에서 개발하는 AI Agent 조율자 (OpenAI Codex와 무관) |
| ManagedSession | Codex가 관리하는 tmux 세션 + 메타데이터 |
| AgentBrain | 단순 전달이 아닌 지능형 판단을 수행하는 핵심 모듈 |
| Global Index | 모든 프로젝트의 메타데이터를 색인한 전역 DB |
| Shard DB | 프로젝트별 독립 SQLite 파일 |

### B. 참고 파일

| 파일 | 설명 |
|------|------|
| packages/gateway/src/server.ts | 현재 Gateway 메인 (리팩토링 대상) |
| packages/gateway/src/agent/agent.ts | 현재 Agent 상태머신 (이전 대상) |
| packages/gateway/src/session-manager.ts | 현재 세션 관리 (추출 대상) |
| packages/telegram-bot/src/digest/ | Digest Engine (재사용 대상) |
| packages/cli/src/commands/server.ts | CLI 진입점 (모드 플래그 추가) |

### C. 기존 코드 상수/설정값 참조표

> **구현 시 이 값들을 그대로 사용해야 한다** (기존 코드에서 추출한 실제 값)

| 상수 | 값 | 출처 |
|------|---|------|
| `DEFAULT_GATEWAY_PORT` | `8200` | protocol/src/messages.ts |
| `DEFAULT_GATEWAY_HOST` | `'127.0.0.1'` | protocol/src/messages.ts |
| `GATEWAY_PATH` | `'/ws'` | protocol/src/messages.ts |
| `HEARTBEAT_INTERVAL_MS` | `30000` (30초) | protocol/src/messages.ts |
| `PROTOCOL_VERSION` | `'0.2.0'` | protocol/src/messages.ts |
| `APPROVAL_TIMEOUT` | `300000` (5분) | gateway/src/agent/agent.ts:275 |
| `COMMAND_QUEUE_MAX` | `50` | gateway/src/agent/command-queue.ts:19 |
| `MAX_CONCURRENT_WORKERS` | `3` | protocol/src/agent.ts (DEFAULT_AGENT_CONFIG) |
| `MAX_QUEUE_SIZE` | `20` | gateway/src/workers/manager.ts:55 |
| `MAX_WORKER_DURATION` | `600000` (10분) | protocol/src/agent.ts (DEFAULT_SECURITY_CONFIG) |
| `MAX_OUTPUT_BUFFER` | `10000000` (10MB) | protocol/src/agent.ts (DEFAULT_WORKER_CONFIG) |
| `MEMORY_MAX_HISTORY` | `1000` | protocol/src/agent.ts (DEFAULT_MEMORY_CONFIG) |
| `MEMORY_DB_PATH` | `'~/.olympus/memory.db'` | protocol/src/agent.ts (DEFAULT_MEMORY_CONFIG) |
| `WORKER_LOG_DIR` | `'~/.olympus/worker-logs'` | protocol/src/agent.ts (DEFAULT_WORKER_CONFIG) |
| `CONFIG_DIR` | `'~/.olympus'` | gateway/src/auth.ts:9 |
| `CONFIG_FILE` | `'~/.olympus/config.json'` | gateway/src/auth.ts:10 |
| `API_KEY_PREFIX` | `'oly_'` | gateway/src/auth.ts:66 |
| `OUTPUT_BUFFER_SIZE` | `20` | gateway/src/session-manager.ts:124 |
| `OUTPUT_MIN_INTERVAL` | `2000` (2초) | gateway/src/session-manager.ts:127 |
| `OUTPUT_MIN_CHANGE` | `5` (chars) | gateway/src/session-manager.ts:129 |
| `OUTPUT_DEBOUNCE_MS` | `1000` (1초) | gateway/src/session-manager.ts:131 |
| `OUTPUT_POLL_INTERVAL` | `500` (0.5초) | gateway/src/session-manager.ts:827 |
| `RECONCILE_INTERVAL` | `30000` (30초) | gateway/src/server.ts:231 |
| `TELEGRAM_MSG_LIMIT` | `4000` | telegram-bot/src/index.ts |
| `OUTPUT_SUMMARY_LIMIT` | `1500` | telegram-bot/src/index.ts |
| `DIGEST_MAX_LENGTH` | `800` | telegram-bot/src/digest/types.ts |
| `DIGEST_DEBOUNCE_MS` | `5000` | telegram-bot/src/digest/types.ts |
| `DIGEST_MAX_BUFFER` | `8000` | telegram-bot/src/digest/types.ts |
| `DIGEST_BUFFER_TTL` | `30000` | telegram-bot/src/digest/types.ts |
| `DASHBOARD_PORT` | `8201` | cli/src/commands/server.ts |
| `CORS_ORIGINS` | `localhost:5173, :3000, :8201` | gateway/src/cors.ts |

### D. Agent 상태 전이 맵 (기존, 참조용)

```typescript
// protocol/src/agent.ts — Codex Orchestrator에서는 사용하지 않지만
// 기존 Agent 호환을 위해 hybrid 모드에서 참조
const AGENT_STATE_TRANSITIONS: Record<AgentState, AgentState[]> = {
  IDLE:      ['ANALYZING', 'INTERRUPT'],
  ANALYZING: ['PLANNING', 'REPORTING', 'IDLE', 'INTERRUPT'],
  PLANNING:  ['EXECUTING', 'IDLE', 'INTERRUPT'],
  EXECUTING: ['REVIEWING', 'INTERRUPT'],
  REVIEWING: ['REPORTING', 'EXECUTING', 'INTERRUPT'],
  REPORTING: ['IDLE'],
  INTERRUPT: ['IDLE'],
};
```

### E. Claude-Codex 합의 이력

```
2026-02-09 Phase -1 합의:
Q1: [DISAGREE 완전제거] → 경량 Gateway 유지 (B)  ✅ 합의
Q2: [SUGGEST 하이브리드] → Supervisor + 온디맨드 (C)  ✅ 합의
Q3: [DISAGREE 직접연결] → WS 프록시 유지 (B)  ✅ 합의
Q4: [SUGGEST 하이브리드] → Shard + Global Index (C)  ✅ 합의
Q5: [AGREE 점진적] → 3단계 마이그레이션  ✅ 합의

✅ Claude-Codex Consensus: 5/5 agreed
```

### F. 문서 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| v1.0 | 2026-02-09 | 초기 작성 (836줄) |
| v2.0 | 2026-02-09 | 프로덕션 구현 수준 상세화 — 전체 TypeScript 인터페이스, DB 스키마, tmux 명령, 상수값, 어댑터 프로토콜, 테스트 매핑, Keep/Delete/Move 매트릭스, 마이그레이션 스크립트 추가 |

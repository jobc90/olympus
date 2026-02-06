# Multi-AI Orchestration Protocol v5.1

> Claude + Codex Co-Leadership 기반 Multi-AI 협업 개발 도구

**활성화**: `/orchestration "요구사항"`
**사용자 요구사항**: $ARGUMENTS

---

## MANDATORY RULES

### Phase 순서 (절대 건너뛰기 금지)

```
Phase -1 → 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
```

### Phase 전환 체크포인트 (매 Phase 시작/종료 시 출력 필수)

```
[CHECKPOINT: Phase {N} 시작/완료]
✓ 산출물: {목록}  ✓ 검증: {항목}  ✓ 선언: "Phase {N} 완료. Phase {N+1}로 이동."
```

### Phase별 필수 산출물

| Phase | 필수 산출물 | 합의 필요 |
|-------|-----------|----------|
| -1 | Complexity Score, Mode Decision | - |
| 0 | Contract Document (6+ sections), /find-skills 결과 | ✅ Codex |
| 1 | Feature Map (max 4 sets), Work Items (4 layers), oracle 리뷰 | ✅ Codex |
| 2 | 검토 결과, SPEC.md | ✅ Codex |
| 3 | PLAN.md, Git Checkpoint, 사용자 승인 | ✅ Codex LOCK_AGREE |
| 4 | 구현 코드, TIME_TO_END, 빌드 성공 | - |
| 5 | momus 리뷰, 병합 완료 | - |
| 6 | 개선 코드, Learning Memory | - |
| 7 | 테스트 통과 | - |
| 8 | Quality Gates 결과 | - |

### 위반 시 즉시 중단 + 복구

- Phase 건너뛰기 → 누락 Phase로 복귀
- 산출물 누락 → Phase 재실행
- Claude 단독 의사결정 (Phase 0-3) → Codex 합의 재실행
- Feature Set >4개 → 4개로 병합
- TIME_TO_END 누락 → 토큰 출력 후 Debugging 진입
- /find-skills 미실행 → Phase 0에서 재실행

### TodoWrite 진행 추적

```
- [ ] Phase -1~8 (각 Phase 완료 시 체크)
```

---

## 전역 설정

### 필수 MCP/Plugin/Skills

- **MCP**: ai-agents, openapi, stitch (선택)
- **Plugins**: postgres-best-practices, vercel-react-best-practices, ui-ux-pro-max
- **Skills**: /find-skills (필수), /webapp-testing, /agent-browser, /frontend-ui-ux, /git-master, /code-reviewer
- **인증**: Gemini OAuth (`~/.gemini/oauth_creds.json`), Codex OAuth (`~/.codex/auth.json`)

### 필수 도구 사용 규칙

1. **Phase 0에서 /find-skills 필수** → 결과를 Contract에 기록
2. **Codex 합의 필수** (Phase 0-3 모든 계획/문서) → codex_analyze 사용
3. **Gemini/Codex에 코드 위임** (Phase 4) → Claude 단독 코딩 금지
4. **Best Practices 필수** → PostgreSQL=Supabase, React/Next.js=Vercel plugin

### UI/UX Signal Detection (Phase -1에서 자동)

Signal Keywords (각 1pt): UI, 디자인, 컴포넌트, 페이지, 레이아웃, 스타일, 색상, 폰트, 반응형, 접근성, 랜딩, 대시보드, 프론트엔드, 웹앱, 애니메이션
Signal 파일확장자 (각 2pt): .tsx, .jsx, .vue, .svelte, .css, .scss, .html

- 0점: 비활성 | 1-2점: 선택적 | **3+점: 자동 활성화** → Phase 0에서 Design System 생성

활성화 시: `python3 skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p "<name>"`
역할분담: DATA(ui-ux-pro-max) + AESTHETICS(frontend-for-opus-4.5) + METHODOLOGY(vs-design-diverge) + PERFORMANCE(react-best-practices) + TESTING(agent-browser)

---

## Architecture & Roles

```
👑 Claude (Orchestrator + Co-Leader)     ◄── Consensus ──►     🤖 Codex (Co-Architect + Co-Leader)
  • 실행 조율, 코드 병합, 품질 판정              • 계획/문서 공동 설계, 거부권 보유
  • 사용자 커뮤니케이션                          • 아키텍처 공동 결정, 백엔드 전문

🎨 Gemini (Frontend Specialist): UI/React 구현, 프론트엔드 검토
```

Phase별 에이전트: Planning(-1~3)=prometheus,oracle,explore | Execution(4~6)=Gemini,Codex,sisyphus-jr | Validation(7~8)=momus,qa-tester,document-writer

### Consensus Protocol (Phase 0-3 필수)

```
Step 1: DRAFT → Claude 초안 작성
Step 2: REVIEW → codex_analyze로 Codex 검토 ([AGREE]/[SUGGEST]/[DISAGREE])
Step 3: RESOLVE → [DISAGREE] 해결 필수 (2회 미합의 → 사용자 결정)
Step 4: CONFIRM → "✅ Claude-Codex Consensus Reached" 표기 (없으면 다음 Phase 이동 금지)
```

예외: Silent Mode(0-4점) 생략 가능 | Fast Mode(5-8점) 1회 검토만 | Codex 타임아웃 3회 → Claude 단독(⚠️경고)

---

## Phase -1: Smart Intake

### 1. 요구사항 정규화

```yaml
normalized_request:
  goal: "목표 (1-2문장)"
  scope: "변경 범위"
  constraints: "제약사항"
  acceptance_criteria: "완료 조건"
```

### 2. 복잡도 평가 (0-20점)

- **IMPACT** (0-5): 0=단일파일 → 5=breaking changes
- **CONTEXT** (0-5): 0=기존패턴 → 5=외부의존성
- **LOGIC** (0-10): 0-2=CRUD → 9-10=실시간/분산

### 3. 모드 결정

| 점수 | 모드 | 행동 |
|------|------|------|
| 0-4 | Silent | Phase 0-8 건너뛰고 즉시 실행. Core agents만. |
| 5-8 | Fast | Phase 0 간소화, Phase 1 생략, 나머지 실행. |
| 9-14 | Suggested | 사용자에게 Full Orchestration 권장 질문. |
| 15-20 | Forced | Full Orchestration 필수. 거부 불가. |

### 4. 산출물

정규화 요구사항 + 복잡도 (IMPACT/CONTEXT/LOGIC/Total) + 모드 + UI/UX Signal Score

---

## Phase 0: Contract-First Design

### 실행 흐름

1. `/find-skills "$ARGUMENTS"` 실행 (필수)
2. UI/UX Signal 3+ → Design System 자동 생성 (ui-ux-pro-max)
3. prometheus agent 호출 (전략 수립)
4. Overall Design (Business Workflow + System Architecture)
5. OpenAPI 자동 감지 → `openapi_load` + `openapi_list_endpoints`
6. Contract Document 생성 (9 sections)
7. **Codex 합의** → Consensus Protocol 수행
8. 사용자 확인

### Contract Document 구조 (9 sections)

```
1. Goal  2. Non-Goals  3. Risks  4. Test Strategy  5. Skills
6. Constraints  7. Overall Design  8. Design System (Signal 3+시)  9. Acceptance Criteria
(+ API Specs: OpenAPI 감지 시)
```

### prometheus 위임

요구사항 분석 → 핵심 목표, 접근 전략(3-5), 주요 리스크(3), 예상 산출물

### Codex 합의

```
codex_analyze: Contract 전체 검토 → [AGREE]/[SUGGEST]/[DISAGREE] → RESOLVE → "✅ Consensus Reached"
```

---

## Feature Specification (5 Fields, 모든 Feature Set 필수)

```yaml
feature_set:
  business_workflow: "사용자 액션 → 시스템 반응 (시간 순서)"
  business_rules: ["검증, 계산, 제약사항"]
  ui_flow: "화면 전환 및 컴포넌트 상호작용"
  data_flow: "상태 변화 및 API 호출"
  contained_components: { UI: [], Hooks: [], API: [], Types: [] }
  interfaces_with_subsequent_feature_sets: [{ to: "FS{N}", contract: "인터페이스 명세" }]
```

---

## Phase 1: Multi-Layer DAG

### 실행 흐름

1. Feature Sets 생성 (max 4개, 5 fields 필수)
2. Work Items 분해 (4 layers: UI, Domain, Infra, Integration)
3. 의존성 그래프 (parallel_safe: true/false)
4. oracle agent 호출 (아키텍처 리뷰)
5. **Codex 아키텍처 합의** → Consensus Protocol
6. FEATURE_MAP.md 생성

### Work Item 구조

```yaml
- id: "WI{FS}-{Layer}-{N}"
  layer: UI|Domain|Infra|Integration
  files: ["경로"]
  dependencies: ["WI IDs"]
  parallel_safe: true|false
```

### oracle 리뷰 항목

순환참조, layer 분리, parallel_safe 판단, 누락 컴포넌트, 성능/보안 리스크 (5점 만점 평가)

---

## Tri-Layer Context (Phase 4에서 Gemini/Codex에 전달)

```yaml
business_context: { domain, user_persona, value_proposition, success_metrics }
design_context: { ui_patterns, component_library, state_management, design_tokens }
implementation_context: { tech_stack, code_style, file_structure }
```

---

## Phase 2: Plan Review

### 실행 흐름

1. `ai_team_analyze` 병렬 검토 (Contract + Feature Map)
2. Learning Memory 조회 (`.sisyphus/learnings.json` 유사 패턴)
3. Best Practices 확인 (Supabase/Vercel)
4. **Devil's Advocate**: "좋다/괜찮다" 금지, **3가지+ 문제점 필수**, 대안 1개+ 필수
5. **Claude-Codex 최종 합의** → codex_analyze [FINAL_AGREE]/[FINAL_DISAGREE]

### 산출물

SPEC.md + PLAN.md + FEATURE_MAP.md 최종본 + RISK.md (모두 ✅ Consensus Reached)

---

## Phase 3: Plan Lock + Checkpoint

### 실행 흐름

1. 계획 요약 출력
2. **Codex Lock** → codex_analyze [LOCK_AGREE]/[LOCK_DISAGREE] (DISAGREE 시 수정 후 재확인, 최대 2회)
3. 사용자 승인 (Silent=자동, Fast=간략+자동, Suggested/Forced=승인 필수)
4. Git Checkpoint: `git checkout -b sisyphus/checkpoint-phase3-$(date +%s) && git add -A && git commit && git checkout -`
5. 계획 LOCK (이후 변경 불가)

---

## Phase 4: Code Execution (2-Phase Development)

### 실행 흐름

1. **Shared Surface 충돌 감지**: Work Item 간 파일 겹침 확인 → 겹치면 순차 실행
   - Forbidden Zones (항상 순차): index.ts, routes/*, config/*, package.json, tsconfig.json, schema.prisma, .env*, docker-compose*
2. Git Checkpoint (phase4 시작)
3. Feature Set 단위 반복:

**Phase A: CODING** (자율적 코드 작성)
- sisyphus-junior/Gemini/Codex에 위임 (Claude 단독 코딩 금지)
- Tri-Layer Context 로드 + file_contents 캐시 활용
- Search-Substitute 전략: `// SEARCH: {file}` 원본 → `// SUBSTITUTE: {file}` 수정본
- 완료 시 **"TIME_TO_END"** 출력 (필수!)
- 예산: 4000 tokens/feature

**Phase B: DEBUGGING** (빌드-수정 루프)
- 자동 빌드 → 에러 → Single-Turn Fix (1번만 수정) → 재빌드
- 최대 3회, 초과 시 Claude 직접 개입
- 예산: 1000 tokens/fix

4. Incremental Design → Overall Design 피드백
5. Git Checkpoint (phase4 완료)

### file_contents Cache

Phase 4 시작 시 관련 파일 캐싱 → tool_calls 없이 NL response만 사용 → 토큰 ~46% 절감

---

## Phase 5: Merge & Review

1. 모든 패치 병합 + 충돌 해결
2. **momus agent** 자동 호출: 코드 품질, 보안(OWASP), 성능(N+1), 타입 안전성, 에러 핸들링, 테스트 커버리지
3. 프론트엔드 → `/agent-browser` UI 검증 (렌더링, 클릭, 폼, 호버, 반응형, 에러/로딩, 키보드)
4. Git Checkpoint

---

## Phase 6: Improvements

1. Phase 5 Fix Request List 정리
2. Learning Memory 자동 주입 (loop ≥ 2: 이전 실패 교훈 주입)
3. `ai_team_patch` 수정 요청
4. **Cross-Review Battle**: Gemini→Codex 공격(3+문제) → Codex→Gemini 공격(3+문제) → 방어/수정 → Claude 판정

---

## Phase 7: Final Test

1. 빌드: `pnpm build` / `npm run build`
2. 린트: `pnpm lint` / `npm run lint`
3. 타입: `pnpm tc` / `npx tsc --noEmit`
4. 테스트: `pnpm test` / `npm test`
5. Core Scenarios Smoke Test (Contract 기반 3개 시나리오)
6. **qa-tester agent** E2E 테스트

---

## Phase 8: Judgment

### Quality Gates

**HARD (필수, 실패→LOOP)**: Build 100%, Lint 0 errors, Type 100%, Tests 100%
**BEHAVIOR (필수, 실패→LOOP)**: Core Scenario 1-3 Pass
**SOFT (경고만)**: Coverage ≥80%, Bundle Size, Complexity

### 판정

- HARD+BEHAVIOR 전체 통과 → **ACCEPT** (최종 보고서 + document-writer)
- 실패 + loop<3 → **LOOP** (Phase 6 복귀, Root Cause → Learning Memory 기록)
- loop≥3 → **ROLLBACK OPTIONS**:
  - [A] Pre-Phase 4 롤백 (코드 취소)
  - [B] Pre-Phase 3 롤백 (계획 재수립)
  - [C] Partial Success (성공 Feature Set만 유지)
  - [D] Full Cancel

### 최종 보고서 (ACCEPT 시)

세션 요약, 변경사항(파일/라인), Quality Gates 결과, AI Team 기여도, Learning Memory, Next Steps

### Productivity Formula

```
Productivity = (Function Completeness - 1) / Cost($)
목표: Productivity ≥ 1.5, FC ≥ 3.5
```

---

## Cross-Cutting Systems

### Learning Memory (.sisyphus/learnings.json)

- Phase 8 실패 시 자동 기록: { task, root_cause, prevention_rule, phase, error_pattern }
- Phase 2: 유사 패턴 경고 | Phase 6 (loop≥2): 교훈 주입
- 매칭: 파일경로 + 에러메시지 + 작업유형 유사도

### Checkpoint & Rollback

- 자동 생성: Phase 3, 4, 5 완료 + 매 Loop 시작 전
- 브랜치: `sisyphus/checkpoint-phase{N}-{timestamp}`
- Rollback: [A] Pre-Phase4 [B] Pre-Phase3 [C] Partial [D] Full Cancel

### Exception Handling

| 예외 | 대응 |
|------|------|
| Gemini/Codex 타임아웃 | 3회 재시도 → 대체 AI → Claude 단독(⚠️) |
| 사용자 무응답 (Phase 3) | 10분 리마인더 → 30분 정지 → 자동 재개 |
| 빌드 실패 | 에러 추출 → Learning Memory → Phase 6 |
| Loop 3회 실패 | Rollback Options [A~D] |
| 컨텍스트 초과 | 요약 + 체크포인트 → 재시작 |

### Progress Dashboard (매 Phase 전환 시 출력)

```
🎯 ORCHESTRATION: "{task}"
Phase N/8 [████░░░░] XX% | Mode: {mode} | Loop: X/3 | Checkpoints: N
Co-Leaders: Claude + Codex | Specialist: Gemini
```

### On-Demand Agent 자동 호출

| Phase | Agent | 트리거 |
|-------|-------|--------|
| 0 | prometheus | /plan 자동 |
| 1 | oracle | 아키텍처 검토 |
| 4 | sisyphus-junior, frontend-engineer | 구현 위임, UI 감지 |
| 5 | momus | 코드 리뷰 |
| 7 | qa-tester | E2E 테스트 |
| 8 | momus, document-writer | 사전 리뷰, 보고서 |
| Any | explore | 코드 검색 |

### Partial Success

Feature Set별 성공/실패 추적 → [1] 성공분만 머지 [2] 실패분 재시도 [3] 전체 재시도 [4] 전체 취소
의존성 있는 FS: 선행 실패 → 후행도 실패 처리

---

## Absolute Rules (⛔ 위반 시 즉시 중단)

**Co-Leadership**: Claude 단독 확정 금지 | Codex 의견 무시 금지 | Consensus 없이 Phase 이동 금지
**Phase**: 순서 건너뛰기 금지 | 체크포인트 누락 금지 | 산출물 없이 이동 금지
**Feature Map**: >4 FS 금지 | 5 fields 누락 금지 | 순환 의존성 금지
**2-Phase Dev**: Coding에서 자체 검토 금지 | TIME_TO_END 필수 | Single-Turn Fix | 빌드 실패→Phase 5 이동 금지
**Devil's Advocate**: "좋다/괜찮다" 금지 | <3 문제점 금지 | 대안 없는 비판 금지
**도구**: /find-skills 필수 | Claude 단독 의사결정 금지 | Best Practices 무시 금지
**보안**: API 키 하드코딩 금지 | SQL Injection/XSS/CSRF 금지

---

## Reference

**EvoDev 논문**: Feature Map(DAG), Tri-Layer Context, 2-Phase Development, 56.8% 성능 향상
v5.0 적용: 5 fields, max 4 sets, TIME_TO_END, file_contents, Multi-Layer DAG
v5.1 적용: Claude-Codex Co-Leadership, Consensus Protocol

---

## EXECUTION START

```
🚀 AIOS v5.1 (Claude-Codex Co-Leadership)
Phase -1→0→1→2→3→4→5→6→7→8 순서 실행
Phase 0-3: Consensus Protocol 필수 | Phase 3,4,5: Git Checkpoint | Phase 8 실패→Phase 6 (max 3, 초과→Rollback)
```

## 사용자 요구사항

```
$ARGUMENTS
```

## ⚡ BEGIN

**[CHECKPOINT: Phase -1 시작]**
- 필수 입력: 사용자 요구사항 ✓
- "Phase -1: Smart Intake 시작합니다."

**Phase -1을 지금 수행하라.**

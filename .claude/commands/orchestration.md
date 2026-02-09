# Multi-AI Orchestration Protocol v5.3

> Claude + Codex Co-Leadership 기반 Multi-AI 협업 개발 도구
> v5.3: Deep Engineering Protocol — 모든 산출물 3배 확장, 트레이드오프 기반 의사결정, 10시간급 실행

**활성화**: `/orchestration "요구사항"` | `/orchestration --plan "요구사항"` | `/orchestration --strict "요구사항"`
**사용자 요구사항**: $ARGUMENTS

### 승인 모드 파싱

$ARGUMENTS에서 플래그를 파싱하여 승인 모드를 결정합니다:
- `--plan` → Approval 모드 (Phase 3, 8에서 사용자 확인)
- `--strict` → Strict 모드 (모든 Phase 전환 시 사용자 승인)
- 플래그 없음 → **Auto 모드 (기본값, 사용자 개입 없이 전자동 실행)**
- 플래그는 요구사항 텍스트에서 제거 후 나머지를 요구사항으로 사용

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

### Phase별 필수 산출물 (v5.3 — 3배 확장)

| Phase | 필수 산출물 | 예상 분량 | 합의 필요 |
|-------|-----------|----------|----------|
| -1 | Normalized Request (12필드), Complexity Matrix, Risk Pre-scan, Stakeholder Map | ~2000자 | - |
| 0 | Contract Document (15 sections), Architecture Blueprint, DRY Audit, Security Model | ~8000자 | ✅ Codex |
| 1 | Feature Map (max 4 sets, 12필드/set), Work Item Design Sheets, Coupling Matrix, SPOF Analysis | ~6000자 | ✅ Codex |
| 2 | 4-Section Review (Arch/Quality/Test/Perf), SPEC.md, PLAN.md, RISK.md, Trade-off Register | ~8000자 | ✅ Codex |
| 3 | Implementation Playbook, Pre-flight Checklist (30항목), Rollback Strategy, Resource Map | ~4000자 | ✅ Codex LOCK_AGREE |
| 4 | 구현 코드, WI별 Design Decision Log, DRY Compliance Check, Build Report | 코드+~3000자 | - |
| 5 | Two-Stage Review (4-Section each), Minimal Diff Audit, Fix Request Matrix | ~6000자 | - |
| 6 | 개선 코드, Cross-Review Battle Report, Learning Memory | 코드+~2000자 | - |
| 7 | Test Evidence Report (capture-pane 증거), Edge Case Matrix, Performance Profile | ~4000자 | - |
| 8 | Quality Gates Report, Technical Debt Assessment, Final Summary, Maintenance Guide | ~5000자 | - |

### 엔지니어링 선호사항 (전 Phase 적용)

> 이 선호사항은 모든 의사결정, 리뷰, 코드 작성에 반드시 반영합니다.

1. **DRY 최우선**: 중복은 적극적으로 감지하고 지적. 기존 코드 재사용 가능하면 반드시 재사용
2. **적절한 엔지니어링**: 과소(취약, 임시방편, 해키) ❌ | 과잉(성급한 추상화, 불필요 복잡성) ❌
3. **명시적 > 영리한 코드**: 트릭보다 가독성, 마법보다 명시성
4. **모든 이슈에 트레이드오프**: "그냥 이렇게" 금지. 반드시 2-3개 옵션 + 각 옵션의 공수/리스크/영향/유지보수 부담 제시
5. **가정 금지**: 방향 결정 전 반드시 근거 제시, 불확실하면 사용자 확인

### 위반 시 즉시 중단 + 복구

- Phase 건너뛰기 → 누락 Phase로 복귀
- 산출물 미달 (분량 50% 미만) → Phase 재실행
- Claude 단독 의사결정 (Phase 0-3) → Codex 합의 재실행
- Feature Set >4개 → 4개로 병합
- TIME_TO_END 누락 → 토큰 출력 후 Debugging 진입
- /find-skills 미실행 → Phase 0에서 재실행
- **트레이드오프 없는 의사결정 → 해당 결정 재수행** (v5.3)

### TodoWrite 진행 추적

```
- [ ] Phase -1: Smart Intake (12필드 정규화)
- [ ] Phase 0: Contract-First Design (15 sections)
- [ ] Phase 1: Multi-Layer DAG (12필드 Feature Spec)
- [ ] Phase 2: 4-Section Deep Review
- [ ] Phase 3: Implementation Playbook + Lock
- [ ] Phase 4: Code Execution + Design Decision Log
- [ ] Phase 5: Two-Stage Deep Review
- [ ] Phase 6: Improvements + Cross-Review Battle
- [ ] Phase 7: Evidence-Based Test Suite
- [ ] Phase 8: Comprehensive Judgment
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
3. **Gemini/Codex 제안 수집 후 Claude 직접 구현** (Phase 4) → ai_team_patch로 제안 수집 → Claude가 취합·판단·직접 코딩
4. **Best Practices 필수** → PostgreSQL=Supabase, React/Next.js=Vercel plugin
5. **모든 설계 결정에 트레이드오프 문서화** (v5.3) → "아무것도 안 하기" 옵션 포함 2-3개 대안 제시

### UI/UX Signal Detection (Phase -1에서 자동)

Signal Keywords (각 1pt): UI, 디자인, 컴포넌트, 페이지, 레이아웃, 스타일, 색상, 폰트, 반응형, 접근성, 랜딩, 대시보드, 프론트엔드, 웹앱, 애니메이션
Signal 파일확장자 (각 2pt): .tsx, .jsx, .vue, .svelte, .css, .scss, .html

- 0점: 비활성 | 1-2점: 선택적 | **3+점: 자동 활성화** → Phase 0에서 Design System 생성

활성화 시: `python3 skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p "<name>"`
역할분담: DATA(ui-ux-pro-max) + AESTHETICS(frontend-for-opus-4.5) + METHODOLOGY(vs-design-diverge) + PERFORMANCE(react-best-practices) + TESTING(agent-browser)

---

## Architecture & Roles

```
👑 Claude (Orchestrator + Co-Leader + Implementor)  ◄── Consensus ──►  🤖 Codex (Co-Architect + Co-Leader)
  • 실행 조율, 품질 판정                              • 계획/문서 공동 설계, 거부권 보유
  • Gemini/Codex 제안 취합 → 직접 코드 구현           • 아키텍처 공동 결정, 백엔드 전문
  • 사용자 커뮤니케이션                                • 코드 제안(패치) 제공

🎨 Gemini (Frontend Advisor): UI/React 패치 제안, 프론트엔드 검토
```

Phase별 에이전트: Planning(-1~3)=prometheus,oracle,explore | Execution(4~6)=Gemini(제안),Codex(제안),Claude(구현) | Validation(7~8)=momus,qa-tester,document-writer

### Agent Role Boundaries (v5.2 — oh-my-claudecode 패턴)

| 역할 | 에이전트 | 허용 | 금지 |
|------|---------|------|------|
| **Orchestrator** | Claude | 파일 읽기, 진행 추적, 에이전트 조율, 직접 코드 구현(Phase 4) | - |
| **Advisor** | Gemini, Codex | 패치 제안, 분석, 리뷰 | 직접 코드 수정 |
| **Analyst** | oracle, prometheus, metis | 아키텍처 분석, 요구사항 분석, 전략 수립 | 코드 수정, 에이전트 위임 |
| **Reviewer** | momus, qa-tester | 코드 리뷰, 테스트 실행 | 코드 수정, 아키텍처 결정 |
| **Executor** | explore, document-writer | 코드 검색, 문서 작성 | 아키텍처 결정, 품질 판정 |

**Handoff Protocol**: 에이전트 간 위임 시 반드시 context를 전달
- oracle → "아키텍처 재검토 필요" → Phase 1 복귀
- momus → "품질 미달" → Phase 6 복귀
- qa-tester → "테스트 실패" → Phase 6 복귀 (evidence 첨부 필수)

### Consensus Protocol (Phase 0-3 필수)

```
Step 1: DRAFT → Claude 초안 작성
Step 2: REVIEW → codex_analyze로 Codex 검토 ([AGREE]/[SUGGEST]/[DISAGREE])
Step 3: RESOLVE → [DISAGREE] 해결 필수 (2회 미합의 → 사용자 결정)
Step 4: CONFIRM → "✅ Claude-Codex Consensus Reached" 표기 (없으면 다음 Phase 이동 금지)
```

예외: Silent Mode(0-4점) 생략 가능 | Fast Mode(5-8점) 1회 검토만 | Codex 타임아웃 3회 → Claude 단독(⚠️경고)

---

## Phase -1: Smart Intake (Deep Analysis)

### 1. 요구사항 정규화 (12필드 — v5.3 확장)

```yaml
normalized_request:
  # 기본 정보 (4필드)
  goal: "핵심 목표 (1-2문장, 측정 가능한 성공 기준 포함)"
  scope: "변경 범위 (파일/모듈 수준으로 구체적 명시)"
  constraints: "기술적·비즈니스 제약사항 (성능, 호환성, 일정, 예산)"
  acceptance_criteria: "완료 조건 (각 항목 pass/fail로 측정 가능해야 함)"

  # 컨텍스트 분석 (4필드 — v5.3 신규)
  stakeholders: "영향받는 사용자/시스템/팀 목록"
  existing_patterns: "재사용 가능한 기존 코드/패턴 (DRY 분석 기초)"
  related_features: "연관된 기존 기능/모듈 (의존성 초기 식별)"
  tech_debt_areas: "알려진 기술 부채 영역 (주의 필요 구간)"

  # 리스크 사전 평가 (4필드 — v5.3 신규)
  security_requirements: "인증, 권한, 데이터 보호, API 경계 요구사항"
  performance_requirements: "응답시간, 처리량, 메모리, 동시 접속 목표치"
  integration_points: "외부 시스템/API 연동 지점 및 의존성"
  rollback_complexity: "실패 시 복원 난이도 (1=즉시 revert 가능 ~ 5=DB 마이그레이션 필요)"
```

### 2. 복잡도 매트릭스 (0-20점)

- **IMPACT** (0-5): 0=단일파일 → 3=다중 모듈 → 5=breaking changes
  - 변경 파일 수 예상: _____개
  - 신규 파일 수 예상: _____개
  - 영향받는 기존 테스트: _____개
- **CONTEXT** (0-5): 0=기존패턴 → 3=새 라이브러리 → 5=외부의존성
  - 외부 API 의존: _____개
  - 새 패키지 필요: _____개
  - DB 스키마 변경: Yes/No
- **LOGIC** (0-10): 0-2=CRUD → 5-6=비즈니스 로직 → 9-10=실시간/분산
  - 알고리즘 복잡도: O(_____)
  - 동시성 처리: Yes/No
  - 트랜잭션 경계: _____개

### 3. 리스크 사전 스캔 (v5.3 신규)

```yaml
risk_prescan:
  # 각 리스크: severity(1-5) × probability(1-5) = score
  architectural_risks:
    - risk: "설명"
      severity: N
      probability: N
      mitigation: "초기 완화 전략"
  security_risks:
    - risk: "설명"
      severity: N
      probability: N
      mitigation: "초기 완화 전략"
  performance_risks:
    - risk: "설명"
      severity: N
      probability: N
      mitigation: "초기 완화 전략"
  integration_risks:
    - risk: "설명"
      severity: N
      probability: N
      mitigation: "초기 완화 전략"
```

### 4. 모드 결정

| 점수 | 모드 | 행동 |
|------|------|------|
| 0-4 | Silent | Phase 0-8 건너뛰고 즉시 실행. Core agents만. |
| 5-8 | Fast | Phase 0 간소화, Phase 1 생략, 나머지 실행. |
| 9-14 | Suggested | Auto 모드: 자동으로 Full Orchestration 진행. Approval/Strict: 사용자에게 권장 질문. |
| 15-20 | Forced | Full Orchestration 필수. 거부 불가. |

### 5. 산출물 체크리스트

- [ ] 12필드 정규화 요구사항 완성
- [ ] 복잡도 매트릭스 (IMPACT/CONTEXT/LOGIC 각 수치 + 세부 근거)
- [ ] 리스크 사전 스캔 (최소 4개 리스크, severity×probability 점수)
- [ ] 모드 결정 + 근거
- [ ] UI/UX Signal Score
- [ ] 기존 코드베이스 패턴 분석 (재사용 가능한 것 목록)

---

## Phase 0: Contract-First Design (Deep Contract)

### 실행 흐름

1. `/find-skills "$ARGUMENTS"` 실행 (필수)
2. **기존 코드베이스 탐색** — explore agent로 관련 코드 전체 스캔 (v5.3)
3. UI/UX Signal 3+ → Design System 자동 생성 (ui-ux-pro-max)
4. prometheus agent 호출 (전략 수립)
5. Overall Design (Business Workflow + System Architecture)
6. OpenAPI 자동 감지 → `openapi_load` + `openapi_list_endpoints`
7. **DRY Audit** — 재사용 가능한 기존 코드/패턴/컴포넌트 전수 조사 (v5.3)
8. Contract Document 생성 **(15 sections — v5.3 확장)**
9. **Codex 합의** → Consensus Protocol 수행
10. 사용자 확인 (Approval/Strict 모드일 때만; Auto 모드는 자동 진행)

### Contract Document 구조 (15 sections — v5.3)

아래 15개 섹션을 **모두** 작성해야 합니다. 각 섹션은 최소 3-5개 구체적 항목을 포함해야 합니다.

```yaml
CONTRACT:
  # --- 핵심 (기존 유지) ---
  1_Goal:
    primary: "핵심 목표 (측정 가능)"
    secondary: ["부가 목표 1", "부가 목표 2"]
    success_metrics: ["정량적 지표 1", "정량적 지표 2", "정량적 지표 3"]

  2_NonGoals:
    explicit_exclusions: ["이번에 하지 않을 것 1", "2", "3"]
    future_considerations: ["나중에 할 수 있는 것 1", "2"]
    scope_boundary: "여기까지만. 이 선을 넘으면 범위 확장"

  3_Risks:
    # 최소 5개, 각각 severity×probability 점수 + 구체적 완화 전략
    - risk: "설명"
      severity: "HIGH/MEDIUM/LOW"
      probability: "HIGH/MEDIUM/LOW"
      mitigation: "구체적 완화 전략"
      owner: "Claude/Gemini/Codex/사용자"
      detection: "이 리스크가 현실화되면 어떻게 감지하는가"

  4_TestStrategy:
    unit_tests:
      targets: ["테스트할 함수/모듈 목록"]
      edge_cases: ["명시적 엣지 케이스 목록 (최소 5개)"]
      coverage_target: "80%+"
    integration_tests:
      scenarios: ["통합 시나리오 목록 (최소 3개)"]
      dependencies: ["목 필요한 외부 의존성"]
    e2e_tests:
      critical_paths: ["핵심 사용자 경로 (최소 3개)"]
      evidence_method: "capture-pane 기반"
    error_path_tests:
      failure_modes: ["테스트할 실패 모드 (최소 5개)"]
      recovery_behaviors: ["각 실패 모드의 예상 복구 동작"]

  5_Skills:
    found_skills: ["/find-skills 결과"]
    installed_skills: ["설치한 스킬 목록"]
    relevant_plugins: ["적용할 플러그인 (postgres-best-practices, vercel-react 등)"]

  6_Constraints:
    technical: ["기술 제약사항 (버전, 호환성, 라이브러리)"]
    business: ["비즈니스 제약사항 (일정, 규정, 정책)"]
    performance: ["성능 제약 (응답시간 <Xms, 메모리 <XMB)"]
    security: ["보안 제약 (인증 방식, 데이터 암호화, CORS)"]

  # --- v5.3 확장 (3배 분량 핵심) ---
  7_ArchitectureBlueprint:
    system_overview: "시스템 전체 구조도 (ASCII 다이어그램)"
    dependency_graph: "모듈 간 의존성 그래프 (A→B→C)"
    coupling_analysis:
      tight_couplings: ["밀접 결합 지점 + 해소 전략"]
      loose_couplings: ["느슨한 결합으로 유지할 지점"]
    data_flow:
      primary_paths: ["주요 데이터 흐름 경로 (최소 3개)"]
      bottleneck_candidates: ["잠재적 병목 지점 + 근거"]
    scalability:
      current_limits: "현재 처리 한계"
      target_capacity: "목표 용량"
      spof_points: ["단일 실패 지점 (최소 2개) + 대책"]
    security_architecture:
      auth_model: "인증/인가 모델"
      data_access_boundaries: ["데이터 접근 경계 (누가 무엇에 접근)"]
      api_boundaries: ["API 경계 및 검증 규칙"]
      sensitive_data: ["민감 데이터 목록 + 보호 전략"]

  8_DesignSystem: "(UI/UX Signal 3+ 시에만)"
    tokens: "디자인 토큰 (색상, 타이포, 간격)"
    components: "재사용 컴포넌트 목록"
    patterns: "반복 UI 패턴"

  9_AcceptanceCriteria:
    # 최소 8개, 각각 pass/fail 측정 가능
    functional: ["기능적 수락 기준 (최소 5개)"]
    non_functional: ["비기능적 수락 기준 (최소 3개) — 성능, 보안, 접근성"]
    verification_method: "각 기준의 검증 방법 명시"

  # --- v5.3 완전 신규 ---
  10_DRYAudit:
    reusable_code: ["재사용 가능한 기존 코드/함수/컴포넌트 (file:line)"]
    similar_patterns: ["유사한 기존 구현 (참고/확장 가능)"]
    shared_utilities: ["공유 유틸리티/헬퍼 (이미 존재하는 것)"]
    duplication_risks: ["중복 생성 위험 영역 (이것을 새로 만들면 기존 X와 중복)"]
    reuse_plan: "기존 코드를 어떻게 활용할지 구체적 계획"

  11_EngineeringBalance:
    overengineering_risks: ["과잉 엔지니어링 위험 (성급한 추상화, 불필요 복잡성)"]
    underengineering_risks: ["과소 엔지니어링 위험 (해키, 임시방편, 취약한 구조)"]
    balance_decisions:
      - area: "결정 영역"
        options: ["옵션 A (간단)", "옵션 B (중간)", "옵션 C (복잡)"]
        recommendation: "추천 옵션 + 근거"
        tradeoffs: "각 옵션의 공수/리스크/유지보수 부담"

  12_PerformanceBudget:
    response_time: "목표 응답시간 (p50, p95, p99)"
    memory_budget: "메모리 사용 한도"
    bundle_size: "번들 크기 한도 (프론트엔드)"
    db_query_budget: "쿼리 수/응답시간 한도"
    caching_strategy: "캐싱 전략 (어디서, 무엇을, 얼마나)"

  13_DataModel:
    entities: ["엔티티 목록 + 필드"]
    relationships: ["관계 (1:N, N:M 등)"]
    migrations: ["필요한 마이그레이션"]
    backward_compatibility: "기존 데이터와의 호환성 전략"

  14_IntegrationMap:
    internal_apis: ["내부 API 연동 지점"]
    external_apis: ["외부 API 연동 (URL, 인증, 제한)"]
    event_flows: ["이벤트/메시지 흐름"]
    error_contracts: ["API 에러 규약 (상태코드, 에러 형식)"]

  15_RollbackStrategy:
    per_feature_set: "Feature Set별 독립 롤백 가능 여부"
    data_rollback: "데이터 롤백 전략 (마이그레이션 reverse)"
    checkpoint_plan: "Git 체크포인트 생성 시점"
    partial_deploy: "부분 배포 가능 여부 + 전략"

  API_Specs: "(OpenAPI 감지 시) 엔드포인트 목록 + 스키마"
```

### prometheus 위임

요구사항 분석 → 다음을 모두 포함하는 결과물 필수:
- 핵심 목표 재정의 (Phase -1 목표와 일관성 검증)
- 접근 전략 3-5개 (각각 트레이드오프 분석 포함)
- 주요 리스크 5개+ (severity×probability 매트릭스)
- 예상 산출물 목록 (파일 단위)
- **기존 코드 재사용 기회** (DRY 관점)
- **과잉/과소 엔지니어링 경고** (균형 관점)

### Codex 합의

```
codex_analyze: Contract 전체 (15 sections) 검토
→ 각 섹션별 [AGREE]/[SUGGEST]/[DISAGREE]
→ DISAGREE 섹션 해결 필수
→ "✅ Consensus Reached (15/15 sections agreed)"
```

### 산출물 체크리스트

- [ ] /find-skills 실행 완료
- [ ] 기존 코드베이스 탐색 완료 (explore agent)
- [ ] Contract Document 15 sections 모두 작성
- [ ] DRY Audit: 재사용 가능 코드 목록 ≥3개
- [ ] Engineering Balance: 과잉/과소 위험 각 ≥2개
- [ ] Risk Matrix: 리스크 ≥5개 (severity×probability 점수)
- [ ] Architecture Blueprint: 의존성 그래프 + SPOF + 보안 모델
- [ ] Test Strategy: unit/integration/e2e/error-path 모두 명시
- [ ] Performance Budget: 정량적 목표치 설정
- [ ] Codex Consensus: 15/15 sections agreed
- [ ] 사용자 확인 완료 (Approval/Strict 모드일 때만; Auto 모드는 자동 진행)

---

## Feature Specification (12 Fields — v5.3 확장)

```yaml
feature_set:
  # 기존 5 Fields
  business_workflow: "사용자 액션 → 시스템 반응 (시간 순서, 분기 포함)"
  business_rules: ["검증 규칙", "계산 로직", "제약사항", "예외 상황 처리"]
  ui_flow: "화면 전환 및 컴포넌트 상호작용 (상태별 UI 포함)"
  data_flow: "상태 변화, API 호출, 캐싱 전략 (시퀀스 다이어그램)"
  contained_components: { UI: [], Hooks: [], API: [], Types: [], Utils: [] }

  # v5.3 확장 7 Fields
  error_scenarios:
    - trigger: "에러 발생 조건"
      expected_behavior: "시스템 반응"
      user_feedback: "사용자에게 보여줄 메시지/UI"
      recovery: "복구 경로"
  edge_cases: ["엣지 케이스 1 (입력 경계값)", "2 (동시 접속)", "3 (네트워크 불안정)", "4 (대량 데이터)", "5 (권한 부족)"]
  dry_analysis:
    reusing: ["재사용할 기존 코드 (file:line)"]
    extending: ["확장할 기존 패턴"]
    new_only: ["정말 새로 만들어야 하는 것 (기존에 없음을 확인)"]
  performance_expectations:
    response_time: "예상 응답시간"
    data_volume: "예상 데이터 볼륨"
    concurrent_users: "예상 동시 사용자"
  security_considerations: ["인증 요구사항", "권한 체크 포인트", "입력 검증 규칙", "XSS/CSRF 방어"]
  testing_requirements:
    unit: ["단위 테스트 대상 (함수/메서드)"]
    integration: ["통합 테스트 시나리오"]
    edge_case_tests: ["엣지 케이스 테스트"]
  interfaces_with_subsequent_feature_sets: [{ to: "FS{N}", contract: "인터페이스 명세", breaking_change_risk: "HIGH/LOW" }]
```

---

## Phase 1: Multi-Layer DAG (Deep Architecture)

### 실행 흐름

1. Feature Sets 생성 (max 4개, **12 fields 필수** — v5.3)
2. Work Items 분해 (4 layers: UI, Domain, Infra, Integration)
3. **Work Item Design Sheets** 작성 (v5.3 — 각 WI별 구현 설계)
4. 의존성 그래프 (parallel_safe: true/false)
5. **Coupling Matrix 생성** (v5.3 — 모듈 간 결합도 분석)
6. **SPOF Analysis** (v5.3 — 단일 실패 지점 식별)
7. oracle agent 호출 (아키텍처 리뷰)
8. **Codex 아키텍처 합의** → Consensus Protocol
9. FEATURE_MAP.md 생성

### Work Item 구조 (v5.3 확장)

```yaml
- id: "WI{FS}-{Layer}-{N}"
  title: "Work Item 제목"
  layer: UI|Domain|Infra|Integration
  files: ["경로"]
  dependencies: ["WI IDs"]
  parallel_safe: true|false

  # v5.3 Design Sheet (각 WI별 필수)
  design_sheet:
    approach: "구현 접근법 (1-2문장)"
    reusing: ["재사용할 기존 코드 (DRY)"]
    new_code: ["새로 작성할 코드 (구체적 함수/클래스명)"]
    tradeoff:
      options: ["옵션 A (설명)", "옵션 B (설명)"]
      chosen: "선택한 옵션 + 근거"
      effort: "예상 공수 (lines of code 또는 시간)"
    error_handling: "에러 처리 전략"
    test_plan: "이 WI의 테스트 방법"
```

### Coupling Matrix (v5.3 신규)

```
        WI1-UI  WI1-Domain  WI2-UI  WI2-Domain  ...
WI1-UI    -       HIGH       LOW      NONE
WI1-Dom  HIGH      -         NONE     MEDIUM
WI2-UI   LOW      NONE        -       HIGH
...
```

- HIGH: 같은 파일 수정 → 순차 필수
- MEDIUM: 같은 모듈 다른 파일 → 주의하며 병렬
- LOW: 다른 모듈 → 안전하게 병렬
- NONE: 무관

### SPOF Analysis (v5.3 신규)

```yaml
spof_analysis:
  - point: "단일 실패 지점 설명"
    impact: "실패 시 영향 범위"
    probability: "발생 가능성"
    mitigation: "완화 전략"
    monitoring: "감지 방법"
```

### oracle 리뷰 항목 (v5.3 확장)

oracle 에이전트에 다음을 **모두** 리뷰 요청:

1. **의존성 그래프**: 순환참조 여부, 과도한 결합 지점
2. **Layer 분리**: UI/Domain/Infra 경계 위반
3. **parallel_safe 판단**: Coupling Matrix 기반 정확성
4. **누락 컴포넌트**: 필요하지만 빠진 Work Item
5. **성능 리스크**: N+1 쿼리, 과도한 렌더링, 대량 데이터 처리
6. **보안 리스크**: 인증 우회, 권한 에스컬레이션, 입력 검증 누락
7. **DRY 위반 가능성**: 기존 코드와 중복 생성 위험
8. **과잉/과소 엔지니어링**: 불필요한 추상화 or 부족한 구조화
9. **엣지 케이스 누락**: Feature Spec의 edge_cases 충분성
10. **테스트 용이성**: 각 WI가 독립적으로 테스트 가능한지

(10점 만점 평가, 7점 미만 → 해당 항목 수정 후 재리뷰)

### 산출물 체크리스트

- [ ] Feature Sets (max 4개) × 12 fields 모두 작성
- [ ] Work Items: 각각 Design Sheet 포함
- [ ] Coupling Matrix: 모든 WI 간 결합도
- [ ] SPOF Analysis: 최소 2개 식별
- [ ] oracle 리뷰: 10항목 모두 7점+
- [ ] Codex Consensus: Feature Map 합의
- [ ] FEATURE_MAP.md 생성

---

## Tri-Layer Context (Phase 4에서 Gemini/Codex에 전달)

```yaml
business_context:
  domain: "도메인 설명"
  user_persona: "대상 사용자 프로필"
  value_proposition: "이 기능이 제공하는 가치"
  success_metrics: "성공 측정 기준 (정량적)"
  business_rules: "핵심 비즈니스 규칙 (Contract §3에서 추출)"

design_context:
  ui_patterns: "사용할 UI 패턴"
  component_library: "재사용 컴포넌트 목록 (DRY Audit에서 추출)"
  state_management: "상태 관리 전략"
  design_tokens: "디자인 토큰 (있는 경우)"
  error_states: "에러 상태 UI 패턴"

implementation_context:
  tech_stack: "기술 스택 상세"
  code_style: "코딩 컨벤션 (naming, structure)"
  file_structure: "파일 구조 컨벤션"
  existing_patterns: "기존 코드 패턴 (DRY 참조)"
  performance_constraints: "성능 제약 (Performance Budget에서 추출)"
```

---

## Phase 2: 4-Section Deep Review (v5.3)

> 사용자 제공 엔지니어링 리뷰 프롬프트를 Phase 2에 완전 통합

### 실행 흐름

1. `ai_team_analyze` 병렬 검토 (Contract 15 sections + Feature Map)
2. Learning Memory 조회 (`.sisyphus/learnings.json` 유사 패턴)
3. Best Practices 확인 (Supabase/Vercel)
4. **4-Section Deep Review 수행** (v5.3 핵심)
5. **Devil's Advocate**: "좋다/괜찮다" 금지, **5가지+ 문제점 필수**, 대안 1개+ 필수 (v5.3: 3→5로 상향)
6. **Trade-off Register 작성** (v5.3 — 모든 결정의 트레이드오프 기록)
7. **Claude-Codex 최종 합의** → codex_analyze [FINAL_AGREE]/[FINAL_DISAGREE]

### Section 1: Architecture Review

Contract §7 (Architecture Blueprint) + Feature Map 기반으로 다음을 평가:

```yaml
architecture_review:
  # 각 이슈별: 문제 설명 + 2-3 옵션 + 각 옵션의 (공수/리스크/영향/유지보수) + 추천
  dependency_coupling:
    findings: ["발견사항 (file:line 참조)"]
    issues:
      - id: "ARCH-1"
        description: "문제 구체적 설명 (file:line 포함)"
        options:
          A: { description: "옵션 A", effort: "LOW/MED/HIGH", risk: "LOW/MED/HIGH", impact: "설명", maintenance: "설명" }
          B: { description: "옵션 B", effort: "...", risk: "...", impact: "...", maintenance: "..." }
          C: { description: "아무것도 안 하기", effort: "NONE", risk: "설명", impact: "설명", maintenance: "설명" }
        recommendation: "옵션 X 추천. 이유: ..."

  data_flow_bottlenecks:
    findings: ["발견사항"]
    issues: [같은 구조]

  scalability_spof:
    findings: ["발견사항"]
    issues: [같은 구조]

  security_architecture:
    findings: ["발견사항"]
    issues: [같은 구조]
```

**규칙**: 섹션당 최소 2개, 최대 4개 핵심 이슈. 이슈 없으면 "검토 완료, 이슈 없음" 명시.

### Section 2: Code Quality Review

기존 코드 + 계획된 변경 기반:

```yaml
code_quality_review:
  code_organization:
    findings: ["모듈 구조 발견사항"]
    issues: [ARCH-1 구조와 동일]

  dry_violations:
    # ⚠️ 특히 적극적으로 지적
    findings: ["DRY 위반 (기존 코드 file:line과 중복되는 계획)"]
    issues: [같은 구조]

  error_handling:
    findings: ["에러 처리 누락/불완전 지점"]
    missing_edge_cases: ["누락된 엣지 케이스 (명시적 나열)"]
    issues: [같은 구조]

  tech_debt_hotspots:
    findings: ["기술 부채 핫스팟"]
    issues: [같은 구조]

  engineering_balance:
    overengineered: ["과잉 엔지니어링 우려 영역 + 근거"]
    underengineered: ["과소 엔지니어링 우려 영역 + 근거"]
    issues: [같은 구조]
```

### Section 3: Test Review

Contract §4 (Test Strategy) + Feature Spec의 testing_requirements 기반:

```yaml
test_review:
  coverage_gaps:
    unit: ["단위 테스트 커버리지 갭"]
    integration: ["통합 테스트 커버리지 갭"]
    e2e: ["E2E 테스트 커버리지 갭"]
    issues: [같은 구조]

  test_quality:
    weak_assertions: ["약한 assertion (exists만 확인, 값 미검증)"]
    missing_negative_tests: ["누락된 네거티브 테스트"]
    issues: [같은 구조]

  edge_case_coverage:
    boundary_values: ["경계값 테스트 누락"]
    concurrent_access: ["동시 접근 테스트 누락"]
    large_data: ["대량 데이터 테스트 누락"]
    issues: [같은 구조]

  failure_mode_testing:
    untested_errors: ["테스트되지 않은 에러 경로"]
    recovery_untested: ["미검증 복구 동작"]
    issues: [같은 구조]
```

### Section 4: Performance Review

Contract §12 (Performance Budget) 기반:

```yaml
performance_review:
  db_access:
    n_plus_1: ["N+1 쿼리 위험 지점"]
    missing_indexes: ["인덱스 누락 가능성"]
    issues: [같은 구조]

  memory_usage:
    large_objects: ["메모리 과다 사용 우려"]
    leak_risks: ["메모리 릭 위험"]
    issues: [같은 구조]

  caching_opportunities:
    cacheable: ["캐싱 가능한 데이터/연산"]
    invalidation_strategy: ["캐시 무효화 전략"]
    issues: [같은 구조]

  complexity_hotspots:
    high_complexity: ["O(n²)+ 코드 경로"]
    hot_paths: ["자주 실행되는 고비용 경로"]
    issues: [같은 구조]
```

### Trade-off Register (v5.3 신규)

Phase 2 전체에서 발견된 모든 결정을 기록:

```yaml
tradeoff_register:
  - id: "TD-1"
    decision: "결정 내용"
    options_considered: ["옵션 A", "옵션 B", "아무것도 안 하기"]
    chosen: "선택된 옵션"
    rationale: "선택 근거"
    risks_accepted: "수용한 리스크"
    revisit_trigger: "이 결정을 재검토해야 하는 시점/조건"
```

### 산출물 체크리스트

- [ ] Section 1 (Architecture): 이슈 2-4개, 각각 트레이드오프 분석
- [ ] Section 2 (Code Quality): DRY 위반 적극 지적, 엔지니어링 균형 평가
- [ ] Section 3 (Test): 커버리지 갭, 엣지 케이스, 실패 모드 모두 검토
- [ ] Section 4 (Performance): N+1, 메모리, 캐싱, 복잡도 검토
- [ ] Devil's Advocate: 문제점 5개+, 대안 각 1개+
- [ ] Trade-off Register: 모든 결정 기록
- [ ] SPEC.md + PLAN.md + FEATURE_MAP.md + RISK.md 최종본
- [ ] Codex Consensus: FINAL_AGREE

---

## Phase 3: Implementation Playbook + Lock (v5.3)

### 실행 흐름

1. **Implementation Playbook 작성** (v5.3 — 기존 "계획 요약"을 대폭 확장)
2. **Pre-flight Checklist** (30항목 — v5.3)
3. **Codex Lock** → codex_analyze [LOCK_AGREE]/[LOCK_DISAGREE]
4. 사용자 승인 (Auto=자동, Approval/Strict=사용자 확인 필요)
5. Git Checkpoint
6. 계획 LOCK (이후 변경 불가)

### Implementation Playbook (v5.3 신규)

```yaml
playbook:
  execution_order:
    - step: 1
      feature_set: "FS1"
      work_items: ["WI1-Infra-1", "WI1-Domain-1"]
      rationale: "인프라부터 → 도메인 의존성 해소"
      estimated_effort: "~X lines, ~Y 파일"
      potential_blockers: ["잠재적 블로커"]
      fallback_plan: "블로커 발생 시 대안"

    - step: 2
      feature_set: "FS1"
      work_items: ["WI1-UI-1", "WI1-Integration-1"]
      parallel_with: ["step 1의 남은 WI (parallel_safe 확인)"]
      ...

  resource_map:
    files_to_create: ["신규 파일 목록 (경로)"]
    files_to_modify: ["수정 파일 목록 (경로 + 예상 변경 범위)"]
    files_to_delete: ["삭제 파일 목록"]
    packages_to_install: ["새 패키지 (버전 포함)"]
    configs_to_update: ["설정 변경 (tsconfig, eslint, etc.)"]

  risk_mitigations:
    - risk: "Phase 0에서 식별된 리스크"
      implementation_guard: "코딩 중 이 리스크를 방지하는 구체적 조치"

  rollback_strategy:
    per_feature_set:
      FS1: "롤백 방법"
      FS2: "롤백 방법"
    data_rollback: "DB 변경 롤백 전략"
    partial_deploy: "부분 배포 전략"
```

### Pre-flight Checklist (30항목 — v5.3)

```yaml
preflight:
  # 환경 (5항목)
  - [ ] 개발 환경 정상 동작 확인 (빌드 성공)
  - [ ] 기존 테스트 100% 통과 확인
  - [ ] 필요한 패키지/도구 사용 가능 확인
  - [ ] API 키/인증 정보 유효 확인
  - [ ] 디스크 공간/메모리 충분 확인

  # 계획 (10항목)
  - [ ] Contract 15 sections 모두 완성
  - [ ] Feature Map 모든 WI에 Design Sheet 존재
  - [ ] Coupling Matrix에서 HIGH 결합 → 순차 실행 확인
  - [ ] DRY Audit 결과 반영 (재사용 코드 식별됨)
  - [ ] Engineering Balance 결정 모두 기록
  - [ ] Trade-off Register 완성
  - [ ] Performance Budget 설정됨
  - [ ] Test Strategy에 edge_cases + error_paths 포함
  - [ ] Security considerations 모든 Feature Set에 명시
  - [ ] Rollback strategy Feature Set별 준비됨

  # 합의 (5항목)
  - [ ] Phase 0 Codex Consensus (15/15)
  - [ ] Phase 1 Codex Architecture Consensus
  - [ ] Phase 2 Codex Final Agree
  - [ ] oracle 리뷰 10항목 모두 7점+
  - [ ] 4-Section Review 이슈 모두 해결 또는 수용

  # 리스크 (5항목)
  - [ ] RISK.md에 모든 리스크 기록됨
  - [ ] 각 리스크에 mitigation + detection 명시
  - [ ] SPOF 대책 수립됨
  - [ ] Learning Memory 유사 패턴 경고 확인
  - [ ] Rollback checkpoint 생성 준비

  # 실행 준비 (5항목)
  - [ ] 실행 순서 결정 (Playbook execution_order)
  - [ ] 병렬 실행 가능한 WI 식별됨
  - [ ] Shared Surface 충돌 감지 완료
  - [ ] file_contents 캐싱 대상 파일 식별
  - [ ] Git branch clean (uncommitted changes 없음)
```

### 산출물 체크리스트

- [ ] Implementation Playbook (실행 순서, 리소스 맵, 리스크 완화, 롤백)
- [ ] Pre-flight Checklist 30항목 모두 ✓
- [ ] Codex LOCK_AGREE
- [ ] 사용자 승인 (Approval/Strict 모드일 때만; Auto 모드는 자동 진행)
- [ ] Git Checkpoint 생성

---

## Phase 4: Code Execution (2-Phase Development + Design Decision Log)

### 실행 흐름

1. **Shared Surface 충돌 감지**: Work Item 간 파일 겹침 확인 → 겹치면 순차 실행
   - Forbidden Zones (항상 순차): index.ts, routes/*, config/*, package.json, tsconfig.json, schema.prisma, .env*, docker-compose*
2. Git Checkpoint (phase4 시작)
3. Feature Set 단위 반복:

**Phase A: CODING** (제안 수집 → Claude 직접 구현)

- Step 1: **AI 제안 수집** — `ai_team_patch`로 Gemini/Codex에 패치 제안 요청
  - Gemini: UI/프론트엔드 관점 패치 (unified diff)
  - Codex: 백엔드/구조 관점 패치 (unified diff)
  - **Tri-Layer Context 전체 전달** (business + design + implementation)
  - **DRY Audit 결과 전달** ("이 기존 코드를 재사용하라")
- Step 2: **취합·판단 + Design Decision Log** — Claude가 양측 제안을 검토
  - 겹치는 파일: 더 나은 쪽 선택 또는 양측 장점 병합
  - 충돌하는 설계: **트레이드오프 분석 후** Claude 판단으로 최종 결정
  - 누락된 부분: Claude가 보완
  - **각 결정을 Design Decision Log에 기록** (v5.3):
    ```yaml
    decision_log:
      - wi: "WI1-UI-1"
        decision: "Gemini 제안의 컴포넌트 구조 채택"
        rationale: "기존 패턴과 일관성, DRY 준수"
        rejected: "Codex 제안 (새 추상화 불필요 — 과잉 엔지니어링)"
        tradeoff: "Gemini 방식은 확장성 약간 낮지만, 현재 요구에 적합"
    ```
- Step 3: **Claude 직접 구현** — Read/Edit/Write 도구로 코드 작성·수정
  - Tri-Layer Context 참조
  - file_contents 캐시 활용
  - 모든 파일 변경을 Claude가 직접 수행
  - **구현 중 DRY 체크**: 코드 작성 전 "이미 존재하는 유사 코드가 있는가?" 확인
  - **Engineering Balance 체크**: "이 추상화가 정말 필요한가?" / "이 구현이 너무 해키하지 않은가?"
- Step 4: **Per-WI Verification** (v5.3 — 각 WI 구현 후 즉시 검증)
  - 해당 WI의 테스트 실행
  - DRY 위반 없음 확인
  - 에러 처리 누락 없음 확인
- 완료 시 **"TIME_TO_END"** 출력 (필수!)

**Phase B: DEBUGGING** (빌드-수정 루프)
- 자동 빌드 → 에러 → Claude 직접 Single-Turn Fix (1번만 수정) → 재빌드
- 최대 3회
- 3회 초과 시 `ai_team_analyze`로 원인 분석 후 재시도

4. Incremental Design → Overall Design 피드백
5. Git Checkpoint (phase4 완료)

### Critical Failure Modes (Phase 4)

- ❌ Gemini/Codex 제안 없이 직접 코딩 시작 (반드시 ai_team_patch 먼저)
- ❌ 양측 제안을 검토 없이 한쪽만 채택
- ❌ Shared Surface 충돌 무시하고 병렬 실행
- ❌ TIME_TO_END 출력 누락
- ❌ 빌드 실패 상태에서 Phase 5로 이동
- ❌ "빠른 수정"이라며 ai_team_patch 생략
- ❌ Design Decision Log 미작성 (v5.3)
- ❌ DRY Audit 무시하고 기존 코드 중복 생성 (v5.3)
- ❌ 과잉/과소 엔지니어링 경고 무시 (v5.3)

### Success Criteria (Phase 4)

- [ ] ai_team_patch로 Gemini/Codex 양측 제안 수집 완료
- [ ] Design Decision Log: 모든 설계 결정 기록 (트레이드오프 포함)
- [ ] DRY Compliance: 기존 코드 재사용 계획 이행 확인
- [ ] Engineering Balance: 과잉/과소 없음 확인
- [ ] 모든 Work Items 구현 완료
- [ ] Per-WI Verification 모두 통과
- [ ] TIME_TO_END 출력됨
- [ ] 빌드 성공 (Phase B 완료)
- [ ] Git Checkpoint 생성됨

### file_contents Cache

Phase 4 시작 시 관련 파일 캐싱 → tool_calls 없이 NL response만 사용 → 토큰 ~46% 절감

---

## Phase 5: Two-Stage Deep Review (v5.3)

### Stage 1: Specification Compliance (필수)

1. 모든 패치 병합 + 충돌 해결
2. **Contract 요구사항 대조 매트릭스** (v5.3 — 기존 단순 확인을 매트릭스로 확장):
   ```yaml
   compliance_matrix:
     - criteria: "Contract §9 Acceptance Criteria #1"
       status: "PASS/FAIL/PARTIAL"
       evidence: "구현 위치 (file:line)"
       gaps: "미충족 사항 (있을 경우)"
     - criteria: "..."
       ...
   ```
   - Phase 0 Contract의 Acceptance Criteria (8개+) 전체 대조
   - Feature Specification의 12 fields 구현 여부
   - 누락된 Work Items 확인
   - **Non-Goal 침범 여부 확인** (Contract §2에서 명시한 "하지 않을 것"을 했는가?)
3. **빌드/테스트 기본 검증**: `pnpm build && pnpm test` 통과 여부
4. Stage 1 실패 시 → **Phase 6로 직접 복귀** (Stage 2 생략, 시간 절약)

### Stage 2: 4-Section Code Quality Review (Stage 1 통과 시에만)

Phase 2의 4-Section Review 구조를 **구현된 코드에** 적용:

**Section A: Architecture Review (구현 코드)**
```yaml
  - dependency_coupling: "실제 구현의 의존성/결합도 문제"
  - data_flow_issues: "데이터 흐름 병목/이상"
  - scalability_concerns: "확장성 우려 (구현 기준)"
  - security_gaps: "보안 허점 (인증/권한/입력검증)"
```

**Section B: Code Quality Review (구현 코드)**
```yaml
  - dry_violations: "중복 코드 (기존 코드와 또는 신규 코드 간) — ⚠️ 적극 지적"
  - error_handling_gaps: "에러 처리 누락/불완전 — 엣지 케이스별 명시"
  - engineering_balance: "과잉/과소 엔지니어링 영역"
  - tech_debt_introduced: "새로 도입된 기술 부채"
  - naming_clarity: "명시적이지 않은 이름/로직"
```

**Section C: Test Review (구현 코드)**
```yaml
  - coverage_gaps: "테스트 커버리지 갭 (unit/integration/e2e)"
  - assertion_strength: "약한 assertion (값 미검증, 존재만 확인)"
  - edge_case_missing: "누락된 엣지 케이스 테스트"
  - error_path_missing: "미테스트된 실패 경로"
```

**Section D: Performance Review (구현 코드)**
```yaml
  - n_plus_1: "N+1 쿼리/반복 호출"
  - memory_concerns: "메모리 사용량 우려"
  - caching_missed: "캐싱 기회 놓침"
  - complexity_hotspots: "높은 복잡도 코드 경로 (O(n²)+)"
```

5. **momus agent** 자동 호출: 위 4-Section 결과를 기반으로 최종 리뷰
   - **Severity 등급**: CRITICAL / HIGH / MEDIUM / LOW
   - CRITICAL 또는 HIGH → Phase 6 복귀 (MEDIUM/LOW는 경고만)
   - **각 이슈에 대해**:
     - 파일/라인 참조와 함께 문제 구체적 설명
     - 2-3개 옵션 (아무것도 안 하기 포함)
     - 각 옵션: 공수, 리스크, 영향, 유지보수 부담
     - 추천 옵션 + 근거

6. **Minimal Viable Diff 검증**:
   - [ ] 불필요한 리팩토링 없음
   - [ ] 단일 용도 추상화 미생성
   - [ ] 범위 확장 없음 (Non-Goal 침범 없음)
   - [ ] 스타일 변경과 로직 변경 미혼합
   - [ ] 변경이 요청된 범위 내에만 존재

7. 프론트엔드 → `/agent-browser` UI 검증 (렌더링, 클릭, 폼, 호버, 반응형, 에러/로딩, 키보드)
8. Git Checkpoint

### Fix Request Matrix (v5.3 — Phase 6으로 전달)

```yaml
fix_requests:
  critical:
    - id: "FIX-1"
      section: "B (Code Quality)"
      issue: "문제 설명 (file:line)"
      severity: "CRITICAL"
      fix_approach: "수정 방향"
  high:
    - id: "FIX-2"
      ...
  medium_warnings:
    - id: "WARN-1"
      ...
```

### Critical Failure Modes (Phase 5)

- ❌ Stage 1 실패인데 Stage 2 진행 (시간 낭비)
- ❌ momus CRITICAL/HIGH 이슈 무시하고 Phase 7 이동
- ❌ 충돌 해결 시 양측 코드 모두 삭제
- ❌ Minimal Diff 위반 (범위 외 코드 수정)
- ❌ 4-Section Review 생략 (v5.3)
- ❌ Fix Request Matrix 미작성 (v5.3)

### Success Criteria (Phase 5)

- [ ] Stage 1: Compliance Matrix 전체 PASS
- [ ] Stage 1: Non-Goal 침범 없음
- [ ] Stage 1: 빌드 + 테스트 통과
- [ ] Stage 2-A: Architecture 이슈 해결/수용
- [ ] Stage 2-B: DRY 위반 0건, Engineering Balance 적정
- [ ] Stage 2-C: 테스트 커버리지 갭 해결
- [ ] Stage 2-D: Performance 이슈 해결/수용
- [ ] momus CRITICAL/HIGH 이슈 0건
- [ ] Minimal Viable Diff 검증 통과
- [ ] Fix Request Matrix 작성 완료
- [ ] Git Checkpoint 생성됨

---

## Phase 6: Improvements (Deep Fix)

1. **Fix Request Matrix 기반 수정** — Phase 5에서 전달된 FIX-N 항목 순서대로 처리
2. Learning Memory 자동 주입 (loop ≥ 2: 이전 실패 교훈 주입)
3. `ai_team_patch` 수정 요청 (Fix Request Matrix 전달)
4. **Cross-Review Battle** (v5.3 강화):
   - Gemini→Codex 공격: 5+ 문제점 지적 (기존 3→5)
   - Codex→Gemini 공격: 5+ 문제점 지적
   - 방어/수정 사이클
   - Claude 최종 판정 + 트레이드오프 기록
5. **DRY 재점검**: 수정 과정에서 새로운 중복이 생기지 않았는지 확인
6. **Engineering Balance 재점검**: 수정이 과잉/과소가 아닌지 확인

### 산출물 체크리스트

- [ ] Fix Request Matrix의 CRITICAL/HIGH 전부 해결
- [ ] Cross-Review Battle 완료 (각 5+ 공격)
- [ ] DRY 재점검 통과
- [ ] Engineering Balance 재점검 통과
- [ ] Learning Memory 업데이트

---

## Phase 7: Evidence-Based Test Suite (v5.3)

### 1. Build Pipeline (전체 실행)

```
빌드: pnpm build / npm run build
린트: pnpm lint / npm run lint
타입: pnpm tc / npx tsc --noEmit
테스트: pnpm test / npm test
```

### 2. Core Scenarios Smoke Test (Contract §9 기반)

Contract의 Acceptance Criteria에서 **최소 5개** 핵심 시나리오 (기존 3→5, v5.3):

```yaml
smoke_tests:
  - scenario: "시나리오 설명"
    steps: ["단계 1", "단계 2", "단계 3"]
    expected: "예상 결과"
    evidence: "capture-pane 출력 또는 스크린샷"
    result: "PASS/FAIL"
```

### 3. Edge Case Test Matrix (v5.3 신규)

Feature Spec의 edge_cases에서 추출 + 추가 식별:

```yaml
edge_case_matrix:
  boundary_values:
    - case: "빈 입력"
      test: "빈 문자열/null/undefined 입력 시 동작"
      evidence: "capture-pane"
      result: "PASS/FAIL"
    - case: "최대값 입력"
      ...
  concurrent_access:
    - case: "동시 요청"
      ...
  network_failure:
    - case: "API 타임아웃"
      ...
  permission:
    - case: "권한 없는 접근"
      ...
  large_data:
    - case: "대량 데이터 (1000+ rows)"
      ...
```

### 4. Error Path Testing (v5.3 신규)

Contract §4의 error_path_tests + Feature Spec의 error_scenarios:

```yaml
error_path_tests:
  - trigger: "에러 발생 조건"
    expected_behavior: "시스템 예상 동작"
    actual_behavior: "실제 동작 (capture-pane)"
    user_feedback: "사용자에게 보이는 피드백"
    recovery: "복구 경로 확인"
    result: "PASS/FAIL"
```

### 5. Performance Spot Check (v5.3 신규)

Contract §12 Performance Budget 기반:

```yaml
performance_checks:
  - metric: "주요 API 응답시간"
    budget: "<200ms"
    actual: "capture-pane 기반 측정"
    result: "PASS/FAIL"
  - metric: "페이지 로드 시간"
    budget: "<1s"
    ...
```

### 6. qa-tester agent E2E 테스트 (Evidence-Based Assertions 필수)

> "Always capture output BEFORE making assertions" — oh-my-claudecode

```
# ❌ 잘못된 방식 (가정 기반)
tmux send-keys "npm test" Enter → sleep 5 → "통과했을 것"

# ✅ 올바른 방식 (증거 기반)
tmux send-keys "npm test" Enter → sleep 5 → output = capture-pane → output 기반 판정
```

**규칙**:
- 모든 assertion 전에 `capture-pane` 실행 (증거 수집)
- 가정 기반 판정 금지 ("아마 통과했을 것" ❌)
- 실패 시 캡처된 출력을 증거로 첨부
- 세션 이름: `qa-{service}-{test}-{timestamp}` (고유)
- 테스트 완료 후 세션 정리 (kill-session) 필수

### Critical Failure Modes (Phase 7)

- ❌ capture-pane 없이 테스트 결과 판정
- ❌ 빌드/테스트 실패를 무시하고 Phase 8 이동
- ❌ flaky 테스트를 retry로 마스킹 (원인 수정 필수)
- ❌ 이전 Phase 결과를 재사용 (fresh 실행 필수)
- ❌ Edge Case Matrix 미작성 (v5.3)
- ❌ Error Path Testing 생략 (v5.3)

### Success Criteria (Phase 7)

- [ ] Build: exit code 0
- [ ] Lint: 0 errors (warnings 허용)
- [ ] Type check: 0 errors
- [ ] Tests: 100% pass
- [ ] Core Scenarios: 5/5 pass (capture-pane 증거 첨부)
- [ ] Edge Case Matrix: 모든 케이스 PASS
- [ ] Error Path Tests: 모든 경로 PASS
- [ ] Performance Spot Check: Budget 내
- [ ] qa-tester: E2E 테스트 통과 (capture-pane 증거 포함)

---

## Phase 8: Comprehensive Judgment (v5.3)

### Quality Gates

**HARD (필수, 실패→LOOP)**: Build 100%, Lint 0 errors, Type 100%, Tests 100%
**BEHAVIOR (필수, 실패→LOOP)**: Core Scenario 1-5 Pass, Edge Case Matrix Pass
**SOFT (경고만)**: Coverage ≥80%, Bundle Size, Complexity

### Comprehensive Quality Report (v5.3 신규)

ACCEPT/LOOP/ROLLBACK 판정 전에 반드시 작성:

```yaml
quality_report:
  # 1. Gate Results
  hard_gates:
    build: "PASS/FAIL (exit code)"
    lint: "PASS/FAIL (error count)"
    type_check: "PASS/FAIL (error count)"
    tests: "PASS/FAIL (pass/fail count)"

  behavior_gates:
    core_scenarios: "5/5 PASS (각 시나리오 결과)"
    edge_cases: "X/Y PASS (각 케이스 결과)"

  soft_gates:
    coverage: "XX% (target: 80%+)"
    bundle_size: "XXkb (target: 기존 대비 +10% 이내)"
    complexity: "최고 복잡도 함수 (cyclomatic complexity)"

  # 2. Engineering Assessment (v5.3)
  dry_compliance:
    score: "1-10 (10=완벽한 DRY)"
    violations_found: "발견된 중복 수"
    reuse_achieved: "DRY Audit 재사용 계획 이행률 %"

  engineering_balance:
    overengineered_areas: ["과잉 영역 (있을 경우)"]
    underengineered_areas: ["과소 영역 (있을 경우)"]
    assessment: "BALANCED / OVER / UNDER"

  # 3. Technical Debt Assessment (v5.3)
  debt_introduced:
    - area: "새로 도입된 기술 부채"
      severity: "HIGH/MEDIUM/LOW"
      justification: "왜 허용했는가"
      remediation_plan: "향후 해결 계획"

  debt_resolved:
    - area: "이번에 해결한 기존 기술 부채"

  # 4. Security Assessment
  security_checklist:
    - [ ] 인증/인가 정상 동작
    - [ ] 입력 검증 (XSS, SQL Injection, CSRF)
    - [ ] API 경계 보호
    - [ ] 민감 데이터 보호
    - [ ] 하드코딩된 시크릿 없음

  # 5. Performance Assessment
  performance_checklist:
    - [ ] N+1 쿼리 없음
    - [ ] Performance Budget 내
    - [ ] 불필요한 리렌더링 없음
    - [ ] 대량 데이터 처리 안전

  # 6. Maintenance Projection (v5.3)
  maintenance:
    complexity_added: "추가된 코드 복잡도 (lines, files, modules)"
    test_maintenance: "추가된 테스트 유지 부담"
    dependency_added: "새 의존성 목록 + 유지 부담"
    documentation_needed: "추가 문서화 필요 영역"
```

### 판정

- HARD+BEHAVIOR 전체 통과 → **ACCEPT** (최종 보고서 + document-writer)
- 실패 + loop<3 → **LOOP** (Phase 6 복귀, Root Cause → Learning Memory 기록)
- loop≥3 → **Circuit Breaker** (v5.2):

### Circuit Breaker Pattern (3회 실패 시 oracle 에스컬레이션)

> "Questions architecture after 3+ failed fix attempts rather than iterating variations"

3회 루프 실패 시 **즉시 rollback하지 않고** oracle에게 아키텍처 검토를 요청:

```
1. oracle agent 호출:
   - 전체 컨텍스트 전달: Contract, Feature Map, 3회 실패 로그, Quality Report
   - 질문: "접근 방식이 근본적으로 잘못되었는가?"
   - 질문: "반복이 아닌 전략 변경이 필요한가?"

2. oracle 판정:
   a. "접근 방식 변경 필요" → Phase 1 복귀 (새 Feature Map 설계)
      - loop_count 리셋
      - Learning Memory에 "접근 방식 변경" 기록
   b. "부분 수정으로 해결 가능" → Phase 6 복귀 (loop_count 유지, max 5)
      - oracle의 구체적 수정 지침 적용
   c. "근본적 한계" → ROLLBACK OPTIONS 제시
```

**ROLLBACK OPTIONS** (oracle "근본적 한계" 판정 시에만):
  - [A] Pre-Phase 4 롤백 (코드 취소)
  - [B] Pre-Phase 3 롤백 (계획 재수립)
  - [C] Partial Success (성공 Feature Set만 유지)
  - [D] Full Cancel

### Critical Failure Modes (Phase 8)

- ❌ oracle 검토 없이 즉시 rollback (Circuit Breaker 우회)
- ❌ 동일한 접근으로 4회 이상 반복 (변형만 시도)
- ❌ Learning Memory 기록 누락
- ❌ Soft Gate 실패를 Hard Gate로 취급
- ❌ Quality Report 미작성 (v5.3)
- ❌ Technical Debt Assessment 생략 (v5.3)

### 최종 보고서 (ACCEPT 시 — v5.3 확장)

```yaml
final_report:
  session_summary:
    goal: "달성한 목표"
    duration: "소요 시간"
    phases_completed: "완료된 Phase 수"
    loops: "루프 횟수"

  changes:
    files_created: ["파일 목록"]
    files_modified: ["파일 목록 (변경 라인 수)"]
    files_deleted: ["파일 목록"]
    total_lines_changed: N

  quality_gates: "전체 결과 (Quality Report에서 발췌)"

  ai_team_contributions:
    claude: "직접 구현 파일/기능 목록"
    gemini: "제안 채택 목록"
    codex: "합의/제안 기여 목록"
    oracle: "아키텍처 리뷰 기여"
    momus: "코드 리뷰 기여"

  engineering_assessment:
    dry_score: "DRY 준수 점수"
    balance: "엔지니어링 균형 평가"
    tech_debt: "도입된/해결된 기술 부채"

  trade_off_register: "Phase 2에서 시작, Phase 4-5에서 확장된 전체 결정 기록"

  learning_memory: "이번 세션에서 학습한 교훈"

  next_steps:
    immediate: ["즉시 필요한 후속 작업"]
    recommended: ["권장 후속 작업"]
    future: ["향후 고려사항"]

  maintenance_guide:
    key_files: ["핵심 파일과 역할 설명"]
    common_changes: ["자주 변경될 영역과 방법"]
    gotchas: ["주의사항/함정"]
```

### Productivity Formula

```
Productivity = (Function Completeness - 1) / Cost($)
목표: Productivity ≥ 1.5, FC ≥ 3.5
```

---

## Cross-Cutting Systems

### Learning Memory (.sisyphus/learnings.json)

- Phase 8 실패 시 자동 기록: { task, root_cause, prevention_rule, phase, error_pattern, tradeoff_context }
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
| Loop 3회 실패 | Circuit Breaker → oracle → Rollback Options [A~D] |
| 컨텍스트 초과 | 요약 + 체크포인트 → 재시작 |

### Progress Dashboard (매 Phase 전환 시 출력)

```
🎯 ORCHESTRATION: "{task}"
Phase N/8 [████░░░░] XX% | Mode: {mode} | Loop: X/3 | Checkpoints: N
Co-Leaders: Claude + Codex | Specialist: Gemini
산출물 진행: Phase N 산출물 X/Y 완료
```

### On-Demand Agent 자동 호출

| Phase | Agent | 트리거 | 역할 경계 |
|-------|-------|--------|----------|
| 0 | prometheus | /plan 자동 | 전략 수립만, 코드 생성 ❌ |
| 0 | explore | 기존 코드 탐색 | DRY Audit용 전수 조사 |
| 1 | oracle | 아키텍처 리뷰 (10항목) | READ-ONLY, evidence-based |
| 4 | Claude(직접 구현), Gemini/Codex(제안) | ai_team_patch 제안 → Claude 구현 | Gemini/Codex는 제안만 |
| 5 | momus | Two-Stage 4-Section Review | severity 등급 필수 |
| 7 | qa-tester | E2E + Edge Case + Error Path | evidence-based assertions 필수 |
| 8 | oracle | Circuit Breaker (loop≥3) | 아키텍처 재검토, 전략 판단 |
| 8 | document-writer | 최종 보고서 | ACCEPT 시에만 |
| Any | explore | 코드 검색 | READ-ONLY, Haiku |

### Partial Success

Feature Set별 성공/실패 추적 → [1] 성공분만 머지 [2] 실패분 재시도 [3] 전체 재시도 [4] 전체 취소
의존성 있는 FS: 선행 실패 → 후행도 실패 처리

### Approval Modes

| 모드 | Phase 3 | Phase 8 | Phase 전환 | 기본값 |
|------|---------|---------|-----------|--------|
| Auto (`approval: off`) | 자동 진행 | 자동 완료 | 자동 | ✅ 기본값 (`--plan`/`--strict` 없음) |
| Approval (`approval: on-request`) | 사용자 확인 | 사용자 확인 | 자동 | `--plan` 플래그 |
| Strict (`approval: always`) | 사용자 확인 | 사용자 확인 | 매번 승인 | `--strict` 플래그 |

---

## Absolute Rules (⛔ 위반 시 즉시 중단)

**Co-Leadership**: Claude 단독 확정 금지 | Codex 의견 무시 금지 | Consensus 없이 Phase 이동 금지
**Phase**: 순서 건너뛰기 금지 | 체크포인트 누락 금지 | 산출물 없이 이동 금지 | **산출물 분량 미달 시 재수행** (v5.3)
**Feature Map**: >4 FS 금지 | 12 fields 누락 금지 | 순환 의존성 금지
**2-Phase Dev**: Gemini/Codex 제안 없이 코딩 시작 금지 | TIME_TO_END 필수 | Single-Turn Fix | 빌드 실패→Phase 5 이동 금지
**Two-Stage Review**: Stage 1 실패 시 Stage 2 진행 금지 | momus CRITICAL/HIGH 무시 금지 | **4-Section Review 생략 금지** (v5.3)
**Evidence-Based QA**: capture-pane 없이 테스트 판정 금지 | 가정 기반 assertion 금지
**Circuit Breaker**: 3회 실패 시 oracle 검토 없이 rollback 금지 | 동일 접근 4회 반복 금지
**Minimal Diff**: Phase 5에서 범위 외 리팩토링 금지 | 스타일+로직 변경 혼합 금지
**DRY**: 기존 코드 중복 생성 금지 | DRY Audit 무시 금지 | **중복 발견 시 반드시 지적** (v5.3)
**Engineering Balance**: 과잉 엔지니어링 금지 | 과소 엔지니어링 금지 | **트레이드오프 없는 결정 금지** (v5.3)
**Devil's Advocate**: "좋다/괜찮다" 금지 | <5 문제점 금지 (v5.3: 3→5) | 대안 없는 비판 금지
**도구**: /find-skills 필수 | Claude 단독 의사결정 금지 | Best Practices 무시 금지
**보안**: API 키 하드코딩 금지 | SQL Injection/XSS/CSRF 금지

---

## Reference

**EvoDev 논문**: Feature Map(DAG), Tri-Layer Context, 2-Phase Development, 56.8% 성능 향상
v5.0 적용: 5 fields, max 4 sets, TIME_TO_END, file_contents, Multi-Layer DAG
v5.1 적용: Claude-Codex Co-Leadership, Consensus Protocol
v5.2 적용: oh-my-claudecode 패턴 — Two-Stage Review, Circuit Breaker, Evidence-Based QA, Minimal Viable Diff, Agent Role Boundaries, Critical Failure Modes
v5.3 적용: Deep Engineering Protocol — 산출물 3배 확장, 4-Section Review, 12-Field Feature Spec, DRY/Engineering Balance 강제, Trade-off Register, Design Decision Log, Edge Case Matrix, Quality Report

---

## EXECUTION START

```
🚀 AIOS v5.3 (Deep Engineering Protocol — 10시간급 실행)
Phase -1→0→1→2→3→4→5→6→7→8 순서 실행
Phase -1: 12필드 정규화 + Risk Pre-scan
Phase 0: 15 sections Contract + DRY Audit + Architecture Blueprint
Phase 1: 12필드 Feature Spec + Design Sheets + Coupling Matrix
Phase 2: 4-Section Deep Review + Trade-off Register
Phase 3: Implementation Playbook + 30-item Pre-flight
Phase 4: Design Decision Log + Per-WI Verification
Phase 5: Two-Stage 4-Section Review + Fix Request Matrix
Phase 7: Edge Case Matrix + Error Path Testing + Performance Check
Phase 8: Comprehensive Quality Report + Tech Debt Assessment
```

## 사용자 요구사항

```
$ARGUMENTS
```

## ⚡ BEGIN

**[CHECKPOINT: Phase -1 시작]**
- 필수 입력: 사용자 요구사항 ✓
- "Phase -1: Smart Intake (Deep Analysis) 시작합니다."

**Phase -1을 지금 수행하라.**

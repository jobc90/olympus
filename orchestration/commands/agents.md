# /agents - Agent Activation State Management

Check and manage agent activation policy.

## Usage

```
/agents              # Check current activation state
/agents --disabled   # Show disabled agents list
/agents --enable X   # Temporarily enable specific agent
```

## Execution Instructions

### Default Execution (`/agents`)

Display current agent state in the following format:

```
📊 에이전트 활성화 상태

🟢 Core (항상 활성)
  • explore (Haiku) - 빠른 코드베이스 검색
  • executor (Sonnet) - 집중 실행
  • writer (Haiku) - 문서 작성

🟡 On-Demand (Team mode에서만)
  • architect (Opus) - 아키텍처 & 디버깅
  • analyst (Opus) - 요구사항 분석
  • planner (Opus) - 전략 계획
  • designer (Sonnet) - UI/UX 디자인
  • researcher (Sonnet) - 문서 & 리서치
  • code-reviewer (Opus) - 코드 리뷰
  • verifier (Opus) - 구현 검증
  • qa-tester (Sonnet) - CLI 테스트
  • vision (Sonnet) - 시각 분석
  • test-engineer (Sonnet) - 테스트 생성
  • build-fixer (Sonnet) - 빌드/린트 수정
  • git-master (Sonnet) - Git 작업
  • api-reviewer (Opus) - API 설계 리뷰
  • performance-reviewer (Opus) - 성능 분석
  • security-reviewer (Opus) - 보안 감사
  • style-reviewer (Sonnet) - 코드 스타일 리뷰

🔴 Disabled (토큰 절약)
  → /agents --disabled 로 전체 목록 확인
```

### `--disabled` Flag

Display list of agents recommended to be disabled:

```
🔴 비활성화 권장 에이전트

[레거시 에이전트 - 커스텀 에이전트로 대체됨]
  • oracle, oracle-low, oracle-medium → architect 사용
  • momus → code-reviewer / verifier 사용
  • prometheus → planner 사용
  • metis → analyst 사용
  • librarian, librarian-low → researcher 사용
  • frontend-engineer, frontend-engineer-low/high → designer 사용
  • multimodal-looker → vision 사용
  • document-writer → writer 사용
  • sisyphus-junior, sisyphus-junior-low/high → executor 사용
  • explore-medium → explore 사용

[특수 도메인 - 프로젝트에서 미사용]
  • smart-contract-specialist, smart-contract-auditor
  • unity-game-developer, unreal-engine-developer
  • 3d-artist, game-designer
  • ios-developer, flutter-go-reviewer

[클라우드 특화 - 필요 시에만]
  • terraform-*, azure-*, aws-*
  • bicep-*, arm-*, pulumi-*
  • kubernetes-*, docker-*

[언어 특화 - 프로젝트 스택 아님]
  • rust-*, go-*, kotlin-*, swift-*, ruby-*
  • clojure-*, java-*, c-pro, cpp-pro

[중복 리서처]
  • academic-researcher, technical-researcher
  • comprehensive-researcher, market-research-analyst
  → researcher로 대체

[특수 목적]
  • podcast-*, social-media-*, twitter-*
  • sales-*, marketing-*, customer-support
  • penetration-tester, security-auditor (필요 시에만)

💡 Tip: 토큰 절약을 위해 위 에이전트들은 명시적 요청 없이 사용하지 마세요.
```

### `--enable X` Flag

```
⚠️ 임시 활성화: {agent-name}
- 현재 세션에서만 유효
- Team mode 종료 시 자동 비활성화
- 사용 시 토큰 소비 증가에 주의
```

## Policy Summary

| State | Agents | Usage Condition |
|-------|--------|----------------|
| 🟢 Core | explore, executor, writer | Always available |
| 🟡 On-Demand | architect, analyst, planner, designer, researcher + 11 more | Only in Team mode |
| 🔴 Disabled | Legacy agents, special domains, duplicate features | Only on explicit request |

**Core Principle: Installation ≠ Activation. Token conservation is priority.**

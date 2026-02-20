import { describe, it, expect } from 'vitest';
import {
  IDLE_PROMPT_PATTERNS,
  COMPLETION_PATTERNS,
  detectIdlePrompt,
  detectCompletionPattern,
  extractResultFromBuffer,
  isTuiChromeLine,
  isTuiArtifactLine,
  hasBackgroundAgentActivity,
} from '../pty-worker.js';

// ──────────────────────────────────────────────
// Pattern Constants
// ──────────────────────────────────────────────

describe('IDLE_PROMPT_PATTERNS', () => {
  it('패턴 배열이 존재하며 비어있지 않음', () => {
    expect(IDLE_PROMPT_PATTERNS).toBeDefined();
    expect(IDLE_PROMPT_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe('COMPLETION_PATTERNS', () => {
  it('패턴 배열이 존재하며 비어있지 않음', () => {
    expect(COMPLETION_PATTERNS).toBeDefined();
    expect(COMPLETION_PATTERNS.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// detectIdlePrompt
// ──────────────────────────────────────────────

describe('detectIdlePrompt', () => {
  it('Claude CLI v2.x "ctrl+g to edit" 감지', () => {
    expect(detectIdlePrompt('some output\nctrl+g to edit in Vim')).toBe(true);
  });

  it('Claude CLI v2.x "shift+tab to cycle" 감지', () => {
    expect(detectIdlePrompt('⏵⏵ bypass permissions on (shift+tab to cycle)')).toBe(true);
  });

  it('">" 프롬프트 감지', () => {
    expect(detectIdlePrompt('some output\n> ')).toBe(true);
  });

  it('"❯" 프롬프트 감지', () => {
    expect(detectIdlePrompt('some output\n❯ ')).toBe(true);
  });

  it('"$" 프롬프트 감지 (relaxed — no ^ anchor)', () => {
    expect(detectIdlePrompt('some output\n$ ')).toBe(true);
  });

  it('"Enter your message" 감지', () => {
    expect(detectIdlePrompt('Enter your message here')).toBe(true);
  });

  it('"Type a message" 감지', () => {
    expect(detectIdlePrompt('Type a message to continue')).toBe(true);
  });

  it('"What would you like to do" 감지', () => {
    expect(detectIdlePrompt('What would you like to do?')).toBe(true);
  });

  it('일반 텍스트에서는 false', () => {
    expect(detectIdlePrompt('This is normal output text')).toBe(false);
    expect(detectIdlePrompt('Building project...')).toBe(false);
  });

  it('"bypass permissions"는 IDLE이 아닌 TUI 크롬으로 분류', () => {
    expect(detectIdlePrompt('⏵⏵ bypass permissions on')).toBe(false);
    expect(detectIdlePrompt('bypass permissions off')).toBe(false);
  });

  it('마지막 5000자만 검사', () => {
    const longText = 'x'.repeat(5500) + '\n>\n';
    expect(detectIdlePrompt(longText)).toBe(true);

    // 프롬프트가 5000자 밖에 있으면 감지 못함
    const farPrompt = '>\n' + 'x'.repeat(5500);
    expect(detectIdlePrompt(farPrompt)).toBe(false);
  });

  it('프롬프트 뒤에 개행이 있어도 감지 (multiline)', () => {
    expect(detectIdlePrompt('some output\n> \n')).toBe(true);
    expect(detectIdlePrompt('some output\n❯ \n')).toBe(true);
    // "$" 프롬프트도 감지 (relaxed patterns)
    expect(detectIdlePrompt('some output\n$ \n')).toBe(true);
  });

  it('줄 시작에 ">"만 있는 경우 감지 (multiline)', () => {
    expect(detectIdlePrompt('some output\n>\nmore text')).toBe(true);
    expect(detectIdlePrompt('some output\n❯\nmore text')).toBe(true);
  });

  it('2000자 이상 TUI 크롬 뒤에 프롬프트 감지', () => {
    // TUI 전체 리렌더 시 크롬이 버퍼를 가득 채워도 프롬프트 감지
    const tuiChrome = '🤖 Opus │ ██░░░░│ 50%\n'.repeat(80); // ~1800자
    const withPrompt = tuiChrome + '> ';
    expect(detectIdlePrompt(withPrompt)).toBe(true);
  });

  it('"$" 프롬프트 감지 (relaxed)', () => {
    expect(detectIdlePrompt('some output\n$ ')).toBe(true);
  });

  it('Ink TUI box-drawing "╭─" 감지', () => {
    expect(detectIdlePrompt('╭─ some text')).toBe(true);
  });

  it('Ink TUI box-drawing "╰─" 감지', () => {
    expect(detectIdlePrompt('╰─ bottom border')).toBe(true);
  });

  it('줄 시작이 아닌 ">" 도 감지 (no ^ anchor)', () => {
    expect(detectIdlePrompt('status bar text > ')).toBe(true);
  });

  it('token count indicator 감지', () => {
    expect(detectIdlePrompt('1234 tokens remaining')).toBe(true);
  });

  it('cost indicator 감지', () => {
    expect(detectIdlePrompt('cost: $0.05')).toBe(true);
  });

  it('"claude" or "claude code" at end of line 감지', () => {
    expect(detectIdlePrompt('some output\nclaude')).toBe(true);
    expect(detectIdlePrompt('some output\nclaude code')).toBe(true);
    expect(detectIdlePrompt('some output\nClaude Code')).toBe(true);
  });
});

// ──────────────────────────────────────────────
// detectCompletionPattern
// ──────────────────────────────────────────────

describe('detectCompletionPattern', () => {
  it('"I\'ve completed" 감지', () => {
    expect(detectCompletionPattern("I've completed the task")).toBe(true);
  });

  it('"I\'ve finished" 감지', () => {
    expect(detectCompletionPattern("I've finished making the changes")).toBe(true);
  });

  it('"I\'ve created" 감지', () => {
    expect(detectCompletionPattern("I've created the new file")).toBe(true);
  });

  it('"I\'ve updated" 감지', () => {
    expect(detectCompletionPattern("I've updated the configuration")).toBe(true);
  });

  it('"I\'ve fixed" 감지', () => {
    expect(detectCompletionPattern("I've fixed the bug")).toBe(true);
  });

  it('"changes have been made" 감지', () => {
    expect(detectCompletionPattern('The changes have been made successfully')).toBe(true);
  });

  it('"modifications were applied" 감지', () => {
    expect(detectCompletionPattern('The modifications were applied')).toBe(true);
  });

  it('"Let me know if" 감지', () => {
    expect(detectCompletionPattern('Let me know if you need anything else')).toBe(true);
  });

  it('"Is there anything else" 감지', () => {
    expect(detectCompletionPattern('Is there anything else you need?')).toBe(true);
  });

  it('"Done!" 감지', () => {
    expect(detectCompletionPattern('Done!')).toBe(true);
    expect(detectCompletionPattern('Done.')).toBe(true);
    expect(detectCompletionPattern('Done')).toBe(true);
  });

  it('"Task completed" 감지', () => {
    expect(detectCompletionPattern('Task completed')).toBe(true);
  });

  it('한국어 "작업 완료" 감지', () => {
    expect(detectCompletionPattern('작업이 완료되었습니다')).toBe(true);
    expect(detectCompletionPattern('수정을 완료했습니다')).toBe(true);
    expect(detectCompletionPattern('구현을 마쳤습니다')).toBe(true);
    expect(detectCompletionPattern('변경이 끝났습니다')).toBe(true);
  });

  it('한국어 "파일 수정/생성/삭제" 감지', () => {
    expect(detectCompletionPattern('파일을 수정했습니다')).toBe(true);
    expect(detectCompletionPattern('파일을 생성했습니다')).toBe(true);
    expect(detectCompletionPattern('파일 삭제했습니다')).toBe(true);
    expect(detectCompletionPattern('파일을 변경하였습니다')).toBe(true);
  });

  it('일반 텍스트에서는 false', () => {
    expect(detectCompletionPattern('Building the project now...')).toBe(false);
    expect(detectCompletionPattern('Running tests...')).toBe(false);
  });

  it('마지막 2000자만 검사', () => {
    const longText = 'x'.repeat(2500) + "I've completed the task";
    expect(detectCompletionPattern(longText)).toBe(true);

    // 패턴이 2000자 밖에 있으면 감지 못함
    const farPattern = "I've completed the task" + 'x'.repeat(2500);
    expect(detectCompletionPattern(farPattern)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// isTuiChromeLine
// ──────────────────────────────────────────────

describe('isTuiChromeLine', () => {
  it('구분선 감지', () => {
    expect(isTuiChromeLine('─────────────────────')).toBe(true);
    expect(isTuiChromeLine('━━━━━━━━━━━━━━━')).toBe(true);
  });

  it('모델 상태 감지', () => {
    expect(isTuiChromeLine('🤖 Opus │ ██░░░░░░░░│ 24% │ 47K/200K │ $0.20')).toBe(true);
    expect(isTuiChromeLine('🤖 Sonnet │ 50%')).toBe(true);
  });

  it('프로젝트 상태 감지', () => {
    expect(isTuiChromeLine('📁 olympus (main*)')).toBe(true);
  });

  it('AI 모델 상태 감지', () => {
    expect(isTuiChromeLine('🔷 gpt-5.3-codex │ 5시간: 7%')).toBe(true);
    expect(isTuiChromeLine('💎 gemini-3-flash-preview │ 0%')).toBe(true);
  });

  it('권한 모드 감지', () => {
    expect(isTuiChromeLine('⏵⏵ bypass permissions on (shift+tab to cycle)')).toBe(true);
  });

  it('입력 힌트 감지', () => {
    expect(isTuiChromeLine('ctrl+g to edit in Vim')).toBe(true);
  });

  it('토큰 통계 감지', () => {
    expect(isTuiChromeLine('0 토큰 | $0.0000 | 65초')).toBe(true);
    expect(isTuiChromeLine('1234 토큰 | $0.50 | 30초')).toBe(true);
  });

  it('빈 줄 → true', () => {
    expect(isTuiChromeLine('')).toBe(true);
    expect(isTuiChromeLine('   ')).toBe(true);
  });

  it('실제 응답 텍스트 → false', () => {
    expect(isTuiChromeLine('이것은 Claude의 응답입니다.')).toBe(false);
    expect(isTuiChromeLine('Here is the answer to your question.')).toBe(false);
    expect(isTuiChromeLine('파일을 수정했습니다.')).toBe(false);
  });
});

// ──────────────────────────────────────────────
// isTuiArtifactLine
// ──────────────────────────────────────────────

describe('isTuiArtifactLine', () => {
  it('빈 줄 → true', () => {
    expect(isTuiArtifactLine('')).toBe(true);
    expect(isTuiArtifactLine('   ')).toBe(true);
  });

  it('스피너 문자만 → true', () => {
    expect(isTuiArtifactLine('✢✳✶✻✽·')).toBe(true);
    expect(isTuiArtifactLine('✳')).toBe(true);
  });

  it('스피너 + 짧은 프래그먼트 → true', () => {
    expect(isTuiArtifactLine('✳ abc')).toBe(true);
  });

  it('(thinking) → true', () => {
    expect(isTuiArtifactLine('(thinking)')).toBe(true);
  });

  // P0-1: Thinking 진행형
  it('Stewing… → true', () => {
    expect(isTuiArtifactLine('Stewing…')).toBe(true);
  });

  it('✳Stewing…(1m1s·↓2.4ktokens) → true', () => {
    expect(isTuiArtifactLine('✳Stewing…(1m1s·↓2.4ktokens)')).toBe(true);
  });

  it('Brewing… → true', () => {
    expect(isTuiArtifactLine('Brewing…')).toBe(true);
  });

  it('Thinking… → true', () => {
    expect(isTuiArtifactLine('Thinking…')).toBe(true);
  });

  it('Reasoning… → true', () => {
    expect(isTuiArtifactLine('Reasoning…')).toBe(true);
  });

  it('Pondering… → true', () => {
    expect(isTuiArtifactLine('Pondering…')).toBe(true);
  });

  it('Spinning… → true', () => {
    expect(isTuiArtifactLine('Spinning…')).toBe(true);
  });

  it('Flowing… → true', () => {
    expect(isTuiArtifactLine('Flowing…')).toBe(true);
  });

  // P0-2: Thinking 완료형
  it('✻Cogitated for 1m 1s ❯ → true', () => {
    expect(isTuiArtifactLine('✻Cogitated for 1m 1s ❯')).toBe(true);
  });

  it('Thought for 30s → true', () => {
    expect(isTuiArtifactLine('Thought for 30s')).toBe(true);
  });

  it('Brewed for 2m 15s → true', () => {
    expect(isTuiArtifactLine('Brewed for 2m 15s')).toBe(true);
  });

  it('Stewed for 45s → true', () => {
    expect(isTuiArtifactLine('Stewed for 45s')).toBe(true);
  });

  it('Pondered for 1m → true', () => {
    expect(isTuiArtifactLine('Pondered for 1m')).toBe(true);
  });

  // 기존 thought for 패턴 (괄호 포함, 확장된 동사)
  it('(thought for 10s) → true', () => {
    expect(isTuiArtifactLine('(thought for 10s)')).toBe(true);
  });

  it('(cogitated for 1m 30s) → true', () => {
    expect(isTuiArtifactLine('(cogitated for 1m 30s)')).toBe(true);
  });

  it('(brewed for 2m) → true', () => {
    expect(isTuiArtifactLine('(brewed for 2m)')).toBe(true);
  });

  it('(stewed for 45s) → true', () => {
    expect(isTuiArtifactLine('(stewed for 45s)')).toBe(true);
  });

  // P1-1: 시간·토큰 괄호 조합
  it('(1m1s·↓2.4ktokens) → true', () => {
    expect(isTuiArtifactLine('(1m1s·↓2.4ktokens)')).toBe(true);
  });

  it('(30s·↓1.2k tokens) → true', () => {
    expect(isTuiArtifactLine('(30s·↓1.2k tokens)')).toBe(true);
  });

  it('(2m 10s•↓5.1ktokens) → true', () => {
    expect(isTuiArtifactLine('(2m 10s•↓5.1ktokens)')).toBe(true);
  });

  // P2-1: 독립 숫자 줄 (4자리+)
  it('9757 → true', () => {
    expect(isTuiArtifactLine('9757')).toBe(true);
  });

  it('12345 → true', () => {
    expect(isTuiArtifactLine('12345')).toBe(true);
  });

  it('123 → false (3자리는 통과)', () => {
    // 3자리 숫자는 P2-1에 해당하지 않으며, <=3자 영문 프래그먼트 규칙도 숫자는 제외
    expect(isTuiArtifactLine('123')).toBe(false);
  });

  // TUI 크롬도 아티팩트로 간주
  it('TUI 크롬 (영어 토큰 표시) → true', () => {
    expect(isTuiArtifactLine('↓2.4ktokens')).toBe(true);
    expect(isTuiArtifactLine('↓2.4k tokens')).toBe(true);
  });

  it('TUI 크롬 (토큰 비율) → true', () => {
    expect(isTuiArtifactLine('47K/200K tokens')).toBe(true);
  });

  it('터미널 타이틀 잔여 → true', () => {
    expect(isTuiArtifactLine(']0;something')).toBe(true);
  });

  // 짧은 영문 프래그먼트
  it('1자 이하 프래그먼트 → true, 2자 이상은 보존', () => {
    expect(isTuiArtifactLine('x')).toBe(true);
    // 2자 이상은 유효한 응답일 수 있으므로 보존
    expect(isTuiArtifactLine('ab')).toBe(false);
    expect(isTuiArtifactLine('no')).toBe(false);
    expect(isTuiArtifactLine('ok')).toBe(false);
  });

  it('짧은 한국어는 보존 → false', () => {
    expect(isTuiArtifactLine('안녕')).toBe(false);
  });

  // 실제 응답은 보존
  it('실제 응답 텍스트 → false', () => {
    expect(isTuiArtifactLine('이것은 Claude의 응답입니다.')).toBe(false);
    expect(isTuiArtifactLine('Here is the answer to your question.')).toBe(false);
    expect(isTuiArtifactLine('파일을 수정했습니다.')).toBe(false);
  });
});

// ──────────────────────────────────────────────
// extractResultFromBuffer
// ──────────────────────────────────────────────

describe('extractResultFromBuffer', () => {
  it('에코 제거', () => {
    const buffer = 'my prompt\nThis is the response';
    expect(extractResultFromBuffer(buffer, 'my prompt')).toBe('This is the response');
  });

  it('프롬프트 라인 제거 (">")', () => {
    const buffer = 'prompt\nResponse text\n> ';
    expect(extractResultFromBuffer(buffer, 'prompt')).toBe('Response text');
  });

  it('프롬프트 라인 제거 ("❯")', () => {
    const buffer = 'prompt\nResponse text\n❯ ';
    expect(extractResultFromBuffer(buffer, 'prompt')).toBe('Response text');
  });

  it('프롬프트 라인 제거 ("claude >")', () => {
    const buffer = 'prompt\nResponse text\nclaude > ';
    expect(extractResultFromBuffer(buffer, 'prompt')).toBe('Response text');
  });

  it('ANSI 코드 제거', () => {
    const buffer = 'prompt\n\u001b[31mColored response\u001b[0m\n> ';
    expect(extractResultFromBuffer(buffer, 'prompt')).toBe('Colored response');
  });

  it('길이 제한 (8000자 초과 시 잘림)', () => {
    const longContent = 'A'.repeat(10000);
    const buffer = 'prompt\n' + longContent;
    const result = extractResultFromBuffer(buffer, 'prompt');
    expect(result).toContain('...(앞부분 생략)...');
    expect(result.length).toBeLessThanOrEqual(8000 + '...(앞부분 생략)...\n\n'.length);
  });

  it('빈 버퍼', () => {
    expect(extractResultFromBuffer('', 'prompt')).toBe('');
  });

  it('프롬프트가 없는 버퍼', () => {
    const buffer = 'Just some output text';
    expect(extractResultFromBuffer(buffer, 'nonexistent prompt')).toBe('Just some output text');
  });

  it('한국어 텍스트 보존', () => {
    const buffer = 'prompt\n안녕하세요, 작업이 완료되었습니다.\n> ';
    expect(extractResultFromBuffer(buffer, 'prompt')).toBe('안녕하세요, 작업이 완료되었습니다.');
  });

  it('연속 빈 줄 제거 (TUI 크롬 필터링으로 빈 줄 자동 제거)', () => {
    const buffer = 'prompt\nline 1\n\n\n\nline 2';
    expect(extractResultFromBuffer(buffer, 'prompt')).toBe('line 1\nline 2');
  });

  it('앞뒤 빈 줄 제거', () => {
    const buffer = 'prompt\n\n\nContent here\n\n\n> ';
    expect(extractResultFromBuffer(buffer, 'prompt')).toBe('Content here');
  });

  it('TUI 크롬 라인 필터링 (상태바, 구분선)', () => {
    const buffer = [
      'prompt',
      '작업이 완료되었습니다.',
      '───────────────────────',
      '🤖 Opus │ ██░░░░│ 50% │ $0.10',
      '📁 olympus (main*)',
      '🔷 gpt-5.3-codex │ 5시간: 7%',
      '⏵⏵ bypass permissions on (shift+tab to cycle)',
      'ctrl+g to edit in Vim',
    ].join('\n');
    expect(extractResultFromBuffer(buffer, 'prompt')).toBe('작업이 완료되었습니다.');
  });

  it('실제 응답 + TUI 크롬 혼합 시 응답만 추출', () => {
    const buffer = [
      'prompt',
      '파일을 수정했습니다.',
      '변경사항:',
      '- index.ts 수정',
      '- test.ts 추가',
      '───────────────',
      '0 토큰 | $0.0000 | 10초',
    ].join('\n');
    const result = extractResultFromBuffer(buffer, 'prompt');
    expect(result).toContain('파일을 수정했습니다.');
    expect(result).toContain('- index.ts 수정');
    expect(result).not.toContain('토큰');
    expect(result).not.toContain('─────');
  });

  it('TUI 아티팩트 (thinking 진행형/완료형) 필터링', () => {
    const buffer = [
      'prompt',
      '✳Stewing…(1m1s·↓2.4ktokens)',
      '✻Cogitated for 1m 1s ❯',
      '(1m1s·↓2.4ktokens)',
      '9757',
      '파일을 성공적으로 수정했습니다.',
      '(thought for 10s)',
      '47K/200K tokens',
      '> ',
    ].join('\n');
    const result = extractResultFromBuffer(buffer, 'prompt');
    expect(result).toBe('파일을 성공적으로 수정했습니다.');
  });

  it('Thinking 진행형 + 실제 응답 혼합', () => {
    const buffer = [
      'prompt',
      'Thinking…',
      'Brewing…',
      '코드 리뷰를 완료했습니다.',
      '- 버그 2개 발견',
      '- 성능 개선 제안 1개',
      'Thought for 30s',
    ].join('\n');
    const result = extractResultFromBuffer(buffer, 'prompt');
    expect(result).toContain('코드 리뷰를 완료했습니다.');
    expect(result).toContain('- 버그 2개 발견');
    expect(result).not.toContain('Thinking');
    expect(result).not.toContain('Brewing');
    expect(result).not.toContain('Thought for');
  });

  it('스피너 접두사가 붙은 실제 텍스트에서 스피너만 제거', () => {
    const buffer = [
      'prompt',
      "✢ I've completed the task",
      '✳ 파일을 수정했습니다.',
      '· Here is the result',
    ].join('\n');
    const result = extractResultFromBuffer(buffer, 'prompt');
    expect(result).toContain("I've completed the task");
    expect(result).toContain('파일을 수정했습니다.');
    expect(result).toContain('Here is the result');
    expect(result).not.toMatch(/^[✢✳✶✻✽·]/m);
  });

  it('아티팩트 제거 후 연속 빈 줄이 정리됨', () => {
    const buffer = [
      'prompt',
      '첫 번째 줄',
      'Stewing…',
      '✳Brewing…',
      '(thought for 10s)',
      '두 번째 줄',
    ].join('\n');
    const result = extractResultFromBuffer(buffer, 'prompt');
    expect(result).toBe('첫 번째 줄\n두 번째 줄');
  });
});

// ──────────────────────────────────────────────
// hasBackgroundAgentActivity
// ──────────────────────────────────────────────

describe('hasBackgroundAgentActivity', () => {
  it('⏺ Task "..." completed in background 감지', () => {
    expect(hasBackgroundAgentActivity('⏺ Task "review code" completed in background')).toBe(true);
  });

  it('⏺ Agent "..." completed 감지', () => {
    expect(hasBackgroundAgentActivity('⏺ Agent "reviewer" completed')).toBe(true);
  });

  it('completed in background 감지 (다양한 형식)', () => {
    expect(hasBackgroundAgentActivity('Task "test runner" completed in background')).toBe(true);
    expect(hasBackgroundAgentActivity('Agent "builder" completed')).toBe(true);
    expect(hasBackgroundAgentActivity('something completed in background')).toBe(true);
  });

  it('✻ Conversation compacted 감지', () => {
    expect(hasBackgroundAgentActivity('✻ Conversation compacted')).toBe(true);
  });

  it('✻ Cooked for 감지', () => {
    expect(hasBackgroundAgentActivity('✻ Cooked for 5m 30s')).toBe(true);
  });

  it('일반 텍스트 → false', () => {
    expect(hasBackgroundAgentActivity('파일을 수정했습니다.')).toBe(false);
    expect(hasBackgroundAgentActivity("I've completed the task")).toBe(false);
    expect(hasBackgroundAgentActivity('Here is the review result')).toBe(false);
  });

  it('빈 문자열 → false', () => {
    expect(hasBackgroundAgentActivity('')).toBe(false);
    expect(hasBackgroundAgentActivity('   ')).toBe(false);
  });

  it('ANSI가 포함된 백그라운드 에이전트 출력 감지', () => {
    expect(hasBackgroundAgentActivity('\u001b[32m⏺ Task "test" completed in background\u001b[0m')).toBe(true);
  });
});

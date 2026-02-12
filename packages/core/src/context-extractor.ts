/**
 * Context Extractor — 규칙 기반 구조화 추출 엔진
 *
 * CliRunResult + prompt → ExtractedContext 변환 (LLM 없음)
 */

import type { ExtractedContext } from '@olympus-dev/protocol';

/** CliRunResult 최소 인터페이스 */
interface CliResultLike {
  success: boolean;
  text: string;
  error?: { message?: string };
}

export function extractContext(result: CliResultLike, _prompt: string): ExtractedContext {
  const text = result.text || '';

  return {
    success: result.success,
    summary: extractSummary(text),
    filesChanged: extractFiles(text),
    decisions: extractDecisions(text),
    errors: extractErrors(text, result),
    dependencies: extractDependencies(text),
  };
}

/** 텍스트 첫 500자, 문장 단위로 잘림 */
function extractSummary(text: string): string {
  if (!text) return '';
  if (text.length <= 500) return text.trim();

  const truncated = text.slice(0, 500);
  // 마지막 문장 끝 찾기
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('\n'),
  );

  if (lastSentenceEnd > 100) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }
  return truncated.trim();
}

const FILE_PATH_RE =
  /(?:^|\s)((?:src|packages|lib|test|tests|app|apps|public|dist|build|scripts|config|docs)[/\\][\w./-]+\.\w+)/g;

/** 정규식으로 파일 경로 추출 + 중복 제거 */
function extractFiles(text: string): string[] {
  if (!text) return [];
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    matches.add(m[1]);
  }
  FILE_PATH_RE.lastIndex = 0;
  return [...matches];
}

const DECISION_RE =
  /^.*(?:결정:|Decision:|Decided to|결론:|→)\s*(.+)$/gim;

/** 결정사항 추출 (줄 단위) */
function extractDecisions(text: string): string[] {
  if (!text) return [];
  const decisions: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = DECISION_RE.exec(text)) !== null) {
    const d = m[1].trim();
    if (d) decisions.push(d);
  }
  DECISION_RE.lastIndex = 0;
  return decisions;
}

const ERROR_RE =
  /^.*(Error:|Failed:|TypeError|ReferenceError|SyntaxError).*$/gim;

/** 에러 패턴 추출 + result.error?.message */
function extractErrors(text: string, result: CliResultLike): string[] {
  const errors: string[] = [];
  if (result.error?.message) {
    errors.push(result.error.message);
  }
  if (!text) return errors;
  let m: RegExpExecArray | null;
  while ((m = ERROR_RE.exec(text)) !== null) {
    const line = m[0].trim();
    if (line && !errors.includes(line)) {
      errors.push(line);
    }
  }
  ERROR_RE.lastIndex = 0;
  return errors;
}

const DEP_RE =
  /(?:npm install|pnpm add|yarn add|package\.json)\s*([\w@/.^~><=* -]*)/gi;

/** 의존성 변경 감지 */
function extractDependencies(text: string): string[] {
  if (!text) return [];
  const deps: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = DEP_RE.exec(text)) !== null) {
    const d = m[0].trim();
    if (d && !deps.includes(d)) deps.push(d);
  }
  DEP_RE.lastIndex = 0;
  return deps;
}

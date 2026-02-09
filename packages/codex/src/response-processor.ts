import type { ProcessedResponse, ResponseType, DashboardResponse } from './types.js';

const TELEGRAM_MSG_LIMIT = 4000;

/**
 * ResponseProcessor — Claude CLI 응답 가공
 *
 * 1. 타입 판별 (에러/빌드/테스트/코드/텍스트)
 * 2. 핵심 내용 추출 (요약)
 * 3. 파일 변경 목록 파싱 (⏺ Edit/Write 패턴)
 * 4. 채널별 포맷팅 (Telegram 4000자 제한, Dashboard 전체)
 */
export class ResponseProcessor {
  /**
   * Claude 원시 출력 → 구조화된 응답
   */
  process(rawOutput: string, context: {
    sessionId: string;
    projectName: string;
    startTime: number;
  }): ProcessedResponse {
    const type = this.detectType(rawOutput);
    const content = this.summarize(rawOutput, type);
    const filesChanged = this.parseChangedFiles(rawOutput);

    return {
      type,
      content,
      metadata: {
        projectName: context.projectName,
        sessionId: context.sessionId,
        duration: Date.now() - context.startTime,
        filesChanged: filesChanged.length > 0 ? filesChanged : undefined,
      },
      rawOutput,
    };
  }

  /**
   * Telegram 포맷 — 4000자 제한, markdown
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
   * Dashboard 포맷 — 풀 데이터
   */
  formatForDashboard(response: ProcessedResponse): DashboardResponse {
    return {
      ...response,
      timestamp: Date.now(),
    };
  }

  /**
   * 응답 타입 감지
   */
  detectType(output: string): ResponseType {
    // Order matters: more specific patterns first
    if (/build\s+(succeeded|완료|passed|success)|빌드\s*(완료|성공)/i.test(output)) return 'build';
    if (/test.*\d+\s+(pass|fail)/i.test(output)) return 'test';
    if (/[1-9]\d*\s*(error|fail|실패)/i.test(output)) return 'error';
    if (/```/.test(output)) return 'code';
    if (/\?$/.test(output.trim())) return 'question';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]|\.\.\./.test(output)) return 'progress';
    return 'text';
  }

  /**
   * ⏺ Edit/Write 패턴에서 파일명 추출
   */
  parseChangedFiles(output: string): string[] {
    const files = new Set<string>();
    const editPattern = /⏺\s*(?:Edit|Write|Create)\s+(\S+)/g;
    let match;
    while ((match = editPattern.exec(output)) !== null) {
      files.add(match[1]);
    }
    return [...files];
  }

  /**
   * 원시 출력을 요약
   */
  private summarize(output: string, type: ResponseType): string {
    const lines = output.split('\n').filter(l => l.trim());

    switch (type) {
      case 'build': {
        // Extract build result line
        const buildLine = lines.find(l => /build|빌드/i.test(l));
        return buildLine ?? lines.slice(-3).join('\n');
      }
      case 'test': {
        // Extract test summary
        const testLine = lines.find(l => /\d+\s+(pass|fail|test)/i.test(l));
        return testLine ?? lines.slice(-3).join('\n');
      }
      case 'error': {
        // Extract error context
        const errorLines = lines.filter(l => /error|fail|exception/i.test(l));
        return errorLines.slice(0, 5).join('\n') || lines.slice(-5).join('\n');
      }
      case 'code': {
        // Code blocks with context
        return this.extractCodeContext(output);
      }
      default: {
        // General text: head + tail
        if (lines.length <= 10) return lines.join('\n');
        const head = lines.slice(0, 5);
        const tail = lines.slice(-3);
        return [...head, `... (${lines.length - 8}줄 생략)`, ...tail].join('\n');
      }
    }
  }

  private extractCodeContext(output: string): string {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const blocks = output.match(codeBlockRegex);
    if (!blocks) return output.slice(0, 800);

    // Include surrounding text for context
    const result: string[] = [];
    let remaining = 800;
    for (const block of blocks) {
      if (remaining <= 0) break;
      const truncated = block.slice(0, remaining);
      result.push(truncated);
      remaining -= truncated.length;
    }
    return result.join('\n');
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}

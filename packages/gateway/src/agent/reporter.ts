import type { ReviewReport } from '@olympus-dev/protocol';

/**
 * Agent Reporter — formats review reports for different channels.
 *
 * Emits formatted reports via callback. Channels (Telegram, Dashboard)
 * register their own formatters.
 */
export class AgentReporter {
  private listeners: Array<(report: ReviewReport, formatted: string) => void> = [];

  /**
   * Register a report listener (channel)
   */
  onReport(listener: (report: ReviewReport, formatted: string) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Format and distribute report to all channels
   */
  async report(review: ReviewReport): Promise<void> {
    const formatted = this.formatReport(review);
    for (const listener of this.listeners) {
      try {
        listener(review, formatted);
      } catch {
        // Don't let one channel failure block others
      }
    }
  }

  /**
   * Format report as user-friendly markdown
   */
  formatReport(review: ReviewReport): string {
    const icon = review.status === 'success' ? '✅' :
                 review.status === 'partial' ? '⚠️' : '❌';

    const parts: string[] = [
      `${icon} **작업 ${review.status === 'success' ? '완료' : review.status === 'partial' ? '부분 완료' : '실패'}**`,
      '',
      review.summary,
    ];

    if (review.changedFiles.length > 0) {
      parts.push('');
      parts.push(`📁 변경 파일 (${review.changedFiles.length}개):`);
      for (const f of review.changedFiles.slice(0, 10)) {
        parts.push(`  • ${f}`);
      }
      if (review.changedFiles.length > 10) {
        parts.push(`  • ... 외 ${review.changedFiles.length - 10}개`);
      }
    }

    if (review.testResults) {
      parts.push('');
      parts.push(`🧪 ${review.testResults}`);
    }

    if (review.warnings.length > 0) {
      parts.push('');
      parts.push('⚠️ 경고:');
      for (const w of review.warnings) {
        parts.push(`  • ${w}`);
      }
    }

    if (review.nextSteps.length > 0) {
      parts.push('');
      parts.push('📋 후속 작업:');
      for (const s of review.nextSteps) {
        parts.push(`  • ${s}`);
      }
    }

    return parts.filter(p => p !== undefined).join('\n');
  }
}

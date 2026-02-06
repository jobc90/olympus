import React from 'react';
import { Box, Text, Static } from 'ink';
import type { OutputLine } from '../types.js';

interface OutputProps {
  lines: OutputLine[];
  maxLines?: number;
}

const TYPE_COLORS: Record<string, string> = {
  user: 'white',
  gemini: 'blue',
  codex: 'green',
  gpt: 'green',
  system: 'yellow',
  error: 'red',
};

const TYPE_PREFIXES: Record<string, string> = {
  user: '> ',
  gemini: '🎨 Gemini: ',
  codex: '⚙️  Codex: ',
  gpt: '⚙️  Codex(legacy): ',
  system: '📢 ',
  error: '❌ ',
};

export function Output({ lines, maxLines = 100 }: OutputProps) {
  // Keep only last N lines for performance
  const visibleLines = lines.slice(-maxLines);

  // Separate completed lines (static) from streaming line (dynamic)
  const completedLines = visibleLines.filter((l) => !l.isStreaming);
  const streamingLine = visibleLines.find((l) => l.isStreaming);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Static (completed) lines - won't re-render */}
      <Static items={completedLines}>
        {(line) => (
          <Box key={line.id}>
            <Text color={TYPE_COLORS[line.type] || 'white'}>
              {TYPE_PREFIXES[line.type] || ''}
              {line.content}
            </Text>
          </Box>
        )}
      </Static>

      {/* Dynamic (streaming) line */}
      {streamingLine && (
        <Box>
          <Text color={TYPE_COLORS[streamingLine.type] || 'white'}>
            {TYPE_PREFIXES[streamingLine.type] || ''}
            {streamingLine.content}
            <Text color="cyan">▌</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}

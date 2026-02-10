import React from 'react';
import { Box, Text } from 'ink';

interface BannerProps {
  version?: string;
}

export function Banner({ version = '0.3.0' }: BannerProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        ⚡ Olympus Interactive CLI v{version}
      </Text>
      <Text color="gray">
        Type a prompt to analyze with AI, or use commands like 'help', 'exit'
      </Text>
      <Text color="gray" dimColor>
        ─────────────────────────────────────────────────────────
      </Text>
    </Box>
  );
}

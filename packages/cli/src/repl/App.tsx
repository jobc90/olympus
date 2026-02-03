import React, { useEffect } from 'react';
import { Box, useApp, useInput } from 'ink';
import { Banner, Input, Output } from './components/index.js';
import { useRepl } from './hooks/index.js';

export function ReplApp() {
  const { exit } = useApp();
  const [state, actions] = useRepl();

  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (state.isExecuting) {
        // First Ctrl+C: cancel current execution
        actions.submitCommand(''); // This will be ignored, but signals intent
      } else {
        // Second Ctrl+C or not executing: exit
        actions.exit();
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Banner />

      <Output lines={state.output} />

      <Input
        value={state.inputValue}
        onChange={actions.setInputValue}
        onSubmit={actions.submitCommand}
        onHistoryUp={() => actions.navigateHistory('up')}
        onHistoryDown={() => actions.navigateHistory('down')}
        disabled={state.isExecuting}
        placeholder={state.isExecuting ? 'Processing...' : 'Type a prompt...'}
      />
    </Box>
  );
}

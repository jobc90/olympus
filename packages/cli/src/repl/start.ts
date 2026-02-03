import React from 'react';
import { render } from 'ink';
import { ReplApp } from './App.js';

export interface StartReplOptions {
  // Future options for Gateway connection, etc.
}

/**
 * Start the interactive REPL
 */
export async function startRepl(_options: StartReplOptions = {}): Promise<void> {
  // Check if running in a TTY
  if (!process.stdin.isTTY) {
    console.error('Error: Interactive mode requires a TTY. Use olympus run <prompt> for non-interactive usage.');
    process.exit(1);
  }

  // Render the REPL app
  const { waitUntilExit } = render(React.createElement(ReplApp));

  // Wait until user exits
  await waitUntilExit();
}

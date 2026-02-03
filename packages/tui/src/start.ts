import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { OlympusClient } from '@olympus-dev/client';
import { DEFAULT_GATEWAY_PORT, DEFAULT_GATEWAY_HOST } from '@olympus-dev/protocol';

export interface StartTuiOptions {
  port?: number;
  host?: string;
  apiKey?: string;
  demoRunId?: string; // Auto-subscribe to this run ID
  WebSocket: typeof globalThis.WebSocket;
}

export function startTui(options: StartTuiOptions): { waitUntilExit: () => Promise<void> } {
  const client = new OlympusClient({
    clientType: 'tui',
    port: options.port ?? DEFAULT_GATEWAY_PORT,
    host: options.host ?? DEFAULT_GATEWAY_HOST,
    apiKey: options.apiKey,
    WebSocket: options.WebSocket,
  });

  const { waitUntilExit } = render(
    React.createElement(App, { client, autoSubscribeRunId: options.demoRunId })
  );

  return { waitUntilExit };
}

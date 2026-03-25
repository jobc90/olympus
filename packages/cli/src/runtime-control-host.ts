export interface RuntimeControlHostLike {
  sendRuntimeInput(input: string, submit?: boolean): void | Promise<void>;
  resetSession(): void | Promise<void>;
  captureTerminalSnapshot(lines?: number): Promise<string>;
  stop(): void | Promise<void>;
}

/**
 * REPL Type Definitions
 */

export type OutputType = 'user' | 'gemini' | 'gpt' | 'system' | 'error';

export interface OutputLine {
  id: string;
  type: OutputType;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface ReplCommand {
  id: string;
  text: string;
  submittedAt: number;
  status: 'pending' | 'executing' | 'complete' | 'error';
}

export interface ReplState {
  // Input state
  inputValue: string;
  history: string[];
  historyIndex: number;

  // Output state
  output: OutputLine[];

  // Execution state
  isExecuting: boolean;
  currentCommand: ReplCommand | null;

  // Connection state
  isConnected: boolean;
}

export interface ReplActions {
  setInputValue: (value: string) => void;
  submitCommand: (text: string) => Promise<void>;
  navigateHistory: (direction: 'up' | 'down') => void;
  clearOutput: () => void;
  exit: () => void;
}

export type ReplHook = [ReplState, ReplActions];

// Built-in commands
export const BUILTIN_COMMANDS = ['exit', 'quit', 'help', 'clear', 'status'] as const;
export type BuiltinCommand = typeof BUILTIN_COMMANDS[number];

export function isBuiltinCommand(cmd: string): cmd is BuiltinCommand {
  return BUILTIN_COMMANDS.includes(cmd.toLowerCase().trim() as BuiltinCommand);
}

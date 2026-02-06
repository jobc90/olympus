import { useState, useCallback, useRef } from 'react';
import { runParallel, checkAuthStatus } from '@olympus-dev/core';
import type { ReplState, ReplActions, ReplHook, OutputLine, ReplCommand } from '../types.js';
import { isBuiltinCommand } from '../types.js';

let outputIdCounter = 0;
const generateId = () => `output-${++outputIdCounter}`;

export function useRepl(): ReplHook {
  const [state, setState] = useState<ReplState>({
    inputValue: '',
    history: [],
    historyIndex: -1,
    output: [],
    isExecuting: false,
    currentCommand: null,
    isConnected: true, // Direct mode, always "connected"
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const addOutput = useCallback((line: Omit<OutputLine, 'id' | 'timestamp'>) => {
    setState((prev) => ({
      ...prev,
      output: [
        ...prev.output,
        {
          ...line,
          id: generateId(),
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  const updateStreamingOutput = useCallback((type: OutputLine['type'], content: string) => {
    setState((prev) => {
      const existingIdx = prev.output.findIndex(
        (o) => o.type === type && o.isStreaming
      );

      if (existingIdx >= 0) {
        // Update existing streaming line
        const newOutput = [...prev.output];
        newOutput[existingIdx] = {
          ...newOutput[existingIdx],
          content: newOutput[existingIdx].content + content,
        };
        return { ...prev, output: newOutput };
      } else {
        // Create new streaming line
        return {
          ...prev,
          output: [
            ...prev.output,
            {
              id: generateId(),
              type,
              content,
              timestamp: Date.now(),
              isStreaming: true,
            },
          ],
        };
      }
    });
  }, []);

  const finalizeStreamingOutput = useCallback((type: OutputLine['type']) => {
    setState((prev) => ({
      ...prev,
      output: prev.output.map((o) =>
        o.type === type && o.isStreaming ? { ...o, isStreaming: false } : o
      ),
    }));
  }, []);

  const handleBuiltinCommand = useCallback(
    (cmd: string): boolean => {
      const lowerCmd = cmd.toLowerCase().trim();

      switch (lowerCmd) {
        case 'exit':
        case 'quit':
          addOutput({ type: 'system', content: 'Goodbye!' });
          setTimeout(() => process.exit(0), 100);
          return true;

        case 'help':
          addOutput({
            type: 'system',
            content: `Available commands:
  <prompt>  - Send prompt to AI agents (Gemini + Codex)
  help      - Show this help message
  clear     - Clear the output
  status    - Show connection status
  exit/quit - Exit the REPL`,
          });
          return true;

        case 'clear':
          setState((prev) => ({ ...prev, output: [] }));
          return true;

        case 'status':
          addOutput({
            type: 'system',
            content: `Mode: Direct (no Gateway)
Agents: Gemini + Codex`,
          });
          return true;

        default:
          return false;
      }
    },
    [addOutput]
  );

  const submitCommand = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Add to history
      setState((prev) => ({
        ...prev,
        inputValue: '',
        history: [...prev.history, trimmed],
        historyIndex: -1,
      }));

      // Show user input
      addOutput({ type: 'user', content: trimmed });

      // Handle builtin commands
      if (isBuiltinCommand(trimmed)) {
        handleBuiltinCommand(trimmed);
        return;
      }

      // Execute AI command
      setState((prev) => ({
        ...prev,
        isExecuting: true,
        currentCommand: {
          id: generateId(),
          text: trimmed,
          submittedAt: Date.now(),
          status: 'executing',
        },
      }));

      try {
        // Check auth status
        const authStatus = await checkAuthStatus();
        const availableAgents = (['gemini', 'codex'] as const).filter(
          (a) => authStatus[a]
        );

        if (availableAgents.length === 0) {
          addOutput({
            type: 'error',
            content: 'No authenticated agents. Run: olympus auth gemini or olympus auth openai',
          });
          setState((prev) => ({ ...prev, isExecuting: false, currentCommand: null }));
          return;
        }

        // Create abort controller
        abortControllerRef.current = new AbortController();

        // Run parallel analysis with streaming
        const result = await runParallel({
          prompt: trimmed,
          agents: availableAgents,
          timeout: 120000,
        });

        // Display results
        if (result.gemini) {
          if (result.gemini.success) {
            addOutput({
              type: 'gemini',
              content: result.gemini.output || '(no output)',
            });
          } else {
            addOutput({
              type: 'error',
              content: `Gemini error: ${result.gemini.error}`,
            });
          }
        }

        const codexResult = result.codex ?? result.gpt;
        if (codexResult) {
          if (codexResult.success) {
            addOutput({
              type: 'codex',
              content: codexResult.output || '(no output)',
            });
          } else {
            addOutput({
              type: 'error',
              content: `Codex error: ${codexResult.error}`,
            });
          }
        }

        addOutput({
          type: 'system',
          content: `Completed in ${result.durationMs}ms`,
        });
      } catch (err) {
        addOutput({
          type: 'error',
          content: `Error: ${(err as Error).message}`,
        });
      } finally {
        setState((prev) => ({
          ...prev,
          isExecuting: false,
          currentCommand: null,
        }));
        abortControllerRef.current = null;
      }
    },
    [addOutput, handleBuiltinCommand]
  );

  const setInputValue = useCallback((value: string) => {
    setState((prev) => ({ ...prev, inputValue: value }));
  }, []);

  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    setState((prev) => {
      if (prev.history.length === 0) return prev;

      let newIndex = prev.historyIndex;

      if (direction === 'up') {
        if (newIndex < prev.history.length - 1) {
          newIndex++;
        }
      } else {
        if (newIndex > 0) {
          newIndex--;
        } else {
          // Return to empty input
          return { ...prev, historyIndex: -1, inputValue: '' };
        }
      }

      const historyValue = prev.history[prev.history.length - 1 - newIndex];
      return {
        ...prev,
        historyIndex: newIndex,
        inputValue: historyValue || '',
      };
    });
  }, []);

  const clearOutput = useCallback(() => {
    setState((prev) => ({ ...prev, output: [] }));
  }, []);

  const exit = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    process.exit(0);
  }, []);

  const actions: ReplActions = {
    setInputValue,
    submitCommand,
    navigateHistory,
    clearOutput,
    exit,
  };

  return [state, actions];
}

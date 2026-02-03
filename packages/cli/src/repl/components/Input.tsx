import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function Input({
  value,
  onChange,
  onSubmit,
  onHistoryUp,
  onHistoryDown,
  disabled = false,
  placeholder = 'Type a prompt...',
}: InputProps) {
  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      if (value.trim()) {
        onSubmit(value);
      }
      return;
    }

    if (key.upArrow) {
      onHistoryUp();
      return;
    }

    if (key.downArrow) {
      onHistoryDown();
      return;
    }

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }

    // Regular character input
    if (input && !key.ctrl && !key.meta) {
      onChange(value + input);
    }
  });

  return (
    <Box>
      <Text color="cyan" bold>
        olympus{'> '}
      </Text>
      {value ? (
        <Text>{value}</Text>
      ) : (
        <Text color="gray" dimColor>
          {placeholder}
        </Text>
      )}
      {!disabled && <Text color="cyan">▌</Text>}
    </Box>
  );
}

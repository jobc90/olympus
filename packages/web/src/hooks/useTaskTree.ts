import { useState, useEffect, useCallback } from 'react';
import type { Task, TaskTreeNode, CreateTaskInput, UpdateTaskInput } from '@olympus-dev/protocol';

export interface UseTaskTreeOptions {
  baseUrl?: string;
  apiKey?: string;
}

export interface UseTaskTreeReturn {
  tree: TaskTreeNode[];
  loading: boolean;
  error: string | null;
  selectedTask: Task | null;
  refresh: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  selectTask: (id: string | null) => void;
  moveTask: (id: string, newParentId: string | null) => Promise<void>;
}

export function useTaskTree(options: UseTaskTreeOptions = {}): UseTaskTreeReturn {
  const { baseUrl = 'http://localhost:18790', apiKey } = options;
  const [tree, setTree] = useState<TaskTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/tasks?format=tree`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch tasks: ${res.status}`);
      }
      const data = await res.json();
      setTree(data.tasks || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, apiKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTask = useCallback(async (input: CreateTaskInput): Promise<Task> => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create task');
    }
    const data = await res.json();
    await refresh();
    return data.task;
  }, [baseUrl, apiKey, refresh]);

  const updateTask = useCallback(async (id: string, input: UpdateTaskInput): Promise<Task> => {
    const res = await fetch(`${baseUrl}/api/tasks/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to update task');
    }
    const data = await res.json();
    await refresh();
    return data.task;
  }, [baseUrl, apiKey, refresh]);

  const deleteTask = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`${baseUrl}/api/tasks/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to delete task');
    }
    await refresh();
    if (selectedTask?.id === id) {
      setSelectedTask(null);
    }
  }, [baseUrl, apiKey, refresh, selectedTask]);

  const selectTask = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedTask(null);
      return;
    }
    try {
      const res = await fetch(`${baseUrl}/api/tasks/${id}/context`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedTask(data.task);
      }
    } catch (e) {
      console.error('Failed to fetch task:', e);
    }
  }, [baseUrl, apiKey]);

  const moveTask = useCallback(async (id: string, newParentId: string | null): Promise<void> => {
    await updateTask(id, { parentId: newParentId });
  }, [updateTask]);

  return {
    tree,
    loading,
    error,
    selectedTask,
    refresh,
    createTask,
    updateTask,
    deleteTask,
    selectTask,
    moveTask,
  };
}

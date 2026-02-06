import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  Context,
  ContextTreeNode,
  CreateContextInput,
  UpdateContextInput,
  ContextVersionEntry,
  Operation,
} from '@olympus-dev/protocol';

export interface UseContextTreeOptions {
  baseUrl?: string;
  apiKey?: string;
}

export interface UseContextTreeReturn {
  tree: ContextTreeNode[];
  loading: boolean;
  error: string | null;
  selectedContext: Context | null;
  versions: ContextVersionEntry[];
  refresh: () => Promise<void>;
  createContext: (input: CreateContextInput) => Promise<Context>;
  updateContext: (id: string, input: UpdateContextInput) => Promise<Context>;
  deleteContext: (id: string) => Promise<void>;
  selectContext: (id: string | null) => void;
  fetchVersions: (id: string) => Promise<void>;
  requestMerge: (sourceId: string, targetId: string) => Promise<{ operationId: string; mergeId: string }>;
  reportUpstream: (id: string) => Promise<{ operationId: string }>;
  getOperation: (id: string) => Promise<Operation>;
}

async function safeJsonParse(res: Response): Promise<{ message?: string }> {
  try {
    return await res.json();
  } catch {
    return { message: `HTTP ${res.status}` };
  }
}

export function useContextTree(options: UseContextTreeOptions = {}): UseContextTreeReturn {
  const { baseUrl = 'http://localhost:18790', apiKey } = options;
  const [tree, setTree] = useState<ContextTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<Context | null>(null);
  const [versions, setVersions] = useState<ContextVersionEntry[]>([]);

  const headers: HeadersInit = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }), [apiKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/contexts?format=tree`, { headers });
      if (!res.ok) {
        const err = await safeJsonParse(res);
        throw new Error(err.message || `Failed to fetch contexts: ${res.status}`);
      }
      const data = await res.json();
      setTree(data.contexts || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, headers]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectContext = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedContext(null);
      setVersions([]);
      return;
    }
    try {
      const res = await fetch(`${baseUrl}/api/contexts/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedContext(data.context);
      } else {
        const err = await safeJsonParse(res);
        setError(err.message || 'Failed to fetch context');
        setSelectedContext(null);
      }
    } catch (e) {
      setError((e as Error).message);
      setSelectedContext(null);
    }
  }, [baseUrl, headers]);

  const fetchVersions = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/contexts/${id}/versions?limit=50`, { headers });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (e) {
      console.error('Failed to fetch versions:', e);
    }
  }, [baseUrl, headers]);

  const createContext = useCallback(async (input: CreateContextInput): Promise<Context> => {
    const res = await fetch(`${baseUrl}/api/contexts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await safeJsonParse(res);
      throw new Error(err.message || 'Failed to create context');
    }
    const data = await res.json();
    await refresh();
    return data.context;
  }, [baseUrl, headers, refresh]);

  const updateContext = useCallback(async (id: string, input: UpdateContextInput): Promise<Context> => {
    const res = await fetch(`${baseUrl}/api/contexts/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await safeJsonParse(res);
      throw new Error(err.message || 'Failed to update context');
    }
    const data = await res.json();
    await refresh();
    if (selectedContext?.id === id) {
      setSelectedContext(data.context);
    }
    return data.context;
  }, [baseUrl, headers, refresh, selectedContext]);

  const deleteContext = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`${baseUrl}/api/contexts/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const err = await safeJsonParse(res);
      throw new Error(err.message || 'Failed to delete context');
    }
    await refresh();
    if (selectedContext?.id === id) {
      setSelectedContext(null);
      setVersions([]);
    }
  }, [baseUrl, headers, refresh, selectedContext]);

  const requestMerge = useCallback(async (sourceId: string, targetId: string) => {
    const res = await fetch(`${baseUrl}/api/contexts/${sourceId}/merge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetId }),
    });
    if (!res.ok) {
      const err = await safeJsonParse(res);
      throw new Error(err.message || 'Failed to request merge');
    }
    return res.json();
  }, [baseUrl, headers]);

  const reportUpstream = useCallback(async (id: string) => {
    const res = await fetch(`${baseUrl}/api/contexts/${id}/report-upstream`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      const err = await safeJsonParse(res);
      throw new Error(err.message || 'Failed to report upstream');
    }
    return res.json();
  }, [baseUrl, headers]);

  const getOperation = useCallback(async (id: string): Promise<Operation> => {
    const res = await fetch(`${baseUrl}/api/operations/${id}`, { headers });
    if (!res.ok) {
      const err = await safeJsonParse(res);
      throw new Error(err.message || 'Failed to get operation');
    }
    const data = await res.json();
    return data.operation;
  }, [baseUrl, headers]);

  return {
    tree,
    loading,
    error,
    selectedContext,
    versions,
    refresh,
    createContext,
    updateContext,
    deleteContext,
    selectContext,
    fetchVersions,
    requestMerge,
    reportUpstream,
    getOperation,
  };
}

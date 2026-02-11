import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

function friendlyError(e: unknown): string {
  const msg = (e as Error).message || String(e);
  if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('ERR_CONNECTION_REFUSED')) {
    return 'Cannot connect to Gateway. Is it running?';
  }
  if (msg.includes('API key') || msg.includes('Unauthorized')) {
    return 'Authentication failed. Check your API Key in Settings.';
  }
  return msg;
}

export function useContextTree(options: UseContextTreeOptions = {}): UseContextTreeReturn {
  const { baseUrl = 'http://localhost:8200', apiKey } = options;
  const [tree, setTree] = useState<ContextTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<Context | null>(null);
  const [versions, setVersions] = useState<ContextVersionEntry[]>([]);

  // AbortControllers refs
  const refreshAbortRef = useRef<AbortController | null>(null);
  const selectAbortRef = useRef<AbortController | null>(null);
  const versionsAbortRef = useRef<AbortController | null>(null);

  const headers: HeadersInit = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }), [apiKey]);

  const refresh = useCallback(async () => {
    // Don't fetch if no API key configured
    if (!apiKey) {
      setLoading(false);
      setError('API Key not configured. Open Settings to connect.');
      return;
    }

    // Abort previous request if active
    if (refreshAbortRef.current) {
      refreshAbortRef.current.abort();
    }
    const controller = new AbortController();
    refreshAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/contexts?format=tree`, {
        headers,
        signal: controller.signal
      });
      if (!res.ok) {
        const err = await safeJsonParse(res);
        throw new Error(err.message || `Failed to fetch contexts: ${res.status}`);
      }
      const data = await res.json();
      if (!controller.signal.aborted) {
        setTree(data.contexts || []);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && !controller.signal.aborted) {
        setError(friendlyError(e));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [baseUrl, headers, apiKey]);

  // Initial load and auto-refresh
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000); // 30s auto-refresh

    return () => {
      clearInterval(interval);
      if (refreshAbortRef.current) {
        refreshAbortRef.current.abort();
      }
      if (selectAbortRef.current) {
        selectAbortRef.current.abort();
      }
      if (versionsAbortRef.current) {
        versionsAbortRef.current.abort();
      }
    };
  }, [refresh]);

  const selectContext = useCallback(async (id: string | null) => {
    if (selectAbortRef.current) {
      selectAbortRef.current.abort();
    }

    if (!id) {
      setSelectedContext(null);
      setVersions([]);
      return;
    }

    const controller = new AbortController();
    selectAbortRef.current = controller;

    try {
      const res = await fetch(`${baseUrl}/api/contexts/${id}`, { 
        headers,
        signal: controller.signal
      });
      if (res.ok) {
        const data = await res.json();
        if (!controller.signal.aborted) {
          setSelectedContext(data.context);
        }
      } else {
        const err = await safeJsonParse(res);
        if (!controller.signal.aborted) {
          setError(err.message || 'Failed to fetch context');
          setSelectedContext(null);
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(friendlyError(e));
        setSelectedContext(null);
      }
    }
  }, [baseUrl, headers]);

  const fetchVersions = useCallback(async (id: string) => {
    if (versionsAbortRef.current) {
      versionsAbortRef.current.abort();
    }

    const controller = new AbortController();
    versionsAbortRef.current = controller;

    try {
      const res = await fetch(`${baseUrl}/api/contexts/${id}/versions?limit=50`, { 
        headers,
        signal: controller.signal
      });
      if (res.ok) {
        const data = await res.json();
        if (!controller.signal.aborted) {
          setVersions(data.versions || []);
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to fetch versions:', e);
      }
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
    // Only update selected context if it's the one we modified
    setSelectedContext((prev) => (prev?.id === id ? data.context : prev));
    return data.context;
  }, [baseUrl, headers, refresh]);

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
    setSelectedContext((prev) => (prev?.id === id ? null : prev));
    if (selectedContext?.id === id) {
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
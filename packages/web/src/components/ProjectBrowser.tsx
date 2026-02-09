import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from './Card';

interface CodexProject {
  name: string;
  path: string;
  aliases: string[];
  techStack: string[];
}

interface CodexSession {
  id: string;
  name: string;
  projectPath: string;
  status: string;
  lastActivity: number;
}

interface SearchResult {
  projectName: string;
  projectPath: string;
  matchType: string;
  content: string;
  score: number;
  timestamp: number;
}

interface ProjectBrowserProps {
  connected: boolean;
  getProjects: () => Promise<CodexProject[]>;
  getSessions: () => Promise<CodexSession[]>;
  search: (query: string) => Promise<SearchResult[]>;
}

const STATUS_ICON: Record<string, string> = {
  ready: '🟢',
  busy: '🟡',
  idle: '🔵',
  starting: '⏳',
  closed: '⚫',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ProjectBrowser({ connected, getProjects, getSessions, search }: ProjectBrowserProps) {
  const [projects, setProjects] = useState<CodexProject[]>([]);
  const [sessions, setSessions] = useState<CodexSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<'projects' | 'sessions' | 'search'>('projects');

  const refresh = useCallback(async () => {
    if (!connected) return;
    try {
      const [p, s] = await Promise.all([getProjects(), getSessions()]);
      setProjects(p);
      setSessions(s);
    } catch {
      // best effort
    }
  }, [connected, getProjects, getSessions]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q || searching) return;
    setSearching(true);
    setTab('search');
    try {
      const results = await search(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searching, search]);

  return (
    <Card>
      <CardHeader
        action={
          <button
            onClick={refresh}
            disabled={!connected}
            className="text-xs text-text-muted hover:text-primary transition-colors"
          >
            Refresh
          </button>
        }
      >
        Codex Browser
      </CardHeader>

      {/* Search */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search across projects..."
          disabled={!connected}
          className="flex-1 bg-surface-hover border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleSearch}
          disabled={!connected || searching}
          className="px-2 py-1 text-xs bg-surface-hover border border-border rounded hover:border-primary disabled:opacity-40 transition-colors"
        >
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-3 border-b border-border">
        {(['projects', 'sessions', 'search'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2 py-1 text-xs transition-colors border-b-2 ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t === 'projects' ? `Projects (${projects.length})` :
             t === 'sessions' ? `Sessions (${sessions.length})` :
             `Search (${searchResults.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-64 overflow-y-auto space-y-1.5">
        {tab === 'projects' && projects.map(p => (
          <div key={p.path} className="bg-surface-hover rounded p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">{p.name}</span>
              <span className="text-text-muted font-mono">{p.path.split('/').slice(-2).join('/')}</span>
            </div>
            {p.techStack.length > 0 && (
              <div className="flex gap-1 mt-1">
                {p.techStack.map(t => (
                  <span key={t} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px]">{t}</span>
                ))}
              </div>
            )}
            {p.aliases.length > 0 && (
              <div className="text-text-muted mt-0.5">Aliases: {p.aliases.join(', ')}</div>
            )}
          </div>
        ))}

        {tab === 'sessions' && sessions.map(s => (
          <div key={s.id} className="bg-surface-hover rounded p-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span>{STATUS_ICON[s.status] ?? '⚪'}</span>
              <span className="font-medium text-text-primary">{s.name}</span>
              <span className="text-text-muted ml-auto">{relativeTime(s.lastActivity)}</span>
            </div>
            <div className="text-text-muted font-mono mt-0.5">
              {s.projectPath.split('/').slice(-2).join('/')}
            </div>
          </div>
        ))}

        {tab === 'search' && searchResults.map((r, i) => (
          <div key={`${r.projectPath}-${i}`} className="bg-surface-hover rounded p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">{r.projectName}</span>
              <span className="px-1.5 py-0.5 bg-warning/10 text-warning rounded text-[10px]">{r.matchType}</span>
            </div>
            <div className="text-text-secondary mt-0.5 whitespace-pre-wrap break-words">
              {r.content.slice(0, 200)}{r.content.length > 200 && '...'}
            </div>
            <div className="text-text-muted mt-0.5 flex justify-between">
              <span>score: {r.score.toFixed(1)}</span>
              <span>{relativeTime(r.timestamp)}</span>
            </div>
          </div>
        ))}

        {tab === 'projects' && projects.length === 0 && (
          <p className="text-xs text-text-muted text-center py-3">No projects registered</p>
        )}
        {tab === 'sessions' && sessions.length === 0 && (
          <p className="text-xs text-text-muted text-center py-3">No active sessions</p>
        )}
        {tab === 'search' && searchResults.length === 0 && !searching && (
          <p className="text-xs text-text-muted text-center py-3">Search across all Codex projects</p>
        )}
      </div>
    </Card>
  );
}

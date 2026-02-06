import React, { useState } from 'react';
import { Card, CardHeader } from './Card';
import type { UseContextTreeReturn } from '../hooks/useContextTree';
import type { ContextTreeNode, ContextScope } from '@olympus-dev/protocol';

interface ContextExplorerProps {
  ctx: UseContextTreeReturn;
  readOnly?: boolean;
  onSettingsClick?: () => void;
}

const SCOPE_ICONS: Record<ContextScope, string> = {
  workspace: '\u{1F30D}',
  project: '\u{1F4C1}',
  task: '\u{2705}',
};

const SCOPE_COLORS: Record<ContextScope, string> = {
  workspace: 'text-primary',
  project: 'text-warning',
  task: 'text-success',
};

function TreeNode({
  node,
  selectedId,
  depth,
  onSelect,
}: {
  node: ContextTreeNode;
  selectedId: string | null;
  depth: number;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer text-sm transition-colors ${
          isSelected
            ? 'bg-primary/20 text-primary'
            : 'hover:bg-surface-hover text-text'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(node.id))}
      >
        {hasChildren ? (
          <button
            className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-text"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className={SCOPE_COLORS[node.scope]}>{SCOPE_ICONS[node.scope]}</span>
        <span className="truncate">{node.summary || node.path}</span>
        <span className="text-xs text-text-muted ml-auto font-mono">v{node.version}</span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContextDetail({ ctx, readOnly }: { ctx: UseContextTreeReturn; readOnly: boolean }) {
  const { selectedContext, versions, updateContext, deleteContext, reportUpstream, fetchVersions } = ctx;
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!selectedContext) {
    return (
      <div className="text-center text-text-muted py-8 text-sm">
        Select a context to view details
      </div>
    );
  }

  const handleEdit = () => {
    setEditContent(selectedContext.content || '');
    setEditSummary(selectedContext.summary || '');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateContext(selectedContext.id, {
        content: editContent,
        summary: editSummary,
        expectedVersion: selectedContext.version,
      });
      setEditing(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReport = async () => {
    try {
      const result = await reportUpstream(selectedContext.id);
      alert(`Report submitted. Operation: ${result.operationId}`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleShowVersions = async () => {
    if (!showVersions) {
      await fetchVersions(selectedContext.id);
    }
    setShowVersions(!showVersions);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={SCOPE_COLORS[selectedContext.scope]}>
            {SCOPE_ICONS[selectedContext.scope]}
          </span>
          <span className="font-medium text-sm">{selectedContext.path}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-hover text-text-muted font-mono">
            {selectedContext.scope}
          </span>
        </div>
        <span className="text-xs text-text-muted font-mono">v{selectedContext.version}</span>
      </div>

      {/* Summary */}
      {editing ? (
        <input
          className="w-full px-2 py-1 bg-surface border border-border rounded text-sm"
          value={editSummary}
          onChange={(e) => setEditSummary(e.target.value)}
          placeholder="Summary..."
        />
      ) : (
        selectedContext.summary && (
          <p className="text-sm text-text-secondary">{selectedContext.summary}</p>
        )
      )}

      {/* Content */}
      {editing ? (
        <textarea
          className="w-full px-2 py-1.5 bg-surface border border-border rounded text-sm font-mono min-h-[120px] resize-y"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          placeholder="Context content..."
        />
      ) : (
        <div className="bg-surface-hover rounded p-2 text-sm font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
          {selectedContext.content || <span className="text-text-muted italic">No content</span>}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {editing ? (
          <>
            <button
              className="btn-primary text-xs px-3 py-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              className="text-xs px-3 py-1 text-text-muted hover:text-text transition-colors"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {!readOnly && (
              <button className="btn-primary text-xs px-3 py-1" onClick={handleEdit}>
                Edit
              </button>
            )}
            {!readOnly && selectedContext.parentId && (
              <button
                className="text-xs px-3 py-1 border border-border rounded hover:bg-surface-hover transition-colors"
                onClick={handleReport}
              >
                Report Upstream
              </button>
            )}
            <button
              className="text-xs px-3 py-1 text-text-muted hover:text-text transition-colors"
              onClick={handleShowVersions}
            >
              {showVersions ? 'Hide Versions' : 'Versions'}
            </button>
            {!readOnly && (
              <button
                className="text-xs px-3 py-1 text-error hover:text-error/80 transition-colors ml-auto"
                onClick={() => {
                  if (confirm('Delete this context?')) {
                    deleteContext(selectedContext.id);
                  }
                }}
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>

      {/* Version History */}
      {showVersions && versions.length > 0 && (
        <div className="border-t border-border pt-2 mt-2">
          <h4 className="text-xs font-semibold text-text-secondary uppercase mb-2">
            Version History
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-surface-hover"
              >
                <span className="font-mono text-text-muted">v{v.baseVersion}</span>
                <span className="text-text-secondary truncate mx-2 flex-1">
                  {v.reason || 'No reason'}
                </span>
                <span className="text-text-muted">{v.actor}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-text-muted pt-1 border-t border-border flex justify-between">
        <span>ID: {selectedContext.id}</span>
        <span>Updated: {new Date(selectedContext.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

export function ContextExplorer({ ctx, readOnly = true, onSettingsClick }: ContextExplorerProps) {
  const { tree, loading, error, selectedContext, refresh } = ctx;
  const [showCreate, setShowCreate] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newScope, setNewScope] = useState<ContextScope>('project');
  const [newParentId, setNewParentId] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newSummary, setNewSummary] = useState('');

  // Reset edit mode if readOnly becomes true
  React.useEffect(() => {
    if (readOnly) setEditMode(false);
  }, [readOnly]);

  const parentCandidates = tree.flatMap((node) => {
    const out: Array<{ id: string; label: string; scope: ContextScope }> = [];
    const stack: ContextTreeNode[] = [node];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      out.push({ id: cur.id, label: cur.path, scope: cur.scope });
      for (const child of cur.children) stack.push(child);
    }
    return out;
  }).filter((c) => (newScope === 'project' ? c.scope === 'workspace' : c.scope === 'project'));

  const handleCreate = async () => {
    if (!newPath.trim()) return;
    try {
      const input: {
        scope: ContextScope;
        path: string;
        summary?: string;
        parentId?: string;
      } = {
        scope: newScope,
        path: newPath.trim(),
        summary: newSummary.trim() || undefined,
      };
      if (newScope !== 'workspace') {
        if (!newParentId) {
          alert('Parent context is required for project/task');
          return;
        }
        input.parentId = newParentId;
      }
      await ctx.createContext(input);
      setShowCreate(false);
      setNewPath('');
      setNewSummary('');
      setNewParentId('');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader
        action={
          <div className="flex items-center gap-2">
            <button
              className="text-xs text-text-muted hover:text-text transition-colors"
              onClick={refresh}
              title="Refresh"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            {!readOnly && (
              <>
                <button
                  className={`text-xs transition-colors ${
                    editMode ? 'text-primary' : 'text-text-muted hover:text-text'
                  }`}
                  onClick={() => setEditMode(!editMode)}
                  title={editMode ? 'Lock' : 'Unlock for editing'}
                >
                  {editMode ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  )}
                </button>
                {editMode && (
                  <button
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                    onClick={() => setShowCreate(!showCreate)}
                  >
                    + New
                  </button>
                )}
              </>
            )}
          </div>
        }
      >
        Context Explorer
      </CardHeader>

      {/* Error */}
      {error && (
        <div className="text-xs text-error mb-2 p-2 bg-error/10 rounded">
          <div className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <div className="flex gap-2">
              {error.includes('Settings') && onSettingsClick && (
                <button
                  className="text-xs text-primary hover:text-primary/80 whitespace-nowrap"
                  onClick={onSettingsClick}
                >
                  Settings
                </button>
              )}
              <button
                className="text-xs text-primary hover:text-primary/80 whitespace-nowrap"
                onClick={refresh}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Form */}
      {!readOnly && editMode && showCreate && (
        <div className="mb-3 p-2 bg-surface-hover rounded space-y-2">
          <div className="flex gap-2">
            <select
              className="px-2 py-1 bg-surface border border-border rounded text-xs"
              value={newScope}
              onChange={(e) => {
                setNewScope(e.target.value as ContextScope);
                setNewParentId('');
              }}
            >
              <option value="workspace">Workspace</option>
              <option value="project">Project</option>
              <option value="task">Task</option>
            </select>
            <input
              className="flex-1 px-2 py-1 bg-surface border border-border rounded text-xs"
              placeholder="Path..."
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
            />
          </div>
          {newScope !== 'workspace' && (
            <select
              className="w-full px-2 py-1 bg-surface border border-border rounded text-xs"
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
            >
              <option value="">Select parent...</option>
              {parentCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          )}
          <input
            className="w-full px-2 py-1 bg-surface border border-border rounded text-xs"
            placeholder="Summary (optional)..."
            value={newSummary}
            onChange={(e) => setNewSummary(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-primary text-xs px-3 py-1" onClick={handleCreate}>
              Create
            </button>
            <button
              className="text-xs text-text-muted hover:text-text"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tree View */}
      <div className="mb-3 max-h-64 overflow-y-auto custom-scrollbar">
        {loading && !error ? (
          <div className="text-center text-text-muted py-4 text-sm">Loading...</div>
        ) : error && tree.length === 0 ? (
          <div className="text-center text-text-muted py-4 text-sm px-4">
            Waiting for Gateway connection...
          </div>
        ) : tree.length === 0 ? (
          <div className="text-center text-text-muted py-4 text-sm px-4">
            No contexts yet. Contexts are auto-created when sessions connect to the Gateway.
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              selectedId={selectedContext?.id || null}
              depth={0}
              onSelect={ctx.selectContext}
            />
          ))
        )}
      </div>

      {/* Detail Panel */}
      {selectedContext && (
        <div className="border-t border-border pt-3">
          <ContextDetail ctx={ctx} readOnly={readOnly || !editMode} />
        </div>
      )}
    </Card>
  );
}
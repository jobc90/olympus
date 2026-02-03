import React, { useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { TaskTreeNode, Task } from '@olympus-dev/protocol';
import { useTaskTree } from '../hooks/useTaskTree';

interface TaskNodeProps {
  node: TaskTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function TaskNode({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onDelete,
}: TaskNodeProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: node.id,
    data: { node },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${node.id}`,
    data: { node },
  });

  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        ref={(el) => {
          setDragRef(el);
          setDropRef(el);
        }}
        className={`
          flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer
          transition-colors duration-150
          ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}
          ${isOver ? 'bg-green-900/50 ring-1 ring-green-500' : ''}
          ${isDragging ? 'opacity-50' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
        {...attributes}
        {...listeners}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        {!hasChildren && <span className="w-4" />}

        <span className="flex-1 truncate text-sm">{node.name}</span>

        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            node.status === 'active'
              ? 'bg-green-900/50 text-green-300'
              : 'bg-gray-700 text-gray-400'
          }`}
        >
          {node.status}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete "${node.name}"?`)) {
              onDelete(node.id);
            }
          }}
          className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500"
        >
          ×
        </button>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TaskNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskDetailPanelProps {
  task: Task | null;
  onUpdate: (id: string, updates: { name?: string; context?: string }) => void;
  onClose: () => void;
}

function TaskDetailPanel({ task, onUpdate, onClose }: TaskDetailPanelProps) {
  const [name, setName] = useState(task?.name || '');
  const [context, setContext] = useState(task?.context || '');

  React.useEffect(() => {
    setName(task?.name || '');
    setContext(task?.context || '');
  }, [task]);

  if (!task) return null;

  const taskWithContext = task as Task & { resolvedContext?: string; ancestors?: { id: string; name: string; context: string | null }[] };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Task Details</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          ×
        </button>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== task.name && onUpdate(task.id, { name })}
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Context</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          onBlur={() => context !== task.context && onUpdate(task.id, { context })}
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white h-32 resize-none"
          placeholder="Add context for this task..."
        />
      </div>

      {taskWithContext.ancestors && taskWithContext.ancestors.length > 0 && (
        <div>
          <label className="block text-sm text-gray-400 mb-1">Ancestors</label>
          <div className="space-y-1">
            {taskWithContext.ancestors.map((ancestor) => (
              <div key={ancestor.id} className="text-sm text-gray-500">
                📁 {ancestor.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {taskWithContext.resolvedContext && (
        <div>
          <label className="block text-sm text-gray-400 mb-1">Resolved Context (merged)</label>
          <pre className="bg-gray-900 border border-gray-700 rounded p-3 text-xs text-gray-300 overflow-auto max-h-48 whitespace-pre-wrap">
            {taskWithContext.resolvedContext}
          </pre>
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <div>Path: {task.path}</div>
        <div>Depth: {task.depth}</div>
        <div>Version: {task.version}</div>
        <div>Updated: {new Date(task.updatedAt).toLocaleString()}</div>
      </div>
    </div>
  );
}

export interface TaskTreeProps {
  baseUrl?: string;
  apiKey?: string;
}

export function TaskTree({ baseUrl, apiKey }: TaskTreeProps) {
  const {
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
  } = useTaskTree({ baseUrl, apiKey });

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newTaskName, setNewTaskName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) return;

      const draggedId = active.id as string;
      const targetId = (over.id as string).replace('drop-', '');

      if (draggedId === targetId) return;

      try {
        await moveTask(draggedId, targetId);
      } catch (e) {
        console.error('Failed to move task:', e);
      }
    },
    [moveTask]
  );

  const handleCreateTask = useCallback(async () => {
    if (!newTaskName.trim()) return;
    try {
      await createTask({
        name: newTaskName.trim(),
        parentId: selectedTask?.id,
      });
      setNewTaskName('');
    } catch (e) {
      console.error('Failed to create task:', e);
    }
  }, [newTaskName, selectedTask, createTask]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading tasks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-400 space-y-4">
        <div>Error: {error}</div>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Tree Panel */}
      <div className="w-80 border-r border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
              placeholder={selectedTask ? `New under "${selectedTask.name}"` : 'New root task...'}
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
            />
            <button
              onClick={handleCreateTask}
              disabled={!newTaskName.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium"
            >
              Add
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {tree.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No tasks yet. Create one above!
              </div>
            ) : (
              tree.map((node) => (
                <TaskNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedTask?.id || null}
                  expandedIds={expandedIds}
                  onSelect={selectTask}
                  onToggle={handleToggle}
                  onDelete={deleteTask}
                />
              ))
            )}
            <DragOverlay>
              {activeId && (
                <div className="bg-gray-700 px-3 py-1.5 rounded shadow-lg text-sm">
                  Moving...
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        <div className="p-2 border-t border-gray-700 text-xs text-gray-500">
          Drag tasks to reorganize
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 p-4 overflow-auto">
        {selectedTask ? (
          <TaskDetailPanel
            task={selectedTask}
            onUpdate={updateTask}
            onClose={() => selectTask(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a task to view details
          </div>
        )}
      </div>
    </div>
  );
}

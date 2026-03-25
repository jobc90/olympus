import { mkdirSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveTaskArtifactPaths,
  TASK_ARTIFACT_FILE_NAMES,
  type TaskArtifactKind,
  type TaskArtifactPaths,
} from '@olympus-dev/protocol';

const DEFAULT_CONTROL_ROOT = path.join(os.homedir(), '.olympus', 'control');

export interface ResolveTaskPathsInput {
  projectId: string;
  projectRoot: string;
  taskId: string;
}

export interface WriteMirroredArtifactInput extends ResolveTaskPathsInput {
  artifactKind: TaskArtifactKind;
  content: string;
}

export interface WrittenMirroredArtifact {
  centralPath: string;
  localPath: string;
}

export class TaskArtifactStore {
  constructor(private readonly controlRoot = DEFAULT_CONTROL_ROOT) {}

  resolvePaths(input: ResolveTaskPathsInput): TaskArtifactPaths {
    return resolveTaskArtifactPaths({
      controlRoot: this.controlRoot,
      projectRoot: input.projectRoot,
      projectId: input.projectId,
      taskId: input.taskId,
    });
  }

  ensureTaskDirectories(input: ResolveTaskPathsInput): TaskArtifactPaths {
    const paths = this.resolvePaths(input);
    mkdirSync(paths.central.baseDir, { recursive: true });
    mkdirSync(paths.local.baseDir, { recursive: true });
    return paths;
  }

  writeMirroredArtifact(input: WriteMirroredArtifactInput): WrittenMirroredArtifact {
    const paths = this.ensureTaskDirectories(input);
    const artifactFile = TASK_ARTIFACT_FILE_NAMES[input.artifactKind];
    const centralPath = path.join(paths.central.baseDir, artifactFile);
    const localPath = path.join(paths.local.baseDir, artifactFile);

    writeFileSync(centralPath, input.content, 'utf8');
    writeFileSync(localPath, input.content, 'utf8');

    return {
      centralPath,
      localPath,
    };
  }
}

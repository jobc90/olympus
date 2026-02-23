import { extractContext } from '@olympus-dev/core';
import type { ExtractedContext } from '@olympus-dev/protocol';
import { runCli } from './cli-runner.js';

interface CliResultLike {
  success: boolean;
  text: string;
  error?: { message?: string };
}

interface ExtractWithLlmOptions {
  result: CliResultLike;
  prompt: string;
  timeoutMs?: number;
  maxTextLength?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_TEXT_LENGTH = 12_000;
const MAX_SUMMARY_LENGTH = 500;
const MAX_LIST_ITEMS = 20;
const MAX_LIST_ITEM_LENGTH = 200;

function sanitizeSummary(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback.slice(0, MAX_SUMMARY_LENGTH);
  return raw.slice(0, MAX_SUMMARY_LENGTH);
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().slice(0, MAX_LIST_ITEM_LENGTH);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= MAX_LIST_ITEMS) break;
  }

  return out;
}

function parseJsonPayload(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Continue with block extraction.
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }

  return null;
}

function buildExtractionPrompt(taskPrompt: string, workerOutput: string): string {
  return [
    'You are a strict JSON information extractor.',
    'Extract structured task context from the input below.',
    'Return JSON only. No markdown, no prose.',
    '',
    'Required schema:',
    '{"summary":"string","filesChanged":["string"],"decisions":["string"],"errors":["string"],"dependencies":["string"]}',
    '',
    'Rules:',
    '- summary: concise and factual, max 300 chars.',
    '- filesChanged: repo-relative paths only when explicit.',
    '- decisions: key implementation choices.',
    '- errors: explicit failures, test/build/runtime errors.',
    '- dependencies: package/library changes only.',
    '- if unknown, use empty string/empty array.',
    '',
    'Task Prompt:',
    taskPrompt.slice(0, 2000),
    '',
    'Worker Output:',
    workerOutput,
  ].join('\n');
}

export async function extractContextWithLlm(options: ExtractWithLlmOptions): Promise<ExtractedContext> {
  const {
    result,
    prompt,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxTextLength = DEFAULT_MAX_TEXT_LENGTH,
  } = options;

  const fallback = extractContext(result, prompt);
  const text = result.text ?? '';
  if (!text.trim()) return fallback;

  const promptForExtractor = buildExtractionPrompt(prompt, text.slice(0, maxTextLength));

  try {
    const llmResult = await runCli({
      prompt: promptForExtractor,
      provider: 'codex',
      model: 'gpt-5.3-codex',
      dangerouslySkipPermissions: true,
      timeoutMs,
    });

    if (!llmResult.success || !llmResult.text) {
      return fallback;
    }

    const parsed = parseJsonPayload(llmResult.text);
    if (!parsed) return fallback;

    return {
      success: result.success,
      summary: sanitizeSummary(parsed.summary, fallback.summary),
      filesChanged: sanitizeList(parsed.filesChanged),
      decisions: sanitizeList(parsed.decisions),
      errors: sanitizeList(parsed.errors),
      dependencies: sanitizeList(parsed.dependencies),
    };
  } catch {
    return fallback;
  }
}


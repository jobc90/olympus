import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

function read(relPath) {
  const fullPath = path.join(webRoot, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

const failures = [];

function expectContains(relPath, snippet, label) {
  const source = read(relPath);
  if (!source.includes(snippet)) {
    failures.push(`${label} | ${relPath} | missing: ${snippet}`);
  }
}

function expectRegex(relPath, regex, label) {
  const source = read(relPath);
  if (!regex.test(source)) {
    failures.push(`${label} | ${relPath} | missing pattern: ${regex}`);
  }
}

function expectNoRegex(relPath, regex, label) {
  const source = read(relPath);
  if (regex.test(source)) {
    failures.push(`${label} | ${relPath} | unexpected pattern: ${regex}`);
  }
}

// ---------------------------------------------------------------------------
// Typography freeze (2-font system)
// ---------------------------------------------------------------------------
expectContains('src/index.css', "font-family: 'Space Grotesk', system-ui, sans-serif;", 'Base font family');
expectContains('src/index.css', "font-family: 'JetBrains Mono', monospace;", 'Mono font family');
expectContains('src/index.css', '.text-xs {', 'Body text scale override');
expectContains('src/index.css', '.text-\\[10px\\] {', 'Body text scale override 10px');
expectContains('src/index.css', '.text-\\[11px\\] {', 'Body text scale override 11px');

// Console/Monitor should avoid legacy display fonts.
expectNoRegex('src/App.tsx', /font-pixel|font-serif/, 'No legacy display font classes in App');
expectNoRegex('src/components/dashboard/ActivityFeed.tsx', /font-pixel|font-serif/, 'No legacy display font classes in ActivityFeed');
expectNoRegex('src/components/monitor/OlympusTempleMonitor.tsx', /font-pixel|font-serif/, 'No legacy display font classes in Monitor');

// ---------------------------------------------------------------------------
// Layout freeze
// ---------------------------------------------------------------------------
expectContains('src/App.tsx', 'grid grid-cols-1 xl:grid-cols-4 gap-6 items-stretch', 'Console 3/4 + 1/4 grid');
expectContains('src/App.tsx', 'rounded-2xl h-[248px] pb-2 flex flex-col', 'Olympian Command fixed card height');
expectContains('src/App.tsx', 'min-h-[420px] h-[clamp(420px,52vh,620px)]', 'Worker Tasks fixed section height');
expectContains('src/App.tsx', 'cursor-pointer h-[196px] xl:h-[208px]', 'Live Preview fixed height');
expectContains('src/App.tsx', 'flex-1 min-h-[220px] overflow-hidden', 'Activity Feed fills remaining right column height');

// ---------------------------------------------------------------------------
// Card/component freeze
// ---------------------------------------------------------------------------
expectContains('src/components/dashboard/CodexAgentPanel.tsx', 'Orchestrator / Codex', 'Codex role title');
expectContains('src/components/dashboard/CodexAgentPanel.tsx', 'h-[172px]', 'Codex card height');
expectContains('src/components/dashboard/GeminiAdvisorPanel.tsx', 'Advisor / Gemini', 'Gemini role title');
expectContains('src/components/dashboard/GeminiAdvisorPanel.tsx', 'h-[172px]', 'Gemini card height');
expectContains('src/components/dashboard/WorkerCard.tsx', 'h-[206px]', 'Worker card height');

expectContains('src/components/dashboard/UsageBar.tsx', 'text-lg font-semibold tracking-tight', 'Usage title style');
expectContains('src/components/dashboard/WorkerGrid.tsx', 'text-lg font-semibold tracking-tight', 'Active Workers title style');
expectContains('src/components/dashboard/ActivityFeed.tsx', 'text-lg font-semibold tracking-tight', 'Activity Feed title style');
expectContains('src/components/dashboard/ActivityFeed.tsx', 'flex-nowrap items-center', 'Activity filter one-line layout');
expectContains('src/components/dashboard/ActivityFeed.tsx', 'w-32 shrink-0', 'Activity filter input fixed width');

if (failures.length > 0) {
  console.error('Design freeze check failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Design freeze check passed.');

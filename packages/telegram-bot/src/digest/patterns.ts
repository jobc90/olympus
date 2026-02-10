/**
 * Smart Digest Patterns
 * Regex patterns for classifying and scoring output lines
 */

// ===== Result Patterns (high signal) =====

/** Build results: success/completion indicators */
export const BUILD_PATTERNS = [
  /build\s+(completed|succeeded|passed)/i,  // success only — "failed" goes to error
  /Build:\s*PASS/i,                         // explicit PASS only
  /(\d+)\s*packages?\s*(built|compiled)/i,
  /pnpm\s+(-r\s+)?build/i,
  /Build\s+\d+\/\d+/i,
  /✓\s+Build/i,
];

/** Test results: pass/fail counts, suite names */
export const TEST_PATTERNS = [
  /tests?:\s*\d+\s*passed/i,           // "Tests: 64 passed" or "Tests: 64 passed, 0 failed"
  /\d+\s+passed,\s*\d+\s+failed/i,     // "64 passed, 0 failed" (combined result line)
  /Tests?\s+(\d+)\/(\d+)/i,            // "Tests 64/64"
  /Test:\s*PASS/i,                      // "Test: PASS" explicit
  /^\s*(PASS|FAIL)\s.*\.(test|spec)\./i,   // vitest/jest result lines only
  /✓\s+Test/i,
];

/** Commit/push info: hash, branch, file counts */
export const COMMIT_PATTERNS = [
  /[a-f0-9]{7,}\s+\w+[(:]/i,       // commit hash + message prefix
  /pushed?\s+to\s+\w+/i,
  /\d+\s+files?\s+changed/i,
  /\d+\s+insertions?/i,
  /\d+\s+deletions?/i,
  /→\s*(origin|main|master)/i,
  /push.*done/i,
  /Co-Authored-By:/i,
];

/** Error indicators — NOTE: checked AFTER build/test patterns in classifyLine
 *  This means "Tests: 64 passed, 0 failed" is classified as 'test', not 'error'.
 *  These patterns only match lines NOT already caught by build/test patterns.
 */
export const ERROR_PATTERNS = [
  /\berror\b(?!s?\s*$)/i,            // "error" but not just trailing "errors"
  /(?<!\b0\s+)\bfailed\b/i,          // "failed" but not "0 failed"
  /\bfailure\b/i,
  /✗|❌|✘/,
  /(?<!\d\s+)FAIL\b/,                // "FAIL" but not "0 FAIL"
  /panic|fatal|critical/i,
  /ERR!/i,
  /TypeError|ReferenceError|SyntaxError/i,
];

/** Phase/orchestration progress */
export const PHASE_PATTERNS = [
  /Phase\s+\d+/i,
  /Quality\s+Gates?/i,
  /HARD\s+Gates?/i,
  /Behavior\s+Gates?/i,
  /ACCEPT|REJECT|LOOP/i,
  /CHECKPOINT/i,
  /완료|시작/,
];

/** File change summaries */
export const CHANGE_PATTERNS = [
  /^\s*[\w/.-]+\.(ts|tsx|js|jsx|json|md)\s+[+\-|]/,  // file diff summary
  /Changes?\s+Summary/i,
  /Modified|Created|Deleted/i,
  /\+\d+.*-\d+/,                       // +N -M format
];

/** Quality gate results */
export const QUALITY_PATTERNS = [
  /Lint:\s*(PASS|FAIL|\d+)/i,
  /Type\s*Check:\s*(PASS|FAIL)/i,
  /Coverage/i,
  /0\s+errors?/i,
  /lint\s+(completed|passed)/i,
];

// ===== Noise Patterns (remove) =====

/** Tool/process noise to filter out */
export const NOISE_PATTERNS = [
  /^(Reading|Searching|Globbing|Grepping|Writing)\s+(file|for|in|to|packages?[/.]|src[/.]|\S*\.\w{1,4})/i,  // tool actions with file paths or prepositions
  /^\s*⎿\s*(Reading|Searching|Found|Wrote|Updated)/,
  /^Running \d+ \w+ agents?/i,
  /^(Thinking|Working|Loading|Searching|Globbing|Grepping)\.\.\.$/i,
  /^Using \w+ (tool|agent)/i,
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,
  /\(thinking\)/i,                    // Claude CLI thinking animation
  /[✶✳✢✻✽·⏺].*[✶✳✢✻✽·⏺]/,          // lines with 2+ spinner glyphs (broken ANSI artifacts)
  /│.*│.*│/,                          // pipe-delimited status bar (3+ segments)
  /^\s*\.\.\.\s*$/,
  /^[\s─━═]{20,}$/,                  // horizontal dividers
  /^\s*$/,                            // empty lines
  /^```\w*$/,                         // code block markers (standalone)
  /^\$?\s*tmux\s+(send-keys|capture-pane|list-sessions)/i,  // orchestrator tmux routing commands
  /^\s*[\d,.]+[kKmM]?\s*$/,             // standalone numbers (token counts, costs)
  /^\s*\$[\d.]+\s*$/,                   // standalone dollar amounts ($1.23)
  /^\s*❯/,                              // prompt lines
];

// ===== Immediate Flush Triggers =====

/** Patterns that should trigger immediate buffer flush */
export const IMMEDIATE_FLUSH_PATTERNS = [
  /\berror\b.*\b(failed|failure)\b/i,
  /All\s+Quality\s+Gates\s+passed/i,
  /작업\s*(이\s+)?완료/,
  /Phase\s+\d+.*(:|\s+완료)/i,
  /ACCEPT|REJECT/,
  /모든\s+작업/,
  /push.*done/i,
  /successfully/i,
  /build\s+(completed|succeeded|passed)/i,
  /tests?:\s*\d+\s*passed/i,
  /Build\s*:\s*PASS/i,
  /Test\s*:\s*PASS/i,
  /Lint\s+(completed|passed)/i,
  /\d+\s+files?\s+changed/i,
];

// ===== Secret Patterns (redact) =====

/** Patterns that indicate secrets to mask */
export const SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{20,}/g,               // OpenAI API keys (includes sk-proj-...)
  /\bghp_[a-zA-Z0-9]{20,}/g,               // GitHub PAT (check before generic token)
  /\bglpat-[a-zA-Z0-9_-]{20,}/g,           // GitLab PAT
  /\bBearer\s+[a-zA-Z0-9._-]{20,}/gi,       // Bearer tokens
  /\btoken[=:]\s*["']?[a-zA-Z0-9._-]{20,}/gi, // token=... or token: ...
  /\bapi[_-]?key[=:]\s*["']?[a-zA-Z0-9._-]{10,}/gi, // api_key=...
  /\b[a-f0-9]{40,}\b/g,                     // Long hex strings (SHA, tokens)
];

#!/usr/bin/env node
/**
 * AI Agents MCP Server v2.0 (Protocol v3.0 지원)
 *
 * Multi-AI Orchestration - Claude가 유일한 결정권자
 *
 * 역할 분담:
 * - Claude (Conductor): 유일한 결정권자, 모든 코드 변경 적용
 * - Gemini (Advisor): 프론트엔드 관점 제안/검증 ONLY
 * - Codex (Advisor): 백엔드 관점 제안/검증 ONLY
 *
 * 중요: Gemini/Codex는 결정권 없음. 제안만 제공.
 * Claude가 제안을 검토하고 적용 여부를 결정함.
 *
 * Features:
 * - Agent metadata system with cost classification
 * - Delegation table with domain-based routing
 * - Parallel execution with verification loop
 * - Unified diff patch generation (suggestions only)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// Configuration
const CONFIG_DIR = join(homedir(), ".claude", "mcps", "ai-agents");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");
const LOG_FILE = join(CONFIG_DIR, "server.log");
const WISDOM_FILE = join(CONFIG_DIR, "wisdom.json");
const MODEL_DEFAULTS = {
  geminiFlash: process.env.OLYMPUS_GEMINI_MODEL || process.env.OLYMPUS_GEMINI_FLASH_MODEL || "gemini-3-flash-preview",
  geminiPro: process.env.OLYMPUS_GEMINI_PRO_MODEL || "gemini-3-pro-preview",
  geminiFallbackFlash: process.env.OLYMPUS_GEMINI_FALLBACK_MODEL || "gemini-2.5-flash",
  geminiFallbackPro: process.env.OLYMPUS_GEMINI_FALLBACK_PRO_MODEL || "gemini-2.5-pro",
  codex: process.env.OLYMPUS_CODEX_MODEL || process.env.OLYMPUS_OPENAI_MODEL || "gpt-4o",
};

// ============================================================
// AGENT METADATA SYSTEM (inspired by oh-my-opencode)
// ============================================================

const AGENT_METADATA = {
  gemini: {
    name: "Gemini",
    role: "Frontend Specialist",
    category: "specialist",
    cost: "CHEAP",
    domains: ["UI", "Components", "Styling", "Routing", "Client State"],
    triggers: [
      { domain: "Frontend UI/UX", trigger: "Visual changes, component design" },
      { domain: "Styling", trigger: "CSS, Tailwind, animations" },
      { domain: "Client State", trigger: "Zustand, Redux, React Query" },
    ],
    useWhen: [
      "React/Vue/Svelte component changes",
      "CSS/Tailwind styling updates",
      "Client-side routing modifications",
      "UI state management",
      "Responsive design implementation",
    ],
    avoidWhen: [
      "Pure API/backend logic",
      "Database operations",
      "Server-side rendering logic",
      "CI/CD configuration",
    ],
  },
  codex: {
    name: "Codex",
    role: "Backend Specialist",
    category: "specialist",
    cost: "MODERATE",
    authMethod: "OpenAI OAuth (Codex CLI)",
    domains: ["API", "Structure", "Testing", "CI/CD", "Database"],
    triggers: [
      { domain: "Backend Architecture", trigger: "API design, server logic" },
      { domain: "Testing", trigger: "Unit tests, integration tests" },
      { domain: "DevOps", trigger: "CI/CD, deployment, Docker" },
    ],
    useWhen: [
      "API endpoint design/modification",
      "Database schema changes",
      "Server-side business logic",
      "Test suite creation",
      "Build/deployment configuration",
    ],
    avoidWhen: [
      "Pure UI styling",
      "Client-side only features",
      "CSS animations",
      "Component-only changes",
    ],
  },
};

// Alias for backward compatibility
AGENT_METADATA.gpt = AGENT_METADATA.codex;

// ============================================================
// DELEGATION TABLE
// ============================================================

const DELEGATION_TABLE = {
  // Frontend domains → Gemini
  "component": "gemini",
  "styling": "gemini",
  "css": "gemini",
  "tailwind": "gemini",
  "ui": "gemini",
  "ux": "gemini",
  "animation": "gemini",
  "responsive": "gemini",
  "layout": "gemini",
  "client-state": "gemini",
  "zustand": "gemini",
  "redux": "gemini",
  "react-query": "gemini",
  "routing": "gemini",
  "page": "gemini",

  // Backend domains → Codex
  "api": "codex",
  "endpoint": "codex",
  "database": "codex",
  "schema": "codex",
  "migration": "codex",
  "test": "codex",
  "testing": "codex",
  "ci": "codex",
  "cd": "codex",
  "docker": "codex",
  "deployment": "codex",
  "server": "codex",
  "backend": "codex",
  "authentication": "codex",
  "authorization": "codex",
};

// ============================================================
// LOGGING & PERSISTENCE
// ============================================================

async function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.error(logLine.trim());
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(LOG_FILE, logLine, { flag: "a" });
  } catch (e) {
    // Ignore log errors
  }
}

async function loadCredentials() {
  try {
    const data = await readFile(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveCredentials(creds) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}

async function getRuntimeModels() {
  const creds = await loadCredentials();
  const userModels = creds.models && typeof creds.models === "object" ? creds.models : {};

  return {
    geminiFlash: userModels.geminiFlash || MODEL_DEFAULTS.geminiFlash,
    geminiPro: userModels.geminiPro || MODEL_DEFAULTS.geminiPro,
    geminiFallbackFlash: userModels.geminiFallbackFlash || MODEL_DEFAULTS.geminiFallbackFlash,
    geminiFallbackPro: userModels.geminiFallbackPro || MODEL_DEFAULTS.geminiFallbackPro,
    codex: userModels.codex || MODEL_DEFAULTS.codex,
  };
}

// Wisdom accumulation (oh-my-opencode pattern)
async function loadWisdom() {
  try {
    const data = await readFile(WISDOM_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { patterns: [], lessons: [], lastUpdated: null };
  }
}

async function addWisdom(type, content) {
  const wisdom = await loadWisdom();
  if (type === "pattern") {
    wisdom.patterns.push({ content, timestamp: new Date().toISOString() });
  } else if (type === "lesson") {
    wisdom.lessons.push({ content, timestamp: new Date().toISOString() });
  }
  wisdom.lastUpdated = new Date().toISOString();
  // Keep last 50 entries
  wisdom.patterns = wisdom.patterns.slice(-50);
  wisdom.lessons = wisdom.lessons.slice(-50);
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(WISDOM_FILE, JSON.stringify(wisdom, null, 2));
}

// ============================================================
// AGENT EXECUTORS
// ============================================================

async function executeGeminiWithModel(prompt, model, args) {
  return new Promise((resolve, reject) => {
    const fullArgs = [...args, "--model", model];
    const gemini = spawn("gemini", fullArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    gemini.stdout.on("data", (data) => { stdout += data.toString(); });
    gemini.stderr.on("data", (data) => { stderr += data.toString(); });

    gemini.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout, logs: stderr, agent: "gemini", model });
      } else {
        resolve({ success: false, error: stderr || stdout, code, agent: "gemini", model });
      }
    });

    gemini.on("error", (err) => { reject(err); });

    gemini.stdin.write(prompt);
    gemini.stdin.end();
  });
}

async function executeGemini(prompt, options = {}) {
  const models = await getRuntimeModels();
  const baseArgs = ["--approval-mode", "yolo"];
  const primaryModel = options.model || (options.usePro ? models.geminiPro : models.geminiFlash);
  const fallbackModel = options.usePro ? models.geminiFallbackPro : models.geminiFallbackFlash;

  // 1차: Gemini 3 시도
  const result = await executeGeminiWithModel(prompt, primaryModel, baseArgs);

  // 404/에러 시 Gemini 2.5로 폴백 (Preview 미활성화 사용자)
  if (!result.success && (result.code === 1 || String(result.error).includes("404"))) {
    await log(`Gemini 3 (${primaryModel}) 실패, 폴백: ${fallbackModel}`);
    return executeGeminiWithModel(prompt, fallbackModel, baseArgs);
  }

  return result;
}

// Execute Codex CLI (OpenAI OAuth)
async function executeCodex(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const args = ["exec"];

    // Use full-auto for non-interactive execution
    args.push("--full-auto");

    // Skip git repo check since we're just doing analysis
    args.push("--skip-git-repo-check");

    // Add model if specified
    if (options.model) {
      args.push("-m", options.model);
    }

    // Add system prompt as part of the main prompt
    const fullPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${prompt}`
      : prompt;

    const codex = spawn("codex", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });

    let stdout = "";
    let stderr = "";

    codex.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    codex.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    codex.on("close", (code) => {
      // Extract the actual response from Codex output
      // Codex exec outputs the assistant's response
      const output = stdout.trim();

      if (code === 0 || output) {
        resolve({ success: true, output: output || stderr, logs: stderr, agent: "codex" });
      } else {
        resolve({ success: false, error: stderr || stdout || "Codex execution failed", code, agent: "codex" });
      }
    });

    codex.on("error", (err) => {
      reject(err);
    });

    // Send prompt to stdin
    codex.stdin.write(fullPrompt);
    codex.stdin.end();
  });
}

// Fallback: Execute OpenAI API directly (if API key is available)
async function executeOpenAI(prompt, options = {}) {
  const creds = await loadCredentials();
  const apiKey = creds.openai_api_key || process.env.OPENAI_API_KEY;
  const models = await getRuntimeModels();

  if (!apiKey) {
    // Try Codex CLI instead
    return executeCodex(prompt, options);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || models.codex,
        messages: [
          {
            role: "system",
            content: options.systemPrompt || "You are a helpful assistant specializing in backend architecture and code structure.",
          },
          { role: "user", content: prompt },
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4096,
        response_format: options.jsonMode ? { type: "json_object" } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `OpenAI API error: ${error}`, agent: "codex" };
    }

    const data = await response.json();
    return {
      success: true,
      output: data.choices[0].message.content,
      usage: data.usage,
      agent: "codex",
    };
  } catch (err) {
    return { success: false, error: err.message, agent: "codex" };
  }
}

// ============================================================
// INTELLIGENT ROUTING
// ============================================================

function detectDomain(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const keywords = Object.keys(DELEGATION_TABLE);

  const matches = {
    gemini: 0,
    codex: 0,
  };

  for (const keyword of keywords) {
    if (lowerPrompt.includes(keyword)) {
      matches[DELEGATION_TABLE[keyword]]++;
    }
  }

  return {
    recommended: matches.gemini > matches.codex ? "gemini" : matches.codex > matches.gemini ? "codex" : "both",
    scores: matches,
    shouldParallel: matches.gemini > 0 && matches.codex > 0,
  };
}

// ============================================================
// MCP SERVER
// ============================================================

const server = new Server(
  {
    name: "ai-agents-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const runtimeModels = await getRuntimeModels();

  return {
    tools: [
      // === Core Analysis Tools (제안만 - Claude가 결정) ===
      {
        name: "gemini_analyze",
        description: "[제안만] Gemini(Frontend Advisor)의 분석 의견을 받습니다. Claude가 검토 후 결정. UI, 컴포넌트, 스타일링 전문. Cost: CHEAP.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Analysis prompt" },
            context: { type: "string", description: "Code context" },
          },
          required: ["prompt"],
        },
      },
      {
        name: "codex_analyze",
        description: "[제안만] Codex(Backend Advisor)의 분석 의견을 받습니다. Claude가 검토 후 결정. API, 구조, 테스트 전문. Cost: MODERATE.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Analysis prompt" },
            context: { type: "string", description: "Code context" },
            model: { type: "string", description: `Codex model override (default: ${runtimeModels.codex})` },
          },
          required: ["prompt"],
        },
      },

      // === Patch Generation Tools (제안만 - Claude가 적용 여부 결정) ===
      {
        name: "gemini_patch",
        description: "[제안만] Gemini가 프론트엔드 패치를 제안합니다. Claude가 검토 후 적용 여부 결정. unified diff 형식.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Patch instructions" },
            context: { type: "string", description: "Current code" },
          },
          required: ["prompt"],
        },
      },
      {
        name: "codex_patch",
        description: "[제안만] Codex가 백엔드 패치를 제안합니다. Claude가 검토 후 적용 여부 결정. unified diff 형식.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Patch instructions" },
            context: { type: "string", description: "Current code" },
            model: { type: "string" },
          },
          required: ["prompt"],
        },
      },

      // === Orchestration Tools (제안 수집 - Claude가 최종 결정) ===
      {
        name: "delegate_task",
        description: "[제안 요청] 도메인 감지 후 적절한 AI에게 제안 요청. Claude가 제안을 검토하고 결정.",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string", description: "Task description" },
            context: { type: "string", description: "Code context" },
            force_agent: { type: "string", enum: ["gemini", "codex", "gpt"], description: "Force specific agent" },
          },
          required: ["task"],
        },
      },
      {
        name: "ai_team_analyze",
        description: "[병렬 제안] Gemini+Codex 양쪽에서 분석 의견 수집. Claude가 종합 검토 후 결정.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Analysis task" },
            context: { type: "string", description: "Code context" },
          },
          required: ["prompt"],
        },
      },
      {
        name: "ai_team_patch",
        description: "[병렬 제안] 양쪽 AI의 패치 제안 수집. Claude가 충돌 해결 및 적용 여부 결정.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Patch instructions" },
            context: { type: "string", description: "Current code" },
          },
          required: ["prompt"],
        },
      },

      // === Verification Tools (검증 의견 - Claude가 판단) ===
      {
        name: "verify_patches",
        description: "[검증 의견] Gemini/Codex 패치 간 충돌 검사. Claude가 검증 결과 검토 후 병합 결정.",
        inputSchema: {
          type: "object",
          properties: {
            gemini_patches: { type: "string", description: "Patches from Gemini" },
            codex_patches: { type: "string", description: "Patches from Codex" },
            context: { type: "string", description: "Original code context" },
          },
          required: ["gemini_patches", "codex_patches"],
        },
      },
      {
        name: "review_implementation",
        description: "[검증 의견] 양쪽 AI의 구현 품질 리뷰 수집. Claude가 리뷰 검토 후 조치 결정.",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string", description: "Implementation to review" },
            requirements: { type: "string", description: "Original requirements" },
          },
          required: ["code", "requirements"],
        },
      },

      // === Metadata Tools ===
      {
        name: "get_delegation_table",
        description: "Get the current delegation table showing which domains route to which AI specialist.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_agent_metadata",
        description: "Get detailed metadata about AI agents including their roles, domains, and when to use them.",
        inputSchema: {
          type: "object",
          properties: {
            agent: { type: "string", enum: ["gemini", "codex", "gpt", "all"] },
          },
        },
      },

      // === Wisdom System ===
      {
        name: "add_lesson_learned",
        description: "Add a lesson learned to the wisdom system for future reference.",
        inputSchema: {
          type: "object",
          properties: {
            lesson: { type: "string", description: "Lesson or pattern discovered" },
            type: { type: "string", enum: ["pattern", "lesson"], description: "Type of wisdom" },
          },
          required: ["lesson"],
        },
      },
      {
        name: "get_wisdom",
        description: "Retrieve accumulated wisdom (patterns and lessons) from previous sessions.",
        inputSchema: { type: "object", properties: {} },
      },

      // === Configuration Tools ===
      {
        name: "configure_openai",
        description: "Configure OpenAI API key for Codex tools.",
        inputSchema: {
          type: "object",
          properties: {
            api_key: { type: "string", description: "OpenAI API key (starts with sk-)" },
          },
          required: ["api_key"],
        },
      },
      {
        name: "configure_models",
        description: "Configure preferred runtime models for Gemini/Codex. Values are stored and used as defaults.",
        inputSchema: {
          type: "object",
          properties: {
            gemini_flash: { type: "string", description: "Preferred Gemini flash/default model" },
            gemini_pro: { type: "string", description: "Preferred Gemini pro model" },
            gemini_fallback_flash: { type: "string", description: "Gemini fallback flash model" },
            gemini_fallback_pro: { type: "string", description: "Gemini fallback pro model" },
            codex: { type: "string", description: "Preferred Codex/OpenAI model" },
          },
        },
      },
      {
        name: "check_auth_status",
        description: "Check authentication status for all AI agents.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  await log(`Tool called: ${name}`);

  try {
    switch (name) {
      // === Core Analysis ===
      case "gemini_analyze": {
        const fullPrompt = `You are a Frontend/UI Specialist. Analyze from a frontend perspective.
Focus on: UI components, routing, styling, client-side state, performance, accessibility.

${args.context ? `Context:\n${args.context}\n\n` : ""}Task: ${args.prompt}

Provide specific, actionable recommendations.`;

        const result = await executeGemini(fullPrompt);
        return {
          content: [{
            type: "text",
            text: result.success
              ? `## 🎨 Gemini (Frontend Specialist) Analysis\n\n${result.output}`
              : `❌ Error: ${result.error}`,
          }],
        };
      }

      case "codex_analyze":
      case "gpt_analyze": {
        const systemPrompt = `You are a Backend/Architecture Specialist. Analyze from a backend perspective.
Focus on: Project structure, API design, server components, data fetching, testing, CI/CD, security.`;

        const fullPrompt = `${args.context ? `Context:\n${args.context}\n\n` : ""}Task: ${args.prompt}`;

        const result = await executeOpenAI(fullPrompt, { model: args.model, systemPrompt });
        return {
          content: [{
            type: "text",
            text: result.success
              ? `## ⚙️ Codex (Backend Specialist) Analysis\n\n${result.output}`
              : `❌ Error: ${result.error}`,
          }],
        };
      }

      // === Patch Generation ===
      case "gemini_patch": {
        const fullPrompt = `You are a Frontend/UI Specialist. Generate code patches.

${args.context ? `Current Code:\n\`\`\`\n${args.context}\n\`\`\`\n\n` : ""}Task: ${args.prompt}

Respond with JSON:
\`\`\`json
{
  "patches": [
    {
      "file": "path/to/file",
      "action": "create|modify|delete",
      "diff": "unified diff format",
      "reasoning": "brief explanation"
    }
  ],
  "summary": "one-line summary of changes"
}
\`\`\``;

        const result = await executeGemini(fullPrompt);
        return {
          content: [{
            type: "text",
            text: result.success
              ? `## 🎨 Gemini Frontend Patches\n\n${result.output}`
              : `❌ Error: ${result.error}`,
          }],
        };
      }

      case "codex_patch":
      case "gpt_patch": {
        const systemPrompt = `You are a Backend/Architecture Specialist. Generate code patches. Always respond with valid JSON.`;

        const fullPrompt = `${args.context ? `Current Code:\n\`\`\`\n${args.context}\n\`\`\`\n\n` : ""}Task: ${args.prompt}

Respond with JSON:
{
  "patches": [
    {
      "file": "path/to/file",
      "action": "create|modify|delete",
      "diff": "unified diff format",
      "reasoning": "explanation"
    }
  ],
  "summary": "one-line summary"
}`;

        const result = await executeOpenAI(fullPrompt, { model: args.model, systemPrompt, jsonMode: true });
        return {
          content: [{
            type: "text",
            text: result.success
              ? `## ⚙️ Codex Backend Patches\n\n${result.output}`
              : `❌ Error: ${result.error}`,
          }],
        };
      }

      // === Intelligent Delegation ===
      case "delegate_task": {
        const detection = detectDomain(args.task);
        const forcedAgent = args.force_agent === "gpt" ? "codex" : args.force_agent;
        const agent = forcedAgent || detection.recommended;

        await log(`Delegating to ${agent} (scores: gemini=${detection.scores.gemini}, codex=${detection.scores.codex})`);

        if (agent === "both" || detection.shouldParallel) {
          // Parallel execution
          const [geminiResult, codexResult] = await Promise.all([
            executeGemini(`Frontend analysis:\n${args.context ? `Context:\n${args.context}\n\n` : ""}${args.task}`),
            executeOpenAI(`${args.context ? `Context:\n${args.context}\n\n` : ""}${args.task}`, {
              systemPrompt: "You are a Backend Specialist. Provide backend perspective.",
            }),
          ]);

          return {
            content: [{
              type: "text",
              text: `## 🤝 Parallel Delegation (Mixed Domain Detected)

### 🎨 Gemini (Frontend)
${geminiResult.success ? geminiResult.output : `Error: ${geminiResult.error}`}

---

### ⚙️ Codex (Backend)
${codexResult.success ? codexResult.output : `Error: ${codexResult.error}`}

---
**Domain Scores**: Frontend=${detection.scores.gemini}, Backend=${detection.scores.codex}`,
            }],
          };
        }

        // Single agent delegation
        const executor = agent === "gemini" ? executeGemini : executeOpenAI;
        const role = agent === "gemini" ? "Frontend Specialist" : "Backend Specialist";

        const result = await executor(
          `You are a ${role}.\n\n${args.context ? `Context:\n${args.context}\n\n` : ""}Task: ${args.task}`,
          agent === "codex" ? { systemPrompt: `You are a ${role}.` } : {}
        );

        return {
          content: [{
            type: "text",
            text: result.success
              ? `## ${agent === "gemini" ? "🎨" : "⚙️"} Delegated to ${AGENT_METADATA[agent].name} (${role})

**Routing**: ${detection.recommended} (scores: frontend=${detection.scores.gemini}, backend=${detection.scores.codex})

${result.output}`
              : `❌ Error: ${result.error}`,
          }],
        };
      }

      // === Team Analysis ===
      case "ai_team_analyze": {
        const [geminiResult, codexResult] = await Promise.all([
          executeGemini(`Frontend Specialist Analysis:\n${args.context ? `Context:\n${args.context}\n\n` : ""}${args.prompt}`, { usePro: true }),
          executeOpenAI(`${args.context ? `Context:\n${args.context}\n\n` : ""}${args.prompt}`, {
            systemPrompt: "You are a Backend/Architecture Specialist. Provide analysis from a backend perspective.",
          }),
        ]);

        return {
          content: [{
            type: "text",
            text: `## 🤝 AI Team Analysis Results

### 🎨 Gemini (Frontend Perspective)
${geminiResult.success ? geminiResult.output : `Error: ${geminiResult.error}`}

---

### ⚙️ Codex (Backend Perspective)
${codexResult.success ? codexResult.output : `Error: ${codexResult.error}`}

---

**Claude (Conductor)**: Synthesize above perspectives and implement. Look for:
- Conflicts between frontend/backend recommendations
- Synergies that can be leveraged
- Priority order for implementation`,
          }],
        };
      }

      case "ai_team_patch": {
        const patchPrompt = `Generate code patches for: ${args.prompt}

${args.context ? `Current Code:\n\`\`\`\n${args.context}\n\`\`\`\n\n` : ""}

Respond with JSON patches array.`;

        const [geminiResult, codexResult] = await Promise.all([
          executeGemini(`Frontend Specialist:\n${patchPrompt}`, { usePro: true }),
          executeOpenAI(patchPrompt, {
            systemPrompt: "You are a Backend Specialist. Generate backend-related patches.",
            jsonMode: true,
          }),
        ]);

        return {
          content: [{
            type: "text",
            text: `## 🤝 AI Team Patches

### 🎨 Gemini (Frontend Patches)
${geminiResult.success ? geminiResult.output : `Error: ${geminiResult.error}`}

---

### ⚙️ Codex (Backend Patches)
${codexResult.success ? codexResult.output : `Error: ${codexResult.error}`}

---

**Claude (Conductor)**: Review patches for conflicts before applying:
1. Check for overlapping file modifications
2. Verify consistent naming conventions
3. Merge compatible changes
4. Apply in correct order (usually backend first, then frontend)`,
          }],
        };
      }

      // === Verification ===
      case "verify_patches": {
        const verifyPrompt = `Cross-verify these patches for conflicts and improvements:

## Gemini (Frontend) Patches:
${args.gemini_patches}

## Codex (Backend) Patches:
${args.codex_patches ?? args.gpt_patches}

${args.context ? `## Original Context:\n${args.context}\n\n` : ""}

Analyze:
1. Are there conflicting changes to the same files?
2. Are there dependency issues (frontend depending on backend changes)?
3. What's the recommended merge order?
4. Any improvements to suggest?`;

        const result = await executeOpenAI(verifyPrompt, {
          systemPrompt: "You are a code review specialist. Analyze patches for conflicts and integration issues.",
        });

        return {
          content: [{
            type: "text",
            text: `## ✅ Patch Verification Results\n\n${result.success ? result.output : `Error: ${result.error}`}`,
          }],
        };
      }

      case "review_implementation": {
        const [geminiReview, codexReview] = await Promise.all([
          executeGemini(`Review this implementation from a frontend perspective:

Code:
\`\`\`
${args.code}
\`\`\`

Requirements: ${args.requirements}

Check: UI quality, accessibility, performance, component structure.`, { usePro: true }),
          executeOpenAI(`Review this implementation:

Code:
\`\`\`
${args.code}
\`\`\`

Requirements: ${args.requirements}

Check: Architecture, security, testing coverage, error handling.`, {
            systemPrompt: "You are a code review specialist focusing on backend quality.",
          }),
        ]);

        return {
          content: [{
            type: "text",
            text: `## 📋 Implementation Review

### 🎨 Frontend Review (Gemini)
${geminiReview.success ? geminiReview.output : `Error: ${geminiReview.error}`}

---

### ⚙️ Backend Review (Codex)
${codexReview.success ? codexReview.output : `Error: ${codexReview.error}`}

---

**Summary**: Address any issues before marking task complete.`,
          }],
        };
      }

      // === Metadata ===
      case "get_delegation_table": {
        const tableRows = Object.entries(DELEGATION_TABLE)
          .map(([domain, agent]) => `| ${domain} | ${agent === "gemini" ? "🎨 Gemini" : "⚙️ Codex"} |`)
          .join("\n");

        return {
          content: [{
            type: "text",
            text: `## 📊 Delegation Table

| Domain | Routes To |
|--------|-----------|
${tableRows}

**Usage**: Tasks are automatically routed based on keyword detection.`,
          }],
        };
      }

      case "get_agent_metadata": {
        const agent = args.agent || "all";
        const agents = agent === "all" ? ["gemini", "codex"] : [agent === "gpt" ? "codex" : agent];

        const metadata = agents.map((a) => {
          const m = AGENT_METADATA[a];
          return `### ${a === "gemini" ? "🎨" : "⚙️"} ${m.name} (${m.role})

**Category**: ${m.category}
**Cost**: ${m.cost}
**Domains**: ${m.domains.join(", ")}

**Use When**:
${m.useWhen.map((w) => `- ${w}`).join("\n")}

**Avoid When**:
${m.avoidWhen.map((w) => `- ${w}`).join("\n")}

**Triggers**:
${m.triggers.map((t) => `- ${t.domain}: ${t.trigger}`).join("\n")}`;
        }).join("\n\n---\n\n");

        return {
          content: [{ type: "text", text: `## 🤖 Agent Metadata\n\n${metadata}` }],
        };
      }

      // === Wisdom System ===
      case "add_lesson_learned": {
        await addWisdom(args.type || "lesson", args.lesson);
        return {
          content: [{ type: "text", text: `✅ Added ${args.type || "lesson"} to wisdom system.` }],
        };
      }

      case "get_wisdom": {
        const wisdom = await loadWisdom();
        return {
          content: [{
            type: "text",
            text: `## 📚 Accumulated Wisdom

### Patterns (${wisdom.patterns.length})
${wisdom.patterns.slice(-10).map((p) => `- ${p.content}`).join("\n") || "None yet"}

### Lessons (${wisdom.lessons.length})
${wisdom.lessons.slice(-10).map((l) => `- ${l.content}`).join("\n") || "None yet"}

Last Updated: ${wisdom.lastUpdated || "Never"}`,
          }],
        };
      }

      // === Configuration ===
      case "configure_openai": {
        if (!args.api_key?.startsWith("sk-")) {
          return {
            content: [{ type: "text", text: "❌ Invalid API key format. OpenAI keys start with 'sk-'" }],
          };
        }

        const creds = await loadCredentials();
        creds.openai_api_key = args.api_key;
        await saveCredentials(creds);

        return {
          content: [{ type: "text", text: "✅ OpenAI API key configured. Codex tools are now available." }],
        };
      }

      case "configure_models": {
        const creds = await loadCredentials();
        const previous = creds.models || {};
        creds.models = {
          ...previous,
          ...(args.gemini_flash ? { geminiFlash: args.gemini_flash } : {}),
          ...(args.gemini_pro ? { geminiPro: args.gemini_pro } : {}),
          ...(args.gemini_fallback_flash ? { geminiFallbackFlash: args.gemini_fallback_flash } : {}),
          ...(args.gemini_fallback_pro ? { geminiFallbackPro: args.gemini_fallback_pro } : {}),
          ...(args.codex ? { codex: args.codex } : {}),
        };
        await saveCredentials(creds);
        const runtimeModels = await getRuntimeModels();

        return {
          content: [{
            type: "text",
            text: `✅ Runtime model preferences updated.

- geminiFlash: ${runtimeModels.geminiFlash}
- geminiPro: ${runtimeModels.geminiPro}
- geminiFallbackFlash: ${runtimeModels.geminiFallbackFlash}
- geminiFallbackPro: ${runtimeModels.geminiFallbackPro}
- codex: ${runtimeModels.codex}`,
          }],
        };
      }

      case "check_auth_status": {
        const creds = await loadCredentials();
        const runtimeModels = await getRuntimeModels();
        const geminiOAuth = join(homedir(), ".gemini", "oauth_creds.json");
        const codexAuth = join(homedir(), ".codex", "auth.json");

        let geminiStatus = "❌ Not configured";
        try {
          await readFile(geminiOAuth);
          geminiStatus = "✅ OAuth configured (Google account)";
        } catch {
          geminiStatus = "❌ Not configured - run 'gemini' to login";
        }

        let codexStatus = "❌ Not configured";
        let codexAccount = "";
        try {
          const authData = await readFile(codexAuth, "utf-8");
          const auth = JSON.parse(authData);

          // Check tokens structure (new format)
          if (auth.tokens?.access_token) {
            codexStatus = "✅ OAuth configured (OpenAI account)";
            // Try to extract email from id_token JWT payload
            try {
              const payload = auth.tokens.id_token.split('.')[1];
              const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
              codexAccount = decoded.email || "";
            } catch {}
          } else if (auth.access_token || auth.token) {
            // Legacy format
            codexStatus = "✅ OAuth configured (OpenAI account)";
            codexAccount = auth.email || auth.user?.email || "";
          }
        } catch {
          codexStatus = "❌ Not configured - run 'codex login'";
        }

        const apiKeyStatus = creds.openai_api_key
          ? "✅ API key configured (fallback)"
          : process.env.OPENAI_API_KEY
          ? "✅ Using environment variable (fallback)"
          : "⚪ Not configured (optional)";

        return {
          content: [{
            type: "text",
            text: `## 🔐 AI Agents Auth Status

### 🎨 Gemini
${geminiStatus}
- Auth Method: Google OAuth (via Gemini CLI)
- Cost: CHEAP
- Default Model: ${runtimeModels.geminiFlash}
- Pro Model: ${runtimeModels.geminiPro}

### ⚙️ Codex
${codexStatus}${codexAccount ? `\n- Account: ${codexAccount}` : ""}
- Auth Method: OpenAI OAuth (via Codex CLI)
- Cost: MODERATE
- Default Model: ${runtimeModels.codex}

### 🔑 OpenAI API Key
${apiKeyStatus}
- Used as fallback if Codex CLI unavailable

---
**Authentication Methods**:
- Gemini: \`gemini\` (Google OAuth)
- Codex: \`codex login\` (OpenAI OAuth)
- Models: \`configure_models\` tool or env vars (\`OLYMPUS_*_MODEL\`)
- API Key: \`configure_openai\` tool (fallback)`,
          }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `❌ Unknown tool: ${name}` }],
        };
    }
  } catch (error) {
    await log(`Error in ${name}: ${error.message}`);
    return {
      content: [{ type: "text", text: `❌ Error: ${error.message}` }],
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await log("AI Agents MCP Server v2.0 started");
}

main().catch(console.error);

#!/usr/bin/env node
import { randomBytes } from 'crypto';
import lockfile from 'proper-lockfile';
import { mkdir, open } from 'fs/promises';
import { basename, resolve, dirname } from 'path';
import { existsSync, statSync, readdirSync, unlinkSync } from 'fs';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
function generateId() {
  return randomBytes(8).toString("hex");
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
async function readStdin() {
  const chunks = [];
  return new Promise((resolve3, reject) => {
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve3(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}
function writeOutput(output) {
  console.log(JSON.stringify(output));
  process.exit(0);
}
function debug(message) {
  if (process.env.MEMVID_MIND_DEBUG === "1") {
    console.error(`[memvid-mind] ${message}`);
  }
}
var init_helpers = __esm({
  "src/utils/helpers.ts"() {
  }
});

// src/types.ts
var DEFAULT_CONFIG;
var init_types = __esm({
  "src/types.ts"() {
    DEFAULT_CONFIG = {
      memoryPath: ".claude/mind.mv2",
      maxContextObservations: 20,
      maxContextTokens: 2e3,
      autoCompress: true,
      minConfidence: 0.6,
      debug: false
    };
  }
});
async function withMemvidLock(lockPath, fn) {
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, "a");
  await handle.close();
  const release = await lockfile.lock(lockPath, LOCK_OPTIONS);
  try {
    return await fn();
  } finally {
    await release();
  }
}
var LOCK_OPTIONS;
var init_memvid_lock = __esm({
  "src/utils/memvid-lock.ts"() {
    LOCK_OPTIONS = {
      stale: 3e4,
      retries: {
        retries: 1e3,
        minTimeout: 5,
        maxTimeout: 50
      }
    };
  }
});

// src/core/mind.ts
var mind_exports = {};
__export(mind_exports, {
  Mind: () => Mind,
  getMind: () => getMind,
  resetMind: () => resetMind
});
function pruneBackups(memoryPath, keepCount) {
  try {
    const dir = dirname(memoryPath);
    const baseName = memoryPath.split("/").pop() || "mind.mv2";
    const backupPattern = new RegExp(`^${baseName.replace(".", "\\.")}\\.backup-\\d+$`);
    const files = readdirSync(dir);
    const backups = files.filter((f) => backupPattern.test(f)).map((f) => ({
      name: f,
      path: resolve(dir, f),
      time: parseInt(f.split("-").pop() || "0", 10)
    })).sort((a, b) => b.time - a.time);
    for (let i = keepCount; i < backups.length; i++) {
      try {
        unlinkSync(backups[i].path);
        console.error(`[memvid-mind] Pruned old backup: ${backups[i].name}`);
      } catch {
      }
    }
  } catch {
  }
}
async function loadSDK() {
  if (sdkLoaded) return;
  const sdk = await import('@memvid/sdk');
  use = sdk.use;
  create = sdk.create;
  sdkLoaded = true;
}
async function getMind(config) {
  if (!mindInstance) {
    mindInstance = await Mind.open(config);
  }
  return mindInstance;
}
function resetMind() {
  mindInstance = null;
}
var sdkLoaded, use, create, Mind, mindInstance;
var init_mind = __esm({
  "src/core/mind.ts"() {
    init_types();
    init_helpers();
    init_memvid_lock();
    sdkLoaded = false;
    Mind = class _Mind {
      memvid;
      config;
      sessionId;
      initialized = false;
      constructor(memvid, config) {
        this.memvid = memvid;
        this.config = config;
        this.sessionId = generateId();
      }
      /**
       * Open or create a Mind instance
       */
      static async open(configOverrides = {}) {
        await loadSDK();
        const config = { ...DEFAULT_CONFIG, ...configOverrides };
        const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        const memoryPath = resolve(projectDir, config.memoryPath);
        const memoryDir = dirname(memoryPath);
        await mkdir(memoryDir, { recursive: true });
        let memvid;
        const MAX_FILE_SIZE_MB = 100;
        const lockPath = `${memoryPath}.lock`;
        await withMemvidLock(lockPath, async () => {
          if (!existsSync(memoryPath)) {
            memvid = await create(memoryPath, "basic");
            return;
          }
          const { statSync: statSync2, renameSync, unlinkSync: unlinkSync2 } = await import('fs');
          const fileSize = statSync2(memoryPath).size;
          const fileSizeMB = fileSize / (1024 * 1024);
          if (fileSizeMB > MAX_FILE_SIZE_MB) {
            console.error(`[memvid-mind] Memory file too large (${fileSizeMB.toFixed(1)}MB), likely corrupted. Creating fresh memory...`);
            const backupPath = `${memoryPath}.backup-${Date.now()}`;
            try {
              renameSync(memoryPath, backupPath);
            } catch {
            }
            memvid = await create(memoryPath, "basic");
            return;
          }
          try {
            memvid = await use("basic", memoryPath);
          } catch (openError) {
            const errorMessage = openError instanceof Error ? openError.message : String(openError);
            if (errorMessage.includes("Deserialization") || errorMessage.includes("UnexpectedVariant") || errorMessage.includes("Invalid") || errorMessage.includes("corrupt") || errorMessage.includes("validation failed") || errorMessage.includes("unable to recover") || errorMessage.includes("table of contents")) {
              console.error("[memvid-mind] Memory file corrupted, creating fresh memory...");
              const backupPath = `${memoryPath}.backup-${Date.now()}`;
              try {
                renameSync(memoryPath, backupPath);
              } catch {
                try {
                  unlinkSync2(memoryPath);
                } catch {
                }
              }
              memvid = await create(memoryPath, "basic");
              return;
            }
            throw openError;
          }
        });
        const mind = new _Mind(memvid, config);
        mind.initialized = true;
        pruneBackups(memoryPath, 3);
        if (config.debug) {
          console.error(`[memvid-mind] Opened: ${memoryPath}`);
        }
        return mind;
      }
      async withLock(fn) {
        const memoryPath = this.getMemoryPath();
        const lockPath = `${memoryPath}.lock`;
        return withMemvidLock(lockPath, fn);
      }
      /**
       * Remember an observation
       */
      async remember(input) {
        const observation = {
          id: generateId(),
          timestamp: Date.now(),
          type: input.type,
          tool: input.tool,
          summary: input.summary,
          content: input.content,
          metadata: {
            ...input.metadata,
            sessionId: this.sessionId
          }
        };
        const frameId = await this.withLock(async () => {
          return this.memvid.put({
            title: `[${observation.type}] ${observation.summary}`,
            label: observation.type,
            text: observation.content,
            metadata: {
              observationId: observation.id,
              timestamp: observation.timestamp,
              tool: observation.tool,
              sessionId: this.sessionId,
              ...observation.metadata
            },
            tags: [observation.type, observation.tool].filter(Boolean)
          });
        });
        if (this.config.debug) {
          console.error(`[memvid-mind] Remembered: ${observation.summary}`);
        }
        return frameId;
      }
      /**
       * Search memories by query (uses fast lexical search)
       */
      async search(query, limit = 10) {
        return this.withLock(async () => {
          return this.searchUnlocked(query, limit);
        });
      }
      async searchUnlocked(query, limit) {
        const results = await this.memvid.find(query, { k: limit, mode: "lex" });
        return (results.frames || []).map((frame) => ({
          observation: {
            id: frame.metadata?.observationId || frame.frame_id,
            timestamp: frame.metadata?.timestamp || 0,
            type: frame.label,
            tool: frame.metadata?.tool,
            summary: frame.title?.replace(/^\[.*?\]\s*/, "") || "",
            content: frame.text || "",
            metadata: frame.metadata
          },
          score: frame.score || 0,
          snippet: frame.snippet || frame.text?.slice(0, 200) || ""
        }));
      }
      /**
       * Ask the memory a question (uses fast lexical search)
       */
      async ask(question) {
        return this.withLock(async () => {
          const result = await this.memvid.ask(question, { k: 5, mode: "lex" });
          return result.answer || "No relevant memories found.";
        });
      }
      /**
       * Get context for session start
       */
      async getContext(query) {
        return this.withLock(async () => {
          const timeline = await this.memvid.timeline({
            limit: this.config.maxContextObservations,
            reverse: true
          });
          const frames = Array.isArray(timeline) ? timeline : timeline.frames || [];
          const recentObservations = frames.map(
            (frame) => {
              let ts = frame.metadata?.timestamp || frame.timestamp || 0;
              if (ts > 0 && ts < 4102444800) {
                ts = ts * 1e3;
              }
              return {
                id: frame.metadata?.observationId || frame.frame_id,
                timestamp: ts,
                type: frame.label || frame.metadata?.type || "observation",
                tool: frame.metadata?.tool,
                summary: frame.title?.replace(/^\[.*?\]\s*/, "") || frame.preview?.slice(0, 100) || "",
                content: frame.text || frame.preview || "",
                metadata: frame.metadata
              };
            }
          );
          let relevantMemories = [];
          if (query) {
            const searchResults = await this.searchUnlocked(query, 10);
            relevantMemories = searchResults.map((r) => r.observation);
          }
          let tokenCount = 0;
          for (const obs of recentObservations) {
            const text = `[${obs.type}] ${obs.summary}`;
            const tokens = estimateTokens(text);
            if (tokenCount + tokens > this.config.maxContextTokens) break;
            tokenCount += tokens;
          }
          return {
            recentObservations,
            relevantMemories,
            sessionSummaries: [],
            // TODO: Implement session summaries
            tokenCount
          };
        });
      }
      /**
       * Save a session summary
       */
      async saveSessionSummary(summary) {
        const sessionSummary = {
          id: this.sessionId,
          startTime: Date.now() - 36e5,
          // Approximate
          endTime: Date.now(),
          observationCount: 0,
          // TODO: Track this
          keyDecisions: summary.keyDecisions,
          filesModified: summary.filesModified,
          summary: summary.summary
        };
        return this.withLock(async () => {
          return this.memvid.put({
            title: `Session Summary: ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}`,
            label: "session",
            text: JSON.stringify(sessionSummary, null, 2),
            metadata: sessionSummary,
            tags: ["session", "summary"]
          });
        });
      }
      /**
       * Get memory statistics
       */
      async stats() {
        return this.withLock(async () => {
          const stats = await this.memvid.stats();
          const timeline = await this.memvid.timeline({ limit: 1, reverse: false });
          const recentTimeline = await this.memvid.timeline({ limit: 1, reverse: true });
          const oldestFrames = Array.isArray(timeline) ? timeline : timeline.frames || [];
          const newestFrames = Array.isArray(recentTimeline) ? recentTimeline : recentTimeline.frames || [];
          return {
            totalObservations: stats.frame_count || 0,
            totalSessions: 0,
            // TODO: Count unique sessions
            oldestMemory: oldestFrames[0]?.metadata?.timestamp || oldestFrames[0]?.timestamp || 0,
            newestMemory: newestFrames[0]?.metadata?.timestamp || newestFrames[0]?.timestamp || 0,
            fileSize: stats.size_bytes || 0,
            topTypes: {}
            // TODO: Aggregate
          };
        });
      }
      /**
       * Get the session ID
       */
      getSessionId() {
        return this.sessionId;
      }
      /**
       * Get the memory file path
       */
      getMemoryPath() {
        return resolve(process.cwd(), this.config.memoryPath);
      }
      /**
       * Check if initialized
       */
      isInitialized() {
        return this.initialized;
      }
    };
    mindInstance = null;
  }
});

// src/hooks/session-start.ts
init_helpers();
async function main() {
  try {
    const input = await readStdin();
    const hookInput = JSON.parse(input);
    debug(`Session starting: ${hookInput.session_id}`);
    const projectDir = hookInput.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const projectName = basename(projectDir);
    const memoryPath = resolve(projectDir, ".claude/mind.mv2");
    const memoryExists = existsSync(memoryPath);
    const contextLines = [];
    if (memoryExists) {
      try {
        const stats = statSync(memoryPath);
        const fileSizeKB = Math.round(stats.size / 1024);
        contextLines.push("<memvid-mind-context>");
        contextLines.push("# \u{1F9E0} Claude Mind Active");
        contextLines.push("");
        contextLines.push(`\u{1F4C1} Project: **${projectName}**`);
        contextLines.push(`\u{1F4BE} Memory: \`.claude/mind.mv2\` (${fileSizeKB} KB)`);
        contextLines.push("");
        contextLines.push("**Commands:**");
        contextLines.push("- `/mind:search <query>` - Search memories");
        contextLines.push("- `/mind:ask <question>` - Ask your memory");
        contextLines.push("- `/mind:recent` - View timeline");
        contextLines.push("- `/mind:stats` - View statistics");
        contextLines.push("");
        contextLines.push("_Memories are captured automatically from your tool use._");
        contextLines.push("");
        contextLines.push("**Recent Context:**");
        try {
          const { getMind: getMind2 } = await Promise.resolve().then(() => (init_mind(), mind_exports));
          const mind = await getMind2();
          const context = await mind.getContext();
          const recentMemories = context.recentObservations.slice(0, 5);
          if (recentMemories.length > 0) {
            const byType = {};
            for (const mem of recentMemories) {
              if (!byType[mem.type]) byType[mem.type] = [];
              byType[mem.type].push(mem.summary);
            }
            if (byType.profile) {
              contextLines.push(`\u{1F464} **Profile:** ${byType.profile.slice(0, 2).join(", ")}`);
            }
            if (byType.semantic) {
              contextLines.push(`\u{1F4DA} **Knowledge:** ${byType.semantic.slice(0, 2).join(", ")}`);
            }
            if (byType.procedural) {
              contextLines.push(`\u2699\uFE0F **How-to:** ${byType.procedural.slice(0, 2).join(", ")}`);
            }
            if (byType.working) {
              contextLines.push(`\u{1F527} **Working:** ${byType.working.slice(0, 2).join(", ")}`);
            }
            if (byType.tool_result) {
              contextLines.push(`\u{1F6E0}\uFE0F **Tools:** ${byType.tool_result.slice(0, 2).join(", ")}`);
            }
          } else {
            contextLines.push("_No recent memories._");
          }
        } catch {
          contextLines.push("_Context loading..._");
        }
        contextLines.push("");
        contextLines.push("</memvid-mind-context>");
      } catch {
      }
    } else {
      contextLines.push("<memvid-mind-context>");
      contextLines.push("# \u{1F9E0} Claude Mind Ready");
      contextLines.push("");
      contextLines.push(`\u{1F4C1} Project: **${projectName}**`);
      contextLines.push("\u{1F4BE} Memory will be created at: `.claude/mind.mv2`");
      contextLines.push("");
      contextLines.push("_Your observations will be automatically captured._");
      contextLines.push("</memvid-mind-context>");
    }
    const output = {
      continue: true
    };
    if (contextLines.length > 0) {
      output.hookSpecificOutput = {
        hookEventName: "SessionStart",
        additionalContext: contextLines.join("\n")
      };
    }
    writeOutput(output);
  } catch (error) {
    debug(`Error: ${error}`);
    writeOutput({ continue: true });
  }
}
main();
//# sourceMappingURL=session-start.js.map
//# sourceMappingURL=session-start.js.map
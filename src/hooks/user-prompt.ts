#!/usr/bin/env node
/**
 * Memvid Mind - User Prompt Submit Hook
 *
 * Captures every user message with memory type classification.
 * Detects user preferences and stores them as profile type.
 */

import { getMind } from "../core/mind.js";
import { readStdin, writeOutput, debug } from "../utils/helpers.js";
import type { HookInput } from "../types.js";
import { MEMORY_TYPES } from "../types/memory.js";

// Patterns to detect user preferences
const PREFERENCE_PATTERNS = [
  /i prefer/i,
  /i like/i,
  /i always/i,
  /i usually/i,
  /my favorite/i,
  /i want/i,
  /use (?:vim|emacs|nano|dark|light) mode/i,
];

function isUserPreference(content: string): boolean {
  return PREFERENCE_PATTERNS.some((pattern) => pattern.test(content));
}

async function main() {
  try {
    const input = await readStdin();
    const hookInput: HookInput = JSON.parse(input);

    const { prompt, cwd, session_id } = hookInput;

    if (!prompt || !prompt.trim()) {
      writeOutput({ continue: true });
      return;
    }

    debug(`UserPromptSubmit: ${prompt.slice(0, 50)}...`);

    const mind = await getMind();

    // Detect if this is a user preference
    const isPreference = isUserPreference(prompt);
    const memoryType = isPreference ? MEMORY_TYPES.PROFILE : MEMORY_TYPES.WORKING;

    // Extract summary (first 100 chars)
    const summary = prompt.slice(0, 100);

    await mind.remember({
      type: memoryType,
      summary: isPreference ? `Preference: ${summary}` : summary,
      content: prompt,
      metadata: {
        cwd,
        session_id,
        timestamp: Date.now(),
        hook: "UserPromptSubmit",
      },
    });

    debug(`Stored user message [${memoryType}]: ${summary}`);

    writeOutput({ continue: true });
  } catch (error) {
    debug(`Error: ${error}`);
    writeOutput({ continue: true });
  }
}

main();

/**
 * Memory Types - Classification system for observations
 *
 * From Memoria memory system - enables Cognee transfer compatibility
 */

export const MEMORY_TYPES = {
  /** User preferences, identity, stable facts */
  PROFILE: "profile",
  /** Knowledge, facts, concepts, decisions */
  SEMANTIC: "semantic",
  /** How-to, workflows, processes */
  PROCEDURAL: "procedural",
  /** Session-specific, temporary context */
  WORKING: "working",
  /** Tool outputs (Read, Edit, Bash results) */
  TOOL_RESULT: "tool_result",
} as const;

export type MemoryType = typeof MEMORY_TYPES[keyof typeof MEMORY_TYPES];

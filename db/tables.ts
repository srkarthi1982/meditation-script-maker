/**
 * Meditation Script Maker - design guided meditation scripts.
 *
 * Design goals:
 * - Scripts with metadata (length, style, focus).
 * - Optional sections (intro, body, outro, etc.) for structured scripts.
 */

import { defineTable, column, NOW } from "astro:db";

export const MeditationScripts = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    title: column.text(),                            // "5-minute morning calm"
    description: column.text({ optional: true }),
    meditationType: column.text({ optional: true }), // "mindfulness", "body-scan", "sleep", etc.
    focusArea: column.text({ optional: true }),      // "stress", "gratitude", "sleep"
    difficulty: column.text({ optional: true }),     // "beginner", "intermediate", "advanced"
    language: column.text({ optional: true }),       // "en", "ta", etc.

    targetDurationMinutes: column.number({ optional: true }),

    fullScript: column.text({ optional: true }),     // single-text version if needed
    notes: column.text({ optional: true }),

    isFavorite: column.boolean({ default: false }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const MeditationScriptSections = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    scriptId: column.text({
      references: () => MeditationScripts.columns.id,
    }),

    orderIndex: column.number(),                     // 1, 2, 3...
    sectionType: column.text({ optional: true }),    // "intro", "breathing", "visualization", "closing"
    title: column.text({ optional: true }),
    body: column.text(),                             // text to be read/spoken
    suggestedDurationMinutes: column.number({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  MeditationScripts,
  MeditationScriptSections,
} as const;

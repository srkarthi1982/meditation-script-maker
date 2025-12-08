import type { ActionAPIContext } from "astro:actions";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import {
  MeditationScripts,
  MeditationScriptSections,
  and,
  db,
  eq,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

async function getOwnedScript(scriptId: string, userId: string) {
  const [script] = await db
    .select()
    .from(MeditationScripts)
    .where(and(eq(MeditationScripts.id, scriptId), eq(MeditationScripts.userId, userId)));

  if (!script) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Meditation script not found.",
    });
  }

  return script;
}

export const server = {
  createMeditationScript: defineAction({
    input: z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      meditationType: z.string().optional(),
      focusArea: z.string().optional(),
      difficulty: z.string().optional(),
      language: z.string().optional(),
      targetDurationMinutes: z.number().int().positive().optional(),
      fullScript: z.string().optional(),
      notes: z.string().optional(),
      isFavorite: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();
      const scriptId = crypto.randomUUID();

      await db.insert(MeditationScripts).values({
        id: scriptId,
        userId: user.id,
        title: input.title,
        description: input.description,
        meditationType: input.meditationType,
        focusArea: input.focusArea,
        difficulty: input.difficulty,
        language: input.language,
        targetDurationMinutes: input.targetDurationMinutes,
        fullScript: input.fullScript,
        notes: input.notes,
        isFavorite: input.isFavorite ?? false,
        createdAt: now,
        updatedAt: now,
      });

      return {
        success: true,
        data: { id: scriptId },
      };
    },
  }),

  updateMeditationScript: defineAction({
    input: z
      .object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        meditationType: z.string().optional(),
        focusArea: z.string().optional(),
        difficulty: z.string().optional(),
        language: z.string().optional(),
        targetDurationMinutes: z.number().int().positive().optional(),
        fullScript: z.string().optional(),
        notes: z.string().optional(),
        isFavorite: z.boolean().optional(),
      })
      .refine(
        (payload) =>
          Object.entries(payload).some(([key, value]) =>
            key === "id" ? false : value !== undefined
          ),
        {
          message: "At least one field must be provided for update.",
        }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedScript(input.id, user.id);

      const updates: Partial<typeof MeditationScripts.$inferInsert> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.meditationType !== undefined) updates.meditationType = input.meditationType;
      if (input.focusArea !== undefined) updates.focusArea = input.focusArea;
      if (input.difficulty !== undefined) updates.difficulty = input.difficulty;
      if (input.language !== undefined) updates.language = input.language;
      if (input.targetDurationMinutes !== undefined)
        updates.targetDurationMinutes = input.targetDurationMinutes;
      if (input.fullScript !== undefined) updates.fullScript = input.fullScript;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.isFavorite !== undefined) updates.isFavorite = input.isFavorite;

      updates.updatedAt = new Date();

      await db
        .update(MeditationScripts)
        .set(updates)
        .where(and(eq(MeditationScripts.id, input.id), eq(MeditationScripts.userId, user.id)));

      return {
        success: true,
        data: { id: input.id },
      };
    },
  }),

  listMeditationScripts: defineAction({
    input: z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      focusArea: z.string().optional(),
      isFavorite: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      let condition = eq(MeditationScripts.userId, user.id);
      if (input.focusArea) {
        condition = and(condition, eq(MeditationScripts.focusArea, input.focusArea));
      }
      if (input.isFavorite !== undefined) {
        condition = and(condition, eq(MeditationScripts.isFavorite, input.isFavorite));
      }

      const scripts = await db.select().from(MeditationScripts).where(condition);
      const total = scripts.length;
      const start = (input.page - 1) * input.pageSize;
      const items = scripts.slice(start, start + input.pageSize);

      return {
        success: true,
        data: {
          items,
          total,
        },
      };
    },
  }),

  getMeditationScriptWithSections: defineAction({
    input: z.object({
      id: z.string(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const script = await getOwnedScript(input.id, user.id);
      const sections = await db
        .select()
        .from(MeditationScriptSections)
        .where(eq(MeditationScriptSections.scriptId, script.id));

      sections.sort((a, b) => a.orderIndex - b.orderIndex);

      return {
        success: true,
        data: {
          script,
          sections,
        },
      };
    },
  }),

  upsertMeditationScriptSection: defineAction({
    input: z.object({
      id: z.string().optional(),
      scriptId: z.string(),
      orderIndex: z.number().int().positive(),
      sectionType: z.string().optional(),
      title: z.string().optional(),
      body: z.string().min(1),
      suggestedDurationMinutes: z.number().int().positive().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const script = await getOwnedScript(input.scriptId, user.id);

      if (input.id) {
        const [existingSection] = await db
          .select()
          .from(MeditationScriptSections)
          .where(eq(MeditationScriptSections.id, input.id));

        if (!existingSection) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Section not found.",
          });
        }

        if (existingSection.scriptId !== script.id) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "You cannot modify sections for another user's script.",
          });
        }

        const updates: Partial<typeof MeditationScriptSections.$inferInsert> = {
          orderIndex: input.orderIndex,
          body: input.body,
        };

        if (input.sectionType !== undefined) updates.sectionType = input.sectionType;
        if (input.title !== undefined) updates.title = input.title;
        if (input.suggestedDurationMinutes !== undefined)
          updates.suggestedDurationMinutes = input.suggestedDurationMinutes;

        await db
          .update(MeditationScriptSections)
          .set(updates)
          .where(eq(MeditationScriptSections.id, input.id));

        return {
          success: true,
          data: { sectionId: input.id },
        };
      }

      const sectionId = crypto.randomUUID();
      await db.insert(MeditationScriptSections).values({
        id: sectionId,
        scriptId: script.id,
        orderIndex: input.orderIndex,
        sectionType: input.sectionType,
        title: input.title,
        body: input.body,
        suggestedDurationMinutes: input.suggestedDurationMinutes,
        createdAt: new Date(),
      });

      return {
        success: true,
        data: { sectionId },
      };
    },
  }),

  deleteMeditationScriptSection: defineAction({
    input: z.object({
      id: z.string(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [section] = await db
        .select()
        .from(MeditationScriptSections)
        .where(eq(MeditationScriptSections.id, input.id));

      if (!section) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Section not found.",
        });
      }

      await getOwnedScript(section.scriptId, user.id);

      await db
        .delete(MeditationScriptSections)
        .where(eq(MeditationScriptSections.id, input.id));

      return {
        success: true,
        data: { id: input.id },
      };
    },
  }),
};

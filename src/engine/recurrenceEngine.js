/* ═══════════════════════════════════════════════
   Recurrence Engine (V2)
   Completion-spawn only, no stacking
   ═══════════════════════════════════════════════ */

import { createQuest, generateId, createObjective, STATUS, EVENT, normalizeRecurrenceRule, normalizeDueDate, normalizeTimestamp } from '../schema.js';
import { emitEvent } from './eventBus.js';
import db from '../db.js';

/**
 * Calculate next due date based on recurring rule
 */
function calculateNextDueDate(completedDate, rule) {
    const base = new Date(completedDate);
    const next = new Date(base);

    const normalizedRule = typeof rule === 'string' ? { type: rule } : rule;
    if (!normalizedRule || !normalizedRule.type) return base.toISOString();

    switch (normalizedRule.type) {
        case 'daily':
            next.setDate(next.getDate() + (normalizedRule.interval || 1));
            break;

        case 'weekly': {
            const interval = normalizedRule.interval || 1;
            if (normalizedRule.daysOfWeek && normalizedRule.daysOfWeek.length > 0) {
                let found = false;
                for (let i = 1; i <= 7 * interval; i++) {
                    const candidate = new Date(base);
                    candidate.setDate(candidate.getDate() + i);
                    if (normalizedRule.daysOfWeek.includes(candidate.getDay())) {
                        next.setTime(candidate.getTime());
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    next.setDate(next.getDate() + 7 * interval);
                }
            } else {
                next.setDate(next.getDate() + 7 * interval);
            }
            break;
        }

        case 'monthly': {
            const interval = normalizedRule.interval || 1;
            next.setMonth(next.getMonth() + interval);
            if (normalizedRule.dayOfMonth) {
                const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(normalizedRule.dayOfMonth, maxDay));
            }
            break;
        }
    }

    return normalizeDueDate(next);
}

/**
 * Normalize all recurrence rules in the database (migration helper)
 */
export async function normalizeAllRecurrenceRules() {
    const quests = await db.quests.toArray();
    const toUpdate = quests.filter(q => {
        const normalized = normalizeRecurrenceRule(q.recurringRule);
        return JSON.stringify(q.recurringRule) !== JSON.stringify(normalized);
    });

    if (toUpdate.length === 0) return;

    await db.quests.bulkPut(toUpdate.map(q => ({
        ...q,
        recurringRule: normalizeRecurrenceRule(q.recurringRule)
    })));
}

/**
 * Spawn next instance of a recurring quest after completion
 */
export async function spawnNextInstance(quest) {
    if (!quest.recurringRule) return null;
    if (quest.status !== STATUS.COMPLETED) return null;

    // Check for existing active instance to prevent stacking
    const existing = await db.quests
        .where('status')
        .equals(STATUS.ACTIVE)
        .filter(q => q.title === quest.title && q.recurringRule != null)
        .first();

    if (existing) return null;

    const now = normalizeTimestamp(new Date());
    const nextDue = calculateNextDueDate(now, quest.recurringRule);

    // Deep clone structure ONLY — force-reset ALL completion state
    const newQuest = createQuest({
        title: quest.title,
        description: quest.description,
        category: quest.category,
        tags: [...quest.tags],
        difficultyTier: quest.difficultyTier || quest.difficulty,
        difficultyLabel: quest.difficultyLabel,
        difficultyMultiplier: quest.difficultyMultiplier,
        xpBase: quest.xpBase,
        xpPerObjective: quest.xpPerObjective,
        objectives: quest.objectives.map(o => createObjective(o.text)),
        dueDate: nextDue,
        overdueThresholdDays: quest.overdueThresholdDays,
        overdueEscalationDays: quest.overdueEscalationDays,
        recurringRule: normalizeRecurrenceRule(quest.recurringRule),
        template: quest.template,
        // Explicit state resets
        status: STATUS.ACTIVE,
        completedAt: null,
        createdAt: now,
        lastProgressAt: now,
        _recurrenceProcessed: false
    });

    await db.quests.add(newQuest);

    // Emit recurrence event
    await emitEvent(EVENT.RECURRENCE_SPAWNED, newQuest.id, {
        parentQuestId: quest.id,
        nextDueDate: nextDue
    });

    return newQuest;
}

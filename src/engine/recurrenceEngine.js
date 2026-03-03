/* ═══════════════════════════════════════════════
   Recurrence Engine
   Completion-spawn only, no stacking
   ═══════════════════════════════════════════════ */

import { createQuest, generateId, createObjective, STATUS } from '../schema.js';
import db from '../db.js';

/**
 * Calculate next due date based on recurring rule
 */
function calculateNextDueDate(completedDate, rule) {
    const base = new Date(completedDate);
    const next = new Date(base);

    switch (rule.type) {
        case 'daily':
            next.setDate(next.getDate() + (rule.interval || 1));
            break;

        case 'weekly': {
            const interval = rule.interval || 1;
            if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
                // Find next matching day of week
                let found = false;
                for (let i = 1; i <= 7 * interval; i++) {
                    const candidate = new Date(base);
                    candidate.setDate(candidate.getDate() + i);
                    if (rule.daysOfWeek.includes(candidate.getDay())) {
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
            const interval = rule.interval || 1;
            next.setMonth(next.getMonth() + interval);
            if (rule.dayOfMonth) {
                const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(rule.dayOfMonth, maxDay));
            }
            break;
        }
    }

    return next.toISOString();
}

/**
 * Spawn next instance of a recurring quest after completion
 */
export async function spawnNextInstance(quest) {
    if (!quest.recurringRule) return null;

    // Guard: only spawn from a completed quest
    if (quest.status !== STATUS.COMPLETED) return null;

    // Check for existing active instance to prevent stacking
    const existing = await db.quests
        .where('status')
        .equals(STATUS.ACTIVE)
        .filter(q => q.title === quest.title && q.recurringRule != null)
        .first();

    if (existing) return null; // No stacking

    const now = new Date().toISOString();
    const nextDue = calculateNextDueDate(now, quest.recurringRule);

    // Deep clone structure ONLY — force-reset ALL completion state
    const newQuest = createQuest({
        title: quest.title,
        description: quest.description,
        category: quest.category,
        tags: [...quest.tags],
        difficulty: quest.difficulty,
        xpBase: quest.xpBase,
        xpPerObjective: quest.xpPerObjective,
        // Fresh objectives — every one reset to incomplete
        objectives: quest.objectives.map(o => createObjective(o.text)),
        dueDate: nextDue,
        overdueThresholdDays: quest.overdueThresholdDays,
        recurringRule: { ...quest.recurringRule },
        // Explicit state resets — prevent any leakage
        status: STATUS.ACTIVE,
        completedAt: null,
        createdAt: now,
        lastProgressAt: now,
        _recurrenceProcessed: false
    });

    await db.quests.add(newQuest);
    return newQuest;
}

/* ═══════════════════════════════════════════════
   Quest Engine — State Machine & Core Logic
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { STATUS, DORMANCY_THRESHOLD_DAYS, DEFAULT_OVERDUE_THRESHOLD_DAYS, createLegendEntry } from '../schema.js';
import { calculateXP } from './xpEngine.js';
import { applyMomentum } from './momentumEngine.js';
import { spawnNextInstance } from './recurrenceEngine.js';

/**
 * Toggle an objective on a quest
 * Returns updated quest
 */
export async function toggleObjective(questId, objectiveId) {
    const quest = await db.quests.get(questId);
    if (!quest || quest.status === STATUS.COMPLETED || quest.status === STATUS.RETIRED) return null;

    const obj = quest.objectives.find(o => o.id === objectiveId);
    if (!obj) return null;

    obj.completed = !obj.completed;
    quest.lastProgressAt = new Date().toISOString();

    // If quest was dormant, reactivate on progress
    if (quest.status === STATUS.DORMANT) {
        quest.status = STATUS.ACTIVE;
    }

    await db.quests.put(quest);

    // Check if all objectives are now complete
    const allComplete = quest.objectives.length > 0 && quest.objectives.every(o => o.completed);
    if (allComplete) {
        return await completeQuest(questId);
    }

    return { quest, completed: false, xpEarned: 0 };
}

/**
 * Complete a quest — all objectives must be done
 * Returns { quest, xpEarned, momentumBonusApplied, legendEntry }
 */
export async function completeQuest(questId) {
    const quest = await db.quests.get(questId);
    if (!quest) return null;

    // Guard: prevent double-completion (XP protection)
    if (quest.status === STATUS.COMPLETED || quest.completedAt) {
        return null;
    }

    // Guard: prevent recurrence cascade re-trigger
    if (quest._recurrenceProcessed) {
        return null;
    }

    // Verify all objectives complete
    if (quest.objectives.length > 0 && !quest.objectives.every(o => o.completed)) {
        return null; // Can't complete with incomplete objectives
    }

    // Check momentum (difficulty >= 2 qualifies)
    let momentumBonus = 0;
    let momentumBonusApplied = false;
    if (quest.difficulty >= 2) {
        momentumBonus = await applyMomentum();
        momentumBonusApplied = momentumBonus > 0;
    }

    // Calculate XP
    const xpEarned = calculateXP(quest, momentumBonus);

    // Update quest — mark completed and flag recurrence as processed
    quest.status = STATUS.COMPLETED;
    quest.completedAt = new Date().toISOString();
    quest._recurrenceProcessed = false; // will be set true after spawn
    await db.quests.put(quest);

    // Guard: prevent duplicate legendLog entries for same quest
    const existingLog = await db.legendLog
        .filter(e => e.questId === questId)
        .first();
    let legendEntry;
    if (!existingLog) {
        legendEntry = createLegendEntry(quest, xpEarned, momentumBonusApplied);
        await db.legendLog.add(legendEntry);
    } else {
        legendEntry = existingLog;
    }

    // Handle recurrence — runs ONLY here inside the completion handler
    let spawnedQuest = null;
    if (quest.recurringRule && !quest._recurrenceProcessed) {
        spawnedQuest = await spawnNextInstance(quest);
        // Mark recurrence as processed to prevent re-trigger
        quest._recurrenceProcessed = true;
        await db.quests.put(quest);
    }

    return { quest, xpEarned, momentumBonusApplied, legendEntry, spawnedQuest, completed: true };
}

/**
 * Check for overdue quests
 */
export async function checkOverdue() {
    const now = new Date();
    const activeQuests = await db.quests
        .where('status')
        .equals(STATUS.ACTIVE)
        .toArray();

    const updated = [];
    for (const quest of activeQuests) {
        if (quest.dueDate) {
            // Apply overdue threshold guard: default 3 days if null/undefined
            const thresholdDays = quest.overdueThresholdDays ?? DEFAULT_OVERDUE_THRESHOLD_DAYS;
            const dueDate = new Date(quest.dueDate);
            dueDate.setDate(dueDate.getDate() + thresholdDays);
            if (now > dueDate) {
                quest.status = STATUS.OVERDUE;
                await db.quests.put(quest);
                updated.push(quest);
            }
        }
    }
    return updated;
}

/**
 * Check for dormant Learning quests (no progress in 7 days)
 */
export async function checkDormancy() {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - DORMANCY_THRESHOLD_DAYS);
    const thresholdISO = threshold.toISOString();

    const activeQuests = await db.quests
        .where('status')
        .equals(STATUS.ACTIVE)
        .toArray();

    const updated = [];
    for (const quest of activeQuests) {
        if (
            quest.category && quest.category.toLowerCase() === 'learning' &&
            quest.lastProgressAt && quest.lastProgressAt < thresholdISO
        ) {
            quest.status = STATUS.DORMANT;
            await db.quests.put(quest);
            updated.push(quest);
        }
    }
    return updated;
}

/**
 * Count overdue quests per category
 */
export async function getOverdueByCategory() {
    const overdueQuests = await db.quests
        .where('status')
        .equals(STATUS.OVERDUE)
        .toArray();

    const counts = {};
    for (const q of overdueQuests) {
        counts[q.category] = (counts[q.category] || 0) + 1;
    }
    return counts;
}

/**
 * Reactivate a dormant quest
 */
export async function reactivateQuest(questId) {
    const quest = await db.quests.get(questId);
    if (!quest || quest.status !== STATUS.DORMANT) return null;
    quest.status = STATUS.ACTIVE;
    quest.lastProgressAt = new Date().toISOString();
    await db.quests.put(quest);
    return quest;
}

/**
 * Retire a quest
 */
export async function retireQuest(questId) {
    const quest = await db.quests.get(questId);
    if (!quest) return null;
    quest.status = STATUS.RETIRED;
    await db.quests.put(quest);
    return quest;
}

/**
 * Get all quests grouped by status
 */
export async function getQuestsByStatus() {
    const all = await db.quests.toArray();
    return {
        active: all.filter(q => q.status === STATUS.ACTIVE).sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
        }),
        overdue: all.filter(q => q.status === STATUS.OVERDUE).sort((a, b) => {
            if (!a.dueDate || !b.dueDate) return 0;
            return a.dueDate.localeCompare(b.dueDate);
        }),
        completed: all.filter(q => q.status === STATUS.COMPLETED).sort((a, b) => {
            return (b.completedAt || '').localeCompare(a.completedAt || '');
        }),
        dormant: all.filter(q => q.status === STATUS.DORMANT),
        retired: all.filter(q => q.status === STATUS.RETIRED)
    };
}

/**
 * Delete a quest
 */
export async function deleteQuest(questId) {
    await db.quests.delete(questId);
}

/**
 * Save/update a quest
 */
export async function saveQuest(quest) {
    await db.quests.put(quest);
    return quest;
}

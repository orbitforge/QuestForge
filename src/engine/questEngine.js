/* ═══════════════════════════════════════════════
   Quest Engine — State Machine & Core Logic (V2)
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import {
    STATUS, URGENCY, SNOOZE_TYPE,
    DORMANCY_THRESHOLD_DAYS, DEFAULT_OVERDUE_THRESHOLD_DAYS, DEFAULT_ESCALATION_DAYS,
    EVENT, createLegendEntry, normalizeDueDate, normalizeTimestamp
} from '../schema.js';
import { calculateXP } from './xpEngine.js';
import { applyMomentum } from './momentumEngine.js';
import { spawnNextInstance } from './recurrenceEngine.js';
import { emitEvent } from './eventBus.js';

// ── Objective Toggle ────────────────────────────
export async function toggleObjective(questId, objectiveId) {
    const quest = await db.quests.get(questId);
    if (!quest || quest.status === STATUS.COMPLETED || quest.status === STATUS.RETIRED) return null;

    const obj = quest.objectives.find(o => o.id === objectiveId);
    if (!obj) return null;

    obj.completed = !obj.completed;
    quest.lastProgressAt = new Date().toISOString();

    // Reactivate dormant or snoozed quests on progress
    if (quest.status === STATUS.DORMANT || quest.status === STATUS.SNOOZED) {
        quest.status = STATUS.ACTIVE;
        quest.snoozedUntil = null;
        quest.snoozeType = null;
    }

    await db.quests.put(quest);
    await emitEvent(EVENT.OBJECTIVE_TOGGLED, questId, {
        objectiveId,
        completed: obj.completed,
        questStatus: quest.status,
        objectives: quest.objectives.map(o => ({ id: o.id, text: o.text, completed: !!o.completed }))
    });

    // Check if all objectives are now complete
    const allComplete = quest.objectives.length > 0 && quest.objectives.every(o => o.completed);
    if (allComplete) {
        return await completeQuest(questId);
    }

    return { quest, completed: false, xpEarned: 0 };
}

// ── Complete Quest ──────────────────────────────
export async function completeQuest(questId) {
    const quest = await db.quests.get(questId);
    if (!quest) return null;

    // Guard: prevent double-completion
    if (quest.status === STATUS.COMPLETED || quest.completedAt) return null;
    if (quest._recurrenceProcessed) return null;

    // Verify all objectives complete
    if (quest.objectives.length > 0 && !quest.objectives.every(o => o.completed)) return null;

    // Check momentum (difficulty >= 2 qualifies)
    let momentumBonus = 0;
    let momentumBonusApplied = false;
    const tier = quest.difficultyTier !== undefined ? quest.difficultyTier : (quest.difficulty || 2);
    if (tier >= 2) {
        momentumBonus = await applyMomentum(questId);
        momentumBonusApplied = momentumBonus > 0;
    }

    // Calculate XP (V2: includes overdue redemption bonus)
    const xpEarned = calculateXP(quest, momentumBonus);

    // Update quest
    quest.status = STATUS.COMPLETED;
    quest.completedAt = new Date().toISOString();
    quest.snoozedUntil = null;
    quest.snoozeType = null;
    quest._recurrenceProcessed = false;
    await db.quests.put(quest);

    // Guard: prevent duplicate legendLog entries
    const existingLog = await db.legendLog.filter(e => e.questId === questId).first();
    let legendEntry;
    if (!existingLog) {
        legendEntry = createLegendEntry(quest, xpEarned, momentumBonusApplied);
        await db.legendLog.add(legendEntry);
    } else {
        legendEntry = existingLog;
    }

    // Emit events
    await emitEvent(EVENT.QUEST_COMPLETED, questId, {
        xpEarned,
        momentumBonusApplied,
        questStatus: quest.status,
        objectives: quest.objectives.map(o => ({ id: o.id, text: o.text, completed: !!o.completed }))
    });
    await emitEvent(EVENT.XP_AWARDED, questId, { xp: xpEarned });

    // Handle recurrence
    let spawnedQuest = null;
    if (quest.recurringRule && !quest._recurrenceProcessed) {
        spawnedQuest = await spawnNextInstance(quest);
        quest._recurrenceProcessed = true;
        await db.quests.put(quest);
    }

    return { quest, xpEarned, momentumBonusApplied, legendEntry, spawnedQuest, completed: true };
}

// ── Overdue Check (V2: urgency escalation) ──────
export async function checkOverdue() {
    const now = new Date();
    const activeQuests = await db.quests
        .where('status')
        .anyOf([STATUS.ACTIVE, STATUS.OVERDUE])
        .toArray();

    const updated = [];
    for (const quest of activeQuests) {
        if (!quest.dueDate) continue;

        // Skip hard-snoozed quests
        if (quest.snoozeType === SNOOZE_TYPE.HARD && quest.snoozedUntil) {
            const snoozeEnd = new Date(quest.snoozedUntil);
            if (now < snoozeEnd) continue;
        }

        const thresholdDays = quest.overdueThresholdDays ?? DEFAULT_OVERDUE_THRESHOLD_DAYS;

        // Parse dueDate as YYYY-MM-DD and set to end of day (23:59:59.999) 
        // to ensure they have the full day to complete it.
        const [y, m, d] = quest.dueDate.split('-').map(Number);
        const dueDateObj = new Date(y, m - 1, d, 23, 59, 59, 999);

        const overdueDate = new Date(dueDateObj);
        overdueDate.setDate(overdueDate.getDate() + thresholdDays);

        if (now > overdueDate) {
            // Calculate urgency escalation
            const daysPastDue = Math.floor((now - dueDateObj) / (1000 * 60 * 60 * 24));
            const escalationDays = quest.overdueEscalationDays ?? DEFAULT_ESCALATION_DAYS;
            let newUrgency = URGENCY.LOW;

            if (daysPastDue >= escalationDays * 2) {
                newUrgency = URGENCY.CRITICAL;
            } else if (daysPastDue >= escalationDays) {
                newUrgency = URGENCY.MODERATE;
            } else {
                newUrgency = URGENCY.LOW;
            }

            const statusChanged = quest.status !== STATUS.OVERDUE;
            const urgencyChanged = quest.urgencyLevel !== newUrgency;

            quest.status = STATUS.OVERDUE;
            quest.urgencyLevel = newUrgency;
            await db.quests.put(quest);

            if (statusChanged) {
                await emitEvent(EVENT.QUEST_OVERDUE, quest.id, { urgencyLevel: newUrgency });
            }
            if (statusChanged || urgencyChanged) {
                updated.push(quest);
            }
        }
    }
    return updated;
}

// ── Dormancy Check ──────────────────────────────
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
            await emitEvent(EVENT.QUEST_DORMANT, quest.id, {});
            updated.push(quest);
        }
    }
    return updated;
}

// ── Snooze ──────────────────────────────────────
export async function snoozeQuest(questId, until, type = SNOOZE_TYPE.SOFT) {
    const quest = await db.quests.get(questId);
    if (!quest || quest.status === STATUS.COMPLETED || quest.status === STATUS.RETIRED) return null;

    quest.status = STATUS.SNOOZED;
    quest.snoozedUntil = until;
    quest.snoozeType = type;
    await db.quests.put(quest);
    await emitEvent(EVENT.QUEST_SNOOZED, questId, { until, type });
    return quest;
}

export async function unsnoozeQuest(questId) {
    const quest = await db.quests.get(questId);
    if (!quest || quest.status !== STATUS.SNOOZED) return null;

    quest.status = STATUS.ACTIVE;
    quest.snoozedUntil = null;
    quest.snoozeType = null;
    quest.lastProgressAt = new Date().toISOString();
    await db.quests.put(quest);
    await emitEvent(EVENT.QUEST_UNSNOOZED, questId, {});
    return quest;
}

export async function checkSnoozeExpiry() {
    const now = new Date().toISOString();
    const snoozedQuests = await db.quests
        .where('status')
        .equals(STATUS.SNOOZED)
        .toArray();

    const updated = [];
    for (const quest of snoozedQuests) {
        if (quest.snoozedUntil && quest.snoozedUntil <= now) {
            quest.status = STATUS.ACTIVE;
            quest.snoozedUntil = null;
            quest.snoozeType = null;
            quest.lastProgressAt = new Date().toISOString();
            await db.quests.put(quest);
            await emitEvent(EVENT.QUEST_UNSNOOZED, quest.id, { auto: true });
            updated.push(quest);
        }
    }
    return updated;
}

// ── Overdue By Category ─────────────────────────
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

// ── Reactivate ──────────────────────────────────
export async function reactivateQuest(questId) {
    const quest = await db.quests.get(questId);
    if (!quest || (quest.status !== STATUS.DORMANT && quest.status !== STATUS.SNOOZED)) return null;
    quest.status = STATUS.ACTIVE;
    quest.snoozedUntil = null;
    quest.snoozeType = null;
    quest.lastProgressAt = new Date().toISOString();
    await db.quests.put(quest);
    await emitEvent(EVENT.QUEST_REACTIVATED, questId, {});
    return quest;
}

// ── Retire ──────────────────────────────────────
export async function retireQuest(questId) {
    const quest = await db.quests.get(questId);
    if (!quest) return null;
    quest.status = STATUS.RETIRED;
    await db.quests.put(quest);
    await emitEvent(EVENT.QUEST_RETIRED, questId, {});
    return quest;
}

// ── Query ───────────────────────────────────────
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
            // Sort by urgency (critical first), then by date
            const urgencyOrder = { critical: 0, moderate: 1, low: 2 };
            const ua = urgencyOrder[a.urgencyLevel] ?? 2;
            const ub = urgencyOrder[b.urgencyLevel] ?? 2;
            if (ua !== ub) return ua - ub;
            if (!a.dueDate || !b.dueDate) return 0;
            return a.dueDate.localeCompare(b.dueDate);
        }),
        completed: all.filter(q => q.status === STATUS.COMPLETED).sort((a, b) => {
            return (b.completedAt || '').localeCompare(a.completedAt || '');
        }),
        dormant: all.filter(q => q.status === STATUS.DORMANT),
        retired: all.filter(q => q.status === STATUS.RETIRED),
        snoozed: all.filter(q => q.status === STATUS.SNOOZED).sort((a, b) => {
            return (a.snoozedUntil || '').localeCompare(b.snoozedUntil || '');
        })
    };
}

// ── Delete ──────────────────────────────────────
export async function deleteQuest(questId) {
    await db.quests.delete(questId);
    await emitEvent(EVENT.QUEST_DELETED, questId, {});
}

// ── Migration ───────────────────────────────────
export async function normalizeAllDates() {
    const quests = await db.quests.toArray();
    const toUpdate = quests.filter(q => {
        const normalized = normalizeDueDate(q.dueDate);
        return q.dueDate !== normalized;
    });

    if (toUpdate.length === 0) return;

    await db.quests.bulkPut(toUpdate.map(q => ({
        ...q,
        dueDate: normalizeDueDate(q.dueDate)
    })));
}

// ── Save ────────────────────────────────────────
export async function saveQuest(quest, isNew = false) {
    quest.dueDate = normalizeDueDate(quest.dueDate);
    quest.lastProgressAt = normalizeTimestamp(quest.lastProgressAt);
    await db.quests.put(quest);
    await emitEvent(isNew ? EVENT.QUEST_CREATED : EVENT.QUEST_UPDATED, quest.id, {
        title: quest.title,
        status: quest.status,
        objectives: (quest.objectives || []).map(o => ({ id: o.id, text: o.text, completed: !!o.completed }))
    });
    return quest;
}

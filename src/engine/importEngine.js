import db from '../db.js';
import { EVENT } from '../schema.js';
import { emitEvent } from './eventBus.js';

/**
 * Safely merges an imported quest definition into an existing quest.
 * Preserves existing progress, status, and metadata unless explicitly overwritten.
 */
export function mergeQuestDefinition(existing, imported) {
    // Preserve status and progress fields
    const status = existing.status;
    // We only preserve completion state if it was already completed or if all objectives match up.
    // For simplicity and safety, we carry over completedAt, timestamps, and snoozes natively.
    const completedAt = existing.completedAt;
    const snoozedUntil = existing.snoozedUntil;
    const snoozeType = existing.snoozeType;
    const lastProgressAt = existing.lastProgressAt;
    const urgencyLevel = existing.urgencyLevel;
    const createdAt = existing.createdAt;

    // Merge objectives carefully by ID to preserve checked status
    const existingObjs = new Map(existing.objectives.map(o => [o.id, o]));
    const mergedObjectives = imported.objectives.map(impObj => {
        const extMatch = existingObjs.get(impObj.id);
        if (extMatch) {
            return {
                ...impObj,
                completed: extMatch.completed // Preserve existing checked state
            };
        }
        return {
            ...impObj,
            completed: false // New objectives are unchecked by default
        };
    });

    return {
        ...imported,
        id: existing.id, // Must keep internal ID to overwrite record
        importId: imported.importId || imported.id, // Store identity from import
        status,
        completedAt,
        snoozedUntil,
        snoozeType,
        lastProgressAt,
        urgencyLevel,
        createdAt,
        objectives: mergedObjectives
    };
}

/**
 * Processes an array of quest definitions (pure import/amendment).
 */
export async function importQuestDefinitions(quests) {
    let importedCount = 0;
    let amendedCount = 0;

    await db.transaction('rw', db.quests, async () => {
        for (const q of quests) {
            // Match by importId first
            let existing = null;
            if (q.importId) {
                existing = await db.quests.where('importId').equals(q.importId).first();
            }
            // Fallback match by internal id
            if (!existing && q.id) {
                existing = await db.quests.get(q.id);
            }

            if (existing) {
                const merged = mergeQuestDefinition(existing, q);
                await db.quests.put(merged);
                amendedCount++;
            } else {
                // Not existing, insert as new. Generate an importId if missing to ensure future stability.
                const newQuest = { ...q, importId: q.importId || q.id };
                await db.quests.put(newQuest);
                importedCount++;
            }
        }
    });

    return { importedCount, amendedCount };
}

/**
 * Restores full system state from an exported payload.
 * Wipes current state and replaces it entirely.
 */
export async function importSystemState(data) {
    if (!data.quests || !data.legendLog || data.type !== 'state') {
        throw new Error('Invalid full system state payload');
    }

    await db.transaction('rw', db.quests, db.legendLog, db.appState, db.events, async () => {
        await db.quests.clear();
        await db.legendLog.clear();
        await db.appState.clear();
        // optionally clear events, but let's leave them if we want to preserve export deltas?
        // usually a state restore resets everything.
        await db.events.clear();

        if (data.quests.length) await db.quests.bulkAdd(data.quests);
        if (data.legendLog.length) await db.legendLog.bulkAdd(data.legendLog);
        if (data.appState?.length) await db.appState.bulkAdd(data.appState);
    });

    // Emit import event
    await emitEvent(EVENT.STATE_IMPORTED, null, { version: data.version || 2, questCount: data.quests.length });
    return data.quests.length;
}

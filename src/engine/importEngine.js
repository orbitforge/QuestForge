import db from '../db.js';
import { EVENT } from '../schema.js';
import { emitEvent } from './eventBus.js';

/**
 * Safely merges an imported quest definition into an existing quest.
 * Preserves existing progress, status, and metadata unless explicitly overwritten.
 */
export function mergeQuestDefinition(existing, imported) {
    const stats = {
        objectivesAdded: 0,
        objectivesMatched: 0,
        objectivesPreserved: 0
    };

    // Preserve status and progress fields
    const status = existing.status;
    const completedAt = existing.completedAt;
    const snoozedUntil = existing.snoozedUntil;
    const snoozeType = existing.snoozeType;
    const lastProgressAt = existing.lastProgressAt;
    const urgencyLevel = existing.urgencyLevel;
    const createdAt = existing.createdAt;

    // Merge objectives carefully to preserve checked status
    const existingObjs = new Map(existing.objectives.map(o => [o.id, o]));
    const mergedObjectives = imported.objectives.map(impObj => {
        // 1. Primary Match: Find existing match by id
        let extMatch = existingObjs.get(impObj.id);

        // 2. Fallback Match: Find existing match by exact text
        if (!extMatch && impObj.text) {
            for (const obj of existingObjs.values()) {
                if (obj.text && obj.text.trim() === impObj.text.trim()) {
                    extMatch = obj;
                    break;
                }
            }
        }

        if (extMatch) {
            // Remove from the map so we know which ones were explicitly matched
            existingObjs.delete(extMatch.id);
            stats.objectivesMatched++;
            return {
                ...impObj, // Update text / definitions
                id: extMatch.id, // Keep the exact same internal ID
                completed: extMatch.completed // Preserve existing checked state
            };
        }

        // If no ID provided, or no match, it's a new objective
        stats.objectivesAdded++;
        return {
            ...impObj,
            id: impObj.id || Math.random().toString(36).slice(2, 8),
            completed: false // New objectives are unchecked by default
        };
    });

    // Rule: if an imported structural change removes an old objective, we keep it safely to avoid data loss.
    stats.objectivesPreserved = existingObjs.size;
    const preservedObjectives = Array.from(existingObjs.values());
    const finalObjectives = [...mergedObjectives, ...preservedObjectives];

    const merged = {
        ...imported,
        id: existing.id, // Must keep internal ID to overwrite record
        importId: imported.importId !== undefined ? imported.importId : existing.importId, // Preserve import identity from payload
        status,
        completedAt,
        snoozedUntil,
        snoozeType,
        lastProgressAt,
        urgencyLevel,
        createdAt,
        objectives: finalObjectives
    };

    return { merged, stats };
}

/**
 * Processes an array of quest definitions (pure import/amendment).
 */
export async function importQuestDefinitions(quests) {
    const summary = {
        importedCount: 0,
        amendedCount: 0,
        objectivesAdded: 0,
        objectivesMatched: 0,
        objectivesPreserved: 0
    };

    await db.transaction('rw', db.quests, async () => {
        for (const q of quests) {
            let existing = null;

            // 1. Primary Match: importId
            if (q.importId) {
                existing = await db.quests.where('importId').equals(q.importId).first();
            }

            // 2. Fallback Match: internal id
            if (!existing && q.id) {
                existing = await db.quests.get(q.id);
            }

            if (existing) {
                const { merged, stats } = mergeQuestDefinition(existing, q);
                await db.quests.put(merged);
                summary.amendedCount++;
                summary.objectivesAdded += stats.objectivesAdded;
                summary.objectivesMatched += stats.objectivesMatched;
                summary.objectivesPreserved += stats.objectivesPreserved;
            } else {
                // Not existing, insert as new. 
                await db.quests.put(q);
                summary.importedCount++;
                summary.objectivesAdded += (q.objectives?.length || 0);
            }
        }
    });

    return summary;
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

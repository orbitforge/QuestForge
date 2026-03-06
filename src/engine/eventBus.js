/* ═══════════════════════════════════════════════
   Event Bus — Append-only change log (V2)
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { createEvent } from '../schema.js';

/**
 * Emit and persist a change event
 */
export async function emitEvent(type, questId, payload = {}) {
    const event = createEvent(type, questId, payload);
    await db.events.add(event);
    return event;
}

/**
 * Get all events since a given timestamp (ISO string)
 */
export async function getEventsSince(timestamp) {
    return db.events
        .where('timestamp')
        .above(timestamp)
        .sortBy('timestamp');
}

/**
 * Get all unexported events
 */
export async function getUnexportedEvents() {
    return db.events
        .where('exported')
        .equals(0) // Dexie stores false as 0
        .sortBy('timestamp');
}

/**
 * Get count of unexported events
 */
export async function getUnexportedCount() {
    return db.events
        .where('exported')
        .equals(0)
        .count();
}

/**
 * Mark events as exported
 */
export async function markEventsExported(eventIds) {
    await db.events
        .where('id')
        .anyOf(eventIds)
        .modify({ exported: 1 });
}

/**
 * Normalize any boolean exported flags to integers (migration helper).
 * Call once on app boot to fix events created before the type-mismatch fix.
 */
export async function normalizeExportedFlags() {
    const all = await db.events.toArray();
    const toFix = all.filter(e => typeof e.exported === 'boolean');
    if (toFix.length === 0) return;
    await db.events.bulkPut(
        toFix.map(e => ({ ...e, exported: e.exported ? 1 : 0 }))
    );
}

/**
 * Get all events (for full state export)
 */
export async function getAllEvents() {
    return db.events.orderBy('timestamp').toArray();
}

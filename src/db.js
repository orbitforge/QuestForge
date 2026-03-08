/* ═══════════════════════════════════════════════
   IndexedDB Data Layer (Dexie.js) — V2
   ═══════════════════════════════════════════════ */

import Dexie from 'dexie';

const db = new Dexie('QuestForgeDB');

// V1 schema (preserved for migration path)
db.version(1).stores({
    quests: 'id, status, category, dueDate, createdAt',
    legendLog: 'id, completedAt, category',
    appState: 'key'
});

// V2 schema — adds events store + new indexes
db.version(2).stores({
    quests: 'id, status, category, dueDate, createdAt, urgencyLevel, snoozedUntil',
    legendLog: 'id, questId, completedAt, category',
    appState: 'key',
    events: 'id, type, questId, timestamp, exported'
}).upgrade(tx => {
    // Migrate V1 quests → V2 fields
    return tx.table('quests').toCollection().modify(quest => {
        if (quest.urgencyLevel === undefined) quest.urgencyLevel = 'low';
        if (quest.snoozedUntil === undefined) quest.snoozedUntil = null;
        if (quest.snoozeType === undefined) quest.snoozeType = null;
        if (quest.overdueEscalationDays === undefined) quest.overdueEscalationDays = null;
        if (quest.template === undefined) quest.template = null;
        if (quest._recurrenceProcessed === undefined) quest._recurrenceProcessed = false;
    });
});

// V3 schema — adds importId
db.version(3).stores({
    quests: 'id, importId, status, category, dueDate, createdAt, urgencyLevel, snoozedUntil',
    legendLog: 'id, questId, completedAt, category',
    appState: 'key',
    events: 'id, type, questId, timestamp, exported'
}).upgrade(tx => {
    return tx.table('quests').toCollection().modify(quest => {
        if (quest.importId === undefined) quest.importId = null;
    });
});

export default db;

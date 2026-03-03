/* ═══════════════════════════════════════════════
   IndexedDB Data Layer (Dexie.js)
   ═══════════════════════════════════════════════ */

import Dexie from 'dexie';

const db = new Dexie('QuestForgeDB');

db.version(1).stores({
    quests: 'id, status, category, dueDate, createdAt',
    legendLog: 'id, completedAt, category',
    appState: 'key'
});

export default db;

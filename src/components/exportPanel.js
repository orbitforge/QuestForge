/* ═══════════════════════════════════════════════
   Export Panel Component (V2)
   State + Delta export model
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { DIFFICULTY_LABEL, EVENT } from '../schema.js';
import { getUnexportedEvents, getUnexportedCount, markEventsExported, getAllEvents, emitEvent } from '../engine/eventBus.js';

export async function renderExportPanel(container) {
    const unexportedCount = await getUnexportedCount();

    container.innerHTML = `
    <div class="section-header"><h2 class="section-title">📦 Export / Import</h2></div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card" style="cursor:pointer;" id="export-state-card">
        <div class="stat-value" style="font-size:2.5rem;">📄</div>
        <div class="stat-label">Export State</div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">Full canonical state (quests, log, settings)</p>
      </div>
      <div class="stat-card" style="cursor:pointer; position:relative;" id="export-delta-card">
        <div class="stat-value" style="font-size:2.5rem;">📊</div>
        <div class="stat-label">Export Changes</div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">Delta events since last export</p>
        ${unexportedCount > 0 ? `<span class="delta-badge">${unexportedCount} new</span>` : ''}
      </div>
      <div class="stat-card" style="cursor:pointer;" id="export-md-card">
        <div class="stat-value" style="font-size:2.5rem;">📝</div>
        <div class="stat-label">Export Markdown</div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">Legend log summary</p>
      </div>
      <div class="stat-card" style="cursor:pointer; position:relative;" id="import-json-card">
        <div class="stat-value" style="font-size:2.5rem;">📥</div>
        <div class="stat-label">Import JSON</div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">Restore from backup</p>
        <input type="file" id="import-file" accept=".json" style="position:absolute; inset:0; opacity:0; cursor:pointer;" />
      </div>
    </div>

    <div id="export-status" style="display:none;" class="warning-banner"></div>
  `;

    // Export State (canonical)
    container.querySelector('#export-state-card').addEventListener('click', async () => {
        const data = await getFullState();
        downloadFile(JSON.stringify(data, null, 2), 'questforge-state.json', 'application/json');
        showStatus(container, '✅ State exported successfully!');
    });

    // Export Delta (changes only)
    container.querySelector('#export-delta-card').addEventListener('click', async () => {
        const events = await getUnexportedEvents();
        if (events.length === 0) {
            showStatus(container, 'ℹ️ No new changes since last export.');
            return;
        }
        const data = {
            version: 2,
            type: 'delta',
            exportedAt: new Date().toISOString(),
            events
        };
        downloadFile(JSON.stringify(data, null, 2), `questforge-changes-${Date.now()}.log.json`, 'application/json');
        await markEventsExported(events.map(e => e.id));
        showStatus(container, `✅ Exported ${events.length} change events!`);
        // Re-render to update badge
        await renderExportPanel(container);
    });

    // Export Markdown
    container.querySelector('#export-md-card').addEventListener('click', async () => {
        const md = await generateMarkdown();
        downloadFile(md, 'questforge-legend.md', 'text/markdown');
        showStatus(container, '✅ Markdown exported successfully!');
    });

    // Import JSON
    container.querySelector('#import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await restoreFromExport(data);
            showStatus(container, '✅ Import successful! Refresh your tabs to see changes.');
        } catch (err) {
            showStatus(container, `❌ Import failed: ${err.message}`);
        }
    });
}

async function getFullState() {
    const quests = await db.quests.toArray();
    const legendLog = await db.legendLog.toArray();
    const appState = await db.appState.toArray();
    return {
        version: 2,
        type: 'state',
        exportedAt: new Date().toISOString(),
        quests,
        legendLog,
        appState
    };
}

async function restoreFromExport(data) {
    if (!data.quests || !data.legendLog) {
        throw new Error('Invalid backup file');
    }

    await db.transaction('rw', db.quests, db.legendLog, db.appState, db.events, async () => {
        await db.quests.clear();
        await db.legendLog.clear();
        await db.appState.clear();

        if (data.quests.length) await db.quests.bulkAdd(data.quests);
        if (data.legendLog.length) await db.legendLog.bulkAdd(data.legendLog);
        if (data.appState?.length) await db.appState.bulkAdd(data.appState);
    });

    // Emit import event
    await emitEvent(EVENT.STATE_IMPORTED, null, { version: data.version || 1, questCount: data.quests.length });
}

async function generateMarkdown() {
    const entries = await db.legendLog.orderBy('completedAt').reverse().toArray();

    let md = `# QuestForge — Legend Log\n\n`;
    md += `*Exported: ${new Date().toLocaleString()}*\n\n---\n\n`;

    if (entries.length === 0) {
        md += `*No completed quests yet.*\n`;
        return md;
    }

    const grouped = {};
    for (const entry of entries) {
        const dateKey = new Date(entry.completedAt).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(entry);
    }

    for (const [date, entries] of Object.entries(grouped)) {
        const dayTotal = entries.reduce((s, e) => s + e.xpEarned, 0);
        md += `## ${date} (${dayTotal} XP)\n\n`;
        for (const entry of entries) {
            const time = new Date(entry.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const momentum = entry.momentumBonusApplied ? ' ⚡' : '';
            md += `- **${entry.title}** — ${DIFFICULTY_LABEL[entry.difficulty] || 'Tier ' + entry.difficulty} — +${entry.xpEarned} XP${momentum} *(${time})*\n`;
        }
        md += `\n`;
    }

    const totalXP = entries.reduce((s, e) => s + e.xpEarned, 0);
    md += `---\n\n**Total XP Earned: ${totalXP}**\n`;
    return md;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function showStatus(container, message) {
    const el = container.querySelector('#export-status');
    el.textContent = message;
    el.style.display = 'flex';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

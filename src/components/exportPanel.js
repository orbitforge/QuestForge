/* ═══════════════════════════════════════════════
   Export Panel Component
   JSON + Markdown Export/Import
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { DIFFICULTY_LABEL } from '../schema.js';

export async function renderExportPanel(container) {
    container.innerHTML = `
    <div class="section-header"><h2 class="section-title">📦 Export / Import</h2></div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card" style="cursor:pointer;" id="export-json-card">
        <div class="stat-value" style="font-size:2.5rem;">📄</div>
        <div class="stat-label">Export JSON</div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">Full backup of all quests, legend log, and app state</p>
      </div>
      <div class="stat-card" style="cursor:pointer;" id="export-md-card">
        <div class="stat-value" style="font-size:2.5rem;">📝</div>
        <div class="stat-label">Export Markdown</div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">Legend log summary grouped by date</p>
      </div>
      <div class="stat-card" style="cursor:pointer; position:relative;" id="import-json-card">
        <div class="stat-value" style="font-size:2.5rem;">📥</div>
        <div class="stat-label">Import JSON</div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">Restore from a previous export</p>
        <input type="file" id="import-file" accept=".json" style="position:absolute; inset:0; opacity:0; cursor:pointer;" />
      </div>
    </div>

    <div id="export-status" style="display:none;" class="warning-banner"></div>
  `;

    // Export JSON
    container.querySelector('#export-json-card').addEventListener('click', async () => {
        const data = await getFullExport();
        downloadFile(JSON.stringify(data, null, 2), 'questforge-backup.json', 'application/json');
        showStatus(container, '✅ JSON exported successfully!');
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

async function getFullExport() {
    const quests = await db.quests.toArray();
    const legendLog = await db.legendLog.toArray();
    const appState = await db.appState.toArray();
    return {
        version: 1,
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

    await db.transaction('rw', db.quests, db.legendLog, db.appState, async () => {
        await db.quests.clear();
        await db.legendLog.clear();
        await db.appState.clear();

        if (data.quests.length) await db.quests.bulkAdd(data.quests);
        if (data.legendLog.length) await db.legendLog.bulkAdd(data.legendLog);
        if (data.appState?.length) await db.appState.bulkAdd(data.appState);
    });
}

async function generateMarkdown() {
    const entries = await db.legendLog.orderBy('completedAt').reverse().toArray();

    let md = `# QuestForge — Legend Log\n\n`;
    md += `*Exported: ${new Date().toLocaleString()}*\n\n---\n\n`;

    if (entries.length === 0) {
        md += `*No completed quests yet.*\n`;
        return md;
    }

    // Group by date
    const grouped = {};
    for (const entry of entries) {
        const dateKey = new Date(entry.completedAt).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(entry);
    }

    for (const [date, entries] of Object.entries(grouped)) {
        const dayTotal = entries.reduce((s, e) => s + e.xpEarned, 0);
        md += `## ${date} (${dayTotal} XP)\n\n`;

        for (const entry of entries) {
            const momentum = entry.momentumBonusApplied ? ' ⚡' : '';
            md += `- **${entry.title}** — ${DIFFICULTY_LABEL[entry.difficulty]} — +${entry.xpEarned} XP${momentum}\n`;
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

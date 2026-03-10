/* ═══════════════════════════════════════════════
   Export Panel Component (V2)
   State + Delta export model
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { DIFFICULTY_LABEL, EVENT, normalizeRecurrenceRule, normalizeDueDate, normalizeTimestamp } from '../schema.js';
import { getUnexportedEvents, getUnexportedCount, markEventsExported, getAllEvents, emitEvent } from '../engine/eventBus.js';

// ── Value normalization for diff comparison ─────
function normalizeForDiff(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(normalizeForDiff);
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            // Apply date normalization to known date fields for comparison robustness
            if (k === 'dueDate') {
                out[k] = normalizeDueDate(v);
            } else if (['completedAt', 'lastProgressAt', 'snoozedUntil'].includes(k)) {
                out[k] = normalizeTimestamp(v);
            } else {
                out[k] = normalizeForDiff(v);
            }
        }
        return out;
    }
    return value;
}

// ── Snapshot helpers ────────────────────────────
function createQuestSnapshot(quests) {
    return quests.map(q => ({
        id: q.id,
        status: q.status,
        objectives: (q.objectives || []).map(o => ({
            id: o.id,
            completed: normalizeForDiff(o.completed),
            progress: normalizeForDiff(o.progress ?? null)
        })),
        dueDate: normalizeDueDate(q.dueDate),
        difficultyTier: q.difficultyTier,
        difficultyLabel: q.difficultyLabel,
        difficultyMultiplier: q.difficultyMultiplier,
        priority: q.priority
    }));
}

function snapshotsEqual(a, b) {
    return JSON.stringify(normalizeForDiff(a)) === JSON.stringify(normalizeForDiff(b));
}

async function getBaseline() {
    const row = await db.appState.get('lastDeltaExportBaseline');
    return row ? row.value : null;
}

async function saveBaseline(snapshot) {
    await db.appState.put({ key: 'lastDeltaExportBaseline', value: snapshot });
}

// ── Detect state-level changes vs baseline ──────
async function detectStateDiff() {
    const quests = await db.quests.toArray();
    const currentSnapshot = createQuestSnapshot(quests);
    const baseline = await getBaseline();

    // No baseline yet → treat as changed (first export)
    if (!baseline) return { changed: true, currentSnapshot };

    const changed = !snapshotsEqual(currentSnapshot, baseline);
    return { changed, currentSnapshot };
}

export async function renderExportPanel(container) {
    const unexportedCount = await getUnexportedCount();
    const { changed: stateChanged } = await detectStateDiff();
    const hasChanges = unexportedCount > 0 || stateChanged;
    const baseline = await getBaseline();

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
        ${hasChanges ? `<span class="delta-badge">${unexportedCount > 0 ? unexportedCount + ' new' : 'state changed'}</span>` : ''}
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

    <div class="baseline-status" style="margin-top:24px; padding:16px; border-radius:12px; border:1px solid var(--border-color); background:var(--bg-card); font-size:0.875rem;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
        <span style="color:${baseline ? 'var(--accent-primary)' : 'var(--text-muted)'}; font-size:1.1rem;">${baseline ? '🟢' : '⚪'}</span>
        <strong style="color:var(--text-main);">${baseline ? 'Delta baseline available' : 'No delta baseline yet'}</strong>
      </div>
      <p style="color:var(--text-muted); margin:0; line-height:1.4;">
        ${baseline
            ? 'Next export will compare your current state against this baseline to find changes. "No changes" means your state matches this baseline.'
            : 'The next "Export Changes" will establish a baseline of your current state. Subsequent exports will then show what changed since that moment.'}
      </p>
    </div>
  `;

    // Export State (canonical)
    container.querySelector('#export-state-card').addEventListener('click', async () => {
        const data = await getFullState();
        downloadFile(JSON.stringify(data, null, 2), 'questforge-state.json', 'application/json');
        showStatus(container, '✅ State exported successfully!');
    });

    // Export Delta (changes only) — dual-check: events + state diff
    container.querySelector('#export-delta-card').addEventListener('click', async () => {
        const events = await getUnexportedEvents();
        const { changed: stateChanged, currentSnapshot } = await detectStateDiff();

        // Safety guard: only report "no changes" when BOTH checks agree
        if (events.length === 0 && !stateChanged) {
            showStatus(container, 'ℹ️ No new changes since last export.');
            return;
        }

        const data = {
            version: 2,
            type: 'delta',
            exportedAt: new Date().toISOString(),
            events,
            stateChanged
        };
        downloadFile(JSON.stringify(data, null, 2), `questforge-changes-${Date.now()}.log.json`, 'application/json');

        // Mark events as exported
        if (events.length > 0) {
            await markEventsExported(events.map(e => e.id));
        }

        // Update baseline snapshot so next diff compares against latest state
        await saveBaseline(currentSnapshot);

        const parts = [];
        if (events.length > 0) parts.push(`${events.length} event(s)`);
        if (stateChanged) parts.push('state changes');
        showStatus(container, `✅ Exported ${parts.join(' + ')}!`);

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
    const quests = (await db.quests.toArray()).map(q => ({
        ...q,
        recurringRule: normalizeRecurrenceRule(q.recurringRule)
    }));
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
            const diffLabel = entry.difficultyLabel || DIFFICULTY_LABEL[entry.difficultyTier || entry.difficulty] || 'Unknown';
            md += `- **${entry.title}** — ${diffLabel} — +${entry.xpEarned} XP${momentum} *(${time})*\n`;
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


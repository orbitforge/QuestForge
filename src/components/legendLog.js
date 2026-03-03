/* ═══════════════════════════════════════════════
   Legend Log Component
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { DIFFICULTY_LABEL } from '../schema.js';

export async function renderLegendLog(container) {
    const allEntries = await db.legendLog.orderBy('completedAt').reverse().toArray();

    if (allEntries.length === 0) {
        container.innerHTML = `
      <div class="section-header"><h2 class="section-title">📜 Legend Log</h2></div>
      <div class="empty-state">
        <div class="empty-state-icon">📖</div>
        <div class="empty-state-text">Your legend awaits. Complete quests to fill these pages.</div>
      </div>
    `;
        return;
    }

    // Group by date
    const grouped = {};
    for (const entry of allEntries) {
        const dateKey = new Date(entry.completedAt).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(entry);
    }

    let html = `<div class="section-header"><h2 class="section-title">📜 Legend Log</h2></div>`;

    for (const [date, entries] of Object.entries(grouped)) {
        const dayTotal = entries.reduce((s, e) => s + e.xpEarned, 0);
        html += `
      <div class="legend-date-group">
        <div class="legend-date">${date} — <span style="color:var(--accent-gold);">${dayTotal} XP</span></div>
    `;

        for (const entry of entries) {
            html += `
        <div class="legend-entry">
          <div>
            <span class="legend-entry-title">${escapeHtml(entry.title)}</span>
            <span class="badge badge-difficulty-${entry.difficulty}" style="margin-left:8px;">${DIFFICULTY_LABEL[entry.difficulty]}</span>
            ${entry.category ? `<span class="badge badge-category" style="margin-left:4px;">${escapeHtml(entry.category)}</span>` : ''}
            ${entry.momentumBonusApplied ? '<span class="legend-momentum">⚡ Momentum</span>' : ''}
          </div>
          <span class="legend-entry-xp">+${entry.xpEarned} XP</span>
        </div>
      `;
        }

        html += `</div>`;
    }

    container.innerHTML = html;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

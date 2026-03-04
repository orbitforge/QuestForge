/* ═══════════════════════════════════════════════
   Legend Log Component (V2)
   Session clustering & completion timestamps
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { DIFFICULTY_LABEL, SESSION_CLUSTER_WINDOW_MS } from '../schema.js';

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
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(entry);
  }

  let html = `<div class="section-header"><h2 class="section-title">📜 Legend Log</h2></div>`;

  for (const [date, entries] of Object.entries(grouped)) {
    const dayTotal = entries.reduce((s, e) => s + e.xpEarned, 0);
    html += `<div class="legend-date-group">
          <div class="legend-date">${date} — <span style="color:var(--accent-gold);">${dayTotal} XP</span></div>
        `;

    // Cluster entries within 10-min windows
    const clusters = clusterEntries(entries);

    for (const cluster of clusters) {
      if (cluster.length > 1) {
        const clusterXP = cluster.reduce((s, e) => s + e.xpEarned, 0);
        html += `<div class="session-cluster">
                  <div class="session-cluster-label">⚡ Session — ${cluster.length} quests — <span style="color:var(--accent-gold);">${clusterXP} XP</span></div>`;
      }

      for (const entry of cluster) {
        const time = new Date(entry.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        html += `
                  <div class="legend-entry">
                    <div>
                      <span class="legend-entry-title">${escapeHtml(entry.title)}</span>
                      <span class="badge badge-difficulty-${entry.difficulty}" style="margin-left:8px;">${DIFFICULTY_LABEL[entry.difficulty] || 'Tier ' + entry.difficulty}</span>
                      ${entry.category ? `<span class="badge badge-category" style="margin-left:4px;">${escapeHtml(entry.category)}</span>` : ''}
                      ${entry.momentumBonusApplied ? '<span class="legend-momentum">⚡ Momentum</span>' : ''}
                      <span class="completed-time">${time}</span>
                    </div>
                    <span class="legend-entry-xp">+${entry.xpEarned} XP</span>
                  </div>
                `;
      }

      if (cluster.length > 1) {
        html += `</div>`;
      }
    }
    html += `</div>`;
  }

  container.innerHTML = html;
}

function clusterEntries(entries) {
  if (entries.length === 0) return [];
  const clusters = [[entries[0]]];
  for (let i = 1; i < entries.length; i++) {
    const prev = new Date(entries[i - 1].completedAt).getTime();
    const curr = new Date(entries[i].completedAt).getTime();
    if (Math.abs(prev - curr) <= SESSION_CLUSTER_WINDOW_MS) {
      clusters[clusters.length - 1].push(entries[i]);
    } else {
      clusters.push([entries[i]]);
    }
  }
  return clusters;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

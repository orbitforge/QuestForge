/* ═══════════════════════════════════════════════
   Stats Panel Component (V2)
   Urgency + snooze counts
   ═══════════════════════════════════════════════ */

import { getDailyXP, getWeeklyXP, getMonthlyXP } from '../engine/xpEngine.js';
import db from '../db.js';
import { STATUS, URGENCY } from '../schema.js';

export async function renderStatsPanel(container) {
  const [daily, weekly, monthly] = await Promise.all([
    getDailyXP(), getWeeklyXP(), getMonthlyXP()
  ]);

  const totalEntries = await db.legendLog.count();
  const allQuests = await db.quests.toArray();
  const totalQuests = allQuests.length;

  // Urgency breakdown
  const overdueQuests = allQuests.filter(q => q.status === STATUS.OVERDUE);
  const urgencyCounts = {
    low: overdueQuests.filter(q => q.urgencyLevel === URGENCY.LOW).length,
    moderate: overdueQuests.filter(q => q.urgencyLevel === URGENCY.MODERATE).length,
    critical: overdueQuests.filter(q => q.urgencyLevel === URGENCY.CRITICAL).length
  };
  const snoozedCount = allQuests.filter(q => q.status === STATUS.SNOOZED).length;

  container.innerHTML = `
    <div class="section-header"><h2 class="section-title">📊 Stats</h2></div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${daily}</div>
        <div class="stat-label">Daily XP</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${weekly}</div>
        <div class="stat-label">Weekly XP</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${monthly}</div>
        <div class="stat-label">Monthly XP</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalEntries}</div>
        <div class="stat-label">Quests Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalQuests}</div>
        <div class="stat-label">Total Quests</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${snoozedCount}</div>
        <div class="stat-label">💤 Snoozed</div>
      </div>
    </div>

    ${overdueQuests.length > 0 ? `
    <div class="section-header" style="margin-top:16px;"><h2 class="section-title">⚠️ Urgency Breakdown</h2></div>
    <div class="stats-grid">
      <div class="stat-card" style="border-left:3px solid var(--accent-green);">
        <div class="stat-value" style="color:var(--accent-green);">${urgencyCounts.low}</div>
        <div class="stat-label">Low</div>
      </div>
      <div class="stat-card" style="border-left:3px solid var(--accent-orange);">
        <div class="stat-value" style="color:var(--accent-orange);">${urgencyCounts.moderate}</div>
        <div class="stat-label">⚠️ Moderate</div>
      </div>
      <div class="stat-card" style="border-left:3px solid var(--accent-red);">
        <div class="stat-value" style="color:var(--accent-red);">${urgencyCounts.critical}</div>
        <div class="stat-label">🔥 Critical</div>
      </div>
    </div>
    ` : ''}
  `;
}

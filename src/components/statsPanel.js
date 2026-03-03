/* ═══════════════════════════════════════════════
   Stats Panel Component
   ═══════════════════════════════════════════════ */

import { getDailyXP, getWeeklyXP, getMonthlyXP } from '../engine/xpEngine.js';
import db from '../db.js';

export async function renderStatsPanel(container) {
    const [daily, weekly, monthly] = await Promise.all([
        getDailyXP(),
        getWeeklyXP(),
        getMonthlyXP()
    ]);

    const totalEntries = await db.legendLog.count();
    const allQuests = await db.quests.count();

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
        <div class="stat-value">${allQuests}</div>
        <div class="stat-label">Total Quests</div>
      </div>
    </div>
  `;
}

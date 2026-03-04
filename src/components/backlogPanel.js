/* ═══════════════════════════════════════════════
   Backlog Panel Component (V2)
   Dormant + Retired + Snoozed
   ═══════════════════════════════════════════════ */

import { getQuestsByStatus, reactivateQuest, deleteQuest, unsnoozeQuest } from '../engine/questEngine.js';
import { DIFFICULTY_LABEL } from '../schema.js';

export async function renderBacklogPanel(container, onRefresh) {
  const groups = await getQuestsByStatus();

  let html = `<div class="section-header"><h2 class="section-title">📦 Backlog</h2></div>`;

  // Snoozed quests
  if (groups.snoozed.length > 0) {
    html += `<h3 style="color:var(--accent-cyan); margin:16px 0 8px; font-size:0.9rem;">💤 Snoozed (${groups.snoozed.length})</h3>`;
    for (const quest of groups.snoozed) {
      const snoozeEnd = quest.snoozedUntil ? new Date(quest.snoozedUntil) : null;
      const countdown = snoozeEnd ? formatCountdown(snoozeEnd) : '';
      const snoozeTypeLabel = quest.snoozeType === 'hard' ? '🔒 Hard' : '🔓 Soft';

      html += `
            <div class="card snoozed">
              <div class="quest-header">
                <span class="quest-title">${escapeHtml(quest.title)}</span>
                <span class="badge badge-snoozed">${snoozeTypeLabel}</span>
              </div>
              <div class="quest-meta">
                <span class="badge badge-difficulty-${quest.difficulty}">${DIFFICULTY_LABEL[quest.difficulty] || 'Tier ' + quest.difficulty}</span>
                ${quest.category ? `<span class="badge badge-category">${escapeHtml(quest.category)}</span>` : ''}
                ${countdown ? `<span style="font-size:0.75rem;color:var(--text-muted);">Wakes in ${countdown}</span>` : ''}
              </div>
              <div class="quest-actions">
                <button class="btn btn-outline btn-sm btn-unsnooze" data-quest-id="${quest.id}">☀️ Wake Up</button>
              </div>
            </div>
          `;
    }
  }

  // Dormant quests
  if (groups.dormant.length > 0) {
    html += `<h3 style="color:var(--accent-orange); margin:16px 0 8px; font-size:0.9rem;">🌙 Dormant (${groups.dormant.length})</h3>`;
    for (const quest of groups.dormant) {
      html += `
            <div class="card dormant">
              <div class="quest-header">
                <span class="quest-title">${escapeHtml(quest.title)}</span>
                <span class="sprite"></span>
              </div>
              <div class="quest-meta">
                <span class="badge badge-difficulty-${quest.difficulty}">${DIFFICULTY_LABEL[quest.difficulty] || 'Tier ' + quest.difficulty}</span>
                ${quest.category ? `<span class="badge badge-category">${escapeHtml(quest.category)}</span>` : ''}
              </div>
              <div class="quest-actions">
                <button class="btn btn-outline btn-sm btn-reactivate" data-quest-id="${quest.id}">⚡ Reactivate</button>
              </div>
            </div>
          `;
    }
  }

  // Retired quests
  if (groups.retired.length > 0) {
    html += `<h3 style="color:var(--text-muted); margin:16px 0 8px; font-size:0.9rem;">🏛️ Retired (${groups.retired.length})</h3>`;
    for (const quest of groups.retired) {
      html += `
            <div class="card" style="opacity:0.5;">
              <div class="quest-header">
                <span class="quest-title">${escapeHtml(quest.title)}</span>
              </div>
              <div class="quest-meta">
                <span class="badge badge-difficulty-${quest.difficulty}">${DIFFICULTY_LABEL[quest.difficulty] || 'Tier ' + quest.difficulty}</span>
                ${quest.category ? `<span class="badge badge-category">${escapeHtml(quest.category)}</span>` : ''}
              </div>
              <div class="quest-actions">
                <button class="btn btn-danger btn-sm btn-delete-retired" data-quest-id="${quest.id}">🗑️ Delete</button>
              </div>
            </div>
          `;
    }
  }

  if (groups.snoozed.length === 0 && groups.dormant.length === 0 && groups.retired.length === 0) {
    html += `<div class="empty-state">
          <div class="empty-state-icon">✨</div>
          <div class="empty-state-text">No quests in the backlog. Keep forging!</div>
        </div>`;
  }

  container.innerHTML = html;

  // Wire events
  container.querySelectorAll('.btn-reactivate').forEach(el => {
    el.addEventListener('click', async () => {
      await reactivateQuest(el.dataset.questId);
      onRefresh();
    });
  });

  container.querySelectorAll('.btn-unsnooze').forEach(el => {
    el.addEventListener('click', async () => {
      await unsnoozeQuest(el.dataset.questId);
      onRefresh();
    });
  });

  container.querySelectorAll('.btn-delete-retired').forEach(el => {
    el.addEventListener('click', async () => {
      await deleteQuest(el.dataset.questId);
      onRefresh();
    });
  });
}

function formatCountdown(targetDate) {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  if (diff <= 0) return 'now';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

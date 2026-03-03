/* ═══════════════════════════════════════════════
   Backlog Panel (Dormant & Retired Quests)
   ═══════════════════════════════════════════════ */

import { getQuestsByStatus, reactivateQuest, deleteQuest } from '../engine/questEngine.js';

export async function renderBacklogPanel(container, onRefresh) {
    const groups = await getQuestsByStatus();
    let html = '';

    // Dormant quests
    html += `<div class="section-header"><h2 class="section-title">💤 Dormant Quests</h2></div>`;

    if (groups.dormant.length === 0) {
        html += `<div class="empty-state">
      <div class="empty-state-icon">🌙</div>
      <div class="empty-state-text">No dormant quests. All quests are active!</div>
    </div>`;
    } else {
        for (const quest of groups.dormant) {
            html += `
        <div class="card dormant">
          <div class="quest-header">
            <span class="quest-title">${escapeHtml(quest.title)} <span class="sprite"></span></span>
          </div>
          <div class="quest-meta">
            <span class="badge badge-category">${escapeHtml(quest.category || 'Uncategorized')}</span>
            <span class="badge badge-difficulty-${quest.difficulty}">${quest.difficulty === 1 ? 'Easy' : quest.difficulty === 2 ? 'Medium' : 'Hard'}</span>
          </div>
          ${quest.description ? `<p class="quest-description">${escapeHtml(quest.description)}</p>` : ''}
          <div class="quest-actions">
            <button class="btn btn-sm btn-primary btn-reactivate" data-quest-id="${quest.id}">🔄 Reactivate</button>
            <button class="btn btn-sm btn-danger btn-delete-backlog" data-quest-id="${quest.id}">🗑️ Delete</button>
          </div>
        </div>
      `;
        }
    }

    // Retired quests
    if (groups.retired.length > 0) {
        html += `<div class="section-header" style="margin-top:24px;"><h2 class="section-title">🏛️ Retired Quests</h2></div>`;
        for (const quest of groups.retired) {
            html += `
        <div class="card" style="opacity:0.5;">
          <div class="quest-header">
            <span class="quest-title" style="text-decoration:line-through;">${escapeHtml(quest.title)}</span>
          </div>
          <div class="quest-meta">
            ${quest.category ? `<span class="badge badge-category">${escapeHtml(quest.category)}</span>` : ''}
          </div>
          <div class="quest-actions">
            <button class="btn btn-sm btn-danger btn-delete-backlog" data-quest-id="${quest.id}">🗑️ Delete</button>
          </div>
        </div>
      `;
        }
    }

    container.innerHTML = html;

    // Wire events
    container.querySelectorAll('.btn-reactivate').forEach(el => {
        el.addEventListener('click', async () => {
            await reactivateQuest(el.dataset.questId);
            onRefresh();
        });
    });

    container.querySelectorAll('.btn-delete-backlog').forEach(el => {
        el.addEventListener('click', async () => {
            await deleteQuest(el.dataset.questId);
            onRefresh();
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

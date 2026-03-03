/* ═══════════════════════════════════════════════
   Quest List Component
   ═══════════════════════════════════════════════ */

import { STATUS, DIFFICULTY_LABEL } from '../schema.js';
import { getQuestsByStatus, toggleObjective, retireQuest, deleteQuest, getOverdueByCategory } from '../engine/questEngine.js';

/**
 * Render quest list into the quests tab
 * @param {HTMLElement} container
 * @param {Function} onEdit - callback(quest)
 * @param {Function} onRefresh - callback after state change
 */
export async function renderQuestList(container, onEdit, onRefresh) {
    const groups = await getQuestsByStatus();
    const overdueCategories = await getOverdueByCategory();

    let html = '';

    // Overdue quests first
    if (groups.overdue.length > 0) {
        html += `<div class="section-header"><h2 class="section-title">⚠️ Overdue</h2></div>`;
        for (const quest of groups.overdue) {
            html += renderQuestCard(quest, overdueCategories);
        }
    }

    // Active quests
    html += `<div class="section-header">
    <h2 class="section-title">🗡️ Active Quests</h2>
  </div>`;

    if (groups.active.length === 0 && groups.overdue.length === 0) {
        html += `<div class="empty-state">
      <div class="empty-state-icon">🏰</div>
      <div class="empty-state-text">No active quests. Forge a new one!</div>
    </div>`;
    } else {
        // Category backlog warnings
        const warnedCategories = new Set();
        for (const quest of groups.active) {
            if (quest.category && overdueCategories[quest.category] >= 2 && !warnedCategories.has(quest.category)) {
                warnedCategories.add(quest.category);
            }
        }
        for (const cat of warnedCategories) {
            html += `<div class="warning-banner">⚠️ Backlog detected in "${cat}" — ${overdueCategories[cat]} overdue quests. Consider clearing them first.</div>`;
        }

        for (const quest of groups.active) {
            html += renderQuestCard(quest, overdueCategories);
        }
    }

    // Recently completed (last 5)
    if (groups.completed.length > 0) {
        html += `<div class="section-header" style="margin-top:24px;">
      <h2 class="section-title">✅ Recently Completed</h2>
    </div>`;
        for (const quest of groups.completed.slice(0, 5)) {
            html += renderQuestCard(quest, overdueCategories);
        }
    }

    // FAB
    html += `<button class="fab" id="add-quest-btn" title="New Quest">+</button>`;

    container.innerHTML = html;

    // Wire up events
    container.querySelector('#add-quest-btn')?.addEventListener('click', () => onEdit(null));

    // Objective toggles
    container.querySelectorAll('.objective-item').forEach(el => {
        el.addEventListener('click', async () => {
            const questId = el.dataset.questId;
            const objId = el.dataset.objId;
            const result = await toggleObjective(questId, objId);
            if (result && result.completed) {
                showXPFloat(result.xpEarned, el);
            }
            onRefresh();
        });
    });

    // Edit buttons
    container.querySelectorAll('.btn-edit').forEach(el => {
        el.addEventListener('click', async () => {
            const quest = await (await import('../db.js')).default.quests.get(el.dataset.questId);
            if (quest) onEdit(quest);
        });
    });

    // Retire buttons
    container.querySelectorAll('.btn-retire').forEach(el => {
        el.addEventListener('click', async () => {
            await retireQuest(el.dataset.questId);
            onRefresh();
        });
    });

    // Delete buttons
    container.querySelectorAll('.btn-delete').forEach(el => {
        el.addEventListener('click', async () => {
            await deleteQuest(el.dataset.questId);
            onRefresh();
        });
    });
}

function renderQuestCard(quest, overdueCategories) {
    const isCompleted = quest.status === STATUS.COMPLETED;
    const isOverdue = quest.status === STATUS.OVERDUE;
    const isDormant = quest.status === STATUS.DORMANT;

    const completedCount = quest.objectives.filter(o => o.completed).length;
    const totalCount = quest.objectives.length;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    let cardClass = 'card';
    if (isCompleted) cardClass += ' completed';
    if (isOverdue) cardClass += ' overdue';
    if (isDormant) cardClass += ' dormant';

    let dueDateHtml = '';
    if (quest.dueDate) {
        const dueDate = new Date(quest.dueDate);
        const formatted = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const dueClass = isOverdue ? 'quest-due overdue' : 'quest-due';
        dueDateHtml = `<span class="${dueClass}">📅 ${formatted}</span>`;
    }

    const tagsHtml = quest.tags.map(t => `<span class="badge badge-tag">${escapeHtml(t)}</span>`).join('');
    const recurBadge = quest.recurringRule ? '<span class="badge badge-tag">🔁 Recurring</span>' : '';

    let objectivesHtml = '';
    if (totalCount > 0 && !isCompleted) {
        objectivesHtml += `
      <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      <span class="progress-label">${completedCount}/${totalCount} objectives</span>
      <ul class="objectives-list">
        ${quest.objectives.map(o => `
          <li class="objective-item ${o.completed ? 'completed' : ''}" data-quest-id="${quest.id}" data-obj-id="${o.id}">
            <span class="objective-check">${o.completed ? '✓' : ''}</span>
            <span>${escapeHtml(o.text)}</span>
          </li>
        `).join('')}
      </ul>
    `;
    }

    const actionsHtml = isCompleted ? '' : `
    <div class="quest-actions">
      <button class="btn-icon btn-edit" data-quest-id="${quest.id}" title="Edit">✏️</button>
      <button class="btn-icon btn-retire" data-quest-id="${quest.id}" title="Retire">💤</button>
      <button class="btn-icon btn-delete" data-quest-id="${quest.id}" title="Delete">🗑️</button>
    </div>
  `;

    return `
    <div class="${cardClass}">
      <div class="quest-header">
        <span class="quest-title">${escapeHtml(quest.title)}</span>
        ${dueDateHtml}
      </div>
      <div class="quest-meta">
        <span class="badge badge-difficulty-${quest.difficulty}">${DIFFICULTY_LABEL[quest.difficulty]}</span>
        ${quest.category ? `<span class="badge badge-category">${escapeHtml(quest.category)}</span>` : ''}
        ${tagsHtml}
        ${recurBadge}
        ${isOverdue ? '<span class="badge badge-overdue">OVERDUE</span>' : ''}
      </div>
      ${quest.description ? `<p class="quest-description">${escapeHtml(quest.description)}</p>` : ''}
      ${objectivesHtml}
      ${actionsHtml}
    </div>
  `;
}

function showXPFloat(xp, target) {
    const rect = target.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'xp-float';
    el.textContent = `+${xp} XP`;
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

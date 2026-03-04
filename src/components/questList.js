/* ═══════════════════════════════════════════════
   Quest List Component (V2)
   Collapsible cards, urgency indicators, snooze
   ═══════════════════════════════════════════════ */

import { STATUS, DIFFICULTY_LABEL, URGENCY, SESSION_CLUSTER_WINDOW_MS } from '../schema.js';
import { getQuestsByStatus, toggleObjective, retireQuest, deleteQuest, getOverdueByCategory, snoozeQuest } from '../engine/questEngine.js';
import db from '../db.js';

let expandedQuests = new Set();
let globalCollapse = true;

/**
 * Load UI state from DB
 */
async function loadUIState() {
  const state = await db.appState.get('uiState');
  if (state) {
    expandedQuests = new Set(state.expandedQuests || []);
    globalCollapse = state.globalCollapse !== undefined ? state.globalCollapse : true;
  }
}

async function saveUIState() {
  await db.appState.put({
    key: 'uiState',
    expandedQuests: [...expandedQuests],
    globalCollapse
  });
}

function isExpanded(questId) {
  if (globalCollapse) return expandedQuests.has(questId);
  return !expandedQuests.has(questId); // inverted: set tracks collapsed
}

export async function renderQuestList(container, onEdit, onRefresh) {
  await loadUIState();
  const groups = await getQuestsByStatus();
  const overdueCategories = await getOverdueByCategory();

  let html = '';

  // Global collapse controls
  html += `<div class="collapse-controls">
      <button class="btn btn-outline btn-sm" id="collapse-all-btn">▶ Collapse All</button>
      <button class="btn btn-outline btn-sm" id="expand-all-btn">▼ Expand All</button>
    </div>`;

  // Overdue quests (sorted by urgency)
  if (groups.overdue.length > 0) {
    html += `<div class="section-header"><h2 class="section-title">⚠️ Overdue</h2></div>`;
    for (const quest of groups.overdue) {
      html += renderQuestCard(quest, overdueCategories);
    }
  }

  // Active quests
  html += `<div class="section-header"><h2 class="section-title">🗡️ Active Quests</h2></div>`;

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
      html += `<div class="warning-banner">⚠️ Backlog detected in "${cat}" — ${overdueCategories[cat]} overdue quests.</div>`;
    }

    for (const quest of groups.active) {
      html += renderQuestCard(quest, overdueCategories);
    }
  }

  // Recently completed (with session clustering)
  if (groups.completed.length > 0) {
    html += `<div class="section-header" style="margin-top:24px;">
          <h2 class="section-title">✅ Recently Completed</h2>
        </div>`;

    const clusters = clusterCompletions(groups.completed.slice(0, 10));
    for (const cluster of clusters) {
      if (cluster.length > 1) {
        html += `<div class="session-cluster"><div class="session-cluster-label">⚡ Session — ${cluster.length} quests</div>`;
      }
      for (const quest of cluster) {
        html += renderQuestCard(quest, overdueCategories);
      }
      if (cluster.length > 1) {
        html += `</div>`;
      }
    }
  }

  // FAB
  html += `<button class="fab" id="add-quest-btn" title="New Quest">+</button>`;

  container.innerHTML = html;

  // Wire events
  container.querySelector('#add-quest-btn')?.addEventListener('click', () => onEdit(null));
  container.querySelector('#collapse-all-btn')?.addEventListener('click', async () => {
    globalCollapse = true;
    expandedQuests.clear();
    await saveUIState();
    onRefresh();
  });
  container.querySelector('#expand-all-btn')?.addEventListener('click', async () => {
    globalCollapse = false;
    expandedQuests.clear();
    await saveUIState();
    onRefresh();
  });

  // Toggle expand/collapse per quest
  container.querySelectorAll('.quest-toggle').forEach(el => {
    el.addEventListener('click', async () => {
      const qid = el.dataset.questId;
      if (globalCollapse) {
        expandedQuests.has(qid) ? expandedQuests.delete(qid) : expandedQuests.add(qid);
      } else {
        expandedQuests.has(qid) ? expandedQuests.delete(qid) : expandedQuests.add(qid);
      }
      await saveUIState();
      onRefresh();
    });
  });

  // Objective toggles
  container.querySelectorAll('.objective-item').forEach(el => {
    el.addEventListener('click', async () => {
      const result = await toggleObjective(el.dataset.questId, el.dataset.objId);
      if (result && result.completed) showXPFloat(result.xpEarned, el);
      onRefresh();
    });
  });

  // Edit buttons
  container.querySelectorAll('.btn-edit').forEach(el => {
    el.addEventListener('click', async () => {
      const quest = await db.quests.get(el.dataset.questId);
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

  // Snooze buttons
  container.querySelectorAll('.btn-snooze').forEach(el => {
    el.addEventListener('click', async () => {
      const questId = el.dataset.questId;
      const snoozeType = el.dataset.snoozeType || 'soft';
      // Snooze for 1 day by default
      const until = new Date();
      until.setDate(until.getDate() + 1);
      until.setHours(23, 59, 0, 0);
      await snoozeQuest(questId, until.toISOString(), snoozeType);
      onRefresh();
    });
  });
}

function renderQuestCard(quest, overdueCategories) {
  const isCompleted = quest.status === STATUS.COMPLETED;
  const isOverdue = quest.status === STATUS.OVERDUE;
  const isDormant = quest.status === STATUS.DORMANT;
  const isSnoozed = quest.status === STATUS.SNOOZED;
  const expanded = isExpanded(quest.id);

  const completedCount = quest.objectives.filter(o => o.completed).length;
  const totalCount = quest.objectives.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  let cardClass = 'card';
  if (isCompleted) cardClass += ' completed';
  if (isOverdue) cardClass += ' overdue';
  if (isDormant) cardClass += ' dormant';
  if (isSnoozed) cardClass += ' snoozed';
  if (quest.urgencyLevel === 'moderate') cardClass += ' urgency-moderate';
  if (quest.urgencyLevel === 'critical') cardClass += ' urgency-critical';

  let dueDateHtml = '';
  if (quest.dueDate) {
    const dueDate = new Date(quest.dueDate);
    const formatted = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const dueClass = isOverdue ? 'quest-due overdue' : 'quest-due';
    dueDateHtml = `<span class="${dueClass}">📅 ${formatted}</span>`;
  }

  // Urgency badge
  let urgencyBadge = '';
  if (quest.urgencyLevel === 'moderate') urgencyBadge = '<span class="badge badge-urgency-moderate">⚠️ MODERATE</span>';
  if (quest.urgencyLevel === 'critical') urgencyBadge = '<span class="badge badge-urgency-critical">🔥 CRITICAL</span>';

  const tagsHtml = quest.tags.map(t => `<span class="badge badge-tag">${escapeHtml(t)}</span>`).join('');
  const recurBadge = quest.recurringRule ? '<span class="badge badge-tag">🔁 Recurring</span>' : '';
  const templateBadge = quest.template ? `<span class="badge badge-tag">📋 ${escapeHtml(quest.template)}</span>` : '';
  const snoozeBadge = isSnoozed ? `<span class="badge badge-snoozed">💤 Snoozed until ${new Date(quest.snoozedUntil).toLocaleDateString()}</span>` : '';

  // CompletedAt timestamp
  let completedAtHtml = '';
  if (isCompleted && quest.completedAt) {
    const dt = new Date(quest.completedAt);
    completedAtHtml = `<div class="completed-timestamp">✅ ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>`;
  }

  // Expand/collapse toggle
  const toggleIcon = expanded ? '▼' : '▶';

  // Expanded content
  let expandedContent = '';
  if (expanded) {
    if (quest.description) {
      expandedContent += `<p class="quest-description">${escapeHtml(quest.description)}</p>`;
    }

    if (totalCount > 0 && !isCompleted) {
      expandedContent += `
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

    if (!isCompleted) {
      expandedContent += `
              <div class="quest-actions">
                <button class="btn-icon btn-snooze" data-quest-id="${quest.id}" data-snooze-type="soft" title="Snooze (soft)">💤</button>
                <button class="btn-icon btn-edit" data-quest-id="${quest.id}" title="Edit">✏️</button>
                <button class="btn-icon btn-retire" data-quest-id="${quest.id}" title="Retire">🏛️</button>
                <button class="btn-icon btn-delete" data-quest-id="${quest.id}" title="Delete">🗑️</button>
              </div>
            `;
    }

    expandedContent += completedAtHtml;
  }

  // Progress bar in collapsed view (compact)
  let collapsedProgress = '';
  if (!expanded && totalCount > 0 && !isCompleted) {
    collapsedProgress = `<div class="progress-track" style="margin-top:6px;"><div class="progress-fill" style="width:${progressPct}%"></div></div>`;
  }

  return `
    <div class="${cardClass}">
      <div class="quest-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="quest-toggle" data-quest-id="${quest.id}" title="Toggle">${toggleIcon}</button>
          <span class="quest-title">${escapeHtml(quest.title)}</span>
        </div>
        ${dueDateHtml}
      </div>
      <div class="quest-meta">
        <span class="badge badge-difficulty-${quest.difficulty}">${DIFFICULTY_LABEL[quest.difficulty] || 'Tier ' + quest.difficulty}</span>
        ${quest.category ? `<span class="badge badge-category">${escapeHtml(quest.category)}</span>` : ''}
        ${tagsHtml}
        ${recurBadge}
        ${templateBadge}
        ${urgencyBadge}
        ${snoozeBadge}
        ${isOverdue ? '<span class="badge badge-overdue">OVERDUE</span>' : ''}
      </div>
      ${collapsedProgress}
      ${expandedContent}
    </div>
  `;
}

/**
 * Group completed quests into session clusters (within 10-min window)
 */
function clusterCompletions(quests) {
  if (quests.length === 0) return [];
  const clusters = [[quests[0]]];

  for (let i = 1; i < quests.length; i++) {
    const prev = new Date(quests[i - 1].completedAt).getTime();
    const curr = new Date(quests[i].completedAt).getTime();
    if (Math.abs(prev - curr) <= SESSION_CLUSTER_WINDOW_MS) {
      clusters[clusters.length - 1].push(quests[i]);
    } else {
      clusters.push([quests[i]]);
    }
  }
  return clusters;
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

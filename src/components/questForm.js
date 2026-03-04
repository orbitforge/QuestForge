/* ═══════════════════════════════════════════════
   Quest Form Component (V2) — Create / Edit Modal
   7-tier difficulty, templates, escalation days
   ═══════════════════════════════════════════════ */

import { createQuest, createObjective, RECURRENCE_TYPES, generateId, DIFFICULTY_LABEL, DIFFICULTY_MULTIPLIER, QUEST_TEMPLATES } from '../schema.js';
import { saveQuest, getOverdueByCategory } from '../engine/questEngine.js';

export async function renderQuestForm(container, quest, onSave, onClose) {
  const isEdit = quest !== null;
  const q = quest || createQuest();

  const overdueCategories = await getOverdueByCategory();

  const objectivesHtml = q.objectives.map((o, i) => `
    <div class="form-objective-row" data-obj-index="${i}">
      <input class="form-input obj-text" type="text" value="${escapeAttr(o.text)}" placeholder="Objective ${i + 1}" />
      <button class="btn-icon remove-obj" type="button" title="Remove">×</button>
    </div>
  `).join('');

  // Build difficulty options
  const difficultyOptions = Object.entries(DIFFICULTY_LABEL).map(([val, label]) => {
    const mult = DIFFICULTY_MULTIPLIER[val];
    return `<option value="${val}" ${q.difficulty === parseInt(val) ? 'selected' : ''}>${'⭐'.repeat(Math.min(parseInt(val), 5))}${parseInt(val) > 5 ? '💎'.repeat(parseInt(val) - 5) : ''} ${label} (${mult}×)</option>`;
  }).join('');

  // Build template options
  const templateOptions = Object.entries(QUEST_TEMPLATES).map(([key, tmpl]) =>
    `<option value="${key}" ${q.template === key ? 'selected' : ''}>${tmpl.title}</option>`
  ).join('');

  container.innerHTML = `
    <h2 class="modal-title">${isEdit ? '✏️ Edit Quest' : '⚔️ New Quest'}</h2>
    <form id="quest-form">
      ${!isEdit ? `<div class="form-group">
        <label class="form-label">Template</label>
        <select class="form-select" id="qf-template">
          <option value="">— None —</option>
          ${templateOptions}
        </select>
      </div>` : ''}

      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" type="text" id="qf-title" value="${escapeAttr(q.title)}" required />
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="qf-desc">${escapeAttr(q.description)}</textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Category</label>
          <input class="form-input" type="text" id="qf-category" value="${escapeAttr(q.category)}" placeholder="e.g. Learning, Health, Work" />
        </div>
        <div class="form-group">
          <label class="form-label">Difficulty</label>
          <select class="form-select" id="qf-difficulty">
            ${difficultyOptions}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Base XP</label>
          <input class="form-input" type="number" id="qf-xpbase" value="${q.xpBase}" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">XP per Objective</label>
          <input class="form-input" type="number" id="qf-xpobj" value="${q.xpPerObjective}" min="0" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Tags (comma separated)</label>
        <input class="form-input" type="text" id="qf-tags" value="${escapeAttr(q.tags.join(', '))}" placeholder="focus, sprint, priority" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input class="form-input" type="date" id="qf-due" value="${q.dueDate ? toDateInput(q.dueDate) : ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Overdue Escalation Days</label>
          <input class="form-input" type="number" id="qf-escalation" value="${q.overdueEscalationDays || 3}" min="1" max="30" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Objectives</label>
        <div id="objectives-container">
          ${objectivesHtml}
        </div>
        <button class="btn btn-outline btn-sm" type="button" id="add-objective-btn" style="margin-top:8px;">+ Add Objective</button>
      </div>

      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" id="qf-recurring" ${q.recurringRule ? 'checked' : ''} />
          Recurring Quest
        </label>
      </div>

      <div id="recurrence-fields" style="display:${q.recurringRule ? 'block' : 'none'};">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Repeat</label>
            <select class="form-select" id="qf-recur-type">
              <option value="daily" ${q.recurringRule?.type === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" ${q.recurringRule?.type === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${q.recurringRule?.type === 'monthly' ? 'selected' : ''}>Monthly</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Every N</label>
            <input class="form-input" type="number" id="qf-recur-interval" value="${q.recurringRule?.interval || 1}" min="1" />
          </div>
        </div>
      </div>

      <div id="category-warning" class="warning-banner" style="display:none;">
        ⚠️ Backlog detected. Proceed anyway?
      </div>

      <div class="form-actions">
        <button class="btn btn-outline" type="button" id="qf-cancel">Cancel</button>
        <button class="btn btn-gold" type="submit">${isEdit ? 'Update Quest' : 'Forge Quest'}</button>
      </div>
    </form>
  `;

  // Template selection (new quests only)
  if (!isEdit) {
    const templateSelect = container.querySelector('#qf-template');
    templateSelect?.addEventListener('change', () => {
      const key = templateSelect.value;
      if (!key || !QUEST_TEMPLATES[key]) return;
      const tmpl = QUEST_TEMPLATES[key];
      container.querySelector('#qf-title').value = tmpl.title;
      container.querySelector('#qf-desc').value = tmpl.description;
      container.querySelector('#qf-category').value = tmpl.category;
      container.querySelector('#qf-difficulty').value = tmpl.difficulty;
      container.querySelector('#qf-xpbase').value = tmpl.xpBase;
      container.querySelector('#qf-xpobj').value = tmpl.xpPerObjective;

      // Replace objectives
      const objContainer = container.querySelector('#objectives-container');
      objContainer.innerHTML = '';
      tmpl.objectives.forEach((text, i) => {
        const row = document.createElement('div');
        row.className = 'form-objective-row';
        row.dataset.objIndex = i;
        row.innerHTML = `
                  <input class="form-input obj-text" type="text" value="${escapeAttr(text)}" placeholder="Objective ${i + 1}" />
                  <button class="btn-icon remove-obj" type="button" title="Remove">×</button>
                `;
        objContainer.appendChild(row);
      });
      wireRemoveButtons();
    });
  }

  // Category backlog warning
  const categoryInput = container.querySelector('#qf-category');
  const warningEl = container.querySelector('#category-warning');
  function checkCategoryWarning() {
    const cat = categoryInput.value.trim();
    warningEl.style.display = cat && overdueCategories[cat] >= 2 ? 'flex' : 'none';
  }
  categoryInput.addEventListener('input', checkCategoryWarning);
  checkCategoryWarning();

  // Recurrence toggle
  const recurCheck = container.querySelector('#qf-recurring');
  const recurFields = container.querySelector('#recurrence-fields');
  recurCheck.addEventListener('change', () => {
    recurFields.style.display = recurCheck.checked ? 'block' : 'none';
  });

  // Add objective
  const objContainer = container.querySelector('#objectives-container');
  container.querySelector('#add-objective-btn').addEventListener('click', () => {
    const idx = objContainer.children.length;
    const row = document.createElement('div');
    row.className = 'form-objective-row';
    row.dataset.objIndex = idx;
    row.innerHTML = `
          <input class="form-input obj-text" type="text" placeholder="Objective ${idx + 1}" />
          <button class="btn-icon remove-obj" type="button" title="Remove">×</button>
        `;
    objContainer.appendChild(row);
    wireRemoveButtons();
  });

  function wireRemoveButtons() {
    container.querySelectorAll('.remove-obj').forEach(btn => {
      btn.onclick = () => btn.parentElement.remove();
    });
  }
  wireRemoveButtons();

  container.querySelector('#qf-cancel').addEventListener('click', onClose);

  // Submit
  container.querySelector('#quest-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const objectives = [];
    objContainer.querySelectorAll('.obj-text').forEach((input, i) => {
      const text = input.value.trim();
      if (text) {
        if (isEdit && q.objectives[i]) {
          objectives.push({ ...q.objectives[i], text });
        } else {
          objectives.push(createObjective(text));
        }
      }
    });

    const tagsRaw = container.querySelector('#qf-tags').value;
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    const dueVal = container.querySelector('#qf-due').value;

    let recurringRule = null;
    if (recurCheck.checked) {
      recurringRule = {
        type: container.querySelector('#qf-recur-type').value,
        interval: parseInt(container.querySelector('#qf-recur-interval').value) || 1
      };
    }

    const templateKey = !isEdit ? (container.querySelector('#qf-template')?.value || null) : q.template;

    const updatedQuest = {
      ...q,
      title: container.querySelector('#qf-title').value.trim(),
      description: container.querySelector('#qf-desc').value.trim(),
      category: container.querySelector('#qf-category').value.trim(),
      tags,
      difficulty: parseInt(container.querySelector('#qf-difficulty').value),
      xpBase: parseInt(container.querySelector('#qf-xpbase').value) || 50,
      xpPerObjective: parseInt(container.querySelector('#qf-xpobj').value) || 10,
      overdueEscalationDays: parseInt(container.querySelector('#qf-escalation').value) || 3,
      objectives,
      dueDate: dueVal ? dateToEndOfDay(dueVal) : null,
      recurringRule,
      template: templateKey
    };

    if (!isEdit) {
      updatedQuest.lastProgressAt = new Date().toISOString();
    }

    await saveQuest(updatedQuest, !isEdit);
    onSave(updatedQuest);
  });
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function toDateInput(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateToEndOfDay(dateStr) {
  const d = new Date(`${dateStr}T23:59:00`);
  return d.toISOString();
}

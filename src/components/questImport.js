/* ═══════════════════════════════════════════════
   Quest Import Component (V1.1)
   ═══════════════════════════════════════════════ */

import db from '../db.js';
import { generateId, STATUS, createObjective } from '../schema.js';

const VALID_STATUSES = new Set(Object.values(STATUS));
const VALID_DIFFICULTIES = new Set([1, 2, 3]);

/**
 * Render import modal content
 */
export function renderImportModal(container, onImported, onClose) {
    container.innerHTML = `
    <h2 class="modal-title">📥 Import Quests</h2>
    <div class="form-group">
      <label class="form-label">Paste Quest JSON</label>
      <textarea class="form-textarea" id="import-json-input" rows="12"
        placeholder='Paste a quest object or array of quest objects...\n\n{\n  "title": "My Quest",\n  "category": "Learning",\n  "difficulty": 2,\n  "xpBase": 100,\n  "xpPerObjective": 25,\n  "objectives": [\n    { "text": "Step 1" },\n    { "text": "Step 2" }\n  ]\n}'
        style="min-height:200px; font-family:monospace; font-size:0.8rem;"></textarea>
    </div>
    <div id="import-validation" style="display:none;" class="warning-banner"></div>
    <div id="import-success" style="display:none;" class="warning-banner" style="border-color:var(--accent-green);"></div>
    <div class="form-actions">
      <button class="btn btn-outline" type="button" id="import-cancel">Cancel</button>
      <button class="btn btn-outline" type="button" id="import-validate">Validate</button>
      <button class="btn btn-gold" type="button" id="import-submit" disabled>Import</button>
    </div>
  `;

    const textarea = container.querySelector('#import-json-input');
    const validationEl = container.querySelector('#import-validation');
    const successEl = container.querySelector('#import-success');
    const validateBtn = container.querySelector('#import-validate');
    const importBtn = container.querySelector('#import-submit');

    let parsedQuests = null;

    function showMsg(el, msg, isError = true) {
        el.style.display = 'flex';
        el.textContent = msg;
        el.style.borderColor = isError ? 'var(--accent-red)' : 'var(--accent-green)';
        el.style.color = isError ? 'var(--accent-red)' : 'var(--accent-green)';
        el.style.background = isError ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)';
    }

    // Validate
    validateBtn.addEventListener('click', () => {
        validationEl.style.display = 'none';
        successEl.style.display = 'none';
        importBtn.disabled = true;
        parsedQuests = null;

        const raw = textarea.value.trim();
        if (!raw) {
            showMsg(validationEl, '❌ No JSON provided.');
            return;
        }

        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            showMsg(validationEl, `❌ Invalid JSON: ${e.message}`);
            return;
        }

        // Normalize to array
        const quests = Array.isArray(data) ? data : [data];
        if (quests.length === 0) {
            showMsg(validationEl, '❌ Empty array.');
            return;
        }

        // Validate each quest
        const errors = [];
        for (let i = 0; i < quests.length; i++) {
            const q = quests[i];
            const label = quests.length > 1 ? `Quest[${i}]` : 'Quest';

            if (typeof q !== 'object' || q === null) {
                errors.push(`${label}: Not an object`);
                continue;
            }
            if (!q.title || typeof q.title !== 'string') {
                errors.push(`${label}: Missing or invalid "title" (string required)`);
            }
            if (q.difficulty !== undefined && !VALID_DIFFICULTIES.has(q.difficulty)) {
                errors.push(`${label}: "difficulty" must be 1, 2, or 3`);
            }
            if (q.status !== undefined && !VALID_STATUSES.has(q.status)) {
                errors.push(`${label}: Invalid "status"`);
            }
            if (q.objectives !== undefined) {
                if (!Array.isArray(q.objectives)) {
                    errors.push(`${label}: "objectives" must be an array`);
                } else {
                    for (let j = 0; j < q.objectives.length; j++) {
                        const obj = q.objectives[j];
                        if (typeof obj !== 'object' || (!obj.text && typeof obj !== 'string')) {
                            errors.push(`${label}.objectives[${j}]: Must have "text" property or be a string`);
                        }
                    }
                }
            }
        }

        if (errors.length > 0) {
            showMsg(validationEl, `❌ Validation failed:\n${errors.join('\n')}`);
            validationEl.style.whiteSpace = 'pre-wrap';
            return;
        }

        // Fill defaults
        parsedQuests = quests.map(q => normalizeQuest(q));
        showMsg(successEl, `✅ Valid! ${parsedQuests.length} quest(s) ready to import.`, false);
        importBtn.disabled = false;
    });

    // Import
    importBtn.addEventListener('click', async () => {
        if (!parsedQuests || parsedQuests.length === 0) return;
        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';

        try {
            await db.quests.bulkAdd(parsedQuests);
            showMsg(successEl, `✅ Imported ${parsedQuests.length} quest(s) successfully!`, false);
            parsedQuests = null;
            textarea.value = '';
            setTimeout(() => {
                onImported();
                onClose();
            }, 800);
        } catch (err) {
            showMsg(validationEl, `❌ Import error: ${err.message}`);
            importBtn.disabled = false;
            importBtn.textContent = 'Import';
        }
    });

    // Cancel
    container.querySelector('#import-cancel').addEventListener('click', onClose);
}

/**
 * Normalize a quest object — fill missing defaults
 */
function normalizeQuest(q) {
    const now = new Date().toISOString();
    return {
        id: q.id || generateId(),
        title: q.title || 'Untitled Quest',
        description: q.description || '',
        category: q.category || '',
        tags: Array.isArray(q.tags) ? q.tags : [],
        difficulty: VALID_DIFFICULTIES.has(q.difficulty) ? q.difficulty : 1,
        xpBase: typeof q.xpBase === 'number' ? q.xpBase : 50,
        xpPerObjective: typeof q.xpPerObjective === 'number' ? q.xpPerObjective : 10,
        objectives: normalizeObjectives(q.objectives),
        status: VALID_STATUSES.has(q.status) ? q.status : STATUS.ACTIVE,
        dueDate: q.dueDate || null,
        overdueThresholdDays: q.overdueThresholdDays ?? null,
        recurringRule: q.recurringRule || null,
        createdAt: q.createdAt || now,
        completedAt: q.completedAt || null,
        lastProgressAt: q.lastProgressAt || q.createdAt || now
    };
}

function normalizeObjectives(objectives) {
    if (!Array.isArray(objectives)) return [];
    return objectives.map(o => {
        if (typeof o === 'string') {
            return createObjective(o);
        }
        return {
            id: o.id || generateId(),
            text: o.text || '',
            completed: !!o.completed
        };
    });
}

/* ═══════════════════════════════════════════════
   QuestForge — Main Entry Point (V2)
   ═══════════════════════════════════════════════ */

import './style.css';
import db from './db.js';
import { APP_VERSION, STATUS } from './schema.js';
import { checkOverdue, checkDormancy, checkSnoozeExpiry, normalizeAllDates } from './engine/questEngine.js';
import { getMomentumState, formatMomentumTimer } from './engine/momentumEngine.js';
import { getDailyXP } from './engine/xpEngine.js';
import { renderQuestList } from './components/questList.js';
import { renderQuestForm } from './components/questForm.js';
import { renderBacklogPanel } from './components/backlogPanel.js';
import { renderLegendLog } from './components/legendLog.js';
import { renderStatsPanel } from './components/statsPanel.js';
import { renderExportPanel } from './components/exportPanel.js';
import { renderImportModal } from './components/questImport.js';
import { normalizeAllRecurrenceRules } from './engine/recurrenceEngine.js';
import { normalizeExportedFlags } from './engine/eventBus.js';

let currentTab = 'quests';
let momentumInterval = null;

// ── Boot ────────────────────────────────────────
async function init() {
    // Fix any corrupted recurrence rules, export flags, or date formats
    await normalizeExportedFlags();
    await normalizeAllRecurrenceRules();
    await normalizeAllDates();

    // Run lifecycle checks (V2: includes snooze expiry)
    await checkSnoozeExpiry();
    await checkOverdue();
    await checkDormancy();

    await refreshDailyXP();
    startMomentumTimer();
    setupTabs();
    setupImportButton();
    displayVersion();
    await renderTab('quests');
}

function displayVersion() {
    const el = document.getElementById('app-version-label');
    if (el) el.textContent = APP_VERSION;
}

// ── Tab Navigation ──────────────────────────────
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const tab = btn.dataset.tab;
            if (tab === currentTab) return;

            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`tab-${tab}`).classList.add('active');

            currentTab = tab;
            await renderTab(tab);
        });
    });
}

async function renderTab(tab) {
    const container = document.getElementById(`tab-${tab}`);

    switch (tab) {
        case 'quests':
            await renderQuestList(container, openQuestForm, refreshAll);
            break;
        case 'backlog':
            await renderBacklogPanel(container, refreshAll);
            break;
        case 'legend':
            await renderLegendLog(container);
            break;
        case 'stats':
            await renderStatsPanel(container);
            break;
        case 'export':
            await renderExportPanel(container);
            break;
    }
}

// ── Quest Form Modal ────────────────────────────
function openQuestForm(quest) {
    const modal = document.getElementById('quest-modal');
    const container = document.getElementById('quest-form-container');
    modal.style.display = 'flex';

    renderQuestForm(container, quest, async () => {
        closeQuestModal();
        await refreshAll();
    }, closeQuestModal);

    modal.onclick = (e) => {
        if (e.target === modal) closeQuestModal();
    };

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeQuestModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function closeQuestModal() {
    document.getElementById('quest-modal').style.display = 'none';
}

// ── Import Quest Modal ──────────────────────────
function setupImportButton() {
    document.getElementById('import-quest-btn')?.addEventListener('click', openImportModal);
}

function openImportModal() {
    const modal = document.getElementById('import-modal');
    const container = document.getElementById('import-form-container');
    modal.style.display = 'flex';

    renderImportModal(container, async () => {
        await refreshAll();
    }, closeImportModal);

    modal.onclick = (e) => {
        if (e.target === modal) closeImportModal();
    };
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeImportModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function closeImportModal() {
    document.getElementById('import-modal').style.display = 'none';
}

// ── Daily XP ────────────────────────────────────
async function refreshDailyXP() {
    const xp = await getDailyXP();
    document.getElementById('daily-xp-value').textContent = xp;
}

// ── Momentum Timer ──────────────────────────────
async function startMomentumTimer() {
    if (momentumInterval) clearInterval(momentumInterval);

    const update = async () => {
        const state = await getMomentumState();
        const display = document.getElementById('momentum-display');

        if (state.active) {
            display.style.display = 'flex';
            document.getElementById('momentum-timer').textContent = formatMomentumTimer(state.remainingMs);
            document.getElementById('momentum-bonus').textContent = `+${Math.round(state.currentBonus * 100)}%`;
        } else {
            display.style.display = 'none';
        }
    };

    await update();
    momentumInterval = setInterval(update, 1000);
}

// ── Refresh All ─────────────────────────────────
async function refreshAll() {
    await checkSnoozeExpiry();
    await checkOverdue();
    await checkDormancy();
    await refreshDailyXP();
    await startMomentumTimer();
    await renderTab(currentTab);
}

// ── Start ───────────────────────────────────────
init().catch(console.error);

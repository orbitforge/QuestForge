/* ═══════════════════════════════════════════════
   XP Calculation Engine
   ═══════════════════════════════════════════════ */

import { DIFFICULTY_MULTIPLIER } from '../schema.js';
import db from '../db.js';

/**
 * Calculate XP for a completed quest
 * XP = (xpBase + xpPerObjective × objectiveCount) × difficultyMultiplier × (1 + momentumBonus)
 */
export function calculateXP(quest, momentumBonus = 0) {
    const base = quest.xpBase + (quest.xpPerObjective * quest.objectives.length);
    const multiplier = DIFFICULTY_MULTIPLIER[quest.difficulty] || 1.0;
    return Math.round(base * multiplier * (1 + momentumBonus));
}

/**
 * Get XP totals for a time period
 */
export async function getXPForPeriod(startDate, endDate) {
    const entries = await db.legendLog
        .where('completedAt')
        .between(startDate.toISOString(), endDate.toISOString(), true, true)
        .toArray();

    return entries.reduce((sum, e) => sum + e.xpEarned, 0);
}

/**
 * Get today's XP
 */
export async function getDailyXP() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return getXPForPeriod(start, end);
}

/**
 * Get this week's XP (Monday start)
 */
export async function getWeeklyXP() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return getXPForPeriod(start, end);
}

/**
 * Get this month's XP
 */
export async function getMonthlyXP() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return getXPForPeriod(start, end);
}

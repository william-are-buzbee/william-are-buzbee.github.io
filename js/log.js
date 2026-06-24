// ==================== LOG SYSTEM ====================
// Structured message log. Every entry is an object with text, category, and turn.
// Visual distinction between categories is NOT applied yet — all messages render
// identically. A future prompt will add tab filtering, per-category muting, and
// styled rendering that consumes the category field.

import { state } from './state.js';

// ==================== CATEGORIES ====================
export const LOG_CATEGORIES = {
  COMBAT:      'combat',       // hits, misses, damage, zone destruction, kills, death, stealth
  MOVEMENT:    'movement',     // blocked by terrain, position changes, turning
  SENSING:     'sensing',      // scent detections, involuntary alerts, sniff results
  ENVIRONMENT: 'environment',  // time of day, hunger warnings, starvation, terrain transitions
  INTERACTION: 'interaction',  // item pickup, eating, equip, corpse looting, tile inspection
  SYSTEM:      'system',       // save confirmations, game start, meta-messages
};

// ==================== DOM ====================
export const logEl = document.getElementById('log');

// ==================== IN-MEMORY LOG ====================
// Each entry: { text: string, category: string, turn: number }
const LOG_MAX = 200;
const logEntries = [];

/** Return a shallow copy of the log entries array. */
export function getLogEntries() {
  return logEntries.slice();
}

/** Clear all log entries and the DOM. */
export function clearLog() {
  logEntries.length = 0;
  if (logEl) logEl.innerHTML = '';
}

// ==================== LOG FUNCTION ====================

/**
 * Add a message to the game log.
 * @param {string} text     — plain text message (no HTML, no inline formatting)
 * @param {string} category — one of LOG_CATEGORIES values (default: 'system')
 */
export function log(text, category = 'system') {
  if (!text) return;

  const entry = {
    text,
    category,
    turn: state.turnCount || 0,
  };

  // Cap the array
  if (logEntries.length >= LOG_MAX) {
    logEntries.shift();
    // Remove oldest DOM child to stay in sync
    if (logEl && logEl.firstChild) logEl.removeChild(logEl.firstChild);
  }

  logEntries.push(entry);

  // Render to DOM — uniform style, no per-category classes
  if (logEl) {
    const div = document.createElement('div');
    div.textContent = entry.text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }
}

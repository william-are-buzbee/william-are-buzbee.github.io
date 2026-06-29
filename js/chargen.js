// ==================== SPECIES SELECTION + DEATH/VICTORY ====================
// Prompt F: replaces stat allocation with species selection.
import { state } from './state.js';
import { SPECIES_TEMPLATES } from './constants.js';
import { freshPlayer } from './player.js';
import { initWorld } from './world-logic.js';
import { log, logEl, clearLog, LOG_CATEGORIES } from './log.js';
import { render } from './rendering.js';
import { spriteCache, COLOR_PALETTES, tintedMonsterSprite } from './sprites.js';
import { getRegionName } from './ui.js';
import { updatePlayerFOV } from './fov.js';

// Species keys in display order
const SPECIES_ORDER = ['prowler', 'ravager', 'grazer', 'shaleback', 'lurker'];

function openCharGen(){
  document.getElementById('title').style.display = 'none';
  document.getElementById('chargen-screen').style.display = 'none';
  document.getElementById('species-screen').style.display = 'flex';
  state.selectedSpecies = null;
  state.selectedColorPalette = null;
  renderSpeciesSelect();

  // Wire BEGIN button
  const beginBtn = document.getElementById('sp-begin');
  if (beginBtn) beginBtn.onclick = beginGame;
}

function renderSpeciesSelect(){
  const container = document.getElementById('species-options');
  if (!container) return;

  container.innerHTML = SPECIES_ORDER.map(key => {
    const sp = SPECIES_TEMPLATES[key];
    const sel = state.selectedSpecies === key ? ' selected' : '';
    return `<div class="species-option${sel}" data-species="${key}">
      <div class="species-name">${sp.displayName}</div>
      <div class="species-stats">Clade ${sp.clade} · ${sp.mass} kg · ${sp.limbs} limbs · ${sp.attacks} attacks</div>
      <div class="species-desc">${sp.description}</div>
    </div>`;
  }).join('');

  // Click handlers
  container.querySelectorAll('.species-option').forEach(opt => {
    opt.onclick = () => {
      state.selectedSpecies = opt.dataset.species;
      renderSpeciesSelect();
    };
  });

  // Render color palette swatches (if container exists)
  renderColorSwatches();

  // BEGIN only enabled when species is selected (and optionally color)
  const beginBtn = document.getElementById('sp-begin');
  if (beginBtn) {
    beginBtn.disabled = !state.selectedSpecies;
  }
}

function renderColorSwatches(){
  const cpContainer = document.getElementById('sp-colorpalette-options');
  if (!cpContainer) return;
  const keys = Object.keys(COLOR_PALETTES);

  cpContainer.innerHTML = keys.map(k => {
    const pal = COLOR_PALETTES[k];
    const isSel = state.selectedColorPalette === k;
    return `<div class="colorpalette-option" data-cp="${k}"
              style="width:28px;height:28px;cursor:pointer;background:${pal.color};
                     border:2px solid ${isSel ? '#d4a050' : 'rgba(255,255,255,0.15)'};">
    </div>`;
  }).join('');

  cpContainer.querySelectorAll('.colorpalette-option').forEach(opt => {
    opt.onclick = () => {
      state.selectedColorPalette = opt.dataset.cp;
      renderSpeciesSelect();
    };
  });
}

function beginGame(){
  if (!state.selectedSpecies) return;

  state.exploredCells = new Set();
  state.player = freshPlayer(
    state.selectedSpecies,
    state.selectedColorPalette || SPECIES_TEMPLATES[state.selectedSpecies].colorPalette
  );

  // ── Cognitive tier & circulation (Prompt M-A1) ──
  const spTemplate = SPECIES_TEMPLATES[state.selectedSpecies];
  state.player.circulationType = spTemplate.circulationType || 'closed';
  state.player.integrationCapacity = 0;
  state.player.tier = 1;

  // ── Stress chemistry (Ganglion system) ──
  state.player.stressLevel = 0;

  initWorld(Math.floor(Math.random()*999999));
  document.getElementById('species-screen').style.display = 'none';
  state.gameState = 'play';
  clearLog();

  const sp = SPECIES_TEMPLATES[state.selectedSpecies];
  log(`You awaken as a ${sp.displayName}.`, LOG_CATEGORIES.SYSTEM);
  updatePlayerFOV();
  render();
}

// ==================== SPECIES KEYBOARD NAVIGATION ====================
// Arrow keys cycle through species, selecting each one.
// Enter triggers beginGame (handled by main.js keydown).
function speciesKeyNav(direction) {
  const currentIdx = state.selectedSpecies
    ? SPECIES_ORDER.indexOf(state.selectedSpecies)
    : -1;
  let newIdx;
  if (currentIdx === -1) {
    newIdx = direction > 0 ? 0 : SPECIES_ORDER.length - 1;
  } else {
    newIdx = currentIdx + direction;
    if (newIdx < 0) newIdx = SPECIES_ORDER.length - 1;
    if (newIdx >= SPECIES_ORDER.length) newIdx = 0;
  }
  state.selectedSpecies = SPECIES_ORDER[newIdx];
  renderSpeciesSelect();

  // Scroll selected option into view
  const container = document.getElementById('species-options');
  const selected = container ? container.querySelector('.species-option.selected') : null;
  if (selected) selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ==================== LEGACY COMPAT ====================
// These functions are exported so existing call sites don't break.
// openCharGen now opens species selection directly.
function renderCharGen(){ renderSpeciesSelect(); }
function randomizeAttrs(){} // no-op — no stats to randomize
function openBodyTypeSelect(){ openCharGen(); } // redirect to species select
function renderBodyTypeSelect(){ renderSpeciesSelect(); }

// ==================== DEATH / VICTORY ====================
// Canvas-rendered in main.js — these just set state.
// main.js callbacks handle save deletion and canvas rendering.
function onPlayerDeath(){
  state.gameState = 'death';
  // DOM element hidden via CSS — canvas overlay rendered by main.js callback
}
function onVictory(){
  state.gameState = 'victory';
  // DOM element hidden via CSS — canvas overlay rendered by main.js callback
}

export { openCharGen, renderCharGen, randomizeAttrs, beginGame,
         openBodyTypeSelect, renderBodyTypeSelect,
         onPlayerDeath, onVictory, speciesKeyNav };

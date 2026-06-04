// ==================== SPECIES SELECTION + DEATH/VICTORY ====================
// Prompt F: replaces stat allocation with species selection.
import { state } from './state.js';
import { SPECIES_TEMPLATES } from './constants.js';
import { freshPlayer } from './player.js';
import { initWorld } from './world-logic.js';
import { log, logEl } from './log.js';
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

  initWorld(Math.floor(Math.random()*999999));
  document.getElementById('species-screen').style.display = 'none';
  state.gameState = 'play';
  logEl.innerHTML = '';

  const sp = SPECIES_TEMPLATES[state.selectedSpecies];
  log(`You awaken as a ${sp.displayName}. The land stretches before you.`, 'system');
  log('Explore carefully. Danger lurks in every shadow.', 'system');
  updatePlayerFOV();
  render();
}

// ==================== LEGACY COMPAT ====================
// These functions are exported so existing call sites don't break.
// openCharGen now opens species selection directly.
function renderCharGen(){ renderSpeciesSelect(); }
function randomizeAttrs(){} // no-op — no stats to randomize
function openBodyTypeSelect(){ openCharGen(); } // redirect to species select
function renderBodyTypeSelect(){ renderSpeciesSelect(); }

// ==================== DEATH / VICTORY ====================
function onPlayerDeath(){
  state.gameState = 'death';
  document.getElementById('death').style.display = 'flex';
}
function onVictory(){
  state.gameState = 'victory';
  document.getElementById('victory-sub').textContent = `You struck down the Dread King. The land exhales.`;
  document.getElementById('victory').style.display = 'flex';
}

export { openCharGen, renderCharGen, randomizeAttrs, beginGame,
         openBodyTypeSelect, renderBodyTypeSelect,
         onPlayerDeath, onVictory };

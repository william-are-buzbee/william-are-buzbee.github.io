// ==================== CHARACTER CREATION + DEATH/VICTORY ====================
import { state } from './state.js';
import { STARTING_POINTS } from './constants.js';
import { rand, choice } from './rng.js';
import { freshPlayer, deriveHP, poisonResistance } from './player.js';
import { findArmor } from './items.js';
import { initWorld } from './world-logic.js';
import { log, logEl } from './log.js';
import { render } from './rendering.js';
import { spriteCache, COLOR_PALETTES, tintedMonsterSprite } from './sprites.js';
import { getRegionName } from './ui.js';
import { updatePlayerFOV } from './fov.js';

// cgAttrs lives in state.js
function getCGPool(){ return STARTING_POINTS; }

function openCharGen(){
  document.getElementById('title').style.display = 'none';
  document.getElementById('chargen-screen').style.display = 'flex';
  state.cgAttrs = {siz:1, strength:1, chem:1, vib:1, vis:1, central:1, distributed:1};
  state.selectedBodyType = null;
  state.selectedColorPalette = null;
  renderCharGen();

  // Wire NEXT to body-type selection (overrides any main.js binding)
  document.getElementById('cg-begin').onclick = openBodyTypeSelect;

  // Wire body-type screen buttons
  const btBack = document.getElementById('bt-back');
  const btBegin = document.getElementById('bt-begin');
  if (btBack) btBack.onclick = () => {
    document.getElementById('bodytype-screen').style.display = 'none';
    document.getElementById('chargen-screen').style.display = 'flex';
  };
  if (btBegin) btBegin.onclick = beginGame;
}

function renderCharGen(){
  const rows = document.getElementById('chargen-rows');
  const total = state.cgAttrs.siz + state.cgAttrs.strength + state.cgAttrs.chem + state.cgAttrs.vib + state.cgAttrs.vis + state.cgAttrs.central + state.cgAttrs.distributed;
  const remaining = getCGPool() - (total - 7);  // start 1/1/1/1/1/1/1 = 7, distribute pool
  document.getElementById('cg-pool').textContent = remaining;

  // Which derived stats each attribute affects
  const attrDerived = {
    siz: ['hp','hplvl','resthp','regen','poison','dodge','crit','stealth'],
    strength: ['melee','carry','bluntap','critdmg','hp','poison'],
    chem: [],
    vib: [],
    vis: ['acc','vision'],
    central: ['xp','critdmg','shop','sell'],
    distributed: [],
  };

  const attrs = [
    {key:'siz', name:'SIZE'},
    {key:'strength', name:'STR'},
    {key:'chem', name:'CHEM'},
    {key:'vib', name:'VIB'},
    {key:'vis', name:'VIS'},
    {key:'central', name:'CEN'},
    {key:'distributed', name:'DIST'},
  ];
  rows.innerHTML = attrs.map(a => {
    const v = state.cgAttrs[a.key];
    const dec = v <= 1 ? 'disabled' : '';
    const inc = (v >= 10 || remaining <= 0) ? 'disabled' : '';
    return `<div class="chargen-row" data-attr="${a.key}">
      <span class="lbl">${a.name}</span>
      <button data-dec="${a.key}" ${dec}>−</button>
      <span class="val">${v}</span>
      <button data-inc="${a.key}" ${inc}>+</button>
    </div>`;
  }).join('');

  rows.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => {
    const k = b.dataset.inc;
    if (state.cgAttrs[k] < 10 && remaining > 0){ state.cgAttrs[k]++; renderCharGen(); }
  });
  rows.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => {
    const k = b.dataset.dec;
    if (state.cgAttrs[k] > 1){ state.cgAttrs[k]--; renderCharGen(); }
  });

  // Hover logic: highlight related derived stats
  rows.querySelectorAll('.chargen-row').forEach(row => {
    const attr = row.dataset.attr;
    const targets = attrDerived[attr] || [];
    row.addEventListener('mouseenter', () => {
      targets.forEach(id => {
        const el = document.getElementById('cg-d-' + id);
        if (el) el.classList.add('highlight');
      });
    });
    row.addEventListener('mouseleave', () => {
      targets.forEach(id => {
        const el = document.getElementById('cg-d-' + id);
        if (el) el.classList.remove('highlight');
      });
    });
  });

  // Derived preview — uses the new combined formulas
  const startArmor = findArmor('rags');
  const armorDodgePen = startArmor.dodgePenalty || 0;
  const armorAccPen = armorDodgePen / 2;
  const hp = 10 + state.cgAttrs.siz*4 + state.cgAttrs.strength;
  const carry = 4 + state.cgAttrs.strength*2;
  const melee = 2 + Math.round(state.cgAttrs.strength*0.6);  // +2 from dagger, approximate
  const avgAP = ((state.cgAttrs.strength - 1) * (3 / 9));
  // Hit chance: 35 + Visual*4 + weapon.acc (5 for dagger) − armor accPenalty, clamped 5–95
  const rawAcc = 35 + state.cgAttrs.vis*4 + 5 - armorAccPen;
  const hitChance = Math.min(95, Math.max(5, rawAcc));
  // Dodge: Size only (temporary shim), minus armor dodgePenalty (flat), floor 0
  const dodge = Math.max(0, (state.cgAttrs.siz-1)*3.5 - armorDodgePen);
  // Crit: Size only (temporary shim), always enabled
  const crit = Math.min(60, (state.cgAttrs.siz - 1) * 4.5) + 3;
  // Crit mult: 50/50 Strength and Central
  const critMult = 1.5 + state.cgAttrs.strength*0.02 + state.cgAttrs.central*0.02;
  const xpM = 0.043 + (state.cgAttrs.central - 1) * 0.0168;
  const xpBaseline = 0.043; // Central 1 baseline
  const xpBonusPct = Math.round(((xpM / xpBaseline) - 1) * 100);
  const xpDisplay = xpBonusPct > 0 ? `100% +${xpBonusPct}%` : '100%';
  // HP per level
  const totalGain = 18 + (state.cgAttrs.siz-1)*3;
  const hpLvlLo = Math.floor(totalGain / 9);
  const hpLvlHi = hpLvlLo + (totalGain % 9 > 0 ? 1 : 0);
  const hpLvl = hpLvlLo === hpLvlHi ? `+${hpLvlLo}` : `+${hpLvlLo}–${hpLvlHi}`;
  // Rest HP
  const maxRest = Math.max(1, 1 + Math.floor((state.cgAttrs.siz-1)*0.55));
  // Passive regen interval
  const regenIv = Math.round(55 + (state.cgAttrs.siz-1) * (5-55)/9);
  // Stealth
  const stealth = state.cgAttrs.siz * 4;
  // Shop discount (mirrors buyPriceMul)
  let disc = (state.cgAttrs.central - 1) * 0.02;
  if (state.cgAttrs.central >= 8) disc += 0.06;
  if (state.cgAttrs.central >= 9) disc += 0.04;
  if (state.cgAttrs.central >= 10) disc += 0.04;
  disc = Math.min(disc, 0.30);
  const shopStr = disc > 0 ? `−${Math.round(disc*100)}%` : '—';
  // Sell value
  const sellPct = Math.round((0.25 + (state.cgAttrs.central-1) * (0.35/9))*100);
  // Vision radius (mirrors playerViewRadius)
  const visionR = Math.round(4 + (state.cgAttrs.vis - 1) * (4 / 9));

  document.getElementById('cg-derived').innerHTML = `
    <div class="kv" id="cg-d-hp"><span class="k">Health</span><span class="v">${hp}</span></div>
    <div class="kv" id="cg-d-hplvl"><span class="k">Health per Level</span><span class="v">${hpLvl}</span></div>
    <div class="kv" id="cg-d-melee"><span class="k">Melee Damage</span><span class="v">~${melee}</span></div>
    <div class="kv" id="cg-d-acc"><span class="k">Hit Chance</span><span class="v">${hitChance}%</span></div>
    <div class="kv" id="cg-d-dodge"><span class="k">Dodge Chance</span><span class="v">${Math.round(dodge)}%</span></div>
    <div class="kv" id="cg-d-crit"><span class="k">Critical Chance</span><span class="v">${Math.round(crit)}%</span></div>
    <div class="kv" id="cg-d-critdmg"><span class="k">Critical Damage</span><span class="v">×${critMult.toFixed(2)}</span></div>
    <div class="kv" id="cg-d-bluntap"><span class="k">Armor Piercing</span><span class="v">+${avgAP.toFixed(1)}</span></div>
    <div class="kv" id="cg-d-carry"><span class="k">Carry Weight</span><span class="v">${carry}</span></div>
    <div class="kv" id="cg-d-stealth"><span class="k">Stealth</span><span class="v">+${stealth}</span></div>
    <div class="kv" id="cg-d-xp"><span class="k">Experience Gain</span><span class="v">${xpDisplay}</span></div>
    <div class="kv" id="cg-d-resthp"><span class="k">Rest Healing</span><span class="v">1–${maxRest}</span></div>
    <div class="kv" id="cg-d-regen"><span class="k">Passive Regen</span><span class="v">1 per ${regenIv}t</span></div>
    <div class="kv" id="cg-d-vision"><span class="k">Vision Radius</span><span class="v">${visionR} tiles</span></div>
    <div class="kv" id="cg-d-shop"><span class="k">Shop Discount</span><span class="v">${shopStr}</span></div>
    <div class="kv" id="cg-d-sell"><span class="k">Sell Value</span><span class="v">${sellPct}%</span></div>
    <div class="kv" id="cg-d-poison"><span class="k">Poison Resist</span><span class="v">${Math.round(poisonResistance({siz:state.cgAttrs.siz,strength:state.cgAttrs.strength,level:1,perks:{}}).damageReduction*100)}%</span></div>
  `;

  document.getElementById('cg-begin').disabled = remaining !== 0;
}

function randomizeAttrs(){
  state.cgAttrs = {siz:1, strength:1, chem:1, vib:1, vis:1, central:1, distributed:1};
  let pool = getCGPool();
  const keys = ['siz','strength','chem','vib','vis','central','distributed'];
  while (pool > 0){
    const k = choice(keys);
    if (state.cgAttrs[k] < 10){ state.cgAttrs[k]++; pool--; }
  }
  renderCharGen();
}

function beginGame(){
  state.exploredCells = new Set();
  state.player = freshPlayer(state.cgAttrs, state.selectedBodyType || 'meso', state.selectedColorPalette || 'meso_predator');
  initWorld(Math.floor(Math.random()*999999));
  document.getElementById('chargen-screen').style.display = 'none';
  document.getElementById('bodytype-screen').style.display = 'none';
  state.gameState = 'play';
  logEl.innerHTML = '';
  log('You awaken in the wilds. The land stretches before you.', 'system');
  log('Explore carefully. Danger lurks in every shadow.', 'system');
  updatePlayerFOV();  // compute initial FOV before first render
  render();
}

// ==================== BODY TYPE + COLOR SELECTION (unified screen) ====================
function openBodyTypeSelect(){
  document.getElementById('chargen-screen').style.display = 'none';
  document.getElementById('bodytype-screen').style.display = 'flex';
  state.selectedBodyType = null;
  state.selectedColorPalette = null;

  // Inject color palette UI into the body-type screen (once)
  ensureColorUI();

  renderBodyTypeSelect();
}

/** Inject color swatch row + live preview into the body-type screen panel. */
function ensureColorUI(){
  if (document.getElementById('colorpalette-options')) return;
  const btOptions = document.getElementById('bodytype-options');
  if (!btOptions) return;

  // Color palette swatch container (no label, minimal)
  const cpContainer = document.createElement('div');
  cpContainer.id = 'colorpalette-options';
  cpContainer.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:10px 0;';
  btOptions.parentNode.insertBefore(cpContainer, btOptions.nextSibling);

  // Live preview canvas
  const previewWrap = document.createElement('div');
  previewWrap.id = 'cp-preview-wrap';
  previewWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:10px;';
  const preview = document.createElement('canvas');
  preview.id = 'cp-preview';
  preview.width = 64;
  preview.height = 64;
  preview.style.cssText = 'image-rendering:pixelated;border:2px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(0,0,0,0.3);';
  previewWrap.appendChild(preview);
  cpContainer.parentNode.insertBefore(previewWrap, cpContainer.nextSibling);
}

function renderBodyTypeSelect(){
  const container = document.getElementById('bodytype-options');
  const types = [
    { key: 'meso',   sprite: 'PLAYER_MESO' },
    { key: 'apex',   sprite: 'PLAYER_APEX' },
    { key: 'grazer', sprite: 'PLAYER_GRAZER' },
  ];

  container.innerHTML = types.map(t => {
    const sel = state.selectedBodyType === t.key ? ' selected' : '';
    return `<div class="bodytype-option${sel}" data-bt="${t.key}">
      <canvas class="bt-preview" data-sprite="${t.sprite}" width="48" height="48"></canvas>
    </div>`;
  }).join('');

  // Draw each body-type sprite preview — tinted if a color is selected
  container.querySelectorAll('.bt-preview').forEach(cvs => {
    const spriteName = cvs.dataset.sprite;
    let src;
    if (state.selectedColorPalette){
      const palEntry = COLOR_PALETTES[state.selectedColorPalette];
      if (palEntry) src = tintedMonsterSprite(spriteName, palEntry.color);
    }
    if (!src) src = spriteCache[spriteName];
    if (src){
      const g = cvs.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 48, 48);
      g.drawImage(src, 0, 0, 48, 48);
    }
  });

  // Click handlers — body type
  container.querySelectorAll('.bodytype-option').forEach(opt => {
    opt.onclick = () => {
      state.selectedBodyType = opt.dataset.bt;
      renderBodyTypeSelect();
    };
  });

  // Render color palette swatches
  renderColorSwatches();

  // Update the live preview
  updateColorPreview();

  // BEGIN only enabled when both body type AND color are selected
  document.getElementById('bt-begin').disabled = !(state.selectedBodyType && state.selectedColorPalette);
}

function renderColorSwatches(){
  const cpContainer = document.getElementById('colorpalette-options');
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

  // Click handlers — color
  cpContainer.querySelectorAll('.colorpalette-option').forEach(opt => {
    opt.onclick = () => {
      state.selectedColorPalette = opt.dataset.cp;
      renderBodyTypeSelect();   // re-render everything to update body previews + swatch highlight
    };
  });
}

/** Draw a live preview combining the selected body type + color palette. */
function updateColorPreview(){
  const cvs = document.getElementById('cp-preview');
  if (!cvs) return;
  const g = cvs.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, 64, 64);

  // Need both selections to show a meaningful preview
  if (!state.selectedBodyType && !state.selectedColorPalette) return;

  const bodyKey = { meso:'PLAYER_MESO', apex:'PLAYER_APEX', grazer:'PLAYER_GRAZER' }[state.selectedBodyType || 'meso'] || 'PLAYER_MESO';

  if (state.selectedColorPalette){
    const palEntry = COLOR_PALETTES[state.selectedColorPalette];
    if (palEntry){
      const src = tintedMonsterSprite(bodyKey, palEntry.color);
      if (src){ g.drawImage(src, 0, 0, 64, 64); return; }
    }
  }
  // Fallback: white/gray default
  const src = spriteCache[bodyKey];
  if (src) g.drawImage(src, 0, 0, 64, 64);
}

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

// getRegionName already imported above

export { openCharGen, renderCharGen, randomizeAttrs, beginGame,
         openBodyTypeSelect, renderBodyTypeSelect,
         onPlayerDeath, onVictory };

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
  state.cgAttrs = {str:1, con:1, dex:1, int:1, per:1};
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
  // Body type NEXT → color selection (not begin game)
  if (btBegin) btBegin.onclick = openColorSelect;
}

function renderCharGen(){
  const rows = document.getElementById('chargen-rows');
  const total = state.cgAttrs.str + state.cgAttrs.con + state.cgAttrs.dex + state.cgAttrs.int + state.cgAttrs.per;
  const remaining = getCGPool() - (total - 5);  // start 1/1/1/1/1 = 5, distribute pool
  document.getElementById('cg-pool').textContent = remaining;

  // Which derived stats each attribute affects
  const attrDerived = {
    str: ['melee','carry','bluntap','critdmg','hp','poison'],
    con: ['hp','hplvl','resthp','regen','poison'],
    dex: ['dodge','crit','stealth'],
    int: ['xp','critdmg','shop','sell'],
    per: ['acc','vision'],
  };

  const attrs = [
    {key:'str', name:'STR'},
    {key:'con', name:'CON'},
    {key:'dex', name:'DEX'},
    {key:'int', name:'INT'},
    {key:'per', name:'PER'},
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
  const hp = 10 + state.cgAttrs.con*4 + state.cgAttrs.str;
  const carry = 4 + state.cgAttrs.str*2;
  const melee = 2 + Math.round(state.cgAttrs.str*0.6);  // +2 from dagger, approximate
  const avgAP = ((state.cgAttrs.str - 1) * (3 / 9));
  // Hit chance: 35 + PER*4 + weapon.acc (5 for dagger) − armor accPenalty, clamped 5–95
  const rawAcc = 35 + state.cgAttrs.per*4 + 5 - armorAccPen;
  const hitChance = Math.min(95, Math.max(5, rawAcc));
  // Dodge: DEX only, minus armor dodgePenalty (flat), floor 0
  const dodge = Math.max(0, (state.cgAttrs.dex-1)*3.5 - armorDodgePen);
  // Crit: DEX only, always enabled
  const crit = Math.min(60, (state.cgAttrs.dex - 1) * 4.5) + 3;
  // Crit mult: 50/50 STR and INT
  const critMult = 1.5 + state.cgAttrs.str*0.02 + state.cgAttrs.int*0.02;
  const xpM = 0.043 + (state.cgAttrs.int - 1) * 0.0168;
  const xpBaseline = 0.043; // INT 1 baseline
  const xpBonusPct = Math.round(((xpM / xpBaseline) - 1) * 100);
  const xpDisplay = xpBonusPct > 0 ? `100% +${xpBonusPct}%` : '100%';
  // HP per level
  const totalGain = 18 + (state.cgAttrs.con-1)*3;
  const hpLvlLo = Math.floor(totalGain / 9);
  const hpLvlHi = hpLvlLo + (totalGain % 9 > 0 ? 1 : 0);
  const hpLvl = hpLvlLo === hpLvlHi ? `+${hpLvlLo}` : `+${hpLvlLo}–${hpLvlHi}`;
  // Rest HP
  const maxRest = Math.max(1, 1 + Math.floor((state.cgAttrs.con-1)*0.55));
  // Passive regen interval
  const regenIv = Math.round(55 + (state.cgAttrs.con-1) * (5-55)/9);
  // Stealth
  const stealth = state.cgAttrs.dex * 4;
  // Shop discount (mirrors buyPriceMul)
  let disc = (state.cgAttrs.int - 1) * 0.02;
  if (state.cgAttrs.int >= 8) disc += 0.06;
  if (state.cgAttrs.int >= 9) disc += 0.04;
  if (state.cgAttrs.int >= 10) disc += 0.04;
  disc = Math.min(disc, 0.30);
  const shopStr = disc > 0 ? `−${Math.round(disc*100)}%` : '—';
  // Sell value
  const sellPct = Math.round((0.25 + (state.cgAttrs.int-1) * (0.35/9))*100);
  // Vision radius (mirrors playerViewRadius)
  const visionR = Math.round(4 + (state.cgAttrs.per - 1) * (4 / 9));

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
    <div class="kv" id="cg-d-poison"><span class="k">Poison Resist</span><span class="v">${Math.round(poisonResistance({con:state.cgAttrs.con,str:state.cgAttrs.str,level:1,perks:{}}).damageReduction*100)}%</span></div>
  `;

  document.getElementById('cg-begin').disabled = remaining !== 0;
}

function randomizeAttrs(){
  state.cgAttrs = {str:1, con:1, dex:1, int:1, per:1};
  let pool = getCGPool();
  const keys = ['str','con','dex','int','per'];
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
  const colorScreen = document.getElementById('colorpalette-screen');
  if (colorScreen) colorScreen.style.display = 'none';
  state.gameState = 'play';
  logEl.innerHTML = '';
  log('You awaken in the wilds. The land stretches before you.', 'system');
  log('Explore carefully. Danger lurks in every shadow.', 'system');
  updatePlayerFOV();  // compute initial FOV before first render
  render();
}

// ==================== BODY TYPE SELECTION ====================
function openBodyTypeSelect(){
  document.getElementById('chargen-screen').style.display = 'none';
  document.getElementById('bodytype-screen').style.display = 'flex';
  state.selectedBodyType = null;
  // Relabel: this button now goes to color selection, not begin game
  const btBegin = document.getElementById('bt-begin');
  if (btBegin) btBegin.textContent = 'NEXT';
  renderBodyTypeSelect();
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

  // Draw each sprite preview onto its canvas
  container.querySelectorAll('.bt-preview').forEach(cvs => {
    const spriteName = cvs.dataset.sprite;
    const src = spriteCache[spriteName];
    if (src){
      const g = cvs.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 48, 48);
      g.drawImage(src, 0, 0, 48, 48);
    }
  });

  // Click handlers
  container.querySelectorAll('.bodytype-option').forEach(opt => {
    opt.onclick = () => {
      state.selectedBodyType = opt.dataset.bt;
      renderBodyTypeSelect();
    };
  });

  document.getElementById('bt-begin').disabled = !state.selectedBodyType;
}

// ==================== COLOR PALETTE SELECTION ====================

/** Create the color-palette screen DOM once if it doesn't exist yet. */
function ensureColorScreen(){
  if (document.getElementById('colorpalette-screen')) return;
  const screen = document.createElement('div');
  screen.id = 'colorpalette-screen';
  screen.className = 'overlay';
  screen.style.display = 'none';
  screen.innerHTML = `
    <div class="panel" style="max-width:420px;">
      <h2>Choose Color</h2>
      <div id="cp-preview-wrap" style="display:flex;justify-content:center;margin-bottom:10px;">
        <canvas id="cp-preview" width="64" height="64" style="image-rendering:pixelated;"></canvas>
      </div>
      <div id="colorpalette-options" style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-bottom:14px;"></div>
      <div style="display:flex;justify-content:center;gap:10px;">
        <button id="cp-back" class="btn">BACK</button>
        <button id="cp-begin" class="btn" disabled>BEGIN</button>
      </div>
    </div>`;
  // Insert after bodytype-screen so overlay stacking works
  const btScreen = document.getElementById('bodytype-screen');
  if (btScreen && btScreen.parentNode){
    btScreen.parentNode.insertBefore(screen, btScreen.nextSibling);
  } else {
    document.body.appendChild(screen);
  }
  // Wire buttons
  document.getElementById('cp-back').onclick = () => {
    screen.style.display = 'none';
    document.getElementById('bodytype-screen').style.display = 'flex';
  };
  document.getElementById('cp-begin').onclick = beginGame;
}

function openColorSelect(){
  ensureColorScreen();
  document.getElementById('bodytype-screen').style.display = 'none';
  document.getElementById('colorpalette-screen').style.display = 'flex';
  state.selectedColorPalette = null;
  renderColorSelect();
}

function renderColorSelect(){
  const container = document.getElementById('colorpalette-options');
  const keys = Object.keys(COLOR_PALETTES);

  container.innerHTML = keys.map(k => {
    const pal = COLOR_PALETTES[k];
    const sel = state.selectedColorPalette === k ? ' selected' : '';
    return `<div class="colorpalette-option${sel}" data-cp="${k}"
              style="display:flex;flex-direction:column;align-items:center;cursor:pointer;
                     padding:6px 8px;border-radius:6px;
                     border:2px solid ${state.selectedColorPalette === k ? '#d4a050' : 'transparent'};
                     background:${state.selectedColorPalette === k ? 'rgba(212,160,80,0.12)' : 'transparent'};">
      <div style="width:32px;height:32px;border-radius:50%;background:${pal.color};
                  border:2px solid rgba(255,255,255,0.25);"></div>
      <span style="font-size:10px;margin-top:4px;color:#bbb;text-align:center;max-width:72px;line-height:1.2;">${pal.label}</span>
    </div>`;
  }).join('');

  // Click handlers
  container.querySelectorAll('.colorpalette-option').forEach(opt => {
    opt.onclick = () => {
      state.selectedColorPalette = opt.dataset.cp;
      renderColorSelect();
    };
  });

  // Update live preview
  updateColorPreview();

  document.getElementById('cp-begin').disabled = !state.selectedColorPalette;
}

/** Draw a live preview combining the selected body type + color palette. */
function updateColorPreview(){
  const cvs = document.getElementById('cp-preview');
  if (!cvs) return;
  const g = cvs.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, 64, 64);

  const bodyKey = { meso:'PLAYER_MESO', apex:'PLAYER_APEX', grazer:'PLAYER_GRAZER' }[state.selectedBodyType] || 'PLAYER_MESO';

  if (state.selectedColorPalette){
    const palEntry = COLOR_PALETTES[state.selectedColorPalette];
    if (palEntry){
      const src = tintedMonsterSprite(bodyKey, palEntry.color);
      if (src) g.drawImage(src, 0, 0, 64, 64);
      return;
    }
  }
  // Fallback: default white/gray sprite
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
         openColorSelect, renderColorSelect,
         onPlayerDeath, onVictory };

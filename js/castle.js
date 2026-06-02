// ==================== CASTLE MODAL ====================
import { state, worlds, monsters } from './state.js';
import { LAYER_SURFACE } from './constants.js';
import { T, isWalkable, terrainName } from './terrain.js';
import { choice } from './rng.js';
import { findWeapon, findArmor } from './items.js';
import { addItem } from './player.js';
import { spawnMonster } from './monsters.js';
import { inBounds, monsterAt } from './world-state.js';
import { log } from './log.js';
import { openModal, closeModal } from './modal.js';

// Guardian knight scaling — previously in constants.js
const ENEMY_HP_MUL  = 1.5;
const ENEMY_ATK_MUL = 1.5;

// useStairs is imported lazily to avoid a circular dependency with interactions.js
let _useStairs = null;
export function setUseStairs(fn){ _useStairs = fn; }

function openCastle(f, x, y){
  if (f.castleKey === 'sunward') openSunward(f, x, y);
  else if (f.castleKey === 'blackspire') openBlackspire(f, x, y);
}

function openSunward(f, x, y){
  let html = `<h2>${f.name}</h2>`;
  html += `<div class="dialogue">A broken keep. Kneeling skeletal knights line the hall — long dead, still at their posts.</div>`;
  if (f.guarded && !f.knightSpawned){
    const spots = [];
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
      if (dx===0 && dy===0) continue;
      const nx=x+dx, ny=y+dy;
      if (inBounds(LAYER_SURFACE,nx,ny) && isWalkable(worlds[LAYER_SURFACE][ny][nx]) && !monsterAt(nx,ny,LAYER_SURFACE)) spots.push([nx,ny]);
    }
    if (spots.length){
      const [kx,ky] = choice(spots);
      const k = spawnMonster('knight');
      k.x = kx; k.y = ky;
      k.homeX = kx; k.homeY = ky;
      k.alerted = true; k.wasAttacked = true;
      k.aiState = 'chase';
      k.chaseTurnsLeft = k.chase;
      k.lastSeenX = state.player.x; k.lastSeenY = state.player.y;
      k.name = 'Guardian Knight';
      // Guardians can pursue anywhere around Sunward
      k.territory = [T.PLAINS,T.MOUNTAIN,T.FOREST,T.DESERT];
      k.hpMax = Math.round(k.hpMax * ENEMY_HP_MUL);
      k.hp = k.hpMax;
      k.weaponAtk = Math.round(k.weaponAtk * ENEMY_ATK_MUL);
      monsters[LAYER_SURFACE].push(k);
      f.knightSpawned = true;
      html += `<div class="dialogue" style="color:#d4a050;">A knight rises! "Prove thyself worthy, or begone."</div>`;
    }
  }
  let nearKnight = null;
  for (const m of monsters[LAYER_SURFACE]){
    if (m.hp > 0 && m.name === 'Guardian Knight' && chebyshev(m.x,m.y,x,y) <= 4){ nearKnight = m; break; }
  }
  if (f.chests){
    html += `<div class="shop-h">Ancient Chests</div>`;
    for (let i=0;i<f.chests.length;i++){
      const c = f.chests[i];
      if (c.taken){ html += `<div class="row"><div class="lbl"><span class="sub">(empty)</span></div></div>`; continue; }
      let desc = '';
      if (c.kind === 'weapon'){
        const w = findWeapon(c.key);
        desc = `<b>${w.name}</b><div class="sub">[${w.type}+${w.elem}] ATK+${w.atk} ap${w.ap}${w.bane?' BANE:'+w.bane:''}</div>`;
      } else if (c.kind === 'armor'){
        const a = findArmor(c.key);
        desc = `<b>${a.name}</b><div class="sub">DEF+${a.def}</div>`;
      }
      const locked = !!nearKnight;
      html += `<div class="row"><div class="lbl">${desc}</div>
        <button data-chest="${i}" ${locked?'disabled':''}>${locked?'GUARDED':'TAKE'}</button></div>`;
    }
  }
  html += `<div class="close-row"><button class="btn" id="btn-close">LEAVE</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
  document.querySelectorAll('[data-chest]').forEach(b => b.onclick = () => {
    const c = f.chests[parseInt(b.dataset.chest)];
    const item = {kind:c.kind, key:c.key};
    const result = addItem(player, item);
    if (result === 'full'){ log('Your bag is full.', 'warn'); return; }
    if (result === 'heavy'){ log("It's too heavy to carry.", 'warn'); return; }
    c.taken = true;
    if (c.kind === 'weapon') log(`You lift ${c.name}. The air warms.`, 'crit');
    else if (c.kind === 'armor') log(`You take ${c.name}.`, 'crit');
    openSunward(f,x,y);
  });
}

function openBlackspire(f, x, y){
  let html = `<h2>${f.name}</h2>`;
  html += `<div class="dialogue">A tower of obsidian. The gate yawns open — as if waiting. Air drifts up from below, cold and wrong.</div>`;
  html += `<div class="row">
    <div class="lbl">Stairs lead down to something old.</div>
    <button id="btn-descend">DESCEND</button>
    <button id="btn-close">TURN BACK</button>
  </div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
  document.getElementById('btn-descend').onclick = () => {
    closeModal();
    _useStairs({targetLayer:f.targetLayer, targetX:f.targetX, targetY:f.targetY, dir:'down'});
  };
}

export { openCastle, openSunward, openBlackspire };

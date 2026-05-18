// ==================== PLAYER ====================
import { DMG, STARTING_GOLD, LAYER_SURFACE, PRICE_CAT, LAYER_META } from './constants.js';
import { getTimePhase } from './time-cycle.js';
import { state } from './state.js';
import { rand, randomRound } from './rng.js';
import { findWeapon, findArmor } from './items.js';

// player object lives in state.js — functions here take player as parameter `p`

function freshPlayer(attrs){
  const p = {
    layer: LAYER_SURFACE,
    x:0, y:0,
    returnLayer: LAYER_SURFACE, returnX:0, returnY:0,  // where to go back after town
    str: attrs.str, con: attrs.con, dex: attrs.dex, int: attrs.int, per: attrs.per,
    level:1, xp:0, xpNext:15,
    gold: STARTING_GOLD,
    weapon: findWeapon('dagger'),
    armor: findArmor('rags'),
    inventory:[],
    effects: [],
    stealth:false,
    fed:100,
    restTurns:0,
    regenProgress:0,
    npcsMet:new Set(),
    booksRead:new Set(),
    perks:{},  // {hp_bonus:true, blade_bonus:true, ...}
    defeatedBoss:false,
    isPlayer:true,
    hitFlash:0,
  };
  // Starter inventory — each item is its own slot, no stacking
  p.inventory.push({kind:'food', key:'apple', weight:1});
  p.inventory.push({kind:'food', key:'apple', weight:1});
  p.inventory.push({kind:'food', key:'bread', weight:1});
  p.hpMax = deriveHP(p);
  p.hp = p.hpMax;
  return p;
}

// === Derived stats — attributes move the needle a LOT ===
// Max HP: base + CON*4 + STR at character creation,
// plus per-level growth that scales with EVERY point of CON.
// Total HP gain over 9 level-ups (levels 2-10):
//   CON 1 → 18 (avg 2/lvl), CON 4 → 27 (avg 3), CON 7 → 36 (avg 4), CON 10 → 45 (avg 5).
// Each CON point adds +3 total HP across the 9 levels.
// Growth alternates between two values to hit the target exactly at level 10.
// e.g. CON 2 → 2,2,3,2,2,3,2,2,3; CON 5 → 3,3,4,3,3,4,3,3,4.
function deriveHP(p){
  const totalGain9 = 18 + (p.con - 1) * 3;  // total HP gained from 9 level-ups (levels 2-10)
  const currentLevels = p.level - 1;         // number of level-ups completed

  let hpFromLevels;
  if (currentLevels <= 9){
    // Distribute gains evenly using integer division — produces natural alternation
    hpFromLevels = Math.floor(totalGain9 * currentLevels / 9);
  } else {
    // Beyond level 10 (INT 8+ builds): continue at the same average rate
    const extra = currentLevels - 9;
    hpFromLevels = totalGain9 + Math.floor(totalGain9 * extra / 9);
  }

  let hp = 10 + p.con * 4 + p.str + hpFromLevels;
  if (p.perks && p.perks.hp_bonus) hp += 8;
  return hp;
}


// Fixed 10-slot inventory grid. Weight governs carry limit.
const INV_SLOTS = 10;
function carryCapacity(p){ return 4 + p.str*2; }  // STR 1 = 6, STR 10 = 24
function totalWeight(p){ return p.inventory.reduce((s,it) => s + (it.weight||1), 0); }
function bagFull(p){ return p.inventory.length >= INV_SLOTS; }
function overWeight(p, extra=0){ return (totalWeight(p)+extra) > carryCapacity(p); }

// Melee dmg: weapon + 60% STR (probabilistic) + small level bonus
function playerMelee(p){
  let base = p.weapon.atk + randomRound(p.str*0.6) + Math.floor((p.level-1)*0.5);
  if (p.perks && p.perks.blade_bonus && p.weapon.type === DMG.BLADE) base += 1;
  if (p.perks && p.perks.blunt_bonus && p.weapon.type === DMG.BLUNT) base += 1;
  return base;
}

// Armor pen for blunt weapons — scales linearly with STR via probabilistic rounding
function effectiveAP(p){
  let ap = p.weapon.ap || 0;
  if (p.weapon.type === DMG.BLUNT){
    // STR 1 = +0, STR 10 = +3, smooth probabilistic transition
    const scale = (p.str - 1) * (3 / 9);
    ap += randomRound(scale);
  }
  return ap;
}

function playerDef(p){ return p.armor.def; }

// Accuracy: PER only (moved from DEX)
// Armor accPenalty = dodgePenalty / 2, applied as flat subtraction.
function playerAcc(p){
  const accPen = (p.armor.dodgePenalty || 0) / 2;
  return 35 + Math.round(p.per*4) + (p.weapon.acc||0) - accPen;
}
// Dodge: DEX only, minus armor dodgePenalty (flat subtraction, floor 0).
function playerDodge(p){
  const raw = (p.dex-1) * 3.5;
  return Math.max(0, raw - (p.armor.dodgePenalty || 0));
}
// Crit: scales linearly with DEX. Always enabled (no gate).
function playerCritChance(p){
  const raw = (p.dex - 1) * 4.5;  // DEX 1=0%, DEX 10=40.5%
  return Math.min(60, raw) + (p.weapon.crit||0);
}
function playerCritMult(p){ return 1.5 + p.str*0.02 + p.int*0.02; }

// XP multiplier — INT driven
// Calibrated so that killing ALL enemies in the game yields:
//   INT 1 → approximately level 8
//   INT 10 → approximately level 12
// Scaled ×1.333 to compensate for 25% reduced spawn density (1/50 → 1/67).
function xpMult(p){
  let m = 0.0573 + (p.int - 1) * 0.0224;
  if (p.perks && p.perks.xp_bonus) m *= 1.15;
  return m;
}

// Actual XP earned from killing a monster. Applies xpMult and guarantees
// a minimum of 1 XP per kill so no enemy ever awards 0.
function xpFromKill(p, baseXP){
  return Math.max(1, Math.round(baseXP * xpMult(p)));
}

// INT-based price discount (for buying), tiered by item category.
//   staple   — 1% per INT above 1 (max  9% at INT 10). Commodities.
//   standard — 2% per INT above 1 (max 18% at INT 10). Normal gear.
//   luxury   — 3% per INT above 1 (max 27% at INT 10). High-end/rare.
// When called without a category, defaults to STANDARD for backward compat.
function buyPriceMul(p, category){
  const cat = category || PRICE_CAT.STANDARD;
  const pts = p.int - 1;  // 0 at INT 1
  let ratePerPoint;
  if (cat === PRICE_CAT.STAPLE)   ratePerPoint = 0.01;
  else if (cat === PRICE_CAT.LUXURY) ratePerPoint = 0.03;
  else                              ratePerPoint = 0.02;

  const maxDisc = ratePerPoint * 9;  // cap at INT 10 equivalent
  const disc = Math.min(maxDisc, pts * ratePerPoint);
  return Math.max(1 - maxDisc, 1 - disc);
}
// Inn/room&board pricing: half the discount of staple pricing
function innPriceMul(p){
  const normalDiscount = 1 - buyPriceMul(p, PRICE_CAT.STAPLE);
  const innDiscount = normalDiscount * 0.5;
  return Math.max(0.85, 1.0 - innDiscount);
}
// Sell value: tiered by category, same INT scaling direction as buy.
//   staple   — 25% → 34% at INT 10 (small improvement, commodities)
//   standard — 25% → 43% at INT 10
//   luxury   — 25% → 52% at INT 10 (smart sellers get much more for rare goods)
function sellValueMul(p, category){
  const cat = category || PRICE_CAT.STANDARD;
  const pts = p.int - 1;
  let ratePerPoint;
  if (cat === PRICE_CAT.STAPLE)   ratePerPoint = 0.01;
  else if (cat === PRICE_CAT.LUXURY) ratePerPoint = 0.03;
  else                              ratePerPoint = 0.02;
  return 0.25 + pts * ratePerPoint;
}

// Food FED multiplier — Old Physicians book grants +50%
function foodFedMul(p){ return ((p.perks && p.perks.food_bonus) ? 1.5 : 1.0) * 1.25; }

// Stealth effectiveness — scales linearly with DEX
function stealthBonus(p){
  let b = p.dex*4;
  if (p.perks && p.perks.stealth_bonus) b += 20;
  return b;
}

// Perception check — roll modified by PER. Used for detecting hidden things,
// spotting stealthed enemies, noticing traps, finding secrets.
// Returns a value 0–100; caller compares against a difficulty threshold.
function perceptionCheck(p){
  const roll = Math.floor(rand() * 100) + 1;  // 1–100
  const bonus = p.per * 4;  // PER 1 = +4, PER 10 = +40
  return Math.min(100, roll + bonus);
}

// Vision radius — PER driven base, modified by time of day and layer.
//
// Base (day): PER 1 = 3 tiles, PER 5 = 5 tiles, PER 10 = 7 tiles.
// Dawn/Dusk:  base - 2, minimum 3.
// Night:      hard 1 tile cone depth. PER does not help at night.
// Underground: hard 1 tile cone depth (same as night).
// nightVision: ignores darkness — uses full daytime base at all times.
//
// lightBonus: additive tiles from future light sources (torches, perks, etc.).
//             Applied AFTER phase reduction, before the per-phase minimum.
//             Defaults to 0. NOT applied at night/underground (cone is hard-1).
function baseViewRadius(p){
  return Math.round(3 + (p.per - 1) * (4 / 9));
}

// Awareness radius — the small omnidirectional bubble around the player
// that is always visible regardless of facing direction.
// Always exactly 1 tile (the 8 adjacent squares). You can sense your
// immediate surroundings but you don't have eyes on the back of your head.
// NOT reduced by night or underground.
function awarenessRadius(p){
  return 1;
}

// Shared vision radius for any creature (player or enemy).
// Both playerViewRadius and monsterViewRadius delegate here so the
// PER-to-depth formula lives in exactly one place.
//
// @param {number} per         — creature's PER stat
// @param {number} layer       — current map layer
// @param {object} [opts]
// @param {number} [opts.lightBonus=0]    — additive tiles from light sources
// @param {boolean} [opts.nightVision=false] — immune to darkness reduction
// @returns {number} effective vision depth in tiles
function creatureViewRadius(per, layer, opts) {
  const { lightBonus = 0, nightVision = false } = opts || {};
  const base = Math.round(3 + (per - 1) * (4 / 9));

  // Night-vision creatures ignore darkness entirely
  if (nightVision) return Math.max(2, base + lightBonus);

  // Determine if the current layer is "dark" (underground, lava, etc.)
  // Surface and town/shop interiors use time-based lighting; everything else is dark.
  const meta = LAYER_META[layer];
  const layerType = meta ? meta.type : (layer === LAYER_SURFACE ? 'surface' : 'underground');
  const isDark = layerType !== 'surface' && layerType !== 'town' && layerType !== 'shop';

  if (isDark) {
    // Underground / caves — hard limit: cone depth 1 tile.
    return 1;
  }

  // Surface / town — apply time-of-day scaling.
  const { phase } = getTimePhase(state.worldTick);

  switch (phase) {
    case 'day':
      return Math.max(3, base + lightBonus);

    case 'dawn':
    case 'dusk':
      return Math.max(3, base - 2 + lightBonus);

    case 'night':
      // Night surface — hard limit: cone depth 1 tile.
      return 1;

    default:
      return Math.max(3, base + lightBonus);
  }
}

function playerViewRadius(p, lightBonus){
  return creatureViewRadius(p.per, p.layer, { lightBonus: lightBonus || 0 });
}

// No level cap — INT drives XP gain naturally, so high-INT characters
// simply earn more XP and naturally reach higher levels.
// The XP multiplier is calibrated so this produces ~4 extra levels at INT 10.
function levelCap(p){
  return 99;  // effectively uncapped
}

// Cursed bane (from Pacts book + Kingsbane weapon)
function cursedBaneMul(p, tags){
  let m = 1;
  if (p.perks && p.perks.cursed_bane && tags.includes('cursed')) m *= 1.25;
  return m;
}

// Passive regen (not while resting). Scales linearly with CON.
// CON 1 = every 55 turns, CON 10 = every 5 turns. Each point matters equally.
function passiveRegenInterval(p){
  return Math.round(55 + (p.con - 1) * (5 - 55) / 9);
}

// ==================== POISON RESISTANCE ====================
/*
  Poison resistance scales with CON (75%) and STR (25%).
  CON also provides more poison resistance per level.
  At CON 10, there is a noticeable reduction in:
    - poison damage (both % max HP and flat)
    - chance of being poisoned
    - duration (tends to wear off quicker)
  But poison never stops being dangerous.
*/
function poisonResistance(p){
  const conWeight = 0.75, strWeight = 0.25;
  // Base resistance from stats
  const statResist = (p.con - 1) * conWeight * 3.5 + (p.str - 1) * strWeight * 3.5;
  // Per-level bonus based on CON (CON provides more poison resist per level)
  const levelBonus = (p.level - 1) * (p.con * 0.5);
  const totalResist = statResist + levelBonus;
  return {
    // Damage reduction: 0 to ~0.55 at CON 10 level 10 (never fully immune)
    damageReduction: Math.min(0.70, totalResist * 0.012),
    // Chance reduction: 0 to ~33 at CON 10 level 10
    chanceReduction: Math.min(45, totalResist * 0.7),
    // Duration reduction: 0 to ~2 turns fewer at CON 10 level 10
    durationReduction: Math.min(3, totalResist * 0.06),
  };
}

// Resting heal — random amount weighted by CON.
// CON 1: always 1. CON 5: mostly 1-2, sometimes 3. CON 10: 1-6, avg ~4-5.
function restHealAmount(p){
  if (p.isPlayer && p.fed <= 0) return 0;
  if (p.con <= 1) return 1;
  // Each CON point above 1 gives a 40% chance to add +1 HP (independent rolls)
  let heal = 1;
  for (let i = 1; i < p.con; i++){
    if (rand() < 0.4) heal++;
  }
  return heal;
}

// ==================== ATTRIBUTE PERK DESCRIPTIONS (for UI) ====================
function describeAttributePerks(p){
  const lines = [];
  // STR: HP bonus
  if (p.str > 1){
    lines.push(`STR ${p.str}: +${p.str} starting HP`);
  }
  // STR: blunt AP scales linearly
  if (p.str > 1 && p.weapon && p.weapon.type === DMG.BLUNT){
    const avgAP = ((p.str - 1) * (3 / 9));
    lines.push(`STR ${p.str}: blunt AP ~+${avgAP.toFixed(1)} avg`);
  }
  // CON: rest heals random amount
  if (p.con >= 1){
    const maxHeal = 1 + Math.floor((p.con - 1) * 0.4 * 1.5);
    lines.push(`CON ${p.con}: rest heals 1–${Math.max(1,1+Math.floor((p.con-1)*0.55))} HP (random)`);
  }
  // CON: rest hunger reduction
  if (p.con >= 2){
    const reduction = Math.round(p.con * 5);
    lines.push(`CON ${p.con}: rest hunger -${reduction}%`);
  }
  // CON: passive regen (always active now)
  const iv = passiveRegenInterval(p);
  lines.push(`CON ${p.con}: passive +1 HP / ${iv} turns`);
  // CON: poison resistance
  if (p.con >= 2){
    const pr = poisonResistance(p);
    lines.push(`CON ${p.con}: poison dmg -${Math.round(pr.damageReduction*100)}%`);
  }
  // INT: crit damage contribution
  if (p.int >= 2){
    lines.push(`INT ${p.int}: crit dmg ×${(1.5 + p.str*0.02 + p.int*0.02).toFixed(2)}`);
  }
  if (p.int >= 2){
    const staple = Math.round((1 - buyPriceMul(p, PRICE_CAT.STAPLE)) * 100);
    const standard = Math.round((1 - buyPriceMul(p, PRICE_CAT.STANDARD)) * 100);
    const luxury = Math.round((1 - buyPriceMul(p, PRICE_CAT.LUXURY)) * 100);
    if (luxury > 0) lines.push(`INT ${p.int}: prices -${staple}%/${standard}%/${luxury}% (food/gear/rare)`);
  }
  if (p.int < 2){
    lines.push(`INT 1: speech stunted — folk speak simply`);
  }
  // PER: accuracy
  if (p.per >= 2){
    const accPen = (p.armor.dodgePenalty || 0) / 2;
    const acc = 35 + Math.round(p.per*4) + (p.weapon.acc||0) - accPen;
    lines.push(`PER ${p.per}: accuracy ${acc}%`);
  }
  return lines;
}

// ==================== INVENTORY ====================
// No more stacking. Each item is its own slot. Pickups blocked if slots or weight full.
function addItem(p, item){
  // Default weight if missing
  if (item.weight == null) item.weight = defaultWeight(item);
  if (bagFull(p)) return 'full';
  if (overWeight(p, item.weight)) return 'heavy';
  p.inventory.push(item);
  return 'ok';
}
function defaultWeight(item){
  if (item.kind === 'food') return 1;
  if (item.kind === 'potion') return 1;
  if (item.kind === 'book') return 1;
  if (item.kind === 'weapon'){
    const w = findWeapon(item.key);
    // Blades 2, heavy blunt 4-5, etc.
    if (!w) return 2;
    if (w.type === DMG.BLUNT){
      if (w.atk >= 11) return 5;
      if (w.atk >= 8)  return 4;
      return 3;
    }
    if (w.atk >= 10) return 3;
    if (w.atk >= 5)  return 2;
    return 1;
  }
  if (item.kind === 'armor'){
    const a = findArmor(item.key);
    if (!a) return 2;
    if (a.def >= 10) return 5;
    if (a.def >= 5)  return 4;
    if (a.def >= 2)  return 2;
    return 1;
  }
  return 1;
}

export {
  freshPlayer, deriveHP,
  INV_SLOTS, carryCapacity, totalWeight, bagFull, overWeight,
  playerMelee, effectiveAP, playerDef, playerAcc, playerDodge,
  playerCritChance, playerCritMult, xpMult, xpFromKill, buyPriceMul, innPriceMul, sellValueMul,
  foodFedMul, stealthBonus, levelCap, cursedBaneMul,
  passiveRegenInterval, poisonResistance, restHealAmount,
  describeAttributePerks, addItem, defaultWeight, perceptionCheck, baseViewRadius, playerViewRadius, awarenessRadius, creatureViewRadius,
};

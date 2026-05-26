// ==================== PLAYER ====================
import { DMG, STARTING_GOLD, LAYER_SURFACE, PRICE_CAT, LAYER_META,
         HP_PER_SIZE, HP_PER_LEVEL_FACTOR, STAT_MAX,
         MAX_DODGE_CHANCE, DAMAGE_SIZE_COEFF, DAMAGE_STR_COEFF,
         BASE_ACCURACY, ACC_PER_VISUAL, STEALTH_SIZE_COEFF,
         CREATURE_PATHWAYS, initBodyMap } from './constants.js';
import { getTimePhase } from './time-cycle.js';
import { state } from './state.js';
import { rand, randomRound } from './rng.js';
import { findWeapon, findArmor } from './items.js';

// player object lives in state.js — functions here take player as parameter `p`

function freshPlayer(attrs, bodyType, colorPalette){
  const p = {
    layer: LAYER_SURFACE,
    x:0, y:0,
    returnLayer: LAYER_SURFACE, returnX:0, returnY:0,  // where to go back after town
    bodyType: bodyType || 'meso',  // 'meso' | 'apex' | 'grazer'
    colorPalette: colorPalette || 'meso_predator',  // creature color palette key
    siz: attrs.siz, strength: attrs.strength, chem: attrs.chem, vib: attrs.vib, vis: attrs.vis, central: attrs.central, distributed: attrs.distributed,
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
    bodyMapKey: 'player_' + (bodyType || 'meso'),  // Phase 1: body map lookup key
    pathways: CREATURE_PATHWAYS['player_' + (bodyType || 'meso')] || [],
  };
  // Starter inventory — each item is its own slot, no stacking
  p.inventory.push({kind:'food', key:'apple', weight:1});
  p.inventory.push({kind:'food', key:'apple', weight:1});
  p.inventory.push({kind:'food', key:'bread', weight:1});
  p.hpMax = deriveHP(p);
  p.hp = p.hpMax;
  p.immobilized = false;
  // Initialize per-instance body map with zone HP
  initBodyMap(p);
  return p;
}

// === Derived stats — Size & Strength driven ===
// Max HP: Size * HP_PER_SIZE at level 1, plus per-level growth.
// hpGainPerLevel = Math.ceil(Size * HP_PER_LEVEL_FACTOR).
// A Size 4 player has 40 HP at level 1, gaining 2 HP per level.
function deriveHP(p){
  let hp = p.siz * HP_PER_SIZE;
  const hpPerLevel = Math.ceil(p.siz * HP_PER_LEVEL_FACTOR);
  hp += (p.level - 1) * hpPerLevel;
  if (p.perks && p.perks.hp_bonus) hp += 8;
  return hp;
}


// Fixed 10-slot inventory grid. Weight governs carry limit.
const INV_SLOTS = 10;
function carryCapacity(p){ return 4 + Math.floor(p.strength * 0.2); }  // Strength 10 = 6, Strength 100 = 24
function totalWeight(p){ return p.inventory.reduce((s,it) => s + (it.weight||1), 0); }
function bagFull(p){ return p.inventory.length >= INV_SLOTS; }
function overWeight(p, extra=0){ return (totalWeight(p)+extra) > carryCapacity(p); }

// Melee dmg: baseDamage = floor(Size * DAMAGE_SIZE_COEFF) + floor(Strength * DAMAGE_STR_COEFF), plus weapon + level bonus
function playerMelee(p){
  let base = Math.floor(p.siz * DAMAGE_SIZE_COEFF) + Math.floor(p.strength * DAMAGE_STR_COEFF) + (p.weapon.atk || 0) + Math.floor((p.level-1)*0.5);
  if (p.perks && p.perks.blade_bonus && p.weapon.type === DMG.BLADE) base += 1;
  if (p.perks && p.perks.blunt_bonus && p.weapon.type === DMG.BLUNT) base += 1;
  return base;
}

// Armor pen for blunt weapons — scales linearly with Strength via probabilistic rounding
function effectiveAP(p){
  let ap = p.weapon.ap || 0;
  if (p.weapon.type === DMG.BLUNT){
    // Strength 10 = +0, Strength 100 = +3, smooth probabilistic transition
    const scale = (p.strength / 10 - 1) * (3 / 9);
    ap += randomRound(scale);
  }
  return ap;
}

function playerDef(p){ return p.armor.def; }

// Accuracy: BASE_ACCURACY + floor(Visual * ACC_PER_VISUAL)
// Armor accPenalty = dodgePenalty / 2, applied as flat subtraction.
function playerAcc(p){
  const accPen = (p.armor.dodgePenalty || 0) / 2;
  return BASE_ACCURACY + Math.floor(p.vis * ACC_PER_VISUAL) + (p.weapon.acc||0) - accPen;
}
// Dodge: floor(((STAT_MAX+1-Size)/STAT_MAX)*MAX_DODGE_CHANCE), minus armor dodgePenalty (flat subtraction, floor 0).
// Smaller creatures dodge more effectively.
function playerDodge(p){
  const raw = Math.floor(((STAT_MAX + 1 - p.siz) / STAT_MAX) * MAX_DODGE_CHANCE);
  return Math.max(0, raw - (p.armor.dodgePenalty || 0));
}
// Crit: scales linearly with Size (temporary shim). Always enabled (no gate).
function playerCritChance(p){
  const raw = (p.siz / 10 - 1) * 4.5;  // Size 10=0%, Size 100=40.5%
  return Math.min(60, raw) + (p.weapon.crit||0);
}
function playerCritMult(p){ return 1.5 + p.strength*0.002 + p.central*0.002; }

// XP multiplier — Central driven
// Calibrated so that killing ALL enemies in the game yields:
//   Central 1 → approximately level 8
//   Central 10 → approximately level 12
// Scaled ×1.333 to compensate for 25% reduced spawn density (1/50 → 1/67).
function xpMult(p){
  let m = 0.0573 + (p.central / 10 - 1) * 0.0224;
  if (p.perks && p.perks.xp_bonus) m *= 1.15;
  return m;
}

// Actual XP earned from killing a monster. Applies xpMult and guarantees
// a minimum of 1 XP per kill so no enemy ever awards 0.
function xpFromKill(p, baseXP){
  return Math.max(1, Math.round(baseXP * xpMult(p)));
}

// Central-based price discount (for buying), tiered by item category.
//   staple   — 1% per Central above 1 (max  9% at Central 10). Commodities.
//   standard — 2% per Central above 1 (max 18% at Central 10). Normal gear.
//   luxury   — 3% per Central above 1 (max 27% at Central 10). High-end/rare.
// When called without a category, defaults to STANDARD for backward compat.
function buyPriceMul(p, category){
  const cat = category || PRICE_CAT.STANDARD;
  const pts = Math.max(0, p.central / 10 - 1);  // 0 at Central 10, 9 at Central 100
  let ratePerPoint;
  if (cat === PRICE_CAT.STAPLE)   ratePerPoint = 0.01;
  else if (cat === PRICE_CAT.LUXURY) ratePerPoint = 0.03;
  else                              ratePerPoint = 0.02;

  const maxDisc = ratePerPoint * 9;  // cap at Central 10 equivalent
  const disc = Math.min(maxDisc, pts * ratePerPoint);
  return Math.max(1 - maxDisc, 1 - disc);
}
// Inn/room&board pricing: half the discount of staple pricing
function innPriceMul(p){
  const normalDiscount = 1 - buyPriceMul(p, PRICE_CAT.STAPLE);
  const innDiscount = normalDiscount * 0.5;
  return Math.max(0.85, 1.0 - innDiscount);
}
// Sell value: tiered by category, same Central scaling direction as buy.
//   staple   — 25% → 34% at Central 10 (small improvement, commodities)
//   standard — 25% → 43% at Central 10
//   luxury   — 25% → 52% at Central 10 (smart sellers get much more for rare goods)
function sellValueMul(p, category){
  const cat = category || PRICE_CAT.STANDARD;
  const pts = Math.max(0, p.central / 10 - 1);
  let ratePerPoint;
  if (cat === PRICE_CAT.STAPLE)   ratePerPoint = 0.01;
  else if (cat === PRICE_CAT.LUXURY) ratePerPoint = 0.03;
  else                              ratePerPoint = 0.02;
  return 0.25 + pts * ratePerPoint;
}

// Food FED multiplier — Old Physicians book grants +50%
function foodFedMul(p){ return ((p.perks && p.perks.food_bonus) ? 1.5 : 1.0) * 1.25; }

// Stealth effectiveness — smaller creatures hide better
// floor((STAT_MAX + 1 - Size) * STEALTH_SIZE_COEFF)
function stealthBonus(p){
  let b = Math.floor((STAT_MAX + 1 - p.siz) * STEALTH_SIZE_COEFF);
  if (p.perks && p.perks.stealth_bonus) b += 20;
  return Math.max(0, b);
}

// Perception check — roll modified by Visual. Used for detecting hidden things,
// spotting stealthed enemies, noticing traps, finding secrets.
// Returns a value 0–100; caller compares against a difficulty threshold.
function perceptionCheck(p){
  const roll = Math.floor(rand() * 100) + 1;  // 1–100
  const bonus = Math.floor(p.vis * 0.4);  // Visual 10 = +4, Visual 100 = +40
  return Math.min(100, roll + bonus);
}

// Vision radius — Visual driven base, modified by time of day and layer.
//
// Base (day): Visual 1 = 3 tiles, Visual 5 = 5 tiles, Visual 10 = 7 tiles.
// Dawn/Dusk:  base - 2, minimum 3.
// Night:      hard 1 tile cone depth. Visual does not help at night.
// Underground: hard 1 tile cone depth (same as night).
// nightVision: ignores darkness — uses full daytime base at all times.
//
// lightBonus: additive tiles from future light sources (torches, perks, etc.).
//             Applied AFTER phase reduction, before the per-phase minimum.
//             Defaults to 0. NOT applied at night/underground (cone is hard-1).
function baseViewRadius(p){
  return Math.round(3 + (p.vis - 1) * (4 / 99));
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
// Visual-to-depth formula lives in exactly one place.
//
// @param {number} vis         — creature's Visual stat
// @param {number} layer       — current map layer
// @param {object} [opts]
// @param {number} [opts.lightBonus=0]    — additive tiles from light sources
// @param {boolean} [opts.nightVision=false] — immune to darkness reduction
// @returns {number} effective vision depth in tiles
function creatureViewRadius(vis, layer, opts) {
  const { lightBonus = 0, nightVision = false } = opts || {};
  const base = Math.round(3 + (vis - 1) * (4 / 99));

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
  return creatureViewRadius(p.vis, p.layer, { lightBonus: lightBonus || 0 });
}

// No level cap — Central drives XP gain naturally, so high-Central characters
// simply earn more XP and naturally reach higher levels.
// The XP multiplier is calibrated so this produces ~4 extra levels at Central 10.
function levelCap(p){
  return 99;  // effectively uncapped
}

// Cursed bane (from Pacts book + Kingsbane weapon)
function cursedBaneMul(p, tags){
  let m = 1;
  if (p.perks && p.perks.cursed_bane && tags.includes('cursed')) m *= 1.25;
  return m;
}

// Passive regen (not while resting). Scales linearly with Size.
// Size 1 = every 55 turns, Size 100 = every 5 turns. Each point matters equally.
function passiveRegenInterval(p){
  return Math.round(55 + (p.siz - 1) * (5 - 55) / 99);
}

// ==================== POISON RESISTANCE ====================
/*
  Poison resistance scales with Size (75%) and Strength (25%).
  Size also provides more poison resistance per level.
  At Size 10, there is a noticeable reduction in:
    - poison damage (both % max HP and flat)
    - chance of being poisoned
    - duration (tends to wear off quicker)
  But poison never stops being dangerous.
*/
function poisonResistance(p){
  const sizWeight = 0.75, strWeight = 0.25;
  // Base resistance from stats (scaled for 1-100 stat range)
  const statResist = (p.siz / 10 - 1) * sizWeight * 3.5 + (p.strength / 10 - 1) * strWeight * 3.5;
  // Per-level bonus based on Size (Size provides more poison resist per level)
  const levelBonus = (p.level - 1) * (p.siz * 0.05);
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

// Resting heal — random amount weighted by Size.
// Size 1: always 1. Size 5: mostly 1-2, sometimes 3. Size 10: 1-6, avg ~4-5.
function restHealAmount(p){
  if (p.isPlayer && p.fed <= 0) return 0;
  const effSiz = Math.max(1, Math.round(p.siz / 10));
  if (effSiz <= 1) return 1;
  // Each effective Size point above 1 gives a 40% chance to add +1 HP (independent rolls)
  let heal = 1;
  for (let i = 1; i < effSiz; i++){
    if (rand() < 0.4) heal++;
  }
  return heal;
}

// ==================== ATTRIBUTE PERK DESCRIPTIONS (for UI) ====================
function describeAttributePerks(p){
  const lines = [];
  // Size: HP
  lines.push(`Size ${p.siz}: ${p.siz * HP_PER_SIZE} base HP, +${Math.ceil(p.siz * HP_PER_LEVEL_FACTOR)} HP/level`);
  // Size: base damage contribution
  lines.push(`Size ${p.siz}: base melee +${Math.floor(p.siz * DAMAGE_SIZE_COEFF)}`);
  // Size: dodge
  lines.push(`Size ${p.siz}: dodge ${Math.floor(((STAT_MAX + 1 - p.siz) / STAT_MAX) * MAX_DODGE_CHANCE)}%`);
  // Size: stealth
  lines.push(`Size ${p.siz}: stealth ${Math.floor((STAT_MAX + 1 - p.siz) * STEALTH_SIZE_COEFF)}%`);
  // Size: rest heals random amount
  const effSiz = Math.max(1, Math.round(p.siz / 10));
  if (effSiz >= 1){
    lines.push(`Size ${p.siz}: rest heals 1–${Math.max(1,1+Math.floor((effSiz-1)*0.55))} HP (random)`);
  }
  // Size: rest hunger reduction
  if (p.siz >= 20){
    const reduction = Math.round(p.siz * 0.5);
    lines.push(`Size ${p.siz}: rest hunger -${reduction}%`);
  }
  // Size: passive regen (always active now)
  const iv = passiveRegenInterval(p);
  lines.push(`Size ${p.siz}: passive +1 HP / ${iv} turns`);
  // Size: poison resistance
  if (p.siz >= 20){
    const pr = poisonResistance(p);
    lines.push(`Size ${p.siz}: poison dmg -${Math.round(pr.damageReduction*100)}%`);
  }
  // Strength: melee damage contribution
  if (p.strength > 0){
    lines.push(`Strength ${p.strength}: melee +${Math.floor(p.strength * DAMAGE_STR_COEFF)}`);
  }
  // Strength: blunt AP scales linearly
  if (p.strength > 10 && p.weapon && p.weapon.type === DMG.BLUNT){
    const avgAP = ((p.strength / 10 - 1) * (3 / 9));
    lines.push(`Strength ${p.strength}: blunt AP ~+${avgAP.toFixed(1)} avg`);
  }
  // Central: crit damage contribution
  if (p.central >= 20){
    lines.push(`Central ${p.central}: crit dmg ×${(1.5 + p.strength*0.002 + p.central*0.002).toFixed(2)}`);
  }
  if (p.central >= 20){
    const staple = Math.round((1 - buyPriceMul(p, PRICE_CAT.STAPLE)) * 100);
    const standard = Math.round((1 - buyPriceMul(p, PRICE_CAT.STANDARD)) * 100);
    const luxury = Math.round((1 - buyPriceMul(p, PRICE_CAT.LUXURY)) * 100);
    if (luxury > 0) lines.push(`Central ${p.central}: prices -${staple}%/${standard}%/${luxury}% (food/gear/rare)`);
  }
  if (p.central < 20){
    lines.push(`Central ${p.central}: speech stunted — folk speak simply`);
  }
  // Visual: accuracy
  if (p.vis >= 1){
    const accPen = (p.armor.dodgePenalty || 0) / 2;
    const acc = BASE_ACCURACY + Math.floor(p.vis * ACC_PER_VISUAL) + (p.weapon.acc||0) - accPen;
    lines.push(`Visual ${p.vis}: accuracy ${acc}%`);
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
  if (item.kind === 'corpse') return item.weight || 2;
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

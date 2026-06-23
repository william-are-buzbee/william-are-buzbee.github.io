// ==================== COMBAT CONSTANTS ====================
// Damage formulas, damage types, tag-based resistance, and blood system constants.
// Split from constants.js — self-contained, no imports from project modules.

// ==================== PHYSICS-BASED DAMAGE ====================
// Strike damage derives entirely from the attacking zone's tissue composition.
// Muscle generates force, mass adds momentum, structural fraction sets transfer efficiency.
export const MUSCLE_FORCE_COEFF = 4.0;    // base damage per kg of effective muscle
export const MOMENTUM_COEFF    = 0.15;    // damage bonus per kg of effective mass
export const BASE_TRANSFER     = 0.6;     // minimum force transfer (soft tissue)
export const HARDNESS_BONUS    = 1.5;     // additional transfer per point of structural fraction

// Compute physics-based strike damage from the attacking zone's tissue.
// Called once per attack — the result enters the footprint distribution pipeline.
// attacker: the creature (for bleedPenalty)
// atkZone: the zone object performing the strike (from the attacker's body map)
// Returns integer damage.
export function computeStrikeDamage(attacker, atkZone) {
  if (!atkZone) return 1;

  const hpFrac = (atkZone.maxHp > 0) ? (atkZone.hp / atkZone.maxHp) : 1;

  const effMuscle = (atkZone.muscle || 0) * hpFrac;
  const effMass   = (atkZone.mass   || 0) * hpFrac;
  const structFrac = (atkZone.mass > 0) ? ((atkZone.structural || 0) / atkZone.mass) : 0;

  let damage = effMuscle * MUSCLE_FORCE_COEFF
             * (1 + effMass * MOMENTUM_COEFF)
             * (BASE_TRANSFER + structFrac * HARDNESS_BONUS);

  // Blood loss penalty — less oxygen to muscles, less force output
  damage *= (1 - (attacker.bleedPenalty || 0));

  return Math.max(1, Math.round(damage));
}

// ==================== DAMAGE TYPES ====================
export const DMG = {
  BLADE:'blade', BLUNT:'blunt', FIRE:'fire', COLD:'cold', ELEC:'electric', POISON:'poison'
};

export const TAG_RESIST = {
  flesh:    {blade:1.2, blunt:0.9, fire:1.1, cold:1.0, electric:1.0, poison:1.2},
  bone:     {blade:0.35,blunt:1.7, fire:1.0, cold:0,   electric:0.9, poison:0},
  armored:  {blade:0.4, blunt:1.6, fire:0.8, cold:0.8, electric:1.1, poison:0.6},
  plant:    {blade:1.1, blunt:0.8, fire:2.0, cold:0.7, electric:1.1, poison:0.5},
  insect:   {blade:0.85,blunt:1.4, fire:1.4, cold:1.2, electric:1.1, poison:0.8},
  undead:   {blade:0.9, blunt:1.1, fire:1.3, cold:0,   electric:1.0, poison:0},
  fire:     {blade:1.0, blunt:1.0, fire:0,   cold:1.9, electric:1.2, poison:0},
  ice:      {blade:1.0, blunt:1.1, fire:1.9, cold:0,   electric:1.0, poison:0},
  aquatic:  {blade:1.0, blunt:1.0, fire:0.8, cold:1.0, electric:2.0, poison:1.0},
  stone:    {blade:0.3, blunt:1.6, fire:0.8, cold:1.0, electric:0.7, poison:0},
  cursed:   {blade:0.75,blunt:0.85,fire:1.5, cold:0,   electric:1.2, poison:0},
  beast:    {blade:1.1, blunt:1.0, fire:1.2, cold:1.0, electric:1.2, poison:1.1},
  scaled:   {blade:0.5, blunt:1.3, fire:1.0, cold:1.0, electric:1.0, poison:0.8},
  shelled:  {blade:0.4, blunt:1.5, fire:0.9, cold:0.9, electric:1.0, poison:0.7},
  fungal:   {blade:1.0, blunt:1.2, fire:1.5, cold:0.8, electric:1.0, poison:0},
  rockite:  {blade:0,   blunt:2.0, fire:0,   cold:0,   electric:0.8, poison:0},
};

export function resistMult(tags, dmgType){
  let m = 1;
  for (const t of tags){
    const r = TAG_RESIST[t];
    if (r && r[dmgType] != null){
      if (r[dmgType] === 0) return 0;
      m *= r[dmgType];
    }
  }
  return m;
}

// ==================== BLOOD SYSTEM CONSTANTS ====================
export const BLOOD_FRACTION         = 0.07;   // blood volume as fraction of total mass
export const SEEP_COEFF             = 0.02;   // bleed rate multiplier per kg connective tissue
export const BURST_COEFF            = 0.03;   // burst multiplier per bandwidth point severed
export const CLOT_RATE              = 0.05;   // clotting progress per turn (1.0 = fully clotted)
export const REGEN_FRACTION         = 0.002;  // blood regeneration per turn as fraction of max
export const BLOOD_DEATH_THRESHOLD  = 0.10;   // die at 10% blood remaining
export const BLOOD_WEAKENED_THRESHOLD = 0.50; // speed/damage penalty begins
export const BLOOD_CRITICAL_THRESHOLD = 0.25; // severe penalty, AI flee trigger

// Compute the bleed penalty multiplier from current blood level.
// Returns 0, 0.10, 0.25, or 0.45 — applied as (1 - penalty) to speed and damage.
export function computeBleedPenalty(entity) {
  if (!entity.bloodMax || entity.bloodMax <= 0) return 0;
  const ratio = entity.blood / entity.bloodMax;
  if (ratio > 0.75) return 0;
  if (ratio > 0.50) return 0.10;
  if (ratio > 0.25) return 0.25;
  return 0.45;
}

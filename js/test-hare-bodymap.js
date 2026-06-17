// ============================================================
// Hare Body Map Data Validation
// Run: node test-hare-bodymap.js
// Tests structural correctness of fiber ratio, substrate, and
// neural architecture data.  Nothing behavioral — just data
// integrity checks against the invariants in the design prompt.
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

function approx(a, b, tolerance = 0.001) {
  return Math.abs(a - b) < tolerance;
}

async function run() {
  const m = await import('./constants.js');
  const hare = m.BODY_MAPS.hare;
  const neural = m.CREATURE_NEURAL.hare;
  const SPK = m.SUBSTRATE_PER_KG_MUSCLE;

  // ── 1. Constant exists ──
  section('SUBSTRATE_PER_KG_MUSCLE');
  assert(SPK === 5.0, `value is 5.0 (got ${SPK})`);

  // ── 2. Every hare zone has fiberRatio + substrate ──
  section('Per-zone fields present');
  for (const z of hare) {
    assert(typeof z.fiberRatio === 'number', `${z.key} has fiberRatio`);
    assert(z.fiberRatio >= 0 && z.fiberRatio <= 1, `${z.key} fiberRatio in [0,1] (${z.fiberRatio})`);
    if (z.muscle > 0) {
      assert(typeof z.substrate === 'number', `${z.key} has substrate`);
      assert(typeof z.substrateMax === 'number', `${z.key} has substrateMax`);
    }
  }

  // ── 3. Substrate = muscle × constant ──
  section('Substrate derivation');
  for (const z of hare) {
    if (z.muscle > 0) {
      const expected = z.muscle * SPK;
      assert(approx(z.substrateMax, expected),
        `${z.key} substrateMax = ${z.substrateMax} (expected ${expected.toFixed(2)})`);
      assert(z.substrate === z.substrateMax,
        `${z.key} substrate starts full`);
    }
  }

  // ── 4. Fiber ratios match prompt spec ──
  section('Fiber ratio values');
  const expectedFR = {
    head: 0.15, torso: 0.40,
    fore_l: 0.10, fore_r: 0.10,
    mid_graze_l: 0.15, mid_graze_r: 0.15,
    mid_loco_l: 0.70, mid_loco_r: 0.70,
    rear_l: 0.80, rear_r: 0.80,
  };
  for (const z of hare) {
    assert(z.fiberRatio === expectedFR[z.key],
      `${z.key} fiberRatio = ${z.fiberRatio} (expected ${expectedFR[z.key]})`);
  }

  // ── 5. Locomotion power budget ──
  section('Locomotion power budget');
  const locoZones = hare.filter(z => z.locomotion);
  assert(locoZones.length === 4, `4 locomotion zones (got ${locoZones.length})`);

  const totalFast = locoZones.reduce((s, z) => s + z.muscle * z.fiberRatio, 0);
  const totalSlow = locoZones.reduce((s, z) => s + z.muscle * (1 - z.fiberRatio), 0);
  const totalLocoSub = locoZones.reduce((s, z) => s + z.substrate, 0);
  console.log(`    fast-contracting loco muscle: ${totalFast.toFixed(3)} kg`);
  console.log(`    slow-contracting loco muscle: ${totalSlow.toFixed(3)} kg`);
  console.log(`    total loco substrate pool:    ${totalLocoSub.toFixed(2)}`);
  console.log(`    power at full substrate:      ${(totalFast + totalSlow * 0.65).toFixed(2)} (open-circ)`);
  console.log(`    power at empty substrate:     ${(totalSlow * 0.65).toFixed(2)}`);
  const cliff = (totalFast + totalSlow * 0.65) / (totalSlow * 0.65);
  console.log(`    power cliff ratio:            ${cliff.toFixed(1)}×`);
  assert(totalFast > 1.5, `fast-contracting mass > 1.5kg (${totalFast.toFixed(3)})`);
  assert(cliff > 4.0, `power cliff > 4× (${cliff.toFixed(1)})`);

  // ── 6. Sensory zones have LOW fiber ratio ──
  section('Sensory-zone fiber ratio sanity');
  for (const key of ['fore_l', 'fore_r']) {
    const z = hare.find(z => z.key === key);
    assert(z.fiberRatio <= 0.15, `${key} (primary sensor) has low fiberRatio (${z.fiberRatio})`);
  }

  // ── 7. No fiberRatio/substrate on OTHER creatures ──
  section('Other creatures uncontaminated');
  for (const ck of ['wolf', 'dire_wolf', 'cave_crab', 'mushroom', 'ambush_pred']) {
    const bm = m.BODY_MAPS[ck];
    if (!bm) continue;
    const hasNew = bm.some(z => z.fiberRatio !== undefined || z.substrate !== undefined);
    assert(!hasNew, `${ck} has no fiberRatio/substrate`);
  }

  // ── 8. CREATURE_NEURAL structure ──
  section('Neural architecture structure');
  assert(neural != null, 'CREATURE_NEURAL.hare exists');
  assert(neural.totalNeuralMass === 0.08, `totalNeuralMass = 0.08 (got ${neural.totalNeuralMass})`);
  assert(Array.isArray(neural.structures), 'structures is array');
  assert(neural.structures.length === 8, `8 structures (got ${neural.structures.length})`);

  const byId = {};
  for (const s of neural.structures) byId[s.id] = s;

  // Required structures exist
  const requiredIds = [
    'fore_ganglion_l', 'fore_ganglion_r', 'central_loco',
    'threat_classification', 'food_identification',
    'graze_ganglion_l', 'graze_ganglion_r', 'integration_workspace'
  ];
  for (const id of requiredIds) {
    assert(byId[id] != null, `structure '${id}' exists`);
  }

  // ── 9. Neural connectivity invariants ──
  section('Neural connectivity');
  // Central loco receives from both fore ganglia
  const cl = byId.central_loco;
  assert(cl.receivesFrom.includes('fore_ganglion_l'), 'central_loco receives from fore_ganglion_l');
  assert(cl.receivesFrom.includes('fore_ganglion_r'), 'central_loco receives from fore_ganglion_r');
  assert(cl.receivesFrom.includes('threat_classification'), 'central_loco receives from threat_classification');
  assert(cl.receivesFrom.includes('food_identification'), 'central_loco receives from food_identification');

  // Central loco outputs to all 4 locomotion zones
  for (const zk of ['mid_loco_l', 'mid_loco_r', 'rear_l', 'rear_r']) {
    assert(cl.motorOutputs.includes(zk), `central_loco drives ${zk}`);
  }

  // Fore ganglia forward to threat classification
  assert(byId.fore_ganglion_l.forwardsTo.includes('threat_classification'), 'fore_l forwards to threat');
  assert(byId.fore_ganglion_r.forwardsTo.includes('threat_classification'), 'fore_r forwards to threat');

  // Fore ganglia have bolt reflex to central_loco
  const fgL = byId.fore_ganglion_l;
  assert(fgL.reflexArcs.some(r => r.output === 'central_loco' && r.intensity === 'max'),
    'fore_ganglion_l has bolt reflex arc');

  // Threat classification can suppress fore ganglion reflexes
  const tc = byId.threat_classification;
  assert(tc.canSuppress.includes('fore_ganglion_l.reflexArcs'), 'threat can suppress fore_l bolt');
  assert(tc.canSuppress.includes('fore_ganglion_r.reflexArcs'), 'threat can suppress fore_r bolt');

  // Food identification is visual-only (no vibration, no chemical)
  const fi = byId.food_identification;
  assert(fi.sensoryInputs.length === 1 && fi.sensoryInputs[0] === 'head.visual',
    'food_identification receives head.visual only');

  // Integration workspace can modulate central loco intensity
  const iw = byId.integration_workspace;
  assert(iw.canModulate.includes('central_loco.intensity'), 'integration can modulate loco intensity');
  assert(iw.receivesFrom.includes('threat_classification'), 'integration receives from threat');
  assert(iw.receivesFrom.includes('food_identification'), 'integration receives from food');

  // Graze ganglia are local-only (output targets own zone, not locomotion)
  const gl = byId.graze_ganglion_l;
  assert(gl.reflexArcs[0].output === 'mid_graze_l', 'graze_l reflex output is local');
  assert(gl.reflexArcs[0].intensity === 'low_sustained', 'graze_l reflex is low_sustained');

  // ── 10. initBodyMap propagation ──
  section('initBodyMap propagation');
  const fakeHare = { key: 'hare' };
  const bm = m.initBodyMap(fakeHare);
  for (const z of bm) {
    assert(typeof z.fiberRatio === 'number', `instance ${z.key} has fiberRatio`);
    if (z.muscle > 0) {
      assert(typeof z.substrate === 'number', `instance ${z.key} has substrate`);
      assert(z.substrate === z.substrateMax, `instance ${z.key} substrate is full`);
    }
    // Verify HP was also initialized (existing system still works)
    assert(z.maxHp > 0, `instance ${z.key} has HP (${z.maxHp})`);
  }

  // ── 11. getNeuralArchitecture helper ──
  section('getNeuralArchitecture helper');
  const na = m.getNeuralArchitecture({ key: 'hare' });
  assert(na != null, 'returns architecture for hare');
  assert(na.structures.length === 8, 'returns correct structure count');

  const naWolf = m.getNeuralArchitecture({ key: 'wolf' });
  assert(naWolf == null, 'returns null for wolf (no neural architecture yet)');

  const naNone = m.getNeuralArchitecture({});
  assert(naNone == null, 'returns null for empty entity');

  // ── 12. Existing pathways still intact ──
  section('Existing systems undamaged');
  assert(m.CREATURE_PATHWAYS.hare.length === 19, `hare pathways: 19 (got ${m.CREATURE_PATHWAYS.hare.length})`);
  assert(m.CREATURE_PATHWAYS.wolf.length === 7, `wolf pathways: 7`);
  assert(m.CREATURE_PATHWAYS.cave_crab.length === 7, `cave_crab pathways: 7`);
  assert(typeof m.computeStrikeDamage === 'function', 'computeStrikeDamage exists');
  assert(typeof m.selectHitZone === 'function', 'selectHitZone exists');
  assert(typeof m.getPathways === 'function', 'getPathways exists');

  // ── Summary ──
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });

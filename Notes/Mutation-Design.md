# Mutation System Design

System design for the player mutation mechanic. The player changes over time based on what they consume. Mutations physically modify the player's body map — growing neural tissue in new zones, developing sensory organs that shouldn't exist on a Clade A body, redistributing mass between tissue types. This document covers the data pipeline, accumulation logic, mutation catalog, and how mutations surface to the player.

Include alongside Body-Sim-Design.md, Stat-System-Design.md, Ecology-Foundations.md, and the relevant code files when implementing.

---

## Core Loop

1. Player kills a creature.
2. Creature drops a corpse with a `source` field (creature type key).
3. Player eats the corpse (for HP, the primary motivation).
4. Behind the scenes, the system tracks what was eaten.
5. When enough of a type (or clade) has been consumed, a mutation triggers.
6. The player's body map is physically modified — tissue grows, organs develop, mass redistributes.
7. The combat log describes what happened in physical terms.

The player is eating for nutrition. The mutations are a side effect they discover. There is no "mutation menu" or "choose your upgrade." It happens to you based on what you've been doing.

---

## Consumption Tracking

### Data Structure

Add to player state:

```js
player.consumptionLog = {
  // Per-creature-type counters
  byType: {
    'meso_predator': 3,
    'small_herbivore': 7,
    // ...
  },
  // Per-clade counters (derived from byType using creature clade data)
  byClade: {
    'A': 10,
    'B': 4,
  },
  // Total consumed
  total: 14,
}
```

**Updated on every eat action.** When the player consumes a corpse:
- Increment `byType[source]` by 1.
- Look up the creature's clade from the clade data system.
- Increment `byClade[cladeId]` by 1.
- Increment `total` by 1.

This data persists in the save system.

### Why Track Both Type and Clade

Type-specific tracking drives specific mutations: "you've eaten five meso-predators, your chemoreceptors grow denser." Clade-level tracking drives broader architectural shifts: "you've consumed heavily from Clade B organisms, neural tissue is developing in your limbs." Both are useful at different scales.

---

## Mutation Triggers

A mutation fires when a consumption counter crosses a threshold. Two kinds of thresholds:

### Type Thresholds

Eating enough of one specific creature type triggers a mutation associated with that creature's body. The thresholds increase — the first mutation comes quickly, subsequent ones require more.

```js
TYPE_THRESHOLDS = [3, 8, 15, 25, 40]
```

Eating 3 meso-predators triggers the first meso-predator mutation. Eating 8 total triggers the second. Each creature type has its own counter and progression.

### Clade Thresholds

Eating enough of either clade triggers broader architectural mutations. Rarer and more significant.

```js
CLADE_THRESHOLDS = [10, 25, 50, 80]
```

Eating 10 total Clade A creatures triggers the first Clade A clade mutation. These thresholds are higher because clade mutations are more impactful — they shift the fundamental architecture of the body.

### Threshold Checking

After every eat action, check:
1. Did `byType[source]` just cross a TYPE_THRESHOLD? If yes, fire a type mutation for that creature.
2. Did `byClade[cladeId]` just cross a CLADE_THRESHOLD? If yes, fire a clade mutation.
3. Both can trigger on the same eat (rare but possible).

---

## How Mutations Modify the Body Map

Mutations are not "+1 to a stat." They are specific physical changes to specific zones on the player's body map. Each mutation definition specifies exactly what tissue grows, where, and how much.

### Mutation Definition Structure

```js
{
  key: 'chemical_sensing_1',
  name: 'Sharpened Scent',
  source: 'meso_predator',          // creature type that triggers this (null for clade mutations)
  clade: 'A',                        // clade association
  tier: 1,                           // which threshold tier
  
  // Physical changes to the body map
  bodyChanges: [
    { zone: 'head', tissue: 'sensory', delta: +0.03 },     // chemoreceptor organs grow
    { zone: 'head', tissue: 'neural', delta: +0.02 },      // chemical processing tissue grows
    { zone: 'head', neuralAlloc: 'chemicalProcessing', delta: +0.02 },  // processing allocated to chemical
    { zone: 'head', transducer: 'chemical', delta: +1 },   // transducer quality increases
  ],

  logMessage: 'Something shifts behind your nostrils. The air carries more than it used to.',
  mechanicalNote: 'Chemical sense improved.',               // brief mechanical summary
}
```

Each mutation specifies:
- **Which zones** are affected
- **Which tissue type** changes (muscle, structural, neural, sensory, connective)
- **How much** mass is added (in kg)
- **Neural allocation changes** (if neural tissue grows, what function it's allocated to)
- **Transducer quality changes** (if sensory organs develop or improve)

The body map is updated directly. All derived values (total mass, effective senses, centralization score, speed, etc.) recompute automatically from the changed body map.

### Mass Budget

Mutations add mass. The player gets physically heavier as they mutate. Eating three meso-predators and gaining chemoreceptor tissue adds a few grams to the head zone. Over many mutations, total mass increases meaningfully — a heavily mutated late-game player might weigh 30+ kg versus the starting 24 kg. This has real consequences: dodge decreases (bigger target), food cost increases, stealth gets harder. Mutations are not free upgrades — they change the body and the tradeoffs change with it.

Some mutations may redistribute mass rather than add it. A clade mutation that shifts neural tissue from the head to the limbs doesn't add total mass — it moves existing tissue, changing the centralization score without changing total weight.

---

## Mutation Catalog — Type Mutations

Each creature type pushes the player's body toward that creature's physical profile. The direction of change is determined by what makes the consumed creature distinctive.

### Clade A Creature Types

**Meso-predator mutations:** Eating the common predator develops the player's chemical sensing apparatus and head-concentrated neural tissue. Each tier grows chemoreceptor transducers in the head zone, adds chemical processing neural mass to the head ganglion, and may add small amounts of muscle to the jaw zone (the player's bite, if they develop one, would emerge from accumulated meso-predator consumption).

Direction: head zone gains sensory and neural mass. Chemical sense improves. Centralization reinforced.

**Apex predator mutations:** Eating the large predator pushes toward mass accumulation and enhanced chemical range. Each tier adds muscle mass across zones (the player's body bulks up from consuming large-bodied tissue), adds deeper chemical processing to the head, and may improve visual processing (the apex predator has better eyes than the meso-predator).

Direction: total mass increases. Chemical and visual improve. Centralization reinforced. The player gets bigger and more perceptive but heavier and slower.

**Large herbivore mutations:** Eating the amphibious grazer pushes toward mass and spatial memory. Each tier adds structural mass (thicker integument, denser connective tissue), grows the head's episodic memory allocation (spatial mapping of large territories), and may enhance chemical sensitivity for evaluating flora quality (the herbivore's foraging sense).

Direction: total mass increases significantly. Structural mass increases (tougher). Head neural mass grows in spatial/memory allocation. The player becomes tankier.

### Clade B Creature Types — Cross-Clade Mutations

These are where the lore lives. Eating Clade B tissue introduces physical structures that a native Clade A body cannot develop.

**Small herbivore mutations:** Eating the small grazer develops mechanoreceptors on the player's limb surfaces and grows neural tissue in limb zones to process them. The first cross-clade hint. Early tiers add small amounts of sensory tissue (mechanoreceptors) to front limb zones and small amounts of neural tissue allocated to vibration processing. The player's limbs begin detecting ground vibration — something their Clade A body has no evolutionary basis for.

Direction: limb zones gain sensory and neural mass. Vibration sense emerges from zero. Limb ganglia begin developing. Centralization score decreases slightly as neural mass redistributes.

Log messages describe physical sensations: "The skin on your forelimbs prickles. You feel the ground hum." The player's body is growing organs it shouldn't have.

**Colonial chemotroph mutations:** Eating colonial tissue develops distributed neural architecture most directly. Each tier grows neural mass in multiple limb zones simultaneously, develops vibration processing across the body surface (the chemotroph's communication system), and adds small amounts of connective tissue (enzymatic resistance). Higher tiers may begin developing the inter-zone chemical signaling capacity that colonies use — the player's ganglia start producing signals that mirror Clade B inter-organism communication chemistry.

Direction: neural mass grows in limbs and torso. Distributed processing develops. Pattern library allocation appears in limb ganglia. Centralization score drops. The player's body starts running parallel processing it was never architecturally designed for.

Log messages: "Your limbs twitch independently. Each one seems to know something the others don't." "You feel footsteps through the ground — not through your ears, through your arms."

**Ambush predator mutations:** Eating the ambush specialist develops the most refined vibration sensing (the ambush predator has the best mechanoreceptors on the planet) and explosive limb musculature. Each tier improves vibration transducers on limb zones, grows vibration processing neural mass in limb ganglia, and adds fast-twitch muscle to locomotion zones. Higher tiers may develop the reflex-capable attack structures in limb zones — the player's limbs gaining the ability to perform reflexive strikes.

Direction: vibration sense becomes highly developed. Limb muscle grows (speed increases). Limb ganglia gain enough neural mass and local senses to cross the reflexive defense threshold. The player's limbs begin reacting to threats independently.

Log messages: "Your legs coil with unfamiliar tension. Something in them wants to spring." "You feel something approach from behind — not heard, not seen. Felt."

---

## Mutation Catalog — Clade Mutations

These trigger from total clade consumption, not specific creature types. They are rarer, more physically significant, and more narratively loaded.

### Clade A Clade Mutations (eating lots of Clade A creatures)

Reinforces the player's native Clade A architecture. Head zone gains neural mass. Chemical processing deepens. Episodic memory allocation grows. Integration capacity expands. The body doubles down on what it already is — more centralized, more chemically sensitive, more cognitively integrated.

Each tier adds neural mass to the head zone, grows sensory tissue in the head (chemoreceptors, eye improvements), and may add motor coordination allocation (improved gait efficiency, slightly faster from better coordination rather than more muscle).

Log messages reflect sharpening cognition: "Memories feel sharper. You recall the exact path you walked three days ago." "The air is an open book. Every creature that passed this way left its name in scent."

### Clade B Clade Mutations (eating lots of Clade B creatures)

Introduces Clade B architecture onto a Clade A body. These are the most lore-significant mutations.

Each tier physically restructures the player's body map:
- Neural mass grows in limb zones. The head's share of total neural mass decreases proportionally.
- Mechanoreceptors develop across body surfaces. Vibration sense emerges and strengthens.
- Pattern library neural allocation appears in limb ganglia. Each limb begins accumulating its own stimulus-response associations.
- The player's centralization score drops. At some point, it crosses below 0.40 and Tier 3 cognitive capabilities begin degrading — reduced examine depth, reduced targeted attack accuracy, reduced episodic memory richness.
- Simultaneously, reflexive defense capability emerges. Limb zones cross the neural mass threshold for independent reaction. The player's body begins defending itself from directions they aren't looking.

The tradeoff is real and irreversible within a playthrough. Each Clade B clade mutation shifts the player further from Clade A architecture. They gain distributed capabilities but lose centralized ones. A player who eats heavily from both clades develops the broadest capability set — both chemical and vibration sensing, both episodic memory and pattern matching — but at reduced effectiveness in each because the neural mass is spread thinner. They become a generalist chimera, capable but not dominant in either mode.

Log messages describe impossible physical sensations: "Your forearms move before you decide to move them. Not wrong — just... early." "You try to remember yesterday and the details slide away. But you know every vibration signature on this patch of ground." "Something in your skin is listening. Not your ears. Your skin."

Each message hints at the cross-clade impossibility without explaining it. The player connects the dots or doesn't.

---

## Cross-Clade Significance

The clade mutations are where the lore lives. A Clade A organism cannot develop mechanoreceptors, distributed ganglia, or parallel motor processing. These are Clade B traits built on Clade B developmental architecture. The player gaining them is biologically impossible — and the physical changes to their body map make the impossibility visible.

A player who checks their status screen sees:
- Vibration sense active (should be 0 on any Clade A organism)
- Centralization score declining (no native Clade A organism's neural mass redistributes this way)
- Reflexive defense emerging (Clade A limbs don't have independent reaction capability)

A player who isn't paying attention sees that they detect things through the ground now and their limbs sometimes react on their own. A player who has noticed that only Clade B creatures have these capabilities might wonder why their Clade A body is developing them.

The body map itself becomes the clue. The physical tissue composition is impossible for any native organism. Anyone who understands both clades can see why just by looking at the body.

---

## What the Player Sees

### On Mutation Trigger

A log message in a distinct color (warm amber or muted gold):

> "The skin on your forelimbs prickles. You feel the ground hum."

Followed by a brief mechanical note:

> "Vibration sense developed."

That's it. No popup, no menu, no "MUTATION ACQUIRED" fanfare. It happens in the flow of gameplay. The player learns to associate eating with changing.

### In Status Screen

The status screen shows derived values from the body map. After a mutation, the relevant derived values have changed:
- A new sense appears that was previously absent (Vibration goes from nothing to a low value)
- An existing sense improves (Chemical increases)
- Cognitive tier may shift (centralization score changes)
- Total mass may increase (new tissue added)
- Speed may change (muscle added to locomotion zones, or total mass increased)

No "mutations acquired" list is strictly necessary — the body map changes ARE the mutations, and their effects are visible in every derived value. However, a mutation log or history that records what changed and when could be valuable for players tracking their progression. Format:

```
CHANGES
  Day 12: Chemoreceptors sharpened (Chemical improved)
  Day 23: Forelimb mechanoreceptors developed (Vibration sense emerged)
  Day 31: Limb neural tissue grown (Cognitive architecture shifting)
```

Descriptions are physical, not taxonomic. No clade labels. No creature source listed. Just what changed in the body.

### No Opt-Out

Mutations are not optional. You eat, you change. You can choose to not eat certain things — but if you're starving and the only corpse available is a colonial chemotroph, you eat it and deal with the consequences. This mirrors the lore: the demigod's mutation is not voluntary. It's what they are.

---

## Edge Cases

**Eating the same type repeatedly:** Diminishing returns are built into the escalating thresholds. Eating 40 meso-predators to max out the meso-predator mutation line is a deliberate investment. The player develops extremely strong chemical sensing and a heavily reinforced centralized architecture. That's a choice expressed through gameplay.

**Eating broadly vs narrowly:** A player who eats everything equally hits clade thresholds faster (clade counter sums across types) but type thresholds slower. A player who focuses on one type hits type thresholds fast but clade thresholds slower. Both produce different body configurations.

**Eating from both clades:** Produces the most cross-clade body changes. The player develops both Chemical AND Vibration sensing, both centralized memory AND distributed pattern matching. The body map becomes a chimera of two incompatible architectures. Mechanically strong (broad capability coverage) and lore-significant (the demigod's nature expressing itself most overtly). The player is rewarded for diverse consumption with the most interesting body AND the most lore hints.

**What if the player doesn't eat corpses?** They heal more slowly and never mutate. The body map stays as the starting Clade A template. This is a valid playstyle — the "staying small" approach. The demigod stays dormant. The lore implication: this version chose not to grow. Mechanically: the game is harder because the player has no enhanced senses, no distributed defense, and a fixed body configuration.

**Mass accumulation over time:** A heavily mutated player is physically larger than they started. Their dodge is lower, their food cost is higher, their stealth is worse. This is an emergent cost of mutation — the player didn't choose to get bigger, but every mutation that added tissue increased their total mass. Some players may seek lean mutation paths (Clade B mutations that redistribute neural mass rather than adding it) to minimize mass gain.

---

## Implementation Phases

### Phase 1 — Tracking and First Mutations

Add `consumptionLog` to player state. Increment counters on eat. Define the tier 1 mutation for each creature type (six mutations total). Each mutation specifies body map changes: which zone, which tissue type, how much mass, which transducer or neural allocation changes. Apply body map modifications. Recompute all derived values. Log the message. Persist in saves.

Files: `player.js`, `state.js`, `combat.js` or wherever eat logic lives, `save-load.js`

New file: `mutations.js` — mutation catalog, threshold checking, trigger logic, body map modification application.

### Phase 2 — Full Type Mutation Lines

Add tiers 2-5 for all creature types. The specific tissue changes are starting points — tune after playtesting. Adjust thresholds if early mutations come too fast or too slow.

Files: `mutations.js`

### Phase 3 — Clade Mutations

Add the clade mutation tiers. These carry the cross-clade body restructuring and the lore-loaded descriptions. This phase is where the system goes from "eating makes you slightly better" to "your body is becoming something it shouldn't be."

Files: `mutations.js`

### Phase 4 — Cognitive Tier Transitions

When the player's centralization score crosses a tier boundary due to Clade B mutations redistributing neural mass, gameplay changes. Tier 3 → Tier 2 transition: reduced examine depth, reduced targeted attack accuracy, reduced episodic memory (the player's log messages about remembering past events become vaguer or stop). Tier 2 gains: reflexive defense from limbs, pattern matching in familiar territory.

Files: `mutations.js`, `enemy-ai.js` (reflexive defense), `interactions.js` (examine depth), `combat.js` (targeted attacks), `ui.js` (status display)

### Phase 5 — Visual Mutations (Future)

Sprite changes reflecting accumulated mutations. Color shifts, integument texture changes, visible mechanoreceptor arrays on limb surfaces. A heavily Clade-B-mutated player looks subtly different from a pure Clade A body. Purely cosmetic — can be deferred indefinitely.

Files: `sprites.js`, `rendering.js`, `player.js`

---

## What NOT to Change When Building This

- Combat formulas (mutations modify the body map, combat reads the body map — no special mutation hooks needed in combat code)
- Creature definitions (the source field on corpses and clade data on monsters already exist)
- Eating mechanics (just add the tracking call and body map modification after the existing eat logic)
- AI, spawning, terrain, biome generation
- Save format structure (add consumptionLog and mutation history to player save data as additions)

---

## Prompt Reference

When implementing, include:
- This document
- Body-Sim-Design.md (the body map system that mutations modify)
- Stat-System-Design.md (derived values that change when the body map changes)
- `player.js` (player body map and consumption log)
- `state.js` (game state management)
- `monsters.js` (creature definitions with clade data and source keys)
- `ui.js` (status display showing derived values)
- `save-load.js` (persisting consumption tracking and body map state)
- `ground-items.js` (corpse eating is where tracking hooks in)
- `Ecology-Foundations.md` (clade context and cross-clade significance)
- `Lore.md` (why the player mutates — the demigod's nature)

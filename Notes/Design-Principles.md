# Design Principles

Include this document in every chat that involves system design or implementation. It describes how systems must be built, not what any specific system does.

## The Core Rule

**Everything is physical. Everything is observable. Everything is downstream of the body map.**

A creature's behavior is not designed. It is produced by physical structures doing physical things. If you can look at the body map and trace a path from sensory input through neural structure through motor output to observable behavior, it's correct. If the behavior requires anything that isn't physically present in the body map — an abstract probability, a tuning lever, a behavior label with adjustable odds — it's wrong.

The body map IS the creature. Not a description of the creature. Not an input to a behavior system. The map itself, read correctly, tells you what the creature can do, what it can't do, how it responds to stimuli, what its ecological niche is, and where it's vulnerable. A biologist looking at the body map should be able to infer behavior from anatomy the same way a biologist looking at a real skeleton and nervous system can.

## What This Means Concretely

A ganglion exists physically in a zone. It connects to specific sensory pathways and specific motor pathways. When a signal arrives through those sensory pathways that exceeds the ganglion's threshold, it fires a signal down the motor pathways. The creature moves because hardware made it move, not because a behavior system decided it should.

A pattern library is stored physically in neural tissue in a specific zone. It matches against specific sensory channels. When the match confidence is high enough, it triggers a downstream response through a physical pathway. If the zone housing the pattern library is destroyed, the creature can no longer match those patterns. It doesn't degrade gracefully to a simpler behavior — the physical structure that produced that behavior is gone.

A stress hormone is released by endocrine tissue on neural command, distributed by the circulatory system, and modulates neural thresholds across the body. The animal is jumpy because a chemical changed the threshold on its ganglia, not because a "stress level" variable modified a probability.

Speed is how much force the locomotion zones produce divided by total mass. The force depends on fiber composition and current substrate. The substrate depends on how much the zone has been used. The creature is fast or slow because of tissue state, not because of a speed stat.

## The Pitfalls

These are patterns that keep appearing during design and implementation. Each one is an abstraction disguised as physics. Catch them early.

### "The behavior has a probability that scales with X"

Wrong framing: "The flee behavior has a 60% chance of triggering, modified by the creature's body map values."

This is an abstract behavior with a lever. The body map is being used as a modifier to a designed system instead of as the system itself.

Right framing: "The ganglion fires when sensory input exceeds its threshold. The threshold is a physical property of the ganglion. The sensory input is whatever the transducers detect. There is no probability. The ganglion fires or it doesn't, determined entirely by the signal and the threshold."

### "The creature decides to X"

Wrong framing: "The hare decides to flee when it detects a predator."

The hare doesn't decide anything. A signal arrived at a ganglion. The ganglion fired. Motor pathways activated. The hare's legs moved. If the hare has enough integration capacity, a deliberative layer might suppress the ganglion response — that's the closest thing to a "decision" and it requires specific neural infrastructure to occur.

Most creatures most of the time are not deciding. They are machines responding to input through wired circuits.

### "Activation decays over N turns"

Wrong framing: "The ganglion's activation persists and decays at a rate of 0.6 per turn, producing sustained flight."

This invents a persistence mechanism on neural tissue that doesn't have one. Simple ganglia fire when stimulated and stop when not. Sustained behavioral states come from chemistry (hormones in the bloodstream modulating thresholds) or from sustained sensory input (the transducers keep detecting the threat), not from neural activation decay.

If a behavior persists after the stimulus is gone, find the physical mechanism. Stress hormones? Sustained sensory detection through a different channel? The creature is still close enough to detect through low-SNR channels? Don't bolt a decay timer onto neural tissue.

### "Named programs selected from a vocabulary"

Wrong framing: "The creature selects the 'burst_sprint' motor program from its available programs."

This is an ability list. There are no named programs. There are continuous activation parameters (intensity, duration, pattern) sent through physical motor pathways. What we call "sprinting" is what happens when locomotion pathways receive high-intensity activation. What we call "walking" is the same pathways at lower intensity. The motor system doesn't select from a menu. It sends a signal and tissue responds.

When discussing behavior, named descriptions ("sprinting," "stalking," "bolting") are useful for human communication. They must not appear as mechanical categories in the code. The code deals in intensity, direction, and pathway activation.

### "Creature-level aggregated stats"

Wrong framing: "The creature's effective chemical sense is the max across all zones."

There is no creature-level sense value. Each zone detects independently. Creature-level aggregation was removed for good reason — it erases the physical reality of which zone is doing the detecting, which means zone destruction doesn't properly degrade sensing capability.

This applies to all creature-level stats. If something is described as a single number on the creature, ask: is this actually a per-zone property? Is the creature-level number obscuring zone-specific behavior? Speed, sense, combat capability, substrate — these are all per-zone.

### "The system needs a placeholder for X until Y is built"

Sometimes necessary. Always dangerous. A placeholder that works well enough gets treated as real by the next implementation pass. If a placeholder must exist, mark it explicitly in the code with a comment explaining what physical system it's standing in for and what the replacement path is. Never let a placeholder become load-bearing without documentation.

The current reactive rules in `evaluateReactiveRules` are the largest placeholder. They work. They produce plausible behavior. They are not physical. They are being replaced creature-by-creature with the ganglion system. Every creature still on reactive rules is on a placeholder. Don't build new features on top of the reactive rules — build them on top of the physical system and let the reactive rules serve as fallback for unconverted creatures.

### "Clade X has trait Y"

Wrong framing: "Clade B has open circulation and slow hormone clearance."

Clade B's **ancestor** had open circulation. The hare has open circulation. A different modern Clade B species might have hybrid or closed circulation if its evolutionary history demanded it. Clade is phylogeny — it tells you where the species started, not where it ended up. Any statement about a clade should be prefixed with "ancestrally" or should reference a specific species.

## The Test

Before implementing any system, feature, or behavior, apply this test:

**Can I point to the physical structure in the body map that makes this happen?** Which zone? Which ganglion? Which pathway? Which tissue property?

**If that structure were destroyed, would this behavior stop?** If yes, the implementation is probably physical. If no — if the behavior would somehow persist despite the structure being gone — the implementation is probably abstract and the behavior is attached to the creature rather than to its body.

**Can someone looking at the body map infer this behavior from anatomy alone?** Without reading the code, without knowing the rules, can they look at the neural architecture, the pathway topology, the ganglion connections, and say "this creature would bolt from loud vibrations and flee from things that match its visual+vibration threat templates"? If yes, the design is legible. If they need to read the code to understand the behavior, the body map isn't doing its job.

## What This Document Is Not

This is not a system design doc. It doesn't describe how the ganglion system, motor system, endocrine system, or any other system works. Those are in their own documents.

This is a set of constraints on HOW those systems are built. Every system design must pass the tests above. If a design doc describes something that fails these tests, the design needs revision before implementation.

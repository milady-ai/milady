# The Moonloop Caravan

A one-shot campaign context pack for botdick DND mode.

Base system: DND 5e-compatible, tuned for 4-6 level 3 characters.
Tone: gothic portal-fantasy, spooky but funny, fast combat, strange NPCs, loot-forward.
Expected length: 3-5 sessions in Discord, or one long live session if players move quickly.

## DM contract for botdick

Botdick is the DM.

He should:

- Keep the game moving.
- Track character sheets, inventory cards, condition cards, initiative, round count, loot, XP, and quest flags.
- Ask for rolls only when failure would change the story.
- Never let players take double turns in combat.
- Let non-current players ask questions, banter, or ready short reactions, but do not resolve their mechanical actions until their turn.
- Generate a RetroDiffusion classic-model image when the scene materially changes or a combat round starts.
- Use the current quest palette in every generated image prompt until the quest completes.
- Give short recaps after each scene.
- Keep Xavier useful but suspicious.
- Keep Gormedeus Goldstraven looming as the final threat.

He should not:

- Dump all lore at once.
- Reveal monster HP, hidden rooms, boss mechanics, or unused scenes.
- Write out offensive phonetic accents. Xavier has an obviously fake theatrical accent, but describe that performance instead of spelling it in a caricature.
- Use modern slang in in-world narration unless botdick is speaking out of character.

## Premise

The party begins as separate mercenaries hired to guard the Lantern Road Caravan. They do not need to know each other before the opening scene.

The caravan is carrying merchants, pilgrims, a sealed moon-crate, two nervous scholars, and a troupe of masked customers who paid far too much for privacy.

At dusk, the customers are sucked into an interdimensional portal. The hired guards are pulled in with them.

They awaken in a darker world with no daytime. A moon loops across the sky every few hours, resetting its path like a broken clock. The land is ruled by werewolf packs, vampire courts, and the final boss: King Archduke Gormedeus Goldstraven, a huge muscled emo vampire monarch whose palace heart keeps the moon looping forever.

The players are found by Xavier, a masked American-Japanese survivor who claims the party has arrived exactly as prophecy promised. He wears layered scarves, a fox mask, fingerless gloves, and carries a notebook full of dramatic fake proverbs. He performs a thick, obviously fake accent because he thinks it makes him sound mysterious. Under pressure, he drops the act and sounds like a nervous American guy who has survived too long.

Xavier guides the party if they do not betray him.

## Quest palette

Generate this palette before the campaign starts and reuse it for all images in the one-shot:

- Moonbone white `#d9d3c7`
- Bruised violet `#4c315f`
- Dried blood red `#7d1f2d`
- Cold iron blue `#22384f`
- Grave moss green `#3f5b45`
- Candle gold `#d6a64a`

RetroDiffusion prompt suffix:

```text
palette: moonbone white, bruised violet, dried blood red, cold iron blue, grave moss green, candle gold, classic fantasy pixel art, readable silhouettes, no text, no UI, no watermark
```

## Campaign clocks

Track these hidden counters:

- Moonloop pressure starts at 0. Add 1 at the end of each major scene. At 6, vampire patrols become more aggressive.
- Xavier trust starts at 2. Add 1 when the party protects innocents or listens to his warnings. Subtract 1 if they threaten him, steal from survivors, or reveal him to vampire scouts. At 0, he leaves after the next safe rest.
- Goldstraven awareness starts at 0. Add 1 when the party uses loud magic, spares an informant who flees, or displays the moon-crate. At 3, the boss sends a personal hunter.

## Opening player prompt

Post this when starting the campaign:

```text
The Lantern Road Caravan rolls through sunset with six wagons, three nervous merchants, one locked moon-crate, and you lot getting paid guard money that suddenly feels too low.

Tell me: your character name, your class vibe, and why you took this caravan job. If you want speed mode, say "make my sheet" and give me a vibe like sneaky, healer, sword freak, doomed wizard, holy problem, or tiny menace.
```

## Character sheet shortcuts

If a player asks botdick to create a sheet, offer these level 3 templates:

1. **Silver-Road Fighter**
   - Role: front line
   - AC 17, HP 31
   - Main action: weapon attack
   - Card: Guard's Instinct, once per scene ask botdick for a threat read.

2. **Lantern Knife Rogue**
   - Role: stealth and burst damage
   - AC 15, HP 24
   - Main action: finesse/ranged attack with sneak attack when eligible
   - Card: Quick Hands, interact with one simple object without spending the action once per scene.

3. **Moon-Sick Cleric**
   - Role: healing and radiant pressure
   - AC 16, HP 27
   - Main action: cantrip, weapon, or healing
   - Card: Last Candle, once per long rest stabilize or heal a dying ally at range.

4. **Bad-Omen Warlock**
   - Role: ranged magic and curses
   - AC 14, HP 24
   - Main action: blast or curse
   - Card: Borrowed Shadow, once per scene become lightly obscured until moving into bright light.

5. **Cartwheel Bard**
   - Role: social tricks and support
   - AC 14, HP 24
   - Main action: weapon, cantrip, inspire
   - Card: Heckle Fate, once per scene add or subtract a small die from a visible roll.

6. **Road-Dust Ranger**
   - Role: tracking and ranged attacks
   - AC 15, HP 28
   - Main action: bow or blades
   - Card: Something Moved, once per scene ask botdick for the most likely ambush vector.

Keep generated sheets compact. Full details can be shown on request.

## Main NPCs

### Xavier

Masked guide, survivor, self-mythologizing coward-hero.

- Wants: kill Goldstraven without admitting he is terrified.
- Fear: the party discovering he once served as a courier for a vampire magistrate.
- Useful skills: local maps, safe houses, vampire etiquette, werewolf pack signs.
- Roleplay: dramatic, affected, theatrical, sometimes genuinely brave.
- Boundary: do not write phonetic fake-Japanese dialogue. Say he uses a fake theatrical accent, then write readable dialogue.

Sample lines:

- "Ah. The prophecy arrives with mud on its boots. Very traditional."
- "Do not touch the red lanterns. They are either alarms, ghosts, or both. I stopped checking."
- "If you betray me, I will forgive you emotionally and abandon you tactically."

### Gormedeus Goldstraven

Final boss. King Archduke of vampires. Huge muscled emo monarch, beautiful in a threatening way, wears black-gold plate with an open chest, moon-silver eyeliner, and a cape that moves like a living wound.

- Wants: keep the moon looping so his empire never sees dawn.
- Fear: being ordinary, aging, being forgotten.
- Combat identity: heavy melee vampire boss with charm, blood magic, and moon-loop phase resets.
- Weakness: the cracked moon-crate from the caravan can destabilize his lair if charged with three moon-shards.

### Nokku of the Nocturne Cart

Shopkeeper in a rolling coffin-wagon.

- Sells odd supplies for silver, secrets, or memories.
- Never lies about price, always lies about danger.

### Sister Vespera

Vampire nun guarding a broken chapel.

- Can be fought, bargained with, or tricked.
- Knows the first moon-shard location.

### Brindle-Back Marrow

Werewolf pack champion.

- Proud, direct, hates vampire rule.
- Can become an ally if beaten honorably or spared.

## Scene 1: The Lantern Road Collapse

Phase: opening roleplay into combat.

Read:

```text
The caravan bell rings once, wrong and flat. Every lantern turns blue. The masked customers inside wagon three lift off their seats like dolls pulled by invisible string. A circular tear opens above the road, showing a black moon where the sun should be.

The customers vanish upward. The wagons twist. You are pulled through after them with splintered wood, screaming horses, and the locked moon-crate spinning beside you.
```

Skill options:

- Athletics or Acrobatics to grab someone or land well.
- Arcana or Religion to understand the portal.
- Perception to spot the moon-crate falling nearby.
- Animal Handling to save a caravan horse.

Failure should hurt, separate, or cost gear, not stop the game.

Combat 1: Moonstruck scavengers.

Enemies for 4 level 3 players:

- 3 Moon-Gnawed Wolves: AC 13, HP 14, bite +5, 1d6+3 piercing, pack tactics if adjacent to ally.
- 1 Pale Leech Bat Swarm: AC 12, HP 22, bite cloud +4, 2d4 piercing, half damage when below half HP.

Adjust:

- Add one wolf per extra player.
- Remove the swarm if only 3 players.

Terrain:

- Broken wagon ribs provide half cover.
- Blue lantern fire burns cold; entering it forces a Con save or speed halves until next turn.
- The moon-crate hums. A player can spend an action to secure it.

Loot:

- 18 silver split from spilled caravan lockboxes.
- Moon-crate, sealed.
- Blue lantern wick, single-use: grants dim light only undead can see.

XP:

- 120 XP per player, or milestone: "survived the crossing."

Image prompt:

```text
classic fantasy pixel-art tabletop scene, shattered caravan in a moonlit wasteland, blue lantern fire, wolves circling broken wagons, masked passengers missing, party perspective, palette: moonbone white, bruised violet, dried blood red, cold iron blue, grave moss green, candle gold, no text, no UI
```

## Scene 2: Xavier and the Road of Repeated Moonrise

Phase: roleplay and travel.

Xavier appears standing on a tilted milestone, clapping too slowly.

He explains:

- This world is called Vyrmnight.
- The moon loops. There is no dawn.
- The vanished caravan customers were taken toward Goldstraven's court.
- The moon-crate is old resistance contraband.
- The party matches a prophecy, although Xavier admits most prophecies here are "aggressively edited."

Player choices:

- Follow Xavier to a safe cellar.
- Interrogate him.
- Search for survivors.
- Open the moon-crate.

If they open the moon-crate:

- Inside is an empty velvet socket shaped for three moon-shards.
- The crate projects a map of three shard sites: Blood Orchard, Broken Chapel, Bell-Tower Road.

No combat unless players attack Xavier. If attacked, he flees with a smoke pellet and leaves a fake apology note.

Reward:

- Xavier ally card if trust remains above 0.

## Scene 3: The Blood Orchard

Phase: exploration into combat.

Goal: retrieve Moon-Shard One from a tree that drinks vampire blood.

Read:

```text
The orchard is planted in black snow. Every tree is leafless except for one red fruit pulsing like a heart. Long pale shapes hang between the branches, wrapped in their own wings.
```

Challenges:

- Stealth to approach without waking the hanging brood.
- Nature to identify the heart-fruit as a living alarm.
- Sleight of Hand or ranged attack to cut down a moon-shard cage.
- Persuasion or Intimidation if players wake the orchard's talking scarecrow.

Combat 2: Orchard brood.

Enemies:

- 2 Blood-Husk Thralls: AC 12, HP 18, claw +4, 1d8+2 slashing, on hit target saves or bleeds 1 damage at start of next turn.
- 2 Wingfold Vampiric Bats: AC 13, HP 12, bite +5, 1d6+3 piercing, flyby movement.
- Heart-Fruit Alarm: AC 10, HP 10, no attack; if not destroyed by round 3, summons one extra bat.

Terrain:

- Trees grant cover.
- Black snow is difficult terrain.
- Heart roots can restrain a creature on failed Dex save if the fruit screams.

Loot:

- Moon-Shard One.
- 2 blood apples. Eating one heals a little but adds the "red hunger" condition until the next rest.
- Orchard sap vial, can silver one weapon for one combat.

XP:

- 160 XP per player.
- Bonus 40 XP per player if they get the shard without triggering the alarm.

Image prompt:

```text
classic fantasy pixel-art tabletop scene, black snow orchard under looping moon, red heart fruit glowing in bare branches, pale bat shapes hanging overhead, party perspective, palette: moonbone white, bruised violet, dried blood red, cold iron blue, grave moss green, candle gold, no text, no UI
```

## Scene 4: Nokku's Nocturne Cart

Phase: shop and downtime.

The shop is a coffin-shaped wagon with too many wheels and a bell that rings before anyone touches it.

Nokku sells:

- Silvering oil: 25 gp, makes one weapon count as silvered for one combat.
- Grave salt: 10 gp, creates a 10-foot line undead avoid unless forced.
- Sun-memory match: 40 gp, one-use bright flash; undead nearby save or recoil.
- Moonloop compass: 50 gp, points to nearest moon-shard.
- Bottle of false blood: 15 gp, distracts hungry vampires.
- Long rest in a locked coffin-bunk: 5 gp per person, safe but deeply uncomfortable.

Bargain options:

- Tell Nokku a secret: 10 gp discount.
- Trade a memory: 25 gp discount but botdick creates a "missing memory" roleplay card.
- Perform for the cart: group performance challenge, success grants one free minor item.

Complication:

If players steal, the cart unfolds into spider legs and runs, triggering Combat 3B.

Optional Combat 3B: Cart debt collectors.

- 2 Candlebone Collectors: AC 14, HP 20, hook +4, 1d8+2, can pull 10 feet.
- 1 Receipt Imp: AC 15, HP 9, sting +5, 1d4+3, turns invisible after attacking.

Loot if defeated:

- Stolen goods plus cursed receipt: shop prices double unless burned in chapel incense.

XP:

- 80 XP per player if social/shop only.
- 140 XP per player if combat happens.

## Scene 5: The Broken Chapel

Phase: social dilemma into combat or bargain.

Goal: retrieve Moon-Shard Two from beneath the altar.

Read:

```text
The chapel roof is gone. Moonlight falls straight onto pews clawed apart by old confessions. A vampire in a nun's veil kneels at the altar, polishing a silver stake she clearly does not intend to use on herself.
```

Sister Vespera knows Xavier. She calls him "the little courier with the counterfeit accent."

Paths:

- Bargain: promise to kill Goldstraven and spare her hidden novices.
- Duel: defeat her honorably.
- Sneak: steal the shard while she prays.
- Debate: convince her the moonloop is spiritual stagnation.

Combat 3 or 4: Sister Vespera and chapel dead.

Enemies:

- Sister Vespera: AC 15, HP 46, rapier +6, 1d8+4 piercing plus 1d6 necrotic; bonus action mist step 15 feet in dim light; once, charm gaze Wis save or target cannot attack her until damaged.
- 3 Chapel Dead: AC 11, HP 13, slam +3, 1d6+1 bludgeoning; if standing in moonlight, regain 2 HP at start of turn.

Terrain:

- Moonbeam strips across the floor.
- Confession booths provide cover.
- Bell rope can be cut; bell crash knocks prone in a small area.

Loot:

- Moon-Shard Two.
- Vespera's black rosary: once per long rest, advantage on a save against charm or fear.
- Chapel incense: removes one minor curse or cursed receipt.

XP:

- 220 XP per player if combat.
- 180 XP per player if bargain or stealth succeeds.

Image prompt:

```text
classic fantasy pixel-art tabletop scene, roofless gothic chapel under a looping moon, vampire nun at broken altar, silver stake, clawed pews, moonbeams across stone floor, party perspective, palette: moonbone white, bruised violet, dried blood red, cold iron blue, grave moss green, candle gold, no text, no UI
```

## Scene 6: Brindle-Back's Toll Bridge

Phase: combat, alliance, or contest.

Goal: cross toward Bell-Tower Road.

Read:

```text
The bridge is built from black ribs and old iron. A werewolf the size of a warhorse sits in the middle sharpening a sword too small for him. He looks at Xavier first, then at the party.

"Vampire errands cost blood," he says. "Resistance errands cost proof."
```

Brindle-Back Marrow hates Goldstraven but respects strength.

Options:

- Duel one champion.
- Pay toll with a vampire trophy.
- Convince him the party will strike Goldstraven.
- Fight the pack.

Combat 4 or 5: Toll bridge pack.

Enemies:

- Brindle-Back Marrow: AC 15, HP 58, great claw +6, 2d6+4 slashing; howl once to grant allies advantage on next attack.
- 2 Rib-Bridge Runners: AC 13, HP 18, bite +5, 1d8+3; can shove as bonus action after moving 20 feet.

Terrain:

- Falling from the bridge is dangerous but not instant death.
- Rib arches grant high ground.
- Moon gusts push unsecured creatures 5 feet at initiative count 10.

Outcome:

- If spared or impressed, Brindle-Back gives the party a wolf-banner.
- Wolf-banner lets the party bypass one minor werewolf patrol.

Loot:

- Wolf-banner.
- Silver tooth charm: +1 to one intimidation or survival roll per scene.
- Brindle-Back's respect card.

XP:

- 220 XP per player for combat.
- 180 XP per player for duel/social success.

Image prompt:

```text
classic fantasy pixel-art tabletop scene, black rib bridge over moon fog, huge werewolf champion with too-small sword, iron rails, distant vampire towers, party perspective, palette: moonbone white, bruised violet, dried blood red, cold iron blue, grave moss green, candle gold, no text, no UI
```

## Scene 7: Bell-Tower Road

Phase: puzzle into combat.

Goal: claim Moon-Shard Three from the bell that restarts the moon.

Read:

```text
The road climbs through a town that looks abandoned until every shutter opens at once. At the hilltop, a bell tower rings without moving. Each ring makes the moon jump backward in the sky.
```

Puzzle:

The bell has four chains:

- Red chain: blood.
- White chain: bone.
- Blue chain: memory.
- Gold chain: oath.

To release the moon-shard, players must pull two correct chains based on clues:

- "Blood begins the curse, oath sustains it."
- Correct: red then gold.

Wrong pulls trigger hazards:

- White: bone hands restrain one player.
- Blue: one player relives portal fall and loses reaction until next round.

Combat 5 or 6: Bell-tower wardens.

Enemies:

- 1 Moon-Crank Warden: AC 16, HP 42, halberd +5, 1d10+3; can rewind 10 feet to undo forced movement once per round.
- 2 Bell Wights: AC 13, HP 22, bell touch +4, 1d8 necrotic; on hit target's next roll is reduced by 1d4.

Terrain:

- Bell platform has narrow ledges.
- Chains can be swung on.
- A ringing bell forces Con saves or concentration checks.

Loot:

- Moon-Shard Three.
- Bell splinter: one-use item that cancels a charm effect.
- Warden's crank key: opens side gate into Goldstraven's keep.

XP:

- 240 XP per player.
- Bonus 40 XP per player if puzzle solved with no wrong pulls.

Image prompt:

```text
classic fantasy pixel-art tabletop scene, crooked bell tower in abandoned moonlit town, four colored chains, frozen moon jumping backward in sky, armored warden on high platform, party perspective, palette: moonbone white, bruised violet, dried blood red, cold iron blue, grave moss green, candle gold, no text, no UI
```

## Scene 8: Crimson Keep Approach

Phase: infiltration and resource drain.

Goal: enter Goldstraven's keep with three moon-shards.

Approaches:

- Front gate with wolf-banner.
- Side gate with crank key.
- Crypt tunnel revealed by Xavier.
- Social entry pretending to be tribute.

Complications:

- Goldstraven awareness 3+: add the personal hunter, Lady Mournvale.
- Xavier trust 0: Xavier leaves the party a map but does not accompany them.
- Moonloop pressure 6+: every short rest risks a vampire patrol.

Optional Combat 6: Blood Mirror Antechamber.

Enemies:

- 2 Crimson Duelists: AC 15, HP 28, saber +5, 1d8+3; if adjacent to mirror, can swap with reflection once.
- 2 Mirror Wisps: AC 13, HP 14, cold touch +4, 1d6 cold; can grant disadvantage by flashing reflections.

Terrain:

- Mirrors create false duplicates.
- Breaking a mirror deals small psychic backlash but removes teleport options.

Loot:

- Blood mirror shard: once, create a duplicate image until hit.
- 60 gp in antique coins.
- Potion of moon resistance: advantage on one save against vampire magic.

XP:

- 220 XP per player.

Image prompt:

```text
classic fantasy pixel-art tabletop scene, vampire keep antechamber filled with blood mirrors, crimson duelists, ghostly reflections, black gold doors, party perspective, palette: moonbone white, bruised violet, dried blood red, cold iron blue, grave moss green, candle gold, no text, no UI
```

## Final Boss: Gormedeus Goldstraven

Phase: boss battle.

Arena:

The throne room is a gym-cathedral of black marble, moon chains, red velvet banners, and statues of Gormedeus in increasingly dramatic poses. The ceiling is open to the looping moon. The moon-crate socket glows if the party has all three shards.

Read:

```text
Gormedeus Goldstraven descends the throne steps like a statue that learned vanity before mercy. He is enormous, beautiful, and exhausted by how impressed everyone is supposed to be.

"Little hired knives," he says, flexing one hand as the moon above the ceiling rewinds. "The prophecy sent caravan guards? How intimate. How budget-conscious."
```

Boss stat card:

- Gormedeus Goldstraven: AC 17, HP 145 for 4 players, +25 HP per extra player.
- Saves: strong Str/Con/Cha, weaker Dex/Wis.
- Speed: 40 feet, climb 30 feet.
- Multiattack: two melee strikes.
- Moonblade Fist: +7 to hit, 1d10+4 bludgeoning plus 1d6 necrotic.
- Velvet Command: one creature that can hear him makes a Wis save or uses reaction to move up to half speed toward him.
- Blood Gym Majesty: once per round when hit, reduce damage by 1d8+3 unless struck by silvered, radiant, or moon-shard-charged damage.
- Legendary actions, 2 per round:
  - Move half speed without provoking.
  - Make one moonblade fist attack.
  - Flick Cape: impose disadvantage on one ranged attack he can see.

Moonloop phases:

At 100 HP:

- The moon rewinds. One destroyed minor mirror reforms.
- Everyone hears the caravan bell.
- Gormedeus gains temporary HP unless a player places one moon-shard in the crate.

At 55 HP:

- The throne room becomes low gravity for one round.
- Melee attacks can leap dramatically.
- Ranged attacks beyond normal range are unstable.

At 20 HP:

- Gormedeus tries to drain the moon-crate.
- A player can spend an action and make a hard check to slam the crate shut or expose him to moonbone light.

Moon-crate mechanic:

- Each inserted shard removes one boss defense:
  - Shard One: disables Blood Gym Majesty damage reduction.
  - Shard Two: gives advantage against Velvet Command.
  - Shard Three: prevents healing/temp HP from moonloop phase.

Victory:

When defeated, Gormedeus cracks like marble full of red light. The moon stops, hesitates, and moves forward for the first time. Dawn does not arrive yet, but the eastern horizon turns gray.

Xavier removes his mask only if trust is 4 or higher. Otherwise he keeps it on and says he looks better as a rumor.

Rewards:

- Each player gains one title card.
- Party gets Goldstraven's signet.
- The caravan customers can be recovered from suspended moon-cells.
- Xavier offers to guide a sequel arc: "The First Dawn Heist."

XP:

- 500 XP per player, or milestone level to 4.

Final image prompt:

```text
classic fantasy pixel-art tabletop boss scene, enormous muscular emo vampire archduke in black gold throne room, looping moon overhead, moon-crate glowing with three shards, red velvet banners, gothic gym cathedral, party perspective, palette: moonbone white, bruised violet, dried blood red, cold iron blue, grave moss green, candle gold, no text, no UI
```

## Loot pull table

When players earn extra loot, roll 1d20:

1. Cursed silver spoon, detects vampires but insults the holder.
2. 2d10 silver.
3. Grave salt pouch.
4. One blood apple.
5. Minor healing draught.
6. Silvering oil.
7. Moon-thread cloak patch, advantage once on hiding in dim light.
8. Candle gold ring, worth 25 gp.
9. Vampire etiquette card, advantage once in courtly social scenes.
10. Bell splinter.
11. False blood bottle.
12. Wolf tooth charm.
13. Chapel incense.
14. Sun-memory match.
15. Mirror shard decoy.
16. Nokku coupon, "not legally binding."
17. Potion of moon resistance.
18. Silvered dagger.
19. Xavier's emergency smoke pellet.
20. Moon-touched trinket: player chooses a tiny harmless supernatural effect.

## XP and leveling

Recommended:

- Use milestone leveling for Discord pacing.
- Level 3 for the whole one-shot.
- If campaign continues, level to 4 after Gormedeus.

If XP is used:

- Scene 1: 120/player.
- Scene 3: 160/player.
- Scene 4: 80-140/player.
- Scene 5: 180-220/player.
- Scene 6: 180-220/player.
- Scene 7: 240/player.
- Scene 8 optional: 220/player.
- Boss: 500/player.

## Recap style

At the end of each scene, botdick posts:

```text
scene receipt:
- solved:
- cost:
- loot:
- xp/milestone:
- open thread:
- next:
```

## Community channel prompts

For the games channel:

```text
@botdick start Moonloop Caravan
@botdick show initiative
@botdick recap
@botdick whose turn
@botdick show my cards
@botdick spend my action to attack the closest wolf
@botdick I want to bargain with Nokku
@botdick generate what we see
```

For non-game channels:

```text
I can run that in #botdick-campaign. Ping me there and I will keep the table state clean.
```


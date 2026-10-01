# Item Forge tracker — a Claude Artifact, not part of this repo

**Live at:** https://claude.ai/artifact/9FekBZLZwn7wKeoygtgu3p

A Claude Artifact tracking AI-image-generation prompts for Goblin War's weapons, armor, trinkets,
and consumable/utility items — see [player-state.md](player-state.md)'s Equipment table and
`assets/equipment/`'s row in CLAUDE.md. Same editing mechanics as
[scene-backdrops.md](scene-backdrops.md) describes — not repeated here. **UI-reskin prompts split
out to [UI Forge](ui-forge.md)** (linked at the top of the page itself) — don't add new UI items
here, they belong in that tracker now.

## Structure

- **Quality ladder (Sword/Shield/Helm/Chestplate/Greaves/Charm — 24 cards)**: each of these 6
  equipment slots has a Bronze → Iron → Steel → Mithril tier, grouped by `slotGroup` matching the
  slot name. Every card carries `tier`, `stat` (the in-game bonus), `price`, and `shop` (Marketplace
  vs Blacksmith vs Capital Blacksmith) fields alongside the usual id/name/category/prompt/images/
  implemented — these mirror the real `MARKET_ITEMS` entries exactly, so a prompt card's `stat`/
  `price`/`shop` should stay in sync if the live game's numbers ever change.
- **Consumables** (Food, Healing Potion) and **Utility** (Books, Firewood, Waterskin, Bedroll) — no
  tier ladder, flat prompts.
- The 8 named Accessories (CLAUDE.md's accessory-grid mention) are explicitly **not** covered by
  this tracker's quality ladder — they "stay as-is," per the page's own brief.

## Prompt style convention (distinct from every other tracker)

Item Forge's shared `STYLE_SUFFIX` explicitly demands an **upright, centered silhouette**: a blade
shown vertically with the hilt at the bottom and the point straight up, shields/armor facing
directly forward and centered — "never tilted or shown at a diagonal angle." This is specific to
item sprites (which render as small fixed-orientation icons in Marketplace/Blacksmith/inventory
rows) and shouldn't be copied into a tracker for scene/backdrop art, where a dynamic angle is often
exactly what's wanted (see [scene-backdrops.md](scene-backdrops.md)'s siege prompts, which want
plenty of diagonal/dynamic action).

## All 24 equipment cards are live `MARKET_ITEMS` — checkboxes track art only

Every weapon/armor/trinket card already exists and functions in the actual game regardless of
whether its `implemented` box is ticked here — that checkbox means "real generated art is wired in,"
not "the item exists." Per CLAUDE.md's `assets/equipment/` row, only the Sword tier (all 4) and 3 of
the 4 Shield tiers have real art wired in so far; the rest still fall back to the generic SVG icon.

## Status (drifts — check the live artifact for ground truth)

Swords: all 4 tiers have real art. Shields: Bronze/Iron/Steel have real art, Mithril does not yet
(`mithril-shield`'s `images` array is empty). Helm/Chestplate/Greaves/Charm (all 4 tiers each) and
every Consumable/Utility item: no generated art yet, `implemented:true` on these tracks the item's
existence in-game, not art — don't assume a ticked box means real art exists; check the `images`
array directly.

// ==================== STARTING TOWN — SURFACE COMPOUND ====================
// Replaces the old interior-layer town system.  The starting town is now
// a walled compound stamped directly onto the surface grid.  Walk in and
// out freely — no layer transitions.
//
// Adding a new shop = adding a new entry to SHOP_PROFILES and placing it
// in a room inside placeStartingTown.

import { worlds, covers } from './state.js';
import { T } from './terrain.js';
import { setFeature } from './world-state.js';

// ==================== SHOP PROFILES ====================
// Data-driven shop definitions.  The shop UI, pricing logic, and buy/sell
// filtering all read from these profiles — no hardcoded per-shop behavior.
//
// Fields:
//   type           — category tag (inn / smith / leatherworker / scholar …)
//   name           — display name shown in the shop modal
//   keeper         — { name, sprite, mercantile }
//                    mercantile affects pricing: higher = better for keeper
//   sellInventory  — array of item keys the shop stocks for sale
//   buyCategories  — item kinds the shop will buy from the player
//   buyPriceMod    — multiplier on the base buy price (shop buying from player)
//   sellPriceMod   — multiplier on the base sell price (shop selling to player)
//   bonusBuyTags   — item tags that earn extra gold when selling to this shop

export const SHOP_PROFILES = {
  town_inn: {
    type: 'inn',
    name: 'The Hearthstone Inn',
    keeper: { name: 'Marta', sprite: 'npc', mercantile: 3 },
    // Keys must match FOOD in items.js
    sellInventory: ['apple', 'bread', 'jerky', 'stew'],
    buyCategories: ['food'],
    buyPriceMod: 0.8,
    sellPriceMod: 1.0,
    bonusBuyTags: [],
    // Gold per FED point — all food at this shop costs consistently.
    // bread (22 FED) → 22×0.56 ≈ 12g, stew (45 FED) → 25g, etc.
    // The "Fill Up" button uses this ratio for direct FED purchase.
    fedRatio: 0.56,
  },
  town_smith: {
    type: 'smith',
    name: "Gerd's Forge",
    keeper: { name: 'Gerd', sprite: 'npc', mercantile: 5 },
    // At least one blade + the mace (keys from WEAPONS in items.js)
    sellInventory: ['short_sword', 'mace'],
    buyCategories: ['weapon'],
    buyPriceMod: 1.0,
    sellPriceMod: 1.0,
    bonusBuyTags: ['metal'],
  },
  town_leather: {
    type: 'leatherworker',
    name: 'Tanned & Bound',
    keeper: { name: 'Sif', sprite: 'npc', mercantile: 4 },
    // Three-tier leather progression (keys from ARMORS in items.js)
    sellInventory: ['wolf_leather', 'direwolf_leather', 'frost_troll_leather'],
    buyCategories: ['armor'],
    buyPriceMod: 1.0,
    sellPriceMod: 0.9,
    bonusBuyTags: ['leather', 'hide'],
  },
  town_scholar: {
    type: 'scholar',
    name: 'The Dusty Shelf',
    keeper: { name: 'Aldric', sprite: 'npc', mercantile: 2 },
    sellInventory: [],   // filled at runtime by initScholarInventory()
    buyCategories: ['book'],
    buyPriceMod: 1.2,
    sellPriceMod: 0.8,
    bonusBuyTags: [],
  },
};

/**
 * Call once after items.js is available to populate the scholar's
 * inventory with every book key in the game.
 */
export function initScholarInventory(bookKeys) {
  SHOP_PROFILES.town_scholar.sellInventory = bookKeys.slice();
}

// ==================== TOWN LAYOUT ====================
//
// Layout (17 wide × 11 tall, relative to top-left):
//
//  y=0   WWWWWWWWWWWWWWWWW   north wall
//  y=1   W...W...W...W...W   room row 1
//  y=2   W.K.W.K.W.K.W.K.W   shopkeepers
//  y=3   W...W...W...W...W   room row 3
//  y=4   WW.WWW.WWW.WWW.WW   south room wall + door gaps
//  y=5   W...............W   courtyard
//  y=6   W...............W
//  y=7   W...............W
//  y=8   W...............W
//  y=9   W...............W   courtyard (player spawns here)
//  y=10  WWWWWWWW..WWWWWWW   south wall + entrance gap
//
// Rooms share the outer north/side walls.  Dividing walls at dx = 4, 8, 12.
// Doors at dy=4 in front of each room center.
// South entrance at dx = 7–8.

const TW = 17;
const TH = 11;

// Room descriptors (relative to town top-left)
const ROOMS = [
  { ix: 1, iy: 1, shopKey: 'town_inn',     doorDx: 2,  deco: [[0, 0, T.BARREL], [2, 2, T.BARREL]] },
  { ix: 5, iy: 1, shopKey: 'town_smith',   doorDx: 6,  deco: [[0, 0, T.CRATE],  [2, 0, T.CRATE]]  },
  { ix: 9, iy: 1, shopKey: 'town_leather', doorDx: 10, deco: [[0, 0, T.BARREL], [2, 0, T.BARREL]] },
  { ix: 13,iy: 1, shopKey: 'town_scholar', doorDx: 14, deco: [[0, 0, T.CRATE],  [2, 2, T.CRATE]]  },
];

/**
 * Stamp the starting town onto the surface grid at centre (cx, cy).
 * Clears all existing ground and cover in the footprint, then places
 * walls, floors, shopkeepers, and decorations.
 *
 * @returns {{ spawnX: number, spawnY: number }} — where to place the player.
 */
export function placeStartingTown(layer, cx, cy) {
  const grid = worlds[layer];
  const coverGrid = covers[layer];

  const left = cx - Math.floor(TW / 2);
  const top  = cy - Math.floor(TH / 2);

  // --- 1. Fill entire footprint with WALL ground, clear cover ----
  for (let dy = 0; dy < TH; dy++) {
    for (let dx = 0; dx < TW; dx++) {
      grid[top + dy][left + dx] = T.WALL;
      coverGrid[top + dy][left + dx] = 0;
    }
  }

  // --- 2. Carve courtyard (rows 5–9, cols 1–15) ----
  for (let dy = 5; dy <= TH - 2; dy++) {
    for (let dx = 1; dx < TW - 1; dx++) {
      grid[top + dy][left + dx] = T.GRASS;
    }
  }

  // --- 3. Carve rooms & place shopkeepers ----
  for (const room of ROOMS) {
    const rx = left + room.ix;
    const ry = top + room.iy;

    // Carve 3×3 interior with WOOD_FLOOR
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        grid[ry + dy][rx + dx] = T.WOOD_FLOOR;
        coverGrid[ry + dy][rx + dx] = 0;
      }
    }

    // Door gap in south room wall (row 4)
    grid[top + 4][left + room.doorDx] = T.WOOD_FLOOR;

    // Shopkeeper — center of room
    const skX = rx + 1;
    const skY = ry + 1;
    coverGrid[skY][skX] = T.SHOPKEEPER;
    const profile = SHOP_PROFILES[room.shopKey];
    setFeature(layer, skX, skY, {
      type: 'shop_building',
      shopKey: room.shopKey,
      name: profile ? profile.name : room.shopKey,
    });

    // Decorative cover tiles
    for (const [ddx, ddy, decoType] of room.deco) {
      const dx = rx + ddx, dy = ry + ddy;
      if (coverGrid[dy][dx] === 0) {
        coverGrid[dy][dx] = decoType;
      }
    }
  }

  // --- 4. South entrance (2-tile gap) ----
  const entranceX = left + Math.floor(TW / 2);  // dx = 8
  grid[top + TH - 1][entranceX - 1] = T.GRASS;
  grid[top + TH - 1][entranceX]     = T.GRASS;

  // --- 5. Courtyard decoration — fountain ----
  coverGrid[top + 7][left + 8] = T.FOUNTAIN;

  // --- 6. Signpost just inside the entrance ----
  coverGrid[top + TH - 2][entranceX + 1] = T.SIGN;
  setFeature(layer, entranceX + 1, top + TH - 2, {
    type: 'sign',
    text: 'Welcome to Millhaven.\nInn · Forge · Leatherworks · Library',
  });

  // --- 7. Lamp posts at courtyard corners ----
  coverGrid[top + 5][left + 1]      = T.LAMP_POST;
  coverGrid[top + 5][left + TW - 2] = T.LAMP_POST;

  // Player spawns in the courtyard near the entrance
  return { spawnX: entranceX - 1, spawnY: top + TH - 2 };
}

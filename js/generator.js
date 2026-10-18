import { BRICK_PLATES } from './brickEngine.js';

/**
 * VoxelGrid accumulates 1x1x1 brick cells (each cell is 1 stud x 1 stud x 1 brick layer = 3 plates)
 * and then runs an alternating-layer greedy brick-merging pass so layers are built out of
 * authentic interlocking multi-stud LEGO bricks (2x4, 2x6, 2x3, 2x2, 1x4, 1x2, 1x1).
 */
export class VoxelGrid {
  constructor() {
    // key: `${x},${layer},${z}` -> { x, layer, z, color, hPlates }
    this.cells = new Map();
  }

  set(x, layer, z, color, hPlates = BRICK_PLATES) {
    if (layer < 0) return;
    const rx = Math.round(x);
    const rl = Math.round(layer);
    const rz = Math.round(z);
    if (!color) {
      this.cells.delete(`${rx},${rl},${rz}`);
      return;
    }
    this.cells.set(`${rx},${rl},${rz}`, {
      x: rx,
      layer: rl,
      z: rz,
      color,
      hPlates
    });
  }

  get(x, layer, z) {
    return this.cells.get(`${Math.round(x)},${Math.round(layer)},${Math.round(z)}`);
  }

  fillBox(x1, layer1, z1, x2, layer2, z2, color, hollow = false) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minL = Math.min(layer1, layer2), maxL = Math.max(layer1, layer2);
    const minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);
    for (let l = minL; l <= maxL; l++) {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (hollow) {
            const onEdge = (x === minX || x === maxX || z === minZ || z === maxZ);
            if (!onEdge) continue;
          }
          this.set(x, l, z, color);
        }
      }
    }
  }

  fillCylinder(cx, layer1, cz, radius, heightLayers, color, hollow = false) {
    const r2 = radius * radius;
    const innerR2 = Math.max(0, (radius - 1.15) * (radius - 1.15));
    for (let l = layer1; l < layer1 + heightLayers; l++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
          const dist2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
          if (dist2 <= r2) {
            if (hollow && dist2 < innerR2) continue;
            this.set(x, l, z, color);
          }
        }
      }
    }
  }

  fillSphere(cx, cl, cz, radius, color) {
    const r2 = radius * radius;
    for (let l = Math.floor(cl - radius); l <= Math.ceil(cl + radius); l++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
          const d2 = (x - cx) ** 2 + (l - cl) ** 2 + (z - cz) ** 2;
          if (d2 <= r2) {
            this.set(x, l, z, color);
          }
        }
      }
    }
  }

  /**
   * Merge 1x1 voxel cells into authentic interlocking LEGO bricks (2x4, 2x2, 1x4, 1x2, etc.)
   * Alternating orientation on even/odd layers creates staggered seams like real LEGO sets!
   */
  toInterlockingBricks() {
    const byLayer = new Map();
    for (const cell of this.cells.values()) {
      if (!byLayer.has(cell.layer)) {
        byLayer.set(cell.layer, []);
      }
      byLayer.get(cell.layer).push(cell);
    }

    const sortedLayers = Array.from(byLayer.keys()).sort((a, b) => a - b);
    const bricks = [];

    // Standard LEGO brick footprints [w, d]
    const shapesEven = [
      [2, 6], [2, 4], [2, 3], [2, 2],
      [6, 2], [4, 2], [3, 2],
      [1, 6], [1, 4], [1, 3], [1, 2],
      [6, 1], [4, 1], [3, 1], [2, 1],
      [1, 1]
    ];
    const shapesOdd = [
      [6, 2], [4, 2], [3, 2], [2, 2],
      [2, 6], [2, 4], [2, 3],
      [6, 1], [4, 1], [3, 1], [2, 1],
      [1, 6], [1, 4], [1, 3], [1, 2],
      [1, 1]
    ];

    for (const layer of sortedLayers) {
      const layerCells = byLayer.get(layer);
      const cellLookup = new Map();
      for (const c of layerCells) {
        cellLookup.set(`${c.x},${c.z}`, c);
      }

      // Sort cells spatially for deterministic sweep
      layerCells.sort((a, b) => (a.z !== b.z ? a.z - b.z : a.x - b.x));
      const candidateShapes = layer % 2 === 0 ? shapesEven : shapesOdd;

      const layerBricks = [];
      for (const startCell of layerCells) {
        const startKey = `${startCell.x},${startCell.z}`;
        if (!cellLookup.has(startKey)) continue;

        const targetColor = startCell.color;
        const targetH = startCell.hPlates || BRICK_PLATES;

        let chosenW = 1;
        let chosenD = 1;

        for (const [sw, sd] of candidateShapes) {
          let fits = true;
          for (let dx = 0; dx < sw && fits; dx++) {
            for (let dz = 0; dz < sd && fits; dz++) {
              const neighbor = cellLookup.get(`${startCell.x + dx},${startCell.z + dz}`);
              if (!neighbor || neighbor.color !== targetColor || (neighbor.hPlates || BRICK_PLATES) !== targetH) {
                fits = false;
              }
            }
          }
          if (fits) {
            chosenW = sw;
            chosenD = sd;
            break;
          }
        }

        // Consume cells
        for (let dx = 0; dx < chosenW; dx++) {
          for (let dz = 0; dz < chosenD; dz++) {
            cellLookup.delete(`${startCell.x + dx},${startCell.z + dz}`);
          }
        }

        layerBricks.push({
          x: startCell.x,
          y: layer * BRICK_PLATES,
          layer: layer + 1,
          z: startCell.z,
          w: chosenW,
          d: chosenD,
          hPlates: targetH,
          color: targetColor
        });
      }

      // Sort bricks within the layer in a pleasing radial/sweep order
      layerBricks.sort((a, b) => (a.z !== b.z ? a.z - b.z : a.x - b.x));
      bricks.push(...layerBricks);
    }

    return bricks;
  }
}

// 5x5 Pixel Font for 3D LEGO Text Builder
const FONT_5X5 = {
  A: ['01110', '10001', '11111', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  F: ['11111', '10000', '11110', '10000', '10000'],
  G: ['01111', '10000', '10011', '10001', '01111'],
  H: ['10001', '10001', '11111', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '11100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '11110', '10000', '10000'],
  Q: ['01110', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '11110', '10010', '10001'],
  S: ['01111', '10000', '01110', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10101', '11011', '10001'],
  X: ['10001', '01010', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100'],
  Z: ['11111', '00010', '00100', '01000', '11111'],
  0: ['01110', '10011', '10101', '11001', '01110'],
  1: ['00100', '01100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00110', '01000', '11111'],
  3: ['11110', '00001', '01110', '00001', '11110'],
  4: ['10010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '11110'],
  6: ['01111', '10000', '11110', '10001', '01110'],
  7: ['11111', '00010', '00100', '01000', '01000'],
  8: ['01110', '10001', '01110', '10001', '01110'],
  9: ['01110', '10001', '01111', '00001', '11110'],
  '!': ['00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '00010', '00100', '00000', '00100']
};

/**
 * Extract color and scale hints from user prompt text
 */
function parseModifiers(prompt) {
  const p = prompt.toLowerCase();
  const mentionedColors = [];
  const colorKeywords = [
    ['red', 'red'], ['crimson', 'red'], ['scarlet', 'red'],
    ['blue', 'blue'], ['navy', 'blue'],
    ['cyan', 'azure'], ['azure', 'azure'], ['teal', 'azure'], ['neon', 'azure'],
    ['yellow', 'yellow'], ['gold', 'gold'], ['golden', 'gold'],
    ['green', 'green'], ['emerald', 'green'], ['forest', 'green'],
    ['lime', 'lime'],
    ['orange', 'orange'],
    ['purple', 'purple'], ['violet', 'purple'],
    ['pink', 'pink'], ['magenta', 'pink'],
    ['white', 'white'], ['snow', 'white'],
    ['black', 'black'], ['dark', 'dark_grey'], ['obsidian', 'black'],
    ['grey', 'light_grey'], ['gray', 'light_grey'], ['stone', 'light_grey'],
    ['tan', 'tan'], ['sand', 'tan'], ['desert', 'tan'],
    ['brown', 'brown'], ['wood', 'brown'], ['wooden', 'brown']
  ];

  for (const [kw, colId] of colorKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(p) && !mentionedColors.includes(colId)) {
      mentionedColors.push(colId);
    }
  }

  const isTall = /\b(tall|giant|huge|mega|big|high)\b/i.test(p);
  const hasMoat = /\b(moat|water|river|island)\b/i.test(p);

  return {
    primaryColor: mentionedColors[0] || null,
    secondaryColor: mentionedColors[1] || null,
    isTall,
    hasMoat
  };
}

// ============================================================================
// PROCEDURAL 3D LEGO ARCHITECTURAL GENERATORS
// ============================================================================

function buildCastle(v, mods, ox = 0, oz = 0) {
  const wallColor = mods.primaryColor || 'light_grey';
  const trimColor = mods.secondaryColor || 'dark_grey';
  const roofColor = 'red';
  const wallH = mods.isTall ? 9 : 6;
  const towerH = wallH + 4;
  const half = 9;

  // Optional water moat & drawbridge
  if (mods.hasMoat) {
    v.fillBox(ox - 13, 0, oz - 13, ox + 13, 0, oz + 13, 'trans_blue', false);
    v.fillBox(ox - 10, 0, oz - 10, ox + 10, 0, oz + 10, 'green', false);
    // Wooden drawbridge
    v.fillBox(ox - 2, 0, oz + 9, ox + 2, 0, oz + 13, 'brown', false);
  }

  // Outer Fortress Walls
  v.fillBox(ox - half, 0, oz - half, ox + half, wallH - 1, oz + half, wallColor, true);

  // Wall Battlements (Crenellations)
  for (let i = -half; i <= half; i += 2) {
    v.set(ox + i, wallH, oz - half, trimColor);
    v.set(ox + i, wallH, oz + half, trimColor);
    v.set(ox - half, wallH, oz + i, trimColor);
    v.set(ox + half, wallH, oz + i, trimColor);
  }

  // Front Gatehouse Archway
  for (let l = 0; l < 4; l++) {
    for (let x = -2; x <= 2; x++) {
      if (l === 3 && Math.abs(x) === 2) continue; // arched top corners
      v.set(ox + x, l, oz + half, null);
    }
  }
  // Gatehouse twin pillars
  v.fillBox(ox - 3, 0, oz + half, ox - 3, wallH + 1, oz + half + 1, trimColor);
  v.fillBox(ox + 3, 0, oz + half, ox + 3, wallH + 1, oz + half + 1, trimColor);
  v.fillBox(ox - 3, wallH, oz + half + 1, ox + 3, wallH + 1, oz + half + 1, wallColor);

  // 4 Corner Towers
  const corners = [
    [-half, -half],
    [half - 3, -half],
    [-half, half - 3],
    [half - 3, half - 3]
  ];

  for (const [cx, cz] of corners) {
    v.fillBox(ox + cx, 0, oz + cz, ox + cx + 3, towerH - 1, oz + cz + 3, wallColor, true);
    // Tower rim
    v.fillBox(ox + cx - 1, towerH, oz + cz - 1, ox + cx + 4, towerH, oz + cz + 4, trimColor, true);
    // Conical spire roof
    v.fillBox(ox + cx, towerH + 1, oz + cz, ox + cx + 3, towerH + 1, oz + cz + 3, roofColor);
    v.fillBox(ox + cx + 1, towerH + 2, oz + cz + 1, ox + cx + 2, towerH + 3, oz + cz + 2, roofColor);
    // Flag pole
    v.set(ox + cx + 1, towerH + 4, oz + cz + 1, 'gold');
  }

  // Central Royal Keep inside courtyard
  const keepH = towerH + 2;
  v.fillBox(ox - 4, 0, oz - 4, ox + 4, keepH - 1, oz + 4, wallColor, true);
  // Stained glass windows on Keep
  for (let l = 3; l < keepH - 2; l += 2) {
    v.set(ox - 2, l, oz + 4, 'trans_blue');
    v.set(ox + 2, l, oz + 4, 'trans_blue');
    v.set(ox, l, oz - 4, 'trans_blue');
  }
  // Keep roof & royal banner
  v.fillBox(ox - 4, keepH, oz - 4, ox + 4, keepH, oz + 4, trimColor);
  v.fillBox(ox - 3, keepH + 1, oz - 3, ox + 3, keepH + 1, oz + 3, roofColor);
  v.fillBox(ox - 1, keepH + 2, oz - 1, ox + 1, keepH + 3, oz + 1, roofColor);
  v.fillBox(ox, keepH + 4, oz, ox, keepH + 6, oz, 'light_grey');
  v.fillBox(ox + 1, keepH + 5, oz, ox + 3, keepH + 6, oz, 'gold');
}

function buildCar(v, mods, ox = 0, oz = 0) {
  const bodyColor = mods.primaryColor || 'red';
  const stripeColor = mods.secondaryColor || 'white';

  // 4 Wheels (3x3x2 tire blocks)
  const wheelPositions = [
    [-5, -6], [4, -6],
    [-5, 4], [4, 4]
  ];
  for (const [wx, wz] of wheelPositions) {
    v.fillBox(ox + wx, 0, oz + wz, ox + wx + 1, 1, oz + wz + 2, 'black');
    // Hubcap
    v.set(ox + wx + (wx < 0 ? 0 : 1), 0, oz + wz + 1, 'light_grey');
  }

  // Lower Chassis & Floorpan
  v.fillBox(ox - 4, 0, oz - 8, ox + 4, 0, oz + 8, 'dark_grey');

  // Main Aerodynamic Body
  v.fillBox(ox - 4, 1, oz - 8, ox + 4, 2, oz + 8, bodyColor);
  // Racing center stripe
  v.fillBox(ox - 1, 2, oz - 8, ox + 1, 2, oz + 8, stripeColor);

  // Front Hood slope & Headlights
  v.fillBox(ox - 4, 2, oz + 8, ox - 3, 2, oz + 8, 'trans_orange');
  v.fillBox(ox + 3, 2, oz + 8, ox + 4, 2, oz + 8, 'trans_orange');
  v.fillBox(ox - 2, 1, oz + 9, ox + 2, 1, oz + 9, 'dark_grey'); // front splitter

  // Rear Taillights & Exhaust
  v.fillBox(ox - 4, 2, oz - 8, ox - 3, 2, oz - 8, 'red');
  v.fillBox(ox + 3, 2, oz - 8, ox + 4, 2, oz - 8, 'red');
  v.set(ox - 2, 1, oz - 9, 'light_grey');
  v.set(ox + 2, 1, oz - 9, 'light_grey');

  // Cabin & Trans-Blue Windshield
  v.fillBox(ox - 3, 3, oz - 3, ox + 3, 4, oz + 3, 'trans_blue', true);
  // Roof
  v.fillBox(ox - 3, 5, oz - 3, ox + 3, 5, oz + 2, bodyColor);
  v.fillBox(ox - 1, 5, oz - 3, ox + 1, 5, oz + 2, stripeColor);

  // Rear Racing Spoiler Wing
  v.fillBox(ox - 3, 3, oz - 8, ox - 3, 4, oz - 7, 'dark_grey');
  v.fillBox(ox + 3, 3, oz - 8, ox + 3, 4, oz - 7, 'dark_grey');
  v.fillBox(ox - 5, 5, oz - 8, ox + 5, 5, oz - 6, bodyColor);
}

function buildSpaceship(v, mods, ox = 0, oz = 0) {
  const hullColor = mods.primaryColor || 'light_grey';
  const accentColor = mods.secondaryColor || 'blue';

  // Display landing stand pillars
  v.fillBox(ox - 1, 0, oz - 3, ox + 1, 1, oz - 1, 'dark_grey');
  v.fillBox(ox - 1, 0, oz + 4, ox + 1, 1, oz + 5, 'dark_grey');

  // Central Fuselage Spine (Z from -10 to +11)
  for (let z = -9; z <= 11; z++) {
    const halfW = z > 4 ? Math.max(0, Math.floor((12 - z) / 2)) : 3;
    v.fillBox(ox - halfW, 2, oz + z, ox + halfW, 3, oz + z, hullColor);
    if (halfW >= 1) {
      v.fillBox(ox - 1, 4, oz + z, ox + 1, 4, oz + z, accentColor);
    }
  }

  // Swept Delta Wings
  for (let z = -8; z <= 3; z++) {
    const span = Math.floor((4 - z) * 1.1) + 3;
    v.fillBox(ox - span, 2, oz + z, ox + span, 2, oz + z, hullColor);
    // Wing accent stripes
    if (z >= -5 && z <= -1) {
      v.set(ox - span + 2, 3, oz + z, accentColor);
      v.set(ox + span - 2, 3, oz + z, accentColor);
    }
  }

  // Wingtip Laser Cannons
  v.fillBox(ox - 14, 2, oz - 7, ox - 14, 3, oz - 1, 'dark_grey');
  v.set(ox - 14, 2, oz, 'trans_orange');
  v.fillBox(ox + 14, 2, oz - 7, ox + 14, 3, oz - 1, 'dark_grey');
  v.set(ox + 14, 2, oz, 'trans_orange');

  // Cockpit Canopy (Translucent Blue)
  v.fillBox(ox - 2, 4, oz - 2, ox + 2, 5, oz + 4, 'trans_blue');

  // Dorsal Stabilizer Fin
  for (let l = 4; l <= 8; l++) {
    v.fillBox(ox, l, oz - 9, ox, l, oz - 4 - (l - 4), accentColor);
  }

  // Twin Rear Booster Engines + Glowing Flames
  v.fillBox(ox - 4, 2, oz - 11, ox - 2, 4, oz - 9, 'dark_grey');
  v.fillBox(ox + 2, 2, oz - 11, ox + 4, 4, oz - 9, 'dark_grey');
  v.fillBox(ox - 3, 3, oz - 13, ox - 3, 3, oz - 11, 'trans_orange');
  v.fillBox(ox + 3, 3, oz - 13, ox + 3, 3, oz - 11, 'trans_orange');
}

function buildRobot(v, mods, ox = 0, oz = 0) {
  const mainColor = mods.primaryColor || 'blue';
  const secondaryColor = mods.secondaryColor || 'light_grey';

  // Feet / Boots
  v.fillBox(ox - 5, 0, oz - 2, ox - 2, 1, oz + 3, mainColor);
  v.fillBox(ox + 2, 0, oz - 2, ox + 5, 1, oz + 3, mainColor);

  // Legs
  v.fillBox(ox - 4, 2, oz - 1, ox - 2, 6, oz + 1, secondaryColor);
  v.fillBox(ox + 2, 2, oz - 1, ox + 4, 6, oz + 1, secondaryColor);
  // Knee guards
  v.fillBox(ox - 4, 4, oz + 2, ox - 2, 5, oz + 2, 'yellow');
  v.fillBox(ox + 2, 4, oz + 2, ox + 4, 5, oz + 2, 'yellow');

  // Pelvis / Waist
  v.fillBox(ox - 4, 7, oz - 2, ox + 4, 8, oz + 2, 'dark_grey');

  // Armored Torso
  v.fillBox(ox - 5, 9, oz - 3, ox + 5, 15, oz + 3, mainColor);
  // Glowing Power Core on Chest
  v.fillBox(ox - 2, 11, oz + 3, ox + 2, 13, oz + 3, 'trans_blue');
  v.set(ox, 12, oz + 4, 'trans_orange');

  // Shoulder Pauldrons & Articulated Arms
  v.fillBox(ox - 8, 13, oz - 2, ox - 6, 15, oz + 2, mainColor);
  v.fillBox(ox + 6, 13, oz - 2, ox + 8, 15, oz + 2, mainColor);
  v.fillBox(ox - 8, 8, oz - 1, ox - 6, 12, oz + 1, secondaryColor);
  v.fillBox(ox + 6, 8, oz - 1, ox + 8, 12, oz + 1, secondaryColor);
  // Hands / Claws
  v.fillBox(ox - 8, 7, oz - 1, ox - 6, 7, oz + 2, 'dark_grey');
  v.fillBox(ox + 6, 7, oz - 1, ox + 8, 7, oz + 2, 'dark_grey');

  // Neck & Head
  v.fillBox(ox - 1, 16, oz - 1, ox + 1, 16, oz + 1, 'dark_grey');
  v.fillBox(ox - 3, 17, oz - 2, ox + 3, 20, oz + 2, secondaryColor);
  // Glowing Visor Eyes
  v.fillBox(ox - 2, 18, oz + 2, ox + 2, 19, oz + 2, 'trans_orange');
  // Top Antenna
  v.fillBox(ox, 21, oz, ox, 22, oz, 'light_grey');
  v.set(ox, 23, oz, 'red');
}

function buildHouse(v, mods, ox = 0, oz = 0) {
  const wallColor = mods.primaryColor || 'tan';
  const roofColor = mods.secondaryColor || 'red';

  // Green Lawn & Garden Path
  v.fillBox(ox - 11, 0, oz - 9, ox + 11, 0, oz + 11, 'green');
  v.fillBox(ox - 1, 0, oz + 5, ox + 1, 0, oz + 11, 'light_grey');

  // House Walls
  v.fillBox(ox - 7, 1, oz - 6, ox + 6, 7, oz + 5, wallColor, true);

  // Front Door
  v.fillBox(ox - 1, 1, oz + 5, ox + 1, 4, oz + 5, 'brown');
  v.set(ox + 1, 2, oz + 5, 'gold'); // doorknob
  v.set(ox - 2, 4, oz + 6, 'trans_orange'); // porch lantern

  // Windows with Trans-Blue Glass & Flower Boxes
  const winX = [-5, 4];
  for (const wx of winX) {
    v.fillBox(ox + wx, 3, oz + 5, ox + wx + 1, 5, oz + 5, 'trans_blue');
    v.fillBox(ox + wx, 2, oz + 6, ox + wx + 1, 2, oz + 6, 'brown');
    v.set(ox + wx, 3, oz + 6, 'pink');
    v.set(ox + wx + 1, 3, oz + 6, 'yellow');
  }

  // Stepped Pitched Roof
  for (let step = 0; step <= 6; step++) {
    v.fillBox(
      ox - 8,
      8 + step,
      oz - 6 + step,
      ox + 7,
      8 + step,
      oz + 6 - step,
      roofColor
    );
  }

  // Brick Chimney
  v.fillBox(ox + 4, 8, oz - 4, ox + 6, 15, oz - 2, 'brown');
  v.set(ox + 5, 16, oz - 3, 'white');
  v.set(ox + 5, 17, oz - 4, 'white');

  // Side Pine Tree in the yard
  buildTree(v, { primaryColor: 'green' }, ox - 9, oz + 7, true);
}

function buildTree(v, mods, ox = 0, oz = 0, small = false) {
  const leafColor = mods.primaryColor || 'green';
  const trunkH = small ? 4 : 7;

  // Trunk & Roots
  v.fillBox(ox - 1, 1, oz - 1, ox + 1, trunkH, oz + 1, 'brown');
  if (!small) {
    v.set(ox - 2, 1, oz, 'brown');
    v.set(ox + 2, 1, oz, 'brown');
    v.set(ox, 1, oz - 2, 'brown');
    v.set(ox, 1, oz + 2, 'brown');
  }

  // Layered Foliage Canopy
  const layers = small ? 4 : 7;
  for (let i = 0; i < layers; i++) {
    const r = Math.max(1, (small ? 4 : 6) - Math.floor(i * 0.75));
    v.fillCylinder(ox, trunkH + i, oz, r, 1, i % 2 === 0 ? leafColor : 'lime');
  }
}

function buildDinosaur(v, mods, ox = 0, oz = 0) {
  const skinColor = mods.primaryColor || 'green';
  const bellyColor = mods.secondaryColor || 'lime';

  // Feet & Claws
  v.fillBox(ox - 4, 0, oz - 1, ox - 2, 1, oz + 3, skinColor);
  v.fillBox(ox + 2, 0, oz - 1, ox + 4, 1, oz + 3, skinColor);

  // Muscular Legs
  v.fillBox(ox - 4, 2, oz - 1, ox - 2, 6, oz + 1, skinColor);
  v.fillBox(ox + 2, 2, oz - 1, ox + 4, 6, oz + 1, skinColor);

  // Body & Tail
  for (let z = -10; z <= 3; z++) {
    const yBase = z < -3 ? 6 + Math.floor((z + 3) * -0.25) : 6;
    const halfW = z < -4 ? Math.max(0, 3 + Math.floor((z + 4) / 2)) : 3;
    const h = z < -4 ? 2 : 4;
    v.fillBox(ox - halfW, yBase, oz + z, ox + halfW, yBase + h, oz + z, skinColor);
  }
  v.fillBox(ox - 2, 6, oz + 3, ox + 2, 10, oz + 3, bellyColor);

  // Tiny T-Rex Arms
  v.fillBox(ox - 4, 9, oz + 2, ox - 4, 9, oz + 5, skinColor);
  v.fillBox(ox + 4, 9, oz + 2, ox + 4, 9, oz + 5, skinColor);

  // Neck & Giant T-Rex Head
  v.fillBox(ox - 2, 11, oz + 1, ox + 2, 13, oz + 4, skinColor);
  v.fillBox(ox - 3, 13, oz + 1, ox + 3, 16, oz + 8, skinColor);
  // Lower Jaw & White Teeth
  v.fillBox(ox - 2, 12, oz + 4, ox + 2, 12, oz + 8, skinColor);
  for (let z = 5; z <= 8; z += 2) {
    v.set(ox - 2, 13, oz + z, 'white');
    v.set(ox + 2, 13, oz + z, 'white');
  }
  // Eyes
  v.set(ox - 3, 15, oz + 4, 'yellow');
  v.set(ox + 3, 15, oz + 4, 'yellow');
}

function buildLighthouse(v, mods, ox = 0, oz = 0) {
  const stripe1 = mods.primaryColor || 'red';
  const stripe2 = mods.secondaryColor || 'white';

  // Ocean Base & Rocky Island
  v.fillCylinder(ox, 0, oz, 11, 1, 'trans_blue');
  v.fillCylinder(ox, 1, oz, 7, 2, 'dark_grey');

  // Striped Cylindrical Lighthouse Tower
  for (let l = 3; l <= 18; l++) {
    const r = l < 8 ? 4 : l < 14 ? 3.5 : 3;
    const col = Math.floor((l - 3) / 3) % 2 === 0 ? stripe1 : stripe2;
    v.fillCylinder(ox, l, oz, r, 1, col, true);
  }

  // Black Observation Deck
  v.fillCylinder(ox, 19, oz, 4.2, 1, 'black');

  // Glowing Lantern Room
  v.fillCylinder(ox, 20, oz, 2.8, 3, 'trans_orange');
  v.set(ox, 21, oz, 'yellow');

  // Pointed Red Roof Dome
  v.fillCylinder(ox, 23, oz, 3.5, 1, stripe1);
  v.fillCylinder(ox, 24, oz, 2.2, 1, stripe1);
  v.set(ox, 25, oz, 'gold');
}

function buildPyramid(v, mods, ox = 0, oz = 0) {
  const stoneColor = mods.primaryColor || 'tan';
  const capColor = mods.secondaryColor || 'gold';

  const levels = 13;
  for (let l = 0; l < levels; l++) {
    const half = levels - l;
    const col = l >= levels - 3 ? capColor : stoneColor;
    v.fillBox(ox - half, l, oz - half, ox + half, l, oz + half, col, l < levels - 3);
  }

  // Grand Pharaoh Entrance Portal on front face
  v.fillBox(ox - 2, 0, oz + levels - 2, ox + 2, 3, oz + levels + 1, stoneColor);
  v.fillBox(ox - 1, 0, oz + levels - 2, ox + 1, 2, oz + levels + 1, null);
  v.set(ox - 2, 3, oz + levels + 1, 'gold');
  v.set(ox + 2, 3, oz + levels + 1, 'gold');
}

function buildSkyscraper(v, mods, ox = 0, oz = 0) {
  const frameColor = mods.primaryColor || 'dark_grey';
  const neonColor = mods.secondaryColor || 'azure';

  // Plaza Base
  v.fillBox(ox - 7, 0, oz - 7, ox + 7, 1, oz + 7, 'light_grey');

  // Tiered Glass & Neon Tower
  for (let l = 2; l <= 22; l++) {
    const half = l < 10 ? 5 : l < 17 ? 4 : 3;
    const isFloorBand = l % 3 === 0;
    v.fillBox(ox - half, l, oz - half, ox + half, l, oz + half, isFloorBand ? frameColor : 'trans_blue', true);
    // Corner neon pillars
    v.set(ox - half, l, oz - half, neonColor);
    v.set(ox + half, l, oz - half, neonColor);
    v.set(ox - half, l, oz + half, neonColor);
    v.set(ox + half, l, oz + half, neonColor);
  }

  // Rooftop Crown & Spire
  v.fillBox(ox - 2, 23, oz - 2, ox + 2, 24, oz + 2, frameColor);
  v.fillBox(ox, 25, oz, ox, 28, oz, neonColor);
}

function build3DText(v, rawText, mods) {
  const clean = rawText
    .replace(/^(word|text|spell|letters?)\s*:\s*/i, '')
    .toUpperCase()
    .replace(/[^A-Z0-9!? ]/g, '')
    .slice(0, 8) || 'LEGO';

  const charW = 6;
  const totalW = clean.length * charW;
  const startX = -Math.floor(totalW / 2);

  // Decorative Base Plinth
  v.fillBox(startX - 2, 0, -3, startX + totalW + 1, 0, 3, 'dark_grey');
  v.fillBox(startX - 1, 1, -2, startX + totalW, 1, 2, 'light_grey');

  const palette = ['red', 'yellow', 'blue', 'green', 'orange', 'purple', 'azure'];

  for (let ci = 0; ci < clean.length; ci++) {
    const ch = clean[ci];
    if (ch === ' ') continue;
    const bitmap = FONT_5X5[ch] || FONT_5X5['?'];
    const col = mods.primaryColor || palette[ci % palette.length];
    const cx = startX + ci * charW;

    for (let row = 0; row < 5; row++) {
      const layer = 2 + (4 - row); // flip vertically so row 0 is top
      for (let bit = 0; bit < 5; bit++) {
        if (bitmap[row][bit] === '1') {
          v.fillBox(cx + bit, layer, -1, cx + bit, layer, 1, col);
        }
      }
    }
  }
}

/**
 * Call Gemini or OpenAI API to generate a structured 3D primitive blueprint for any open-ended prompt
 */
async function generateWithLLM(prompt, provider, apiKey) {
  const systemInstruction = `You are a 3D LEGO Master Builder. Given a user prompt, output ONLY valid JSON containing a "title" and an array of 3D primitives ("operations") on an integer grid where X is [-16, 16], Y (layer) is [0, 24] (0 is ground), and Z is [-16, 16].
Valid colors: "red", "blue", "yellow", "green", "lime", "orange", "white", "light_grey", "dark_grey", "black", "tan", "brown", "azure", "purple", "pink", "gold", "trans_blue", "trans_orange".
Each operation in "operations" must be one of:
1. {"op": "box", "x1": int, "y1": int, "z1": int, "x2": int, "y2": int, "z2": int, "color": string, "hollow": boolean}
2. {"op": "cylinder", "cx": int, "y1": int, "cz": int, "radius": number, "height": int, "color": string, "hollow": boolean}
3. {"op": "sphere", "cx": int, "cy": int, "cz": int, "radius": number, "color": string}
Use 12 to 35 operations to construct a detailed, recognizable, colorful 3D LEGO model.`;

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemInstruction}\n\nUser prompt: ${prompt}` }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    if (!resp.ok) throw new Error(`Gemini API HTTP ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text);
  } else if (provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!resp.ok) throw new Error(`OpenAI API HTTP ${resp.status}`);
    const data = await resp.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  }
  throw new Error('Unsupported provider');
}

/**
 * Main entry point: takes any natural language prompt and returns
 * { title, bricks: Array<{x, y, z, w, d, hPlates, color, layer}>, source }
 */
export async function generateLegoModel(prompt, aiConfig = {}) {
  const cleanPrompt = (prompt || 'Medieval Castle').trim();
  const lower = cleanPrompt.toLowerCase();
  const mods = parseModifiers(cleanPrompt);
  const v = new VoxelGrid();

  // 1. If LLM API key is configured, try live LLM generation first
  if (aiConfig.provider && aiConfig.provider !== 'procedural' && aiConfig.apiKey) {
    try {
      const blueprint = await generateWithLLM(cleanPrompt, aiConfig.provider, aiConfig.apiKey);
      if (blueprint && Array.isArray(blueprint.operations) && blueprint.operations.length > 0) {
        for (const op of blueprint.operations) {
          if (op.op === 'box') {
            v.fillBox(op.x1, op.y1, op.z1, op.x2, op.y2, op.z2, op.color || 'red', !!op.hollow);
          } else if (op.op === 'cylinder') {
            v.fillCylinder(op.cx, op.y1, op.cz, op.radius || 3, op.height || 3, op.color || 'red', !!op.hollow);
          } else if (op.op === 'sphere') {
            v.fillSphere(op.cx, op.cy, op.cz, op.radius || 3, op.color || 'red');
          }
        }
        const bricks = v.toInterlockingBricks();
        if (bricks.length > 0) {
          return {
            title: blueprint.title || cleanPrompt,
            bricks,
            source: `AI (${aiConfig.provider})`
          };
        }
      }
    } catch (err) {
      console.warn('LLM API fallback to built-in Procedural Architect:', err.message);
    }
  }

  // 2. Built-in Procedural 3D LEGO Architect
  let title = cleanPrompt.charAt(0).toUpperCase() + cleanPrompt.slice(1);

  if (/^(word|text|spell|letters?)\s*:/i.test(cleanPrompt)) {
    build3DText(v, cleanPrompt, mods);
  } else if (/\b(castle|fortress|citadel|palace|kingdom|keep)\b/i.test(lower)) {
    buildCastle(v, mods);
  } else if (/\b(car|race\s*car|sports\s*car|vehicle|truck|ferrari|mustang|auto)\b/i.test(lower)) {
    buildCar(v, mods);
  } else if (/\b(spaceship|starfighter|rocket|shuttle|ufo|x-wing|spacecraft|jet|plane)\b/i.test(lower)) {
    buildSpaceship(v, mods);
  } else if (/\b(robot|mech|gundam|android|bot|cyborg)\b/i.test(lower)) {
    buildRobot(v, mods);
  } else if (/\b(dino|dinosaur|t-rex|trex|dragon|monster|godzilla)\b/i.test(lower)) {
    buildDinosaur(v, mods);
  } else if (/\b(lighthouse|beacon)\b/i.test(lower)) {
    buildLighthouse(v, mods);
  } else if (/\b(pyramid|egypt|sphinx|temple|ziggurat)\b/i.test(lower)) {
    buildPyramid(v, mods);
  } else if (/\b(skyscraper|cyberpunk|office|tower|empire\s*state|city)\b/i.test(lower)) {
    buildSkyscraper(v, mods);
  } else if (/\b(house|cottage|home|cabin|villa|chalet)\b/i.test(lower)) {
    buildHouse(v, mods);
  } else if (/\b(tree|forest|pine|oak|bonsai|garden)\b/i.test(lower)) {
    buildTree(v, mods, 0, 0, false);
  } else if (cleanPrompt.length <= 8 && /^[a-z0-9!? ]+$/i.test(cleanPrompt)) {
    // Short single word -> build it in 3D LEGO typography!
    build3DText(v, cleanPrompt, mods);
  } else {
    // Intelligent hybrid scene composer for any other descriptive prompt
    buildHouse(v, mods, -4, 0);
    buildCar(v, { primaryColor: mods.secondaryColor || 'blue' }, 11, 2);
  }

  const bricks = v.toInterlockingBricks();
  return {
    title,
    bricks,
    source: 'Procedural 3D Architect'
  };
}

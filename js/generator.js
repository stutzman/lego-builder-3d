import { BRICK_PLATES, COLOR_MAP } from './brickEngine.js';

/**
 * VoxelGrid accumulates 1x1x1 brick cells (each cell is 1 stud x 1 stud x 1 brick layer = 3 plates)
 * and then runs an alternating-layer greedy brick-merging pass so layers are built out of
 * authentic interlocking multi-stud LEGO bricks (2x4, 2x6, 2x3, 2x2, 1x4, 1x2, 1x1).
 */
export class VoxelGrid {
  constructor() {
    // key: `${x},${layer},${z}` -> { x, layer, z, color, hPlates }
    this.cells = new Map();
    this.parts = [];
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
function addModelDetails(v, kind, mods, ox = 0, oz = 0) {
  const part = (type, x, y, z, w, d, color, hPlates = 3) => {
    v.parts.push({ part: type, x: ox + x, y, z: oz + z, w, d, color, hPlates, layer: Math.floor(y / 3) + 1 });
  };
  const plate = (x, y, z, w, d, color) => v.parts.push({ x: ox+x, y, z: oz+z, w, d, color, hPlates: 1, layer: Math.floor(y/3)+1 });
  if (mods.technic) {
    if (kind === 'car') {
      for (const z of [-6, 4]) {
        part('axle', -6, 2, z+1, 13, 1, 'dark_grey');
        for (const x of [-6, 5]) {
          part('wheel', x, 0, z, 1, 3, 'black', 8);
          part('gear', x, 2, z+1, 1, 1, 'light_grey', 3);
        }
      }
      for (const x of [-4, 4]) part('beam', x, 9, -2, 1, 5, mods.primaryColor || 'red');
      part('gear', -1, 9, -6, 3, 1, 'light_grey', 8);
      part('pin', 0, 11, -6, 1, 2, 'blue');
    } else if (kind === 'robot') {
      for (const x of [-9, 8]) {
        part('beam', x, 27, -1, 1, 5, 'dark_grey');
        part('gear', x, 37, -1, 1, 3, 'light_grey', 8);
        part('pin', x-0.5, 40, 0, 2, 1, 'blue');
      }
    } else if (kind === 'spaceship') {
      for (const x of [-9, 8]) part('beam', x, 9, -6, 1, 7, 'dark_grey');
      for (const x of [-3, 3]) part('axle', x, 12, -13, 1, 5, 'light_grey');
    } else if (kind === 'castle') {
      part('beam', -2, 13, 10, 5, 1, 'brown');
      for (const x of [-3, 3]) part('gear', x, 10, 10, 3, 1, 'dark_grey', 8);
    }
  }
  if (!mods.detailed) return;
  if (kind === 'car') {
    for (const x of [-5, 5]) {
      plate(x, 9, 1, 1, 2, 'black'); // wing mirrors
      for (let z = -5; z <= -3; z++) plate(x < 0 ? -3 : 2, 9, z, 1, 1, 'black');
    }
    for (const x of [-2, 0, 2]) plate(x, 6, 9, 1, 1, 'light_grey');
    for (const z of [-7, -5]) plate(-2, 9, z, 5, 1, 'dark_grey');
  } else if (kind === 'castle') {
    const h = mods.isTall ? 9 : 6;
    for (let x = -7; x <= 7; x += 2) {
      for (const z of [-10, 10]) {
        if (z === 10 && Math.abs(x) < 4) continue;
        v.fillBox(ox+x, 0, oz+z, ox+x, h-2, oz+z, 'dark_grey');
        plate(x, (h-1)*3, z, 1, 1, 'light_grey');
      }
    }
    for (let z = 5; z < 9; z++) for (let x = -1; x <= 1; x++) v.set(ox+x, 0, oz+z, (x+z)%2 ? 'tan' : 'light_grey');
    for (const x of [-4, 4]) { v.set(ox+x, 3, oz+11, 'brown'); v.set(ox+x, 4, oz+11, 'trans_orange'); }
  } else if (kind === 'house') {
    for (let step=0; step<=6; step++) for (let x=-8; x<=6; x+=2) {
      for (const z of [-6+step, 6-step]) plate(x, (9+step)*3, z, 2, 1, (x+step)%3 ? (mods.secondaryColor || 'red') : 'brown');
    }
    for (const x of [-6, 3]) { v.fillBox(ox+x, 3, oz+6, ox+x, 5, oz+6, 'white'); }
    for (const x of [-4, 3]) v.fillBox(ox+x, 1, oz+8, ox+x, 4, oz+8, 'white');
    plate(-4, 15, 6, 8, 3, 'tan'); // porch canopy
    for (let x=-6; x<=6; x+=2) { v.set(ox+x,1,oz+10,'white'); v.set(ox+x,2,oz+10,'white'); }
  } else if (kind === 'spaceship') {
    for (const x of [-8, 7]) for (let z=-7; z<=-3; z+=2) plate(x,9,z,2,1,'dark_grey');
    for (const x of [-11, 10]) plate(x,9,-7,1,1,'trans_orange');
    for (const x of [-2, 2]) plate(x,18,0,1,2,'light_grey');
  } else if (kind === 'robot') {
    for (const x of [-4, 3]) for (let y=10; y<=14; y+=2) plate(x,y*3,4,2,1,'dark_grey');
    for (const x of [-3, 3]) v.set(ox+x,20,oz+3,'light_grey');
    for (const x of [-7,7]) v.set(ox+x,15,oz+3,'trans_orange');
  } else {
    // Fine surface texture, restricted to existing exposed cells: no floating ornaments.
    const cells = [...v.cells.values()];
    for (const c of cells) {
      if (v.get(c.x,c.layer+1,c.z) || (Math.abs(c.x*7+c.z*11+c.layer*3)%13)) continue;
      plate(c.x-ox,(c.layer+1)*3,c.z-oz,1,1,c.color);
    }
  }
}

function finishModel(v) {
  return [...v.toInterlockingBricks(), ...v.parts].sort((a,b) => a.y-b.y || a.z-b.z || a.x-b.x);
}

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
  addModelDetails(v, 'castle', mods, ox, oz);
}

function buildCar(v, mods, ox = 0, oz = 0) {
  const bodyColor = mods.primaryColor || 'red';
  const stripeColor = mods.secondaryColor || 'white';

  // 4 Wheels (3x3x2 tire blocks)
  const wheelPositions = [
    [-5, -6], [4, -6],
    [-5, 4], [4, 4]
  ];
  for (const [wx, wz] of (mods.technic ? [] : wheelPositions)) {
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
  addModelDetails(v, 'car', mods, ox, oz);
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
  addModelDetails(v, 'spaceship', mods, ox, oz);
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
  addModelDetails(v, 'robot', mods, ox, oz);
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
  addModelDetails(v, 'house', mods, ox, oz);
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
  addModelDetails(v, 'tree', mods, ox, oz);
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
  addModelDetails(v, 'dinosaur', mods, ox, oz);
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
  addModelDetails(v, 'lighthouse', mods, ox, oz);
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
  addModelDetails(v, 'pyramid', mods, ox, oz);
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
  addModelDetails(v, 'skyscraper', mods, ox, oz);
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

let cachedGeminiModels = null;

async function getGeminiCandidateModels(apiKey) {
  if (cachedGeminiModels) return cachedGeminiModels;
  const fallbackList = [
    'gemini-flash-latest',
    'gemini-3.0-flash',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.0-flash'
  ];
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    if (!resp.ok) return fallbackList;
    const data = await resp.json();
    const available = (data.models || [])
      .filter(m =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        /^models\/gemini-/i.test(m.name) &&
        !/(tts|image|imagen|embedding|veo|audio|live|computer-use|robotics|aqa|learnlm|thinking)/i.test(m.name)
      )
      .map(m => m.name.replace(/^models\//, ''));

    const scoreModel = (id) => {
      const verMatch = id.match(/gemini-(\d+(?:\.\d+)?)/i);
      const ver = verMatch && parseFloat(verMatch[1]) < 20 ? parseFloat(verMatch[1]) : 0;
      const isFlash = /flash/i.test(id) && !/lite|8b/i.test(id) ? 100 : (/flash/i.test(id) ? 50 : 0);
      const isStable = !/preview|exp/i.test(id) ? 2 : 0;
      return isFlash + ver * 10 + isStable;
    };

    available.sort((a, b) => scoreModel(b) - scoreModel(a));
    if (available.length > 0) {
      cachedGeminiModels = [...new Set([...available, ...fallbackList])];
      return cachedGeminiModels;
    }
  } catch (_) {
    // Ignore model list fetch failure and fall back to static list
  }
  return fallbackList;
}

function parseBlueprintText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const stripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (_) {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Invalid JSON from model');
  }
}

/**
 * Call Gemini or OpenAI API to generate a structured 3D primitive blueprint for any open-ended prompt
 */
async function generateWithLLM(prompt, provider, apiKey, options = {}) {
  const systemInstruction = `You are a 3D LEGO Master Builder. Given a user prompt, output ONLY valid JSON containing a "title" and an array of 3D primitives ("operations") on an integer grid where X is [-16, 16], Y (layer) is [0, 24] (0 is ground), and Z is [-16, 16].
Valid colors: "red", "blue", "yellow", "green", "lime", "orange", "white", "light_grey", "dark_grey", "black", "tan", "brown", "azure", "purple", "pink", "gold", "trans_blue", "trans_orange".
Each operation in "operations" must be one of:
1. {"op": "box", "x1": int, "y1": int, "z1": int, "x2": int, "y2": int, "z2": int, "color": string, "hollow": boolean}
2. {"op": "cylinder", "cx": int, "y1": int, "cz": int, "radius": number, "height": int, "color": string, "hollow": boolean}
3. {"op": "sphere", "cx": int, "cy": int, "cz": int, "radius": number, "color": string}
${options.detail === 'standard' ? 'Use 12 to 35 operations.' : 'Use 40 to 70 operations. Include layered panels, window frames, lights, vents, smaller trim, and a coherent supporting structure.'}
${options.technic !== false ? 'You may also use {"op":"part","part":"beam|axle|pin|gear|wheel","x":int,"y":int,"z":int,"w":int,"d":int,"color":string}. Here y is still in brick layers. Beam: 5x1 or 7x1, axle: 4x1, pin: 2x1, gear: 3x1, wheel: 1x3; swap w/d to rotate. Gears and wheels are vertical, all others horizontal. Place mechanical parts with support and clear space; do not fill their occupied region with boxes.' : 'Use only box, cylinder and sphere operations; do not include Technic parts.'}
Construct a recognizable, colorful 3D LEGO model.`;

  if (provider === 'gemini') {
    const candidates = await getGeminiCandidateModels(apiKey);
    let lastError = null;
    for (const modelId of candidates.slice(0, 6)) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemInstruction}\n\nUser prompt: ${prompt}` }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          const msg = errBody.error?.message || `Gemini API (${modelId}) HTTP ${resp.status}`;
          lastError = new Error(msg);
          if ((resp.status === 400 && /API_KEY_INVALID|API key not valid/i.test(msg)) || resp.status === 401 || resp.status === 403) {
            throw lastError;
          }
          continue;
        }
        const data = await resp.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        let parsed = null;
        for (let i = parts.length - 1; i >= 0; i--) {
          if (parts[i]?.thought) continue;
          if (parts[i]?.text) {
            try {
              parsed = parseBlueprintText(parts[i].text);
              if (parsed) break;
            } catch (_) {}
          }
        }
        if (!parsed && parts.length > 0) {
          parsed = parseBlueprintText(parts[parts.length - 1].text || '{}');
        }
        if (parsed) {
          cachedGeminiModels = [modelId, ...candidates.filter(m => m !== modelId)];
          parsed._modelId = modelId;
          return parsed;
        }
      } catch (err) {
        lastError = err;
        if (/API_KEY_INVALID|API key not valid/i.test(err.message)) {
          throw err;
        }
      }
    }
    throw lastError || new Error('No compatible Gemini model succeeded');
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
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `OpenAI API HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const rawText = data.choices?.[0]?.message?.content || '{}';
    return parseBlueprintText(rawText);
  }
  throw new Error('Unsupported provider');
}

function normalizeBrickColor(col) {
  if (!col || typeof col !== 'string') return 'red';
  const c = col.toLowerCase().trim().replace(/[\s-]+/g, '_');
  const aliases = {
    gray: 'light_grey',
    grey: 'light_grey',
    light_gray: 'light_grey',
    silver: 'light_grey',
    dark_gray: 'dark_grey',
    charcoal: 'dark_grey',
    cyan: 'azure',
    teal: 'azure',
    light_blue: 'azure',
    sky_blue: 'azure',
    magenta: 'pink',
    violet: 'purple',
    beige: 'tan',
    sand: 'tan',
    wood: 'brown',
    dark_brown: 'brown',
    clear: 'trans_blue',
    glass: 'trans_blue',
    transparent_blue: 'trans_blue',
    transparent_orange: 'trans_orange'
  };
  return aliases[c] || (COLOR_MAP[c] ? c : 'red');
}

/**
 * Main entry point: takes any natural language prompt and returns
 * { title, bricks: Array<{x, y, z, w, d, hPlates, color, layer}>, source, llmError? }
 */
export async function generateLegoModel(prompt, aiConfig = {}) {
  const cleanPrompt = (prompt || 'Medieval Castle').trim();
  const lower = cleanPrompt.toLowerCase();
  const mods = { ...parseModifiers(cleanPrompt), detailed: aiConfig.detail !== 'standard', technic: aiConfig.technic !== false };
  const v = new VoxelGrid();
  let llmError = null;

  const saved = SAVED_BUILDS.find(entry => entry.title.toLowerCase() === lower || entry.id === lower);
  if (saved) return createSavedBuild(saved.id);
  const vehicle = /\b(excavator|bulldozer|dump truck|mobile crane|construction crane)\b/i.exec(cleanPrompt);
  if (vehicle) return createSavedBuild('technic-' + (vehicle[0].toLowerCase().includes('crane') ? 'crane' : vehicle[0].toLowerCase().replace(' ', '-')));
  const animal = /\b(shark|whale|octopus|sea turtle|manta ray)\b/i.exec(cleanPrompt);
  if (animal) return createSavedBuild({shark:'reef-shark',whale:'blue-whale',octopus:'coral-octopus','sea turtle':'sea-turtle','manta ray':'manta-ray'}[animal[0].toLowerCase()]);

  // 1. If LLM API key is configured, try live LLM generation first
  const effectiveProvider = (aiConfig.apiKey && (!aiConfig.provider || aiConfig.provider === 'procedural'))
    ? (aiConfig.apiKey.startsWith('sk-') ? 'openai' : 'gemini')
    : aiConfig.provider;

  if (effectiveProvider && effectiveProvider !== 'procedural' && aiConfig.apiKey) {
    try {
      const blueprint = await generateWithLLM(cleanPrompt, effectiveProvider, aiConfig.apiKey, aiConfig);
      const ops = blueprint?.operations || blueprint?.primitives || blueprint?.steps || blueprint?.bricks || (Array.isArray(blueprint) ? blueprint : []);
      if (Array.isArray(ops) && ops.length > 0) {
        for (const op of ops) {
          const kind = String(op.op || op.type || op.shape || 'box').toLowerCase();
          const color = normalizeBrickColor(op.color);
          if (kind === 'part') {
            const type = String(op.part || '');
            if (mods.technic && ['beam','axle','pin','gear','wheel'].includes(type)) {
              const size = type === 'beam' ? [5,1] : type === 'axle' ? [4,1] : type === 'pin' ? [2,1] : type === 'wheel' ? [1,3] : [3,1];
              if (Number(op.d) > Number(op.w) && type !== 'wheel' || type === 'wheel' && Number(op.w) > Number(op.d)) size.reverse();
              const x = Number(op.x), y = Number(op.y), z = Number(op.z);
              if ([x,y,z].every(Number.isFinite) && Math.abs(x) <= 16 && Math.abs(z) <= 16 && y >= 0 && y <= 24) {
                v.parts.push({part:type, x:Math.round(x), y:Math.round(y)*3, z:Math.round(z), w:size[0], d:size[1], hPlates: ['gear','wheel'].includes(type) ? 8 : 3, color, layer:Math.round(y)+1});
              }
            }
          } else if (kind === 'box' || kind === 'cube' || kind === 'rect') {
            const x1 = op.x1 ?? op.x ?? 0;
            const y1 = Math.max(0, op.y1 ?? op.y ?? op.layer ?? 0);
            const z1 = op.z1 ?? op.z ?? 0;
            const x2 = op.x2 ?? (x1 + Math.max(0, (op.w ?? op.width ?? 1) - 1));
            const y2 = Math.max(0, op.y2 ?? (y1 + Math.max(0, (op.h ?? op.height ?? 1) - 1)));
            const z2 = op.z2 ?? (z1 + Math.max(0, (op.d ?? op.depth ?? 1) - 1));
            v.fillBox(x1, y1, z1, x2, y2, z2, color, !!op.hollow);
          } else if (kind === 'cylinder' || kind === 'column' || kind === 'tube') {
            const cx = op.cx ?? op.x ?? 0;
            const y1 = Math.max(0, op.y1 ?? op.y ?? op.cy ?? 0);
            const cz = op.cz ?? op.z ?? 0;
            const radius = Math.max(1, op.radius ?? op.r ?? 3);
            const height = Math.max(1, op.height ?? op.h ?? 3);
            v.fillCylinder(cx, y1, cz, radius, height, color, !!op.hollow);
          } else if (kind === 'sphere' || kind === 'ball' || kind === 'dome') {
            const cx = op.cx ?? op.x ?? 0;
            const radius = Math.max(1, op.radius ?? op.r ?? 3);
            const cy = Math.max(radius, op.cy ?? op.y ?? op.y1 ?? radius);
            const cz = op.cz ?? op.z ?? 0;
            v.fillSphere(cx, cy, cz, radius, color);
          }
        }
        const bricks = finishModel(v);
        if (bricks.length > 0) {
          return {
            title: blueprint.title || cleanPrompt,
            bricks,
            source: `AI (${blueprint._modelId || effectiveProvider})`
          };
        } else {
          llmError = 'AI returned 0 valid bricks';
        }
      } else {
        llmError = 'AI response did not contain operations';
      }
    } catch (err) {
      llmError = err.message;
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

  const bricks = finishModel(v);
  return {
    title,
    bricks,
    source: 'Procedural 3D Architect',
    llmError
  };
}

// Curated, deterministic blueprints. These never call an AI provider.
export const SAVED_BUILDS = [
  {id:'technic-excavator', title:'Technic Excavator', category:'construction', icon:'🚧'},
  {id:'technic-bulldozer', title:'Technic Bulldozer', category:'construction', icon:'🚜'},
  {id:'technic-dump-truck', title:'Technic Dump Truck', category:'construction', icon:'🚚'},
  {id:'technic-crane', title:'Technic Mobile Crane', category:'construction', icon:'🏗️'},
  {id:'reef-shark', title:'Reef Shark', category:'sea', icon:'🦈'},
  {id:'blue-whale', title:'Blue Whale', category:'sea', icon:'🐋'},
  {id:'coral-octopus', title:'Coral Octopus', category:'sea', icon:'🐙'},
  {id:'sea-turtle', title:'Sea Turtle', category:'sea', icon:'🐢'},
  {id:'manta-ray', title:'Manta Ray', category:'sea', icon:'🌊'}
];

export function createSavedBuild(id) {
  const entry = SAVED_BUILDS.find(build => build.id === id);
  if (!entry) throw new Error(`Unknown saved build: ${id}`);
  const v = new VoxelGrid();
  const box = (x1,y1,z1,x2,y2,z2,color,hollow=false) => v.fillBox(x1,y1,z1,x2,y2,z2,color,hollow);
  const part = (type,x,layer,z,w,d,color='light_grey',hPlates=3) => v.parts.push({part:type,x,y:layer*3,z,w,d,color,hPlates,layer:layer+1});
  const ellipsoid = (cx,cy,cz,rx,ry,rz,color,belly) => {
    for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)
      for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++)
        for(let z=Math.floor(cz-rz);z<=Math.ceil(cz+rz);z++)
          if(((x-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2<=1) v.set(x,y,z,belly && y<cy-ry*0.35 ? belly : color);
  };
  const wheelChassis = () => {
    for(const z of [-6,0,6]) {
      part('axle',-6,0.67,z,13,1,'dark_grey');
      for(const x of [-6,5]) {
        part('wheel',x,0,z-1,1,3,'black',8);
        part('gear',x,0.67,z,1,1,'light_grey');
      }
    }
    box(-4,2,-8,4,3,8,'dark_grey');
    for(const x of [-5,5]) part('beam',x,3,-4,1,7,'yellow');
  };
  const tracks = () => {
    for(const x of [-7,5]) {
      box(x,0,-8,x+1,2,8,'black');
      for(let z=-8;z<=8;z+=2) {box(x,0,z,x+1,0,z,'dark_grey');box(x,2,z,x+1,2,z,'dark_grey');}
      for(const z of [-6,0,6]) part('gear',x<0 ? x-0.1 : x+1.1,0,z,1,3,'light_grey',8);
      part('beam',x,3,-3,1,7,'yellow');
    }
    box(-4,2,-6,4,3,6,'dark_grey');
    part('axle',-7,1,-5,15,1,'dark_grey');
    part('axle',-7,1,5,15,1,'dark_grey');
  };
  const cab = (x,z,base=4) => {
    box(x,base,z,x+3,base+3,z+4,'yellow',true);
    box(x,base+1,z+4,x+3,base+2,z+4,'trans_blue');
    box(x,base+1,z+1,x,base+2,z+3,'trans_blue');
    box(x+3,base+1,z+1,x+3,base+2,z+3,'trans_blue');
    box(x,base+4,z,x+3,base+4,z+4,'yellow');
    for(const px of [x,x+3]) box(px,base,z,px,base+3,z,'yellow');
    v.set(x+1,base+5,z+2,'trans_orange');
    box(x+1,base,z+1,x+2,base,z+2,'black');
  };
  if(entry.category === 'construction') {
    if(id==='technic-excavator') {
      tracks();box(-4,4,-5,4,4,4,'yellow');cab(-4,-4,5);
      box(0,5,-5,4,6,-1,'yellow');box(3,7,-4,3,8,-4,'black');
      for(let z=-4;z<=-1;z++) v.set(4,6,z,'dark_grey');
      // Paired stepped boom rails, exposed pivot gears and a broad open bucket.
      for(let i=0;i<7;i++) for(const x of [0,2]) box(x,5+i,i,x,7+i,i+1,'yellow');
      for(let i=0;i<6;i++) for(const x of [0,2]) box(x,11-i,6+i,x,12-i,7+i,'yellow');
      part('beam',0,9,3,1,5,'yellow');part('beam',2,9,3,1,5,'yellow');
      part('gear',-1,5,1,1,3,'dark_grey',8);part('gear',3,10,5,1,3,'dark_grey',8);
      part('pin',-1,6,2,5,1,'blue');part('pin',-1,11,6,5,1,'blue');
      part('axle',1,7,5,1,6,'light_grey');
      box(-2,2,11,4,2,15,'dark_grey');box(-2,3,11,4,5,11,'dark_grey');
      box(-2,3,12,-2,4,15,'dark_grey');box(4,3,12,4,4,15,'dark_grey');
      for(let x=-2;x<=4;x+=2) v.set(x,2,16,'light_grey');
    } else if(id==='technic-bulldozer') {
      tracks();box(-4,4,-5,4,4,5,'yellow');cab(-2,-4,4);
      box(-3,5,2,3,6,6,'yellow');box(2,7,3,2,8,3,'black');
      for(const x of [-4,4]) {part('beam',x,3,4,1,7,'yellow');part('pin',x-1,4,8,3,1,'blue');}
      box(-8,1,10,8,4,10,'light_grey');box(-8,1,11,8,1,12,'dark_grey');
      for(let x=-8;x<=8;x+=2) v.set(x,0,12,'light_grey');
      for(let x=-2;x<=2;x+=2) v.set(x,5,6,'black');
      part('gear',-4,3,6,1,3,'dark_grey',8);
      // Rear ripper attachment.
      box(-3,2,-10,3,3,-9,'yellow');for(const x of [-3,0,3]) box(x,0,-11,x,2,-11,'dark_grey');
    } else if(id==='technic-dump-truck') {
      wheelChassis();cab(-4,4,4);cab(0,4,4);
      box(-4,4,-8,4,4,2,'yellow');
      box(-4,5,-8,-4,7,2,'yellow');box(4,5,-8,4,7,2,'yellow');box(-3,5,-8,3,7,-8,'yellow');box(-3,5,2,3,7,2,'yellow');
      for(const x of [-5,5]) for(const z of [-7,-4,-1]) box(x,4,z,x,6,z,'orange');
      for(const [x,z,r] of [[-2,-5,2],[1,-4,2],[0,0,1.5]]) ellipsoid(x,6,z,r,1.5,r,'dark_grey');
      part('gear',-5,3,-7,1,3,'dark_grey',8);part('axle',0,3,-3,1,5,'light_grey');
      for(const x of [-4,3]) {v.set(x,4,9,'trans_orange');v.set(x,4,-9,'red');}
      box(-4,3,9,4,3,9,'light_grey');
    } else {
      wheelChassis();cab(-4,4,4);box(0,4,4,4,5,8,'yellow');
      box(-3,4,-4,3,6,2,'yellow');
      part('gear',-2,6,-2,3,1,'dark_grey',8);cab(-4,-4,6);
      box(0,6,-2,2,12,0,'yellow');
      // Open lattice jib with a supported center mast and hanging hook.
      box(-4,13,-2,13,13,0,'yellow');box(-4,15,-2,13,15,0,'yellow');
      for(let x=-4;x<=13;x+=3) box(x,14,-2,x,14,0,'yellow');
      part('beam',4,16,-1,7,1,'yellow');part('pin',0,12,-3,1,4,'blue');
      box(12,5,-1,12,12,-1,'black');box(11,4,-1,13,4,-1,'gold');v.set(11,5,-1,'gold');
      for(const x of [-9,8]) {box(Math.min(x,0),2,-4,Math.max(x,0),2,-4,'dark_grey');box(x,0,-5,x+1,1,-3,'dark_grey');}
      for(const x of [-4,3]) v.set(x,4,9,'trans_orange');
    }
  } else {
    // Shallow water display, sandy patches and coral establish a shared sea-life collection.
    for(let x=-15;x<=15;x++) for(let z=-15;z<=15;z++) if(x*x+z*z<235) v.set(x,0,z,'trans_blue',1);
    for(const [x,z] of [[-10,8],[9,-8]]) {
      box(x,0,z,x+3,0,z+3,'tan');box(x,1,z,x,3,z,'pink');box(x+2,1,z+1,x+2,2,z+1,'orange');
      v.set(x+1,2,z,'pink');v.set(x+3,2,z+1,'orange');
    }
    if(id==='coral-octopus') {
      // Eight curved, distinct arms with pale suckers on their upper edges.
      for(let arm=0;arm<8;arm++) {
        const a=arm*Math.PI/4;
        for(let t=3;t<=10;t++) {
          const bend=a+0.035*(t-3)*(t-3);
          const x=Math.round(Math.cos(bend)*t),z=Math.round(Math.sin(bend)*t);
          box(x,1,z,x+1,t>8?2:1,z+1,'orange');
          if(t%2===0) v.set(x,2,z,'tan',1);
        }
      }
      ellipsoid(0,5,0,4,4,4,'orange');
      for(const x of [-2,2]) {box(x,5,4,x,6,4,'white');v.set(x,5,5,'black');}
      v.set(0,3,4,'brown');
    } else if(id==='sea-turtle') {
      for(const side of [-1,1]) for(let i=0;i<5;i++) {
        box(side*(4+i),1,2-i,side*(5+i),1,4-i,'green');
        box(side*(4+i),1,-4-i/2,side*(5+i),1,-3-i/2,'green');
      }
      ellipsoid(0,3,0,5,2.5,6,'green','tan');ellipsoid(0,4,0,4.8,3,5.5,'green');
      for(let x=-4;x<=4;x++) for(let z=-5;z<=5;z++) {
        const y=4+Math.floor(3*Math.sqrt(Math.max(0,1-(x/5)**2-(z/6)**2)));
        if((x*x/25+z*z/36)<0.85 && (x%3===0 || z%3===0)) v.set(x,y,z,'lime');
      }
      ellipsoid(0,2,7,2,1.5,3,'green');for(const x of [-2,2]) {v.set(x,3,8,'white');v.set(x,3,9,'black');}
      box(0,1,-8,0,1,-6,'green');
    } else if(id==='manta-ray') {
      ellipsoid(0,3,0,4,1.8,6,'dark_grey','white');
      for(let x=-12;x<=12;x++) {
        const reach=Math.abs(x), span=Math.max(0,5-Math.floor(reach/2));
        box(x,Math.max(1,3-Math.floor(reach/5)),-span,x,Math.max(1,3-Math.floor(reach/5)),span,'dark_grey');
      }
      for(let z=-13;z<=-5;z++) v.set(Math.round(Math.sin(z)*0.4),1,z,'black');
      for(const x of [-2,2]) {v.set(x,4,4,'black');box(x,2,5,x,3,7,'dark_grey');}
    } else {
      const whale=id==='blue-whale', col=whale?'blue':'light_grey';
      ellipsoid(0,5,0,whale?5.5:4,whale?3.8:2.5,9,col,'white');
      ellipsoid(0,4,-9,2,1.6,3,col);
      if(whale) {
        for(const side of [-1,1]) for(let i=1;i<=6;i++) box(side*i,3,-11-Math.floor(i/3),side*i,3,-9-Math.floor(i/3),col);
        v.set(0,9,2,'black'); // blowhole
        for(let z=4;z<=8;z++) v.set(0,2,z,'light_grey');
      } else {
        // Distinct dorsal fin and tall, crescent-like tail.
        for(let i=0;i<5;i++) box(0,7+i,-3,0,7+i,1-i,'dark_grey');
        for(let i=0;i<5;i++) {box(0,5+i,-11-i/2,0,5+i,-10-i/2,col);box(0,3-i/2,-11-i/2,0,3-i/2,-10-i/2,col);}
        for(const side of [-1,1]) for(let i=1;i<=5;i++) box(side*(3+i),3,-i,side*(3+i),3,2-i,col);
        for(const side of [-1,1]) for(let z=2;z<=4;z++) v.set(side*4,5,z,'dark_grey');
      }
      for(const side of [-1,1]) {
        const x=side*(whale?5:3);v.set(x,6,5,'white');v.set(x,6,6,'black');
        if(whale) for(let i=0;i<4;i++) box(side*(4+i),3,1-i,side*(5+i),3,3-i,col);
      }
      // Clear display supports keep the swimming pose above the water.
      for(const z of [-4,4]) box(0,0,z,0,2,z,'trans_blue');
    }
  }
  return {id:entry.id,title:entry.title,bricks:finishModel(v),source:'Saved Build Collection'};
}

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Official LEGO Color Palette
export const LEGO_COLORS = [
  { id: 'red', name: 'Bright Red', hex: '#E3000B' },
  { id: 'blue', name: 'Bright Blue', hex: '#006CB7' },
  { id: 'yellow', name: 'Bright Yellow', hex: '#FFCD03' },
  { id: 'green', name: 'Dark Green', hex: '#00963E' },
  { id: 'lime', name: 'Lime Green', hex: '#84CC16' },
  { id: 'orange', name: 'Bright Orange', hex: '#FF7E14' },
  { id: 'white', name: 'White', hex: '#F4F6F8' },
  { id: 'light_grey', name: 'Medium Stone Grey', hex: '#A0A5A9' },
  { id: 'dark_grey', name: 'Dark Stone Grey', hex: '#595D60' },
  { id: 'black', name: 'Black', hex: '#1B2026' },
  { id: 'tan', name: 'Brick Yellow (Tan)', hex: '#E4CD9E' },
  { id: 'brown', name: 'Reddish Brown', hex: '#694027' },
  { id: 'azure', name: 'Medium Azure', hex: '#36AEBF' },
  { id: 'purple', name: 'Bright Purple', hex: '#9333EA' },
  { id: 'pink', name: 'Bright Pink', hex: '#EC4899' },
  { id: 'gold', name: 'Warm Gold', hex: '#F59E0B', metallic: true },
  { id: 'trans_blue', name: 'Trans-Light Blue', hex: '#38BDF8', trans: true },
  { id: 'trans_orange', name: 'Trans-Neon Orange', hex: '#FB923C', trans: true }
];

export const COLOR_MAP = Object.fromEntries(LEGO_COLORS.map(c => [c.id, c]));

// Dimensions in Three.js world units:
// 1 stud = 1.0 unit wide/deep
// 1 plate height = 0.4 units; 1 standard brick = 3 plates = 1.2 units
export const STUD_SIZE = 1.0;
export const PLATE_HEIGHT = 0.4;
export const BRICK_PLATES = 3; // 3 plates = 1.2 world units
export const STUD_RADIUS = 0.30;
export const STUD_HEIGHT = 0.19;
export const BASEPLATE_SIZE = 48;

export class BrickEngine {
  constructor(scene) {
    this.scene = scene;
    this.geometryCache = new Map();
    this.edgeGeometryCache = new Map();
    this.materialCache = new Map();
    this.ghostMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffcd03,
      transparent: true,
      opacity: 0.55,
      roughness: 0.2
    });
    this.xrayMaterialCache = new Map();

    this.baseplateGroup = new THREE.Group();
    this.bricksGroup = new THREE.Group();
    this.scene.add(this.baseplateGroup);
    this.scene.add(this.bricksGroup);

    this.createBaseplate();
  }

  /**
   * Build the 48x48 dark-slate LEGO baseplate with subtle studs and grid lines
   */
  createBaseplate() {
    const size = BASEPLATE_SIZE;
    const plateThickness = 0.35;

    // Base board
    const boardGeo = new THREE.BoxGeometry(size, plateThickness, size);
    boardGeo.translate(0, -plateThickness / 2, 0);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x1e2633,
      roughness: 0.45,
      metalness: 0.08
    });
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.receiveShadow = true;
    boardMesh.name = 'baseplate';
    this.baseplateGroup.add(boardMesh);
    this.baseplateMesh = boardMesh;

    // Instanced studs across the 48x48 baseplate for authentic LEGO look & high FPS
    const studGeo = new THREE.CylinderGeometry(STUD_RADIUS * 0.94, STUD_RADIUS * 0.94, 0.12, 14);
    studGeo.translate(0, 0.06, 0);
    const studMat = new THREE.MeshStandardMaterial({
      color: 0x263042,
      roughness: 0.4,
      metalness: 0.1
    });

    const totalStuds = size * size;
    const instancedStuds = new THREE.InstancedMesh(studGeo, studMat, totalStuds);
    instancedStuds.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;
    const half = size / 2;
    for (let gx = -half; gx < half; gx++) {
      for (let gz = -half; gz < half; gz++) {
        dummy.position.set(gx + 0.5, 0, gz + 0.5);
        dummy.updateMatrix();
        instancedStuds.setMatrixAt(idx++, dummy.matrix);
      }
    }
    instancedStuds.instanceMatrix.needsUpdate = true;
    this.baseplateGroup.add(instancedStuds);

    // Subtle outer rim frame
    const gridHelper = new THREE.GridHelper(size, size, 0x3b82f6, 0x2b3648);
    gridHelper.position.y = 0.01;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.28;
    this.baseplateGroup.add(gridHelper);
  }

  /**
   * Get or create glossy ABS plastic material for a LEGO color ID or hex
   */
  getMaterial(colorIdOrHex) {
    const key = colorIdOrHex || 'red';
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key);
    }

    const def = COLOR_MAP[key] || {
      id: key,
      name: key,
      hex: key.startsWith('#') ? key : '#E3000B'
    };

    let mat;
    if (def.trans) {
      mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(def.hex),
        transparent: true,
        opacity: 0.72,
        roughness: 0.1,
        metalness: 0.05,
        transmission: 0.35,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08
      });
    } else if (def.metallic) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(def.hex),
        roughness: 0.22,
        metalness: 0.72
      });
    } else {
      mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(def.hex),
        roughness: 0.2,
        metalness: 0.02,
        clearcoat: 0.65,
        clearcoatRoughness: 0.14,
        reflectivity: 0.7
      });
    }

    this.materialCache.set(key, mat);
    return mat;
  }

  getXRayMaterial(colorIdOrHex) {
    const key = colorIdOrHex || 'red';
    if (this.xrayMaterialCache.has(key)) {
      return this.xrayMaterialCache.get(key);
    }
    const def = COLOR_MAP[key] || { hex: key.startsWith('#') ? key : '#E3000B' };
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(def.hex),
      transparent: true,
      opacity: 0.14,
      depthWrite: false
    });
    this.xrayMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Get or create merged BufferGeometry for a w x d brick (or plate)
   * Origin of the geometry is the bottom-center of the brick:
   * X in [-w/2, +w/2], Y in [0, height], Z in [-d/2, +d/2]
   */
  getBrickGeometry(w, d, hPlates = 3) {
    const key = `${w}x${d}x${hPlates}`;
    if (this.geometryCache.has(key)) {
      return this.geometryCache.get(key);
    }

    const height = hPlates * PLATE_HEIGHT;
    const gap = 0.028; // micro-seam between bricks so each brick stands out clearly
    const bodyW = w * STUD_SIZE - gap;
    const bodyD = d * STUD_SIZE - gap;
    const bodyH = height - 0.012;

    const geometries = [];

    // Main brick box
    const boxGeo = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
    boxGeo.translate(0, bodyH / 2, 0);
    geometries.push(boxGeo);

    // Top cylindrical studs
    const studGeoBase = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 16);
    for (let ix = 0; ix < w; ix++) {
      for (let iz = 0; iz < d; iz++) {
        const studGeo = studGeoBase.clone();
        const sx = -w / 2 + 0.5 + ix;
        const sz = -d / 2 + 0.5 + iz;
        studGeo.translate(sx, bodyH + STUD_HEIGHT / 2, sz);
        geometries.push(studGeo);
      }
    }

    const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
    merged.computeVertexNormals();
    this.geometryCache.set(key, merged);

    // Also cache a subtle edge geometry for the brick body so seams are crisp
    const edgeGeo = new THREE.EdgesGeometry(boxGeo, 25);
    this.edgeGeometryCache.set(key, edgeGeo);

    return merged;
  }

  /**
   * Create a Three.js Mesh for a brick specification:
   * { x, y, z, w, d, hPlates, color }
   * Note: (x, z) is the minimum corner stud coordinate on the grid,
   * and y is the bottom elevation in plate units (0 = resting on baseplate).
   */
  createBrickMesh(brickData) {
    const w = brickData.w || 1;
    const d = brickData.d || 1;
    const hPlates = brickData.hPlates || 3;
    const color = brickData.color || 'red';

    const geo = this.getBrickGeometry(w, d, hPlates);
    const mat = this.getMaterial(color);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Subtle dark edge lines so monochrome structures (e.g. grey castle walls) show every brick
    const key = `${w}x${d}x${hPlates}`;
    const edgeGeo = this.edgeGeometryCache.get(key);
    if (edgeGeo) {
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.18
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.raycast = () => {}; // Don't intercept mouse clicks
      mesh.add(edges);
    }

    const targetPos = this.getWorldPosition(brickData);
    mesh.position.copy(targetPos);

    mesh.userData = {
      isBrick: true,
      brickData: { ...brickData, w, d, hPlates, color },
      targetPosition: targetPos.clone(),
      targetRotation: new THREE.Euler(0, 0, 0),
      animProgress: 1.0
    };

    return mesh;
  }

  /**
   * Convert grid coordinates (x, y in plates, z) and size (w, d) to Three.js world position
   */
  getWorldPosition(brickData) {
    const cx = brickData.x + brickData.w / 2;
    const cz = brickData.z + brickData.d / 2;
    const cy = brickData.y * PLATE_HEIGHT;
    return new THREE.Vector3(cx, cy, cz);
  }
}

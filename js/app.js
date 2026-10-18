import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  BrickEngine,
  LEGO_COLORS,
  COLOR_MAP,
  PLATE_HEIGHT,
  BRICK_PLATES,
  BASEPLATE_SIZE
} from './brickEngine.js';
import { SoundEngine } from './soundEngine.js';
import { generateLegoModel } from './generator.js';
import { PhysicsEngine } from './physicsEngine.js';

const RANDOM_PROMPTS = [
  'Medieval castle with four towers and a moat',
  'Sleek red race car with spoiler',
  'Galactic starfighter spaceship with twin boosters',
  'Giant retro robot mech with glowing chest',
  'Cozy two-story cottage house with garden and tree',
  'Green T-Rex dinosaur',
  'Coastal red and white lighthouse on rocky island',
  'Ancient golden Egyptian pyramid',
  'Cyberpunk neon skyscraper tower',
  'Purple dragon monster',
  'Golden castle with tall towers',
  'word: LEGO'
];

class BrickForgeApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.sound = new SoundEngine();
    this.physics = new PhysicsEngine(this.sound);

    // Build / Animation State
    this.modelTitle = 'Medieval Castle';
    this.brickMeshes = [];
    this.currentCursor = 0; // floating point [0 .. brickMeshes.length]
    this.lastIntegerBrick = 0;
    this.isPlaying = true;
    this.speedMultiplier = 1.0; // 1.0x = 12 bricks/sec
    this.baseBricksPerSec = 12.0;
    this.isolateLayer = false;

    // Interaction / Editor State
    this.mode = 'orbit'; // 'orbit' | 'add' | 'paint' | 'erase' | 'smash'
    this.selectedSize = { w: 2, d: 4, isPlate: false };
    this.isRotated = false;
    this.selectedColor = 'red';
    this.ghostMesh = null;

    // Raycasting
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.pointerDownPos = new THREE.Vector2();

    // AI Config
    this.aiConfig = {
      provider: localStorage.getItem('brickforge_provider') || 'procedural',
      apiKey: localStorage.getItem('brickforge_apikey') || ''
    };

    this.initThree();
    this.brickEngine = new BrickEngine(this.scene);
    this.initGhostBrick();
    this.initUI();
    this.updateEngineBadge();

    // Start initial build
    this.triggerBuildFromPrompt(document.getElementById('prompt-input').value);

    // Main loop
    this.lastFrameTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0d131f, 0.0085);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    this.camera.position.set(24, 22, 28);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Keep above baseplate
    this.controls.minDistance = 6;
    this.controls.maxDistance = 110;
    this.controls.target.set(0, 4, 0);

    // Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.55);
    dirLight.position.set(28, 46, 32);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 5;
    dirLight.shadow.camera.far = 120;
    const d = 28;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.55);
    rimLight.position.set(-28, 20, -24);
    this.scene.add(rimLight);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initGhostBrick() {
    this.updateGhostBrickGeometry();
  }

  updateGhostBrickGeometry() {
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
    }
    const w = this.isRotated ? this.selectedSize.d : this.selectedSize.w;
    const d = this.isRotated ? this.selectedSize.w : this.selectedSize.d;
    const hPlates = this.selectedSize.isPlate ? 1 : BRICK_PLATES;

    const geo = this.brickEngine.getBrickGeometry(w, d, hPlates);
    const colDef = COLOR_MAP[this.selectedColor] || LEGO_COLORS[0];
    this.brickEngine.ghostMaterial.color.set(colDef.hex);

    this.ghostMesh = new THREE.Mesh(geo, this.brickEngine.ghostMaterial);
    this.ghostMesh.visible = false;
    this.ghostMesh.raycast = () => {}; // Ignore raycast
    this.scene.add(this.ghostMesh);
  }

  initUI() {
    // Populate Color Swatches
    const paletteEl = document.getElementById('color-palette');
    LEGO_COLORS.forEach(c => {
      const btn = document.createElement('button');
      btn.className = `color-swatch ${c.id === this.selectedColor ? 'active' : ''}`;
      btn.style.backgroundColor = c.hex;
      if (c.trans) {
        btn.style.opacity = '0.78';
        btn.style.boxShadow = `0 0 8px ${c.hex}`;
      }
      btn.title = c.name;
      btn.addEventListener('click', () => {
        this.selectedColor = c.id;
        paletteEl.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        this.updateGhostBrickGeometry();
      });
      paletteEl.appendChild(btn);
    });

    // Prompt Submit
    const form = document.getElementById('prompt-form');
    const promptInput = document.getElementById('prompt-input');
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (promptInput.value.trim()) {
        this.triggerBuildFromPrompt(promptInput.value.trim());
      }
    });

    // Random Surprise Prompt
    document.getElementById('random-prompt-btn').addEventListener('click', () => {
      const pick = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
      promptInput.value = pick;
      this.triggerBuildFromPrompt(pick);
    });

    // Quick Preset Chips
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const p = chip.getAttribute('data-prompt');
        promptInput.value = p;
        this.triggerBuildFromPrompt(p);
      });
    });

    // Sound Toggle
    const soundBtn = document.getElementById('sound-toggle-btn');
    soundBtn.addEventListener('click', () => {
      const on = this.sound.toggle();
      soundBtn.classList.toggle('active', on);
      soundBtn.innerHTML = on ? '🔊 <span class="hide-sm">SFX On</span>' : '🔇 <span class="hide-sm">Muted</span>';
    });

    // Manual & Parts Drawer Toggle
    const manualDrawer = document.getElementById('manual-drawer');
    const bomBtn = document.getElementById('bom-toggle-btn');
    bomBtn.addEventListener('click', () => {
      const hidden = manualDrawer.classList.toggle('hidden');
      bomBtn.classList.toggle('active', !hidden);
    });
    document.getElementById('close-manual-btn').addEventListener('click', () => {
      manualDrawer.classList.add('hidden');
      bomBtn.classList.remove('active');
    });

    // Isolate Layer Checkbox
    document.getElementById('isolate-layer-checkbox').addEventListener('change', e => {
      this.isolateLayer = e.target.checked;
      this.syncBrickVisibility();
    });

    // Mode Selector Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setMode(btn.getAttribute('data-mode'));
      });
    });

    // Brick Size Selector
    document.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSize = {
          w: parseInt(btn.getAttribute('data-w'), 10),
          d: parseInt(btn.getAttribute('data-d'), 10),
          isPlate: btn.getAttribute('data-plate') === 'true'
        };
        this.updateGhostBrickGeometry();
        if (this.mode === 'orbit') {
          this.setMode('add');
        }
      });
    });

    // Rotate Brick Button
    document.getElementById('rotate-brick-btn').addEventListener('click', () => {
      this.isRotated = !this.isRotated;
      this.updateGhostBrickGeometry();
      this.showToast(`Brick rotated (${this.isRotated ? '90°' : '0°'})`);
    });

    // Physics & Scene Actions
    document.getElementById('explode-btn').addEventListener('click', () => {
      if (this.brickMeshes.length === 0) return;
      this.isPlaying = false;
      this.updatePlayButtonUI();
      this.physics.explodeAll(this.brickMeshes);
      document.getElementById('reassemble-btn').classList.remove('hidden');
      this.showToast('💥 BOOM! Click "Reassemble Bricks" to reverse gravity!');
    });

    document.getElementById('reassemble-btn').addEventListener('click', () => {
      this.physics.startReassemble();
      this.showToast('⏪ Reversing time & snapping bricks back together...');
    });

    document.getElementById('reset-camera-btn').addEventListener('click', () => {
      this.focusCameraOnModel();
    });

    const spinBtn = document.getElementById('auto-rotate-btn');
    spinBtn.addEventListener('click', () => {
      this.controls.autoRotate = !this.controls.autoRotate;
      this.controls.autoRotateSpeed = 2.0;
      spinBtn.classList.toggle('active', this.controls.autoRotate);
    });

    document.getElementById('clear-scene-btn').addEventListener('click', () => {
      this.clearAllBricks();
      this.setMode('add');
      this.showToast('Canvas cleared — click on the baseplate to place bricks or type a prompt!');
    });

    document.getElementById('export-json-btn').addEventListener('click', () => {
      this.exportBlueprintJSON();
    });

    // Timeline Playback Controls
    document.getElementById('play-pause-btn').addEventListener('click', () => {
      this.togglePlayPause();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
      this.physics.clear();
      document.getElementById('reassemble-btn').classList.add('hidden');
      this.currentCursor = 0;
      this.lastIntegerBrick = 0;
      this.isPlaying = true;
      this.syncBrickVisibility();
      this.updatePlayButtonUI();
    });

    document.getElementById('finish-btn').addEventListener('click', () => {
      this.physics.clear();
      document.getElementById('reassemble-btn').classList.add('hidden');
      this.currentCursor = this.brickMeshes.length;
      this.lastIntegerBrick = this.brickMeshes.length;
      this.isPlaying = false;
      for (const m of this.brickMeshes) {
        m.userData.animProgress = 1.0;
        m.position.copy(m.userData.targetPosition);
        m.rotation.set(0, 0, 0);
      }
      this.syncBrickVisibility();
      this.sound.playBrickSnap(0.9, 1.1);
      this.updatePlayButtonUI();
    });

    document.getElementById('step-back-btn').addEventListener('click', () => {
      this.stepBy(-1);
    });

    document.getElementById('step-fwd-btn').addEventListener('click', () => {
      this.stepBy(1);
    });

    // Scrubber Range Input
    const scrubber = document.getElementById('timeline-scrubber');
    scrubber.addEventListener('input', e => {
      this.physics.clear();
      document.getElementById('reassemble-btn').classList.add('hidden');
      this.isPlaying = false;
      this.currentCursor = parseInt(e.target.value, 10);
      for (let i = 0; i < this.brickMeshes.length; i++) {
        const m = this.brickMeshes[i];
        m.userData.animProgress = 1.0;
        m.position.copy(m.userData.targetPosition);
        m.rotation.set(0, 0, 0);
      }
      this.sound.playBrickSnap(0.45, 0.9 + (this.currentCursor / Math.max(1, this.brickMeshes.length)) * 0.35);
      this.syncBrickVisibility();
      this.updatePlayButtonUI();
    });

    // Speed Slider & Presets
    const speedSlider = document.getElementById('speed-slider');
    speedSlider.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      // Map [0..100] exponentially from 0.1x to 15x
      const mult = Number((0.1 * Math.pow(150, val / 100)).toFixed(2));
      this.setSpeedMultiplier(mult, false);
    });

    document.querySelectorAll('.speed-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const s = parseFloat(chip.getAttribute('data-speed'));
        this.setSpeedMultiplier(s, true);
      });
    });

    // Pointer Events for 3D Canvas Interaction
    const domEl = this.renderer.domElement;
    domEl.addEventListener('pointermove', e => this.onPointerMove(e));
    domEl.addEventListener('pointerdown', e => {
      this.pointerDownPos.set(e.clientX, e.clientY);
    });
    domEl.addEventListener('pointerup', e => this.onPointerUp(e));

    // Keyboard Shortcuts
    window.addEventListener('keydown', e => {
      if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.code === 'KeyR') {
        this.isRotated = !this.isRotated;
        this.updateGhostBrickGeometry();
        this.showToast(`Brick rotated (${this.isRotated ? '90°' : '0°'})`);
      } else if (e.code === 'ArrowRight') {
        this.stepBy(1);
      } else if (e.code === 'ArrowLeft') {
        this.stepBy(-1);
      }
    });

    // API Modal
    const apiModal = document.getElementById('api-modal');
    const providerSelect = document.getElementById('ai-provider-select');
    const apiKeyInput = document.getElementById('api-key-input');

    document.getElementById('api-settings-btn').addEventListener('click', () => {
      providerSelect.value = this.aiConfig.provider;
      apiKeyInput.value = this.aiConfig.apiKey;
      apiModal.classList.remove('hidden');
    });
    document.getElementById('close-api-modal-btn').addEventListener('click', () => {
      apiModal.classList.add('hidden');
    });
    document.getElementById('save-api-btn').addEventListener('click', () => {
      this.aiConfig.provider = providerSelect.value;
      this.aiConfig.apiKey = apiKeyInput.value.trim();
      localStorage.setItem('brickforge_provider', this.aiConfig.provider);
      localStorage.setItem('brickforge_apikey', this.aiConfig.apiKey);
      this.updateEngineBadge();
      apiModal.classList.add('hidden');
      this.showToast('AI Generation Settings Saved!');
    });
  }

  updateEngineBadge() {
    const label = document.getElementById('engine-mode-label');
    if (this.aiConfig.provider !== 'procedural' && this.aiConfig.apiKey) {
      label.textContent = `${this.aiConfig.provider.toUpperCase()} Live AI`;
    } else {
      label.textContent = 'Hybrid Engine';
    }
  }

  setMode(newMode) {
    this.mode = newMode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === newMode);
    });
    if (newMode !== 'add' && this.ghostMesh) {
      this.ghostMesh.visible = false;
    }
    const modeDescriptions = {
      orbit: '🎥 Camera Mode: Drag to orbit, scroll to zoom',
      add: '🧱 Add Brick Mode: Click on any stud to stack a brick (Press R to rotate)',
      paint: '🎨 Paint Mode: Click any brick to recolor it',
      erase: '🗑️ Erase Mode: Click any brick to pop it off',
      smash: '☄️ Smash Mode: Click on the model to launch a physics shockwave!'
    };
    this.showToast(modeDescriptions[newMode] || '');
  }

  setSpeedMultiplier(mult, updateSlider = true) {
    this.speedMultiplier = mult;
    const rate = Math.round(this.baseBricksPerSec * mult * 10) / 10;
    document.getElementById('speed-value-label').textContent = `${mult}× (${rate} bricks/s)`;

    document.querySelectorAll('.speed-chip').forEach(chip => {
      chip.classList.toggle('active', parseFloat(chip.getAttribute('data-speed')) === mult);
    });

    if (updateSlider) {
      const sliderVal = Math.round((Math.log(mult / 0.1) / Math.log(150)) * 100);
      document.getElementById('speed-slider').value = Math.max(0, Math.min(100, sliderVal));
    }
  }

  togglePlayPause() {
    if (this.physics.isSimulating) {
      this.physics.startReassemble();
      return;
    }
    if (this.currentCursor >= this.brickMeshes.length) {
      // Restart from 0 if already finished
      this.currentCursor = 0;
      this.lastIntegerBrick = 0;
      this.isPlaying = true;
    } else {
      this.isPlaying = !this.isPlaying;
    }
    this.updatePlayButtonUI();
  }

  stepBy(delta) {
    this.physics.clear();
    document.getElementById('reassemble-btn').classList.add('hidden');
    this.isPlaying = false;
    const next = Math.max(0, Math.min(this.brickMeshes.length, Math.floor(this.currentCursor) + delta));
    this.currentCursor = next;
    if (delta > 0 && next > 0) {
      const mesh = this.brickMeshes[next - 1];
      mesh.userData.animProgress = 0.0;
      this.sound.playBrickSnap(0.85, 1.0);
    } else if (delta < 0) {
      this.sound.playBrickRemove();
    }
    this.syncBrickVisibility();
    this.updatePlayButtonUI();
  }

  updatePlayButtonUI() {
    const playIcon = document.getElementById('play-icon');
    const statusText = document.getElementById('build-status-text');

    if (this.isPlaying && this.currentCursor < this.brickMeshes.length) {
      playIcon.textContent = '⏸';
      statusText.textContent = 'Building in Real-Time...';
      statusText.className = 'status-pill building';
    } else if (this.currentCursor >= this.brickMeshes.length && this.brickMeshes.length > 0) {
      playIcon.textContent = '↻';
      statusText.textContent = 'Build Complete!';
      statusText.className = 'status-pill';
    } else {
      playIcon.textContent = '▶';
      statusText.textContent = 'Paused';
      statusText.className = 'status-pill paused';
    }
  }

  async triggerBuildFromPrompt(promptText) {
    const buildBtn = document.getElementById('build-btn');
    buildBtn.disabled = true;
    buildBtn.querySelector('span').textContent = 'Designing...';

    try {
      const result = await generateLegoModel(promptText, this.aiConfig);
      this.loadModelBlueprint(result.title, result.bricks);
      this.showToast(`✨ Building "${result.title}" (${result.bricks.length} interlocking bricks)`);
    } catch (err) {
      console.error(err);
      this.showToast('⚠️ Error generating build');
    } finally {
      buildBtn.disabled = false;
      buildBtn.querySelector('span').textContent = 'Build in 3D';
    }
  }

  clearAllBricks() {
    this.physics.clear();
    document.getElementById('reassemble-btn').classList.add('hidden');
    for (const mesh of this.brickMeshes) {
      this.brickEngine.bricksGroup.remove(mesh);
    }
    this.brickMeshes = [];
    this.currentCursor = 0;
    this.lastIntegerBrick = 0;
    this.isPlaying = false;
    this.syncBrickVisibility();
    this.updateBOM();
    this.updatePlayButtonUI();
  }

  loadModelBlueprint(title, bricksData) {
    this.clearAllBricks();
    this.modelTitle = title;
    document.getElementById('manual-model-title').textContent = title;

    for (const bData of bricksData) {
      const mesh = this.brickEngine.createBrickMesh(bData);
      mesh.visible = false;
      mesh.userData.animProgress = 0.0;
      this.brickEngine.bricksGroup.add(mesh);
      this.brickMeshes.push(mesh);
    }

    const scrubber = document.getElementById('timeline-scrubber');
    scrubber.max = this.brickMeshes.length;
    scrubber.value = 0;

    document.getElementById('total-brick-num').textContent = this.brickMeshes.length;
    document.getElementById('total-bricks-badge').textContent = this.brickMeshes.length;

    this.currentCursor = 0;
    this.lastIntegerBrick = 0;
    this.isPlaying = true;
    this.updateBOM();
    this.focusCameraOnModel();
    this.updatePlayButtonUI();
  }

  focusCameraOnModel() {
    if (this.brickMeshes.length === 0) {
      this.controls.target.set(0, 3, 0);
      this.camera.position.set(22, 20, 26);
      return;
    }
    const box = new THREE.Box3();
    for (const m of this.brickMeshes) {
      box.expandByPoint(m.userData.targetPosition);
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(12, size.x, size.y, size.z);

    this.controls.target.set(center.x, Math.max(2, center.y * 0.75), center.z);
    this.camera.position.set(
      center.x + maxDim * 1.15,
      center.y + maxDim * 0.95 + 6,
      center.z + maxDim * 1.35
    );
  }

  syncBrickVisibility() {
    const visibleCount = Math.floor(this.currentCursor);
    const activeBrick = visibleCount > 0 ? this.brickMeshes[Math.min(visibleCount - 1, this.brickMeshes.length - 1)] : null;
    const activeLayer = activeBrick ? activeBrick.userData.brickData.layer || 1 : 0;

    for (let i = 0; i < this.brickMeshes.length; i++) {
      const m = this.brickMeshes[i];
      const bData = m.userData.brickData;
      if (i < visibleCount) {
        m.visible = true;
        if (this.isolateLayer && bData.layer !== activeLayer) {
          m.material = this.brickEngine.getXRayMaterial(bData.color);
        } else {
          m.material = this.brickEngine.getMaterial(bData.color);
        }
      } else {
        m.visible = false;
      }
    }

    // Update Scrubber & Counters
    document.getElementById('timeline-scrubber').value = visibleCount;
    document.getElementById('current-brick-num').textContent = visibleCount;
    document.getElementById('total-brick-num').textContent = this.brickMeshes.length;
    document.getElementById('total-bricks-badge').textContent = this.brickMeshes.length;
    document.getElementById('current-layer-num').textContent = `Layer ${activeLayer}`;

    // Update Manual Step Card
    document.getElementById('manual-step-badge').textContent = `Step ${visibleCount} / ${this.brickMeshes.length}`;
    document.getElementById('manual-layer-badge').textContent = `Layer ${activeLayer}`;
    const stepInfo = document.getElementById('manual-current-brick-info');

    if (activeBrick) {
      const bd = activeBrick.userData.brickData;
      const cDef = COLOR_MAP[bd.color] || { name: bd.color, hex: '#ccc' };
      const typeLabel = bd.hPlates === 1 ? 'Flat Plate' : 'Brick';
      stepInfo.innerHTML = `
        <span class="bom-color-dot" style="background:${cDef.hex};flex-shrink:0;"></span>
        <div>
          <strong>${bd.w}×${bd.d} ${cDef.name} ${typeLabel}</strong><br/>
          <span style="color:#94a3b8;font-size:0.73rem;">Grid Pos: X=${bd.x}, Z=${bd.z}, Layer ${bd.layer}</span>
        </div>
      `;
    } else {
      stepInfo.textContent = 'Ready to build! Press Play or drag the timeline scrubber.';
    }
  }

  updateBOM() {
    const counts = new Map();
    for (const m of this.brickMeshes) {
      const bd = m.userData.brickData;
      const w = Math.min(bd.w, bd.d);
      const d = Math.max(bd.w, bd.d);
      const kind = bd.hPlates === 1 ? 'Plate' : 'Brick';
      const key = `${bd.color}|${w}×${d} ${kind}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    document.getElementById('bom-unique-count').textContent = `${sorted.length} part types`;

    const listEl = document.getElementById('bom-list');
    listEl.innerHTML = '';
    for (const [key, qty] of sorted) {
      const [colorId, sizeLabel] = key.split('|');
      const colDef = COLOR_MAP[colorId] || { name: colorId, hex: '#ccc' };
      const row = document.createElement('div');
      row.className = 'bom-item';
      row.innerHTML = `
        <div class="bom-item-left">
          <span class="bom-color-dot" style="background:${colDef.hex}"></span>
          <span>${colDef.name} <strong>${sizeLabel}</strong></span>
        </div>
        <span class="bom-count">×${qty}</span>
      `;
      listEl.appendChild(row);
    }
  }

  // ==========================================================================
  // 3D RAYCASTING FOR MANUAL BRICK BUILDING, PAINTING, ERASING & SMASHING
  // ==========================================================================
  getRaycastHit(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const visibleBricks = this.brickMeshes.filter(m => m.visible);
    const targets = [...visibleBricks, this.brickEngine.baseplateMesh];
    const intersects = this.raycaster.intersectObjects(targets, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  computeSnapPlacement(hit) {
    const w = this.isRotated ? this.selectedSize.d : this.selectedSize.w;
    const d = this.isRotated ? this.selectedSize.w : this.selectedSize.d;
    const hPlates = this.selectedSize.isPlate ? 1 : BRICK_PLATES;

    const pt = hit.point.clone().addScaledVector(hit.face.normal, 0.08);
    const halfBase = BASEPLATE_SIZE / 2;

    const gx = Math.max(-halfBase, Math.min(halfBase - w, Math.round(pt.x - w / 2)));
    const gz = Math.max(-halfBase, Math.min(halfBase - d, Math.round(pt.z - d / 2)));
    const gyPlates = Math.max(0, Math.round(pt.y / PLATE_HEIGHT));

    return {
      x: gx,
      y: gyPlates,
      layer: Math.floor(gyPlates / BRICK_PLATES) + 1,
      z: gz,
      w,
      d,
      hPlates,
      color: this.selectedColor
    };
  }

  onPointerMove(event) {
    if (this.mode !== 'add') {
      if (this.ghostMesh) this.ghostMesh.visible = false;
      return;
    }
    const hit = this.getRaycastHit(event);
    if (!hit) {
      this.ghostMesh.visible = false;
      return;
    }
    const spec = this.computeSnapPlacement(hit);
    const pos = this.brickEngine.getWorldPosition(spec);
    this.ghostMesh.position.copy(pos);
    this.ghostMesh.visible = true;
  }

  onPointerUp(event) {
    // Only trigger if mouse didn't drag (orbiting camera)
    const moveDist = Math.hypot(
      event.clientX - this.pointerDownPos.x,
      event.clientY - this.pointerDownPos.y
    );
    if (moveDist > 5 || event.button !== 0) return;
    if (this.mode === 'orbit') return;

    const hit = this.getRaycastHit(event);
    if (!hit) return;

    if (this.mode === 'add') {
      const spec = this.computeSnapPlacement(hit);
      const mesh = this.brickEngine.createBrickMesh(spec);
      mesh.userData.animProgress = 0.0;
      this.brickEngine.bricksGroup.add(mesh);

      // Insert at current timeline cursor
      const insertIdx = Math.floor(this.currentCursor);
      this.brickMeshes.splice(insertIdx, 0, mesh);
      this.currentCursor = insertIdx + 1;
      this.lastIntegerBrick = this.currentCursor;

      document.getElementById('timeline-scrubber').max = this.brickMeshes.length;
      this.sound.playBrickSnap(1.0, 1.05);
      this.syncBrickVisibility();
      this.updateBOM();
    } else if (this.mode === 'paint') {
      if (hit.object && hit.object.userData.isBrick) {
        hit.object.userData.brickData.color = this.selectedColor;
        hit.object.material = this.brickEngine.getMaterial(this.selectedColor);
        this.sound.playBrickSnap(0.7, 1.2);
        this.syncBrickVisibility();
        this.updateBOM();
      }
    } else if (this.mode === 'erase') {
      if (hit.object && hit.object.userData.isBrick) {
        const idx = this.brickMeshes.indexOf(hit.object);
        if (idx !== -1) {
          this.brickEngine.bricksGroup.remove(hit.object);
          this.brickMeshes.splice(idx, 1);
          this.currentCursor = Math.min(this.currentCursor, this.brickMeshes.length);
          document.getElementById('timeline-scrubber').max = this.brickMeshes.length;
          this.sound.playBrickRemove();
          this.syncBrickVisibility();
          this.updateBOM();
        }
      }
    } else if (this.mode === 'smash') {
      const count = this.physics.smashAtPoint(hit.point, this.brickMeshes, 6.5);
      if (count > 0) {
        this.isPlaying = false;
        this.updatePlayButtonUI();
        document.getElementById('reassemble-btn').classList.remove('hidden');
      }
    }
  }

  exportBlueprintJSON() {
    const data = {
      title: this.modelTitle,
      exportedAt: new Date().toISOString(),
      totalBricks: this.brickMeshes.length,
      bricks: this.brickMeshes.map(m => m.userData.brickData)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.modelTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-lego-blueprint.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('💾 Downloaded 3D LEGO Blueprint JSON!');
  }

  showToast(message) {
    if (!message) return;
    const toast = document.getElementById('hud-toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2900);
  }

  // ==========================================================================
  // MAIN REAL-TIME ANIMATION LOOP
  // ==========================================================================
  animate(now) {
    requestAnimationFrame(this.animate);

    const dt = Math.min(0.08, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.controls.update();

    // 1. Update Physics if active
    if (this.physics.isSimulating) {
      this.physics.update(dt, () => {
        document.getElementById('reassemble-btn').classList.add('hidden');
      });
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 2. Advance Real-Time Build Cursor if playing
    if (this.isPlaying && this.currentCursor < this.brickMeshes.length) {
      const bricksToAdvance = dt * this.baseBricksPerSec * this.speedMultiplier;
      this.currentCursor = Math.min(this.brickMeshes.length, this.currentCursor + bricksToAdvance);

      const newInt = Math.floor(this.currentCursor);
      if (newInt > this.lastIntegerBrick) {
        // Trigger drop animation & snap audio for newly placed bricks
        for (let i = this.lastIntegerBrick; i < newInt; i++) {
          const m = this.brickMeshes[i];
          // At super high speeds (>6x), start closer to target so it stays crisp
          m.userData.animProgress = this.speedMultiplier > 6 ? 0.45 : 0.0;
        }
        const progressRatio = newInt / Math.max(1, this.brickMeshes.length);
        this.sound.playBrickSnap(0.85, 0.85 + progressRatio * 0.35);
        this.lastIntegerBrick = newInt;
        this.syncBrickVisibility();
      }

      if (this.currentCursor >= this.brickMeshes.length) {
        this.isPlaying = false;
        this.updatePlayButtonUI();
      }
    }

    // 3. Animate individual bricks dropping & snapping into place
    const dropSpeed = Math.max(4.5, 5.5 * Math.sqrt(this.speedMultiplier));
    const visibleLimit = Math.floor(this.currentCursor);
    for (let i = 0; i < visibleLimit; i++) {
      const mesh = this.brickMeshes[i];
      if (mesh.userData.animProgress < 1.0) {
        mesh.userData.animProgress = Math.min(1.0, mesh.userData.animProgress + dt * dropSpeed);
        const t = mesh.userData.animProgress;
        // Snappy cubic-out + slight bounce landing
        const easeOut = 1 - Math.pow(1 - t, 3);
        const target = mesh.userData.targetPosition;
        const dropHeight = 5.2;
        mesh.position.set(
          target.x,
          target.y + (1 - easeOut) * dropHeight,
          target.z
        );
        mesh.rotation.y = (1 - easeOut) * 0.35;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.brickForgeApp = new BrickForgeApp();
});

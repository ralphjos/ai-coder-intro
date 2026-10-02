import * as THREE from 'three';

const ARENA = 18;
const WALL_H = 5;
const EYE = 1.62;
const PLAYER_R = 0.42;
const ENEMY_R = 0.48;
const MOVE_SPEED = 7.6;
const ENEMY_SPEED = 5.15;
const FIRE_RATE = 0.16;
const PLAYER_DAMAGE = 14;
const ENEMY_DAMAGE = 13;
const WINDUP = 0.28;
const ENEMY_GAP = 0.64;
const REACH = 90;

const ANCHORS = [
  { x: -8, z: -6 },
  { x: 8, z: -4 },
  { x: -5, z: 2 },
  { x: 7.2, z: 5 },
];

const COVER = [
  { x: -6, z: 3, w: 4.2, d: 0.75, h: 2.25, kind: 'barrier' },
  { x: 6.5, z: -3.5, w: 0.75, d: 4.4, h: 2.25, kind: 'barrier' },
  { x: -4, z: -6.5, w: 3.6, d: 0.75, h: 2.15, kind: 'barrier' },
  { x: 3.4, z: 6.2, w: 3.4, d: 0.75, h: 2.15, kind: 'barrier' },
  { x: -11, z: -6, w: 1.8, d: 1.8, h: 3.5, kind: 'pillar' },
  { x: 11, z: 6, w: 1.8, d: 1.8, h: 3.5, kind: 'pillar' },
  { x: 10, z: -9, w: 2.3, d: 2.3, h: 2.2, kind: 'crate' },
  { x: -9.5, z: 8.5, w: 2.3, d: 2.3, h: 2.2, kind: 'crate' },
  { x: 4.8, z: 0.4, w: 2.4, d: 2.4, h: 2.05, kind: 'crate' },
];

const ui = {
  canvas: document.getElementById('view'),
  hud: document.getElementById('hud'),
  crosshair: document.getElementById('crosshair'),
  hitmarker: document.getElementById('hitmarker'),
  ready: document.getElementById('ready'),
  readyFill: document.getElementById('ready-fill'),
  hint: document.getElementById('hint'),
  announce: document.getElementById('announce'),
  overlay: document.getElementById('overlay'),
  menuPanel: document.getElementById('menu-panel'),
  pausePanel: document.getElementById('pause-panel'),
  endPanel: document.getElementById('end-panel'),
  endTitle: document.getElementById('end-title'),
  endCopy: document.getElementById('end-copy'),
  endStats: document.getElementById('end-stats'),
  rivalFill: document.getElementById('rival-fill'),
  rivalHp: document.getElementById('rival-hp-num'),
  playerFill: document.getElementById('player-fill'),
  playerHp: document.getElementById('player-hp-num'),
  playerTrack: document.getElementById('player-track'),
  startBtn: document.getElementById('start-btn'),
  resumeBtn: document.getElementById('resume-btn'),
  againBtn: document.getElementById('again-btn'),
  mute: document.getElementById('mute'),
  boot: document.getElementById('boot-error'),
  status: document.getElementById('status'),
  lockMsg: document.getElementById('lock-msg'),
  damage: document.getElementById('damage'),
  coarse: document.getElementById('coarse-note'),
};

const keys = new Set();
const solids = [];
const boxes = [];
const beams = [];
const sparks = [];

const player = { x: 0, z: 14, yaw: 0, pitch: 0, hp: 100, cooldown: 0, moving: false };
const enemy = {
  x: 0, z: -14, hp: 100, cooldown: 0, windup: 0, dead: false, fall: 0,
  hitFlash: 0, stuck: 0, moving: 0, aim: new THREE.Vector3(0, 0, 1), anchor: 0,
};

let state = 'menu';
let firing = false;
let muted = false;
let pendingFresh = false;
let fightT = 0;
let hitsLanded = 0;
let hitsTaken = 0;
let recoil = 0;
let shake = 0;
let damageFlash = 0;
let hitMarkerT = 0;
let bob = 0;
let swayX = 0;
let swayY = 0;
let swayTargetX = 0;
let swayTargetY = 0;
let flashT = 0;
let last = performance.now();
let audio = null;
let master = null;
let noiseBuffer = null;

const _forward = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _muzzle = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _aimFrom = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _head = new THREE.Vector3();
const _oc = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
raycaster.near = 0.12;
raycaster.far = REACH;

let renderer;
let scene;
let camera;
let viewmodel;
let flashMesh;
let muzzleObj;
let muzzleLight;
let enemyLight;
let laser;
let rival;
let visorMat;
let bodyMat;
let legL;
let legR;
let enemyMuzzle;
let hpCanvas;
let hpTex;
let hpSprite;
let animT = 0;

function showBoot(message) {
  ui.boot.hidden = false;
  ui.boot.textContent = message;
}

function init() {
  renderer = new THREE.WebGLRenderer({
    canvas: ui.canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101722);
  scene.fog = new THREE.Fog(0x101722, 26, 62);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 200);
  camera.rotation.order = 'YXZ';

  buildLights();
  buildArena();
  buildRival();
  buildGun();
  buildPools();

  if (window.matchMedia('(pointer: coarse)').matches) ui.coarse.hidden = false;

  resetRound();
  showPanel('menu');
  bindInput();
  window.addEventListener('resize', resize);
  window.__PITFIGHT__ = true;
  requestAnimationFrame(loop);
}

function lightBoth(light) {
  light.layers.enable(1);
  return light;
}

function buildLights() {
  const hemi = lightBoth(new THREE.HemisphereLight(0xc9dcff, 0x24180f, 0.72));
  scene.add(hemi);
  scene.add(lightBoth(new THREE.AmbientLight(0x8ea0bf, 0.28)));

  const sun = lightBoth(new THREE.DirectionalLight(0xf2f6ff, 2.35));
  sun.position.set(10, 28, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.00035;
  scene.add(sun);
  scene.add(sun.target);

  const fill = lightBoth(new THREE.DirectionalLight(0x8eb6ff, 0.55));
  fill.position.set(-14, 10, -8);
  scene.add(fill);

  addLamp(-8, -8, 0x8ad8ff, 46);
  addLamp(8, 8, 0x8ad8ff, 46);
  addLamp(8, -8, 0xff5d6d, 28);
  addLamp(-8, 8, 0xff5d6d, 28);

  muzzleLight = lightBoth(new THREE.PointLight(0xd6f4ff, 0, 9, 2));
  enemyLight = lightBoth(new THREE.PointLight(0xff3344, 0, 9, 2));
  scene.add(muzzleLight, enemyLight);
}

function addLamp(x, z, color, intensity) {
  const lamp = lightBoth(new THREE.PointLight(color, intensity, 20, 2));
  lamp.position.set(x, 4.15, z);
  scene.add(lamp);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  bulb.position.copy(lamp.position);
  scene.add(bulb);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x1b2430, metalness: 0.6, roughness: 0.4 }),
  );
  stem.position.set(x, 4.55, z);
  scene.add(stem);
}

function makeTexture(draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  draw(canvas.getContext('2d'), canvas);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function buildArena() {
  const floorTex = makeTexture((g) => {
    g.fillStyle = '#141920';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 500; i += 1) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = 'rgba(140, 196, 210, 0.35)';
    g.lineWidth = 3;
    g.strokeRect(2, 2, 252, 252);
    g.strokeStyle = 'rgba(121, 231, 255, 0.16)';
    g.beginPath();
    g.moveTo(0, 128);
    g.lineTo(256, 128);
    g.moveTo(128, 0);
    g.lineTo(128, 256);
    g.stroke();
  }, 9, 9);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
    new THREE.MeshStandardMaterial({ map: floorTex, color: 0xffffff, roughness: 0.92, metalness: 0.08 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  solids.push(floor);

  const wallTex = makeTexture((g) => {
    g.fillStyle = '#2a384c';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(8, 12, 18, 0.55)';
    g.lineWidth = 6;
    for (let x = 0; x <= 256; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 256);
      g.stroke();
    }
    g.strokeStyle = 'rgba(180, 210, 230, 0.15)';
    g.lineWidth = 2;
    g.strokeRect(10, 10, 236, 236);
  }, 4, 1);

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.12,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x083038,
    emissive: 0x37d6ff,
    emissiveIntensity: 1.15,
    roughness: 0.35,
  });

  const span = ARENA * 2 + 2;
  const thick = 1;
  const specs = [
    [0, WALL_H / 2, -ARENA - thick / 2, span, WALL_H, thick, 0, WALL_H - 0.05, -ARENA - thick / 2, span, 0.1, thick],
    [0, WALL_H / 2, ARENA + thick / 2, span, WALL_H, thick, 0, WALL_H - 0.05, ARENA + thick / 2, span, 0.1, thick],
    [-ARENA - thick / 2, WALL_H / 2, 0, thick, WALL_H, span, -ARENA - thick / 2, WALL_H - 0.05, 0, thick, 0.1, span],
    [ARENA + thick / 2, WALL_H / 2, 0, thick, WALL_H, span, ARENA + thick / 2, WALL_H - 0.05, 0, thick, 0.1, span],
  ];
  for (const spec of specs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec[3], spec[4], spec[5]), wallMat);
    mesh.position.set(spec[0], spec[1], spec[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push(mesh);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(spec[9], spec[10], spec[11]), trimMat);
    trim.position.set(spec[6], spec[7], spec[8]);
    scene.add(trim);
  }

  const hazard = makeTexture((g) => {
    g.fillStyle = '#b4531c';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#f0c14a';
    for (let i = -256; i < 512; i += 42) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 20, 0);
      g.lineTo(i + 20 - 256, 256);
      g.lineTo(i - 256, 256);
      g.fill();
    }
  }, 2, 2);

  const crateMat = new THREE.MeshStandardMaterial({
    map: hazard,
    roughness: 0.72,
    metalness: 0.18,
  });
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x66788d,
    roughness: 0.42,
    metalness: 0.62,
  });
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0x3c4c60,
    roughness: 0.7,
    metalness: 0.28,
  });

  for (const cover of COVER) {
    const mat = cover.kind === 'crate' ? crateMat : cover.kind === 'pillar' ? pillarMat : barrierMat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(cover.w, cover.h, cover.d), mat);
    mesh.position.set(cover.x, cover.h / 2 + 0.02, cover.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push(mesh);
    boxes.push({
      minX: cover.x - cover.w / 2,
      maxX: cover.x + cover.w / 2,
      minZ: cover.z - cover.d / 2,
      maxZ: cover.z + cover.d / 2,
    });
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.15, 3.32, 64),
    new THREE.MeshBasicMaterial({ color: 0x79e7ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);

  const mark = makeTexture((g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(121, 231, 255, 0.85)';
    g.font = '700 92px Bahnschrift, Arial Narrow, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PIT', 128, 132);
  });
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshBasicMaterial({
      map: mark,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.035;
  scene.add(decal);
}

function limb(parent, x, y, z, width, height, depth, mat) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.position.y = -height / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

function buildRival() {
  rival = new THREE.Group();
  bodyMat = new THREE.MeshStandardMaterial({
    color: 0x5a2230,
    roughness: 0.46,
    metalness: 0.48,
    emissive: 0xff2233,
    emissiveIntensity: 0,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17191f, roughness: 0.4, metalness: 0.72 });
  visorMat = new THREE.MeshStandardMaterial({
    color: 0xff2d3e,
    emissive: 0xff2436,
    emissiveIntensity: 0.8,
    roughness: 0.28,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.4), bodyMat);
  torso.position.y = 1.18;
  torso.castShadow = true;
  rival.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.36), dark);
  head.position.y = 1.7;
  head.castShadow = true;
  rival.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.08), visorMat);
  visor.position.set(0, 1.72, 0.18);
  rival.add(visor);

  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.32), dark);
  hip.position.y = 0.7;
  hip.castShadow = true;
  rival.add(hip);

  legL = limb(rival, -0.16, 0.62, 0, 0.18, 0.6, 0.2, bodyMat);
  legR = limb(rival, 0.16, 0.62, 0, 0.18, 0.6, 0.2, bodyMat);
  limb(rival, -0.48, 1.45, 0, 0.16, 0.55, 0.16, bodyMat);
  const armR = limb(rival, 0.48, 1.42, 0.05, 0.16, 0.5, 0.16, dark);
  armR.rotation.x = -0.5;

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.62), dark);
  gun.position.set(0.48, 1.02, 0.42);
  gun.castShadow = true;
  rival.add(gun);

  enemyMuzzle = new THREE.Object3D();
  enemyMuzzle.position.set(0.48, 1.02, 0.74);
  rival.add(enemyMuzzle);

  hpCanvas = document.createElement('canvas');
  hpCanvas.width = 256;
  hpCanvas.height = 64;
  hpTex = new THREE.CanvasTexture(hpCanvas);
  hpTex.colorSpace = THREE.SRGBColorSpace;
  hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthWrite: false }));
  hpSprite.scale.set(1.7, 0.42, 1);
  hpSprite.position.y = 2.35;
  rival.add(hpSprite);

  scene.add(rival);
  paintRivalBar();
}

function paintRivalBar() {
  const g = hpCanvas.getContext('2d');
  const pct = Math.max(0, enemy.hp / 100);
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = '#f4f7fb';
  g.font = '600 20px Bahnschrift, Arial Narrow, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('RIVAL', 128, 14);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(18, 30, 220, 16);
  g.fillStyle = pct > 0.35 ? '#ff3b4e' : '#ffb15a';
  g.fillRect(20, 32, 216 * pct, 12);
  hpTex.needsUpdate = true;
}

function buildGun() {
  viewmodel = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: 0x1b2430,
    roughness: 0.32,
    metalness: 0.78,
    fog: false,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x062830,
    emissive: 0x1ad4ff,
    emissiveIntensity: 0.85,
    roughness: 0.3,
    fog: false,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5), metal);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), metal);
  barrel.position.set(0, 0.045, -0.34);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.22), accent);
  glow.position.set(0, 0.075, -0.08);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), metal);
  mag.position.set(0, -0.12, 0.02);
  viewmodel.add(body, barrel, glow, mag);

  muzzleObj = new THREE.Object3D();
  muzzleObj.position.set(0, 0.045, -0.5);
  viewmodel.add(muzzleObj);

  flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xe7fbff, transparent: true, depthWrite: false, fog: false }),
  );
  flashMesh.position.copy(muzzleObj.position);
  flashMesh.visible = false;
  viewmodel.add(flashMesh);

  viewmodel.position.set(0.32, -0.26, -0.55);
  viewmodel.traverse((obj) => obj.layers.set(1));
  camera.add(viewmodel);
  scene.add(camera);
}

function buildPools() {
  laser = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff3344,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  laser.frustumCulled = false;
  laser.visible = false;
  scene.add(laser);

  for (let i = 0; i < 18; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 5, 1, true),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    beams.push({ mesh, alive: false, life: 0, max: 0.08 });
  }
  for (let i = 0; i < 16; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, alive: false, life: 0, max: 0.16 });
  }
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function showPanel(name) {
  ui.overlay.hidden = name === 'none';
  ui.overlay.classList.toggle('center', name === 'pause' || name === 'end');
  ui.menuPanel.hidden = name !== 'menu';
  ui.pausePanel.hidden = name !== 'pause';
  ui.endPanel.hidden = name !== 'end';
  document.body.classList.toggle('locked', name === 'none');
}

function resetRound() {
  player.x = 0;
  player.z = 14;
  player.yaw = 0;
  player.pitch = 0;
  player.hp = 100;
  player.cooldown = 0;
  player.moving = false;
  enemy.x = 0;
  enemy.z = -14;
  enemy.hp = 100;
  enemy.cooldown = 0;
  enemy.windup = 0;
  enemy.dead = false;
  enemy.fall = 0;
  enemy.hitFlash = 0;
  enemy.stuck = 0;
  enemy.moving = 0;
  enemy.anchor = 0;
  hitsLanded = 0;
  hitsTaken = 0;
  recoil = 0;
  shake = 0;
  damageFlash = 0;
  hitMarkerT = 0;
  flashT = 0;
  rival.rotation.set(0, Math.PI, 0);
  rival.position.set(enemy.x, 0, enemy.z);
  hpSprite.visible = true;
  paintRivalBar();
  clearFx();
  updateHud();
}

function clearFx() {
  for (const beam of beams) {
    beam.alive = false;
    beam.mesh.visible = false;
  }
  for (const spark of sparks) {
    spark.alive = false;
    spark.mesh.visible = false;
  }
  laser.visible = false;
  muzzleLight.intensity = 0;
  enemyLight.intensity = 0;
  flashMesh.visible = false;
}

function bindInput() {
  ui.startBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    begin(false);
  });
  ui.resumeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    begin(true);
  });
  ui.againBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    begin(false);
  });
  ui.overlay.addEventListener('click', () => {
    if (state === 'menu') begin(false);
    else if (state === 'pause') begin(true);
  });
  ui.mute.addEventListener('click', (event) => {
    event.stopPropagation();
    muted = !muted;
    ensureAudio();
    if (master) master.gain.value = muted ? 0 : 0.85;
    ui.mute.textContent = muted ? 'Sound off' : 'Sound on';
    ui.mute.setAttribute('aria-pressed', String(muted));
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'Enter') {
      if (state === 'menu' || state === 'end') begin(false);
      else if (state === 'pause') begin(true);
    }
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', clearInput);
  window.addEventListener('mousemove', (event) => {
    if (state !== 'play') return;
    const sens = 0.00215;
    player.yaw -= event.movementX * sens;
    player.pitch -= event.movementY * sens;
    player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));
    swayTargetX = Math.max(-0.05, Math.min(0.05, swayTargetX - event.movementX * 0.00035));
    swayTargetY = Math.max(-0.035, Math.min(0.035, swayTargetY + event.movementY * 0.00022));
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || state !== 'play') return;
    if (event.target.closest && event.target.closest('button')) return;
    firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
  });
  ui.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', onLockChange);
}

function clearInput() {
  keys.clear();
  firing = false;
}

function enterPlay() {
  if (pendingFresh) {
    resetRound();
    fightT = 0.85;
    ui.announce.hidden = false;
    ui.announce.textContent = 'FIGHT';
    ui.announce.classList.remove('pop');
    void ui.announce.offsetWidth;
    ui.announce.classList.add('pop');
    ui.status.textContent = 'Fight.';
    pendingFresh = false;
  }
  if (state !== 'play') {
    state = 'play';
    showPanel('none');
  }
}

function begin(resume) {
  ensureAudio();
  ui.lockMsg.hidden = true;
  pendingFresh = !resume;
  let started = false;
  const fallback = () => {
    if (started || document.pointerLockElement === ui.canvas) return;
    started = true;
    enterPlay();
  };
  const result = ui.canvas.requestPointerLock();
  if (result && typeof result.then === 'function') {
    result.then(() => { started = true; }).catch(fallback);
  }
  setTimeout(fallback, 350);
}

function onLockChange() {
  const locked = document.pointerLockElement === ui.canvas;
  if (locked) {
    enterPlay();
  } else if (state === 'play') {
    state = 'pause';
    clearInput();
    showPanel('pause');
    ui.status.textContent = 'Paused.';
  }
}

function ensureAudio() {
  if (audio) {
    if (audio.state === 'suspended') audio.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    audio = new Ctx();
    master = audio.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(audio.destination);
    const seconds = 0.2;
    noiseBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * seconds), audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch (err) {
    audio = null;
  }
}

function playTone(freq, dur, type, gain, slide) {
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(amp);
  amp.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function playNoise(dur, gain, freq) {
  if (!audio || !noiseBuffer) return;
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 0.6;
  const amp = audio.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function circleHitsAabb(x, z, radius, box) {
  const cx = Math.max(box.minX, Math.min(x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

function circleBlocked(x, z, radius) {
  const limit = ARENA - radius;
  if (Math.abs(x) > limit || Math.abs(z) > limit) return true;
  for (const box of boxes) {
    if (circleHitsAabb(x, z, radius, box)) return true;
  }
  return false;
}

function depenetrate(x, z, radius) {
  for (let pass = 0; pass < 4; pass += 1) {
    const limit = ARENA - radius;
    x = Math.max(-limit, Math.min(limit, x));
    z = Math.max(-limit, Math.min(limit, z));
    for (const box of boxes) {
      const cx = Math.max(box.minX, Math.min(x, box.maxX));
      const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
      let dx = x - cx;
      let dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 < 1e-8) {
        const left = x - box.minX;
        const right = box.maxX - x;
        const down = z - box.minZ;
        const up = box.maxZ - z;
        const min = Math.min(left, right, down, up);
        if (min === left) x = box.minX - radius;
        else if (min === right) x = box.maxX + radius;
        else if (min === down) z = box.minZ - radius;
        else z = box.maxZ + radius;
      } else {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        x += dx * push;
        z += dz * push;
      }
    }
  }
  return { x, z };
}

function moveWithSlide(x, z, dx, dz, radius) {
  if (!circleBlocked(x + dx, z, radius)) x += dx;
  if (!circleBlocked(x, z + dz, radius)) z += dz;
  return depenetrate(x, z, radius);
}

function separateBodies() {
  let dx = enemy.x - player.x;
  let dz = enemy.z - player.z;
  let dist = Math.hypot(dx, dz);
  const min = PLAYER_R + ENEMY_R;
  if (dist >= min) return;
  if (dist < 1e-6) {
    dx = 1;
    dz = 0;
    dist = 1;
  }
  const push = (min - dist) / dist;
  player.x -= dx * push * 0.5;
  player.z -= dz * push * 0.5;
  enemy.x += dx * push * 0.5;
  enemy.z += dz * push * 0.5;
}

function firstSolid(origin, direction) {
  raycaster.set(origin, direction);
  const hits = raycaster.intersectObjects(solids, false);
  return hits.length ? hits[0].distance : Infinity;
}

function raySphere(origin, direction, center, radius) {
  _oc.subVectors(origin, center);
  const b = _oc.dot(direction);
  const c = _oc.dot(_oc) - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const s = Math.sqrt(h);
  const near = -b - s;
  if (near > 0.05) return near;
  const far = -b + s;
  if (far > 0.05) return far;
  return null;
}

function nearer(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function rayEnemy(origin, direction) {
  if (enemy.dead) return null;
  _chest.set(enemy.x, 1.05, enemy.z);
  _head.set(enemy.x, 1.66, enemy.z);
  return nearer(raySphere(origin, direction, _chest, 0.46), raySphere(origin, direction, _head, 0.3));
}

function rayPlayer(origin, direction) {
  _chest.set(player.x, 1.0, player.z);
  _head.set(player.x, EYE, player.z);
  return nearer(raySphere(origin, direction, _chest, 0.4), raySphere(origin, direction, _head, 0.28));
}

function syncCamera() {
  camera.rotation.order = 'YXZ';
  camera.rotation.set(player.pitch + recoil, player.yaw, 0);
  camera.position.set(player.x, EYE, player.z);
  camera.updateMatrixWorld(true);
}

function cameraForward(out) {
  return out.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
}

function placeBeam(mesh, from, to, radius) {
  _delta.subVectors(to, from);
  const len = _delta.length();
  if (len < 0.001) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.scale.set(radius, len, radius);
  mesh.position.copy(from).addScaledVector(_delta, 0.5 / len);
  _dir.copy(_delta).multiplyScalar(1 / len);
  mesh.quaternion.setFromUnitVectors(_up, _dir);
}

function spawnBeam(from, to, color, life, radius) {
  let beam = beams.find((item) => !item.alive);
  if (!beam) beam = beams[0];
  beam.alive = true;
  beam.life = life;
  beam.max = life;
  beam.mesh.material.color.set(color);
  beam.mesh.material.opacity = 1;
  placeBeam(beam.mesh, from, to, radius);
}

function spawnSpark(pos, color) {
  let spark = sparks.find((item) => !item.alive);
  if (!spark) spark = sparks[0];
  spark.alive = true;
  spark.life = 0.16;
  spark.max = 0.16;
  spark.mesh.material.color.set(color);
  spark.mesh.material.opacity = 1;
  spark.mesh.position.copy(pos);
  spark.mesh.scale.setScalar(0.06);
  spark.mesh.visible = true;
}

function shootPlayer() {
  player.cooldown = FIRE_RATE;
  recoil = Math.min(0.07, recoil + 0.018);
  shake = Math.min(0.2, shake + 0.025);
  flashT = 0.045;
  muzzleObj.getWorldPosition(_muzzle);
  muzzleLight.position.copy(_muzzle);
  muzzleLight.intensity = 36;
  cameraForward(_dir);
  const origin = camera.position;
  const enemyT = rayEnemy(origin, _dir);
  const solidT = firstSolid(origin, _dir);
  let end = REACH;
  if (enemyT !== null && enemyT < solidT && enemyT < REACH) {
    end = enemyT;
    hurtEnemy(PLAYER_DAMAGE);
    _hit.copy(origin).addScaledVector(_dir, end);
    spawnSpark(_hit, 0xffd0d6);
  } else if (solidT < REACH) {
    end = solidT;
    _hit.copy(origin).addScaledVector(_dir, end).addScaledVector(_dir, -0.05);
    spawnSpark(_hit, 0xb7ecff);
    playNoise(0.05, 0.04, 1400);
  }
  _hit.copy(origin).addScaledVector(_dir, Math.min(end, REACH));
  spawnBeam(_muzzle, _hit, 0x9be7ff, 0.07, 0.018);
  playNoise(0.07, 0.16, 900);
  playTone(180, 0.06, 'square', 0.03, 70);
}

function hurtEnemy(amount) {
  if (enemy.dead || state !== 'play') return;
  enemy.hp = Math.max(0, enemy.hp - amount);
  enemy.hitFlash = 1;
  hitsLanded += 1;
  hitMarkerT = 0.08;
  ui.hitmarker.hidden = false;
  paintRivalBar();
  playTone(880, 0.05, 'square', 0.04, 440);
  if (enemy.hp <= 0) {
    enemy.dead = true;
    enemy.windup = 0;
    laser.visible = false;
    hpSprite.visible = false;
    endGame(true);
  }
}

function hurtPlayer(amount) {
  if (state !== 'play' || player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - amount);
  hitsTaken += 1;
  shake = Math.min(0.32, shake + 0.14);
  damageFlash = 0.2;
  playNoise(0.12, 0.18, 180);
  playTone(90, 0.14, 'sawtooth', 0.04, 50);
  if (player.hp <= 0) endGame(false);
}

function endGame(won) {
  if (state === 'end') return;
  state = 'end';
  clearInput();
  if (document.pointerLockElement === ui.canvas) document.exitPointerLock();
  ui.endTitle.textContent = won ? 'Rival down' : 'You fell';
  ui.endCopy.textContent = won ? 'The pit is yours.' : 'The rival holds the arena.';
  ui.endStats.textContent = `Hits landed ${hitsLanded} · Hits taken ${hitsTaken}`;
  showPanel('end');
  ui.status.textContent = won ? 'You won.' : 'You lost.';
  if (won) playTone(520, 0.28, 'triangle', 0.05, 180);
  else playTone(140, 0.35, 'sawtooth', 0.05, 48);
}

function updatePlayer(dt) {
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  let ix = 0;
  let iz = 0;
  if (keys.has('KeyW')) { ix += -sin; iz += -cos; }
  if (keys.has('KeyS')) { ix -= -sin; iz -= -cos; }
  if (keys.has('KeyD')) { ix += cos; iz += -sin; }
  if (keys.has('KeyA')) { ix -= cos; iz -= -sin; }
  const len = Math.hypot(ix, iz);
  player.moving = len > 0;
  const step = len > 0 ? MOVE_SPEED * dt : 0;
  const next = moveWithSlide(player.x, player.z, len > 0 ? (ix / len) * step : 0, len > 0 ? (iz / len) * step : 0, PLAYER_R);
  player.x = next.x;
  player.z = next.z;
  player.cooldown = Math.max(0, player.cooldown - dt);
  recoil *= Math.exp(-dt * 11);
  syncCamera();
  const locked = document.pointerLockElement === ui.canvas;
  if (!locked) firing = false;
  if (fightT <= 0 && firing && player.cooldown <= 0) shootPlayer();
  syncCamera();
}

function updateEnemy(dt) {
  if (enemy.dead) return;
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);

  const anchor = ANCHORS[enemy.anchor];
  let dx = anchor.x - enemy.x;
  let dz = anchor.z - enemy.z;
  let distA = Math.hypot(dx, dz);
  if (distA < 0.85) {
    enemy.anchor = (enemy.anchor + 1) % ANCHORS.length;
    dx = ANCHORS[enemy.anchor].x - enemy.x;
    dz = ANCHORS[enemy.anchor].z - enemy.z;
    distA = Math.hypot(dx, dz) || 1;
  }
  const pdx = player.x - enemy.x;
  const pdz = player.z - enemy.z;
  const pd = Math.hypot(pdx, pdz) || 1;
  let vx = dx / (distA || 1);
  let vz = dz / (distA || 1);
  if (pd < 6.5) {
    vx -= (pdx / pd) * 1.1;
    vz -= (pdz / pd) * 1.1;
  }
  const vlen = Math.hypot(vx, vz) || 1;
  const speed = (enemy.windup > 0 ? ENEMY_SPEED * 0.45 : ENEMY_SPEED) * dt;
  const beforeX = enemy.x;
  const beforeZ = enemy.z;
  const next = moveWithSlide(enemy.x, enemy.z, (vx / vlen) * speed, (vz / vlen) * speed, ENEMY_R);
  enemy.x = next.x;
  enemy.z = next.z;
  const moved = Math.hypot(enemy.x - beforeX, enemy.z - beforeZ);
  enemy.moving = moved > 0.002 ? 1 : 0;
  enemy.stuck = enemy.moving ? 0 : enemy.stuck + dt;
  if (enemy.stuck > 0.7) {
    enemy.anchor = (enemy.anchor + 1) % ANCHORS.length;
    enemy.stuck = 0;
  }

  rival.position.set(enemy.x, 0, enemy.z);
  rival.rotation.set(0, Math.atan2(player.x - enemy.x, player.z - enemy.z), 0);
  rival.updateMatrixWorld(true);
  enemyMuzzle.getWorldPosition(_aimFrom);
  _eye.set(player.x, EYE - 0.05, player.z);
  _desired.subVectors(_eye, _aimFrom);
  const targetDist = _desired.length();
  if (targetDist > 0.001) _desired.multiplyScalar(1 / targetDist);
  enemy.aim.lerp(_desired, 1 - Math.exp(-dt * 8));
  if (enemy.aim.lengthSq() > 0) enemy.aim.normalize();

  _eye.set(enemy.x, 1.5, enemy.z);
  _desired.subVectors(new THREE.Vector3(player.x, EYE, player.z), _eye);
  const eyeDist = _desired.length() || 1;
  _desired.multiplyScalar(1 / eyeDist);
  const blocked = firstSolid(_eye, _desired) < eyeDist - 0.35;
  const canSee = !blocked && eyeDist < 34;

  if (fightT > 0 || !canSee) {
    enemy.windup = Math.max(0, enemy.windup - dt * 2);
  } else if (enemy.cooldown <= 0) {
    enemy.windup += dt;
    if (enemy.windup >= WINDUP) {
      fireEnemy();
      enemy.windup = 0;
      enemy.cooldown = ENEMY_GAP;
    }
  }

  if (enemy.windup > 0.04 && !enemy.dead) {
    const reach = Math.min(firstSolid(_aimFrom, enemy.aim), 28);
    _hit.copy(_aimFrom).addScaledVector(enemy.aim, reach);
    placeBeam(laser, _aimFrom, _hit, 0.012);
    laser.material.opacity = 0.35 + enemy.windup;
  } else {
    laser.visible = false;
  }
}

function fireEnemy() {
  _dir.copy(enemy.aim);
  _dir.x += (Math.random() - 0.5) * 0.012;
  _dir.y += (Math.random() - 0.5) * 0.01;
  _dir.z += (Math.random() - 0.5) * 0.012;
  _dir.normalize();
  enemyMuzzle.getWorldPosition(_muzzle);
  enemyLight.position.copy(_muzzle);
  enemyLight.intensity = 24;
  const solidT = firstSolid(_muzzle, _dir);
  const playerT = rayPlayer(_muzzle, _dir);
  let end = Math.min(solidT, 40);
  if (playerT !== null && playerT < solidT) {
    end = playerT;
    hurtPlayer(ENEMY_DAMAGE);
    _hit.copy(_muzzle).addScaledVector(_dir, end);
    spawnSpark(_hit, 0xff8894);
  } else if (solidT < 70) {
    _hit.copy(_muzzle).addScaledVector(_dir, solidT).addScaledVector(_dir, -0.05);
    spawnSpark(_hit, 0xff8894);
    end = solidT;
  }
  _hit.copy(_muzzle).addScaledVector(_dir, end);
  spawnBeam(_muzzle, _hit, 0xff5162, 0.09, 0.02);
  playNoise(0.08, 0.1, 420);
  playTone(240, 0.07, 'square', 0.03, 90);
}

function updateRivalVisual(dt) {
  animT += dt * (enemy.moving ? 10 : 2.2);
  if (!enemy.dead) {
    if (state === 'menu') {
      rival.position.set(enemy.x, 0, enemy.z);
      rival.rotation.set(0, Math.atan2(-enemy.x, -14 - enemy.z), 0);
    }
    const swing = Math.sin(animT) * (enemy.moving ? 0.7 : 0.08);
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    rival.position.y = enemy.moving ? Math.abs(Math.sin(animT)) * 0.05 : 0;
    visorMat.emissiveIntensity = enemy.windup > 0 ? 1 + enemy.windup * 6 : 0.7 + Math.sin(animT * 0.7) * 0.18;
  } else {
    enemy.fall = Math.min(1, enemy.fall + dt * 1.7);
    rival.rotation.x = enemy.fall * 1.2;
    rival.position.y = -enemy.fall * 0.45;
    visorMat.emissiveIntensity = Math.max(0.1, 0.8 - enemy.fall);
  }
  bodyMat.emissiveIntensity = enemy.hitFlash > 0 ? enemy.hitFlash * 0.85 : 0;
  hpSprite.visible = !enemy.dead;
}

function updateViewmodel(dt) {
  bob += dt * (player.moving && state === 'play' ? 9.5 : 1.6);
  const amp = player.moving && state === 'play' ? 0.012 : 0.004;
  swayX += (swayTargetX - swayX) * Math.min(1, dt * 8);
  swayY += (swayTargetY - swayY) * Math.min(1, dt * 8);
  swayTargetX *= Math.exp(-dt * 7);
  swayTargetY *= Math.exp(-dt * 7);
  const kick = Math.min(1, flashT / 0.045);
  viewmodel.position.set(
    0.32 + swayX,
    -0.26 + swayY + Math.sin(bob) * amp,
    -0.55 + kick * 0.07,
  );
  flashT = Math.max(0, flashT - dt);
  flashMesh.visible = flashT > 0;
  flashMesh.material.opacity = flashT / 0.045;
}

function updateFx(dt) {
  for (const beam of beams) {
    if (!beam.alive) continue;
    beam.life -= dt;
    beam.mesh.material.opacity = Math.max(0, beam.life / beam.max);
    if (beam.life <= 0) {
      beam.alive = false;
      beam.mesh.visible = false;
    }
  }
  for (const spark of sparks) {
    if (!spark.alive) continue;
    spark.life -= dt;
    const k = Math.max(0, spark.life / spark.max);
    spark.mesh.material.opacity = k;
    spark.mesh.scale.setScalar(0.05 + (1 - k) * 0.22);
    if (spark.life <= 0) {
      spark.alive = false;
      spark.mesh.visible = false;
    }
  }
  muzzleLight.intensity *= Math.exp(-dt * 26);
  enemyLight.intensity *= Math.exp(-dt * 26);
}

function updateHud() {
  const fps = state !== 'menu';
  ui.hud.hidden = !fps;
  ui.crosshair.hidden = state !== 'play';
  ui.ready.hidden = state !== 'play';
  ui.hint.hidden = state !== 'play';
  ui.announce.hidden = !(state === 'play' && fightT > 0);
  ui.playerFill.style.transform = `scaleX(${Math.max(0, player.hp) / 100})`;
  ui.rivalFill.style.transform = `scaleX(${Math.max(0, enemy.hp) / 100})`;
  ui.playerHp.textContent = String(Math.max(0, Math.ceil(player.hp)));
  ui.rivalHp.textContent = String(Math.max(0, Math.ceil(enemy.hp)));
  ui.playerTrack.classList.toggle('critical', player.hp > 0 && player.hp <= 20);
  ui.playerTrack.classList.toggle('low', player.hp > 20 && player.hp <= 40);
  ui.readyFill.style.transform = `scaleX(${1 - player.cooldown / FIRE_RATE})`;
  ui.damage.classList.toggle('show', damageFlash > 0);
  ui.damage.classList.toggle('low', state === 'play' && player.hp > 0 && player.hp <= 30 && damageFlash <= 0);
  if (hitMarkerT <= 0) ui.hitmarker.hidden = true;
}

function updateMenuCamera(now) {
  const t = now * 0.00012;
  camera.position.set(Math.sin(t) * 13, 11.5, Math.cos(t) * 13);
  camera.lookAt(0, 0.4, 0);
}

function renderScene() {
  const fps = state !== 'menu';
  viewmodel.visible = fps;
  camera.layers.set(0);
  renderer.autoClear = true;
  renderer.render(scene, camera);
  if (!fps) return;
  const backdrop = scene.background;
  scene.background = null;
  renderer.autoClear = false;
  renderer.clearDepth();
  camera.layers.set(1);
  renderer.render(scene, camera);
  scene.background = backdrop;
  renderer.autoClear = true;
  camera.layers.set(0);
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'menu') {
    updateMenuCamera(now);
    updateRivalVisual(dt);
  } else {
    if (state === 'play') {
      if (fightT > 0) fightT -= dt;
      updatePlayer(dt);
      if (state === 'play') updateEnemy(dt);
      if (state === 'play') {
        separateBodies();
        const p = depenetrate(player.x, player.z, PLAYER_R);
        player.x = p.x;
        player.z = p.z;
        const e = depenetrate(enemy.x, enemy.z, ENEMY_R);
        enemy.x = e.x;
        enemy.z = e.z;
        syncCamera();
      }
    } else {
      syncCamera();
      if (enemy.dead) updateRivalVisual(0);
    }
    if (state !== 'play' && enemy.dead) {
      updateRivalVisual(dt);
    } else if (state !== 'menu') {
      updateRivalVisual(dt);
    }
    updateViewmodel(dt);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake * 0.7;
      shake = Math.max(0, shake - dt * 1.3);
    }
  }

  damageFlash = Math.max(0, damageFlash - dt);
  hitMarkerT = Math.max(0, hitMarkerT - dt);
  updateFx(dt);
  updateHud();
  renderScene();
  requestAnimationFrame(loop);
}

try {
  init();
} catch (err) {
  console.error(err);
  showBoot('The arena failed to start. Reload the page and try again.');
}

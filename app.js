/* =========================================================================
   Pedang Bayangan — kawanan partikel pedang yang bereaksi pada gestur tangan
   -------------------------------------------------------------------------
   Struktur file:
   1. Konfigurasi & elemen DOM
   2. Setup Three.js (renderer, scene, kamera, efek jejak cahaya, bintang)
   3. Tekstur pedang + sistem partikel (shader kustom)
   4. Kerangka tangan neon + cincin portal
   5. Tema warna
   6. Rumus formasi kawanan per gestur
   7. Pelacakan tangan (MediaPipe Hands) + deteksi gestur
   8. Kontrol kamera (start/stop)
   9. Loop animasi
   10. Pengait UI
   Tidak ada langkah build — cukup buka index.html atau deploy ke GitHub Pages.
   ========================================================================= */

/* ---------- 1. Konfigurasi & elemen DOM ---------- */

const PARTICLE_COUNT = window.innerWidth < 700 ? 480 : 900;
const GRID_COLS = 20;
const GRID_ROWS = Math.max(2, Math.ceil(PARTICLE_COUNT / GRID_COLS));

const videoEl = document.getElementById('input-video');
const canvas = document.getElementById('scene');
const statusDot = document.getElementById('status-dot');
const statusState = document.getElementById('status-state');
const statusGesture = document.getElementById('status-gesture');
const cameraBtn = document.getElementById('camera-toggle');
const legendBtn = document.getElementById('legend-toggle');
const legendPanel = document.getElementById('legend');
const startHint = document.getElementById('start-hint');

const GESTURE_LABELS = {
  OPEN: 'Telapak terbuka — ledakan cincin',
  FIST: 'Kepalan — pusaran portal',
  PEACE: 'Tanda V — hujan pedang',
  ROCK: 'Tanda rock — bola pedang',
  FLOW: 'Kawanan mengalir',
};

/* ---------- 2. Setup Three.js ---------- */

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.autoClear = false; // penting: kita kelola clear manual demi efek jejak cahaya
renderer.setClearColor(0x05060f, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 9);

let VIEW_W = 8;
let VIEW_H = 6;
function updateViewBounds() {
  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const height = 2 * Math.tan(vFOV / 2) * camera.position.z;
  VIEW_H = height;
  VIEW_W = height * camera.aspect;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  updateViewBounds();
  renderer.clear();
}
window.addEventListener('resize', resize);

// Lapisan "fade" — quad hitam transparan tipis yang digambar tiap frame
// SEBELUM adegan utama, tanpa membersihkan buffer warna. Ini yang membuat
// pedang-pedang meninggalkan jejak cahaya seperti pada video referensi.
const fadeScene = new THREE.Scene();
const fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fadeMaterial = new THREE.MeshBasicMaterial({
  color: 0x05060f, transparent: true, opacity: 0.16, depthTest: false, depthWrite: false,
});
fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMaterial));

// Bintang latar belakang, statis dan lembut
function createStarfield() {
  const count = 450;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3 + 0] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
    pos[i * 3 + 2] = -12 - Math.random() * 18;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x9aa1c9, size: 0.05, transparent: true, opacity: 0.55, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}
scene.add(createStarfield());

/* ---------- 3. Tekstur pedang + sistem partikel ---------- */

function createSwordTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);

  const grad = ctx.createLinearGradient(0, -size * 0.47, 0, size * 0.3);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = grad;

  // bilah pedang meruncing
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.47);
  ctx.lineTo(size * 0.065, -size * 0.02);
  ctx.lineTo(size * 0.028, size * 0.26);
  ctx.lineTo(-size * 0.028, size * 0.26);
  ctx.lineTo(-size * 0.065, -size * 0.02);
  ctx.closePath();
  ctx.fill();

  // pengaman silang (cross-guard) + gagang — ciri khas pedang di video referensi
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(-size * 0.15, size * 0.22, size * 0.30, size * 0.032);
  ctx.fillRect(-size * 0.018, size * 0.25, size * 0.036, size * 0.14);

  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
const swordTexture = createSwordTexture();

const particleMaterial = new THREE.ShaderMaterial({
  uniforms: { uTexture: { value: swordTexture } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute float aSize;
    attribute vec3 aColor;
    varying vec3 vColor;
    void main() {
      vColor = aColor;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (340.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform sampler2D uTexture;
    varying vec3 vColor;
    void main() {
      vec4 tex = texture2D(uTexture, gl_PointCoord);
      if (tex.a < 0.03) discard;
      gl_FragColor = vec4(vColor * tex.rgb, tex.a);
    }
  `,
});

// data per-partikel
const positions = new Float32Array(PARTICLE_COUNT * 3);
const colorsAttr = new Float32Array(PARTICLE_COUNT * 3);
const sizesAttr = new Float32Array(PARTICLE_COUNT);

const seeds = new Float32Array(PARTICLE_COUNT);
const angles = new Float32Array(PARTICLE_COUNT);
const radii = new Float32Array(PARTICLE_COUNT);
const thetas = new Float32Array(PARTICLE_COUNT);
const phis = new Float32Array(PARTICLE_COUNT);
const colorMix = new Float32Array(PARTICLE_COUNT);
const baseSize = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  seeds[i] = Math.random() * 1000;
  angles[i] = Math.random() * Math.PI * 2;
  radii[i] = 0.6 + Math.random() * 2.6;
  thetas[i] = Math.acos(2 * Math.random() - 1);
  phis[i] = Math.random() * Math.PI * 2;
  colorMix[i] = Math.random();
  baseSize[i] = 0.5 + Math.random() * 0.9;

  positions[i * 3 + 0] = (Math.random() - 0.5) * 6;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
  sizesAttr[i] = baseSize[i];
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('aColor', new THREE.BufferAttribute(colorsAttr, 3));
particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizesAttr, 1));
const swarm = new THREE.Points(particleGeometry, particleMaterial);
scene.add(swarm);

/* ---------- 4. Kerangka tangan neon + cincin portal ---------- */

// Pasangan sendi standar model 21-titik MediaPipe Hands
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const lineGeometry = new THREE.BufferGeometry();
lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HAND_CONNECTIONS.length * 6), 3));
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.85 });
const skeletonLines = new THREE.LineSegments(lineGeometry, lineMaterial);
skeletonLines.visible = false;
scene.add(skeletonLines);

const jointGeometry = new THREE.BufferGeometry();
jointGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3));
const jointMaterial = new THREE.PointsMaterial({
  color: 0x5eead4, size: 0.09, transparent: true, opacity: 0.95, sizeAttenuation: true,
});
const skeletonJoints = new THREE.Points(jointGeometry, jointMaterial);
skeletonJoints.visible = false;
scene.add(skeletonJoints);

// halo portal — hanya tampak saat gestur "peace" (hujan pedang)
const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0xa78bfa, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
});
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.035, 16, 80), ringMaterial);
scene.add(ring);

/* ---------- 5. Tema warna ---------- */

const THEMES = [
  { id: 'aether', name: 'Aether', a: '#5eead4', b: '#a78bfa' },
  { id: 'ember', name: 'Ember', a: '#fb923c', b: '#f43f5e' },
  { id: 'verdant', name: 'Verdant', a: '#4ade80', b: '#facc15' },
  { id: 'frost', name: 'Frost', a: '#60a5fa', b: '#e0f2fe' },
];

const targetColorA = new THREE.Color(THEMES[0].a);
const targetColorB = new THREE.Color(THEMES[0].b);
const displayColorA = new THREE.Color(THEMES[0].a);
const displayColorB = new THREE.Color(THEMES[0].b);

function applyTheme(idx) {
  const t = THEMES[idx];
  targetColorA.set(t.a);
  targetColorB.set(t.b);
  document.documentElement.style.setProperty('--accent-a', t.a);
  document.documentElement.style.setProperty('--accent-b', t.b);
  document.querySelectorAll('.theme-swatch').forEach((el, i) => el.classList.toggle('active', i === idx));
}

function buildThemeSwatches() {
  const row = document.getElementById('theme-row');
  THEMES.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-swatch' + (i === 0 ? ' active' : '');
    btn.style.background = `linear-gradient(135deg, ${t.a}, ${t.b})`;
    btn.title = t.name;
    btn.setAttribute('aria-label', 'Tema warna ' + t.name);
    btn.addEventListener('click', () => applyTheme(i));
    row.appendChild(btn);
  });
}

/* ---------- 6. Rumus formasi kawanan per gestur ---------- */

const IDLE_CENTER = new THREE.Vector3(0, 0.3, 0);
const DAMPING = { OPEN: 0.14, FIST: 0.09, ROCK: 0.10, PEACE: 0.11, FLOW: 0.06 };

function computeTarget(i, gesture, anchor, time, out) {
  const seed = seeds[i];
  switch (gesture) {
    case 'OPEN': { // telapak terbuka → ledakan cincin cahaya berulang
      const phase = (time * 0.55 + seed * 0.013) % 1.0;
      const r = phase * 3.4;
      const ang = angles[i];
      out.set(
        anchor.x + Math.cos(ang) * r,
        anchor.y + 0.9 + Math.sin(ang) * r * 0.85,
        anchor.z + Math.sin(phase * Math.PI) * 0.6
      );
      sizesAttr[i] = baseSize[i] * (1.0 - phase * 0.75);
      return;
    }
    case 'FIST': { // kepalan → pusaran portal berputar
      const ang = angles[i] + time * 1.15;
      const r = 1.1 + (radii[i] % 1) * 0.9;
      out.set(
        anchor.x + Math.cos(ang) * r,
        anchor.y + 0.9 + Math.sin(ang) * r * 0.32,
        anchor.z + Math.sin(ang * 2 + seed) * 0.5
      );
      sizesAttr[i] = baseSize[i];
      return;
    }
    case 'ROCK': { // tanda rock → bola pedang anyaman
      const rot = time * 0.45;
      const r = 1.25;
      out.set(
        anchor.x + r * Math.sin(thetas[i]) * Math.cos(phis[i] + rot),
        anchor.y + 1.1 + r * Math.cos(thetas[i]),
        anchor.z + r * Math.sin(thetas[i]) * Math.sin(phis[i] + rot)
      );
      sizesAttr[i] = baseSize[i] * 0.85;
      return;
    }
    case 'PEACE': { // tanda V → hujan pedang bercahaya, tersusun rapi
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const spreadX = (col / (GRID_COLS - 1) - 0.5) * 5.6;
      const baseY = (row / (GRID_ROWS - 1)) * 4.6 - 0.6;
      const bob = Math.sin(time * 1.6 + seed) * 0.12;
      out.set(
        anchor.x + spreadX,
        anchor.y + baseY + bob + 0.2,
        anchor.z + Math.sin(seed * 2.7) * 0.9
      );
      sizesAttr[i] = baseSize[i] * (0.75 + 0.25 * Math.sin(time * 2 + seed));
      return;
    }
    default: { // FLOW — kawanan mengalir mengikuti tangan (juga keadaan diam)
      out.set(
        anchor.x + Math.cos(angles[i] + time * 0.35 + seed) * radii[i] * 0.55,
        anchor.y + Math.sin(angles[i] * 1.3 + time * 0.4 + seed) * radii[i] * 0.4 + 0.4,
        anchor.z + Math.sin(time * 0.22 + seed) * 0.7
      );
      sizesAttr[i] = baseSize[i];
    }
  }
}

/* ---------- 7. Pelacakan tangan (MediaPipe) + deteksi gestur ---------- */

let hands = null;
let cameraRunning = false;
let mediaStream = null;
let handVisible = false;
let currentGesture = 'FLOW';
let landmarksWorld = null;

const anchorRaw = new THREE.Vector3();
const anchorSmooth = new THREE.Vector3().copy(IDLE_CENTER);

function mapLandmarkToWorld(lm) {
  return new THREE.Vector3(
    (0.5 - lm.x) * VIEW_W * 0.9,   // dicerminkan supaya terasa alami, seperti kaca
    (0.5 - lm.y) * VIEW_H * 0.9,   // sumbu Y gambar mengarah bawah, dunia 3D mengarah atas
    -lm.z * 6
  );
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function fingerExtended(lm, tip, pip) {
  return dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.15;
}

function detectGestureRaw(lm) {
  const index = fingerExtended(lm, 8, 6);
  const middle = fingerExtended(lm, 12, 10);
  const ring = fingerExtended(lm, 16, 14);
  const pinky = fingerExtended(lm, 20, 18);

  if (index && middle && ring && pinky) return 'OPEN';
  if (!index && !middle && !ring && !pinky) return 'FIST';
  if (index && middle && !ring && !pinky) return 'PEACE';
  if (index && !middle && !ring && pinky) return 'ROCK';
  return 'FLOW';
}

// perhalus gestur dengan voting beberapa frame terakhir supaya tidak berkedip
const gestureHistory = [];
function stableGesture(raw) {
  gestureHistory.push(raw);
  if (gestureHistory.length > 6) gestureHistory.shift();
  const counts = {};
  let best = raw, bestCount = 0;
  for (const g of gestureHistory) {
    counts[g] = (counts[g] || 0) + 1;
    if (counts[g] > bestCount) { bestCount = counts[g]; best = g; }
  }
  return best;
}

function initHands() {
  if (typeof Hands === 'undefined') {
    updateStatusUI(false, null, 'Gagal memuat model pelacakan tangan');
    return;
  }
  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  hands.onResults(onHandResults);
}

function onHandResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    handVisible = true;
    currentGesture = stableGesture(detectGestureRaw(lm));
    anchorRaw.copy(mapLandmarkToWorld(lm[9])); // pangkal jari tengah ≈ pusat telapak
    landmarksWorld = lm.map(mapLandmarkToWorld);
    updateStatusUI(true, currentGesture);
  } else {
    handVisible = false;
    landmarksWorld = null;
    updateStatusUI(false, null);
  }
}

/* ---------- 8. Kontrol kamera ---------- */

async function videoTick() {
  if (!cameraRunning) return;
  if (videoEl.readyState >= 2 && hands) {
    await hands.send({ image: videoEl });
  }
  requestAnimationFrame(videoTick);
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    updateStatusUI(false, null, 'Browser ini tidak mendukung akses kamera');
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    videoEl.srcObject = mediaStream;
    await videoEl.play();
    cameraRunning = true;
    videoTick();
    cameraBtn.textContent = 'Hentikan kamera';
    cameraBtn.classList.add('is-live');
    startHint.classList.add('is-hidden');
    updateStatusUI(false, null);
  } catch (err) {
    updateStatusUI(false, null, 'Izin kamera ditolak atau tidak tersedia');
  }
}

function stopCamera() {
  cameraRunning = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  handVisible = false;
  landmarksWorld = null;
  cameraBtn.textContent = 'Mulai kamera';
  cameraBtn.classList.remove('is-live');
  updateStatusUI(false, null);
}

function updateStatusUI(visible, gesture, errorMsg) {
  if (errorMsg) {
    statusDot.classList.remove('live');
    statusState.textContent = 'Bermasalah';
    statusGesture.textContent = errorMsg;
    return;
  }
  if (!cameraRunning) {
    statusDot.classList.remove('live');
    statusState.textContent = 'Kamera belum aktif';
    statusGesture.textContent = 'Menunggu…';
    return;
  }
  if (visible) {
    statusDot.classList.add('live');
    statusState.textContent = 'Tangan terdeteksi';
    statusGesture.textContent = GESTURE_LABELS[gesture] || 'Mengalir';
  } else {
    statusDot.classList.remove('live');
    statusState.textContent = 'Mencari tangan…';
    statusGesture.textContent = 'Arahkan tangan ke kamera';
  }
}

/* ---------- 9. Loop animasi ---------- */

const clock = new THREE.Clock();
const _target = new THREE.Vector3();
const _c = new THREE.Color();

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  const handActive = cameraRunning && handVisible;
  const anchorTarget = handActive ? anchorRaw : IDLE_CENTER;
  anchorSmooth.lerp(anchorTarget, 0.08);

  const gesture = handActive ? currentGesture : 'FLOW';
  const damping = DAMPING[gesture] ?? 0.07;

  displayColorA.lerp(targetColorA, 0.04);
  displayColorB.lerp(targetColorB, 0.04);

  const posArr = particleGeometry.attributes.position.array;
  const colorArr = particleGeometry.attributes.aColor.array;
  const sizeArr = particleGeometry.attributes.aSize.array;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    computeTarget(i, gesture, anchorSmooth, time, _target);
    const ix = i * 3;
    posArr[ix + 0] += (_target.x - posArr[ix + 0]) * damping;
    posArr[ix + 1] += (_target.y - posArr[ix + 1]) * damping;
    posArr[ix + 2] += (_target.z - posArr[ix + 2]) * damping;

    const pulse = 0.82 + 0.18 * Math.sin(time * 2.2 + seeds[i]);
    _c.copy(displayColorA).lerp(displayColorB, colorMix[i]).multiplyScalar(pulse);
    colorArr[ix + 0] = _c.r;
    colorArr[ix + 1] = _c.g;
    colorArr[ix + 2] = _c.b;

    sizeArr[i] = sizesAttr[i];
  }
  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.aColor.needsUpdate = true;
  particleGeometry.attributes.aSize.needsUpdate = true;

  // cincin portal muncul hanya saat formasi "hujan pedang"
  const ringTarget = gesture === 'PEACE' ? 0.85 : 0.0;
  ringMaterial.opacity += (ringTarget - ringMaterial.opacity) * 0.08;
  ring.position.set(anchorSmooth.x, anchorSmooth.y + 2.6, anchorSmooth.z - 0.3);
  ring.rotation.z += 0.01;
  ring.rotation.x = 0.15;
  ring.material.color.copy(displayColorB);

  // kerangka tangan neon (tanpa video/wajah — hanya titik & garis sendi)
  if (handActive && landmarksWorld) {
    skeletonLines.visible = true;
    skeletonJoints.visible = true;
    const lp = lineGeometry.attributes.position.array;
    HAND_CONNECTIONS.forEach(([a, b], idx) => {
      const pa = landmarksWorld[a], pb = landmarksWorld[b];
      lp[idx * 6 + 0] = pa.x; lp[idx * 6 + 1] = pa.y; lp[idx * 6 + 2] = pa.z;
      lp[idx * 6 + 3] = pb.x; lp[idx * 6 + 4] = pb.y; lp[idx * 6 + 5] = pb.z;
    });
    lineGeometry.attributes.position.needsUpdate = true;

    const jp = jointGeometry.attributes.position.array;
    landmarksWorld.forEach((p, idx) => {
      jp[idx * 3] = p.x; jp[idx * 3 + 1] = p.y; jp[idx * 3 + 2] = p.z;
    });
    jointGeometry.attributes.position.needsUpdate = true;

    skeletonLines.material.color.copy(displayColorA);
    skeletonJoints.material.color.copy(displayColorA);
  } else {
    skeletonLines.visible = false;
    skeletonJoints.visible = false;
  }

  scene.rotation.y = Math.sin(time * 0.05) * 0.05; // parallax halus, tidak mengganggu

  renderer.clearDepth();
  renderer.render(fadeScene, fadeCamera); // jejak cahaya tipis
  renderer.render(scene, camera);          // adegan utama di atasnya
}

/* ---------- 10. Pengait UI ---------- */

cameraBtn.addEventListener('click', () => {
  if (cameraRunning) stopCamera(); else startCamera();
});
legendBtn.addEventListener('click', () => {
  legendPanel.hidden = !legendPanel.hidden;
});

buildThemeSwatches();
applyTheme(0);
initHands();
resize();
renderer.clear();
animate();

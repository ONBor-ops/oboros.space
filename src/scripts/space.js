import * as THREE from "three";

const GOLD = 0xc4a574;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createStarTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,250,240,0.9)");
  g.addColorStop(0.4, "rgba(220,210,190,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRingTexture() {
  const w = 2048;
  const h = 8;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);

  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    let density = 0;
    density += 0.22 + 0.55 * Math.pow(Math.sin(t * Math.PI), 0.7);
    density *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 74.0));
    density *= 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 19.7 + 1.2));
    density *= 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * 211.0));
    if (t > 0.56 && t < 0.63) density *= 0.04;
    if (t > 0.74 && t < 0.765) density *= 0.2;
    if (t > 0.32 && t < 0.34) density *= 0.45;
    if (t < 0.05 || t > 0.97) density *= t < 0.05 ? t / 0.05 : (1 - t) / 0.03;

    const warmth = 0.82 + 0.18 * Math.sin(t * 9.0);
    const r = 232 * warmth;
    const g = 206 * warmth;
    const b = 168 * warmth;

    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.max(0, Math.min(255, density * 255));
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function atmosphereMaterial(color, intensity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      intensity: { value: intensity },
      fresnelPower: { value: 3.2 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float intensity;
      uniform float fresnelPower;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vView), normalize(vNormal))), fresnelPower);
        gl_FragColor = vec4(color, f * intensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

function ringMaterial(map, inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      inner: { value: inner },
      outer: { value: outer },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float inner;
      uniform float outer;
      varying vec3 vPos;
      void main() {
        float r = length(vPos.xy);
        float t = clamp((r - inner) / (outer - inner), 0.0, 1.0);
        vec4 c = texture2D(map, vec2(t, 0.5));
        float edge = smoothstep(0.0, 0.03, t) * smoothstep(1.0, 0.97, t);
        gl_FragColor = vec4(c.rgb, c.a * edge);
      }
    `,
  });
}

function makePlanet({
  map,
  radius,
  position,
  tilt = 0.2,
  spin = 0.04,
  atmosphere,
  roughness = 0.82,
  metalness = 0.04,
}) {
  const group = new THREE.Group();
  group.position.copy(position);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 64),
    new THREE.MeshStandardMaterial({
      map,
      roughness,
      metalness,
      emissive: 0x0b0c12,
      emissiveIntensity: 0.2,
    }),
  );
  sphere.castShadow = false;
  sphere.receiveShadow = false;
  group.add(sphere);

  if (atmosphere) {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.06, 64, 48),
      atmosphereMaterial(atmosphere.color, atmosphere.intensity),
    );
    group.add(shell);
  }

  group.rotation.z = tilt;
  group.userData = { spin, sphere };
  return group;
}

function starfield(count, spread, size, texture, opacity) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * spread.x;
    positions[i3 + 1] = (Math.random() - 0.5) * spread.y;
    positions[i3 + 2] = -Math.random() * spread.z - 10;

    const warm = Math.random();
    if (warm > 0.92) color.setHex(GOLD);
    else if (warm > 0.8) color.setRGB(0.75, 0.82, 1);
    else color.setRGB(1, 0.98, 0.94);
    color.multiplyScalar(0.55 + Math.random() * 0.45);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size,
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
}

function dustField(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
    positions[i * 3 + 2] = -Math.random() * 420;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xe8dcc4,
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

function createGlowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(200,230,255,0.85)");
  g.addColorStop(0.45, "rgba(120,180,255,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hullMaterial(accent) {
  return new THREE.MeshStandardMaterial({
    color: 0x14161c,
    metalness: 0.9,
    roughness: 0.28,
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.16,
  });
}

function accentMaterial(accent) {
  return new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.92,
    fog: false,
  });
}

function engineSprite(map, color, scale) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function makeShip(kind, accent, glowMap) {
  const group = new THREE.Group();
  const hull = hullMaterial(accent);
  const trim = accentMaterial(accent);

  if (kind === 0) {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.7, 7), hull);
    body.rotation.x = -Math.PI / 2;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), trim);
    cabin.position.z = -0.42;
    group.add(cabin);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.025, 0.34), hull);
    wing.position.z = 0.18;
    group.add(wing);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.38), hull);
    fin.position.set(0, 0.12, 0.22);
    group.add(fin);
  } else if (kind === 1) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.07, 18), hull);
    group.add(disc);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      trim,
    );
    dome.position.y = 0.04;
    group.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 8, 24), trim);
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
  } else if (kind === 2) {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.58, 1.45, 3), hull);
    body.rotation.x = -Math.PI / 2;
    group.add(body);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.1), trim);
    group.add(ridge);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 2.05), hull);
    group.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 20), trim);
    ring.rotation.y = Math.PI / 2;
    group.add(ring);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), trim);
    bridge.position.set(0, 0.12, -0.55);
    group.add(bridge);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.42), hull);
    wing.position.z = 0.15;
    group.add(wing);
  }

  const rear = kind === 1 ? 0.08 : kind === 3 ? 1.08 : 0.72;
  const glow = engineSprite(glowMap, accent, kind === 3 ? 1.15 : 0.72);
  glow.position.z = rear;
  group.add(glow);
  const glow2 = engineSprite(glowMap, 0xffffff, kind === 3 ? 0.45 : 0.28);
  glow2.position.z = rear + 0.04;
  group.add(glow2);

  if (kind === 0 || kind === 3) {
    const left = engineSprite(glowMap, accent, 0.38);
    left.position.set(-0.22, 0, rear - 0.02);
    const right = engineSprite(glowMap, accent, 0.38);
    right.position.set(0.22, 0, rear - 0.02);
    group.add(left, right);
  }

  group.userData.pulse = glow;
  return group;
}

function spawnShips(scene, glowMap, isMobile) {
  const ships = [];
  const catalog = [
    {
      kind: 0,
      accent: 0x7ec8ff,
      scale: 0.72,
      center: new THREE.Vector3(-9, 5.1, -22),
      radius: 9,
      speed: 0.048,
      tilt: 1.3,
      phase: 5.1,
    },
    {
      kind: 1,
      accent: GOLD,
      scale: 0.9,
      center: new THREE.Vector3(8, 5.8, -24),
      radius: 10,
      speed: -0.037,
      tilt: 1.7,
      phase: 1.2,
    },
    {
      kind: 3,
      accent: GOLD,
      scale: 1.35,
      center: new THREE.Vector3(-28, 7.5, -46),
      radius: 18,
      speed: 0.055,
      tilt: 1.4,
      phase: 0.4,
    },
    {
      kind: 0,
      accent: 0x7ec8ff,
      scale: 0.85,
      center: new THREE.Vector3(22, 5.2, -38),
      radius: 14,
      speed: -0.08,
      tilt: 0.9,
      phase: 1.8,
    },
    {
      kind: 1,
      accent: 0xc4a574,
      scale: 1.1,
      center: new THREE.Vector3(-16, 9.5, -92),
      radius: 22,
      speed: 0.042,
      tilt: 2.1,
      phase: 4.1,
    },
    {
      kind: 2,
      accent: 0x9ad7ff,
      scale: 0.7,
      center: new THREE.Vector3(26, -6.5, -118),
      radius: 16,
      speed: 0.07,
      tilt: 1.1,
      phase: 2.2,
    },
    {
      kind: 3,
      accent: 0xe0b57a,
      scale: 2.4,
      center: new THREE.Vector3(-42, 4.2, -136),
      radius: 26,
      speed: 0.028,
      tilt: 1.8,
      phase: 5.4,
    },
    {
      kind: 0,
      accent: 0xb08cff,
      scale: 0.62,
      center: new THREE.Vector3(14, 8.8, -168),
      radius: 20,
      speed: -0.06,
      tilt: 1.6,
      phase: 0.9,
    },
    {
      kind: 1,
      accent: 0xf0d9a8,
      scale: 0.95,
      center: new THREE.Vector3(-18, -8.4, -214),
      radius: 24,
      speed: 0.036,
      tilt: 2.4,
      phase: 3.3,
    },
    {
      kind: 2,
      accent: 0x7ec8ff,
      scale: 0.55,
      center: new THREE.Vector3(32, 6.2, -248),
      radius: 19,
      speed: -0.05,
      tilt: 1.2,
      phase: 1.4,
    },
    {
      kind: 0,
      accent: GOLD,
      scale: 0.5,
      center: new THREE.Vector3(-8, 11, -70),
      radius: 30,
      speed: 0.033,
      tilt: 2.8,
      phase: 2.7,
    },
    {
      kind: 3,
      accent: 0x9ad7ff,
      scale: 1.05,
      center: new THREE.Vector3(10, 3.5, -280),
      radius: 21,
      speed: 0.04,
      tilt: 1.0,
      phase: 0.2,
    },
  ];

  const list = isMobile ? catalog.slice(0, 6) : catalog;
  for (const spec of list) {
    const mesh = makeShip(spec.kind, spec.accent, glowMap);
    mesh.scale.setScalar(spec.scale);
    scene.add(mesh);
    ships.push({ mesh, ...spec });
  }
  return ships;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function drawGlyph(ctx, code, x, y, size) {
  const s = size;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.3, s * 0.09);
  ctx.beginPath();
  switch (code % 18) {
    case 0:
      ctx.moveTo(-s * 0.38, s * 0.32);
      ctx.lineTo(0, -s * 0.38);
      ctx.lineTo(s * 0.38, s * 0.32);
      break;
    case 1:
      ctx.moveTo(-s * 0.3, -s * 0.34);
      ctx.lineTo(-s * 0.3, s * 0.34);
      ctx.moveTo(-s * 0.3, 0);
      ctx.lineTo(s * 0.34, 0);
      ctx.lineTo(s * 0.12, -s * 0.22);
      ctx.moveTo(s * 0.34, 0);
      ctx.lineTo(s * 0.12, s * 0.22);
      break;
    case 2:
      ctx.arc(0, 0, s * 0.3, 0, Math.PI * 1.6);
      ctx.moveTo(s * 0.08, 0);
      ctx.lineTo(s * 0.38, 0);
      break;
    case 3:
      ctx.moveTo(0, -s * 0.36);
      ctx.lineTo(s * 0.34, s * 0.3);
      ctx.lineTo(-s * 0.34, s * 0.3);
      ctx.closePath();
      break;
    case 4:
      ctx.moveTo(-s * 0.34, -s * 0.28);
      ctx.lineTo(s * 0.34, -s * 0.28);
      ctx.moveTo(-s * 0.34, 0);
      ctx.lineTo(s * 0.34, 0);
      ctx.moveTo(-s * 0.2, s * 0.28);
      ctx.lineTo(s * 0.2, s * 0.28);
      break;
    case 5:
      ctx.moveTo(-s * 0.32, s * 0.32);
      ctx.quadraticCurveTo(-s * 0.4, -s * 0.1, 0, -s * 0.34);
      ctx.quadraticCurveTo(s * 0.4, -s * 0.1, s * 0.32, s * 0.32);
      ctx.moveTo(-s * 0.14, s * 0.04);
      ctx.lineTo(s * 0.14, s * 0.04);
      break;
    case 6:
      ctx.rect(-s * 0.28, -s * 0.28, s * 0.56, s * 0.56);
      ctx.moveTo(-s * 0.28, -s * 0.28);
      ctx.lineTo(s * 0.28, s * 0.28);
      break;
    case 7:
      ctx.moveTo(0, -s * 0.36);
      ctx.lineTo(0, s * 0.36);
      ctx.moveTo(-s * 0.3, -s * 0.12);
      ctx.lineTo(s * 0.3, -s * 0.12);
      ctx.moveTo(-s * 0.2, s * 0.16);
      ctx.lineTo(s * 0.2, s * 0.16);
      break;
    case 8:
      ctx.moveTo(-s * 0.36, -s * 0.2);
      ctx.lineTo(-s * 0.08, s * 0.34);
      ctx.lineTo(s * 0.08, s * 0.34);
      ctx.lineTo(s * 0.36, -s * 0.2);
      ctx.moveTo(-s * 0.16, -s * 0.02);
      ctx.lineTo(s * 0.16, -s * 0.02);
      break;
    case 9:
      ctx.arc(-s * 0.12, 0, s * 0.22, 0, Math.PI * 2);
      ctx.moveTo(s * 0.08, -s * 0.28);
      ctx.lineTo(s * 0.34, 0);
      ctx.lineTo(s * 0.08, s * 0.28);
      break;
    case 10:
      ctx.moveTo(-s * 0.34, -s * 0.34);
      ctx.lineTo(s * 0.34, -s * 0.34);
      ctx.lineTo(0, s * 0.36);
      ctx.closePath();
      break;
    case 11:
      ctx.moveTo(-s * 0.32, -s * 0.32);
      ctx.lineTo(s * 0.32, s * 0.32);
      ctx.moveTo(s * 0.32, -s * 0.32);
      ctx.lineTo(-s * 0.32, s * 0.32);
      ctx.moveTo(-s * 0.18, 0);
      ctx.lineTo(s * 0.18, 0);
      break;
    case 12:
      ctx.moveTo(-s * 0.05, -s * 0.36);
      ctx.lineTo(-s * 0.05, s * 0.36);
      ctx.moveTo(s * 0.16, -s * 0.36);
      ctx.lineTo(s * 0.16, s * 0.36);
      ctx.moveTo(-s * 0.32, s * 0.12);
      ctx.lineTo(s * 0.36, s * 0.12);
      break;
    case 13:
      ctx.arc(0, s * 0.06, s * 0.28, Math.PI * 1.1, Math.PI * 1.9);
      ctx.moveTo(-s * 0.22, -s * 0.08);
      ctx.lineTo(0, -s * 0.36);
      ctx.lineTo(s * 0.22, -s * 0.08);
      break;
    case 14:
      ctx.moveTo(-s * 0.36, 0);
      ctx.lineTo(0, -s * 0.34);
      ctx.lineTo(s * 0.36, 0);
      ctx.lineTo(0, s * 0.34);
      ctx.closePath();
      break;
    case 15:
      ctx.moveTo(-s * 0.34, -s * 0.3);
      ctx.bezierCurveTo(-s * 0.1, s * 0.4, s * 0.1, -s * 0.4, s * 0.34, s * 0.3);
      break;
    case 16:
      ctx.moveTo(-s * 0.3, -s * 0.34);
      ctx.lineTo(s * 0.3, -s * 0.34);
      ctx.lineTo(s * 0.3, s * 0.1);
      ctx.lineTo(0, s * 0.36);
      ctx.lineTo(-s * 0.3, s * 0.1);
      ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2);
      ctx.moveTo(0, -s * 0.26);
      ctx.lineTo(0, s * 0.26);
      break;
  }
  ctx.stroke();
  ctx.restore();
}

function encodeGlyphs(seed, count) {
  const out = [];
  let h = hashStr(seed);
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    out.push(Math.abs(h) % 18);
  }
  return out;
}

function drawReadoutCanvas(spec) {
  const w = 1024;
  const h = 560;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(6, 8, 12, 0.55)";
  ctx.beginPath();
  const rr = 18;
  const x0 = 18;
  const y0 = 18;
  const x1 = w - 18;
  const y1 = h - 18;
  ctx.moveTo(x0 + rr, y0);
  ctx.arcTo(x1, y0, x1, y1, rr);
  ctx.arcTo(x1, y1, x0, y1, rr);
  ctx.arcTo(x0, y1, x0, y0, rr);
  ctx.arcTo(x0, y0, x1, y0, rr);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(196, 165, 116, 0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const corners = [
    [28, 28],
    [w - 28, 28],
    [28, h - 28],
    [w - 28, h - 28],
  ];
  ctx.strokeStyle = "rgba(240, 224, 192, 0.95)";
  ctx.lineWidth = 3;
  for (const [cx, cy] of corners) {
    const dx = cx < w / 2 ? 1 : -1;
    const dy = cy < h / 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * 28);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * 28, cy);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(196, 165, 116, 0.16)";
  ctx.fillRect(48, 48, w - 96, 54);

  ctx.font = "600 28px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "rgba(232, 214, 176, 0.95)";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.code, 64, 76);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(154, 215, 255, 0.85)";
  ctx.font = "500 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(spec.band, w - 64, 76);
  ctx.textAlign = "left";

  const nameGlyphs = encodeGlyphs(spec.name, 9);
  ctx.strokeStyle = "rgba(245, 232, 210, 0.92)";
  for (let i = 0; i < nameGlyphs.length; i++) {
    drawGlyph(ctx, nameGlyphs[i], 86 + i * 52, 168, 34);
  }

  ctx.strokeStyle = "rgba(196, 165, 116, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(56, 214);
  ctx.lineTo(w - 56, 214);
  ctx.stroke();

  const rows = spec.rows;
  ctx.font = "500 26px ui-monospace, SFMono-Regular, Menlo, monospace";
  rows.forEach((row, i) => {
    const y = 268 + i * 58;
    ctx.strokeStyle = "rgba(154, 215, 255, 0.8)";
    drawGlyph(ctx, hashStr(row.k) % 18, 78, y, 22);
    const dataGlyphs = encodeGlyphs(row.k + spec.name, 4);
    ctx.strokeStyle = "rgba(196, 165, 116, 0.75)";
    dataGlyphs.forEach((g, gi) => drawGlyph(ctx, g, 130 + gi * 32, y, 16));
    ctx.fillStyle = "rgba(220, 230, 240, 0.9)";
    ctx.fillText(row.v, 280, y + 8);
  });

  const footer = encodeGlyphs(spec.name + "-tail", 14);
  ctx.strokeStyle = "rgba(196, 165, 116, 0.45)";
  footer.forEach((g, i) => drawGlyph(ctx, g, 70 + i * 64, 500, 14));

  const scan = ctx.createLinearGradient(0, 0, 0, h);
  scan.addColorStop(0, "rgba(255,255,255,0)");
  scan.addColorStop(0.48, "rgba(255,255,255,0.035)");
  scan.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = scan;
  ctx.fillRect(18, 18, w - 36, h - 36);

  return canvas;
}

function makeReadout(spec) {
  const group = new THREE.Group();
  group.position.copy(spec.position);

  const canvas = drawReadoutCanvas(spec);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      opacity: 0,
    }),
  );
  const width = THREE.MathUtils.clamp(spec.radius * 1.7, 2.8, 7.4);
  const height = width * (canvas.height / canvas.width);
  sprite.scale.set(width, height, 1);
  sprite.position.y = spec.radius + height * 0.58 + 0.55;
  sprite.renderOrder = 2;
  group.add(sprite);

  const stemTop = sprite.position.y - height * 0.5;
  const stemBot = spec.radius * 0.96;
  const stemH = Math.max(0.18, stemTop - stemBot);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, stemH, 6),
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    }),
  );
  stem.position.y = stemBot + stemH * 0.5;
  group.add(stem);

  const node = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 10),
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    }),
  );
  node.position.y = spec.radius;
  group.add(node);

  group.userData = {
    sprite,
    stem,
    node,
    radius: spec.radius,
    baseY: sprite.position.y,
    seed: hashStr(spec.name) % 1000,
  };
  return group;
}

function smoothstep(min, max, x) {
  const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

export function mountSpace(els = {}) {
  const canvas = els.canvas ?? document.getElementById("space");
  const voyage = els.voyage ?? document.getElementById("voyage");
  const copy = els.copy ?? document.getElementById("hero-copy");
  const cue = els.cue ?? document.getElementById("scroll-cue");
  const cta = els.cta ?? document.getElementById("hero-cta");
  const ringFill = els.ringFill ?? document.getElementById("progress-ring");
  if (!canvas || !voyage) return () => {};

  const reduced = prefersReducedMotion();
  const isMobile = window.matchMedia("(max-width: 700px)").matches;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobile,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 8, 58);
  const camera = new THREE.PerspectiveCamera(
    38,
    window.innerWidth / window.innerHeight,
    0.1,
    900,
  );

  const sun = new THREE.DirectionalLight(0xfff2dd, 2.35);
  sun.position.set(30, 14, 8);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x1c2030, 0.48));
  scene.add(new THREE.HemisphereLight(0x243044, 0x08060a, 0.55));

  const rim = new THREE.DirectionalLight(0x6b7cff, 0.22);
  rim.position.set(-30, -10, 20);
  scene.add(rim);

  const path = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.0, 0.18, 18),
      new THREE.Vector3(0.08, 0.12, -6),
      new THREE.Vector3(0.12, 0.06, -32),
      new THREE.Vector3(0.18, 0.02, -48),
      new THREE.Vector3(-0.2, 0.25, -82),
      new THREE.Vector3(2.1, 0.55, -118),
      new THREE.Vector3(0.5, 1.85, -170),
      new THREE.Vector3(0.12, 1.25, -206),
      new THREE.Vector3(0.0, 0.25, -258),
      new THREE.Vector3(0.0, 0.05, -312),
    ],
    false,
    "catmullrom",
    0.12,
  );

  const lookPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.0, 0.05, -16),
      new THREE.Vector3(1.8, 0.05, -50),
      new THREE.Vector3(3.2, 0.1, -62),
      new THREE.Vector3(-0.4, 0.1, -95),
      new THREE.Vector3(-5.5, 0.3, -132),
      new THREE.Vector3(0.2, -0.2, -190),
      new THREE.Vector3(0.3, -1.6, -228),
      new THREE.Vector3(0.0, 0.0, -290),
      new THREE.Vector3(0.0, 0.0, -360),
    ],
    false,
    "catmullrom",
    0.14,
  );

  const loader = new THREE.TextureLoader();
  const starTex = createStarTexture();
  const ringTex = createRingTexture();

  const planets = [];
  const readouts = [];
  const glowMap = createGlowTexture();
  const ships = spawnShips(scene, glowMap, isMobile);
  const dust = dustField(isMobile ? 500 : 1100);
  scene.add(dust);

  const farStars = starfield(
    isMobile ? 1800 : 4200,
    { x: 520, y: 320, z: 620 },
    0.55,
    starTex,
    0.85,
  );
  const nearStars = starfield(
    isMobile ? 400 : 900,
    { x: 120, y: 80, z: 420 },
    0.18,
    starTex,
    0.7,
  );
  scene.add(farStars);
  scene.add(nearStars);

  const gate = new THREE.Mesh(
    new THREE.TorusGeometry(16, 0.045, 24, 180),
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0.72,
    }),
  );
  gate.position.set(0.0, 0.05, -292);
  scene.add(gate);

  const gateHalo = new THREE.Mesh(
    new THREE.TorusGeometry(16.4, 0.012, 12, 120),
    new THREE.MeshBasicMaterial({
      color: 0xf0e0c0,
      transparent: true,
      opacity: 0.28,
    }),
  );
  gateHalo.position.copy(gate.position);
  scene.add(gateHalo);

  let disposed = false;
  let targetProgress = 0;
  let progress = 0;
  let mouseX = 0;
  let mouseY = 0;
  const clock = new THREE.Clock();
  let raf = 0;

  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function readProgress() {
    const rect = voyage.getBoundingClientRect();
    const total = Math.max(1, voyage.offsetHeight - window.innerHeight);
    const scrolled = -rect.top;
    return Math.max(0, Math.min(1, scrolled / total));
  }

  function applyCopy(p) {
    const title = 1 - smoothstep(0.02, 0.11, p);
    const scrollCue = 1 - smoothstep(0.0, 0.08, p);
    const endCta = smoothstep(0.86, 0.93, p);
    const root = document.documentElement;
    root.style.setProperty("--title-op", title.toFixed(3));
    root.style.setProperty("--cue-op", scrollCue.toFixed(3));
    root.style.setProperty("--cta-op", endCta.toFixed(3));
    if (copy) {
      copy.style.opacity = title.toFixed(3);
      copy.style.visibility = title < 0.02 ? "hidden" : "visible";
    }
    if (cue) {
      cue.style.opacity = scrollCue.toFixed(3);
      cue.style.visibility = scrollCue < 0.02 ? "hidden" : "visible";
    }
    if (cta) {
      cta.style.opacity = endCta.toFixed(3);
      cta.style.visibility = endCta < 0.02 ? "hidden" : "visible";
      cta.style.pointerEvents = endCta < 0.2 ? "none" : "auto";
    }
    if (ringFill) {
      ringFill.style.strokeDashoffset = String(100 - p * 100);
    }
  }

  function tick() {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    targetProgress = readProgress();
    progress = THREE.MathUtils.damp(progress, targetProgress, reduced ? 7 : 2.6, dt);

    const t = progress;
    path.getPointAt(Math.max(0, Math.min(1, t)), camPos);
    lookPath.getPointAt(Math.max(0, Math.min(1, t)), lookAt);

    const parallax = reduced ? 0 : 1;
    camPos.x += mouseX * 0.55 * (1 - t * 0.4) * parallax;
    camPos.y += mouseY * 0.32 * (1 - t * 0.4) * parallax;

    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAt);
    if (!reduced) camera.rotateZ(Math.sin(t * Math.PI) * 0.03);
    camera.fov = 36 + Math.sin(t * Math.PI) * 8;
    camera.updateProjectionMatrix();

    for (const body of planets) {
      const d = camera.position.distanceTo(body.position);
      body.visible = d < 64;
      if (body.visible) body.userData.sphere.rotation.y += body.userData.spin * dt;
    }

    const elapsed = clock.elapsedTime;
    const shipSpeed = reduced ? 0.08 : 1;
    for (const ship of ships) {
      const a = ship.phase + elapsed * ship.speed * shipSpeed;
      const x = ship.center.x + Math.cos(a) * ship.radius;
      const z = ship.center.z + Math.sin(a) * ship.radius;
      const y = ship.center.y + Math.sin(a * 1.65 + ship.phase) * ship.tilt;
      ship.mesh.position.set(x, y, z);
      const dir = Math.sign(ship.speed) || 1;
      ship.mesh.lookAt(x - Math.sin(a) * dir, y, z + Math.cos(a) * dir);
      const d = camera.position.distanceTo(ship.mesh.position);
      ship.mesh.visible = d < 240;
      if (ship.mesh.userData.pulse) {
        const pulse = 0.82 + Math.sin(elapsed * 9 + ship.phase) * 0.18;
        ship.mesh.userData.pulse.material.opacity = pulse;
      }
    }

    for (const hud of readouts) {
      const d = camera.position.distanceTo(hud.position);
      const near = smoothstep(hud.userData.radius + 2.4, hud.userData.radius + 6.5, d);
      const far = 1 - smoothstep(38, 58, d);
      const vis = Math.max(0, near * far);
      const flicker = reduced ? 1 : 0.86 + Math.sin(elapsed * 5.5 + hud.userData.seed) * 0.14;
      const opacity = vis * flicker;
      hud.visible = vis > 0.02;
      hud.userData.sprite.material.opacity = opacity;
      hud.userData.stem.material.opacity = opacity * 0.45;
      hud.userData.node.material.opacity = opacity * 0.85;
      hud.userData.sprite.position.y =
        hud.userData.baseY + (reduced ? 0 : Math.sin(elapsed * 1.15 + hud.userData.seed) * 0.1);
    }

    const gateDist = camera.position.distanceTo(gate.position);
    gate.visible = gateDist < 90;
    gateHalo.visible = gateDist < 90;
    gate.rotation.z += dt * 0.04;
    gateHalo.rotation.z -= dt * 0.025;
    farStars.rotation.y += dt * 0.003;
    dust.rotation.y -= dt * 0.01;

    const dustPositions = dust.geometry.attributes.position;
    const arr = dustPositions.array;
    for (let i = 2; i < arr.length; i += 3) {
      arr[i] += dt * (6 + progress * 18);
      if (arr[i] > camera.position.z + 8) arr[i] -= 420;
    }
    dustPositions.needsUpdate = true;

    applyCopy(targetProgress);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  const onMove = (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
  };

  const onScroll = () => {
    targetProgress = readProgress();
    applyCopy(targetProgress);
  };

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  const maps = {
    ice: "/textures/ice.jpg",
    gas: "/textures/gas.jpg",
    ringed: "/textures/ringed.jpg",
    rock: "/textures/rock.jpg",
    nebula: "/textures/nebula.jpg",
  };

  const load = (url) =>
    new Promise((resolve) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          resolve(tex);
        },
        undefined,
        () => resolve(null),
      );
    });

  Promise.all([
    load(maps.ice),
    load(maps.gas),
    load(maps.ringed),
    load(maps.rock),
    load(maps.nebula),
  ]).then(([ice, gas, ringed, rock, nebula]) => {
    if (disposed) return;

    const iceWorld = makePlanet({
      map: ice,
      radius: 3.7,
      position: new THREE.Vector3(4.8, 0.12, -48),
      tilt: 0.28,
      spin: 0.1,
      atmosphere: { color: 0x9ad7ff, intensity: 0.9 },
      roughness: 0.55,
    });
    scene.add(iceWorld);
    planets.push(iceWorld);
    const iceHud = makeReadout({
      position: iceWorld.position,
      radius: 3.7,
      name: "thal vien",
      code: "04-Ξ-19",
      band: "CRYOS · 184K",
      rows: [
        { k: "mass", v: "2.41e24" },
        { k: "grav", v: "0.82 g" },
        { k: "atmo", v: "0.91 bar" },
      ],
    });
    scene.add(iceHud);
    readouts.push(iceHud);

    const pebble = makePlanet({
      map: rock,
      radius: 0.62,
      position: new THREE.Vector3(-2.4, -1.35, -82),
      tilt: 0.5,
      spin: 0.4,
      roughness: 0.95,
    });
    scene.add(pebble);
    planets.push(pebble);
    const pebbleHud = makeReadout({
      position: pebble.position,
      radius: 0.62,
      name: "korr",
      code: "11-Λ-03",
      band: "LITHOS · 91K",
      rows: [
        { k: "mass", v: "4.80e21" },
        { k: "grav", v: "0.11 g" },
        { k: "spin", v: "9.4 h" },
      ],
    });
    scene.add(pebbleHud);
    readouts.push(pebbleHud);

    const giant = makePlanet({
      map: gas,
      radius: 11.2,
      position: new THREE.Vector3(-9.6, 0.35, -124),
      tilt: 0.1,
      spin: 0.07,
      atmosphere: { color: 0xe0b57a, intensity: 0.62 },
      roughness: 0.7,
    });
    scene.add(giant);
    planets.push(giant);
    const giantHud = makeReadout({
      position: giant.position,
      radius: 11.2,
      name: "oruun mas",
      code: "02-Ω-77",
      band: "JOVIN · 128K",
      rows: [
        { k: "mass", v: "1.90e27" },
        { k: "grav", v: "2.54 g" },
        { k: "atmo", v: "H2 / He" },
      ],
    });
    scene.add(giantHud);
    readouts.push(giantHud);

    const moon = makePlanet({
      map: rock,
      radius: 1.15,
      position: new THREE.Vector3(3.6, 2.15, -116),
      tilt: 0.4,
      spin: 0.22,
    });
    scene.add(moon);
    planets.push(moon);
    const moonHud = makeReadout({
      position: moon.position,
      radius: 1.15,
      name: "oruun ka",
      code: "02-Ω-77β",
      band: "SAT · 142K",
      rows: [
        { k: "mass", v: "7.30e22" },
        { k: "grav", v: "0.19 g" },
        { k: "lock", v: "1:1" },
      ],
    });
    scene.add(moonHud);
    readouts.push(moonHud);

    const saturn = makePlanet({
      map: ringed,
      radius: 4.4,
      position: new THREE.Vector3(0.2, -3.4, -208),
      tilt: 0.16,
      spin: 0.05,
      atmosphere: { color: 0xf0d9a8, intensity: 0.42 },
      roughness: 0.78,
    });

    const rings = new THREE.Mesh(
      new THREE.RingGeometry(5.6, 12.4, 192, 8),
      ringMaterial(ringTex, 5.6, 12.4),
    );
    rings.rotation.x = Math.PI / 2;
    saturn.add(rings);
    scene.add(saturn);
    planets.push(saturn);
    const ringHud = makeReadout({
      position: saturn.position,
      radius: 4.4,
      name: "sael vor",
      code: "09-Φ-44",
      band: "ANNUL · 97K",
      rows: [
        { k: "mass", v: "5.68e26" },
        { k: "grav", v: "1.07 g" },
        { k: "ring", v: "5.6–12.4" },
      ],
    });
    scene.add(ringHud);
    readouts.push(ringHud);

    const lastRock = makePlanet({
      map: rock,
      radius: 1.5,
      position: new THREE.Vector3(5.8, -2.1, -252),
      tilt: 0.2,
      spin: 0.18,
    });
    scene.add(lastRock);
    planets.push(lastRock);
    const lastHud = makeReadout({
      position: lastRock.position,
      radius: 1.5,
      name: "nex 18",
      code: "18-Ψ-01",
      band: "OUTER · 62K",
      rows: [
        { k: "mass", v: "3.10e23" },
        { k: "grav", v: "0.31 g" },
        { k: "ice", v: "0.64" },
      ],
    });
    scene.add(lastHud);
    readouts.push(lastHud);

    if (nebula) {
      const neb = new THREE.Mesh(
        new THREE.SphereGeometry(380, 32, 24),
        new THREE.MeshBasicMaterial({
          map: nebula,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          fog: false,
        }),
      );
      neb.position.set(0, 0, -80);
      scene.add(neb);
    }

    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff1d0 }),
    );
    sunCore.position.set(70, 22, -40);
    scene.add(sunCore);

    canvas.classList.add("is-ready");
  });

  onScroll();
  tick();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("scroll", onScroll);
    renderer.dispose();
  };
}

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

    const moon = makePlanet({
      map: rock,
      radius: 1.15,
      position: new THREE.Vector3(3.6, 2.15, -116),
      tilt: 0.4,
      spin: 0.22,
    });
    scene.add(moon);
    planets.push(moon);

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

    const lastRock = makePlanet({
      map: rock,
      radius: 1.5,
      position: new THREE.Vector3(5.8, -2.1, -252),
      tilt: 0.2,
      spin: 0.18,
    });
    scene.add(lastRock);
    planets.push(lastRock);

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

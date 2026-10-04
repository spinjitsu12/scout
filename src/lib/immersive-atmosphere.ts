import * as THREE from 'three';

export type GrassPatch = { x: number; z: number; width: number; depth: number; count?: number; seed?: number };
export type WindGrass = { group: THREE.Group; bladeCount: number; patchCount: number; update: (elapsed: number) => void; dispose: () => void };
export type CoastalAtmosphere = { group: THREE.Group; update: (elapsed: number) => void; dispose: () => void };
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
function seeded(seed: number) { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }

/** Three tapered painted ribbons form a tuft; animation remains entirely on the GPU. */
function grassGeometry() {
  const positions: number[] = [], uvs: number[] = [];
  for (let blade = 0; blade < 3; blade++) {
    const angle = blade * Math.PI * 2 / 3, c = Math.cos(angle), s = Math.sin(angle), height = .8 + blade * .11;
    const outline = [[-.07, 0, 0], [.07, 0, 0], [-.025, .53 * height, .045], [.069, .53 * height, .045], [.18, height, .09]];
    for (const index of [0, 1, 2, 1, 3, 2, 2, 3, 4]) { const [x, y, z] = outline[index]; positions.push(x * c - z * s, y, x * s + z * c); uvs.push(index % 2, y / height); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}

/** One instanced draw per spatial patch, with a coherent world-space travelling wind wave. */
export function createWindGrass(options: { patches: GrassPatch[]; maxBlades?: number }): WindGrass {
  const group = new THREE.Group(); group.name = 'Sunward Coast wind meadows'; group.userData.animatedGrass = true;
  const geometry = grassGeometry(), windTime = { value: 0 }, meshes: THREE.InstancedMesh[] = [];
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, side: THREE.DoubleSide }); material.name = 'Painted grass with coherent wind';
  material.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = `uniform float uWindTime; varying float vBladeHeight;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vBladeHeight = uv.y;
      vec4 meadowOrigin = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_INSTANCING
        meadowOrigin = instanceMatrix * meadowOrigin;
      #endif
      meadowOrigin = modelMatrix * meadowOrigin;
      float sweepingWind = sin(dot(meadowOrigin.xz, vec2(0.029, 0.019)) - uWindTime * 1.45);
      float fineWind = sin(dot(meadowOrigin.xz, vec2(0.095, -0.068)) - uWindTime * 2.1);
      float bend = vBladeHeight * vBladeHeight * (0.13 + sweepingWind * 0.18 + fineWind * 0.045);
      transformed.x += bend;
      transformed.z += bend * 0.43;
      transformed.y -= abs(bend) * vBladeHeight * 0.14;
    `);
    shader.fragmentShader = `varying float vBladeHeight;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      diffuseColor.rgb *= mix(vec3(0.61, 0.78, 0.71), vec3(1.14, 1.08, 0.81), clamp(vBladeHeight, 0.0, 1.0));
    `);
  };
  material.customProgramCacheKey = () => 'scout-sunward-wind-grass-v1';
  const maximum = Math.max(0, Math.min(64000, Math.floor(finite(options.maxBlades, 28000)))), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3(), color = new THREE.Color();
  let bladeCount = 0, patchCount = 0;
  options.patches.forEach((patch, index) => {
    const width = Math.max(0, finite(patch.width, 0)), depth = Math.max(0, finite(patch.depth, 0)); if (width <= 0 || depth <= 0 || bladeCount >= maximum) return;
    const count = Math.min(maximum - bladeCount, Math.max(0, Math.floor(finite(patch.count, Math.min(5000, width * depth * .06))))); if (!count) return;
    const random = seeded(finite(patch.seed, 317 + index * 7919)), mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `Wind meadow ${patchCount + 1}`; mesh.userData.animatedGrass = true; mesh.position.set(finite(patch.x, 0), .025, finite(patch.z, 0));
    for (let tuft = 0; tuft < count; tuft++) {
      position.set((random() - .5) * width, 0, (random() - .5) * depth); rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2);
      const size = .6 + random() * .75; scale.set(size * (1.1 + random() * .9), size, size); matrix.compose(position, rotation, scale); mesh.setMatrixAt(tuft, matrix);
      color.setHSL(.225 + random() * .06, .27 + random() * .12, .37 + random() * .15); mesh.setColorAt(tuft, color);
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1; if (mesh.boundingBox) mesh.boundingBox.expandByScalar(1);
    group.add(mesh); meshes.push(mesh); bladeCount += count; patchCount++;
  });
  let disposed = false;
  return { group, bladeCount, patchCount, update: elapsed => { windTime.value = finite(elapsed, 0); }, dispose: () => { if (disposed) return; disposed = true; meshes.forEach(mesh => mesh.dispose()); geometry.dispose(); material.dispose(); group.clear(); } };
}

/** Original gradient sky, billowy clouds, distant hills and wind-streaked coastal water. */
export function createCoastalAtmosphere(options: { width: number; depth: number; centerX?: number; centerZ?: number; coastX?: number }): CoastalAtmosphere {
  const width = Math.max(1000, finite(options.width, 12000)), depth = Math.max(1000, finite(options.depth, 10000)), centerX = finite(options.centerX, width / 2), centerZ = finite(options.centerZ, depth / 2), coastX = finite(options.coastX, width * .94);
  const group = new THREE.Group(); group.name = 'Sunward Coast atmosphere'; group.userData.animatedAtmosphere = true;
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], time = { value: 0 }, radius = Math.max(width, depth) * 1.8;
  const skyGeometry = new THREE.SphereGeometry(radius, 32, 18); geometries.push(skyGeometry);
  const skyMaterial = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { uHorizon: { value: new THREE.Color('#d7e8df') }, uZenith: { value: new THREE.Color('#78b8d6') }, uSunGlow: { value: new THREE.Color('#ffefd0') } },
    vertexShader: `varying vec3 vSkyDirection; void main() { vSkyDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunGlow; varying vec3 vSkyDirection;
      void main() { vec3 direction = normalize(vSkyDirection); float elevation = smoothstep(-0.055, 0.7, direction.y); vec3 color = mix(uHorizon, uZenith, elevation); vec3 sunDirection = normalize(vec3(-0.52, 0.64, -0.31)); float glow = pow(max(0.0, dot(direction, sunDirection)), 18.0); color = mix(color, uSunGlow, glow * 0.44); gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }); materials.push(skyMaterial);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial); sky.name = 'Painted coastal sky'; sky.userData.animatedAtmosphere = true; sky.position.set(centerX, 0, centerZ); sky.frustumCulled = false; sky.renderOrder = -100; group.add(sky);
  const hillGeometry = new THREE.IcosahedronGeometry(1, 2), hillMaterial = new THREE.MeshStandardMaterial({ color: '#94afb0', roughness: 1 }); geometries.push(hillGeometry); materials.push(hillMaterial);
  const hills = new THREE.InstancedMesh(hillGeometry, hillMaterial, 28), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3(), random = seeded(21831);
  hills.name = 'Painted distant coastal ridges'; hills.userData.animatedAtmosphere = true;
  for (let i = 0; i < 28; i++) {
    const angle = i / 28 * Math.PI * 2; position.set(centerX + Math.sin(angle) * width * .88, -170, centerZ + Math.cos(angle) * depth * .9);
    scale.set(1150 + random() * 1600, 320 + random() * 480, 900 + random() * 1000); const heading = random() * Math.PI; rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    // A diagonal ridge must also clear the corners of a rectangular region. Checking only
    // ring radii lets huge mountains intersect an otherwise open town at the map corner.
    const extentX = Math.hypot(scale.x * Math.cos(heading), scale.z * Math.sin(heading)), extentZ = Math.hypot(scale.x * Math.sin(heading), scale.z * Math.cos(heading)), margin = 2400;
    for (let step = 0; step < 10; step++) {
      const overlaps = position.x + extentX > centerX - width / 2 - margin && position.x - extentX < centerX + width / 2 + margin && position.z + extentZ > centerZ - depth / 2 - margin && position.z - extentZ < centerZ + depth / 2 + margin;
      if (!overlaps) break; position.x = centerX + (position.x - centerX) * 1.15; position.z = centerZ + (position.z - centerZ) * 1.15;
    }
    matrix.compose(position, rotation, scale); hills.setMatrixAt(i, matrix); hills.setColorAt(i, new THREE.Color().setHSL(.49 + random() * .035, .16, .52 + random() * .09));
  }
  hills.computeBoundingSphere(); hills.castShadow = false; hills.receiveShadow = false; group.add(hills);
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 2), cloudMaterial = new THREE.MeshBasicMaterial({ color: '#f4f5de', fog: true, toneMapped: false }); geometries.push(cloudGeometry); materials.push(cloudMaterial);
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 72); clouds.name = 'Soft coastal cloud banks'; clouds.userData.animatedAtmosphere = true;
  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * Math.PI * 2, distance = Math.max(width, depth) * (.35 + random() * .49), height = 1550 + random() * 1000;
    for (let lobe = 0; lobe < 3; lobe++) { const size = 120 + random() * 170; position.set(centerX + Math.sin(angle) * distance + (lobe - 1) * 170, height + (lobe === 1 ? 55 : 0), centerZ + Math.cos(angle) * distance); scale.set(size * 2.1, size * .42, size); rotation.identity(); matrix.compose(position, rotation, scale); clouds.setMatrixAt(i * 3 + lobe, matrix); }
  }
  clouds.computeBoundingSphere(); clouds.castShadow = false; clouds.receiveShadow = false; group.add(clouds);
  const seaWidth = Math.max(width * .9, 7000), seaDepth = depth + 14000, seaGeometry = new THREE.PlaneGeometry(seaWidth, seaDepth, 64, 32); seaGeometry.rotateX(-Math.PI / 2); geometries.push(seaGeometry);
  const seaMaterial = new THREE.ShaderMaterial({ fog: true, side: THREE.DoubleSide,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uCoastX: { value: coastX }, uShallow: { value: new THREE.Color('#88c8bb') }, uDeep: { value: new THREE.Color('#4b95ad') }, uFoam: { value: new THREE.Color('#e4efcf') } },
    vertexShader: `uniform float uTime; varying vec3 vWaterPosition;
      #include <fog_pars_vertex>
      void main() { vec4 world = modelMatrix * vec4(position, 1.0); world.y += sin(world.x * 0.023 + world.z * 0.015 - uTime * 0.9) * 0.13 + sin(world.z * 0.041 + uTime * 0.6) * 0.065; vWaterPosition = world.xyz; vec4 mvPosition = viewMatrix * world; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uCoastX; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; varying vec3 vWaterPosition;
      #include <fog_pars_fragment>
      void main() { float shoreDistance = max(0.0, vWaterPosition.x - uCoastX); float wave = sin(vWaterPosition.x * 0.1 + vWaterPosition.z * 0.059 - uTime * 0.95) * sin(vWaterPosition.z * 0.037 + uTime * 0.35); float glint = smoothstep(0.64, 0.96, wave); vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 1400.0, shoreDistance)); water = mix(water, uFoam, glint * 0.28); float foam = (1.0 - smoothstep(6.0, 35.0, shoreDistance)) * (0.4 + 0.3 * sin(vWaterPosition.z * 0.05 - uTime)); water = mix(water, uFoam, foam); gl_FragColor = vec4(water, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }` }); materials.push(seaMaterial);
  const sea = new THREE.Mesh(seaGeometry, seaMaterial); sea.name = 'Moving wind-streaked coastal water'; sea.userData.animatedAtmosphere = true; sea.position.set(coastX + seaWidth / 2, -.18, centerZ); sea.castShadow = sea.receiveShadow = false; group.add(sea);
  let disposed = false;
  return { group, update: elapsed => { const clock = finite(elapsed, 0); time.value = clock; clouds.position.x = Math.sin(clock * .008) * 45; clouds.position.z = Math.sin(clock * .004) * 18; }, dispose: () => { if (disposed) return; disposed = true; hills.dispose(); clouds.dispose(); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); group.clear(); } };
}

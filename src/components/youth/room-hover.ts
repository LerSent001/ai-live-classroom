import { BackSide, BufferGeometry, Float32BufferAttribute, LineSegments, Mesh, Raycaster, ShaderMaterial, Vector2, type Camera, type Group, type Material } from 'three';

export const HOVER_GROUPS = 23;
export function hoverLift(id: number, progress: number, reduced: boolean) {
  if (reduced || id < 2 || id >= 18 || progress <= 0 || progress >= 1) return 0;
  return Math.sin(progress * Math.PI) ** 2 * (id === 2 ? .025 : .055);
}

/** Per-vertex selection preserves material batching, bake UVs and draw counts. */
export function installRoomHover(room: Group) {
  const lifts = { value: new Float32Array(HOVER_GROUPS) };
  const highlights = { value: new Float32Array(HOVER_GROUPS) };
  const materials = new Set<Material>();
  const outlineMaterials = new Set<Material>();
  room.traverse(object => {
    if (!(object instanceof Mesh || object instanceof LineSegments) || !object.geometry.hasAttribute('hoverId')) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (object instanceof LineSegments) outlineMaterials.add(material);
    }
  });
  for (const material of materials) {
    const original = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      original.call(material, shader, renderer);
      shader.uniforms.uHoverLift = lifts;
      shader.uniforms.uHoverLight = highlights;
      shader.vertexShader = `attribute float hoverId; uniform float uHoverLift[${HOVER_GROUPS}]; uniform float uHoverLight[${HOVER_GROUPS}]; varying float vHoverLight;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        int hoveredPart = int(hoverId + 0.5);
        transformed.y += uHoverLift[hoveredPart];
        vHoverLight = uHoverLight[hoveredPart];
      `);
      // Only the existing edge pass changes color. Painted faces retain their
      // original lighting/texture, without a yellow wash, bloom or extra pass.
      if (outlineMaterials.has(material)) {
        shader.fragmentShader = `varying float vHoverLight;\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
          outgoingLight = mix(outgoingLight, vec3(1.0), vHoverLight);
          diffuseColor.a = mix(diffuseColor.a, 1.0, vHoverLight);
          #include <opaque_fragment>
        `);
      }
    };
    material.customProgramCacheKey = () => `${key}-hover-white-outline-v2`;
  }
  // A thin back-face silhouette also covers rounded furniture whose smooth
  // outer contours are deliberately absent from the static architectural ink.
  const positions: number[] = [], normals: number[] = [], ids: number[] = [];
  room.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const p = object.geometry.getAttribute('position'), n = object.geometry.getAttribute('normal'), h = object.geometry.getAttribute('hoverId');
    if (!h) return;
    for (let i = 0; i < p.count; i++) {
      if (!h.getX(i)) continue;
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i)); ids.push(h.getX(i));
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('hoverId', new Float32BufferAttribute(ids, 1));
  const viewport = new Vector2();
  const outlineMaterial = new ShaderMaterial({
    side: BackSide, transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uHoverLift: lifts, uHoverLight: highlights, uViewport: { value: viewport } },
    vertexShader: `attribute float hoverId; uniform float uHoverLift[${HOVER_GROUPS}]; uniform float uHoverLight[${HOVER_GROUPS}]; uniform vec2 uViewport; varying float vOpacity;
      void main() {
        int id = int(hoverId + 0.5); vOpacity = uHoverLight[id];
        vec3 p = position; p.y += uHoverLift[id];
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec4 clip = projectionMatrix * view;
        vec2 projectedNormal = (projectionMatrix * vec4(n, 0.0)).xy;
        clip.xy += projectedNormal / max(length(projectedNormal), 0.001) * (3.0 / uViewport) * clip.w;
        gl_Position = vOpacity > 0.001 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `varying float vOpacity; void main() { if (vOpacity < 0.001) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vOpacity); }`,
  });
  const silhouette = new Mesh(geometry, outlineMaterial);
  silhouette.name = 'Hover white silhouette'; silhouette.visible = false; silhouette.renderOrder = 2;
  silhouette.userData.hoverOutline = true;
  silhouette.onBeforeRender = renderer => { renderer.getDrawingBufferSize(viewport); };
  room.add(silhouette);
  return { lifts, highlights, silhouette, dispose() { room.remove(silhouette); geometry.dispose(); outlineMaterial.dispose(); } };
}

export function bindRoomHover(room: Group, canvas: HTMLCanvasElement, camera: Camera, invalidate: () => void, uniforms: ReturnType<typeof installRoomHover>) {
  const root = canvas.closest('.youth-scene') ?? canvas;
  const ray = new Raycaster(), pointer = new Vector2();
  const meshes = room.children.filter((object): object is Mesh => object instanceof Mesh && !object.userData.hoverOutline);
  const starts = new Float64Array(HOVER_GROUPS).fill(-Infinity);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = 0;
  const select = (id: number) => {
    if (active === id) return;
    active = id;
    if (id) starts[id] = performance.now();
    canvas.dataset.hoverPart = String(id);
    canvas.style.cursor = id ? 'pointer' : '';
    invalidate();
  };
  const move = (event: Event) => {
    const e = event as PointerEvent;
    if (e.pointerType === 'touch' || e.buttons || canvas.dataset.camera !== 'room' || Number(canvas.dataset.entranceProgress) < 1) return select(0);
    if (e.target instanceof Element && e.target.closest('.youth-screen')) return select(22);
    const rect = canvas.getBoundingClientRect();
    pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    select(hit?.face ? (hit.object as Mesh).geometry.getAttribute('hoverId')?.getX(hit.face.a) ?? 0 : 0);
  };
  const leave = () => select(0);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', leave);
  root.addEventListener('pointerdown', leave);
  return {
    update(delta: number) {
      if (canvas.dataset.camera !== 'room') active = 0;
      let moving = false, maxLift = 0;
      for (let id = 1; id < HOVER_GROUPS; id++) {
        const progress = (performance.now() - starts[id]) / 760;
        uniforms.lifts.value[id] = hoverLift(id, progress, reduced);
        const target = id === active ? 1 : 0;
        const difference = target - uniforms.highlights.value[id];
        uniforms.highlights.value[id] = Math.abs(difference) < .005 ? target : uniforms.highlights.value[id] + difference * Math.min(1, delta * 14);
        moving ||= (!reduced && progress < 1) || Math.abs(difference) >= .005;
        maxLift = Math.max(maxLift, uniforms.lifts.value[id]);
      }
      canvas.dataset.hoverLift = maxLift.toFixed(4);
      uniforms.silhouette.visible = uniforms.highlights.value.some(value => value > .001);
      if (moving) invalidate();
    },
    dispose() {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('pointerdown', leave);
      canvas.style.cursor = '';
    },
  };
}

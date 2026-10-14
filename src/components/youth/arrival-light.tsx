import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, ShaderMaterial, type Mesh } from 'three';
import { YOUTH_RENDERING } from '@/lib/youth-classroom';

/** One temporary transparent plane; no bloom, shadow or volumetric pass. */
export function ArrivalLight() {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    uniforms: { strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float strength;
      void main(){float beam=pow(max(0.0,1.0-abs(vUv.x-.5)*2.0),1.6);
      float fade=smoothstep(0.0,.15,vUv.y)*(.18+.82*pow(vUv.y,3.0));
      gl_FragColor=vec4(.60,.93,1.0,beam*fade*strength);}`,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ gl }) => {
    const t = Number(gl.domElement.dataset.entranceProgress ?? 0) * 1.65;
    const pulse = Math.max(0, Math.sin(Math.PI * Math.max(0, Math.min(1, (t - .94) / .58))));
    if (mesh.current) {
      (mesh.current.material as ShaderMaterial).uniforms.strength.value = pulse * .68;
      mesh.current.visible = pulse > .001;
    }
  }, -40);
  const [x, y, z] = YOUTH_RENDERING.screen.center;
  return <mesh ref={mesh} position={[x, (5.5 + y - 1) / 2, z + .06]} visible={false}>
    <planeGeometry args={[YOUTH_RENDERING.screen.frameWidth * 1.25, 5.5 - y + 1]} />
    <primitive object={material} attach="material" />
  </mesh>;
}

import {
  BoxGeometry, BufferGeometry, CircleGeometry, Color, CylinderGeometry,
  DodecahedronGeometry, Euler, Float32BufferAttribute, Group, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = [number, number, number];
export const SCHOOLYARD = { groundY: -3, centerX: -65, centerZ: -76, fieldWidth: 38, fieldLength: 68 } as const;

/** Actual metre-scale ground, goals, rails, tree volumes and school buildings.
 * Batched only after construction: occlusion and parallax use real depth.
 * No images, ray-plane projection, billboards, render targets or live shadows. */
export function createSchoolyard() {
  const scene = new Group(); scene.name = 'Schoolyard — real 3D exterior';
  const parts: BufferGeometry[] = [];
  const sun = new Vector3(-.65, .9, .3).normalize();
  const ground = SCHOOLYARD.groundY;
  const items: {kind: string; position: Point; height?: number}[] = [];
  function add(geometry: BufferGeometry, color: string, position: Point, rotation: Point = [0,0,0], scale: Point = [1,1,1]) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone(); geometry.dispose();
    flat.applyMatrix4(new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale)));
    const normals = flat.getAttribute('normal'), base = new Color(color), colors = new Float32Array(normals.count * 3);
    for (let i=0;i<normals.count;i++) {
      const ndl = Math.max(0, sun.x*normals.getX(i)+sun.y*normals.getY(i)+sun.z*normals.getZ(i));
      const shade = ndl > .66 ? 1 : ndl > .12 ? .86 : .70;
      colors.set([base.r*shade,base.g*shade,base.b*(shade+(1-shade)*.15)],i*3);
    }
    flat.setAttribute('color',new Float32BufferAttribute(colors,3));
    // Uniform geometry attributes permit a single exterior draw call.
    flat.deleteAttribute('uv'); parts.push(flat);
  }
  const box = (position: Point, size: Point, color: string) => add(new BoxGeometry(...size),color,position);
  const plane = (x:number,z:number,w:number,d:number,color:string,y=ground+.06) => add(new PlaneGeometry(w,d),color,[x,y,z],[-Math.PI/2,0,0]);
  const cx=SCHOOLYARD.centerX, cz=SCHOOLYARD.centerZ;
  function ring(radius:number,width:number,color:string,y:number) {
    const points:[number,number][]=[];
    for(let half=0;half<2;half++) for(let i=0;i<=32;i++) {
      const a=(half+i/32)*Math.PI;
      points.push([Math.cos(a),Math.sin(a)]);
    }
    const p:number[]=[];
    const point=(i:number,r:number) => [cx+points[i][0]*r,y,cz+points[i][1]*r+(i<=32?20:-20)];
    for(let i=0;i<points.length;i++) {
      const j=(i+1)%points.length,a=point(i,radius),b=point(j,radius),c=point(i,radius-width),d=point(j,radius-width);
      p.push(...a,...c,...b,...b,...c,...d);
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(p,3));geometry.computeVertexNormals();
    add(geometry,color,[0,0,0]);
  }
  plane(-130,-85,290,370,'#a5b98a',ground);
  plane(cx,cz,85,119,'#dbd3ba');
  // Distinct raised layers keep distant lane paint out of depth-buffer fighting.
  plane(cx,cz,77,111,'#a4b485',ground+.12);
  ring(29.5,6,'#c98578',ground+.20);
  for(let stripe=0;stripe<10;stripe++)plane(cx,cz-30.6+stripe*6.8,38,6.8,stripe%2?'#91ae83':'#9bb58a',ground+.22);
  const mark='#efe9d7';
  for(const sign of [-1,1]) {
    const z=cz+sign*34.2,back=z+sign*1.7;
    for(const x of [-3.66,3.66]) {
      box([cx+x,ground+1.22,z],[.14,2.44,.14],mark);
      box([cx+x,ground+1.22,back],[.065,2.44,.065],'#cbd1c0');
      box([cx+x,ground+2.44,(z+back)/2],[.08,.08,1.7],mark);
    }
    box([cx,ground+2.44,z],[7.46,.14,.14],mark);
    for(let i=0;i<=10;i++)box([cx-3.66+i*.732,ground+1.22,back],[.035,2.44,.035],'#cbd1c0');
    for(let i=0;i<=5;i++)box([cx,ground+i*.488,back],[7.32,.035,.035],'#cbd1c0');
    items.push({kind:'goal',position:[cx,ground,z],height:2.44});
  }
  // Walkway, raised curbs and real fence posts around the sports ground.
  for(const x of [-42.5,42.5]) {
    box([cx+x,ground+.12,cz],[.28,.24,120],'#d5cebb');
    for(let z=-58;z<=58;z+=5.8)box([cx+x,ground+1.35,cz+z],[.12,2.7,.12],'#80939a');
    for(const y of [1.0,2.6])box([cx+x,ground+y,cz],[.075,.075,116],'#899ca1');
  }
  for(const z of [-60,60]) {
    for(let x=-42.5;x<=42.5;x+=5)box([cx+x,ground+1.35,cz+z],[.12,2.7,.12],'#80939a');
    for(const y of [1,2.6])box([cx,ground+y,cz+z],[85,.075,.075],'#899ca1');
  }
  function tree(x:number,z:number,index:number) {
    const h=5.6+(index%4)*.55, r=2.3+(index%3)*.3;
    add(new CircleGeometry(1,20),'#819972',[x+1.3,ground+.06,z-.7],[-Math.PI/2,0,0],[r*1.35,r*.9,1]);
    add(new CylinderGeometry(.18,.32,h*.7,7),'#9c9278',[x,ground+h*.35,z]);
    add(new DodecahedronGeometry(1,1),index%2?'#92b094':'#84a38d',[x,ground+h*.76,z],[0,index*.7,0],[r,h*.41,r*.88]);
    add(new DodecahedronGeometry(1,0),'#a3bb9b',[x-r*.58,ground+h*.7,z+.5],[0,index,0],[r*.64,r*.84,r*.7]);
    items.push({kind:'tree',position:[x,ground,z],height:h*1.17});
  }
  let index=0;
  for(const x of [-49,49])for(let z=-58;z<=58;z+=12)tree(cx+x,cz+z,index++);
  for(let x=-35;x<=35;x+=12)tree(cx+x,cz-70,index++);

  function school(x:number,z:number,width:number,depth:number,height:number) {
    plane(x+6,z-2,width+10,depth+5,'#93a087',ground+.06);
    box([x,ground+height/2,z],[width,height,depth],'#eee1c8');
    box([x,ground+height+.25,z],[width+1,.5,depth+1],'#a5a9ba');
    box([x,ground+.7,z],[width+.2,1.4,depth+.2],'#a3abb1');
    for(let floor=1;floor<=3;floor++) {
      const y=ground+floor*3.6;
      box([x,y-.8,z],[width+.35,.17,depth+.35],'#d4c6b0');
      for(let column=0;column<Math.floor(depth/4);column++) {
        const wz=z-depth/2+2+column*4;
        box([x+width/2+.03,y+.3,wz],[.08,1.75,2.25],'#9caec1');
        box([x+width/2+.11,y+.3,wz],[.08,1.75,.08],'#d4d3c9');
      }
      for(let column=0;column<Math.floor(width/4);column++) {
        const wx=x-width/2+2+column*4;
        box([wx,y+.3,z+depth/2+.03],[2.25,1.75,.08],'#9caec1');
      }
    }
    items.push({kind:'building',position:[x,ground,z],height});
  }
  school(cx-70,cz-9,14,100,13.8);
  school(cx-11,cz-96,86,14,13.8);

  const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());
  if(!geometry)throw new Error('Unable to batch outdoor school geometry');
  const material=new MeshBasicMaterial({vertexColors:true,toneMapped:false});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`varying vec3 vSchoolWorld;\n${shader.vertexShader}`.replace('#include <project_vertex>','vSchoolWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader=`
      varying vec3 vSchoolWorld;
      float schoolPaint(float d, float aa) {
        // Pixel-footprint integration of a 12cm painted line. Thin distant
        // markings stay faint and continuous, instead of noisy raster strips.
        return max(0.0, min(d + aa, 0.06) - max(d - aa, -0.06)) / (2.0 * aa);
      }
      float schoolBoxLine(vec2 p, vec2 halfSize) {
        return abs(max(abs(p.x) - halfSize.x, abs(p.y) - halfSize.y));
      }
      ${shader.fragmentShader}`.replace('#include <opaque_fragment>',`
      vec2 sports = vSchoolWorld.xz - vec2(${cx.toFixed(1)}, ${cz.toFixed(1)});
      float paint = 0.0;
      if (abs(vSchoolWorld.y - ${(ground+.20).toFixed(2)}) < 0.002) {
        float radius = length(vec2(sports.x, max(abs(sports.y) - 20.0, 0.0)));
        float aa = max(fwidth(radius) * 0.5, 0.002);
        paint = mix(schoolPaint(fract(radius) - 0.5, aa), 0.12, smoothstep(0.4, 0.8, aa));
      }
      if (abs(vSchoolWorld.y - ${(ground+.22).toFixed(2)}) < 0.002) {
        float d = min(schoolBoxLine(sports, vec2(19.0, 34.0)), abs(sports.y));
        d = min(d, abs(length(sports) - 8.9));
        d = min(d, schoolBoxLine(vec2(sports.x, abs(sports.y) - 27.5), vec2(12.0, 6.5)));
        d = min(d, schoolBoxLine(vec2(sports.x, abs(sports.y) - 31.0), vec2(5.5, 3.0)));
        paint = schoolPaint(d, max(fwidth(d) * 0.5, 0.002));
      }
      outgoingLight = mix(outgoingLight, vec3(0.86, 0.82, 0.70), paint);
      float aerial = smoothstep(45.0, 240.0, length(vSchoolWorld - cameraPosition));
      outgoingLight = mix(outgoingLight, vec3(0.57, 0.64, 0.75), aerial * 0.42);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> 'schoolyard-real-geometry-v2';
  const mesh=new Mesh(geometry,material);mesh.name='Batched solid schoolyard';
  mesh.matrixAutoUpdate=false;mesh.updateMatrix();scene.add(mesh);
  scene.userData.triangles=geometry.getAttribute('position').count/3;
  scene.userData.items=items;
  scene.userData.billboards=0;
  return {scene,dispose(){geometry.dispose();material.dispose();}};
}

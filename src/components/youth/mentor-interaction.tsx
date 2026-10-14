import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, Quaternion, Raycaster, Vector2, Vector3, type Object3D } from 'three';

export function cloudPosition(head: {left:number;top:number;right:number}, width:number, cloudWidth:number, cloudHeight:number) {
  const x = head.left - cloudWidth - 14;
  return x >= 12 ? {x, y:Math.max(12,head.top+12)} : {
    x:Math.max(12,Math.min(width-cloudWidth-12,head.right-cloudWidth-18)),
    y:Math.max(12,head.top-cloudHeight-14),
  };
}

/** Raycast the visible character, not its transparent canvas rectangle. */
export function MentorInteraction({model}:{model:Object3D}) {
  const {gl,camera,invalidate}=useThree();
  const pet=useRef({start:-Infinity, timer:0, active:false});
  const restore=useRef<(()=>void)|null>(null);
  const cloudAnchor=useRef<Vector3[]|null>(null);
  useEffect(()=>{
    const petState=pet.current;
    const canvas=gl.domElement, head=model.getObjectByName('J_Bip_C_Head');
    if(!head)return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const ray=new Raycaster(), pointer=new Vector2();
    const targets:Mesh[]=[];
    model.traverse(o=>{if(o instanceof Mesh && !o.userData.mentorOutline)targets.push(o);});
    let raf=0, moved:PointerEvent|null=null, lastStrokeX=0;
    const oldCursor=document.body.style.cursor;
    const hit=(e:PointerEvent)=>{
      if((e.target as HTMLElement)?.closest?.('button,input,a,textarea,[role="button"]'))return null;
      const rect=canvas.getBoundingClientRect();
      if(e.clientX<rect.left || e.clientX>rect.right || e.clientY<rect.top || e.clientY>rect.bottom)return null;
      pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      model.updateWorldMatrix(true,true); ray.setFromCamera(pointer,camera);
      const result=ray.intersectObjects(targets,false)[0];
      if(!result)return null;
      const local=head.worldToLocal(result.point.clone());
      return {head:local.y>-.055 && local.y<.30 && Math.abs(local.x)<.22};
    };
    const tick=()=>{
      if(document.hidden){pet.current.active=false;invalidate();return;}
      invalidate();
      if(performance.now()-pet.current.start<1200)pet.current.timer=window.setTimeout(tick,1000/24);
      else {pet.current.active=false;invalidate();}
    };
    const trigger=()=>{
      if(performance.now()-pet.current.start<1500)return;
      pet.current.start=performance.now();pet.current.active=true;
      canvas.dataset.petCount=String(Number(canvas.dataset.petCount||0)+1);
      tick();
    };
    const move=(e:PointerEvent)=>{
      moved=e;
      if(raf)return;
      raf=requestAnimationFrame(()=>{
        raf=0; if(!moved)return;
        const h=hit(moved);
        document.body.style.cursor=h ? (moved.buttons ? 'grabbing':'grab') : oldCursor;
        canvas.dataset.mentorHover=h ? h.head?'head':'body':'none';
        if(h?.head && moved.buttons && Math.abs(moved.clientX-lastStrokeX)>5){trigger();lastStrokeX=moved.clientX;}
      });
    };
    const down=(e:PointerEvent)=>{const h=hit(e);if(h?.head){lastStrokeX=e.clientX;trigger();}};
    const leave=()=>{document.body.style.cursor=oldCursor;};
    const stop=()=>{if(document.hidden){clearTimeout(pet.current.timer);pet.current.active=false;leave();invalidate();}};
    const key=()=>{if(!document.hidden)trigger();};
    document.addEventListener('pointermove',move);document.addEventListener('pointerdown',down);
    document.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',stop);
    canvas.addEventListener('mentor-pet',key);
    Object.assign(canvas.dataset,{petReduced:String(reduced.matches)});
    return ()=>{
      cancelAnimationFrame(raf);clearTimeout(petState.timer);petState.active=false;
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerdown',down);
      document.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',stop);
      canvas.removeEventListener('mentor-pet',key);leave();
    };
  },[gl,camera,invalidate,model]);
  useFrame(({gl,camera})=>{
    const head=model.getObjectByName('J_Bip_C_Head');if(!head)return;
    // Apply only for rendering, then undo after the draw. Never accumulate an
    // offset into the authored mixer pose or compete with the blink scheduler.
    if(pet.current.active){
      const t=Math.min(1,(performance.now()-pet.current.start)/1200);
      const envelope=Math.sin(Math.PI*t);
      const q=head.quaternion.clone();
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const yaw=reduced?0:Math.sin(t*Math.PI*5)*.16*envelope;
      head.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw));
      const faces:{mesh:Mesh;blink:number;smile:number}[]=[];
      const seen=new Set<number[]>();
      model.traverse(o=>{if(o instanceof Mesh && o.morphTargetInfluences && o.morphTargetInfluences.length>12 && !seen.has(o.morphTargetInfluences)){
        seen.add(o.morphTargetInfluences);
        faces.push({mesh:o,blink:o.morphTargetInfluences[12],smile:o.morphTargetInfluences[1]});
        o.morphTargetInfluences[12]=Math.min(1,envelope*4);o.morphTargetInfluences[1]=.5*envelope;
      }});
      gl.domElement.dataset.petActive='true';gl.domElement.dataset.petEyes=String(Math.min(1,envelope*4));gl.domElement.dataset.petYaw=String(yaw);
      restore.current=()=>{head.quaternion.copy(q);for(const f of faces){f.mesh.morphTargetInfluences![12]=f.blink;f.mesh.morphTargetInfluences![1]=f.smile;}};
    }else {gl.domElement.dataset.petActive='false';gl.domElement.dataset.petEyes='0';gl.domElement.dataset.petYaw='0';}
    model.updateWorldMatrix(true,true);
    const canvas=gl.domElement, rect=canvas.getBoundingClientRect();
    const anchor=canvas.closest('.youth-portrait-anchor') as HTMLElement|null;
    const bubble=anchor?.querySelector('.youth-mentor-bubble') as HTMLElement|null;
    if(anchor && bubble){
      const worldPoints=[[-.19,0,-.10],[.19,.24,.10],[-.19,.24,.10],[.19,0,-.10]].map(p=>head.localToWorld(new Vector3(...p)));
      if(!cloudAnchor.current) cloudAnchor.current=worldPoints.map(p=>p.clone());
      const points=worldPoints.map(p=>p.project(camera));
      const xs=points.map(p=>rect.left+(p.x+1)*rect.width/2), ys=points.map(p=>rect.top+(1-p.y)*rect.height/2);
      const bounds={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys)};
      // Lock to the initial head position. Reprojection adapts to viewport changes,
      // but greeting, idle animation and petting cannot drag the cloud around.
      const fixed=cloudAnchor.current.map(p=>p.clone().project(camera));
      const fixedXs=fixed.map(p=>rect.left+(p.x+1)*rect.width/2);
      const fixedYs=fixed.map(p=>rect.top+(1-p.y)*rect.height/2);
      const position=cloudPosition({left:Math.min(...fixedXs),right:Math.max(...fixedXs),top:Math.min(...fixedYs)},window.innerWidth,bubble.offsetWidth,bubble.offsetHeight);
      const parent=anchor.getBoundingClientRect();
      anchor.style.setProperty('--mentor-cloud-x',`${position.x-parent.left}px`);
      anchor.style.setProperty('--mentor-cloud-y',`${position.y-parent.top}px`);
      canvas.dataset.headBounds=JSON.stringify(bounds);
    }
  },0);
  useFrame(({gl})=>{
    restore.current?.();restore.current=null;
    if(model.userData.arrivalProgress?.value >= 1 && gl.domElement.dataset.mentorPresented!=='true') {
      gl.domElement.dataset.mentorPresented='true';
      window.dispatchEvent(new Event('mentor-presented'));
    }
  },2);
  return null;
}

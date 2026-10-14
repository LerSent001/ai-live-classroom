import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, Raycaster, Vector3 } from 'three';
import { createSchoolyard, SCHOOLYARD } from './schoolyard-scene';

test('schoolyard has solid buildings, crowns, goals and true depth, without image billboards',()=>{
  const built=createSchoolyard();
  try {
    const mesh=built.scene.children[0] as Mesh;
    mesh.geometry.computeBoundingBox();built.scene.updateMatrixWorld(true);
    const bounds=mesh.geometry.boundingBox!;
    assert.ok(bounds.max.y-bounds.min.y>13);
    assert.ok(bounds.max.x-bounds.min.x>200);
    assert.ok(built.scene.userData.items.filter((item:{kind:string})=>item.kind==='tree').length>=20);
    assert.equal(built.scene.userData.items.filter((item:{kind:string})=>item.kind==='goal').length,2);
    assert.equal(built.scene.userData.items.filter((item:{kind:string})=>item.kind==='building').length,2);
    assert.equal(built.scene.userData.billboards,0);
    assert.equal(built.scene.children.length,1);
    assert.ok(built.scene.userData.triangles<20000);
    const ray=new Raycaster(new Vector3(SCHOOLYARD.centerX,30,SCHOOLYARD.centerZ),new Vector3(0,-1,0));
    const hit=ray.intersectObject(built.scene)[0];
    assert.ok(hit && Math.abs(hit.point.y-SCHOOLYARD.groundY-.22)<.01,'Pitch is a real raised horizontal sports surface');
    const building=built.scene.userData.items.find((item:{kind:string})=>item.kind==='building');
    const facade=new Raycaster(new Vector3(building.position[0]+25,5,building.position[2]),new Vector3(-1,0,0)).intersectObject(built.scene);
    assert.ok(facade.length>0 && facade[0].point.y>SCHOOLYARD.groundY+5,'Facade exists above the ground in depth');
  } finally {built.dispose();}
});

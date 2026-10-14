/* eslint-disable @typescript-eslint/no-require-imports */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.YOUTH_TEST_URL||'http://localhost:3011';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 fs.mkdirSync('output/mentor-interaction',{recursive:true});
 const results=[];
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',route=>{
   const r=route.request(),u=new URL(r.url());
   if(u.origin!==base)return route.abort();
   if(r.method()==='POST'&&(u.pathname!=='/api/youth/classroom'||r.postDataJSON()?.kind))return route.abort();
   return route.continue();
  });
  await page.goto(base+'/zh-youth');
  const selector='.youth-vroid-portrait canvas',canvas=page.locator(selector);
  await page.waitForFunction(s=>document.querySelector(s)?.dataset.handMotion==='greeting',selector);
  await page.waitForFunction(s=>document.querySelector(s)?.dataset.handMotion==='authored-rest',selector);
  await page.screenshot({path:`output/mentor-interaction/${width}-rest.png`});
  const head=JSON.parse(await canvas.getAttribute('data-head-bounds'));
  const x=(head.left+head.right)/2;let target;
  await page.mouse.move(x,head.top+155);await page.waitForTimeout(100);
  assert.equal(await canvas.getAttribute('data-mentor-hover'),'body');
  assert.equal(await page.evaluate(()=>document.body.style.cursor),'grab');
  for(const dy of [20,35,50,5,65]){
   await page.mouse.move(x,head.top+dy);await page.waitForTimeout(80);
   if(await canvas.getAttribute('data-mentor-hover')==='head'){target={x,y:head.top+dy};break;}
  }
  assert.ok(target,'Rendered head can be hit by pointer');
  assert.equal(await page.evaluate(()=>document.body.style.cursor),'grab');
  await page.evaluate(s=>{window.petSamples=[];const start=performance.now();const sample=()=>{window.petSamples.push(Number(document.querySelector(s)?.dataset.petYaw||0));if(performance.now()-start<1800)requestAnimationFrame(sample);};sample();},selector);
  await page.mouse.down();await page.mouse.move(target.x+12,target.y,{steps:3});
  await page.waitForFunction(s=>Number(document.querySelector(s)?.dataset.petEyes)>.95,selector);
  await page.screenshot({path:`output/mentor-interaction/${width}-pet.png`});
  await page.mouse.up();
  const count=await canvas.getAttribute('data-pet-count');
  await page.waitForFunction(s=>document.querySelector(s)?.dataset.petActive==='false',selector);
  const yaw=await page.evaluate(()=>window.petSamples);
  assert.ok(Math.min(...yaw)<-.04 && Math.max(...yaw)>.04,'Head visibly shakes in both directions');
  await page.mouse.click(15,200);await page.waitForTimeout(100);
  assert.equal(await canvas.getAttribute('data-pet-count'),count,'Empty scene does not trigger petting');
  assert.notEqual(await page.evaluate(()=>document.body.style.cursor),'grab');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);
  const frames=await canvas.getAttribute('data-portrait-frames');await page.waitForTimeout(1000);
  assert.equal(await canvas.getAttribute('data-portrait-frames'),frames,'No permanent render loop');
  const bubble=await page.locator('.youth-mentor-bubble').boundingBox();
  assert.ok(bubble.x>=0 && bubble.x+bubble.width<=width);
  assert.deepEqual(errors,[]);results.push({width,head,target,bubble,petCount:count,errors});await context.close();
 }}finally{await browser.close();}
 fs.writeFileSync('output/mentor-interaction/check.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});

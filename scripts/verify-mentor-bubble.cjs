/* eslint-disable @typescript-eslint/no-require-imports */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.YOUTH_TEST_URL||'http://localhost:3011';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  await context.route('**/*',r=>{
   const q=r.request(),u=new URL(q.url());
   if(u.origin!==base || (q.method()==='POST' && (u.pathname!=='/api/youth/classroom'||q.postDataJSON()?.kind)))return r.abort();
   return r.continue();
  });
  await page.addInitScript(()=>{
   window.addEventListener('mentor-presented',()=>{window.presentedAt=performance.now();});
   new MutationObserver(()=>{if(!window.bubbleAt && document.querySelector('.youth-mentor-bubble[data-visible="true"]'))window.bubbleAt=performance.now();}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-visible']});
  });
  await page.goto(base+'/zh-youth');
  await page.waitForFunction(()=>window.bubbleAt);
  const delay=await page.evaluate(()=>window.bubbleAt-window.presentedAt);
  assert.ok(delay>=2900 && delay<4500,`First cloud delayed after character render: ${delay}`);
  const position=()=>page.locator('.youth-portrait-anchor').evaluate(e=>[parseFloat(e.style.getPropertyValue('--mentor-cloud-x')),parseFloat(e.style.getPropertyValue('--mentor-cloud-y'))]);
  const before=await position();
  await page.locator('.youth-vroid-portrait canvas').evaluate(e=>e.dispatchEvent(new Event('mentor-pet')));
  for(let i=0;i<8;i++){
   await page.waitForTimeout(200);const after=await position();
   assert.ok(after.every((v,j)=>Math.abs(v-before[j])<.1),'Cloud remains fixed during character animation/petting');
  }
  console.log(JSON.stringify({width,delayMs:delay,fixedPosition:before}));await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

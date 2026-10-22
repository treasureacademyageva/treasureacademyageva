#!/usr/bin/env node
'use strict';
const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');
const os=require('os');
const ROOT=path.resolve(__dirname,'../..');
const BASE=process.env.TA_TEST_BASE||'http://127.0.0.1:4173/';
const OUT=process.env.TA_SCREENSHOT_DIR||path.join(os.tmpdir(),'taa-visual-qa');
const rootPages=fs.readdirSync(ROOT).filter(x=>x.endsWith('.html')&&!x.startsWith('developer'));
const nested=['classes','news'].flatMap(dir=>fs.readdirSync(path.join(ROOT,dir)).filter(x=>x.endsWith('.html')).map(x=>dir+'/'+x));
const pages=rootPages.concat(nested);
let pass=0,fail=0;
function ok(name,value,details=''){if(value){pass++;}else{fail++;console.error('not ok - '+name+(details?' — '+details:''));}}
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const viewport of [{name:'compact',width:320,height:700},{name:'mobile',width:390,height:844},{name:'desktop',width:1365,height:768}]){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,colorScheme:'light',reducedMotion:'no-preference'});
  for(const rel of pages){
   const page=await context.newPage();
   const errors=[];const failed=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('requestfailed',r=>{if(r.url().startsWith(BASE))failed.push(r.url()+' '+(r.failure()?.errorText||''));});
   const response=await page.goto(new URL(rel,BASE).href,{waitUntil:'domcontentloaded',timeout:15000});
   await page.waitForTimeout(80);
   const metrics=await page.evaluate(()=>({
     title:document.title,
     h1:[...document.querySelectorAll('h1')].filter(x=>{const s=getComputedStyle(x),r=x.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0}).length,
     overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
     dock:document.querySelector('.mobile-dock')?getComputedStyle(document.querySelector('.mobile-dock')).display:'missing',
     headerHeight:(document.querySelector('.lite-nav')||document.querySelector('.navbar'))?.getBoundingClientRect().height||0,
     actionTop:document.querySelector('.route-actions a,.hero-ctas a,.smart-search-card input,.explore-intro input')?.getBoundingClientRect().top??9999,
     bodyText:(document.body.innerText||'').trim().length
   }));
   ok(`${viewport.name} ${rel} returns below 400`,response&&response.status()<400,String(response&&response.status()));
   ok(`${viewport.name} ${rel} has visible h1`,metrics.h1===1,String(metrics.h1));
   ok(`${viewport.name} ${rel} has no horizontal overflow`,metrics.overflow<=2,String(metrics.overflow));
   ok(`${viewport.name} ${rel} has no runtime errors`,errors.length===0,errors.join(' | '));
   ok(`${viewport.name} ${rel} has no failed local resources`,failed.length===0,failed.join(' | '));
   ok(`${viewport.name} ${rel} renders meaningful content`,metrics.bodyText>80,String(metrics.bodyText));
   if(viewport.width<960){
    ok(`${viewport.name} ${rel} shows five-action dock`,metrics.dock==='grid',metrics.dock);
    ok(`${viewport.name} ${rel} keeps header compact`,metrics.headerHeight<=72,String(metrics.headerHeight));
    if(!['404.html'].includes(rel))ok(`${viewport.name} ${rel} surfaces a task early`,metrics.actionTop<700,String(metrics.actionTop));
   }else ok(`desktop ${rel} hides mobile dock`,metrics.dock==='none',metrics.dock);
   await page.close();
  }
  await context.close();
 }
 fs.mkdirSync(OUT,{recursive:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,colorScheme:'light'});
 for(const rel of ['index.html','explore.html','search.html','admissions.html','fees.html','classes/primary-1.html']){
  const page=await context.newPage();await page.goto(new URL(rel,BASE).href,{waitUntil:'networkidle'});await page.screenshot({path:path.join(OUT,rel.replaceAll('/','-').replace('.html','')+'-mobile.png'),fullPage:true});await page.close();
 }
 const homeSearch=await context.newPage();
 await homeSearch.goto(new URL('index.html',BASE).href,{waitUntil:'domcontentloaded'});
 await homeSearch.fill('#homeQuery','school dress');await homeSearch.click('.home-finder button[type="submit"]');await homeSearch.waitForURL(/search\.html$/);
 ok('homepage search transfers privately without a query-string leak',await homeSearch.inputValue('#smartQuery')==='school dress'&&!homeSearch.url().includes('?'));
 await homeSearch.close();
 const search=await context.newPage();
 await search.goto(new URL('search.html',BASE).href,{waitUntil:'domcontentloaded'});
 await search.fill('#smartQuery','unifrom');await search.click('#smartSearchForm button[type="submit"]');
 ok('browser smart search finds a misspelled uniform query',await search.locator('.search-result h2',{hasText:'Uniform'}).count()>0);
 await search.fill('#smartQuery','how much are the school charges');await search.click('#smartSearchForm button[type="submit"]');
 ok('browser smart search renders a direct fee answer from related wording',await search.locator('.answer-card',{hasText:'current written fee schedule'}).count()>0);
 ok('browser search keeps raw query text out of the URL',!search.url().includes('charges'),search.url());
 await search.fill('#smartQuery','former student history');await search.click('#smartSearchForm button[type="submit"]');
 ok('browser meaning search connects former students to alumni',await search.locator('.search-result h2',{hasText:/Former Pupil|Alumni/i}).count()>0);
 const help=await context.newPage();await help.goto(new URL('website-help.html',BASE).href,{waitUntil:'domcontentloaded'});
 await help.click('#previewDiagnostics');
 const diagnosticText=await help.locator('#diagnosticPreview').innerText();
 ok('website problem report can preview a safe diagnostic code',/^Safe diagnostic code: TAUX1-/.test(diagnosticText));
 await help.evaluate(()=>{window.open=url=>{window.__reportUrl=url;};});
 await help.selectOption('#problemType',{label:'Writing was unclear'});await help.selectOption('#problemGoal',{label:'Fees or payment guidance'});await help.click('#problemForm button[type="submit"]');
 const reportDraft=decodeURIComponent(await help.evaluate(()=>window.__reportUrl||''));
 ok('WhatsApp report draft contains categories but no typed form details',/wa\.me\/2349063932487/.test(reportDraft)&&/Problem category: Writing was unclear/.test(reportDraft)&&/Task area: Fees or payment guidance/.test(reportDraft)&&!/I was trying to:|What happened:/.test(reportDraft));
 const dev=await context.newPage();await dev.goto(new URL('developer-operations.html',BASE).href,{waitUntil:'domcontentloaded'});
 await dev.fill('#labQuery','school charges');await dev.click('#runLab');
 ok('developer search lab explains related fee wording',await dev.locator('#labOutput',{hasText:'Fees & payments'}).count()>0);
 await dev.fill('#reportCode',diagnosticText);await dev.click('#addReport');
 ok('developer dashboard imports only safe problem diagnostics',await dev.locator('#reportStatus',{hasText:'Safe diagnostics imported'}).count()>0&&await dev.locator('.report-item').count()===1);
 await dev.click('#clearReports');
 await dev.close();await help.close();await search.close();await context.close();
 const dark=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
 for(const rel of ['index.html','fees.html','search.html']){
  const page=await dark.newPage();await page.goto(new URL(rel,BASE).href,{waitUntil:'domcontentloaded'});
  const state=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth-innerWidth,text:(document.body.innerText||'').length}));
  ok(`dark mode ${rel} follows the device theme`,state.theme==='dark',state.theme);
  ok(`dark mode ${rel} fits the mobile viewport`,state.overflow<=2,String(state.overflow));
  ok(`dark mode ${rel} keeps content available`,state.text>100,String(state.text));
  if(rel==='index.html')await page.screenshot({path:path.join(OUT,'index-dark-mobile.png'),fullPage:false});
  await page.close();
 }
 await dark.close();await browser.close();
 console.log(`BROWSER VISITOR QA: ${pass} passed, ${fail} failed across ${pages.length} pages and three viewports.`);
 if(fail)process.exit(1);
})().catch(error=>{console.error(error);process.exit(1);});

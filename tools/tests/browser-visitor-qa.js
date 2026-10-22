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
 await homeSearch.keyboard.press('Tab');const firstFocus=await homeSearch.evaluate(()=>document.activeElement&&document.activeElement.classList.contains('skip-link'));await homeSearch.keyboard.press('Enter');await homeSearch.waitForTimeout(20);ok('keyboard users can skip the repeated header and move focus to main content',firstFocus&&await homeSearch.evaluate(()=>document.activeElement&&document.activeElement.id)==='main');
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
 ok('website problem report can preview a safe diagnostic code',/^Safe diagnostic code: TAUX2-/.test(diagnosticText));
 await help.evaluate(()=>{window.open=url=>{window.__reportUrl=url;};});
 await help.selectOption('#problemType',{label:'Writing was unclear'});await help.selectOption('#problemGoal',{label:'Fees or payment guidance'});await help.click('#problemForm button[type="submit"]');
 const reportDraft=decodeURIComponent(await help.evaluate(()=>window.__reportUrl||''));
 ok('WhatsApp report draft contains categories but no typed form details',/wa\.me\/2349063932487/.test(reportDraft)&&/Problem category: Writing was unclear/.test(reportDraft)&&/Task area: Fees or payment guidance/.test(reportDraft)&&!/I was trying to:|What happened:/.test(reportDraft));
 const contact=await context.newPage();await contact.goto(new URL('contact.html',BASE).href,{waitUntil:'domcontentloaded'});
 await contact.click('#contactForm button[type="submit"]');await contact.waitForTimeout(80);
 ok('shared form errors identify and focus the first invalid field',await contact.locator('#contactName').getAttribute('aria-invalid')==='true'&&await contact.locator('#contactName-error',{hasText:'Complete this required field'}).count()>0&&await contact.evaluate(()=>document.activeElement&&document.activeElement.id)==='contactName');
 await contact.evaluate(()=>{window.open=url=>{window.__contactDraft=url;return {};};});
 await contact.fill('#contactName','Test Parent');await contact.selectOption('#contactSubject',{label:'Admission'});await contact.fill('#contactMessage','Please share the current admission steps.');await contact.click('#contactForm button[type="submit"]');
 const journey=await contact.evaluate(()=>window.TA_VISITOR_INSIGHTS&&window.TA_VISITOR_INSIGHTS.snapshot());
 ok('journey diagnostics record form start and website-step completion without values',journey&&journey.events.some(e=>e.t==='form_start'&&e.form==='contact')&&journey.events.some(e=>e.t==='form_complete'&&e.form==='contact')&&!JSON.stringify(journey).includes('Test Parent')&&!JSON.stringify(journey).includes('admission steps'));
 await contact.close();
 const abandoned=await context.newPage();await abandoned.goto(new URL('contact.html',BASE).href,{waitUntil:'domcontentloaded'});await abandoned.fill('#contactName','Not retained');await abandoned.goto(new URL('about.html',BASE).href,{waitUntil:'domcontentloaded'});const abandonedJourney=await abandoned.evaluate(()=>window.TA_VISITOR_INSIGHTS&&window.TA_VISITOR_INSIGHTS.snapshot());
 ok('journey diagnostics mark an incomplete form without retaining its value',abandonedJourney&&abandonedJourney.events.some(e=>e.t==='form_abandon'&&e.form==='contact')&&!JSON.stringify(abandonedJourney).includes('Not retained'));await abandoned.close();
 const dev=await context.newPage();await dev.goto(new URL('developer-operations.html',BASE).href,{waitUntil:'domcontentloaded'});
 ok('developer studio renders brand, accessibility and journey-map evidence',await dev.locator('#brandCards .metric-card').count()>=5&&await dev.locator('#pageAuditRows tr').count()===56&&await dev.locator('#journeyRows tr').count()===5);
 ok('agent handoff contains safeguards and evidence instead of credentials',/Non-negotiable safeguards/.test(await dev.inputValue('#agentPreview'))&&/Do not fabricate school facts/.test(await dev.inputValue('#agentPreview'))&&!/github[_-]pat|password\s*=/.test(await dev.inputValue('#agentPreview')));
 await dev.locator('[data-gap]').first().selectOption({label:'Owner supplied'});ok('owner evidence decisions flow into the no-code agent handoff',/\[Owner supplied\]/.test(await dev.inputValue('#agentPreview')));
 await dev.fill('#labQuery','school charges');await dev.click('#runLab');
 ok('developer search lab explains related fee wording',await dev.locator('#labOutput',{hasText:'Fees & payments'}).count()>0);
 await dev.fill('#reportCode',diagnosticText);await dev.click('#addReport');
 ok('developer dashboard imports only safe problem diagnostics',await dev.locator('#reportStatus',{hasText:'Safe diagnostic imported'}).count()>0&&await dev.locator('.report-item').count()===1);
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
 await dark.close();
 const support=await browser.newPage({viewport:{width:320,height:700}});const supportResponse=await support.goto(new URL('portal/login.html',BASE).href,{waitUntil:'domcontentloaded'});const supportState=await support.evaluate(()=>({h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth-innerWidth,logo:document.body.innerText.includes('Treasure Academy, Ageva'),wrongMark:document.documentElement.innerHTML.includes('logo.jpg')}));ok('retired parent-help page stays truthful, responsive and free of the mismatched mark',supportResponse.status()<400&&supportState.h1===1&&supportState.overflow<=2&&supportState.logo&&!supportState.wrongMark);await support.close();
 await browser.close();
 console.log(`BROWSER VISITOR QA: ${pass} passed, ${fail} failed across ${pages.length} pages and three viewports.`);
 if(fail)process.exit(1);
})().catch(error=>{console.error(error);process.exit(1);});

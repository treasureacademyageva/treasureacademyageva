#!/usr/bin/env node
'use strict';
const {chromium}=require('playwright');
const AxeBuilder=require('@axe-core/playwright').default;
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const BASE=process.env.TA_TEST_BASE||'http://127.0.0.1:4173/';
const root=fs.readdirSync(ROOT).filter(x=>x.endsWith('.html')&&!['developer.html','developer-review.html'].includes(x));
const nested=['classes','news'].flatMap(dir=>fs.readdirSync(path.join(ROOT,dir)).filter(x=>x.endsWith('.html')).map(x=>dir+'/'+x));
const pages=root.concat(nested,['portal/login.html']);
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light',reducedMotion:'reduce'});
 let failed=0,passed=0;
 for(const rel of pages){
  const page=await context.newPage();
  if(rel==='portal/login.html') await page.route('**/api/portal-config',route=>route.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));
  const response=await page.goto(new URL(rel,BASE).href,{waitUntil:'domcontentloaded',timeout:20000});
  if(!response||response.status()>=400){console.error(`not ok - ${rel}: HTTP ${response&&response.status()}`);failed++;await page.close();continue;}
  await page.waitForTimeout(60);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  const violations=result.violations.filter(v=>['critical','serious'].includes(v.impact));
  if(violations.length){
   failed+=violations.length;
   for(const v of violations){
    const targets=v.nodes.slice(0,4).map(n=>n.target.join(' ')).join(' | ');
    console.error(`not ok - ${rel}: ${v.id} (${v.impact}) — ${v.help} — ${targets}`);
   }
  }else passed++;
  await page.close();
 }
 await context.close();
 let darkPassed=0;const darkPages=['index.html','search.html','fees.html','contact.html','portal/login.html'];const darkContext=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'});
 for(const rel of darkPages){
  const page=await darkContext.newPage();if(rel==='portal/login.html') await page.route('**/api/portal-config',route=>route.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));await page.goto(new URL(rel,BASE).href,{waitUntil:'domcontentloaded'});await page.waitForTimeout(60);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();const violations=result.violations.filter(v=>['critical','serious'].includes(v.impact));
  if(violations.length){failed+=violations.length;violations.forEach(v=>console.error(`not ok - dark ${rel}: ${v.id} (${v.impact}) — ${v.help}`));}else darkPassed++;
  await page.close();
 }
 await darkContext.close();await browser.close();
 console.log(`ACCESSIBILITY COMPONENT QA: ${passed}/${pages.length} light-theme pages and ${darkPassed}/${darkPages.length} dark-theme pages without serious/critical automated findings; ${failed} findings.`);
 if(failed)process.exit(1);
})().catch(error=>{console.error(error.stack||error);process.exit(1);});

const {chromium}=require('playwright');
const assert=require('assert');
(async()=>{const browser=await chromium.launch({headless:true});let passed=0;
async function check(width){
 const page=await browser.newPage({viewport:{width,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|Failed to load resource/.test(m.text()))errors.push(m.text())});
 await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(250);
 const top=await page.locator('.topbar').boundingBox(),nav=await page.locator('.lite-nav').boundingBox();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 if(width>=960){
  assert(top&&top.height>=43&&top.height<=45,`topbar ${width}: ${top&&top.height}`);assert(nav.height>=69,`navigation ${width}`);
  assert.equal(await page.locator('#menuToggle').count(),0,`obsolete desktop hamburger ${width}`);
  assert.equal(await page.locator('.mobile-dock').isVisible(),false,`desktop dock ${width}`);
  assert.equal(await page.locator('.lite-links a').count(),7);
  assert.equal(await page.evaluate(()=>document.querySelector('.lite-nav').scrollWidth<=innerWidth),true,`nav overflow ${width}`);
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,900)});await page.waitForTimeout(250);
  const stickyDesktopNav=await page.locator('.lite-nav').boundingBox();assert(Math.abs(stickyDesktopNav.y)<2,`desktop nav not sticky ${width}: ${stickyDesktopNav.y}`);
  assert.equal(await page.locator('.lite-portal').isVisible(),true);assert.equal(await page.locator('.lite-apply').isVisible(),true);
 }else{
  assert.equal(await page.locator('.topbar').isVisible(),false,`mobile topbar ${width}`);
  assert.equal(await page.locator('#navDrawer').isVisible(),false,`hidden site nav ${width}`);
  assert.equal(await page.locator('#menuToggle').count(),0,`obsolete mobile hamburger ${width}`);
  assert.equal(await page.locator('.mobile-dock').isVisible(),true,`mobile dock ${width}`);
  assert.equal(await page.locator('.mobile-dock a').count(),5,`mobile dock item count ${width}`);
  const sizes=await page.locator('.mobile-dock a').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
  assert(sizes.every(height=>height>=52),`mobile targets ${width}: ${sizes.join(',')}`);
  await page.locator('.mobile-dock a').first().focus();
  assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('.mobile-dock a')),true,`dock keyboard focus ${width}`);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement===document.querySelectorAll('.mobile-dock a')[1]),true,`dock keyboard order ${width}`);
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,900)});await page.waitForTimeout(250);
  const stickyNav=await page.locator('.lite-nav').boundingBox();assert(Math.abs(stickyNav.y)<2,`mobile nav not sticky ${width}: ${stickyNav.y}`);
  assert.equal(await page.locator('.lite-apply').isVisible(),true,`mobile header apply ${width}`);
  assert.equal(await page.getByRole('link',{name:'Start an Application'}).first().isVisible(),true,`hero application action ${width}`);
 }
 assert.deepEqual(errors,[],`browser errors ${width}: ${errors.join(' | ')}`);await page.close();passed++;
 }
 for(const w of [1440,1120,960,959,360])await check(w);
 // Dark mode keeps visible controls and a non-white navbar treatment.
 const dark=await browser.newPage({viewport:{width:360,height:800}});await dark.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});await dark.evaluate(()=>localStorage.setItem('treasure_theme','dark'));await dark.reload({waitUntil:'domcontentloaded'});assert(/dark/.test(await dark.locator('html').getAttribute('data-theme')));assert.equal(await dark.locator('.mobile-dock').isVisible(),true);await dark.close();passed++;
 const titlePage=await browser.newPage({viewport:{width:390,height:844}});await titlePage.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});assert(/Treasure Academy/.test(await titlePage.title()));assert.equal(await titlePage.locator('.portal-link').getAttribute('href'),'/portal/login.html');await titlePage.close();passed++;
 console.log(`HEADER BROWSER: ${passed} viewports/scenarios passed`);await browser.close();
})().catch(e=>{console.error(e.stack);process.exit(1)});

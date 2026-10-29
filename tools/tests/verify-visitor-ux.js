#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'../..');
let passed=0,failed=0;
function ok(name,condition){if(condition){console.log('ok - '+name);passed++;}else{console.error('not ok - '+name);failed++;}}
function read(file){return fs.readFileSync(path.join(ROOT,file),'utf8');}
function publicHtml(){
 const root=fs.readdirSync(ROOT).filter(x=>x.endsWith('.html')).map(x=>x);
 const nested=['classes','news'].flatMap(dir=>fs.readdirSync(path.join(ROOT,dir)).filter(x=>x.endsWith('.html')).map(x=>dir+'/'+x));
 return root.concat(nested).filter(x=>!x.startsWith('developer'));
}
const pages=publicHtml();
const shellPages=pages.filter(x=>!x.startsWith('portal/'));

ok('homepage answers identity with school, active levels and location',/Treasure Academy, Ageva/.test(read('index.html'))&&/Pre-Nursery, Nursery and Primary/.test(read('index.html'))&&/Ageva, Okene/.test(read('index.html')));
ok('homepage exposes a real search field and five top tasks above later sections',/class="home-finder"/.test(read('index.html'))&&['/fees','/academics','/calendar','/uniform','/contact'].every(x=>read('index.html').includes(x)));
ok('visitor sitemap groups admissions, learning, families, school, community and help',shellPages.includes('explore.html')&&['id="joining"','id="learning"','id="families"','id="school"','id="community"','id="help"'].every(x=>read('explore.html').includes(x)));
ok('all public shell pages use one bundled stylesheet',shellPages.every(x=>{const refs=[...read(x).matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)/g)].map(m=>m[1]);return refs.length===1&&refs[0].includes('/assets/css/site.css');}));
ok('artificial blocking loader is absent everywhere',shellPages.every(x=>!read(x).includes('siteLoader')));
ok('large legacy public script is not referenced',shellPages.every(x=>!read(x).includes('assets/js/site.js')));
ok('privacy-safe visitor diagnostics are available on every public page',shellPages.every(x=>read(x).includes('assets/js/visitor-insights.js')));
ok('homepage and explore keep raw search words out of URLs',/data-private-search/.test(read('index.html'))&&/data-private-search/.test(read('explore.html'))&&!/<input[^>]+name="q"[^>]+homeQuery/.test(read('index.html'))&&!/<input[^>]+name="q"[^>]+exploreQuery/.test(read('explore.html')));
ok('mobile quick navigation is present in one consistent order',shellPages.every(x=>{const h=read(x),m=h.match(/<nav class="mobile-dock"[\s\S]*?<\/nav>/);return m&&['Home','Admissions','Explore','Search','Contact'].every((label,i,a)=>i===0||m[0].indexOf(label)>m[0].indexOf(a[i-1]));}));
ok('secondary pages expose visible location and early actions',shellPages.filter(x=>!['index.html','search.html','explore.html','404.html'].includes(x)).every(x=>/class="route-bar"/.test(read(x))&&/class="route-actions"/.test(read(x))));
ok('universal footer provides popular, support, problem-report and contact routes',shellPages.every(x=>/class="universal-footer"/.test(read(x))&&/Find it fast/.test(read(x))&&/<h2>Contact<\/h2>/.test(read(x))&&/\/website-help/.test(read(x))));
ok('responsive illustration variants are referenced by width',/stage-nursery-640\.webp 640w/.test(read('index.html'))&&/uniform-banner-640\.webp 640w/.test(read('uniform.html')));
ok('familiar illustrations use optimised fallbacks without presenting them as verified current photos',/hero-school\.jpg/.test(read('index.html'))&&/hero-kids\.jpg/.test(read('index.html'))&&/classroom\.jpg/.test(read('index.html'))&&/Restored earlier-website illustrations/.test(read('index.html'))&&!/sports\.png|culture\.png/.test(read('index.html'))&&!/sports\.png|culture\.png/.test(read('news.html')));
ok('shop uses small WebP sources without invalid nested picture elements',/shop-uniform-560\.webp/.test(read('shop.html'))&&!/<picture>(?:(?!<\/picture>)[\s\S])*<picture>/.test(read('shop.html')));
const css=fs.readFileSync(path.join(ROOT,'assets/css/site.css'));
ok('single stylesheet stays below 50 KB gzip',zlib.gzipSync(css,{level:9}).length<50*1024);
ok('public shell stays below 5 KB gzip',zlib.gzipSync(fs.readFileSync(path.join(ROOT,'assets/js/public-shell.js')),{level:9}).length<5*1024);
const insights=read('assets/js/visitor-insights.js');
ok('privacy-safe diagnostics stay below 5 KB gzip and avoid persistent IDs or form-value collection',zlib.gzipSync(fs.readFileSync(path.join(ROOT,'assets/js/visitor-insights.js')),{level:9}).length<5*1024&&!/FormData|userId|fingerprint|localStorage/i.test(insights)&&/sessionStorage/.test(insights)&&/TAUX/.test(insights));
ok('journey diagnostics record only broad CTA, form and abandonment categories',/form_start/.test(insights)&&/form_complete/.test(insights)&&/form_abandon/.test(insights)&&/mobile_dock/.test(insights)&&!/innerText|textContent/.test(insights));
ok('mobile CSS provides five visible actions and focus-safe bottom space',/grid-template-columns:repeat\(5,1fr\)/.test(css.toString())&&/scroll-padding-bottom:82px/.test(css.toString()));
ok('motion policy respects reduced-motion preference',/prefers-reduced-motion:reduce/.test(css.toString()));

// Execute the generated index and pure search/ranking core without browser dependencies.
const ctx={window:{},document:{getElementById:()=>null},console};
vm.createContext(ctx);
vm.runInContext(read('assets/js/search-index.js'),ctx);
vm.runInContext(read('assets/js/smart-search.js'),ctx);
const index=ctx.window.TA_SEARCH_INDEX||[];
const search=ctx.window.TA_SMART_SEARCH;
function top(query){return index.map(e=>({e,s:search.score(e,query)})).sort((a,b)=>b.s-a.s)[0]?.e?.u;}
ok('smart search indexes fifty-six static and three honest collection destinations',index.length===59&&index.some(x=>x.u==='/website-help')&&index.some(x=>x.u==='/classes')&&index.some(x=>x.u==='/story')&&index.some(x=>x.u==='/events')&&index.some(x=>x.u==='/gallery'));
ok('smart search gives a direct current-fee answer',/current new-intake charges/i.test(search.directAnswer('how much are the school charges').title)&&/₦8,500 per term/.test(search.directAnswer('how much are the school charges').text));
ok('smart search answers location questions',/opposite Morak Pure-Water Factory/i.test(search.directAnswer('whereabouts of the campus').text));
const uniform=index.find(x=>x.u==='/uniform');
ok('smart search tolerates a transposed spelling error',uniform&&search.score(uniform,'unifrom')>=16);
ok('word-family search relates payments to fees',top('how are payments made')==='/fees');
ok('word-family search relates enrolling to admissions',top('enrolling a new pupil')==='/admissions');
ok('meaning family relates school dress to uniform',top('school dress and shoes')==='/uniform');
ok('phrase family relates pick up service to transport',top('pick up service in my area')==='/transport');
ok('phrase family relates former students to alumni',top('former student history')==='/alumni');
ok('problem wording finds website help',top('a broken webpage is not working')==='/website-help');
ok('smart search explains secure school-issued portal access without inventing a public account',/school-issued account[\s\S]*linked children/i.test(search.directAnswer('how do I see report cards').text));
ok('search page explains meaning matching and in-tab privacy',/related meanings, similar words/.test(read('search.html'))&&/Search on this page/.test(read('search.html'))&&/stay in this browser tab/.test(read('search.html')));
vm.runInContext(read('assets/js/content-quality.js'),ctx);
const quality=ctx.window.TA_CONTENT_QUALITY||{};
ok('clarity report covers every public shell page',quality.pageCount===shellPages.length);
ok('clarity report finds no block over sixty-five words',quality.totals&&quality.totals.longBlocks===0);
ok('clarity report finds no vague link labels',quality.totals&&quality.totals.vagueLinks===0);
vm.runInContext(read('assets/js/experience-audit.js'),ctx);
vm.runInContext(read('assets/js/brand-assets.js'),ctx);
const experience=ctx.window.TA_EXPERIENCE_AUDIT||{},brandAssets=ctx.window.TA_BRAND_ASSETS||{};
ok('experience audit covers every public shell page',experience.totals&&experience.totals.pages===shellPages.length);
ok('every useful public page is reachable within two actions',experience.totals&&experience.totals.withinTwoClicks===shellPages.length-1&&experience.pages.filter(p=>p.page!=='404.html').every(p=>p.experience.clickDepth<=2));
ok('structural accessibility audit finds no missing alt, labels or image dimensions',experience.totals&&experience.totals.missingAlt===0&&experience.totals.missingLabels===0&&experience.totals.unsizedImages===0);
ok('owner brand registry stays fail-closed for unverified images and profiles',brandAssets.readiness&&brandAssets.readiness.verifiedImages===0&&brandAssets.readiness.verifiedProfiles===0&&read('assets/data/brand-assets.json').includes('awaiting-owner'));
ok('owner-directed familiar crest is restored throughout public navigation',brandAssets.readiness&&brandAssets.readiness.verifiedLogo===true&&shellPages.every(x=>read(x).includes('assets/img/logo.jpg'))&&/Owner-directed restoration/.test(read('assets/data/brand-assets.json')));
ok('structured data uses the owner-restored crest and omits unverified social profiles',/"logo"\s*:\s*"[^"]*logo\.jpg/.test(read('index.html'))&&!/"sameAs"\s*:/.test(read('index.html')));
ok('shared form layer supplies visible errors and invalid-state focus support',/initAccessibleForms/.test(read('assets/js/public-shell.js'))&&/aria-invalid/.test(read('assets/js/public-shell.js'))&&/field-error/.test(read('assets/css/ux.css')));
ok('homepage and shared routes use consistent application and visit actions',/Start an Application/.test(read('index.html'))&&/Request a School Visit/.test(read('index.html'))&&/Request a School Visit/.test(read('about.html')));
const helpPage=read('website-help.html');
ok('visitor problem report is voluntary, category-only and uses the trackable Request Centre',/Continue to the Request Centre/.test(helpPage)&&/type=website_problem/.test(helpPage)&&/No report is sent automatically/.test(helpPage)&&/treasureacademy\.requestPrefill/.test(helpPage)&&/requestType:\"website_problem\"/.test(helpPage)&&!/<textarea/i.test(helpPage)&&!/problemDetail/.test(helpPage));
const developer=read('developer.html');
const retiredOperations=read('developer-operations.html');
ok('developer operations are consolidated behind the capability-scoped console',
  /developer-console\.js/.test(developer)&&/Protected developer operations/.test(developer)&&
  ['#otp','#information','#admissions','#search','#quality','#system','#release'].every(id=>developer.includes(`href="${id}"`))&&
  /developer\.html#overview/.test(retiredOperations)&&!/developer-experience\.js/.test(retiredOperations));

console.log(`\nVISITOR UX: ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);

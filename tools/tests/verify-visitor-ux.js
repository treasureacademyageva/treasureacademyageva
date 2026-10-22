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

ok('homepage answers identity with school, levels and location',/Treasure Academy, Ageva/.test(read('index.html'))&&/Creche, Nursery and Primary/.test(read('index.html'))&&/Ageva, Okene/.test(read('index.html')));
ok('homepage exposes a real search field and five top tasks above later sections',/class="home-finder"/.test(read('index.html'))&&['fees.html','academics.html','calendar.html','uniform.html','contact.html'].every(x=>read('index.html').includes(x)));
ok('visitor sitemap groups admissions, learning, families, school, community and help',shellPages.includes('explore.html')&&['id="joining"','id="learning"','id="families"','id="school"','id="community"','id="help"'].every(x=>read('explore.html').includes(x)));
ok('all public shell pages use one bundled stylesheet',shellPages.every(x=>{const refs=[...read(x).matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)/g)].map(m=>m[1]);return refs.length===1&&refs[0].includes('/assets/css/site.css');}));
ok('artificial blocking loader is absent everywhere',shellPages.every(x=>!read(x).includes('siteLoader')));
ok('large legacy public script is not referenced',shellPages.every(x=>!read(x).includes('assets/js/site.js')));
ok('privacy-safe visitor diagnostics are available on every public page',shellPages.every(x=>read(x).includes('assets/js/visitor-insights.js')));
ok('homepage and explore keep raw search words out of URLs',/data-private-search/.test(read('index.html'))&&/data-private-search/.test(read('explore.html'))&&!/<input[^>]+name="q"[^>]+homeQuery/.test(read('index.html'))&&!/<input[^>]+name="q"[^>]+exploreQuery/.test(read('explore.html')));
ok('mobile quick navigation is present in one consistent order',shellPages.every(x=>{const h=read(x),m=h.match(/<nav class="mobile-dock"[\s\S]*?<\/nav>/);return m&&['Home','Admissions','Explore','Search','Contact'].every((label,i,a)=>i===0||m[0].indexOf(label)>m[0].indexOf(a[i-1]));}));
ok('secondary pages expose visible location and early actions',shellPages.filter(x=>!['index.html','search.html','explore.html','404.html'].includes(x)).every(x=>/class="route-bar"/.test(read(x))&&/class="route-actions"/.test(read(x))));
ok('universal footer provides popular, support, problem-report and verified-contact routes',shellPages.every(x=>/class="universal-footer"/.test(read(x))&&/Find it fast/.test(read(x))&&/Verified contact/.test(read(x))&&/website-help\.html/.test(read(x))));
ok('responsive image variants are referenced by width',/hero-school-640\.webp 640w/.test(read('index.html'))&&/school-flyer-640\.webp 640w/.test(read('fees.html')));
ok('shop uses small WebP sources without invalid nested picture elements',/shop-uniform-560\.webp/.test(read('shop.html'))&&!/<picture>(?:(?!<\/picture>)[\s\S])*<picture>/.test(read('shop.html')));
const css=fs.readFileSync(path.join(ROOT,'assets/css/site.css'));
ok('single stylesheet stays below 50 KB gzip',zlib.gzipSync(css,{level:9}).length<50*1024);
ok('public shell stays below 5 KB gzip',zlib.gzipSync(fs.readFileSync(path.join(ROOT,'assets/js/public-shell.js')),{level:9}).length<5*1024);
ok('privacy-safe diagnostics stay below 5 KB gzip and avoid persistent IDs or form-value collection',zlib.gzipSync(fs.readFileSync(path.join(ROOT,'assets/js/visitor-insights.js')),{level:9}).length<5*1024&&!/FormData|userId|fingerprint/i.test(read('assets/js/visitor-insights.js'))&&/sessionStorage/.test(read('assets/js/visitor-insights.js')));
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
ok('smart search indexes at least fifty-four public destinations',index.length>=54&&index.some(x=>x.u==='website-help.html'));
ok('smart search gives a direct safe-fee answer',/current written fee schedule/i.test(search.directAnswer('how much are the school charges').title));
ok('smart search answers location questions',/opposite Morak Pure-Water Factory/i.test(search.directAnswer('whereabouts of the campus').text));
const uniform=index.find(x=>x.u==='uniform.html');
ok('smart search tolerates a transposed spelling error',uniform&&search.score(uniform,'unifrom')>=16);
ok('word-family search relates payments to fees',top('how are payments made')==='fees.html');
ok('word-family search relates enrolling to admissions',top('enrolling a new pupil')==='admissions.html');
ok('meaning family relates school dress to uniform',top('school dress and shoes')==='uniform.html');
ok('phrase family relates pick up service to transport',top('pick up service in my area')==='transport.html');
ok('phrase family relates former students to alumni',top('former student history')==='alumni.html');
ok('problem wording finds website help',top('a broken webpage is not working')==='website-help.html');
ok('smart search explains the retired portal instead of inventing access',/browser-only portal is retired/i.test(search.directAnswer('how do I see report cards').text));
ok('search page explains meaning matching and on-device privacy',/related meanings, word families/.test(read('search.html'))&&/Private on-device search/.test(read('search.html')));
vm.runInContext(read('assets/js/content-quality.js'),ctx);
const quality=ctx.window.TA_CONTENT_QUALITY||{};
ok('clarity report covers every public shell page',quality.pageCount===shellPages.length);
ok('clarity report finds no block over sixty-five words',quality.totals&&quality.totals.longBlocks===0);
ok('clarity report finds no vague link labels',quality.totals&&quality.totals.vagueLinks===0);
const helpPage=read('website-help.html');
ok('visitor problem report is voluntary, category-only and opens verified WhatsApp',/Review Report in WhatsApp/.test(helpPage)&&/wa\.me\/2349063932487/.test(helpPage)&&/No report is sent automatically/.test(helpPage)&&!/<textarea/i.test(helpPage)&&!/problemDetail/.test(helpPage));
ok('developer operations provides health, search, clarity and report tools',['runHealth','labQuery','clarityCards','reportCode'].every(id=>read('developer-operations.html').includes(`id="${id}"`)));

console.log(`\nVISITOR UX: ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);

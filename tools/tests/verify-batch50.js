// verify-batch50.js — UI/UX simplification specification, 28 September 2026.
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {JSDOM}=require('jsdom');
const SITE=path.resolve(__dirname,'..','..');
const read=f=>fs.readFileSync(path.join(SITE,f),'utf8');
const index=read('index.html'),about=read('about.html');
const main=read('assets/css/main.css'),corp=read('assets/css/corporate.css');
const extra=read('assets/css/extra.css'),glass=read('assets/css/glass.css'),motion=read('assets/css/motion.css');
const css=[main,corp,extra,glass,motion].join('\n');
const site=read('assets/js/site.js'),auth=read('assets/js/auth-ui.js');
let pass=0,fail=0;
function ok(name,cond,extra=''){if(cond){pass++;console.log('ok -',name);}else{fail++;console.log('FAIL -',name,extra);}}
function loadPage(page){
  const html=read(page),dom=new JSDOM(html,{url:'http://localhost/'+page,pretendToBeVisual:true});
  const w=dom.window,errors=[];
  w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){},removeListener(){}});
  w.IntersectionObserver=function(){return{observe(){},unobserve(){},disconnect(){}}};
  w.requestAnimationFrame=()=>0;w.scrollTo=()=>{};w.open=()=>{};w.print=()=>{};
  w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},createLinearGradient(){return{addColorStop(){}}},beginPath(){},arc(){},stroke(){},fill(){}});
  w.addEventListener('error',e=>errors.push(String(e.message||e.error||'')));
  vm.createContext(w);
  vm.runInContext(read('assets/js/store.js')+'\n;window.__DB=DB;',w);
  const inline=[...w.document.querySelectorAll('script:not([src]):not([type="application/ld+json"])')].map(x=>x.textContent).join('\n;');
  vm.runInContext(site+'\n;'+inline,w);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded',{bubbles:true}));
  return {w,errors:errors.filter(x=>!/navigation|Not implemented/i.test(x))};
}

/* 1 — tokens + flat header */
for(const token of ['--green:#0E5A2E','--gold:#C9A227','--paper:#FFFFFF','--cream:#F6F1E3','--ink:#203040','--danger:#B31E35','--r-sm:8px','--r-md:12px','--r-lg:16px','--r-pill:999px','--sh-1:','--sh-2:','--sh-3:','--z-nav:40','--z-toast:70','--t-fast:150ms ease']) ok('token '+token,main.includes(token));
const publicHeaders=fs.readdirSync(SITE).filter(f=>f.endsWith('.html')&&read(f).includes('class="navbar"'));
ok('35 public pages use the flat header',publicHeaders.length===35,String(publicHeaders.length));
ok('no stacked header markup survives',publicHeaders.every(f=>!/(hd-stack|hd-back|hd-front|hd-cutout)/.test(read(f))));
ok('seven familiar nav routes are static fallbacks',publicHeaders.every(f=>['Home','About','Admissions','Academics','Fees','News &amp; Events','Contact'].every(x=>read(f).includes('>'+x+'<'))));
ok('no public hamburger is mounted',!site.includes('NAV_BURGER')&&!auth.includes('mountBurger();\n    interceptLoginLinks'));
ok('header actions are fixed 44px with a real gap',/\.icon-action,\.theme-btn\{[^}]*width:44px;height:44px/.test(corp)&&/\.nav-actions\{[^}]*gap:10px/.test(corp));
ok('tap targets do not move on hover',corp.includes('.theme-btn:hover,.theme-btn:hover svg,.btn:hover,.btn:active{transform:none}'));

/* 2–5 — button/badge roles and measured consistency */
ok('legacy public buttons resolve to three roles',corp.includes('.btn-primary')&&corp.includes('.btn-secondary')&&corp.includes('.btn-ghost')&&corp.includes('.btn-sky')&&corp.includes('background:transparent;border:1.5px solid var(--green)'));
ok('badges resolve to neutral or gold',corp.includes('Two badge roles')&&corp.includes('.badge-accent')&&corp.includes('background:var(--gold-soft)!important'));
const blocks=new JSDOM(index).window.document.querySelector('main#main');
const sections=[...blocks.children].filter(x=>x.matches('header,section')).map(x=>x.id);
ok('homepage has exactly eight sections',JSON.stringify(sections)===JSON.stringify(['home','aboutPrev','programs','why','news','gallery','testimonials','finalCta']),sections.join(','));
ok('homepage has eight CTA links',blocks.querySelectorAll('.btn').length===8,String(blocks.querySelectorAll('.btn').length));
ok('programs are three cards and why-us is three cards',blocks.querySelectorAll('#programs .prog').length===3&&blocks.querySelectorAll('#why .feat').length===3);
ok('gallery is one row of four WebP-first photos',blocks.querySelectorAll('#gallery .gal').length===4&&blocks.querySelectorAll('#gallery source[type="image/webp"]').length===4);
ok('headmistress quote merged into About preview',!!blocks.querySelector('#aboutPrev .principal-card'));
ok('next event merged into News',!!blocks.querySelector('#news #calCount'));
ok('weekly honours moved to About',about.includes('id="aboutHonours"')&&about.includes('db.starsOfWeek'));
ok('removed blocks are absent from homepage',!/(id="(?:promotions|starsWeek|videos|spotlight)"|id="weekStrip")/.test(index));
const hex=new Set((css.match(/#[0-9a-f]{3,6}\b/ig)||[]).map(x=>x.toUpperCase()));
ok('palette stays reduced; the explicit Apply endpoint is the sole added hex',hex.size<=17&&css.includes('#D9B44A'),String(hex.size));
ok('gradients reduced below ten',(css.match(/(?:linear|radial|conic)-gradient\(/g)||[]).length<10);
ok('only four non-zero radius tokens are used',![...css.matchAll(/border-radius\s*:\s*([^;}]+)/g)].some(m=>!/^var\(--r-(?:sm|md|lg|pill)\)$|^0$/.test(m[1].trim())));
ok('only three shadow tokens are used',![...css.matchAll(/box-shadow\s*:\s*([^;}]+)/g)].some(m=>!/^var\(--sh-[123]\)$|^none(?:!important)?$/.test(m[1].trim())));
ok('numeric font sizes use the named type scale',![...css.matchAll(/font-size\s*:\s*([^;}]+)/g)].some(m=>!/^(?:var\(--fs-(?:xs|sm|base|md|lg|xl|2xl)\)|0|inherit)$/.test(m[1].trim())));
ok('only Clash Display and General Sans are declared',!/(\bSora\b|\bInter\b|Spline Sans Mono)/.test(css)&&/font-family:"Clash Display"/.test(css)&&/font-family:"General Sans"/.test(css));

/* 6–9 — motion, icons, dark mode and copy */
const keys=[...new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m=>m[1]))];
ok('motion diet has no more than eight keyframes',keys.length<=8,keys.join(','));
ok('decorative night canvas removed',!/(starCanvas|firefl|flies=)/i.test(site+css));
ok('ripple, tilt and stagger JS removed',!/(fx-ripple|tilt cards|staggered entrances|pointerdown.*\.btn)/s.test(site));
ok('marquee is the only non-chat content loop',corp.includes('.ticker-inner{')&&corp.includes('animation:tick')&&corp.includes('animation-duration:34s'));
ok('public feature icons use the SVG sprite',index.includes('icons.svg#ta-cap')&&index.includes('icons.svg#ta-shield')&&about.includes('icons.svg#ta-star'));
ok('homepage contains no pictographic emoji',!/[\u{1F300}-\u{1FAFF}]/u.test(index));
ok('hardcoded white backgrounds are gone',!/(?:background|background-color)\s*:\s*#(?:fff|ffffff)\b/i.test(css+index));
ok('first visit follows OS theme',site.includes('prefers-color-scheme: dark')&&!site.includes('new Date().getHours()'));
ok('theme is selected before paint on all versioned pages',fs.readdirSync(SITE).filter(f=>f.endsWith('.html')&&read(f).includes('id="siteLoader"')).every(f=>read(f).includes('assets/js/theme-init.js?v=20260930-ui54')));
ok('copy says News & Events, never News/Event',!/(News\/Event)(?!s)/.test(index+site+auth));
ok('copy says resumes on Monday',!/(resumes back on Monday)/i.test(index+site)&&(index+site).includes('resumes on Monday'));
ok('ticker is lost-and-found only',/function renderTicker\(\)/.test(site)&&!site.slice(site.indexOf('function renderTicker()'),site.indexOf('function renderBday()')).includes('newsEvents'));

/* Protected ground rules */
ok('SEO canonical and School JSON-LD remain',index.includes('https://www.treasureacademyageva.com/')&&index.includes('"@type": "School"'));
ok('school phone and RC remain exact',index.includes('+234 814 194 3478')&&index.includes('RC 9634403')&&site.includes('RC 9634403'));
ok('no Ministry approval number invented',!/(Ministry (?:approval|registration) (?:no|number)\.?\s*[:#]?\s*[A-Z0-9/-]+)/i.test(index+about));
ok('portal and chatbot assets remain wired',index.includes('chat-core.js?v=20260930-ui54')&&index.includes('auth-ui.js?v=20260930-ui54')&&fs.existsSync(path.join(SITE,'portal/pupil.html')));
ok('pupil compatibility redirect remains',read('vercel.json').includes('"source": "/pupil.html"')&&read('vercel.json').includes('"destination": "/portal/pupil.html"'));
const runtime=loadPage('index.html');
ok('redesigned homepage boots without errors',runtime.errors.length===0,runtime.errors.join(' | ').slice(0,180));
ok('runtime header has search, theme and Apply without burger',!!runtime.w.document.getElementById('searchBtn')&&!!runtime.w.document.querySelector('.theme-btn')&&!!runtime.w.document.querySelector('.nav-apply')&&!runtime.w.document.getElementById('taBurger'));
runtime.w.close();

console.log(`\n==== BATCH50: ${pass} passed, ${fail} failed ====`);
process.exitCode=fail?1:0;

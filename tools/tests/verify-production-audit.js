#!/usr/bin/env node
/* Regression gates for the privacy-safe public brochure release. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'../..');
let pass=0,fail=0;
function ok(name,value){if(value){pass++;console.log('ok - '+name);}else{fail++;console.error('FAIL - '+name);}}
function read(p){return fs.readFileSync(path.join(ROOT,p),'utf8');}

// Every executable inline script must parse. JSON-LD and encrypted JSON are data.
const html=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()&&['node_modules','.git','model','docs','tools','cms','db'].includes(e.name))continue;if(e.isDirectory())walk(p);else if(e.name.endsWith('.html'))html.push(p);}}
walk(ROOT);
let parsed=0;
for(const file of html){const raw=fs.readFileSync(file,'utf8');const rx=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;let m;while((m=rx.exec(raw))){if(/\bsrc\s*=/.test(m[1])||/type\s*=\s*["'](?:application\/ld\+json|application\/json)["']/.test(m[1]))continue;try{new vm.Script(m[2],{filename:path.relative(ROOT,file)});parsed++;}catch(e){console.error(e.message);fail++;}}}
ok('inline executable scripts parse',fail===0&&parsed>0);

// Execute the public store with an intentionally dirty old browser profile.
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const sandbox={localStorage,console,Date,Math,JSON,setTimeout,clearTimeout,URL,Intl};sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
const store=read('assets/js/store.js');
vm.runInContext(store+`\n;(()=>{const dirty=seedDB();dirty.admins=[{id:'HEAD001',password:'1234'}];dirty.pupils=[{name:'Child',phone:'08000000000'}];dirty.results=[{score:100}];dirty.registrations=[{payment:{receipt:'X'}}];dirty.graduates=[{examNo:'PRIVATE'}];dirty.testimonials=[{name:'Demo'}];dirty.supportPledges=[{name:'Demo'}];dirty.newsEvents=[{title:'old'}];dirty.school.fees={Primary1:999};dirty.school.phone='00000000000';dirty.school.headName='Fabricated Person';dirty.whatsapp=[{phone:'00000000000'}];dirty.staffWall=[{name:'Fabricated Teacher'}];dirty.formerTeachers=[{name:'Fabricated Former Teacher'}];dirty.transportRoutes=[{route:'fake'}];dirty.uniform=[{name:'fake'}];localStorage.setItem(DB_KEY,JSON.stringify(dirty));globalThis.__scrubbed=DB.load();globalThis.__fresh=seedDB();})();`,sandbox);
const d=sandbox.__scrubbed,f=sandbox.__fresh;
ok('accounts and children scrubbed',d.admins.length===0&&d.pupils.length===0);
ok('results, applications and receipts scrubbed',d.results.length===0&&d.registrations.length===0&&d.applications.length===0);
ok('graduate profiles and endorsements scrubbed',d.graduates.length===0&&d.testimonials.length===0&&d.supportPledges.length===0);
ok('unverified fees, routes and uniform data scrubbed',Object.keys(d.school.fees).length===0&&d.transportRoutes.length===0&&d.uniform.length===0);
ok('old staff and contact details scrubbed',d.staffWall.length===0&&d.formerTeachers.length===0&&d.school.headName==='Mrs. Salihu Nanahawa'&&d.whatsapp.length===1&&d.whatsapp[0].phone==='2349063932487');
ok('published news resets to reviewed public archive',d.newsEvents.length===9&&d.newsEvents[0].link==='news/2026-2027-admissions-open.html');
ok('fresh seed has no authentication records',f.admins.length===0&&f.teachers.length===0&&f.pupils.length===0);
ok('retired browser authentication code absent',!store.includes('const Auth ='));
ok('public default bank details are empty',f.school.bank.name===''&&f.school.bank.number===''&&f.school.bank.holder==='');

const site=read('assets/js/site.js'),safe=read('assets/js/safe-actions.js'),css=read('assets/css/corporate.css');
ok('chatbot and live timetable are not initialised',!site.includes('TAChatUI.init')&&!site.includes('ClockWidget.init'));
ok('mobile navigation does not expose a hamburger',css.includes('.menu-toggle{display:none!important}'));
ok('verified operational fallback is the owner WhatsApp',safe.includes('2349063932487'));
const insights=read('assets/js/visitor-insights.js');
ok('anonymous insights are first-party, preference-gated and do not capture form data',insights.includes('/_vercel/speed-insights/script.js')&&insights.includes('navigator.doNotTrack')&&insights.includes('navigator.globalPrivacyControl')&&!/FormData|fingerprint/i.test(insights));
ok('CMS strategy and fail-closed starter exist',fs.existsSync(path.join(ROOT,'docs/CMS-SEO-AEO-STRATEGY-2026.md'))&&read('cms/wordpress-migration/treasure-academy-core.php').includes('taa_fail_closed_publication'));
ok('internal directories excluded from Vercel', ['docs/','db/','tools/','cms/'].every(x=>read('.vercelignore').split(/\r?\n/).includes(x)));

console.log(`\nPRODUCTION AUDIT: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

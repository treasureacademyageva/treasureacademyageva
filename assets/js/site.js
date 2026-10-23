/* Treasure Academy shared public-site presentation and accessibility helpers. */
const Site = { page: document.body.dataset.page || "home" };

/* ---------------- THEME (day/night) ---------------- */
const Theme = {
  init(){
    const ICON_MOON='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>',ICON_SUN='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19"/></svg>';
    document.querySelectorAll(".navbar .container").forEach(c=>{ if(!c.querySelector(".theme-btn")){ const d=document.createElement("div"); d.className="nav-cta-row"; /* theme switch lives only on major pages (home + portal dashboards + login has its own) */
    const pg = document.body.dataset.page || "";
    if(pg==="home"){ d.innerHTML='<button class="theme-btn" title="Switch to night">'+ICON_MOON+'</button>'; } c.appendChild(d); } });
    /* mobile nav: two rows, all links visible — no hamburger (2026-09-16) */

    /* Follow the visitor's OS on first visit; an explicit choice always wins. */
    const autoDark=()=>{ try{ return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }catch(e){ return "light"; } };
    const storedOv=localStorage.getItem("treasure_theme");
    const t = storedOv || autoDark();
    document.documentElement.dataset.theme = t;
    if(!storedOv&&window.matchMedia){
      try{ const mq=window.matchMedia("(prefers-color-scheme: dark)"); const follow=()=>{ if(!localStorage.getItem("treasure_theme")){ const next=mq.matches?"dark":"light"; document.documentElement.dataset.theme=next; setTC(next); } }; if(mq.addEventListener)mq.addEventListener("change",follow); }catch(e){}
    }
    const setTC=th=>{ let m=document.querySelector('meta[name="theme-color"]'); if(!m){ m=document.createElement("meta"); m.name="theme-color"; document.head.appendChild(m); } m.content=th==="dark"?"#101B28":"#0B7A37"; };
    setTC(t);
    document.querySelectorAll(".theme-btn").forEach(b=>{
      const paint=th=>{
        b.innerHTML = th==="light" ? ICON_MOON : ICON_SUN;
        b.title = th==="light" ? "Switch to night mode" : "Switch to daytime";
        b.setAttribute("aria-label",b.title);
      };
      paint(t);
      b.onclick = ()=>{
        const nt=(document.documentElement.dataset.theme||"light")==="light"?"dark":"light";
        document.documentElement.dataset.theme=nt; setTC(nt);
        localStorage.setItem("treasure_theme",nt); paint(nt);
        try{ U.toast(nt==="dark"?"Night mode on.":"Day mode on."); }catch(e){}
      };
    });
  }
};

const SEARCH_INDEX=[
 {t:"Home",u:"index.html",k:"home main start treasure academy ageva"},
 {t:"About Us",u:"about.html",k:"about story headmistress founder motto mission history"},
 {t:"Admissions",u:"admissions.html",k:"admissions apply enrol register form join track application requirements receipt verify payment check confirm authentic"},
 {t:"Request an Admission Form",u:"admission-form.html",k:"admission form safe verified office request"},
 {t:"Academics",u:"academics.html",k:"academics classes creche nursery primary curriculum subjects"},
 {t:"Contact Us",u:"contact.html",k:"contact phone call whatsapp address location map email message faq directions suggestion box idea vote"},
 {t:"News & Updates",u:"news.html",k:"news verified update admissions current"},
 {t:"Staff",u:"alumni.html#staff",k:"staff teachers names who teaches team alumni meet our staff"},
 {t:"E-Learning",u:"elearning.html",k:"elearning practice cbt common entrance primary 6 past questions"},
 {t:"School Supplies Guidance",u:"shop.html",k:"supplies books uniform price stock office"},
 {t:"PTA",u:"pta.html",k:"pta parents association meeting levy"},
 {t:"Staff & Graduate Privacy",u:"alumni.html",k:"staff teachers graduate privacy achievements"},
 {t:"Birthdays",u:"birthdays.html",k:"birthday staff celebrate wish song headmistress"},
 {t:"Calendar",u:"calendar.html",k:"calendar term dates resumption holiday events countdown"},
 {t:"Notice Board",u:"board.html",k:"notice board announcements news"},
 {t:"Homework Board",u:"homework.html",k:"homework assignment class study"},
 {t:"Lost & Found",u:"lost-found.html",k:"lost found missing item claim clothes"},
 {t:"Photo Day Archive",u:"photo-day.html",k:"photo day closed consent photography"},
 {t:"Uniform List",u:"uniform.html",k:"uniform price list clothes wear dress shop"},
 {t:"School Visit Guidance",u:"openday.html",k:"open day closed visit appointment tour"},
 {t:"Reading at Home",u:"reading.html",k:"reading books home guidance teacher"},
 {t:"Exam Timetable",u:"exams.html",k:"exam timetable test date papers revision"},
 {t:"Holiday Assignments",u:"holiday.html",k:"holiday assignment break work home"},
 {t:"Welcome Pack",u:"welcome.html",k:"welcome pack new parents guide steps start"},
 {t:"Transport",u:"transport.html",k:"transport bus route pickup dropoff fees driver"},
 {t:"Volunteer",u:"volunteer.html",k:"volunteer help event sign up parents support"},
 {t:"Careers",u:"careers.html",k:"careers jobs teach at treasure vacancy apply staff recruitment teacher work hiring"},
 {t:"School Fees",u:"fees.html",k:"fees school fees price per class pay bank transfer term charges print"},
 {t:"Anthem & Creed",u:"anthem.html",k:"anthem creed pledge song lyrics audio hymn school song"},
 {t:"Support Us",u:"support.html",k:"support donate pledge give project library fans thank you wall well-wisher"},
 {t:"Search",u:"search.html",k:"search find pages everything results lookup"},
 {t:"Secure Parent & Staff Portal",u:"portal/login.html",k:"portal login results payments parent teacher admin secure support"},
 {t:"Family Feedback",u:"testimonials.html",k:"private feedback consent headmistress"},
 {t:"Class Pages",u:"academics.html",k:"class page creche nursery primary learning"}
];
const Search={
 init(){
  if(!document.getElementById("mainNav"))return;
  const row=document.querySelector(".navbar .nav-cta-row"); if(!row)return;
  let b=document.getElementById("searchBtn");
  if(!b){
    b=document.createElement("a"); b.id="searchBtn"; b.className="icon-action"; b.href="search.html"; b.title="Search this website"; b.setAttribute("aria-label",b.title);
    b.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></svg>';
    row.insertBefore(b,row.firstChild);
  }
  b.onclick=e=>{e.preventDefault();this.open();};
  if(document.getElementById("searchVeil"))return;
  const v=document.createElement("div"); v.id="searchVeil"; v.className="search-veil";
  v.innerHTML='<div class="search-box"><label for="searchInput"><b>Search this website</b></label><div class="search-row"><input id="searchInput" type="search" placeholder="e.g. fees, transport or uniform" autocomplete="off"><button id="searchX" aria-label="Close search">×</button></div><div id="searchRes" class="search-res"></div></div>';
  document.body.appendChild(v);
  v.addEventListener("click",e=>{ if(e.target===v)this.close(); });
  document.getElementById("searchX").onclick=()=>this.close();
  document.addEventListener("keydown",e=>{ if(e.key==="Escape")this.close(); });
  document.getElementById("searchInput").addEventListener("input",e=>this.go(e.target.value));
  const sug=document.createElement("div"); sug.id="searchSug"; sug.className="search-sug"; document.querySelector(".search-box").appendChild(sug);
  document.getElementById("searchInput").addEventListener("input",e=>this.suggest(e.target.value));
  sug.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b)return; document.getElementById("searchInput").value=b.dataset.q; this.go(b.dataset.q); sug.innerHTML=""; });
  document.getElementById("searchRes").addEventListener("click",e=>{
    if(e.target.closest("#clearRec")){ try{localStorage.removeItem("treasure_recent_search");}catch(x){} this.go(""); return; }
    const a=e.target.closest("a"); if(!a)return;
    if(a.dataset.re){ e.preventDefault(); document.getElementById("searchInput").value=a.dataset.re; this.go(a.dataset.re); }
    else this.save(this._q);
  });
  document.getElementById("searchInput").addEventListener("keydown",e=>{
    const links=[...document.querySelectorAll("#searchRes a[href]")];
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault();
      let i=links.findIndex(a=>a.classList.contains("sel"));
      i=e.key==="ArrowDown"?(i+1)%Math.max(1,links.length):(i<=0?links.length-1:i-1);
      links.forEach(a=>a.classList.remove("sel")); if(links[i]){links[i].classList.add("sel"); if(links[i].scrollIntoView)links[i].scrollIntoView({block:"nearest"});} return; }
    if(e.key==="Enter"){ const f=document.querySelector("#searchRes a.sel")||document.querySelector("#searchRes a"); if(f)f.click(); }
  });
 },
 open(){ document.getElementById("searchVeil").classList.add("open"); const i=document.getElementById("searchInput"); i.value=""; this.go(""); setTimeout(()=>i.focus(),50); },
 close(){ const v=document.getElementById("searchVeil"); if(v)v.classList.remove("open"); },
 go(q){
  q=String(q||"").toLowerCase().trim(); this._q=q;
  const box=document.getElementById("searchRes");
  if(q.length<2){
    const rec=this.recent();
    box.innerHTML=(rec.length?'<p class="sub">Your recent searches <button class="link-btn" id="clearRec" style="font-size:.78rem">Clear</button></p>'+rec.map(r=>`<a href="#" data-re="${U.esc(r)}">${U.esc(r)} &#8594;</a>`).join(""):'')
     +'<p class="sub">Popular pages</p>'+SEARCH_INDEX.slice(0,6).map(p=>`<a href="${p.u}"><b>${U.esc(p.t)}</b></a>`).join("")
     +'<p class="sub" style="margin-top:8px"><a href="search.html" style="font-weight:800;color:var(--green)">Open the full search page \u2192</a></p>';
    return;
  }
  const stem=w=>w.length>4&&w.endsWith("ies")?w.slice(0,-3)+"y":w.length>4&&w.endsWith("es")?w.slice(0,-2):w.length>3&&w.endsWith("s")?w.slice(0,-1):w;
  const words=q.split(/\s+/).filter(w=>w.length>=3);
  const match=(text,qq)=>{ text=String(text||"").toLowerCase(); if(text.includes(qq))return true;
    return words.some(w=>text.includes(w)||text.includes(stem(w))); };
  const hl=text=>{ let e=U.esc(text); try{ const rx=new RegExp("("+q.split(/\s+/).map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")","ig"); e=e.replace(rx,"<mark>$1</mark>"); }catch(x){} return e; };
  const hits=SEARCH_INDEX.filter(p=>match(p.t+" "+p.k,q)).slice(0,8);
  let extra="";
  try{
    const db=DB.load(), today=U.todayStr();
    const news=(db.newsEvents||[]).filter(n=>(!n.publishAt||n.publishAt<=today)&&match(n.title+" "+(n.text||""),q)).slice(0,3);
    if(news.length)extra+='<p class="sub">News & events</p>'+news.map(n=>`<a href="${U.esc(n.link||'news.html')}">${hl(n.title)}</a>`).join("");
    const staff=(db.staffWall||db.teachers||[]).filter(t=>match((t.name||"")+" "+(t.class||"")+" "+((t.subjects||[]).join(" ")),q)).slice(0,3);
    if(staff.length)extra+='<p class="sub">Staff</p>'+staff.map(t=>`<a href="alumni.html#staff">${hl(t.name)} — ${U.esc(t.class||"")}</a>`).join("");
    const ex=(db.exams||[]).filter(x=>match(x.subject||"",q)).slice(0,2);
    if(ex.length)extra+='<p class="sub">Exams</p>'+ex.map(x=>`<a href="exams.html">${hl(x.subject)} — ${U.shortDate(x.date)}</a>`).join("");
    const shop=(db.shopItems||[]).concat(db.uniform||[]).filter(x=>match(x.name||"",q)).slice(0,2);
    if(shop.length)extra+='<p class="sub">Shop & uniform</p>'+shop.map(x=>`<a href="shop.html">${hl(x.name)} — ${U.naira(x.price)}</a>`).join("");
  }catch(e){}
  const total=hits.length+(extra?extra.split("<a ").length-1:0);
  box.innerHTML=`<p class="sub">${total} result${total===1?"":"s"}</p>`
   +(hits.map(p=>`<a href="${p.u}"><b>${hl(p.t)}</b><small>${U.esc(p.u.replace(".html","").replace("portal/","portal — "))}</small></a>`).join("")+extra
     ||'<div class="empty">Nothing found — try "fees", "bus" or "uniform".</div><p class="sub">Popular pages</p>'+SEARCH_INDEX.slice(0,6).map(p=>`<a href="${p.u}"><b>${U.esc(p.t)}</b></a>`).join(""));
 },
 recent(){ try{ return JSON.parse(localStorage.getItem("treasure_recent_search")||"[]"); }catch(e){ return []; } },
 suggest(q){
  const box=document.getElementById("searchSug"); if(!box)return;
  q=String(q||"").toLowerCase().trim();
  if(q.length<2){ box.innerHTML=""; return; }
  const terms={};
  SEARCH_INDEX.forEach(p=>{ (p.t+" "+p.k).toLowerCase().split(/\s+/).forEach(w=>{ if(w.startsWith(q)&&w.length>2)terms[w]=1; }); });
  try{ (DB.load().newsEvents||[]).forEach(n=>String(n.title||"").toLowerCase().split(/\s+/).forEach(w=>{ if(w.startsWith(q)&&w.length>2)terms[w]=1; })); }catch(e){}
  const list=Object.keys(terms).slice(0,5);
  box.innerHTML=list.map(w=>`<button data-q="${U.esc(w)}">${U.esc(w)}</button>`).join("");
 },
 save(q){
  q=String(q||"").trim(); if(q.length<2)return;
  try{ let r=this.recent().filter(x=>x.toLowerCase()!==q.toLowerCase()); r.unshift(q); localStorage.setItem("treasure_recent_search",JSON.stringify(r.slice(0,5))); }catch(e){}
 }
};
/* ---------------- NAV + FOOTER ---------------- */
/* One familiar, flat public navigation: brand left, six core links in the
   centre, and fixed-size actions at the right. Dedicated pages remain
   available through search and the footer without crowding the header. */
const NAV_ITEMS=[
  {id:"home",label:"Home",href:"index.html"},
  {id:"about",label:"About",href:"about.html"},
  {id:"admissions",label:"Admissions",href:"admissions.html"},
  {id:"academics",label:"Academics",href:"academics.html"},
  {id:"fees",label:"Fees",href:"fees.html"},
  {id:"news",label:"News & Events",href:"news.html"},
  {id:"contact",label:"Contact",href:"contact.html"}
];
function renderNav(current){
  const box=document.getElementById("mainNav");
  if(!box)return;
  box.innerHTML=NAV_ITEMS.map(n=>
    `<a class="nav-link${n.id===current?" on":""}" href="${n.href}" ${n.id===current?'aria-current="page"':""}>${n.label}</a>`
  ).join("");
}
function renderFooter(){
  const box=document.getElementById("siteFooter");
  if(!box)return;
  let school={...SCHOOL_DEFAULTS};
  try{school=DB.load().school||school;}catch(e){}
  const year=new Date().getFullYear();
  box.innerHTML=`<div class="site-footer"><div class="container">
    <div class="foot-main">
      <div class="foot-brand"><a class="logo" href="index.html"><span>${U.esc(school.name)}</span></a><p>Creche, Nursery and Primary education in Ageva, Okene. Caring teaching, disciplined routines and strong foundations.</p></div>
      <div class="foot-col foot-quick"><h2>Essential Links</h2><nav class="foot-quick-grid" aria-label="Essential links"><a href="about.html">About</a><a href="academics.html">Academics</a><a href="admissions.html">Admissions</a><a href="fees.html">Fees</a><a href="calendar.html">Calendar</a><a href="news.html">News</a><a href="safeguarding.html">Safeguarding</a><a href="privacy.html">Privacy</a></nav></div>
      <div class="foot-col foot-contact"><h2>Verified Contact</h2><p><a href="tel:+2348141943478">+234 814 194 3478</a><br><a href="https://wa.me/2349063932487">WhatsApp 09063932487</a><br><a href="mailto:${U.esc(school.email)}">${U.esc(school.email)}</a></p><p>${U.esc(school.address)}</p><a class="btn btn-white btn-sm" href="contact.html#visit">Visit &amp; Directions</a></div>
    </div></div>
    <div class="foot-bottom"><div class="container foot-center foot-bottom-row"><span>Treasure Academy Ageva Limited · RC 9634403</span><span>© ${year} ${U.esc(school.name)}. All Rights Reserved.</span><span id="textSizeBtns" title="Text size"><button type="button" data-fs="s" aria-label="Small text">S</button><button type="button" data-fs="m" aria-label="Normal text" class="on">A</button><button type="button" data-fs="l" aria-label="Large text">L</button></span></div></div>
  </div>`;
}
/* batch30: remember-able text size for weaker eyes */
(function(){
  try{
    const cur=localStorage.getItem("treasure_fontsize")||"m";
    if(cur!=="m")document.documentElement.dataset.fontsize=cur;
    document.addEventListener("click",e=>{
      const b=e.target&&e.target.closest&&e.target.closest("#textSizeBtns button"); if(!b)return;
      const fs=b.dataset.fs;
      if(fs==="m")delete document.documentElement.dataset.fontsize; else document.documentElement.dataset.fontsize=fs;
      try{localStorage.setItem("treasure_fontsize",fs);}catch(err){}
      document.querySelectorAll("#textSizeBtns button").forEach(x=>x.classList.toggle("on",x===b));
    });
    document.addEventListener("DOMContentLoaded",()=>{
      const on=document.querySelector('#textSizeBtns button[data-fs="'+cur+'"]'); if(on)on.classList.add("on");
      document.querySelectorAll("#textSizeBtns button").forEach(x=>x.classList.toggle("on",x.dataset.fs===cur));
    });
  }catch(e){}
})();
window.soonSocial=function(net){ U.toast("The school has not gotten "+net+" yet — check back soon!"); return false; };
/* batch30: social share card + app icon + browser chrome color on every page */
(function(){
  try{
    const d=document, inPortal=/portal\/(admin|teacher|pupil|login)\.html$/.test(location.pathname)||location.pathname.indexOf("/portal/")>=0;
    const pre=inPortal?"../":"";
    if(!d.querySelector('meta[property="og:title"]')){
      const mk=(tag,attrs)=>{ const e=d.createElement(tag); for(const k in attrs)e.setAttribute(k,attrs[k]); d.head.appendChild(e); };
      if(!d.querySelector(String.raw`meta[name="theme-color"]`)) mk("meta",{name:"theme-color",content:"#0B7A37"});
      mk("meta",{property:"og:title",content:"Treasure Academy, Ageva"});
      mk("meta",{property:"og:description",content:"Discipline, character and results — Creche to Primary 6 in Ageva, Okene, Kogi State."});
      mk("meta",{property:"og:image",content:pre+"assets/img/og-cover.png"});
      mk("meta",{name:"twitter:card",content:"summary_large_image"});
      const fav=d.querySelector('link[rel="icon"]');
      const icon=d.createElement("link"); icon.rel="icon"; icon.type="image/png"; icon.href=pre+"assets/img/icon-512.png";
      if(fav)fav.after(icon); else d.head.appendChild(icon);
      const apple=d.createElement("link"); apple.rel="apple-touch-icon"; apple.href=pre+"assets/img/icon-512.png"; d.head.appendChild(apple);
    }
  }catch(e){}
})();
function injectSchool(){
  let s = {...SCHOOL_DEFAULTS};
  try{ s = DB.load().school; }catch(e){}
  document.querySelectorAll("[data-school-name]").forEach(e=>e.textContent=s.name);
  document.querySelectorAll("[data-school-phone]").forEach(e=>{ e.textContent=s.phone; if(e.tagName==="A") e.href="tel:"+String(s.phone||"").replace(/\D/g,""); });
  document.querySelectorAll("[data-school-email]").forEach(e=>e.textContent=s.email);
  document.querySelectorAll("[data-school-address]").forEach(e=>e.textContent=s.address);
  document.querySelectorAll("[data-school-motto]").forEach(e=>e.textContent=s.motto);
  return s;
}

/* ---------------- SLIDERS (1 = static, many = sliding) ---------------- */
function initSliders(){
  document.querySelectorAll(".slider").forEach(sl=>{
    const track = sl.querySelector(".slider-track");
    if(!track) return;
    const slides = [...track.children];
    const dotsBox = sl.querySelector(".slider-dots");
    if(slides.length <= 1){ sl.classList.add("static"); return; }
    let i = 0, timer;
    slides.forEach((_,k)=>{ const d=document.createElement("button"); d.setAttribute("aria-label","slide "+(k+1)); d.onclick=()=>{go(k); restart();}; dotsBox.appendChild(d); });
    const dots=[...dotsBox.children];
    function go(k){ i=(k+slides.length)%slides.length; track.style.transform=`translateX(-${i*100}%)`; dots.forEach((d,j)=>d.classList.toggle("on",j===i)); }
    function restart(){ clearInterval(timer); timer=setInterval(()=>go(i+1), 5000); }
    const pv=sl.querySelector(".prev"), nx=sl.querySelector(".next");
    if(pv) pv.onclick=()=>{go(i-1); restart();};
    if(nx) nx.onclick=()=>{go(i+1); restart();};
    sl.addEventListener("mouseenter",()=>clearInterval(timer));
    sl.addEventListener("mouseleave",restart);
    /* finger + mouse swipe (no extra buttons needed) */
    let sx=null, mx=null, suppress=false;
    sl.addEventListener("touchstart",e=>{sx=e.touches[0].clientX;},{passive:true});
    sl.addEventListener("touchend",e=>{ if(sx===null)return; const dx=e.changedTouches[0].clientX-sx; sx=null; if(Math.abs(dx)>40){ go(i+(dx<0?1:-1)); restart(); } },{passive:true});
    sl.addEventListener("pointerdown",e=>{ if(e.pointerType==="mouse") mx=e.clientX; });
    sl.addEventListener("pointerup",e=>{ if(mx===null)return; const dx=e.clientX-mx; mx=null; if(Math.abs(dx)>50){ suppress=true; go(i+(dx<0?1:-1)); restart(); } });
    sl.addEventListener("click",e=>{ if(suppress){ e.preventDefault(); e.stopPropagation(); suppress=false; } },true);
    go(0); restart();
  });
}

/* ---------------- Back-to-top (widgets hide at footer) ---------------- */
function initTopBtn(){
  /* batch30: progress ring + available on every page (not only those calling initTopBtn) */
  if(document.querySelector('link[href*="corporate"]')&&!window.__topBtnBooted){ window.__topBtnBooted=1;
    addEventListener("scroll",()=>{ const d=document.documentElement; const max=d.scrollHeight-innerHeight;
      document.querySelectorAll("#topBtn").forEach(b=>{ if(max>0)b.style.setProperty("--prog",Math.min(100,Math.round(scrollY/max*100))); }); },{passive:true});
  }
  if(!document.querySelector('link[href*="corporate"]'))return;
  let b=document.getElementById("topBtn");
  if(!b){ b=document.createElement("button"); b.id="topBtn"; b.title="Back to top";
    b.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
    b.onclick=()=>window.scrollTo({top:0,behavior:"smooth"}); document.body.appendChild(b); }
  const onScroll=()=>{
    const f=document.getElementById("siteFooter");
    const atBottom=f?(f.getBoundingClientRect().top<innerHeight):((innerHeight+scrollY)>document.body.scrollHeight-120);
    b.classList.add("show"); /* owner: always visible, right side */
    document.body.classList.toggle("at-bottom",!!atBottom);
  };
  addEventListener("scroll",onScroll,{passive:true}); onScroll();
}
/* batch30: boot the back-to-top button everywhere automatically */
(function(){
  if(!document.querySelector('link[href*="corporate"]'))return;
  if(document.getElementById("topBtn"))return;
  if(/portal\/(admin|teacher|pupil)\.html$/.test(location.pathname))return;
  try{ bootSafe(()=>initTopBtn()); }catch(e){ initTopBtn(); }
})();

/* ---------------- Topbar scroll-collapse ---------------- */
function initTopbarCollapse(){
  if(document.body.classList.contains("portal-body"))return;
  const topbar=document.querySelector(".topbar"), navbar=document.querySelector(".navbar");
  if(!topbar||!navbar)return;
  let lastY=0, hidden=false, ticking=false;
  const measure=()=>document.documentElement.style.setProperty("--topbar-h",topbar.offsetHeight+"px");
  const setHidden=next=>{
    if(hidden===next)return;
    hidden=next;
    document.body.classList.toggle("topbar-collapsed",hidden);
    topbar.inert=hidden;
    topbar.setAttribute("aria-hidden",hidden?"true":"false");
  };
  const update=()=>{
    const y=Math.max(0,window.scrollY||0);
    if(y<=80)setHidden(false);
    else if(y>lastY)setHidden(true);
    else if(y<lastY)setHidden(false);
    lastY=y;ticking=false;
  };
  addEventListener("scroll",()=>{
    if(!ticking){ticking=true;requestAnimationFrame(update);}
  },{passive:true});
  addEventListener("resize",measure,{passive:true});
  measure();update();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initTopbarCollapse);else initTopbarCollapse();

/* ---------------- Accessible mobile navigation drawer ---------------- */
function initMobileNav(){
  const toggle=document.getElementById("menuToggle"),drawer=document.getElementById("navDrawer"),veil=document.getElementById("navVeil");
  if(!toggle||!drawer||!veil)return;
  const mq=window.matchMedia("(max-width: 959px)");
  const focusable=()=>Array.from(drawer.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(el=>!el.hidden);
  const close=(returnFocus=true)=>{
    document.body.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-label","Open navigation menu");
    veil.hidden=true;if(mq.matches)drawer.setAttribute("aria-hidden","true");
    if(returnFocus)toggle.focus();
  };
  const open=()=>{
    if(!mq.matches)return;
    document.body.classList.add("nav-open");
    toggle.setAttribute("aria-expanded","true");toggle.setAttribute("aria-label","Close navigation menu");
    drawer.setAttribute("aria-hidden","false");veil.hidden=false;
    const list=focusable();if(list[0])list[0].focus();
  };
  toggle.addEventListener("click",()=>toggle.getAttribute("aria-expanded")==="true"?close():open());
  veil.addEventListener("click",()=>close());
  drawer.addEventListener("click",e=>{if(e.target.closest("a[href]")&&mq.matches)close(false);});
  document.addEventListener("keydown",e=>{
    if(!document.body.classList.contains("nav-open"))return;
    if(e.key==="Escape"){e.preventDefault();close();return;}
    if(e.key!=="Tab")return;
    const list=focusable();if(!list.length){e.preventDefault();toggle.focus();return;}
    const first=list[0],last=list[list.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  const sync=()=>{if(!mq.matches){close(false);drawer.removeAttribute("aria-hidden");}else if(!document.body.classList.contains("nav-open"))drawer.setAttribute("aria-hidden","true");};
  if(mq.addEventListener)mq.addEventListener("change",sync);else mq.addListener(sync);sync();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initMobileNav);else initMobileNav();

/* ---------------- Article tab-title reminder ---------------- */
function initTabTitleSwap(){
  const originalTitle=document.title;
  document.addEventListener("visibilitychange",()=>{
    document.title=document.hidden?"Come Back Soon | Treasure Academy":originalTitle;
  });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initTabTitleSwap);else initTabTitleSwap();

/* ---------------- Reveal on scroll ---------------- */
function initReveal(){
  const io = new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add("revealed"); io.unobserve(en.target);} }),{threshold:.1});
  document.querySelectorAll(".clip,.clip-up").forEach(el=>io.observe(el));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initReveal);else initReveal();
setTimeout(()=>{try{document.querySelectorAll(".clip,.clip-up").forEach(el=>el.classList.add("revealed"));}catch(e){}},2500);

/* ---------------- Typing labels (label text types itself) ---------------- */
function typeLabels(scope){
  (scope||document).querySelectorAll("label[data-tlabel]:not([data-typed])").forEach(lb=>{
    lb.dataset.typed="1";
    const full=lb.dataset.tlabel; let ci=0;
    lb.innerHTML='<span class="txt"></span><span class="caret"></span>';
    const txt=lb.querySelector(".txt");
    const tick=()=>{ ci++; txt.textContent=full.slice(0,ci);
      if(ci<full.length) setTimeout(tick, 34); else { const c=lb.querySelector(".caret"); if(c) c.remove(); } };
    setTimeout(tick, 250);
  });
}

/* ---------------- Draggable ---------------- */
function makeDraggable(el, handle){
  handle = handle || el;
  let sx, sy, ox, oy, dragging=false;
  handle.addEventListener("pointerdown", e=>{
    if(e.target.closest("button,input,a,canvas")) return;
    dragging=true; sx=e.clientX; sy=e.clientY;
    const r=el.getBoundingClientRect(); ox=r.left; oy=r.top;
    el.style.right="auto"; el.style.bottom="auto"; el.style.left=ox+"px"; el.style.top=oy+"px";
    try{el.setPointerCapture(e.pointerId);}catch(err){}
  });
  handle.addEventListener("pointermove", e=>{
    if(!dragging) return;
    el.style.left=Math.max(4,Math.min(innerWidth-el.offsetWidth-4, ox+e.clientX-sx))+"px";
    el.style.top=Math.max(4,Math.min(innerHeight-el.offsetHeight-4, oy+e.clientY-sy))+"px";
  });
  handle.addEventListener("pointerup", ()=>dragging=false);
}

/* Retired chatbot and live timetable widgets are intentionally absent. */

/* ---------------- TREASURE CAPTCHA ---------------- */
const Treasure = {
  makers: [
    ()=>{
      const words=[["A","Apple"],["B","Ball"],["C","Cat"],["D","Dog"],["E","Egg"],["F","Fish"]];
      const pick=[...words].sort(()=>Math.random()-.5).slice(0,3);
      const target=pick[Math.floor(Math.random()*3)];
      return {q:`Select the word that starts with the letter <b>${target[0]}</b>`, opts:pick.map(p=>({v:p[0],h:`<span style="font-size:1.15rem;font-weight:800">${p[1]}</span>`})), ans:target[0]};
    },
    ()=>{
      const L="ABCDEFGHIJ"; const i=Math.floor(Math.random()*7);
      const ans=L[i+2];
      const opts=[...new Set([ans,L[Math.floor(Math.random()*10)],L[Math.floor(Math.random()*10)]])].slice(0,3).sort(()=>Math.random()-.5);
      return {q:`Which letter comes after <b>${L[i]} ${L[i+1]}</b>?`, opts:opts.map(o=>({v:o,h:`<span style="font-size:1.7rem;font-weight:800">${o}</span>`})), ans};
    },
    ()=>{
      const L="ABCDEFGH"; const ans=L[Math.floor(Math.random()*8)];
      const opts=[...new Set([ans,L[Math.floor(Math.random()*8)],L[Math.floor(Math.random()*8)]])].slice(0,3).sort(()=>Math.random()-.5);
      return {q:`Select the letter <b style="font-size:1.7rem">${ans}</b>`, opts:opts.map(o=>({v:o,h:`<span style="font-size:1.7rem;font-weight:800">${o}</span>`})), ans};
    },
    ()=>{
      const n=2+Math.floor(Math.random()*4);
      const opts=[...new Set([String(n),String(n+1),String(Math.max(1,n-1))])].sort(()=>Math.random()-.5);
      return {q:`How many stars do you see?<br><span style="font-size:1.6rem;letter-spacing:3px;color:#D9A41F">`+"★".repeat(n)+`</span>`, opts:opts.map(o=>({v:o,h:`<span style="font-size:1.5rem;font-weight:800">${o}</span>`})), ans:String(n)};
    },
    ()=>{ /* tap ALL the school things */
      const good=["Book","Pencil","School Bag"], bad=["Fish","Cat","Ball"];
      const opts=[...good.map(g=>({v:g,good:1})),...bad.map(b=>({v:b,good:0}))].sort(()=>Math.random()-.5);
      return {q:`Tap <b>ALL</b> the school things (then press Verify)`, multi:true,
        opts:opts.map(o=>({v:o.v,h:`<span style="font-size:1rem;font-weight:800">${o.v}</span>`})), ans:good};
    },
    ()=>{ /* word -> first letter (letter-word match) */
      const pairs=[["A","Apple"],["B","Ball"],["C","Cat"],["D","Dog"],["E","Egg"],["F","Fish"],["G","Goat"],["H","Hen"]];
      const t=pairs[Math.floor(Math.random()*pairs.length)];
      const letters=[...new Set([t[0],pairs[Math.floor(Math.random()*8)][0],pairs[Math.floor(Math.random()*8)][0]])].slice(0,3).sort(()=>Math.random()-.5);
      return {q:`Match the word to its first letter: <b style="font-size:1.5rem">${t[1]}</b> starts with…`, opts:letters.map(o=>({v:o,h:`<span style="font-size:1.7rem;font-weight:800">${o}</span>`})), ans:t[0]};
    },
    ()=>{ /* education question bank */
      const bank=()=>{
        const r=Math.random();
        if(r<0.4){ const a=1+Math.floor(Math.random()*5),b=1+Math.floor(Math.random()*4);
          const ans=String(a+b);
          return {q:`Solve like a pupil: <b style="font-size:1.5rem">${a} + ${b} = ?</b>`,opts:[ans,String(a+b+1),String(Math.max(1,a+b-1))].sort(()=>Math.random()-.5).map(o=>({v:o,h:`<span style="font-size:1.5rem;font-weight:800">${o}</span>`})),ans}; }
        if(r<0.7){ const i=Math.floor(Math.random()*3), ans=["Tue","Wed","Thu","Fri"][i];
          const opts=[...new Set([ans,"Mon","Fri","Sun"])].slice(0,3).sort(()=>Math.random()-.5);
          return {q:`School days: which day comes after <b>${["Mon","Tue","Wed"][i]}</b>?`,opts:opts.map(o=>({v:o,h:`<span style="font-size:1.2rem;font-weight:800">${o}</span>`})),ans}; }
        const cls=["Creche","Nursery 1","Primary 3","Primary 6"], ans=cls[Math.floor(Math.random()*4)];
        const opts=[...new Set([ans,"University","Secondary School"])].slice(0,3).sort(()=>Math.random()-.5);
        return {q:`Which one is a class in <b>our school</b>?`,opts:opts.map(o=>({v:o,h:`<span style="font-size:1rem;font-weight:800">${o}</span>`})),ans};
      };
      return bank();
    }
  ],
  open(onPass){
    const old=document.getElementById("treasureModal"); if(old) old.remove();
    const c=this.makers[Math.floor(Math.random()*this.makers.length)]();
    const m=document.createElement("div");
    m.className="modal-bg show"; m.id="treasureModal";
    m.innerHTML=`<div class="modal" style="max-width:430px;text-align:center">
      <h2>Security Check</h2>
      <p style="color:var(--muted);font-size:.87rem">Please confirm you are human</p>
      <div id="humanStep1" style="margin:18px 0">
        <label style="display:flex;gap:12px;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:12px;padding:14px;cursor:pointer;font-weight:700">
          <input type="checkbox" id="humanBox" style="width:22px;height:22px;accent-color:#177A3F"> I'm not a robot
        </label>
        <button class="btn btn-mint btn-sm" id="humanGo" disabled style="margin-top:14px;opacity:.5">Continue</button>
      </div>
      <div id="humanStep2" style="display:none">
        <div class="notice" style="text-align:center;display:block;margin:16px 0"><b>${c.q}</b></div>
        <div style="display:flex;gap:10px;justify-content:center" id="treasureOpts">
          ${c.opts.map(o=>`<button class="icon-btn" style="padding:12px 20px;font-size:1rem" data-v="${o.v}">${o.h}</button>`).join("")}
        </div>
        <button class="link-btn" style="margin-top:14px" id="treasureNew">Try a different one</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    const box=m.querySelector("#humanBox"), go=m.querySelector("#humanGo");
    box.onchange=()=>{ go.disabled=!box.checked; go.style.opacity=box.checked?"1":".5"; };
    go.onclick=()=>{ m.querySelector("#humanStep1").style.display="none"; m.querySelector("#humanStep2").style.display=""; };
    if(c.multi){
      const picked=new Set();
      m.querySelector("#treasureOpts").insertAdjacentHTML("afterend",'<button class="btn btn-mint btn-sm" id="treasureVerify" style="margin-top:14px">Verify</button>');
      m.querySelectorAll("#treasureOpts button").forEach(b=>b.onclick=()=>{
        if(picked.has(b.dataset.v)){picked.delete(b.dataset.v);b.classList.remove("picked");b.style.outline="";}
        else{picked.add(b.dataset.v);b.classList.add("picked");b.style.outline="3px solid #177A3F";}
      });
      m.querySelector("#treasureVerify").onclick=()=>{
        const ok=c.ans.length===picked.size&&c.ans.every(v=>picked.has(v));
        if(ok){ m.remove(); U.toast("Verified. Thank you!"); onPass&&onPass(); }
        else U.toast("Not quite — tap ALL the school things, then Verify.");
      };
    } else m.querySelectorAll("#treasureOpts button").forEach(b=>b.onclick=()=>{
      if(b.dataset.v===c.ans){ m.remove(); U.toast("Verified. Thank you!"); onPass&&onPass(); }
      else{ b.classList.add("shake"); setTimeout(()=>b.classList.remove("shake"),500); U.toast("Not quite — try again."); }
    });
    m.querySelector("#treasureNew").onclick=()=>{ m.remove(); this.open(onPass); };
  }
};

/* ---------- week-at-a-glance strip (headmistress controlled) ---------- */
function renderWeekStrip(){
  const box=document.getElementById("weekStrip");
  if(!box||box.dataset.done)return; box.dataset.done=1;
  let db={}; try{ db=DB.load(); }catch(e){}
  const ws=db.weekStrip||{on:true};
  if(ws.on===false){ box.innerHTML=""; return; }
  const today=U.todayStr(), d7=new Date(Date.now()+7*864e5).toISOString().slice(0,10);
  const items=[];
  (db.calendar||[]).filter(c=>c.date>=today&&c.date<=d7).slice(0,2).forEach(c=>items.push({d:c.date,t:c.title,u:"calendar.html"}));
  (db.exams||[]).filter(x=>x.date&&x.date>=today&&x.date<=d7).slice(0,1).forEach(x=>items.push({d:x.date,t:"Exams: "+x.subject+" ("+x.time+")",u:"exams.html"}));
  (db.ptaMeetings||[]).filter(m=>m.date>=today&&m.date<=d7).slice(0,1).forEach(m=>items.push({d:m.date,t:"PTA: "+m.title,u:"pta.html"}));
  items.sort((a,b)=>a.d.localeCompare(b.d));
  box.innerHTML=`<div class="week-strip clip-up"><span class="sec-tag">This Week</span>
    <div class="week-items">${items.length?items.map(i=>`<a class="week-item" href="${i.u}"><b>${U.shortDate(i.d)}</b><span>${U.esc(i.t)}</span></a>`).join(""):'<span class="week-none">A calm week — no events scheduled.</span>'}</div>
    ${ws.note?`<p class="week-note">${U.esc(ws.note)}</p>`:""}</div>`;
}
/* ---------- offline support (service worker, works after launch too) ---------- */
function registerSW(){
  if(!("serviceWorker" in navigator))return;
  if(!/^https?:$/.test(location.protocol))return;
  const base=(document.body.dataset.assets||"assets/").replace(/assets\/$/,"");
  navigator.serviceWorker.register(base+"sw.js").catch(()=>{});
}
/* ---------- motto ribbon ---------- */
function renderMotto(){
  const nav=document.querySelector(".navbar");
  if(!nav||document.getElementById("mottoRibbon"))return;
  const s=(DB.load().school||{});
  nav.insertAdjacentHTML("afterend",`<div class="motto-ribbon" id="mottoRibbon"><span>\u201C${U.esc(s.motto||"Our God is able")}\u201D</span></div>`);
}
/* ---------- breaking-news ticker ---------- */
function renderTicker(){
  if(document.getElementById("newsTicker"))return;
  let db={}; try{ db=DB.load(); }catch(e){}
  const items=[];
  /* Keep the moving strip for time-sensitive lost property only. Admissions,
     events and routine notices already have calmer, dedicated destinations. */
  (db.lostfound||[]).filter(l=>!l.claimed).slice(0,4).forEach(l=>items.push("Lost & Found: "+l.item+" — found "+(l.date||"recently")+". Is it yours?"));
  if(!items.length)return;
  const anchor=document.getElementById("mottoRibbon")||document.querySelector(".navbar");
  if(!anchor)return;
  const html=items.map(x=>`<span>${U.esc(x)}</span>`).join('<span class="tick-sep">•</span>');
  /* One content run only: the older seamless implementation duplicated every
     announcement, making the admissions message visibly repeat twice. */
  anchor.insertAdjacentHTML("afterend",`<div class="ticker" id="newsTicker" role="marquee" aria-label="School announcements"><div class="ticker-inner"><span class="tick-content">${html}</span></div></div>`);
}
/* ---------- staff birthday bell (homepage) ---------- */
function renderBday(){
  const box=document.getElementById("bdayBell");
  if(!box||box.dataset.done)return; box.dataset.done=1;
  let db={}; try{ db=DB.load(); }catch(e){}
  const md=(d)=>String(d||"").slice(5);
  const today=U.todayStr().slice(5);
  const names=(db.teachers||[]).filter(t=>md(t.dob)===today).map(t=>t.name);
  if(db.school&&md(db.school.headDob)===today)names.unshift((db.school.headName||"Headmistress")+" (Headmistress)");
  if(!names.length)return;
  box.innerHTML=`<div class="bday-bell clip-up"><b>Happy Birthday!</b> Today we celebrate ${names.map(n=>`<b>${U.esc(n)}</b>`).join(" & ")} - with love from the whole Treasure Academy family. <a href="birthdays.html">Send a wish</a></div>`;
}
function renderBdayCount(){
  const box=document.getElementById("bdayCount");
  if(!box||box.dataset.done)return; box.dataset.done=1;
  let db={}; try{ db=DB.load(); }catch(e){}
  const list=[];
  (db.teachers||[]).forEach(t=>{ if(t.dob)list.push({name:t.name,dob:t.dob,role:"Staff"}); });
  (db.pupils||[]).forEach(p=>{ if(p.dob)list.push({name:p.name,dob:p.dob,role:"Pupil"+(p.class?" - "+p.class:"")}); });
  if(db.school&&db.school.headDob)list.push({name:db.school.headName||"Headmistress",dob:db.school.headDob,role:"Headmistress"});
  if(!list.length)return;
  const now=new Date(U.todayStr()+"T12:00:00");
  let best=null,bestDd=366;
  list.forEach(p=>{
    const md=String(p.dob||"").slice(5); if(md.length!==5)return;
    let nx=new Date(now.getFullYear()+"-"+md+"T12:00:00");
    let dd=Math.round((nx-now)/864e5);
    if(dd<0){ nx=new Date((now.getFullYear()+1)+"-"+md+"T12:00:00"); dd=Math.round((nx-now)/864e5); }
    if(dd===0)return;
    if(dd<bestDd){bestDd=dd;best=p;}
  });
  if(!best)return;
  const when=bestDd===1?"Tomorrow!":("in "+bestDd+" days");
  box.innerHTML=`<a class="count-bar" href="birthdays.html"><span class="count-num">${bestDd}</span><span>${U.icon("gift",18)} Next birthday: <b>${U.esc(best.name)}</b> (${U.esc(best.role)}) — ${when}</span><span style="margin-left:auto">→</span></a>`;
}
/* ---------- emergency banner (headmistress one-switch alert) ---------- */
function renderEmergency(){
  if(document.getElementById("emgBanner"))return;
  let e={}; try{ e=DB.load().school.emergency||{}; }catch(err){}
  /* batch25: optional auto show/hide window — blank dates mean always */
  const today=U.todayStr();
  if(!e.on||!e.text)return;
  if(e.start&&today<e.start)return;
  if(e.end&&today>e.end)return;
  const top=document.body.firstElementChild;
  const d=document.createElement("div");
  d.className="emg-banner"; d.id="emgBanner";
  d.innerHTML=`<span class="emg-dot"></span><span>${U.esc(e.text)}</span>`;
  document.body.insertBefore(d,top);
}

/* ---------- WORD OF THE WEEK (batch32) ---------- */
const WOW_WORDS=[
 ["Diligent","working carefully and never giving up on a task","Adaeze is diligent \u2014 her handwriting is always neat."],
 ["Honest","always telling the truth, even when it is hard","Honest Musa returned the extra change to Mama."],
 ["Punctual","arriving at the right time, never late","Punctual pupils are in class before the bell."],
 ["Obedient","doing what elders ask with a good heart","Obedient Kelechi packed the books at once."],
 ["Curious","wanting to learn and understand new things","Curious Fatima asked how rain falls."],
 ["Grateful","showing thanks for kindness received","Grateful Amina thanked the donor with a big smile."],
 ["Patient","waiting calmly without complaining","Patient pupils wait their turn to answer."],
 ["Tidy","keeping yourself and your things neat","Tidy Ibrahim's desk is always clean."],
 ["Courageous","facing hard things without fear","Courageous Blessing read before the whole school."],
 ["Respectful","treating others with honour and kind words","Respectful pupils greet their elders each morning."],
 ["Persistent","trying again and again until you finish","Persistent Yusuf solved the sum on his fifth try."],
 ["Generous","happy to share what you have","Generous Zainab shared her crayons with the class."],
 ["Attentive","listening with both ears and both eyes","Attentive pupils never miss the teacher's words."],
 ["Polite","using gentle words like please and thank you","Polite Eche said thank you to the cook."],
 ["Responsible","doing your duty without being reminded","Responsible monitors rang the bell on time."],
 ["Cheerful","wearing a smile that lifts others up","Cheerful Hauwa greeted the whole class today."],
 ["Creative","making new things from bright ideas","Creative Femi built a car from cartons."],
 ["Humble","being great without boasting about it","Humble champions still sweep their corner."],
 ["Trustworthy","people can count on your word","Trustworthy Ngozi returned the lost purse."],
 ["Zealous","full of energy and excitement for good work","Zealous readers finished the whole storybook."],
 ["Kindhearted","gentle and caring to everyone","Kindhearted Sadiq helped the new pupil find her class."],
 ["Excellence","doing your very best, always","Excellence is our motto in action."],
 ["Wisdom","using knowledge the right way","Wisdom speaks quietly but wisely."],
 ["Integrity","being the same good person even when no one watches","Integrity means no cheating, even in a hard test."]
];
function renderWOW(){
  const box=document.getElementById("wowCard"); if(!box)return;
  /* rotates every week automatically, same word for everyone all week */
  const idx=Math.floor(Date.now()/6048e5)%WOW_WORDS.length;
  const w=WOW_WORDS[idx];
  box.innerHTML=`<span class="sec-tag">Word of the Week</span><div class="wow-word">${w[0]}</div><p class="wow-mean"><b>Meaning:</b> ${w[1]}.</p><p class="wow-ex"><b>Use it:</b> \u201c${w[2]}\u201d</p>`;
}

/* ---------- RESUMPTION COUNTDOWN + TESTIMONIAL SPOTLIGHT (batch33) ---------- */
function renderResumeChip(){
  const el=document.getElementById("resumeChip"); if(!el)return;
  const d=(()=>{ try{ return (DB.load().school||{}).resumeDate||""; }catch(e){ return ""; } })();
  if(!d){ el.innerHTML=""; return; }
  const days=Math.round((new Date(d+"T12:00:00")-new Date(U.todayStr()+"T12:00:00"))/864e5);
  let html="";
  if(days>1) html=`<span class="rc-dot"></span><b>Resumption:</b>&nbsp;${days} days to go — ${U.prettyDate(d)}`;
  else if(days===1) html=`<span class="rc-dot"></span><b>Resumption:</b>&nbsp;tomorrow — ${U.prettyDate(d)}`;
  else if(days===0) html=`<span class="rc-dot"></span><b>School resumes today</b>&nbsp;— see you at assembly!`;
  else if(days>=-10) html=`<span class="rc-dot" style="background:var(--mint)"></span><b>We are back in session</b>&nbsp;— welcome, everyone!`;
  el.innerHTML=html?`<div class="resume-chip">${html}</div>`:"";
}
function renderTmSpot(){
  const el=document.getElementById("tmSpot"); if(!el)return;
  let list=[]; try{ list=(DB.load().testimonials||[]).filter(t=>t.status==="Approved"); }catch(e){}
  if(!list.length){ el.innerHTML=""; return; }
  const t=list[Math.floor(Date.now()/6048e5)%list.length]; /* rotates weekly */
  const stars="\u2605".repeat(Math.min(5,t.stars||5))+"\u2606".repeat(Math.max(0,5-(t.stars||5)));
  el.innerHTML=`<div class="tm-spot clip-up"><div class="tms-quote">\u201C</div><p>${U.esc(t.text)}</p><div class="tms-stars">${stars}</div><div class="tms-who"><b>${U.esc(t.name)}</b> <small>${U.esc(t.role||"Parent")}</small></div><a class="tms-link" href="testimonials.html">Read all parent reviews \u2192</a></div>`;
}

/* ---------- HIDDEN DEVELOPER ENTRY (batch34) — no visible link anywhere ----------
   Three invisible ways in: 7 quick taps on the footer copyright line,
   a 3-second press-and-hold on the school logo, or Ctrl+Shift+D on a keyboard. */
(function(){
  const base=(document.body.dataset&&document.body.dataset.assets&&document.body.dataset.assets.indexOf("assets")===0)?"":"../";
  const go=()=>{ location.href=base+"developer.html"; };
  let taps=0,t0=0;
  document.addEventListener("click",e=>{
    if(!(e.target.closest&&e.target.closest(".foot-bottom"))){ taps=0; return; }
    const now=Date.now(); if(now-t0>4000)taps=0; t0=now;
    if(++taps>=7){ taps=0; go(); }
  },true);
  let lp=null;
  document.addEventListener("pointerdown",e=>{
    if(!(e.target.closest&&e.target.closest("a.logo")))return;
    lp=setTimeout(()=>{ lp=null; go(); },2500);
  },true);
  ["pointerup","pointerleave","pointercancel"].forEach(ev=>document.addEventListener(ev,()=>{ if(lp){clearTimeout(lp);lp=null;} },true));
  document.addEventListener("keydown",e=>{ if(e.ctrlKey&&e.shiftKey&&(e.key==="D"||e.key==="d")){ e.preventDefault(); go(); } });
})();

/* ---------- PORTAL SIDEBAR COLLAPSE (batch35) ---------- */
(function(){
  function bootCollapse(){
    if(!document.body||!document.body.classList.contains("portal-body"))return;
    const nav=document.querySelector(".portal-layout .navbar .container"); if(!nav)return;
    if(document.getElementById("sideCollapse"))return;
    const b=document.createElement("button");
    b.id="sideCollapse"; b.type="button"; b.title="Collapse sidebar"; b.setAttribute("aria-label","Collapse or expand sidebar");
    b.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    b.onclick=()=>{
      const on=document.body.classList.toggle("side-slim");
      b.classList.toggle("flip",on);
      b.title=on?"Expand sidebar":"Collapse sidebar";
      try{ localStorage.setItem("treasure_side_slim",on?"1":"0"); }catch(e){}
    };
    nav.appendChild(b);
    try{ if(localStorage.getItem("treasure_side_slim")==="1"){ document.body.classList.add("side-slim"); b.classList.add("flip"); b.title="Expand sidebar"; } }catch(e){}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bootCollapse); else bootCollapse();
})();

/* ---------------- LOADER (school crest splash) ---------------- */
(function(){
  if(!document.querySelector('link[href*="corporate"]'))return;
  const base=(document.body.dataset&&document.body.dataset.assets)||(location.pathname.indexOf("/portal/")>=0?"../assets/":"assets/");
  let l=document.getElementById("siteLoader");
  if(!l){
    l=document.createElement("div"); l.id="siteLoader";
    const im=document.createElement("img"); im.src=base+"img/logo.jpg"; im.alt="Treasure Academy";
    const sp=document.createElement("div"); sp.className="spin";
    l.appendChild(im); l.appendChild(sp); document.body.appendChild(l);
  }else{
    if(!l.querySelector("img")){ const im=document.createElement("img"); im.src=base+"img/logo.jpg"; im.alt="Treasure Academy"; l.prepend(im); }
    if(!l.querySelector(".spin")){ const sp=document.createElement("div"); sp.className="spin"; l.appendChild(sp); }
  }
  let gone=false; const hide=()=>{ if(gone)return; gone=true; l.classList.add("done"); setTimeout(()=>l.remove(),500); };
  window.addEventListener("load",()=>setTimeout(hide,350)); setTimeout(hide,3500);
})();

/* ---------------- LIGHTBOX (photo viewer) ---------------- */
const Lightbox = {
  items: [], i: 0, key: null,
  open(items, idx){
    this.items = items || []; this.i = this.items.length ? Math.max(0, Math.min(idx || 0, this.items.length - 1)) : 0;
    if(!this.items.length) return;
    const old = document.getElementById("lightbox"); if(old) old.remove();
    const m = document.createElement("div"); m.id = "lightbox"; m.className = "lightbox";
    m.innerHTML = `<div class="lb-box">
        <button class="lb-x" aria-label="Close">×</button>
        <button class="lb-arrow lb-prev" aria-label="Previous">‹</button>
        <img class="lb-img" src="" alt="photo">
        <button class="lb-arrow lb-next" aria-label="Next">›</button>
        <div class="lb-cap"></div>
        <div class="lb-bar"><span class="lb-count"></span><span class="lb-btns"></span></div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector(".lb-x").onclick = () => this.close();
    m.querySelector(".lb-prev").onclick = e => { e.stopPropagation(); this.go(-1); };
    m.querySelector(".lb-next").onclick = e => { e.stopPropagation(); this.go(1); };
    m.addEventListener("click", e => { if(e.target.id === "lightbox" || e.target.classList.contains("lb-box")) this.close(); });
    this.key = e => { if(e.key === "Escape") this.close(); if(e.key === "ArrowLeft") this.go(-1); if(e.key === "ArrowRight") this.go(1); };
    document.addEventListener("keydown", this.key);
    let sx = null;
    m.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
    m.addEventListener("touchend", e => { if(sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if(Math.abs(dx) > 40) this.go(dx < 0 ? 1 : -1); }, { passive: true });
    this.paint();
  },
  go(d){ this.i = (this.i + d + this.items.length) % this.items.length; this.paint(); },
  paint(){
    const m = document.getElementById("lightbox"); if(!m) return;
    const it = this.items[this.i];
    m.querySelector(".lb-img").src = it.src;
    m.querySelector(".lb-cap").textContent = it.cap || "";
    const lc=m.querySelector(".lb-count"); if(lc)lc.remove();
    const btns = m.querySelector(".lb-btns"); btns.innerHTML = "";
    if(it.storyId){ const a = document.createElement("a"); a.className = "btn btn-white btn-sm"; a.href = "story.html?id=" + it.storyId; a.textContent = "Full story"; btns.appendChild(a); }
    const dl = document.createElement("button"); dl.className = "btn btn-mint btn-sm"; dl.textContent = "Download";
    dl.onclick = () => U.downloadFile(it.src, String(it.src).split("/").pop());
    btns.appendChild(dl);
  },
  close(){ const m = document.getElementById("lightbox"); if(m) m.remove(); if(this.key){ document.removeEventListener("keydown", this.key); this.key = null; } }
};

/* The dark theme stays calm and content-led; no decorative canvas is mounted. */

/* ---------------- INPUT FILTERS (letters-only / numbers-only) ---------------- */
function initInputFilters(scope){
  (scope||document).querySelectorAll("[data-alpha]").forEach(i=>{ if(i.dataset.fbound)return; i.dataset.fbound=1;
    i.addEventListener("input",()=>{ i.value=i.value.replace(/[^a-zA-Z\s'.-]/g,""); }); });
  (scope||document).querySelectorAll("[data-num]").forEach(i=>{ if(i.dataset.fbound)return; i.dataset.fbound=1;
    i.addEventListener("input",()=>{ i.value=i.value.replace(/\D/g,""); }); });
  (scope||document).querySelectorAll("[data-phone]").forEach(i=>{ if(i.dataset.fbound)return; i.dataset.fbound=1;
    i.setAttribute("maxlength","11"); i.setAttribute("inputmode","numeric");
    const norm=()=>{ let v=i.value.replace(/\D/g,""); if(v.length===11&&v[0]==="0")v=v.slice(1); if(v.length>10)v=v.slice(-10); i.value=v; };
    i.addEventListener("input",norm); i.addEventListener("blur",norm); });
  (scope||document).querySelectorAll("[data-alpha]").forEach(i=>{ if(i.dataset.cbound)return; i.dataset.cbound=1;
    i.addEventListener("blur",()=>{ i.value=i.value.replace(/\s+/g," ").replace(/(^|\s|['-])([a-z])/g,(m,p,c)=>p+c.toUpperCase()); }); });
}

/* ---------------- boot (each step isolated; widgets guaranteed) ---------------- */
function bootSafe(fn){ try{ fn(); }catch(e){ if(window.console&&console.warn) console.warn("boot step skipped:", e&&e.message); } }
function bootWidgets(){
  if(document.body.dataset.widgets==="off") return;
}
document.addEventListener("DOMContentLoaded", ()=>{
  bootSafe(()=>Theme.init());
    /* The header's More button opens the navigation drawer. Delegated on
       the document so it keeps working when renderNav() rewrites #mainNav. */
    bootSafe(function(){ document.addEventListener("click",function(e){
      var mb=e.target&&e.target.closest?e.target.closest("#taBurger"):null;
      if(mb&&window.TAAuth&&window.TAAuth.drawer)window.TAAuth.drawer(); }); });
  bootSafe(()=>Search.init());
  bootSafe(()=>injectSchool());
  const pg = Site.page;
  bootSafe(()=>renderNav(pg));
  bootSafe(()=>renderFooter());
  bootSafe(()=>renderMotto());
  bootSafe(()=>renderTicker());
  bootSafe(()=>renderBday());
  bootSafe(()=>renderBdayCount());
  bootSafe(()=>renderEmergency());
  bootSafe(()=>renderWeekStrip());
  bootSafe(()=>registerSW());
  bootSafe(()=>initTopBtn());
  bootSafe(()=>renderWOW());
  bootSafe(()=>renderResumeChip());
  bootSafe(()=>renderTmSpot());
  bootSafe(()=>initSliders());
  bootSafe(()=>initReveal());
  bootSafe(()=>typeLabels(document));
  bootSafe(()=>initInputFilters(document));
  bootWidgets();
  setTimeout(bootWidgets, 1500);
});
setTimeout(bootWidgets, 3000);
/* ============ BATCH 43 (2026-09-21): Treasure FX — micro-interactions, tabs, spy nav ============ */
(function(){
  if(typeof document==="undefined")return;
  var RM=false; try{ RM=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
  function ready(fn){ if(document.readyState!=="loading")fn(); else document.addEventListener("DOMContentLoaded",fn); }
  ready(function(){
    /* segmented tabs */
    function bootTabs(){
      document.querySelectorAll(".seg").forEach(function(seg){
        if(seg.dataset.fxBound)return; seg.dataset.fxBound="1";
        var tabs=[].slice.call(seg.querySelectorAll(".seg-tab")), ink=seg.querySelector(".seg-ink");
        var zone=seg.closest(".seg-zone")||seg.parentElement;
        var panes=[].slice.call(zone.querySelectorAll("[data-seg-pane]"));
        function go(key,btn){
          tabs.forEach(function(t){ t.classList.toggle("on",t===btn); });
          if(ink){ ink.style.left=btn.offsetLeft+"px"; ink.style.width=btn.offsetWidth+"px"; }
          panes.forEach(function(p){ var on=(key==="all"||p.getAttribute("data-seg-pane")===String(key)); p.classList.toggle("show",on); });
        }
        tabs.forEach(function(t){ t.addEventListener("click",function(){ go(t.getAttribute("data-seg"),t); }); });
        var first=tabs.filter(function(t){ return t.classList.contains("on"); })[0]||tabs[0];
        if(first)go(first.getAttribute("data-seg"),first);
      });
    }
    bootTabs();
    window.__fxTabsRescan=bootTabs;
    /* count-up stats */
    document.querySelectorAll("[data-countup]").forEach(function(el){
      var end=(el.textContent||"").trim(), n=parseInt(end,10); if(isNaN(n)||RM)return;
      var t0=null, dur=Math.min(1400,380+n*18);
      function step(ts){ if(!t0)t0=ts; var p=Math.min(1,(ts-t0)/dur), e=1-Math.pow(1-p,3); el.textContent=String(Math.round(n*e)); if(p<1)requestAnimationFrame(step); }
      if(window.IntersectionObserver){ new IntersectionObserver(function(es,o){ es.forEach(function(x){ if(x.isIntersecting){ requestAnimationFrame(step); o.disconnect(); } }); },{threshold:.4}).observe(el); }
      else requestAnimationFrame(step);
    });
    /* scrollspy bars */
    document.querySelectorAll(".spy-bar").forEach(function(bar){
      var links=[].slice.call(bar.querySelectorAll("a[href^='#']"));
      var map={}, secs=[];
      links.forEach(function(a){ var id=a.getAttribute("href").slice(1), sec=document.getElementById(id); if(sec){ map[id]=a; secs.push(sec); } });
      if(!window.IntersectionObserver||!secs.length)return;
      var io=new IntersectionObserver(function(es){ es.forEach(function(x){ if(x.isIntersecting){ links.forEach(function(a){ a.classList.remove("on"); }); var a=map[x.target.id]; if(a)a.classList.add("on"); } }); },{rootMargin:"-25% 0px -60% 0px"});
      secs.forEach(function(s){ io.observe(s); });
    });
  });
})();

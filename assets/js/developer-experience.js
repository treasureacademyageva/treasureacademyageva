/* Browser-local Developer Experience Studio. No credentials or pupil records. */
(function () {
  "use strict";
  var audit = window.TA_EXPERIENCE_AUDIT || {totals:{},brand:{gaps:[]},pages:[]};
  var brandAssets = window.TA_BRAND_ASSETS || {readiness:{verifiedImages:0,verifiedProfiles:0,verifiedDocuments:0}};
  var quality = window.TA_CONTENT_QUALITY || {pageCount:0,totals:{},pages:[]};
  var REPORT_KEY = "taa_dev_safe_reports_v2";
  var RESEARCH_KEY = "taa_dev_research_workspace_v1";
  var ALLOWED_EVENTS = ["page","navigate","cta","search","search_refine","search_result","form_start","form_complete","form_abandon","resource_error","script_error"];

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }
  function clean(value, fallback) {
    var text = String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9_/-]/g, "").slice(0, 120);
    return text || fallback || "other";
  }
  function getJson(key, fallback) {
    try { var value = JSON.parse(localStorage.getItem(key) || "null"); return value == null ? fallback : value; }
    catch (error) { return fallback; }
  }
  function setJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function download(name, content, type) {
    var link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], {type:type || "text/plain"}));
    link.download = name; link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }
  function copyText(text, statusId) {
    function done(ok) { var status = byId(statusId); if (status) status.textContent = ok ? "Copied. Paste this brief into your chosen agent." : "Copy failed. Select the preview and copy it manually."; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){done(true);}).catch(function(){done(false);});
    else {
      var area=document.createElement("textarea");area.value=text;document.body.appendChild(area);area.select();
      try { done(document.execCommand("copy")); } catch (error) { done(false); } area.remove();
    }
  }
  function metric(value, label, note, tone) {
    return '<article class="metric-card '+esc(tone||'')+'"><strong>'+esc(value)+'</strong><h3>'+esc(label)+'</h3><p>'+esc(note||'')+'</p></article>';
  }

  function renderSummary() {
    var t=audit.totals||{};
    byId("summaryCards").innerHTML = [
      metric(t.pages||0,"Public pages audited","Generated metrics; no page paragraphs retained."),
      metric((t.withinTwoClicks||0)+"/"+(t.pages||0),"Within two clicks","All useful pages; the intentional 404 is excluded from normal navigation.",t.withinTwoClicks>=(t.pages-1)?"good":"warn"),
      metric((t.missingAlt||0)+(t.missingLabels||0),"Missing alt/label findings","Structural scan; manual quality checks remain required.",(t.missingAlt||0)+(t.missingLabels||0)?"bad":"good"),
      metric((audit.brand&&audit.brand.gaps||[]).length,"Owner-supplied brand gaps","Logo master, authentic photos, profiles and documents.","warn")
    ].join("");
    var priorities=[];
    (audit.brand&&audit.brand.gaps||[]).forEach(function(g){priorities.push({level:"Owner",text:g.finding});});
    (audit.pages||[]).filter(function(p){return p.issues&&p.issues.length;}).slice(0,8).forEach(function(p){priorities.push({level:"Website",text:p.page+": "+p.issues.join(", ").replaceAll("_"," ")});});
    if (!(t.heroImages||0)) priorities.push({level:"Asset",text:"Hero-image slots are ready, but no photo is marked verified. Do not promote restored images as authentic until the owner approves them."});
    byId("priorityList").innerHTML=priorities.length?priorities.map(function(p){return '<li><b>'+esc(p.level)+'</b><span>'+esc(p.text)+'</span></li>';}).join(""):'<li class="good"><b>Ready</b><span>No generated priority findings.</span></li>';
  }

  function renderBrand() {
    var b=audit.brand||{}, pages=audit.pages||[];
    function count(key){return pages.filter(function(p){return p.brand&&p.brand[key];}).length;}
    byId("brandCards").innerHTML=[
      metric(count("name")+"/"+pages.length,"School name present","Visible identity check."),
      metric(count("mark")+"/"+pages.length,"Brand-mark coverage","Consistent text mark while the owner-approved logo is pending.",count("mark")===pages.length?"good":"warn"),
      metric(count("description")+"/"+pages.length,"Page descriptions","Search-result summary coverage."),
      metric(count("socialImage")+"/"+pages.length,"Social preview images","Open Graph image coverage."),
      metric(b.schoolSchema?"Present":"Missing","School structured data","Homepage entity, address and verified contacts; logo stays omitted until approved.",b.schoolSchema?"good":"bad"),
      metric((brandAssets.readiness.verifiedImages||0)+" / "+(brandAssets.readiness.verifiedProfiles||0)+" / "+(brandAssets.readiness.verifiedDocuments||0),"Verified images / profiles / documents","Fail-closed owner asset registry.",(brandAssets.readiness.verifiedImages||0)?"good":"warn")
    ].join("");
    byId("brandGapRows").innerHTML=(b.gaps||[]).map(function(g){return '<tr><td><span class="status-chip warn">'+esc(g.severity)+'</span></td><td>'+esc(g.finding)+'</td><td><select data-gap="'+esc(g.id)+'" aria-label="Status for '+esc(g.id)+'"><option>Open</option><option>Owner supplied</option><option>Verified</option><option>Not applicable</option></select></td></tr>';}).join("");
    (workspace().gapDecisions||[]).forEach(function(item){var select=document.querySelector('[data-gap="'+CSS.escape(item.id)+'"]');if(select)select.value=item.status;});
  }

  function renderPageAudit(filter) {
    filter=String(filter||"").toLowerCase();
    var rows=(audit.pages||[]).filter(function(p){return !filter || p.page.toLowerCase().includes(filter) || p.issues.join(" ").includes(filter);});
    byId("pageAuditRows").innerHTML=rows.map(function(p){
      var a=p.accessibility||{},x=p.experience||{},issue=p.issues&&p.issues.length?p.issues.join(", ").replaceAll("_"," "):"No generated issue";
      return '<tr><td><b>'+esc(p.page)+'</b><small>'+esc(p.title)+'</small></td><td>'+esc(x.clickDepth==null?"—":x.clickDepth)+'</td><td>'+esc(x.ctas||0)+'</td><td>'+esc(a.images||0)+'</td><td>'+esc(a.controls||0)+'</td><td><span class="status-chip '+(p.issues.length?'warn':'good')+'">'+esc(issue)+'</span></td></tr>';
    }).join("");
  }

  function renderAccessibility() {
    var t=audit.totals||{};
    byId("a11yCards").innerHTML=[
      metric(t.missingAlt||0,"Images missing alt attributes","Empty alt is valid for decorative repeated logos.",t.missingAlt?"bad":"good"),
      metric(t.missingLabels||0,"Controls missing labels","Visible/programmatic label check.",t.missingLabels?"bad":"good"),
      metric(t.unsizedImages||0,"Images missing dimensions","Dimensions prevent avoidable layout shift.",t.unsizedImages?"warn":"good"),
      metric(quality.totals&&quality.totals.vagueLinks||0,"Vague link labels","Clear link purpose improves scanning and screen-reader use.",(quality.totals&&quality.totals.vagueLinks)?"warn":"good")
    ].join("");
    renderPageAudit("");
    byId("pageAuditFilter").addEventListener("input",function(){renderPageAudit(this.value);});
  }

  function sanitizeEvent(event) {
    var type=clean(event&&event.t,"other");
    if(ALLOWED_EVENTS.indexOf(type)<0)return null;
    var safe={t:type,p:clean(event.p),stage:clean(event.stage),at:Math.max(0,Math.min(86400,Number(event.at)||0))};
    ["to","channel","goal","family","results","answer","form","kind"].forEach(function(key){if(event[key]!=null)safe[key]=clean(event[key]);});
    return safe;
  }
  function sanitizeReport(report) {
    if(!report||[1,2].indexOf(Number(report.v))<0||!Array.isArray(report.events))throw new Error("Unsupported or incomplete diagnostic code.");
    return {
      v:Number(report.v),page:clean(report.page),path:"/"+clean(String(report.path||"").replace(/^\//,""),""),
      viewport:clean(report.viewport),browser:clean(report.browser),acquisition:clean(report.acquisition,"unknown"),
      theme:clean(report.theme),online:clean(report.online),events:report.events.slice(-24).map(sanitizeEvent).filter(Boolean)
    };
  }
  function decode(value) {
    var match=String(value||"").match(/TAUX([12])-[A-Za-z0-9_-]+/);
    if(!match)throw new Error("No TAUX1 or TAUX2 diagnostic code found.");
    var base=match[0].slice(6).replace(/-/g,"+").replace(/_/g,"/");while(base.length%4)base+="=";
    var binary=atob(base),bytes=Uint8Array.from(binary,function(ch){return ch.charCodeAt(0);});
    return sanitizeReport(JSON.parse(new TextDecoder().decode(bytes)));
  }
  function reports(){var r=getJson(REPORT_KEY,[]);return Array.isArray(r)?r:[];}
  function saveReports(rows){setJson(REPORT_KEY,rows.slice(-100));renderJourneyEvidence();}
  function allEvents(){return reports().flatMap(function(r){return r.events.map(function(e){return Object.assign({reportPage:r.page,viewport:r.viewport,browser:r.browser,acquisition:r.acquisition},e);});});}
  function eventCount(type){return allEvents().filter(function(e){return e.t===type;}).length;}
  function groupCounts(items,key){return items.reduce(function(out,item){var value=clean(item[key]);out[value]=(out[value]||0)+1;return out;},{});}
  function sortedPairs(object){return Object.keys(object).map(function(k){return[k,object[k]];}).sort(function(a,b){return b[1]-a[1]||a[0].localeCompare(b[0]);});}
  function renderJourneyEvidence(){
    var list=reports(),events=allEvents(),starts=eventCount("form_start"),complete=eventCount("form_complete"),abandon=eventCount("form_abandon");
    byId("journeyCards").innerHTML=[
      metric(list.length,"Imported reports","Voluntary snapshots, not unique visitors."),
      metric(eventCount("cta"),"CTA selections","Broad goal and navigation channel only."),
      metric(starts+" / "+complete,"Form starts / completed steps","Completion means the website step finished; WhatsApp delivery is not confirmed."),
      metric(abandon,"Recorded form abandonment","A form was started and the page was left before its website submit step."),
      metric(events.filter(function(e){return /search/.test(e.t)&&e.results==="zero";}).length,"Zero-result searches","Only reviewed meaning family and count bucket are available."),
      metric(events.filter(function(e){return /error/.test(e.t);}).length,"Resource or script errors","No console text, URL query or form values.")
    ].join("");
    var formRows=sortedPairs(groupCounts(events.filter(function(e){return e.t.indexOf("form_")===0;}),"form"));
    byId("formFunnelRows").innerHTML=formRows.length?formRows.map(function(row){
      var form=row[0],subset=events.filter(function(e){return e.form===form;}),s=subset.filter(function(e){return e.t==="form_start";}).length,c=subset.filter(function(e){return e.t==="form_complete";}).length,a=subset.filter(function(e){return e.t==="form_abandon";}).length;
      return '<tr><td>'+esc(form)+'</td><td>'+s+'</td><td>'+c+'</td><td>'+a+'</td><td>'+(s?Math.round(c/s*100)+"%":"—")+'</td></tr>';
    }).join(""):'<tr><td colspan="5">Import voluntary TAUX2 diagnostics to build a safe funnel.</td></tr>';
    var touch={};events.filter(function(e){return e.t==="navigate"||e.t==="cta";}).forEach(function(e){var key=e.channel+" · "+e.p+" → "+e.to;touch[key]=(touch[key]||0)+1;});
    byId("touchpointRows").innerHTML=sortedPairs(touch).slice(0,20).map(function(row){return '<tr><td>'+esc(row[0])+'</td><td>'+row[1]+'</td></tr>';}).join("")||'<tr><td colspan="2">No imported touchpoint evidence yet.</td></tr>';
    var devices=groupCounts(events.length?events:list,"viewport"),channels=groupCounts(events.length?events:list,"acquisition");
    byId("deviceSummary").textContent=sortedPairs(devices).map(function(x){return x[0]+" "+x[1];}).join(" · ")||"No device evidence imported.";
    byId("channelSummary").textContent=sortedPairs(channels).map(function(x){return x[0]+" "+x[1];}).join(" · ")||"No acquisition-channel evidence imported.";
    byId("reportList").innerHTML=list.length?list.slice().reverse().map(function(r){return '<article class="report-item"><b>'+esc(r.page)+' · '+esc(r.viewport)+' · '+esc(r.browser)+'</b><p>'+r.events.length+' allowlisted actions · acquisition '+esc(r.acquisition)+'</p><code>'+esc(r.path)+'</code></article>';}).join(""):'<p>No safe diagnostics imported in this browser.</p>';
  }

  var personas={
    prospective_parent:{audience:"Prospective parent or guardian",demographics:"Not inferred. Validate language, location and access needs through voluntary research.",professional:"Unknown; do not assume occupation, income or education.",devices:"Mobile-first hypothesis; also shared or low-powered devices. Validate.",goals:"Understand the school; compare classes and fees; confirm safety; apply; arrange a visit.",channels:"Website, search engine, WhatsApp, telephone, school visit, trusted referral.",evidence:"Hypothesis based on current website tasks; needs parent interviews."},
    current_parent:{audience:"Current parent or guardian",demographics:"Not inferred or tracked.",professional:"Unknown; design for limited time and varied digital confidence.",devices:"Phone hypothesis; may use WhatsApp more than email. Validate.",goals:"Find dates, uniform, transport, records support and verified contact quickly.",channels:"Website, WhatsApp, telephone, office visit.",evidence:"Hypothesis based on high-priority family routes; needs current-parent interviews."},
    staff_applicant:{audience:"Staff applicant or staff member",demographics:"Not inferred or tracked.",professional:"Teaching or support interest is task context, not a tracked personal profile.",devices:"Phone and desktop hypothesis. Validate.",goals:"Understand mission, safeguarding expectations, vacancies and approved application route.",channels:"Website, email, WhatsApp, telephone, office.",evidence:"Hypothesis from careers and safeguarding content."},
    pupil:{audience:"Pupil using learning help with adult guidance",demographics:"Child data must not be collected for website analytics.",professional:"Not applicable.",devices:"Shared family or school device hypothesis. Validate only with safeguarding-approved research.",goals:"Find class information and safe Primary 6 Common Entrance practice.",channels:"Website with parent or teacher support.",evidence:"Safeguarding constraint; do not create behavioural profiles of children."}
  };
  var defaults={
    persona:"prospective_parent",personas:personas,
    empathy:{says:"I need clear, current information before I contact the school.",thinks:"Is this the real school site? Are the fees, photos and dates current?",does:"Checks identity, classes, fees, safety, directions and contact routes.",feels:"Interested, cautious and time-pressed.",evidence:"Hypothesis — validate with voluntary interviews."},
    journeys:{
      current:[
        {stage:"Awareness",action:"Find the school through search, referral or a shared link.",touchpoint:"Search / social / referral → homepage",thought:"Is this the correct school?",emotion:"3",friction:"Unverified social profiles and campus photography weaken identity confidence.",opportunity:"Owner-verify profiles, logo master and original campus images.",evidence:"Hypothesis"},
        {stage:"Explore",action:"Review mission, classes, school life, fees and safety.",touchpoint:"Home, About, Classes, Fees, News, Search",thought:"Can I understand the offer quickly?",emotion:"3",friction:"Some current documents and activity details require office confirmation.",opportunity:"Publish owner-approved current documents and activity information.",evidence:"Site audit"},
        {stage:"Decide",action:"Compare class fit, fee process and visit options.",touchpoint:"Admissions, class pages, Fees, Contact",thought:"What exactly should I do next?",emotion:"3",friction:"Fee amount and availability cannot be safely assumed online.",opportunity:"Keep three-step guidance and offer a verified schedule-a-visit handoff.",evidence:"Site audit"},
        {stage:"Act",action:"Complete a website step and open WhatsApp or telephone.",touchpoint:"CTA / form → external channel",thought:"Has the school received this?",emotion:"2",friction:"Opening a draft is not delivery; the visitor must tap Send.",opportunity:"Keep transparent handoff wording and office confirmation.",evidence:"Known system behaviour"},
        {stage:"Follow-up",action:"Use the website request, visit, submit documents or pay from an official invoice by manual transfer or physical office POS.",touchpoint:"Website / call / physical school",thought:"What happens after my enquiry?",emotion:"3",friction:"The static website cannot verify receipt, status or payment.",opportunity:"Document the owner-approved offline follow-up process.",evidence:"Known system boundary"}
      ],
      future:[
        {stage:"Awareness",action:"Recognise verified school identity immediately.",touchpoint:"Search profile → fast branded homepage",thought:"This is clearly the official school.",emotion:"4",friction:"None after asset/profile verification.",opportunity:"Maintain consistent NAP, logo and approved profiles.",evidence:"Target state"},
        {stage:"Explore",action:"Find programmes, culture, dates and current guidance in one or two actions.",touchpoint:"Shared nav, Explore, Search",thought:"I can compare the essentials without hunting.",emotion:"4",friction:"Time-sensitive facts still require governance.",opportunity:"Assign owners and review dates to changing content.",evidence:"Target state"},
        {stage:"Decide",action:"Choose class, understand safe payment guidance and plan a visit.",touchpoint:"Admissions hub + verified documents",thought:"I know what to prepare and who to contact.",emotion:"4",friction:"No online checkout by design.",opportunity:"Explain manual bank transfer or physical office POS, office verification and official receipts.",evidence:"Owner rule"},
        {stage:"Act",action:"Use an accessible labelled form or direct verified contact action.",touchpoint:"Website → chosen contact channel",thought:"I understand what will happen next.",emotion:"4",friction:"External Send remains required.",opportunity:"Confirm the handoff before leaving the website.",evidence:"Target state"},
        {stage:"Follow-up",action:"Receive an office response and complete the approved offline process.",touchpoint:"Office channels / campus",thought:"My next step is clear.",emotion:"4",friction:"Depends on school operations.",opportunity:"Add only owner-approved service standards.",evidence:"Target state"}
      ]
    },
    day:[
      {moment:"Before work or school",context:"Quickly checks admissions, dates or fees.",device:"Phone hypothesis",channel:"Search / direct link",need:"Answer in the first screen; readable without zoom.",risk:"Slow image or unclear identity."},
      {moment:"During the day",context:"Needs a phone number, direction or urgent school update.",device:"Phone hypothesis",channel:"Website → call / WhatsApp",need:"One-tap verified contact and honest handoff.",risk:"Assuming a draft was delivered."},
      {moment:"Evening planning",context:"Compares classes, documents and next steps.",device:"Phone or desktop hypothesis",channel:"Website / family discussion",need:"Scannable detail and saved official documents.",risk:"Old screenshots or unverified information."}
    ],
    blueprint:[
      {stage:"Discover",customer:"Opens the official site.",frontstage:"Identity, mission and top tasks appear.",backstage:"Content owner maintains facts and media approvals.",support:"DNS, Vercel, SEO and brand governance.",failure:"Wrong logo/photo/profile or stale fact."},
      {stage:"Explore",customer:"Browses or searches for an answer.",frontstage:"Shared navigation, Explore and local Search respond.",backstage:"Search families and content quality are reviewed.",support:"Build, accessibility and relevance tests.",failure:"No result, unclear label or inconsistent component."},
      {stage:"Act",customer:"Chooses Apply, Visit, Call or WhatsApp.",frontstage:"Website opens the correct route or reviewed draft.",backstage:"Office prepares current forms and schedules; bank details stay inside the signed-in portal or official invoice.",support:"Verified contact registry and safeguarding rules.",failure:"Unclear external handoff or unavailable office information."},
      {stage:"Complete",customer:"Taps Send, calls, visits or submits documents offline.",frontstage:"School staff responds through approved channels.",backstage:"School records the enquiry in its secure process.",support:"Retention, access and payment controls.",failure:"Website cannot confirm delivery or receipt."}
    ]
  };
  function workspace(){var w=getJson(RESEARCH_KEY,null);return w&&w.journeys?w:JSON.parse(JSON.stringify(defaults));}
  function saveWorkspace(w){setJson(RESEARCH_KEY,w);renderResearch();}
  function val(id){return byId(id).value.trim();}
  function renderPersona(){
    var w=workspace(),key=byId("personaSelect").value||w.persona||"prospective_parent",p=w.personas[key]||personas[key];
    [["personaAudience","audience"],["personaDemographics","demographics"],["personaProfessional","professional"],["personaDevices","devices"],["personaGoals","goals"],["personaChannels","channels"],["personaEvidence","evidence"]].forEach(function(pair){byId(pair[0]).value=p[pair[1]]||"";});
  }
  function journeyRow(row,index){return '<tr><td><b>'+esc(row.stage)+'</b></td>'+["action","touchpoint","thought","emotion","friction","opportunity","evidence"].map(function(key){return '<td><textarea data-journey-index="'+index+'" data-journey-key="'+key+'" rows="3" aria-label="'+esc(row.stage+' '+key)+'">'+esc(row[key])+'</textarea></td>';}).join("")+'</tr>';}
  function renderResearch(){
    var w=workspace();byId("personaSelect").value=w.persona||"prospective_parent";renderPersona();
    [["empathySays","says"],["empathyThinks","thinks"],["empathyDoes","does"],["empathyFeels","feels"],["empathyEvidence","evidence"]].forEach(function(pair){byId(pair[0]).value=w.empathy[pair[1]]||"";});
    var state=byId("journeyState").value||"current";byId("journeyRows").innerHTML=w.journeys[state].map(journeyRow).join("");
    byId("dayRows").innerHTML=w.day.map(function(r,i){return '<tr>'+["moment","context","device","channel","need","risk"].map(function(key){return '<td><textarea data-day-index="'+i+'" data-day-key="'+key+'" rows="3" aria-label="'+esc(r.moment+' '+key)+'">'+esc(r[key])+'</textarea></td>';}).join("")+'</tr>';}).join("");
    byId("blueprintRows").innerHTML=w.blueprint.map(function(r,i){return '<tr>'+["stage","customer","frontstage","backstage","support","failure"].map(function(key){return '<td><textarea data-blueprint-index="'+i+'" data-blueprint-key="'+key+'" rows="3" aria-label="'+esc(r.stage+' '+key)+'">'+esc(r[key])+'</textarea></td>';}).join("")+'</tr>';}).join("");
  }
  function captureResearch(){
    var w=workspace(),key=byId("personaSelect").value;w.persona=key;w.personas[key]={audience:val("personaAudience"),demographics:val("personaDemographics"),professional:val("personaProfessional"),devices:val("personaDevices"),goals:val("personaGoals"),channels:val("personaChannels"),evidence:val("personaEvidence")};
    w.empathy={says:val("empathySays"),thinks:val("empathyThinks"),does:val("empathyDoes"),feels:val("empathyFeels"),evidence:val("empathyEvidence")};
    var state=byId("journeyState").value;document.querySelectorAll("[data-journey-index]").forEach(function(el){w.journeys[state][Number(el.dataset.journeyIndex)][el.dataset.journeyKey]=el.value;});
    document.querySelectorAll("[data-day-index]").forEach(function(el){w.day[Number(el.dataset.dayIndex)][el.dataset.dayKey]=el.value;});
    document.querySelectorAll("[data-blueprint-index]").forEach(function(el){w.blueprint[Number(el.dataset.blueprintIndex)][el.dataset.blueprintKey]=el.value;});
    w.gapDecisions=Array.prototype.slice.call(document.querySelectorAll('[data-gap]')).map(function(select){return {id:select.dataset.gap,status:select.value};});
    return w;
  }

  function runSearchLab(){
    var query=val("labQuery"),box=byId("labOutput");if(!query){box.textContent="Enter a question first.";return;}
    var a=TA_SMART_SEARCH.analyze(query),answer=TA_SMART_SEARCH.directAnswer(query),ranked=(window.TA_SEARCH_INDEX||[]).map(function(e){return{e:e,s:TA_SMART_SEARCH.score(e,query)};}).filter(function(x){return x.s>=16;}).sort(function(a,b){return b.s-a.s;}).slice(0,5);
    box.innerHTML='<p><b>Meaning families:</b> '+esc(a.families.map(function(f){return f.label;}).join(", ")||"No reviewed family")+'<br><b>Base forms:</b> '+esc(a.roots.join(", ")||"—")+'<br><b>Direct answer:</b> '+esc(answer?answer.title:"None")+'</p><ol>'+ranked.map(function(x){return '<li><b>'+esc(x.e.t)+'</b> <small>score '+x.s+'</small></li>';}).join("")+'</ol><p class="privacy-note">This test remains in this browser. The raw question is not added to an export unless you copy it yourself.</p>';
  }

  function runHealth(){
    var items=[{label:"Homepage",url:"/",expect:200},{label:"Search",url:"/search",expect:200},{label:"Website Help",url:"/website-help",expect:200},{label:"Sitemap",url:"/sitemap.xml",expect:200},{label:"Speed Insights",url:"/_vercel/speed-insights/script.js",expect:200},{label:"Web Analytics",url:"/_vercel/insights/script.js",expect:200,optional:true}],box=byId("healthList");box.innerHTML="<p>Checking…</p>";
    Promise.all(items.map(function(item){return fetch(item.url,{cache:"no-store"}).then(function(response){return{item:item,status:response.status,ok:response.status===item.expect};}).catch(function(){return{item:item,status:"offline",ok:false};});})).then(function(rows){box.innerHTML=rows.map(function(row){var label=row.ok?"Ready":row.item.optional?"Not enabled":"Needs attention";return '<div class="health-item"><b>'+esc(row.item.label)+'</b><span class="status-chip '+(row.ok?"good":row.item.optional?"warn":"bad")+'">'+label+' · '+esc(row.status)+'</span></div>';}).join("");});
  }

  function agentBrief(){
    var w=captureResearch(),t=audit.totals||{},events=allEvents(),lines=[];
    lines.push("# Treasure Academy Website Improvement Brief");
    lines.push("Generated locally from reviewed site metrics and editable research hypotheses. Do not treat hypotheses as interviewed-user facts.");
    lines.push("\n## Non-negotiable safeguards");
    lines.push("- Do not fabricate school facts, social profiles, reviewer decisions, documents, testimonials or campus photographs.");
    lines.push("- No raw search terms, names, phone numbers, child data, passwords, payment data or form values in analytics.");
    lines.push("- Payments use manual bank transfer or the physical school-office POS, both after office verification. Do not add checkout, card-data fields, WhatsApp evidence, browser receipts or unverified payment-success claims.");
    lines.push("- The browser-only parent portal is retired. Do not restore insecure authentication.");
    lines.push("- Design toward WCAG 2.2 AA, but do not claim legal certification from automated checks alone.");
    lines.push("\n## Generated current-state evidence");
    lines.push("- Public pages audited: "+(t.pages||0));
    lines.push("- Reachable within two actions through navigation, Explore or Search: "+(t.withinTwoClicks||0)+"/"+(t.pages||0));
    lines.push("- Missing alt attributes: "+(t.missingAlt||0)+"; missing form labels: "+(t.missingLabels||0)+"; unsized images: "+(t.unsizedImages||0));
    lines.push("- Imported voluntary reports: "+reports().length+"; safe events: "+events.length+"; form starts: "+eventCount("form_start")+"; completed website form steps: "+eventCount("form_complete")+"; recorded abandonment: "+eventCount("form_abandon"));
    lines.push("\n## Brand-visibility gaps requiring owner evidence");
    (audit.brand&&audit.brand.gaps||[]).forEach(function(g){var decision=(w.gapDecisions||[]).find(function(item){return item.id===g.id;});lines.push("- ["+(decision?decision.status:"Open")+"] "+g.finding);});
    lines.push("\n## Active persona lens");
    var p=w.personas[w.persona];Object.keys(p).forEach(function(key){lines.push("- "+key+": "+p[key]);});
    lines.push("\n## Empathy map (hypothesis until validated)");Object.keys(w.empathy).forEach(function(key){lines.push("- "+key+": "+w.empathy[key]);});
    ["current","future"].forEach(function(state){lines.push("\n## "+(state==="current"?"Current-state":"Future-state")+" journey");w.journeys[state].forEach(function(r){lines.push("### "+r.stage+"\n- Action: "+r.action+"\n- Touchpoint/channel: "+r.touchpoint+"\n- Thought: "+r.thought+"\n- Emotion: "+r.emotion+"/5\n- Friction: "+r.friction+"\n- Opportunity: "+r.opportunity+"\n- Evidence: "+r.evidence);});});
    lines.push("\n## Day-in-the-life hypothesis");w.day.forEach(function(r){lines.push("- "+r.moment+": "+r.context+" | "+r.device+" | "+r.channel+" | Need: "+r.need+" | Risk: "+r.risk);});
    lines.push("\n## Service blueprint");w.blueprint.forEach(function(r){lines.push("- "+r.stage+" | Customer: "+r.customer+" | Frontstage: "+r.frontstage+" | Backstage: "+r.backstage+" | Support: "+r.support+" | Failure: "+r.failure);});
    lines.push("\n## Agent task");
    lines.push("Prioritize evidence-backed friction, reusable components, consistent navigation, accessible forms and fast mobile delivery. Separate owner-supplied content gaps from code fixes. Return a change plan, affected files, privacy/accessibility risks, tests and rollback steps. Ask for owner evidence instead of inventing missing brand assets or facts.");
    return lines.join("\n");
  }

  document.addEventListener("DOMContentLoaded",function(){
    renderSummary();renderBrand();renderAccessibility();renderJourneyEvidence();renderResearch();
    byId("runHealth").onclick=runHealth;byId("runLab").onclick=runSearchLab;byId("labQuery").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();runSearchLab();}});
    byId("addReport").onclick=function(){var status=byId("reportStatus");try{var r=decode(val("reportCode")),all=reports();all.push(r);saveReports(all);byId("reportCode").value="";status.className="good-text";status.textContent="Safe diagnostic imported. No written message or form value was stored.";}catch(error){status.className="bad-text";status.textContent=error.message;}};
    byId("clearReports").onclick=function(){localStorage.removeItem(REPORT_KEY);renderJourneyEvidence();byId("reportStatus").textContent="Local reports cleared.";};
    byId("exportReports").onclick=function(){var rows=[["report","page_group","viewport","browser","acquisition","event","from","to","channel","goal","form","search_family","result_bucket","stage"]];reports().forEach(function(r,ri){r.events.forEach(function(e){rows.push([ri+1,r.page,r.viewport,r.browser,r.acquisition,e.t,e.p,e.to||"",e.channel||"",e.goal||"",e.form||"",e.family||"",e.results||"",e.stage||""]);});});var csv=rows.map(function(row){return row.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(",");}).join("\n");download("treasure-academy-safe-journey-evidence.csv",csv,"text/csv");};
    byId("personaSelect").onchange=function(){var w=workspace();w.persona=this.value;setJson(RESEARCH_KEY,w);renderPersona();};
    byId("journeyState").onchange=renderResearch;
    byId("saveResearch").onclick=function(){saveWorkspace(captureResearch());byId("researchStatus").textContent="Research workspace saved in this browser.";};
    byId("resetResearch").onclick=function(){localStorage.removeItem(RESEARCH_KEY);renderBrand();renderResearch();byId("researchStatus").textContent="Hypothesis templates restored.";};
    byId("copyAgentBrief").onclick=function(){var brief=agentBrief();byId("agentPreview").value=brief;copyText(brief,"agentStatus");};
    byId("downloadAgentBrief").onclick=function(){var brief=agentBrief();byId("agentPreview").value=brief;download("treasure-academy-agent-improvement-brief.md",brief,"text/markdown");};
    byId("downloadEvidence").onclick=function(){download("treasure-academy-experience-evidence.json",JSON.stringify({audit:audit,brandAssets:brandAssets,quality:quality,research:captureResearch(),safeReports:reports()},null,2),"application/json");};
    document.addEventListener('change',function(event){if(event.target.matches&&event.target.matches('[data-gap]')){saveWorkspace(captureResearch());byId("agentPreview").value=agentBrief();}});
    byId("agentPreview").value=agentBrief();
  });
})();

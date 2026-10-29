/* Gate-aware Search: reviewed local fallback before cutover; bounded same-origin POST after cutover. */
(function () {
  "use strict";
  var INDEX = window.TA_SEARCH_INDEX || [];
  var form = document.getElementById("smartSearchForm");
  var input = document.getElementById("smartQuery");
  var status = document.getElementById("searchStatus");
  var answerBox = document.getElementById("smartAnswer");
  var resultsBox = document.getElementById("smartResults");

  /* Reviewed school-domain vocabulary. Families bridge related meanings; light
     stemming below bridges forms such as applying/applied/application. */
  var FAMILIES = [
    {id:"admissions",label:"Admissions",terms:"apply application applications admission admissions admit admitted enrol enroll enrolment enrollment register registration registered join joining entry intake form requirements documents place places availability",phrases:["join the school","new pupil","start school","admission process"]},
    {id:"fees",label:"Fees & payments",terms:"fee fees tuition cost costs costing price prices priced pricing payment payments pay paid paying money amount amounts charge charges charged transfer bank receipt receipts invoice",phrases:["how much","school charges","bank details","payment proof","fee schedule"]},
    {id:"location",label:"Location & visits",terms:"location locate located address where whereabouts direction directions directional map maps visit visiting visitor campus site office landmark",phrases:["how to get","where is","come to school","school address","plan a visit"]},
    {id:"contact",label:"Contact & help",terms:"phone phones call calling contact contacts contacted number numbers whatsapp message messaging email reach reaching help support enquiry inquiry ask question",phrases:["talk to","speak with","get in touch","school office"]},
    {id:"classes",label:"Classes & placement",terms:"class classes grade grades grading level levels stage stages placement preschool prenursery nursery primary pupil pupils student students",phrases:["which class","class level","age group","school level"]},
    {id:"learning",label:"Learning",terms:"learn learns learned learnt learning learner learners teach teaches teaching teacher teachers lesson lessons subject subjects curriculum curricula education educational academic academics numeracy literacy phonics reading read mathematics science",phrases:["what children learn","school work","learning programme","teaching method"]},
    {id:"dates",label:"Dates & calendar",terms:"calendar date dates dated term terms resumption resume holiday holidays break breaks closing closure reopen reopening event events when timetable schedule scheduled",phrases:["term date","school calendar","back to school","school opens","school closes"]},
    {id:"time",label:"Opening times",terms:"open opening opens close closes closed closing hour hours time times weekday weekdays monday friday morning afternoon",phrases:["school hours","opening time","closing time","school day"]},
    {id:"uniform",label:"Uniform",terms:"uniform uniforms dress dresses dressed dressing clothes clothing wear wearing worn sportswear sandals shoes shoe size sizes colour colors schoolwear",phrases:["school dress","what to wear","uniform list","uniform price"]},
    {id:"transport",label:"Transport",terms:"transport transportation bus buses route routes routed pickup pickups pick drop dropoff driver drivers ride service area areas fare",phrases:["pick up","drop off","school bus","bus route"]},
    {id:"records",label:"Results & records",terms:"result results report reports card cards reportcard reportcards record records recorded portal login attendance attendances score scores mark marks certificate certificates transcript password account",phrases:["report card","report cards","school result","pupil record","parent portal","check result"]},
    {id:"safety",label:"Safety & safeguarding",terms:"safe safer safety safeguarding protection protect protected protecting bully bullies bullied bullying concern concerns abuse neglect emergency emergencies harm harmful welfare report",phrases:["child protection","raise a concern","keep children safe","report bullying"]},
    {id:"careers",label:"Jobs & careers",terms:"job jobs career careers vacancy vacancies vacant work working worker staff staffing recruit recruited recruitment employ employment employee teacher teachers cv interview",phrases:["work at school","teaching job","job opening","send cv"]},
    {id:"homework",label:"Homework",terms:"homework assignment assignments assigned schoolwork classwork practice project projects due revision revise study studying exercise exercises",phrases:["home work","take home work","holiday work"]},
    {id:"news",label:"News & notices",terms:"news update updates updated notice notices announcement announcements announced event events latest current information graduation excursion ceremony",phrases:["what is new","latest news","school notice","recent update"]},
    {id:"identity",label:"School identity",terms:"anthem creed pledge motto song songs lyric lyrics mission vision history story founder founded proprietress registration approval centre",phrases:["our god is able","school song","about the school","who founded"]},
    {id:"shop",label:"Books & supplies",terms:"shop shopping supplies supply stationery books book bag bags crayon crayons pen pens pencil pencils notebook notebooks textbook textbooks workbook workbooks stock buy buying purchase item items",phrases:["school shop","where to buy","school supplies","book list"]},
    {id:"alumni",label:"Former pupils",terms:"alumni alumnus graduate graduates graduated graduation former pupil pupils student students history ceremony set yearbook",phrases:["former student","former pupil","past pupil","graduation history"]},
    {id:"feedback",label:"Feedback & complaints",terms:"feedback suggestion suggestions suggest complaint complaints complain complained problem problems issue issues experience improve improvement headmistress",phrases:["make a complaint","send feedback","report a problem","website problem","not working"]},
    {id:"privacy",label:"Privacy",terms:"privacy private personal data information consent photograph photo photos picture pictures delete deletion remove removal rights confidential confidentiality",phrases:["child photo","personal information","remove photo","data protection"]},
    {id:"website",label:"Website help",terms:"website webpage page pages link links broken error errors loading load find finding search searching missing confusing confusion problem problems issue issues",phrases:["cannot find","cant find","not working","broken page","website help"]}
  ];
  var STOP = new Set("a an and are as at be been but by can could did do does for from had has have how i if in into is it me my of on or our please should so that the their them there these they this to us was we were what when where which who why will with would you your child school treasure academy".split(" "));
  var IRREGULAR = {fees:"fee",paid:"pay",paying:"pay",children:"child",people:"person",men:"man",women:"woman",learnt:"learn",learned:"learn",taught:"teach",teachers:"teach",teaching:"teach",classes:"class",addresses:"address",buses:"bus",news:"news",clothes:"clothes",admissions:"admission",applications:"application",enquiries:"enquiry",queries:"query",results:"result",supplies:"supply",careers:"career",vacancies:"vacancy",stories:"story",photos:"photo"};

  function esc(value) { return window.U && U.esc ? U.esc(value) : String(value).replace(/[&<>"']/g, function (ch) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]; }); }
  function normal(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function rawTokens(value) { return normal(value).split(/\s+/).filter(Boolean); }
  function stemWord(word) {
    word = normal(word);
    if (!word) return "";
    if (IRREGULAR[word]) return IRREGULAR[word];
    if (word.length <= 3) return word;
    if (/ies$/.test(word) && word.length > 5) word = word.slice(0, -3) + "y";
    else if (/sses$/.test(word)) word = word.slice(0, -2);
    else if (/ing$/.test(word) && word.length > 6) word = word.slice(0, -3);
    else if (/ed$/.test(word) && word.length > 5) word = word.slice(0, -2);
    else if (/ers$/.test(word) && word.length > 6) word = word.slice(0, -1);
    else if (/s$/.test(word) && !/(ss|us|is)$/.test(word) && word.length > 4) word = word.slice(0, -1);
    if (/(.)\1$/.test(word) && word.length > 4) word = word.slice(0, -1);
    return IRREGULAR[word] || word;
  }
  FAMILIES.forEach(function (family) {
    family.words = rawTokens(family.terms);
    family.roots = new Set(family.words.map(stemWord));
    family.phrases = family.phrases.map(normal);
  });
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    var previous = Array.from({length:b.length + 1}, function (_, i) { return i; });
    for (var i = 1; i <= a.length; i++) {
      var current = [i];
      for (var j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
    return previous[b.length];
  }
  function familyMatches(text, tokens, roots) {
    var phraseFound = [], termFound = [];
    FAMILIES.forEach(function (family) {
      var phrase = family.phrases.some(function (item) { return text.indexOf(item) >= 0; });
      var term = tokens.some(function (word, index) {
        if (family.words.indexOf(word) >= 0 || family.roots.has(roots[index])) return true;
        if (word.length < 6) return false;
        return family.words.some(function (candidate) { return candidate.length >= 6 && distance(word, candidate) <= 1; });
      });
      if (phrase) phraseFound.push(family);
      else if (term) termFound.push(family);
    });
    return phraseFound.concat(termFound);
  }
  function analyze(value) {
    var text = normal(value);
    var allTokens = rawTokens(text);
    var meaningful = allTokens.filter(function (word) { return word.length > 1 && !STOP.has(word); });
    var roots = meaningful.map(stemWord);
    var families = familyMatches(text, meaningful, roots);
    var expanded = new Set(meaningful);
    families.forEach(function (family) { family.words.forEach(function (word) { expanded.add(word); }); });
    return {text:text,tokens:meaningful,roots:roots,families:families,expanded:Array.from(expanded)};
  }
  function fuzzyLimit(word) { return word.length >= 7 ? 2 : word.length >= 4 ? 1 : 0; }
  function tokenMatch(word, root, candidate, candidateRoot) {
    if (candidate === word) return 4;
    if (candidateRoot === root && root.length > 2) return 3;
    if (word.length >= 4 && (candidate.indexOf(word) === 0 || word.indexOf(candidate) === 0)) return 2;
    var limit = fuzzyLimit(word);
    return limit && candidate.length >= 4 && distance(word, candidate) <= limit ? 1 : 0;
  }
  function fieldMatch(analysis, field) {
    var words = rawTokens(field), roots = words.map(stemWord), best = [];
    analysis.tokens.forEach(function (word, i) {
      var value = 0;
      words.forEach(function (candidate, j) { value = Math.max(value, tokenMatch(word, analysis.roots[i], candidate, roots[j])); });
      best.push(value);
    });
    return best;
  }
  function score(entry, query) {
    var q = analyze(query);
    if (!q.text) return Number(entry.p || 0);
    var title = normal(entry.t), description = normal(entry.d), category = normal(entry.c), keywords = normal(entry.k);
    var titleA = analyze(title), allA = analyze(title + " " + description + " " + category + " " + keywords);
    var total = Number(entry.p || 0), titleMatch = fieldMatch(q, title), keywordMatch = fieldMatch(q, keywords), descMatch = fieldMatch(q, description), categoryMatch = fieldMatch(q, category);
    if (title === q.text) total += 150;
    if (title.indexOf(q.text) >= 0) total += 82;
    if (keywords.indexOf(q.text) >= 0) total += 40;
    if (description.indexOf(q.text) >= 0) total += 25;
    q.tokens.forEach(function (_, i) {
      total += [0,14,20,27,36][titleMatch[i] || 0];
      total += [0,5,8,11,15][keywordMatch[i] || 0];
      total += [0,2,3,5,7][descMatch[i] || 0];
      total += [0,3,5,7,10][categoryMatch[i] || 0];
    });
    var entryFamilyIds = new Set(allA.families.map(function (family) { return family.id; }));
    var titleFamilyIds = new Set(titleA.families.map(function (family) { return family.id; }));
    var declaredFamilyIds = new Set(rawTokens(entry.f || ""));
    q.families.forEach(function (family, familyIndex) {
      if (entryFamilyIds.has(family.id)) total += 20;
      if (titleFamilyIds.has(family.id)) total += 16;
      if (declaredFamilyIds.has(family.id)) total += familyIndex === 0 ? 72 : 20;
    });
    if (q.tokens.length && q.tokens.every(function (_, i) { return Math.max(titleMatch[i] || 0, keywordMatch[i] || 0, descMatch[i] || 0, categoryMatch[i] || 0) >= 1 || q.families.some(function (family) { return entryFamilyIds.has(family.id) || declaredFamilyIds.has(family.id); }); })) total += 30;
    if (q.families.length && q.families.every(function (family) { return entryFamilyIds.has(family.id) || declaredFamilyIds.has(family.id); })) total += 18;
    return total;
  }
  function highlight(value, query) {
    var safe = esc(value), words = analyze(query).tokens.filter(function (word) { return word.length > 2; }).slice(0, 5);
    if (!words.length) return safe;
    try {
      var pattern = words.map(function (word) { return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|");
      return safe.replace(new RegExp("(" + pattern + ")", "ig"), "<mark>$1</mark>");
    } catch (error) { return safe; }
  }

  var ANSWERS = {
    location:{title:"Treasure Academy is in Ageva, Okene",text:"The campus is opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State. Call before visiting, especially during holidays or breaks.",actions:[["Plan a visit","/contact#visit"],["Call the school","tel:+2348141943478"]]},
    admissions:{title:"Start admission through the verified school office",text:"The school serves Pre-Nursery, Nursery 1–2, Primary 1–4 and Primary 6. Confirm availability and documents with the office; payment details appear only in the signed-in portal or official invoice.",actions:[["Admission steps","/admissions#apply"],["Create an admission request","/request-centre?type=admission"]]},
    fees:{title:"Current new-intake charges and nursery book lists",text:"The approved list records school fees of ₦8,500 per term within total admission charges of ₦26,000. Pre-Nursery, Nursery 1 and Nursery 2 book packages are also published; writing-material prices are not included.",actions:[["View fees and book lists","/fees"],["Ask about a class","/request-centre?type=fee_schedule"]]},
    contact:{title:"Use a verified school contact",text:"Call +234 814 194 3478, WhatsApp 09063932487, or email treasuregroupofschool@gmail.com. You must tap Send in the chosen service.",actions:[["Contact options","/contact"],["Call now","tel:+2348141943478"]]},
    classes:{title:"Classes run from Pre-Nursery to Primary 6",text:"Explore Pre-Nursery, Nursery 1–2, Primary 1–4 and Primary 6. The office confirms placement and availability.",actions:[["Explore classes","/academics"],["Ask about a class","/request-centre?type=class_enquiry"]]},
    records:{title:"Use the secure parent and staff portal",text:"Parents with a school-issued account can view linked children, published results and payment records. Staff access is limited by role and class assignment. If secure login is not yet active, contact the verified office.",actions:[["Secure portal","portal/login.html"],["Create an account-help request","/request-centre?type=account_help"]]},
    time:{title:"Published school-day guidance",text:"The published guidance is Monday to Friday, 7:30am–3:00pm. Confirm holiday, break and special-day arrangements before visiting.",actions:[["Visit information","/contact#visit"],["Calendar guidance","/calendar"]]},
    safety:{title:"Raise a safeguarding concern promptly",text:"Speak to the Headmistress or a teacher, call the school, or use verified WhatsApp. Do not place a child’s sensitive information in public search.",actions:[["Safeguarding guidance","/safeguarding"],["Call the school","tel:+2348141943478"]]},
    website:{title:"Get help with the website",text:"If a page is unclear, missing or not working, send a voluntary problem report. The report can include safe device and page diagnostics, never form values or raw search text.",actions:[["Report a website problem","/website-help"],["Browse all pages","/site-map"]]}
  };
  var ANSWER_ORDER = ["safety","records","fees","admissions","location","time","classes","contact","website"];
  function directAnswer(query) {
    if (window.TAVerifiedAnswers && typeof window.TAVerifiedAnswers.answer === "function") {
      return window.TAVerifiedAnswers.answer(query);
    }
    var analysis = analyze(query), ids = analysis.families.map(function (family) { return family.id; });
    if (ids.indexOf("safety") >= 0 && /\b(safe|safety|safeguard|protect|bully|bullying|abuse|neglect|harm|welfare|concern)\b/i.test(query)) return ANSWERS.safety;
    if (ids.indexOf("records") >= 0) return ANSWERS.records;
    var id = ANSWER_ORDER.find(function (item) { return item !== "safety" && item !== "records" && ids.indexOf(item) >= 0; });
    return id ? ANSWERS[id] : null;
  }
  function primaryFamily(query) {
    var analysis = analyze(query);
    return analysis.families.length ? analysis.families[0] : null;
  }
  window.TA_SMART_SEARCH = {normal:normal, stem:stemWord, analyze:analyze, score:score, directAnswer:directAnswer, primaryFamily:primaryFamily, families:FAMILIES};
  if (!form || !input || !status || !answerBox || !resultsBox) return;

  function renderAnswer(answer) {
    if (!answer) { answerBox.innerHTML = ""; return; }
    answerBox.innerHTML = '<article class="answer-card"><div class="answer-icon" aria-hidden="true">✓</div><div><h2>' + esc(answer.title) + '</h2><p>' + esc(answer.text) + '</p><div class="answer-actions">' + answer.actions.map(function (action) {
      var external = /^https?:/.test(action[1]) ? ' target="_blank" rel="noopener"' : "";
      return '<a href="' + esc(action[1]) + '"' + external + '>' + esc(action[0]) + '</a>';
    }).join("") + '</div></div></article>';
  }
  var previousSearch = false;
  var currentFamily = "other";
  var remoteSearchActive = null;
  var searchGateReady = Promise.resolve();
  function renderLocalResults(query, submitted) {
    var q = String(query || "").trim(), analysis = analyze(q), family = analysis.families[0] || null;
    currentFamily = family ? family.id : "other";
    var answer = directAnswer(q);
    renderAnswer(answer);
    var ranked;
    if (q.length < 2) ranked = INDEX.slice().sort(function (a, b) { return Number(b.p || 0) - Number(a.p || 0); }).slice(0, 7);
    else ranked = INDEX.map(function (entry) { return {entry:entry, score:score(entry, q)}; }).filter(function (item) { return item.score >= 16; }).sort(function (a, b) { return b.score - a.score || a.entry.t.localeCompare(b.entry.t); }).slice(0, 10).map(function (item) { return item.entry; });
    if (q.length < 2) status.textContent = "Popular destinations";
    else {
      var understood = family ? "Related topic: " + family.label + ". " : "";
      status.textContent = understood + (answer ? (answer.verified ? "Verified answer plus " : "Safe next step plus ") : "") + ranked.length + " useful page" + (ranked.length === 1 ? "" : "s") + ".";
    }
    if (submitted && q.length >= 2 && window.TA_VISITOR_INSIGHTS) {
      TA_VISITOR_INSIGHTS.record(previousSearch ? "search_refine" : "search", {family:currentFamily,resultCount:ranked.length,hasAnswer:!!answer});
      previousSearch = true;
    }
    if (!ranked.length) {
      resultsBox.innerHTML = '<div class="search-empty"><h2>No useful page yet</h2><p>Try one or two broader words. You can also <a href="/site-map">browse every section</a> or <a href="/website-help">report what you could not find</a>.</p></div>';
      return;
    }
    resultsBox.innerHTML = ranked.map(function (entry) {
      return '<a class="search-result" href="' + esc(entry.u) + '" data-search-result><span><h2>' + highlight(entry.t, q) + '</h2><p>' + highlight(entry.d, q) + '</p><span class="result-meta">' + esc(entry.c) + '</span></span><span class="arrow" aria-hidden="true">→</span></a>';
    }).join("");
    resultsBox.querySelectorAll("[data-search-result]").forEach(function (link) {
      link.addEventListener("click", function () { if (window.TA_VISITOR_INSIGHTS) TA_VISITOR_INSIGHTS.record("search_result", {family:currentFamily}); });
    });
  }
  function renderRemote(payload, query, submitted) {
    currentFamily = String(payload.family || "other");
    var rows = Array.isArray(payload.results) ? payload.results : [];
    if (payload.answer) {
      var sources = Array.isArray(payload.answer.sources) ? payload.answer.sources : [];
      renderAnswer({
        title: payload.answer.title,
        text: payload.answer.text + (payload.answer.reviewedOn ? " Reviewed " + payload.answer.reviewedOn + "." : ""),
        actions: sources.map(function (source) { return ["Supporting source: " + source.title, source.url]; }),
        verified: true
      });
    } else if (payload.state === "private") {
      renderAnswer({ title: "Private information requires secure sign-in", text: payload.message, actions: [["Open secure portal", "/portal/login.html"], ["Read privacy guidance", "/privacy"]], verified: true });
    } else renderAnswer(null);

    status.textContent = payload.message || (rows.length + " published source" + (rows.length === 1 ? "" : "s") + " found.");
    if (submitted && window.TA_VISITOR_INSIGHTS) {
      TA_VISITOR_INSIGHTS.record(previousSearch ? "search_refine" : "search", {family:currentFamily,resultCount:rows.length,hasAnswer:!!payload.answer});
      previousSearch = true;
    }
    if (!rows.length) {
      var heading = payload.state === "rate_limited" ? "Please wait" : payload.state === "unavailable" ? "Search is temporarily unavailable" : "No verified answer found";
      resultsBox.innerHTML = '<div class="search-empty"><h2>' + esc(heading) + '</h2><p>' + esc(payload.message || "This information has not been verified or published yet. Treasure Academy Search will not guess.") + ' <a href="/site-map">Browse the site map</a> or <a href="/contact">contact the school</a>.</p></div>';
      return;
    }
    resultsBox.innerHTML = rows.map(function (entry) {
      var reviewed = entry.reviewedOn ? " · reviewed " + entry.reviewedOn : "";
      return '<a class="search-result" href="' + esc(entry.url) + '" data-search-result><span><h2>' + highlight(entry.title, query) + '</h2><p>' + highlight(entry.summary, query) + '</p><span class="result-meta">' + esc(String(entry.kind || "page").replace(/_/g, " ") + reviewed) + '</span></span><span class="arrow" aria-hidden="true">→</span></a>';
    }).join("");
  }

  var searchGeneration = 0;
  async function run(query, updateUrl, submitted) {
    query = String(query || "").trim();
    input.value = query;
    if (updateUrl) {
      try { history.replaceState(null, "", "/search"); } catch (error) {}
    }
    if (query.length < 2) { renderLocalResults(query, submitted); return; }
    var generation = ++searchGeneration;
    if (remoteSearchActive === null) {
      status.textContent = "Checking current Search availability…";
      await searchGateReady;
      if (generation !== searchGeneration) return;
    }
    if (remoteSearchActive === false) { renderLocalResults(query, submitted); return; }
    status.textContent = "Searching current published information…";
    try {
      var response = await fetch('/api/public/search', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify({ query: query })
      });
      if (generation !== searchGeneration) return;
      if (response.status === 404) { renderLocalResults(query, submitted); return; }
      var payload = await response.json().catch(function () { return null; });
      if (!payload) throw new Error('Invalid Search response');
      if (!response.ok && !['rate_limited', 'unavailable'].includes(payload.state)) throw new Error('Search request failed');
      renderRemote(payload, query, submitted);
    } catch (error) {
      if (generation !== searchGeneration) return;
      renderRemote({ state: 'unavailable', message: 'Search is temporarily unavailable. You can still browse the site map or contact the school.', results: [] }, query, submitted);
    }
  }

  form.addEventListener("submit", function (event) { event.preventDefault(); run(input.value.trim(), true, true); });
  input.addEventListener("input", function () {
    searchGeneration += 1;
    var query = input.value.trim();
    if (!query) { renderLocalResults("", false); return; }
    if (remoteSearchActive === false) { renderLocalResults(query, false); return; }
    renderAnswer(null);
    resultsBox.innerHTML = "";
    status.textContent = query.length < 2 ? "Enter at least two characters." : "Press Search to check current published information.";
  });
  document.querySelectorAll("[data-query]").forEach(function (button) {
    button.addEventListener("click", function () { run(button.dataset.query || "", true, true); input.focus(); });
  });
  var initial = "";
  try {
    initial = sessionStorage.getItem("taa_pending_search") || "";
    sessionStorage.removeItem("taa_pending_search");
    // Public Search never reads a raw query from the URL. This also clears old
    // bookmarked query strings before any search request is made.
    if (location.search) history.replaceState(null, "", "/search");
  } catch (error) {}
  if (!initial) renderLocalResults("", false);
  searchGateReady = fetch('/api/portal-config', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then(function (response) { return response.ok ? response.json() : Promise.reject(new Error('Config unavailable')); })
    .then(function (config) {
      remoteSearchActive = config.publicSearchEnabled === true;
      if (initial) run(initial, false, true);
      else if (input.value.trim() && remoteSearchActive === false) renderLocalResults(input.value.trim(), false);
    })
    .catch(function () {
      remoteSearchActive = false;
      if (initial) run(initial, false, true);
      else if (input.value.trim()) renderLocalResults(input.value.trim(), false);
    });
  if (window.TAVerifiedAnswers && typeof window.TAVerifiedAnswers.load === "function") {
    fetch('/api/public-information', {headers:{Accept:'application/json'},cache:'no-store'})
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) {
        if (!payload || !Array.isArray(payload.items)) return;
        window.TAVerifiedAnswers.load(payload.items);
        if (input.value.trim().length < 2) renderLocalResults(input.value.trim(), false);
      }).catch(function () {});
  }
})();

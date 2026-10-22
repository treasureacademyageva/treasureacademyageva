/* Intent-aware, typo-tolerant, on-device search. No network request or AI API. */
(function () {
  "use strict";
  var INDEX = window.TA_SEARCH_INDEX || [];
  var form = document.getElementById("smartSearchForm");
  var input = document.getElementById("smartQuery");
  var status = document.getElementById("searchStatus");
  var answerBox = document.getElementById("smartAnswer");
  var resultsBox = document.getElementById("smartResults");

  var SYNONYMS = [
    ["apply","application","admission","admissions","enrol","enroll","register","join"],
    ["fees","fee","tuition","cost","costs","price","prices","payment","pay","money","amount"],
    ["location","address","where","direction","directions","map","visit","campus"],
    ["phone","call","contact","number","whatsapp","email","reach"],
    ["classes","class","grade","grades","level","levels","primary","nursery","creche"],
    ["calendar","date","dates","term","resumption","holiday","closing","when"],
    ["uniform","dress","clothes","wear","sportswear"],
    ["transport","bus","route","pickup","dropoff"],
    ["result","results","portal","login","attendance","record","records"],
    ["safety","safe","safeguarding","protection","bullying","concern","report"],
    ["job","jobs","career","careers","vacancy","vacancies","work","teacher"],
    ["homework","assignment","assignments","schoolwork"],
    ["news","update","updates","notice","notices","announcement","announcements"],
    ["anthem","creed","pledge","motto","song"],
    ["shop","supplies","stationery","books","bag","crayons"]
  ];

  function esc(value) { return window.U && U.esc ? U.esc(value) : String(value); }
  function normal(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function tokens(value) { return normal(value).split(/\s+/).filter(function (word) { return word.length > 1; }); }
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 9;
    var previous = Array.from({length:b.length + 1}, function (_, i) { return i; });
    for (var i = 1; i <= a.length; i++) {
      var current = [i];
      for (var j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
    return previous[b.length];
  }
  function expandedWords(query) {
    var original = tokens(query), expanded = new Set(original);
    original.forEach(function (word) {
      SYNONYMS.forEach(function (group) {
        if (group.indexOf(word) >= 0) group.forEach(function (item) { expanded.add(item); });
      });
    });
    return {original:original, all:Array.from(expanded)};
  }
  function wordMatch(needle, haystackWords) {
    return haystackWords.some(function (word) {
      var edits = needle.length >= 4 && word.length >= 4 ? distance(needle, word) : 9;
      return word === needle || word.indexOf(needle) === 0 || needle.indexOf(word) === 0 || edits <= 1 || (needle.length >= 6 && word.length >= 6 && edits <= 2);
    });
  }
  function score(entry, query) {
    var q = normal(query), expanded = expandedWords(query);
    var title = normal(entry.t), description = normal(entry.d), category = normal(entry.c), keywords = normal(entry.k);
    var allText = title + " " + description + " " + category + " " + keywords;
    var allWords = tokens(allText), total = Number(entry.p || 0);
    if (title === q) total += 140;
    if (title.indexOf(q) >= 0) total += 90;
    if (keywords.indexOf(q) >= 0) total += 42;
    if (description.indexOf(q) >= 0) total += 28;
    expanded.original.forEach(function (word) {
      if (tokens(title).some(function (candidate) { return candidate === word; })) total += 30;
      else if (wordMatch(word, tokens(title))) total += 19;
      if (wordMatch(word, tokens(category))) total += 13;
      if (wordMatch(word, tokens(keywords))) total += 9;
      if (wordMatch(word, tokens(description))) total += 4;
    });
    expanded.all.slice(expanded.original.length).forEach(function (word) {
      if (wordMatch(word, allWords)) total += 2;
    });
    if (expanded.original.length && expanded.original.every(function (word) { return wordMatch(word, allWords); })) total += 32;
    return total;
  }
  function highlight(value, query) {
    var safe = esc(value), words = tokens(query).filter(function (word) { return word.length > 2; }).slice(0, 5);
    if (!words.length) return safe;
    try {
      var pattern = words.map(function (word) { return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|");
      return safe.replace(new RegExp("(" + pattern + ")", "ig"), "<mark>$1</mark>");
    } catch (error) { return safe; }
  }

  var ANSWERS = [
    {test:/\b(where|address|location|direction|directions|map|visit|campus)\b/i,title:"Treasure Academy is in Ageva, Okene",text:"The campus is opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State. Call before visiting, especially during holidays or breaks.",actions:[["Plan a visit","contact.html#visit"],["Call the school","tel:+2348141943478"]]},
    {test:/\b(apply|application|admission|admissions|enrol|enroll|register|join)\b/i,title:"Start admission through the verified school office",text:"Treasure Academy serves Creche, Pre-Nursery, Nursery 1–2 and Primary 1–6. Confirm class availability, the current form, documents and bank details before paying.",actions:[["Admission steps","admissions.html#apply"],["WhatsApp admissions","https://wa.me/2349063932487?text=Hello%20Treasure%20Academy%2C%20I%20want%20to%20ask%20about%20admission."]]},
    {test:/\b(fee|fees|tuition|cost|costs|price|prices|payment|pay|amount|how much)\b/i,title:"Request the current written fee schedule",text:"Current fee amounts are not published because they must be confirmed by class and term. Ask the verified office for the written schedule and confirm the bank account before transferring.",actions:[["Fee guidance","fees.html"],["Request current fees","https://wa.me/2349063932487?text=Hello%20Treasure%20Academy%2C%20please%20send%20the%20current%20written%20fee%20schedule."]]},
    {test:/\b(phone|call|contact|number|whatsapp|email|reach)\b/i,title:"Use a verified school contact",text:"Call +234 814 194 3478, WhatsApp 09063932487, or email treasuregroupofschool@gmail.com. The website never claims a message was received until you send it through the chosen service.",actions:[["All contact options","contact.html"],["Call now","tel:+2348141943478"]]},
    {test:/\b(class|classes|grade|grades|level|levels|primary|nursery|creche)\b/i,title:"Classes run from Creche to Primary 6",text:"Explore Creche, Pre-Nursery, Nursery 1–2 and Primary 1–6. The office confirms current placement guidance and availability.",actions:[["Explore all classes","academics.html"],["Ask about a class","https://wa.me/2349063932487?text=Hello%20Treasure%20Academy%2C%20I%20want%20to%20ask%20about%20a%20class."]]},
    {test:/\b(result|results|portal|login|attendance|report card|record)\b/i,title:"Private pupil records are not available through the public website",text:"The old browser-only portal is retired. Parents and authorised guardians should contact the verified school office for results, attendance or record support.",actions:[["Parent support","portal/login.html"],["WhatsApp the office","https://wa.me/2349063932487?text=Hello%20Treasure%20Academy%2C%20I%20need%20parent%20support%20with%20a%20private%20school%20record."]]},
    {test:/\b(open|close|hours|time|school day)\b/i,title:"Published school-day guidance",text:"The published guidance is Monday to Friday, 7:30am–3:00pm. Call before a visit and confirm any holiday, break or special-day arrangement.",actions:[["Visit information","contact.html#visit"],["Calendar guidance","calendar.html"]]},
    {test:/\b(safe|safety|safeguarding|protection|bully|bullying|concern|report)\b/i,title:"Raise a safeguarding concern promptly",text:"Speak to the Headmistress or a teacher, call the verified school line, or use the verified WhatsApp contact. Do not place a child’s sensitive information in public search.",actions:[["Safeguarding guidance","safeguarding.html"],["Call the school","tel:+2348141943478"]]}
  ];

  function directAnswer(query) {
    return ANSWERS.find(function (answer) { return answer.test.test(query); }) || null;
  }
  window.TA_SMART_SEARCH = {normal:normal, score:score, directAnswer:directAnswer};
  if (!form || !input || !status || !answerBox || !resultsBox) return;

  function renderAnswer(answer) {
    if (!answer) { answerBox.innerHTML = ""; return; }
    answerBox.innerHTML = '<article class="answer-card"><div class="answer-icon" aria-hidden="true">✓</div><div><h2>' + esc(answer.title) + '</h2><p>' + esc(answer.text) + '</p><div class="answer-actions">' + answer.actions.map(function (action) {
      var external = /^https?:/.test(action[1]) ? ' target="_blank" rel="noopener"' : "";
      return '<a href="' + esc(action[1]) + '"' + external + '>' + esc(action[0]) + '</a>';
    }).join("") + '</div></div></article>';
  }
  function renderResults(query) {
    var q = String(query || "").trim();
    var answer = directAnswer(q);
    renderAnswer(answer);
    var ranked;
    if (q.length < 2) ranked = INDEX.slice().sort(function (a, b) { return Number(b.p || 0) - Number(a.p || 0); }).slice(0, 8);
    else ranked = INDEX.map(function (entry) { return {entry:entry, score:score(entry, q)}; }).filter(function (item) { return item.score >= 12; }).sort(function (a, b) { return b.score - a.score || a.entry.t.localeCompare(b.entry.t); }).slice(0, 12).map(function (item) { return item.entry; });
    if (q.length < 2) status.textContent = "Popular destinations";
    else status.textContent = (answer ? "Direct answer and " : "") + ranked.length + " matching page" + (ranked.length === 1 ? "" : "s") + " for “" + q + "”";
    if (!ranked.length) {
      resultsBox.innerHTML = '<div class="search-empty"><h2>No close page match</h2><p>Try fewer words, browse <a href="explore.html">all website sections</a>, or <a href="contact.html">ask the school office</a>.</p></div>';
      return;
    }
    resultsBox.innerHTML = ranked.map(function (entry) {
      return '<a class="search-result" href="' + esc(entry.u) + '"><span><h2>' + highlight(entry.t, q) + '</h2><p>' + highlight(entry.d, q) + '</p><span class="result-meta">' + esc(entry.c) + '</span></span><span class="arrow" aria-hidden="true">→</span></a>';
    }).join("");
  }
  function run(query, updateUrl) {
    input.value = query;
    renderResults(query);
    if (updateUrl) {
      try { history.replaceState(null, "", query ? "search.html?q=" + encodeURIComponent(query) : "search.html"); } catch (error) {}
    }
  }

  form.addEventListener("submit", function (event) { event.preventDefault(); run(input.value.trim(), true); });
  var timer;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { renderResults(input.value.trim()); }, 100);
  });
  document.querySelectorAll("[data-query]").forEach(function (button) {
    button.addEventListener("click", function () { run(button.dataset.query || "", true); input.focus(); });
  });
  var initial = "";
  try { initial = new URLSearchParams(location.search).get("q") || ""; } catch (error) {}
  run(initial, false);
})();

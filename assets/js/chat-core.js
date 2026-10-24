/* ============================================================================
   Treasure Support AI - conversation engine
   ----------------------------------------------------------------------------
   Owns everything that is not the pixels: history, the answer flow, the
   resolved / not-resolved loop, the urgency question that decides WhatsApp vs
   contact form, and the analytics the developer console reads.

   History rules, as specified:
     guest      sessionStorage. Closing the browser ends it. Moving between
                pages keeps it, because that is one visit.
     logged in  localStorage per account, and anything said as a guest in this
                visit is merged in on login so nothing is lost.
   ========================================================================== */
(function (global) {
  "use strict";

  var GUEST_KEY = "treasure_chat_guest_v1";     /* sessionStorage */
  var USER_KEY = "treasure_chat_user_v1";       /* localStorage, keyed by account */
  var STATS_KEY = "treasure_chat_stats_v1";     /* localStorage, developer only */
  var WHATSAPP = "09063932487";

  function now() { return Date.now(); }
  function uid() { return "m" + now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function readJSON(store, key, fallback) {
    try { var v = store.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(store, key, val) {
    try { store.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  /* Who is asking. Answers that depend on a pupil's own record need this. */
  function session() {
    try {
      if (global.Auth && typeof Auth.get === "function") return Auth.get();
      var raw = localStorage.getItem("treasure_session_v1") ||
                sessionStorage.getItem("treasure_session_v1");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function accountKey() {
    var s = session();
    if (!s) return null;
    return USER_KEY + ":" + (s.refId || s.id || s.adm || s.name || "user");
  }

  var Core = {
    WHATSAPP: WHATSAPP,
    messages: [],
    pending: null,          /* awaiting feedback / urgency */
    ragReady: false,
    apiBase: null,          /* set when a FastAPI backend is configured */

    /* ---------------------------------------------------------------- boot */
    init: function (kb) {
      if (global.TARag && kb) { global.TARag.load(kb); this.ragReady = true; }
      try {
        var cfg = JSON.parse(localStorage.getItem("treasure_ai_cfg") || "null");
        if (cfg && cfg.url && cfg.enabled !== false) this.apiBase = String(cfg.url).replace(/\/+$/, "");
      } catch (e) {}
      this.messages = this.loadHistory();
      return this;
    },

    /* ------------------------------------------------------------- history */
    loadHistory: function () {
      var key = accountKey();
      if (key) {
        var mine = readJSON(localStorage, key, null);
        if (mine && mine.length) return mine;
        /* First load after signing in: adopt whatever was said as a guest. */
        var guest = readJSON(sessionStorage, GUEST_KEY, []);
        if (guest.length) { writeJSON(localStorage, key, guest); return guest; }
        return [];
      }
      return readJSON(sessionStorage, GUEST_KEY, []);
    },

    saveHistory: function () {
      var key = accountKey();
      var trimmed = this.messages.slice(-120);
      if (key) return writeJSON(localStorage, key, trimmed);
      return writeJSON(sessionStorage, GUEST_KEY, trimmed);
    },

    /* Called after a successful login: fold the guest thread into the account
       so the parent does not lose the questions that led them to sign in. */
    syncGuestToAccount: function () {
      var key = accountKey();
      if (!key) return false;
      var guest = readJSON(sessionStorage, GUEST_KEY, []);
      if (!guest.length) return false;
      var mine = readJSON(localStorage, key, []);
      var seen = {};
      mine.forEach(function (m) { seen[m.id] = 1; });
      guest.forEach(function (m) { if (!seen[m.id]) mine.push(m); });
      mine.sort(function (a, b) { return a.t - b.t; });
      writeJSON(localStorage, key, mine.slice(-120));
      try { sessionStorage.removeItem(GUEST_KEY); } catch (e) {}
      this.messages = mine.slice(-120);
      return true;
    },

    clearHistory: function () {
      var key = accountKey();
      try {
        if (key) localStorage.removeItem(key);
        sessionStorage.removeItem(GUEST_KEY);
      } catch (e) {}
      this.messages = [];
    },

    push: function (role, html, extra) {
      var m = { id: uid(), role: role, html: html, t: now() };
      if (extra) for (var k in extra) { if (extra.hasOwnProperty(k)) m[k] = extra[k]; }
      this.messages.push(m);
      this.saveHistory();
      return m;
    },

    /* --------------------------------------------------------- the answer */
    /* Returns a plain object the UI renders. No DOM here on purpose: the flow
       is testable without a browser. */
    respond: function (question) {
      var q = String(question || "").trim();
      if (!q) return null;

      /* Mid-flow answers take priority over retrieval. */
      if (this.pending && this.pending.kind === "urgency") {
        var u = this.readUrgency(q);
        if (u) return this.handoff(u);
      }
      if (this.pending && this.pending.kind === "feedback") {
        /* "thank you" and "goodbye" are courtesy, not a rating. Treating them
           as a thumbs-up both skews the satisfaction figure and makes the bot
           reply with the wrong thing. Let small talk answer, and keep the
           feedback question open for a real yes or no. */
        if (!/^(thanks|thank you|thank u|nice one|well done|ok thanks|bye|goodbye|see you|later)\b/i
              .test(String(q).trim())) {
          var fb = this.readFeedback(q);
          if (fb !== null) return this.recordFeedback(fb);
        }
      }

      /* Conversation memory. "How much is Primary 3?" then "and Primary 4?"
         is one conversation, not two unrelated questions. Carry the previous
         topic forward when the new message is only a fragment, which is how
         people actually speak. */
      /* The social layer first: greetings, thanks and goodbyes, in any of
         the languages our families speak, typed with any number of slips.
         A message that is ALL social gets a warm short reply; "hello, how
         much are the fees" is a fee question that opens politely. Peeling
         BEFORE the context layer matters: "good afternoon, and primary 4?"
         must be seen by the context layer as the fragment it is, not as a
         greeting that pollutes the topic. */
      var peel = global.TAEntities ? global.TAEntities.peelSocial(q)
                                   : { kind: null, info: null, rest: q };
      if (peel.kind && !peel.rest) return this.socialAnswer(peel);
      if (peel.kind && peel.rest) q = peel.rest;

      q = this.withContext(q);

      /* "Who are you?", "what can you do for me?" - questions about the
         assistant itself. They have no page and no data; they are answered
         here, honestly, or handed to the school flow below. */
      var id = this.identity(q);
      if (id) return id;

      var greet = this.smallTalk(q);
      if (greet) return greet;

      /* Shared, owner-verified public facts take precedence over the legacy
         retrieval branches. Search uses the same engine. Low-confidence
         Search escalation remains outside this branch so the conversation can
         still try safe KB retrieval before it offers a human/update route. */
      if (global.TAVerifiedAnswers && typeof global.TAVerifiedAnswers.answer === "function") {
        var verified = global.TAVerifiedAnswers.answer(q);
        if (verified && verified.verified && verified.confidence >= 0.9) {
          var verifiedLinks = (verified.actions || []).map(function (action) {
            var href = String(action[1] || "");
            if (!/^(\/|tel:)/.test(href)) return "";
            return '<a class="chat-link" href="' + esc(href) + '">' + esc(action[0]) + '</a>';
          }).filter(Boolean).join(" &nbsp; ");
          this.stat("asked", q);
          this.stat("answered", q, verified.confidence, verified.title);
          this.pending = { kind: "feedback", question: q, title: verified.title };
          return { type: "answer", html: "<b>" + esc(verified.title) + "</b><br>" + esc(verified.text) + (verifiedLinks ? "<br><br>" + verifiedLinks : ""), source: "Verified public information", confidence: verified.confidence, feedback: true };
        }
      }

      /* A bare "it can wait" or "yes" outside a flow is a stray chip click,
         not a question. Only treat it as such when the whole message is that
         phrase, so real questions like "is there school today" are untouched. */
      if (/^(yes|no|yeah|nope|ok|okay|it can wait|i need it now|now|later|anytime)[.!]?$/i
            .test(String(q).trim())) {
        return { type: "smalltalk",
                 html: "No problem. What would you like to ask?",
                 chips: this.suggestions() };
      }

      /* Questions whose answer changes by the hour cannot come from a file
         built at deploy time. An emergency closure, today's status, the next
         PTA meeting or a class fee are read from live data at the moment the
         question is asked. */
      var live = this.liveAnswer(q);
      if (live) {
        this.stat("asked", q);
        this.stat("answered", q, 1);
        this.pending = { kind: "feedback", question: q, title: live.source || "Live school data" };
        return { type: live.type || "answer", html: live.html,
                 source: live.source, action: live.action || null,
                 chips: live.chips || null,
                 confidence: 1, feedback: true };
      }

      var ragQ = global.TAEntities ? global.TAEntities.norm(q) : q;
      /* Two phrase-level synonyms the token pipeline cannot see: the school
         calls its song an anthem, and "how can I help the school" is
         volunteering. Rewriting the phrase (not the bare word) keeps "sing
         me a song" and "how can I help my child" on their own paths. */
      if (typeof ragQ === "string") {
        ragQ = ragQ.replace(/\bschool (songs?|hymns?)\b/g, "school anthem")
                   .replace(/\bhow (can|do|could|would) i help (the|this|at) (school|treasure academy)\b/g,
                            "volunteer at the school")
                   .replace(/\bgraduates?\b/g, "alumni");
      }
      /* A price or money question about nothing in the school - "bitcoin
         price today", "how do i make money online" - has no answer in the
         school's records, and matching it to the fees FAQ would be a
         confident lie. Such questions skip retrieval and meet the honest
         not-school-stuff path below. */
      var priceGuard = (/\b(how much|price|cost|money|naira|dollar)\b/.test(ragQ) &&
        !/\b(fees?|schools?|terms?|classes?|creches?|nurseries|nursery|primary|playgroups?|pre[- ]?nursery|uniforms?|sportswear|transports?|buses?|bus|shops?|textbooks?|books?|forms?|admissions?|pta|exams?|lessons?|foods?|meals?|feedings?|feeds?|lunch)\b/.test(ragQ) &&
        !/\b(adavi|okene|ageva)\b/.test(ragQ)) ||
        /\b(betting|gambl\w+|casino|lottery|jackpot)\b/.test(ragQ) ||
        /\bbest\b[^.?!]{0,24}\b(phone|laptop|tv|car|network|data plan)\b/.test(ragQ) ||
        /* A gadget question in any order - "how do i charge my phone
           faster", "my phone screen is broken" - is not school business
           even when retrieval can hear the word "phone" in a contact
           line. The words are the same ones the phone branch below
           refuses to answer on, so the two rules can never disagree. */
        /\b(best|buy|new|repair|broken|screen|charge|charging|android|iphone|brand|model)\b[^.?!]{0,32}\b(phone|laptop|tv|tablet|gadget)\b/.test(ragQ) ||
        /\b(phone|laptop|tv|tablet|gadget)\b[^.?!]{0,32}\b(best|buy|new|repair|broken|screen|charge|charging|android|iphone|brand|model)\b/.test(ragQ) ||
        /\btime\b[^.?!]{0,24}\b(in|at)\b[^.?!]{0,24}\b(london|lagos|abuja|new york|america|uk|usa|ghana|tokyo|paris|dubai|china|india|canada|germany|spain|italy|kenya|south africa)\b/.test(ragQ) ||
        (/\b(who|what) (is|was|are|were) (the |a |an )?(governor|president|vice president|minister|senator|speaker|king|queen|oba|emir|sultan|mayor)\b/.test(ragQ) &&
         !/\b(school|treasure|academy)\b/.test(ragQ)) ||
        /\bwho (owns|founded|started|created|runs) (amazon|google|microsoft|apple|facebook|twitter|tesla|whatsapp|instagram|youtube)\b/.test(ragQ) ||
        /\bopen (a |an )?bank account\b/.test(ragQ) ||
        /\bdefine\b/.test(ragQ) ||
        (/\brecommend\b/.test(ragQ) &&
         !/\b(school|academy|treasure|class|teacher|subject)\b/.test(ragQ));
      var res = global.TARag && !priceGuard
        ? global.TARag.answer(ragQ)
        : { band: "none", confidence: 0 };
      this.stat("asked", q);

      /* Not confident enough to be trusted with a parent's decision. */
      if (res.band === "low" || res.band === "none") {
        this.stat("unanswered", q);

        /* Never a bare dead end. Even with no confident match, the question
           usually has a shape - a topic word, a class, a subject - and the
           related thing the school DOES know is far more useful than
           "I don't know". Offer that first; the human is the last resort,
           not the first. */
        var near = this.nearestHelp(q, res);
        if (near) {
          this.pending = { kind: "feedback", question: q, title: near.source };
          return { type: "answer", html: near.html, source: near.source,
                   confidence: 0.3, feedback: true, salvaged: true,
                   chips: near.chips || this.suggestions() };
        }

        this.pending = { kind: "urgency", question: q };
        return {
          type: "handoff-ask",
          html: "I could not find a confident answer to that in the school's " +
                "information, and I would rather not guess.<br><br>" +
                "<b>Do you need a reply right now, or can it wait?</b>",
          chips: ["I need it now", "It can wait"]
        };
      }

      /* The answer exists but belongs to the person's own record. */
      if (res.needs_login && !session()) {
        this.stat("login_required", q);
        return {
          type: "needs-login",
          html: "That information is tied to your own account, so I need you " +
                "to be logged in before I can show it.<br><br>" +
                "<b>" + esc(res.title) + "</b> is where it lives once you are in.",
          action: { label: "Log in / Register", kind: "login" },
          chips: ["Something else"]
        };
      }

      this.stat("answered", q, res.confidence);
      this.pending = { kind: "feedback", question: q, title: res.title };
      return {
        type: "answer",
        html: this.compose(res),
        source: res.title,
        url: res.url,
        confidence: res.confidence,
        feedback: true
      };
    },

    /* Build readable prose from the retrieved passage. Data passages are
       already written as sentences; page passages get trimmed to the part
       that actually matters. */
    compose: function (res) {
      var body = String(res.text || "").trim();
      if (body.length > 420) {
        var cut = body.slice(0, 420);
        var stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
        body = (stop > 180 ? cut.slice(0, stop + 1) : cut + "...");
      }
      var out = esc(body);
      if (res.url) {
        out += '<br><br><a class="chat-link" href="' + esc(res.url) + '">' +
               "Open " + esc(res.title) + "</a>";
      }
      return out;
    },

    /* What the last substantive question was about, so a fragment can inherit
       it. Held in memory only - it is conversational state, not history. */
    topic: null,

    /* Expand a fragment into a full question using the previous topic.
       "and primary 4?" after a fee question becomes "fees primary 4". */
    withContext: function (q) {
      var raw = String(q).trim();
      /* Work on the repaired text, so "what \u00f6bout primary 4?" is the
         fragment "what about primary 4" - an accent must not decide whether
         a question continues the last one. */
      var clean = global.TAEntities ? global.TAEntities.norm(raw).trim()
                                    : raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
      for (var polite = 0; polite < 3; polite++) {
        var stripped = clean.replace(/^(please|pls|kindly|excuse me|pardon me|sorry|abeg|i beg[,:]?)\s+/, "");
        if (stripped === clean) break;
        clean = stripped;
      }
      var ent = global.TAEntities ? global.TAEntities.read(clean) : null;
      var words = clean.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
                     .filter(Boolean);

      /* A fragment: short, and opening like a continuation. */
      var isFragment = words.length <= 6 &&
        /^(and|what about|how about|what of|also|then|ok what about|so)\b/
          .test(clean.toLowerCase());

      /* Or just a bare entity - "primary 4?" on its own. */
      var bareEntity = words.length <= 3 && ent &&
        (ent.klass || ent.subject || ent.thing) && !ent.intent;

      if ((isFragment || bareEntity) && this.topic) {
        /* A fragment that names a person ("and the headmistress?") is a
           whole new question about that person - carrying the old topic
           would answer the previous person again. */
        if (isFragment &&
            /\b(headmistress|founder|proprietor|proprietress|bursar|principal)\b/.test(clean)) {
          return raw;
        }
        var carried = this.topic + " " + raw;
        /* Remember the new subject but keep the old intent. */
        if (ent && ent.klass) this.topicClass = ent.klass;
        return carried;
      }

      /* Any question that names a class remembers it, so a follow-up
         "what does he teach?" knows which class is being discussed. */
      if (ent && ent.klass) this.topicClass = ent.klass;

      /* A full question - remember what it was about for next time. The
         fee table has a transport section, so a transport fee question must
         carry "transport" forward, not a bare "fees". */
      if (ent && ent.intent) {
        this.topic = ent.intent === "price"
          ? (/\b(transport|bus)\b/.test(clean) ? "transport fees" : "fees")
                   : ent.intent === "timetable" ? "timetable"
                   : ent.intent === "lost" ? "lost property"
                   : ent.intent === "result" ? "results"
                   : ent.intent;
      } else if (words.length > 3) {
        /* No clear intent: keep the two most meaningful words. Greeting
           words are not a topic. */
        var keep = words.filter(function (w) {
          return w.length > 3 && !/^(what|when|where|which|about|does|your|have|the|and|for|how|much|please|tell|hello|good|morning|afternoon|evening|hi|hey|thanks|thank)$/.test(w);
        });
        if (keep.length) this.topic = keep.slice(0, 2).join(" ");
      }
      return raw;
    },

    /* When retrieval is not confident, work out what the question was ABOUT
       and answer that, honestly flagged. A parent asking something the school
       has never written down should still leave knowing the nearest fact and
       who to ask - not a shrug. */
    nearestHelp: function (q, res) {
      var ent = global.TAEntities ? global.TAEntities.read(q) : null;
      if (!ent) return null;
      var bits = [], where = "";

      /* They named a class - give that class's fee and where it sits. */
      if (ent.klass) {
        var db = null;
        try { if (typeof DB !== "undefined" && DB.load) db = DB.load(); } catch (e) {}
        var fees = (db && db.school && db.school.fees) || {};
        var label = ent.klass.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        var amount = null;
        for (var k in fees) {
          if (fees.hasOwnProperty(k) && k.toLowerCase() === ent.klass) amount = fees[k];
        }
        bits.push("<b>" + esc(label) + "</b>" +
                  (amount ? " costs <b>\u20a6" + Number(amount).toLocaleString("en-NG") +
                            "</b> per term." : " is one of our classes."));
        where = "academics.html";
      }

      /* They named a subject. */
      if (ent.subject) {
        bits.push("<b>" + esc(ent.subject.replace(/\b\w/g, function (c) {
          return c.toUpperCase(); })) + "</b> is taught here and appears in the " +
          "exam timetable.");
        where = where || "exams.html";
      }

      /* Retrieval had a near miss - not confident, but genuinely in the same
         area. Offer it as a suggestion rather than passing it off as the
         answer. Below this the "closest thing" is noise: suggesting School
         Hours to someone asking about swimming lessons helps nobody, and an
         honest handoff is the better answer. */
      if (!bits.length && res && res.title && res.confidence >= 0.26 &&
          res.band === "low") {
        bits.push("The closest thing I have is <b>" + esc(res.title) + "</b>.");
        where = res.url || "";
      }

      /* Nothing concrete matched - but the question word still says what
         SHAPE of answer was wanted: a date, a place, a person, an amount.
         Offering the questions I CAN answer of that shape is a door, not a
         wall - and it only fires when the question is the school's
         business, so football and world affairs still reach a human. */
      if (!bits.length) {
        var wh = global.TAEntities ? global.TAEntities.wh(q) : null;
        if (wh && global.TAEntities && global.TAEntities.hasDomainWord(q)) {
          var lead = {
            time: "You are asking <b>when</b> - here is what I have dates for:",
            place: "You are asking <b>where</b> - here is what I can place:",
            person: "You are asking <b>who</b> - here are the people I can name:",
            amount: "You are asking <b>how much</b> - here is what I can price:",
            manner: "You are asking <b>how</b> - here is what I can walk you through:",
            reason: "You are asking <b>why</b> - here is what I can explain:",
            thing: "You are asking <b>what</b> - here is what I can tell you:",
            choice: "You are asking <b>which</b> - here is what I can lay out:",
            ownership: "You are asking <b>whose</b> - here is what I can tell you:"
          }[wh];
          var chipSet = {
            time: ["When does school resume?", "When is the next exam?",
                   "When does the term end?", "When is the next PTA meeting?"],
            place: ["Where is the school?", "How do I get there?",
                    "Where do I collect a uniform?"],
            person: ["Who is the headmistress?", "Who teaches Primary 3?",
                     "Who do I meet about admission?"],
            amount: ["How much are the fees?", "How much is the uniform?",
                     "How much is transport to Adavi?"],
            manner: ["How do I register my child?", "How do I pay fees?",
                     "How do I visit the school?"],
            reason: ["Why choose Treasure Academy?", "What is the school's mission?"],
            thing: ["What classes do you have?", "What do you teach?",
                    "What does the uniform cost?"],
            choice: ["What classes do you have?", "How much are the fees?",
                     "What do you teach?"],
            ownership: ["Who is the headmistress?", "Who teaches Primary 3?"]
          }[wh];
          return {
            source: "School information",
            html: "I do not have that written down, so I will not guess at it." +
                  "<br><br>" + lead + "<br><br>" +
                  chipSet.map(function (c) {
                    return "\u2022 " + c.replace(/\?$/, "");
                  }).join("<br>") +
                  "<br><br>Or say <b>talk to someone</b> and I will put you " +
                  "through to the school.",
            chips: chipSet
          };
        }
      }

      if (!bits.length) return null;

      return {
        source: res && res.title ? res.title : "School information",
        html: "I do not have that written down exactly, so I will not guess at " +
              "it.<br><br>" + bits.join("<br><br>") +
              (where ? "<br><br><a class=\"chat-link\" href=\"" + esc(where) +
                       "\">Open the page</a>" : "") +
              "<br><br>If that is not what you meant, ask me another way, or say " +
              "<b>talk to someone</b> and I will put you through to the school."
      };
    },

    /* Live answers. Returns null when the question is not one of these, and
       the normal retrieval path takes over. */
    liveAnswer: function (q) {
      /* store.js declares DB with `const`, so it is a script-scope binding and
         never lands on window. Reference it directly and let the try/catch
         handle the case where store.js has not loaded. */
      var db = null;
      try {
        if (typeof DB !== "undefined" && DB && typeof DB.load === "function") {
          db = DB.load();
        }
      } catch (e) { return null; }
      if (!db) return null;
      /* The question every rule sees is the REPAIRED question: accents
         folded, long-press symbols gone, slips of the finger mended. A
         parent should not have to type carefully to be understood. */
      var s = global.TAEntities ? global.TAEntities.norm(q).trim()
                                : String(q).toLowerCase();
      var school = db.school || {};
      var WHATSAPP = Core.WHATSAPP;
      /* What is this person actually asking about? */
      var ent = global.TAEntities ? global.TAEntities.read(q)
                                  : { intent: null, thing: null, klass: null, subject: null };

      /* Current school-office controls override all preserved legacy answer
         branches below. Never quote former browser prices, routes, rosters or
         timetables; restore browser sign-up/checkout; or describe Primary 5 as
         an active class. */
      if (/\b(primary ?5|primary five|p5|basic ?5|class ?5|grade ?5)\b/.test(s)) {
        return { html: "Treasure Academy has <b>no Primary 5</b>. The confirmed progression moves directly from <b>Primary 4 to Primary 6</b>. Ask the office about placement; do not rely on an old class page or fee list.", source: "Current class progression" };
      }
      if (/\b(what classes|which classes|class levels|classes (?:do|does) (?:the school|you)|after primary ?4|progression)\b/.test(s)) {
        return { html: "The confirmed progression is <b>Creche → Pre-Nursery → Nursery 1 → Nursery 2 → Primary 1 → Primary 2 → Primary 3 → Primary 4 → Primary 6 → Graduate Hall</b>. There is no Primary 5.", source: "Current class progression" };
      }
      if (/\b(where (?:is|are) (?:the )?school|school (?:address|location)|how (?:do|can) i get to (?:the )?school|directions? to (?:the )?school)\b/.test(s)) {
        return { html: "Treasure Academy is opposite <b>Morak Pure-Water Factory in Ageva, Okene, Kogi State</b>. Use the public Contact page for current directions or create a school-visit request; I will not infer a transport route from your location.", source: "Current school location" };
      }
      if (/\b(enrol|enroll|admission|admissions|apply|register (?:my|a) child|join (?:the )?school)\b/.test(s)) {
        return { html: "A new family uses the <b>restricted applicant route</b> or the verified school office. Existing-pupil parents use a private <b>TA-LINK</b>, and a second parent uses the phone-bound <b>TA-FAMILY</b> invitation. The administrators decide admission; payment never approves it.", source: "Current admission and registration policy" };
      }
      if (/\b(homework|assignment)\b/.test(s) && /\b(online|upload|submit|send)\b/.test(s)) {
        return { html: "The website does <b>not</b> accept pupil uploads or online assignment submissions. Teachers may publish instructions, but pupils complete and return work through the school-approved offline process.", source: "Current homework policy" };
      }
      if (/\b(cbt|computer based test|common entrance practice)\b/.test(s)) {
        return { html: "The CBT-style activity is only for <b>Primary 6 Common Entrance practice</b>. It is practice, not an official examination, assignment submission or published result.", source: "Current CBT policy" };
      }
      if (/\b(graduate wall|graduate hall|your graduates|former pupils?|alumni)\b/.test(s)) {
        return { html: "Graduation keeps the pupil’s permanent identity and history. Linked parents see former pupils privately in <b>Your Graduates</b>. The public Graduate Wall shows only a consent-approved display name, graduation session and optional message.", source: "Current graduate policy" };
      }
      if (/\b(second parent|second guardian|two parents|another parent)\b/.test(s)) {
        return { html: "A pupil may have at most two active parents or guardians, each with a separate account. The second parent uses a phone-bound <b>TA-FAMILY</b> invitation; a name and class alone never grant access.", source: "Current family-linking policy" };
      }
      if (/\b(pupil list|student list|class list|show (?:me )?(?:the )?(?:pupils|students|children))\b/.test(s)) {
        return { html: "I cannot display or suggest a pupil or class list. A name and class alone never reveal a pupil or grant access. Parents see only children linked through an approved private credential.", source: "Pupil privacy policy" };
      }
      if (/\b(result|results|report card|grade|score)\b/.test(s) && !/common entrance practice/.test(s)) {
        return { html: "A signed-in parent can view <b>published results only for a verified linked pupil</b>. Payment never publishes a result, changes admission or promotion, or controls account access.", source: "Current results policy" };
      }
      if (/\b(fee|fees|school ?fees|price|prices|cost|how much|payment|pay|receipt|bank|account details|account number|uniform|shirt|skirt|shorts|cardigan|sandal|beret|sock|sportswear|jersey|kit|shop|order|materials?|textbook|stationery|transport|bus|pickup|pick up|fare)\b/.test(s)) {
        return { html: "I will not quote a former price, route or bank account. Current term bills, verified materials, transport, orders and official receipts belong in the signed-in parent portal after the school publishes them.<br><br>Approved payment methods are a <b>manual bank transfer</b> or the school’s <b>physical office POS</b>. Both require authorised office verification. There is no online card form, WhatsApp is not a payment-evidence workflow, and payment never approves admission.", source: "Current payment and school-office policy" };
      }

      /* Photo Day is a booking page, not a dated calendar entry - and the
         intent classifier hears "photo" and reaches for the admissions
         document list ("2 passport photographs"). Answer from the Photo
         Day page's own content, whatever the classifier thought. */
      if (/\b(photo|picture|photograph) ?days?\b/.test(s)) {
        return { html: "No current Photo Day booking or package price is published. The former browser booking was retired because it did not create a reliable school record.<br><br>Ask the office whether a date, consent process and collection arrangement has been approved before sharing a child’s photograph or paying.",
                 source: "Current Photo Day guidance" };
      }

      function naira(n) {
        return "\u20a6" + Number(n || 0).toLocaleString("en-NG");
      }
      function dayName(d) {
        return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday"][d.getDay()];
      }
      function pretty(iso) {
        var d = new Date(String(iso) + "T12:00:00");
        if (isNaN(d.getTime())) return String(iso);
        return dayName(d) + " " + d.getDate() + " " +
               ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November",
                "December"][d.getMonth()] + " " + d.getFullYear();
      }

      if (ent.intent === "notpublished") {
        return { html: "That is not something the school publishes a fixed rule " +
                       "for - refunds, payment arrangements and any entry " +
                       "assessment are handled case by case by the " +
                       "headmistress.<br><br>" +
                       "<b>Mrs. Salihu Nanahawa</b> will talk it through with " +
                       "you directly on <b>" + WHATSAPP + "</b>, or come to the " +
                       "office Monday to Friday, 7:30am to 3:00pm. Parents do " +
                       "arrange things with her - it is worth asking rather than " +
                       "assuming.",
                 source: "Contact" };
      }

      /* Internal or private information the bot must never try to supply,
         even though the words look familiar. A wifi password is not login
         help, and the school's own credentials are nobody's business. */
      if (/\b(wifi|wi-fi|router|network) *(password|code|key)\b|\b(staff|admin|teacher)('?s)? (password|pin|login)\b/.test(s)) {
        return { html: "That is internal to the school, so it is not something " +
                       "I can give out.<br><br>" +
                       "If you are staff and locked out, the headmistress resets " +
                       "staff PINs - see her, or call <b>" + WHATSAPP + "</b>. " +
                       "If you are a parent trying to reach your child's records, " +
                       "ask me about <b>logging in</b> instead.",
                 source: "Security" };
      }

      /* Things the school genuinely does not publish. Saying "I don't know"
         here is correct, but pointing at who does know is what makes it
         useful. */
      if (/\b(scholarship\w*|bursar\w*|free tuition|financial aid|grant for)\b/.test(s)) {
        return { html: "The school does not publish a scholarship or bursary " +
                       "scheme, so I have nothing on file.<br><br>" +
                       "Fee questions and any arrangement over payment are " +
                       "handled personally by the office - speak to the " +
                       "headmistress on <b>" + WHATSAPP + "</b>. Sibling " +
                       "discounts may apply where more than one child attends.",
                 source: "Fees" };
      }
      if (/\b(canteen\w*|cafeteria\w*|tuck shop|who cooks|kitchen)\b/.test(s) ||
          (ent.intent === "food")) {
        return { html: "Meals are served fresh daily and children eat at " +
                       "school - the Creche even has its own nap and meal " +
                       "routine.<br><br>" +
                       "The school does not publish a menu or canteen price " +
                       "list, so for exactly what is served this term, and any " +
                       "allergy arrangements, ask the office on <b>" +
                       WHATSAPP + "</b>.",
                 source: "School day" };
      }
      if (/\b(registered|accredit\w*|approved by|government|licence\w*|license\w*|ministry)\b/.test(s)) {
        return { html: "Treasure Academy has operated in Ageva since <b>2016</b> " +
                       "and has been on its own permanent site since 2018, " +
                       "running Creche through Primary 6.<br><br>" +
                       "Registration and accreditation papers are not published " +
                       "on the website - the office will show you the " +
                       "documents if you ask. Call <b>" + WHATSAPP + "</b> or " +
                       "visit; you are welcome to come and see the school.",
                 source: "About" };
      }

      /* An emergency notice outranks everything else on the site. */
      var emg = school.emergency;
      if (emg && emg.on && emg.text &&
          /\b(school|closed|close|open|today|holiday|resume|emergency)\b/.test(s)) {
        return { html: "<b>Notice from the school:</b><br>" + esc(emg.text),
                 source: "Emergency notice" };
      }

      /* Is there school today? */
      if (/\b(school|class|lesson)\b/.test(s) &&
          /\b(today|now|open|closed|running)\b/.test(s)) {
        /* A named weekday asks about THAT day, not today: "the school dey
           open saturday?" must not be answered with Thursday's status. */
        var DAYNAMES = ["sunday", "monday", "tuesday", "wednesday",
                        "thursday", "friday", "saturday"];
        var askedDay = -1;
        for (var di = 0; di < 7; di++) {
          if (new RegExp("\\b" + DAYNAMES[di] + "\\b").test(s)) askedDay = di;
        }
        if (askedDay >= 0 && askedDay !== new Date().getDay()) {
          var dayCap = DAYNAMES[askedDay].charAt(0).toUpperCase() +
                       DAYNAMES[askedDay].slice(1);
          if (askedDay === 0 || askedDay === 6) {
            return { html: "No - there is no school on " + dayCap +
                           ". Lessons run Monday to Friday, 8:00am to 3:00pm.",
                     source: "School hours" };
          }
          return { html: "Yes - school holds on " + dayCap + ". The gate " +
                         "opens at 7:00am, assembly is 7:45am and closing " +
                         "time is 3:00pm.",
                   source: "School hours" };
        }
        var today = new Date();
        var weekend = today.getDay() === 0 || today.getDay() === 6;
        if (weekend) {
          return { html: "Today is " + dayName(today) + ", so there is no school. " +
                         "Lessons run Monday to Friday, 8:00am to 3:00pm.",
                   source: "School hours" };
        }
        return { html: "Yes, there is school today (" + dayName(today) + "). " +
                       "The gate opens at 7:00am, assembly is 7:45am and closing " +
                       "time is 3:00pm.",
                 source: "School hours" };
      }

      /* A named shop item answers with its own price - "how much is the
         mathematics textbook" is a shop question, not a fee question, so
         it runs before the fee branches. Most of the item's name must
         appear, so "english textbook" still finds "English Language
         Textbook". */
      if (/\b(how much|price|cost|buy|sell)\b/.test(s) && !/\bfees?\b/.test(s)) {
        /* Uniform words belong to the uniform price list - unless the
           question names a shop item in full ("Full Uniform Set"), which
           the uniform list does not carry. */
        var uniWord = /\b(uniform|shirt|skirt|cardigan|sandal|beret|sock|sportswear|jersey|kit)\b/.test(s);
        var shopPool = db.shopItems || db.shop || [];
        var shopHit = null;
        shopPool.forEach(function (x) {
          if (!x || !x.name || shopHit) return;
          var toks = String(x.name).toLowerCase().split(/[^a-z0-9]+/)
                        .filter(function (w) { return w.length > 2; });
          if (!toks.length) return;
          var matched = toks.filter(function (w) { return s.indexOf(w) >= 0; });
          if (matched.length >=
              (toks.length < 2 ? 1 : Math.max(2, toks.length - 1)) &&
              (!uniWord || matched.length >= 2)) shopHit = x;
        });
        /* "how much is the notebook" names no full item - accept the one
           item whose distinctive first word appears, but only when it is
           unambiguous, and never when the question names a class: "how
           much is creche" is a fee question, not the Creche Care Pack. */
        if (!shopHit && !uniWord && !ent.klass &&
            !/\b(creche|nursery|primary|playgroup|pre[- ]?nursery|class)\b/.test(s)) {
          var shopCands = shopPool.filter(function (x) {
            if (!x || !x.name) return false;
            var toks = String(x.name).toLowerCase().split(/[^a-z0-9]+/)
                          .filter(function (w) { return w.length > 2; });
            return toks.length && toks[0].length > 5 && s.indexOf(toks[0]) >= 0;
          });
          if (shopCands.length === 1) shopHit = shopCands[0];
        }
        if (shopHit) {
          return { html: "<b>" + esc(shopHit.name) + "</b> is <b>" +
                         naira(shopHit.price) + "</b> in the school shop." +
                         "<br><br>Ask the office on " + WHATSAPP + " to confirm " +
                         "it is in stock today.<br>" +
                         "<a class=\"chat-link\" href=\"shop.html\">Open the Shop page</a>",
                   source: "School shop" };
        }
      }

      /* The school shop. When the live catalogue has loaded its prices are
         quoted; otherwise the honest answer is where the list lives. */
      if (/\bshop\b/.test(s) && !/portal/.test(s)) {
        var shopItems = (db.shopItems || db.shop || [])
                            .filter(function (x) { return x.name; });
        if (shopItems.length) {
          return { html: "<b>In the school shop:</b><br>" +
                         shopItems.slice(0, 8).map(function (x) {
                           return "\u2022 " + esc(x.name) + " - " + naira(x.price);
                         }).join("<br>") +
                         "<br><br>Ask the office on " + WHATSAPP + " for what is " +
                         "in stock today.",
                   source: "School shop" };
        }
        return { html: "The school shop sells what pupils need for school - " +
                       "the item and price list is on the <b>Shop</b> page, and " +
                       "the office on " + WHATSAPP + " can tell you what is in " +
                       "stock today.",
                 source: "School shop" };
      }

      /* Transport routes and fares. Read live when the data layer has
         them; the three routes on the school's records are the fallback. */
      if (/\b(transport|bus|pickup|pick up)\b/.test(s)) {
        var routes = (db.transport && db.transport.length) ? db.transport : [
          { route: "A", area: "Adavi", fee: 5000 },
          { route: "B", area: "Okene Town", fee: 6000 },
          { route: "C", area: "Ageva", fee: 3000 }
        ];
        var place = /adavi/.test(s) ? "adavi" : /okene/.test(s) ? "okene"
                  : /ageva/.test(s) ? "ageva" : null;
        if (place) {
          var hitR = routes.filter(function (r) {
            return String(r.area || r.name || "").toLowerCase().indexOf(place) >= 0;
          })[0];
          if (hitR) {
            return { html: "Transport to <b>" + esc(hitR.area || hitR.name) +
                           "</b> is <b>" + naira(hitR.fee || hitR.fare) +
                           "</b> per term, added to the term bill. Visit the " +
                           "school office or call " + WHATSAPP + " to join a route.",
                     source: "Transport" };
          }
        }
        if (/how much|price|cost|fee|fees|fare/.test(s)) {
          return { html: "<b>Transport routes and fees:</b><br>" +
                         routes.map(function (r) {
                           return "\u2022 Route " + esc(r.route || "") + " - " +
                                  esc(r.area || r.name || "") + ": " +
                                  naira(r.fee || r.fare) + " per term";
                         }).join("<br>") +
                         "<br><br>Transport fees are added to the term bill and " +
                         "paid by bank transfer, like the school fees.",
                   source: "Transport" };
        }
      }

      /* Reaching the headmistress. A parent asks this every term; the
         answer for them is the school line, not the admin console. Staff
         have their own channel. */
      if (/\b(chat|speak|talk|message|reach|contact|meet|see)\b[^.?!]{0,30}\bhead ?mistress\b|\bhead ?mistress\b[^.?!]{0,30}\b(chat|whatsapp|phone|number)\b/.test(s)) {
        return { html: "The headmistress, <b>" + esc(school.headName || "the headmistress") +
                       "</b>, is reached through the school line <b>" + WHATSAPP +
                       "</b> (WhatsApp or call), or at the school office during " +
                       "office hours. Teachers reach her directly through staff chat " +
                       "in the Teacher Portal.",
                 source: "Contact" };
      }

      /* Staff birthdays, answered from the same data the Birthdays page
         reads. "When is Mrs Zeenatudeen's birthday" names a person; otherwise
         the next ones coming up. */
      if (/\bbirthdays?\b/.test(s)) {
        var bday = (db.teachers || []).filter(function (t) {
          return t.dob && !/\(demo\)/i.test(t.name || "");
        });
        function bNext(dob) {
          var p = String(dob).split("-");
          var t0 = new Date(); t0.setHours(0, 0, 0, 0);
          var n = new Date(t0.getFullYear(), +p[1] - 1, +p[2]);
          if (n < t0) n = new Date(t0.getFullYear() + 1, +p[1] - 1, +p[2]);
          return n;
        }
        function bFmt(d) {
          return d.getDate() + " " + ["January", "February", "March", "April",
            "May", "June", "July", "August", "September", "October",
            "November", "December"][d.getMonth()];
        }
        if (bday.length) {
          var hmB = /head ?mistress/.test(s)
            ? bday.filter(function (t) {
                return String(school.headName || "").toLowerCase()
                  .indexOf(String(t.name || "").toLowerCase().replace(/^(mr|mrs|mr\.|mrs\.)\s+/i, "").trim()) >= 0;
              })[0]
            : null;
          var namedB = null;
          var honorific = /^(aunty|uncle|mr|mrs|miss|madam|sir|teacher|headmistress)$/;
          bday.forEach(function (t) {
            var parts = String(t.name || "").toLowerCase().replace(/\(demo\)/g, "")
                          .split(/\s+/);
            for (var bi = 0; bi < parts.length; bi++) {
              if (parts[bi].length > 3 && !honorific.test(parts[bi]) &&
                  s.indexOf(parts[bi]) >= 0) namedB = t;
            }
          });
          var pickB = hmB || namedB;
          if (pickB) {
            return { html: "<b>" + esc(pickB.name) + "</b>'s birthday is <b>" +
                           bFmt(bNext(pickB.dob)) + "</b>. The Birthdays page " +
                           "has a birthday wish you can copy for the day.",
                     source: "Staff birthdays" };
          }
          var sortedB = bday.map(function (t) {
            return { name: t.name, d: bNext(t.dob) };
          }).sort(function (a, b) { return a.d - b.d; });
          return { html: "The next staff birthdays:<br>" +
                         sortedB.slice(0, 3).map(function (x) {
                           return "\u2022 " + esc(x.name) + " - " + bFmt(x.d);
                         }).join("<br>") +
                         "<br><br>The full list, with a birthday wish you can " +
                         "copy, is on the Birthdays page.",
                   source: "Staff birthdays" };
        }
      }

      /* The portals. Register marking, results entry, staff chat, approvals
         and fee updates live behind a login, so the honest answer is where
         they live and how the login works - exactly as the Login page
         states it: pupils without a password are set up automatically,
         staff use Staff ID + PIN. */
      /* "My attendance", "my timetable", "my homework" - the family's own
         record. It lives in the portal behind their login, so a guest gets
         the honest pointer to the login rather than a guessed answer. */
      if (!session() &&
          /\bmy (attendance|timetable|homework|results?|report card|fees|balance|payment claim|claim)\b/.test(s) &&
          !/\b(write|do my|finish|complete)\b/.test(s)) {
        this.stat("login_required", q);
        return { type: "needs-login",
                 html: "That information is tied to your own account, so I " +
                       "need you to be logged in before I can show it.<br><br>" +
                       "The <b>Parent / Pupil Portal</b> is where it lives once " +
                       "you are in - attendance, timetable, homework and " +
                       "results are all in its sidebar.",
                 action: { label: "Log in / Register", kind: "login" },
                 chips: ["Something else"] };
      }
      if (/\b(staff chat|mark (the )?register|enter (the )?(results?|scores?)|submit (the )?(results?|scores?)|approve (a |an )?(pupils?|parents?|registrations?|accounts?|guardians?)|verify (a |an )?(pupils?|parents?|guardians?|registrations?|accounts?)|verification ?queue|set (the )?(new )?fees|update (the )?fees|send (a )?notification|broadcast|post (an? )?(event|news|notice)|duty( roster)?|see (the )?notices|view (the )?notices|class register|see (my |the )?class fees)\b/.test(s)) {
        var adminSide = /\b(approve|verif\w+|verification queue|set (the )?(new )?fees|update (the )?fees|broadcast|notification|admin|headmistress|post (an? )?(event|news|notice))\b/.test(s);
        return adminSide
          ? { html: "That is done in the <b>Admin Console</b> (portal/admin.html) - " +
                    "approvals and verification, fee updates, staff chat, notices " +
                    "and notifications are all in its sidebar. Log in from the " +
                    "Login page; staff use Staff ID + PIN.", source: "School portals" }
          : { html: "That is done in the <b>Teacher Portal</b> (portal/teacher.html) - " +
                    "the Register, Results, Fees, Chat, Notices and Homework views " +
                    "are in its sidebar once you are logged in. Log in from the " +
                    "Login page; staff use Staff ID + PIN.", source: "School portals" };
      }

      /* Uniform prices - but a LOST cardigan is a lost-property question,
         not a shopping one. */
      if (/\buniform|shirt|skirt|short|cardigan|sandal|beret|sock|sportswear|jersey|kit\b/.test(s) &&
          !/\b(lost|lose|losing|missing|misplaced|found|left behind|forgot)\b/.test(s)) {
        var uni = db.uniform || [];
        if (uni.length) {
          for (var u = 0; u < uni.length; u++) {
            var nm = String(uni[u].name || "").toLowerCase();
            if (nm && s.split(" ").some(function (w) {
                  return w.length > 3 && nm.indexOf(w) >= 0; })) {
              return { html: "<b>" + esc(uni[u].name) + "</b> is <b>" +
                             naira(uni[u].price) + "</b>.",
                       source: "Uniform price list" };
            }
          }
          var ulist = uni.map(function (x) {
            return esc(x.name) + " " + naira(x.price);
          }).join("<br>");
          return { html: "<b>Uniform prices:</b><br>" + ulist +
                         "<br><br>Uniforms are collected at the school office.",
                   source: "Uniform price list" };
        }
      }

      /* Fees for one named class, with the real figure. The class may be
         written as a word ("primary four") - the entity reader resolves
         that, the fee table key alone does not. */
      if (/\b(fee|fees|cost|price|how much|pay)\b|\bschool ?fees?\b/.test(s)) {
        var fees = school.fees || {};
        if (ent.klass) {
          var klassKey = Object.keys(fees).filter(function (k) {
            return k.toLowerCase() === ent.klass;
          })[0];
          if (klassKey) {
            return { html: "<b>" + esc(klassKey) + "</b> is <b>" +
                           naira(fees[klassKey]) + "</b> per term.<br><br>" +
                           "Payment is by bank transfer to the school account, " +
                           "and a receipt number is issued once it is confirmed.",
                     source: "Fee list" };
          }
        }
        var names = Object.keys(fees);
        for (var i = 0; i < names.length; i++) {
          var key = names[i].toLowerCase();
          var shortKey = key.replace("primary ", "p").replace("nursery ", "n");
          if (s.indexOf(key) >= 0 || (shortKey.length > 1 && s.indexOf(shortKey) >= 0)) {
            return { html: "<b>" + esc(names[i]) + "</b> is <b>" +
                           naira(fees[names[i]]) + "</b> per term.<br><br>" +
                           "Payment is by bank transfer to the school account, " +
                           "and a receipt number is issued once it is confirmed.",
                     source: "Fee list" };
          }
        }
        if (names.length && /\b(fee|fees|school fees|all|list|each|every)\b/.test(s)) {
          var rows = names.map(function (n) {
            return esc(n) + " " + naira(fees[n]);
          }).join("<br>");
          return { html: "<b>School fees per term:</b><br>" + rows +
                         "<br><br>All payments are by bank transfer to the school account.",
                   source: "Fee list" };
        }
      }

      /* The next PTA meeting. */
      if (/\bpta\b|parent teacher/.test(s)) {
        var pta = (db.ptaMeetings || []).slice().sort(function (a, b) {
          return String(a.date).localeCompare(String(b.date));
        });
        var todayIso = new Date().toISOString().slice(0, 10);
        var next = pta.filter(function (m) { return String(m.date) >= todayIso; })[0];
        if (next) {
          return { html: "The next <b>PTA</b> meeting is <b>" + esc(next.title) +
                         "</b> on " + pretty(next.date) +
                         (next.venue ? " at " + esc(next.venue) : "") + ".",
                   source: "PTA meetings" };
        }
        if (pta.length) {
          return { html: "No <b>PTA</b> meeting is scheduled at the moment. The " +
                         "last one was " + esc(pta[pta.length - 1].title) + " on " +
                         pretty(pta[pta.length - 1].date) + ".",
                   source: "PTA meetings" };
        }
      }

      /* The next exam paper. */
      if (/\bexam|test|paper\b/.test(s) && /\bnext|when|coming|soon\b/.test(s)) {
        var ex = (db.exams || []).slice().sort(function (a, b) {
          return String(a.date).localeCompare(String(b.date));
        });
        var iso = new Date().toISOString().slice(0, 10);
        var up = ex.filter(function (e) { return String(e.date) >= iso; })[0];
        if (up) {
          return { html: "The next paper is <b>" + esc(up.subject) + "</b> on " +
                         pretty(up.date) + (up.time ? " at " + esc(up.time) : "") +
                         (up.classes ? " for " + esc(up.classes) : "") + ".",
                   source: "Exam timetable" };
        }
      }

      /* ---- Who the school is. -------------------------------------------
         These are facts about the institution, so they are written here as
         facts rather than scraped out of prose. Every figure below appears on
         the About page; nothing is invented. Counts come from live data so
         they cannot go stale. */

      /* One class, from the class page data behind class.html?class=NAME. */
      /* "My daughter wants to enter Primary 2" names a class, but the
         parent is asking for the admission steps, not the class blurb. */
      if (ent.intent === "classinfo" && ent.klass &&
          !/\b(enter|entering|join|joining|admit|admission|admissions|enrol|enroll|register|put my|transfer)\b/.test(s)) {
        var pages = db.classPages || [];
        for (var cp = 0; cp < pages.length; cp++) {
          if (String(pages[cp].class || "").toLowerCase() === ent.klass) {
            var page = pages[cp];
            var acts = (page.activities || []).slice(0, 6);
            var who = (db.staffWall || []).filter(function (x) {
              return x.name && !/\(demo\)/i.test(x.name) &&
                     String(x.class || "").toLowerCase() === ent.klass;
            })[0];
            var fee = (school.fees || {})[page.class];
            return { html: "<b>" + esc(page.class) + "</b>" +
                           (page.tagline ? " - " + esc(page.tagline) : "") + "<br><br>" +
                           esc(page.about || "") +
                           (acts.length ? "<br><br><b>What they do:</b><br>&bull; " +
                            acts.map(esc).join("<br>&bull; ") : "") +
                           (who ? "<br><br>Class teacher: <b>" + esc(who.name) + "</b>." : "") +
                           (fee ? "<br>Fee: <b>" + naira(fee) + "</b> per term." : "") +
                           "<br><br><a class=\"chat-link\" href=\"class.html?class=" +
                           encodeURIComponent(page.class) + "\">Open the " +
                           esc(page.class) + " page</a>",
                     source: page.class };
          }
        }
      }

      /* The whole ladder of classes, with ages where the school states them. */
      if (ent.intent === "classlist") {
        var names = (db.classPages || []).map(function (c) { return c.class; })
                      .filter(Boolean);
        if (!names.length) {
          names = Object.keys(school.fees || {});
        }
        if (names.length) {
          /* Asked which is cheapest - answer with the real figure. */
          var feeMap = school.fees || {};
          if (/cheap|afford|lowest|least/.test(s)) {
            var sorted = Object.keys(feeMap).sort(function (a, b) {
              return (Number(feeMap[a]) || 0) - (Number(feeMap[b]) || 0);
            });
            if (sorted.length) {
              var lowest = Number(feeMap[sorted[0]]) || 0;
              var same = sorted.filter(function (k) {
                return (Number(feeMap[k]) || 0) === lowest;
              });
              return { html: "The lowest termly fee is <b>" + naira(lowest) +
                             "</b>, for <b>" + esc(same.join(", ")) + "</b>." +
                             "<br><br>Fees run up to <b>" +
                             naira(Number(feeMap[sorted[sorted.length - 1]]) || 0) +
                             "</b> for the senior Primary classes. Ask me about " +
                             "any class for its exact fee.",
                       source: "Fee list" };
            }
          }
          return { html: "Treasure Academy runs <b>" + names.length +
                         "</b> classes, from the youngest upwards:<br>&bull; " +
                         names.map(esc).join("<br>&bull; ") +
                         "<br><br>Creche takes babies from <b>six months</b>, and " +
                         "the ladder runs right through to <b>Primary 6</b>, so a " +
                         "child never has to change school mid-way.<br><br>" +
                         "Ask me about any one of them and I will tell you what " +
                         "happens in it.",
                   source: "Academics" };
        }
      }

      /* E-learning: Primary 6 Common Entrance practice, inside the portal. */
      if (ent.intent === "elearning") {
        var forP6 = /\bprimary\s*[1-5]\b|\bnursery\b|\bcreche\b/.test(s);
        return { html: "<b>E-Learning</b> at Treasure Academy is Common Entrance " +
                       "practice for <b>Primary 6</b>, inside the pupil portal - " +
                       "real-style questions in Mathematics, English, Basic " +
                       "Science and more, with an instant score after every " +
                       "attempt.<br><br>" +
                       (forP6
                         ? "It appears only on <b>Primary 6</b> dashboards, so " +
                           "younger classes do not see it yet.<br><br>"
                         : "The questions are uploaded by the school and grow " +
                           "every term.<br><br>") +
                       "Log in to the pupil portal to use it." +
                       "<br><br><a class=\"chat-link\" href=\"elearning.html\">" +
                       "Open E-Learning</a>",
                 source: "E-Learning" };
      }

      /* Clubs, excursions and everything outside the timetable - read from
         the activities the class pages actually list. */
      if ((ent.intent === "activity" ||
          /\b(show ?(and|&) ?tell|trip|trips|outing)\b/.test(s)) &&
          !/\bbetting|gambl\w+|casino|lottery|jackpot\b/.test(s) &&
          /* dated event families are the calendar's to answer, not
             the class-activities list */
          !/\b(inter[- ]?house|sports? day|sports trials|trials|graduation|prize ?giving)\b/.test(s) &&
          !/\b(england|premier league|epl|champions league|la liga|world cup|best in)\b/.test(s) &&
          !/\bevents?\b[^.?!]{0,30}\b(coming|next|upcoming|this term|soon)\b|\b(coming|upcoming|any) events?\b|(whats|what.s) happening/.test(s) &&
          !/\b(when|what date|which date|which day|date of)\b[^.?!]{0,30}\b(excursion|trip|outing)\b|\b(excursion|trip|outing)\b[^.?!]{0,30}\b(when|what date|which date|which day|date of)\b/.test(s)) {
        var byClass = {};
        (db.classPages || []).forEach(function (c) {
          (c.activities || []).forEach(function (a) {
            if (!byClass[a]) byClass[a] = [];
            byClass[a].push(c.class);
          });
        });
        var keys = Object.keys(byClass);
        /* Match on the words that carry meaning, and treat common synonyms
           for the same thing as the same thing. */
        var ALIAS = { trip: "excursion", trips: "excursion", outing: "excursion",
                      club: "club", clubs: "club", read: "reading",
                      quiz: "quiz", debate: "debate", code: "coding",
                      coding: "coding", computer: "computer" };
        var words = s.split(/\s+/).map(function (w) {
          var c = w.replace(/[^a-z]/g, "");
          return ALIAS[c] || c;
        }).filter(function (w) {
          return w.length > 3 &&
            !/^(what|when|where|which|about|does|your|have|they|this|that|there|with|from|children|child|pupil|pupils|school)$/.test(w);
        });
        var asked = keys.filter(function (a) {
          var la = a.toLowerCase();
          return words.some(function (w) { return la.indexOf(w) >= 0; });
        });
        if (asked.length) {
          return { html: asked.slice(0, 3).map(function (a) {
                     return "<b>" + esc(a) + "</b> - in " +
                            esc(byClass[a].join(", ")) + ".";
                   }).join("<br><br>") +
                   "<br><br>Every class has its own activities; ask me about a " +
                   "class to see the full list.",
                   source: "Academics" };
        }
        if (keys.length) {
          return { html: "<b>Beyond the lessons</b><br>Activities run by class " +
                         "include: " + esc(keys.slice(0, 14).join(", ")) +
                         ".<br><br>Ask me about a particular class for its own list.",
                   source: "Academics" };
        }
      }

      /* Homework. The owner's rule: no online submission. */
      if (ent.intent === "homework") {
        return { html: "Yes - homework is set by the class teacher and written " +
                       "in the pupil's book.<br><br>" +
                       "There is <b>no online submission</b>: work is done on " +
                       "paper and handed to the teacher, the way the school " +
                       "prefers it. Holiday assignments are given at the end of " +
                       "term.<br><br>If your child is unsure what was set, ask " +
                       "the class teacher.",
                 source: "Homework" };
      }

      /* What parents say. The testimonials page is painted by JavaScript, so
         there is no prose to scrape - the reviews live in the database and are
         read from there, approved ones only. */
      if (ent.intent === "testimonial" &&
          !/\b(movie|film|song|album|restaurant|hotel|game|series)\b/.test(s)) {
        var approved = (db.testimonials || []).filter(function (t) {
          return t.approved !== false && (t.text || t.message || t.body);
        });
        if (approved.length) {
          var quote = approved[0];
          var body = String(quote.text || quote.message || quote.body || "").trim();
          if (body.length > 220) body = body.slice(0, 217) + "...";
          return { html: "<b>" + approved.length + "</b> approved parent " +
                         (approved.length === 1 ? "review is" : "reviews are") +
                         " published on the <b>Testimonials</b> page.<br><br>" +
                         "\u201c" + esc(body) + "\u201d" +
                         (quote.name ? "<br><small>\u2014 " + esc(quote.name) +
                          (quote.role ? ", " + esc(quote.role) : "") + "</small>" : "") +
                         "<br><br><a class=\"chat-link\" href=\"testimonials.html\">" +
                         "Read them all</a>",
                   source: "Testimonials" };
        }
        return { html: "Parent reviews are collected on the <b>Testimonials</b> " +
                       "page. None are published at the moment - parents, " +
                       "teachers and pupils can submit one from their dashboard " +
                       "after logging in, and the school approves it before it " +
                       "appears.<br><br><a class=\"chat-link\" href=\"testimonials.html\">" +
                       "Open Testimonials</a>",
                 source: "Testimonials" };
      }

      /* Subjects. The list is read from what the school actually records
         against exams, results and class pages, so it stays true as the
         curriculum changes. Naming a subject we do not teach gets a plain
         "no", not a vague deflection. */
      if (ent.intent === "curriculum") {
        var found = {};
        (db.exams || []).forEach(function (e) { if (e.subject) found[e.subject] = 1; });
        (db.results || []).forEach(function (r) { if (r.subject) found[r.subject] = 1; });
        (db.classPages || []).forEach(function (c) {
          (c.subjects || []).forEach(function (x) { if (x) found[x] = 1; });
        });
        /* Teachers carry the subjects they actually teach, which is the most
           reliable list the school keeps. */
        (db.staffWall || []).forEach(function (t) {
          (t.subjects || []).forEach(function (x) { if (x) found[x] = 1; });
        });
        /* Class activities name real subjects - "Handwriting mastery",
           "Phonics & reading" - so recognise the subject inside the phrase. */
        var KNOWN = ["Handwriting", "Phonics", "Reading", "Spelling", "Grammar",
                     "Comprehension", "Essay writing", "Mental maths",
                     "Times tables", "Science", "Coding", "Debate",
                     "Computer", "Colouring", "Counting"];
        (db.classPages || []).forEach(function (c) {
          (c.activities || []).forEach(function (a) {
            KNOWN.forEach(function (k) {
              if (String(a).toLowerCase().indexOf(k.toLowerCase()) >= 0) found[k] = 1;
            });
          });
        });
        (db.teachers || []).forEach(function (t) {
          (t.subjects || []).forEach(function (x) { if (x) found[x] = 1; });
        });
        (db.timetable || []).forEach(function (row) {
          (row.periods || []).forEach(function (x) {
            if (x && typeof x === "string") found[x] = 1;
          });
        });
        var subjects = Object.keys(found).filter(function (x) {
          return !/^school fees/i.test(x);
        }).sort();

        /* They named one. Answer about that one. */
        if (ent.subject) {
          var want = ent.subject.toLowerCase();
          var taught = subjects.filter(function (x) {
            return x.toLowerCase().indexOf(want) >= 0 ||
                   want.indexOf(x.toLowerCase()) >= 0;
          });
          if (taught.length) {
            return { html: "Yes - <b>" + esc(taught[0]) + "</b> is taught here." +
                           (subjects.length ? "<br><br>The full list: " +
                            esc(subjects.join(", ")) + "." : ""),
                     source: "Curriculum" };
          }
        }
        /* A subject word we know of but the school does not record. */
        var missing = null;
        if (/\bfrench\b/.test(s)) missing = "French";
        else if (/\barabic\b/.test(s)) missing = "Arabic";
        else if (/\bmusic\b/.test(s)) missing = "Music";
        else if (/\bspanish\b/.test(s)) missing = "Spanish";
        if (missing) {
          return { html: "<b>" + missing + "</b> is not one of the subjects the " +
                         "school records, so I would say no - but the office can " +
                         "confirm what is offered this term on <b>" + WHATSAPP +
                         "</b>." +
                         (subjects.length ? "<br><br>What is taught: " +
                          esc(subjects.join(", ")) + "." : ""),
                   source: "Curriculum" };
        }
        if (subjects.length) {
          return { html: "<b>Subjects taught</b><br>" + esc(subjects.join(", ")) +
                         ".<br><br>Primary 6 also practises <b>Common Entrance</b> " +
                         "questions in the portal through the year.",
                   source: "Curriculum" };
        }
      }

      /* "Tell me about the school" - the broadest possible question, and the
         one a first-time visitor actually asks. Answer it as a person would:
         what it is, how long, what it covers, and one way in. */
      /* One parent, several children - the account model the school uses. */
      if (ent.intent === "multichild") {
        return { html: "Yes - <b>one parent account can hold all your linked children</b>." +
                       "<br><br>Create the account once. Each already-enrolled child needs that child’s own private <b>TA-LINK</b> code, and each new applicant uses the admission workflow. A second parent uses a separate phone-bound <b>TA-FAMILY</b> invitation and a separate password.<br><br>No child is exposed from a name, class or public phone search.",
                 source: "Secure parent registration" };
      }

      /* Things the school decides case by case and does not publish. Being
         straight about that is more useful than a confident invention. */
      if (ent.intent === "whotomeet") {
        return { html: "Come to the school office and ask for the " +
                       "<b>headmistress, Mrs. Salihu Nanahawa</b> - she handles " +
                       "admissions and parent enquiries herself. " +
                       "<b>Bose Momoh</b>, the school administrator, is at the " +
                       "office too.<br><br>" +
                       "No appointment is needed, but a message on <b>" +
                       WHATSAPP + "</b> means someone is expecting you and can " +
                       "set aside the time.",
                 source: "Contact" };
      }

      if (ent.intent === "transfer") {
        return { html: "A routine fresh-name entry after cutover is normally <b>Creche only</b>. A child joining a higher class needs an authorised admission exception and placement review.<br><br>Create a restricted applicant account, submit the family application, and follow the office’s private instructions. Do not send results, medical records or identity documents through public chat.",
                 source: "Admissions" };
      }

      if (ent.intent === "afterreg") {
        return { html: "<b>After parent self-registration</b><br>" +
                       "<b>1.</b> Sign in and submit the restricted family application.<br>" +
                       "<b>2.</b> Track office contact, requested information, school-visit steps and the admission decision in the portal.<br>" +
                       "<b>3.</b> If admitted, the system creates one permanent pupil identity, links the parent and starts enrolment history.<br><br>" +
                       "Payment never approves admission, changes promotion, publishes results or controls account access.",
                 source: "Admissions" };
      }

      /* What to bring. Straight from the admissions page list. */
      if (ent.intent === "documents" &&
          !/\bdefine|editing|edit my|photoshop\b/.test(s)) {
        return { html: "The school office confirms the current document checklist privately for the child and class. Do not rely on an old fixed list or send identity, health, result or payment documents through public chat.<br><br>Use the restricted applicant portal for the family application and follow only the current office next step shown there.",
                 source: "Admissions" };
      }

      /* Receipts. Parents worry about fake ones, so point at the checker. */
      if (ent.intent === "receipt") {
        return { html: "Every payment gets an official <b>receipt number</b> once " +
                       "the school confirms the transfer.<br><br>" +
                       "To check one is genuine, enter the receipt number on the " +
                       "<b>Receipt</b> page - it works for school fees and PTA " +
                       "receipts. If it does not verify, bring it to the office " +
                       "before paying anything further.<br><br>" +
                       "<a class=\"chat-link\" href=\"receipt.html\">Verify a receipt</a>",
                 source: "Receipts" };
      }

      if (ent.intent === "trackapp" &&
          !/\b(package|parcel|jumia|konga|delivery)\b/.test(s)) {
        return { html: "You can check an application yourself: on the " +
                       "<b>Admissions</b> page, enter the <b>phone number you " +
                       "used during registration</b> and it shows the current " +
                       "status.<br><br>" +
                       "If it still reads pending after your school visit, call " +
                       "the office on <b>" + WHATSAPP + "</b>." +
                       "<br><br><a class=\"chat-link\" href=\"admissions.html\">" +
                       "Track your application</a>",
                 source: "Admissions" };
      }

      if (ent.intent === "contactinfo") {
        return { html: "<b>Reaching the school</b><br>" +
                       "&bull; WhatsApp or call: <b>" + WHATSAPP + "</b> - best " +
                       "for anything urgent<br>" +
                       "&bull; Email: <b>treasuregroupofschool@gmail.com</b><br>" +
                       "&bull; The message form on the <b>Contact</b> page - " +
                       "replies usually come within <b>one school day</b><br>" +
                       "&bull; In person: Ageva, Okene, Kogi State, Monday to " +
                       "Friday 7:30am to 3:00pm<br><br>" +
                       "<a class=\"chat-link\" href=\"contact.html\">Open Contact</a>",
                 source: "Contact" };
      }

      if (ent.intent === "officehours") {
        var isWeekend = [0, 6].indexOf(new Date().getDay()) >= 0;
        return { html: "The school office is open <b>Monday to Friday, 7:30am " +
                       "to 3:00pm</b>. It is closed at weekends and on public " +
                       "holidays.<br><br>" +
                       (isWeekend
                         ? "Today is the weekend, so the office is closed - but "
                         : "") +
                       "a WhatsApp message to <b>" + WHATSAPP + "</b> is read as " +
                       "soon as the office opens.",
                 source: "Contact" };
      }

      if (ent.intent === "complaint") {
        return { html: "There are two ways, depending on whether you want your " +
                       "name attached.<br><br>" +
                       "<b>Anonymous</b> - the <b>Suggestion Box</b> on the " +
                       "Contact page goes straight to the headmistress with no " +
                       "name attached.<br><br>" +
                       "<b>With a reply</b> - the message form on the same page, " +
                       "answered by email usually within one school day. For " +
                       "anything urgent involving your child, call <b>" +
                       WHATSAPP + "</b> rather than waiting." +
                       "<br><br><a class=\"chat-link\" href=\"contact.html\">" +
                       "Open Contact</a>",
                 source: "Contact" };
      }

      if (ent.intent === "passwordhelp") {
        return { html: "<b>Getting into the portal</b><br>" +
                       "Your child's <b>Registration Number</b> is the username - " +
                       "it is on the admission slip, and the office will re-read " +
                       "it to you on <b>" + WHATSAPP + "</b> if you have lost " +
                       "it.<br><br>" +
                       "&bull; <b>First time?</b> Enter the Registration Number " +
                       "and the <b>Create Password</b> form appears by itself.<br>" +
                       "&bull; <b>Wrong password twice?</b> The <b>Forgot " +
                       "Password</b> form opens so you can reset it.<br>" +
                       "&bull; <b>Staff</b> sign in with Staff ID and PIN; the " +
                       "headmistress resets those.<br><br>" +
                       "One account holds all your children.",
                 source: "Login help" };
      }

      if (ent.intent === "location" &&
          !/\b(to|from) (lagos|abuja|london|dubai|new york|kano|ilorin|port harcourt|benin city|kaduna)\b/.test(s)) {
        return { html: "Treasure Academy is at <b>Ageva, Okene, Kogi State</b>." +
                       "<br><br>The office is open <b>Monday to Friday, 7:30am " +
                       "to 3:00pm</b>, and you are welcome to call in. The " +
                       "<b>Contact</b> page has a map and directions, and school " +
                       "transport runs on three routes - Adavi, Okene Town and " +
                       "Ageva.<br><br>Phone or WhatsApp: <b>" + WHATSAPP + "</b>" +
                       "<br><a class=\"chat-link\" href=\"contact.html\">" +
                       "Directions and map</a>",
                 source: "Contact" };
      }

      if (ent.intent === "overview") {
        var nClasses = (db.classPages || []).length ||
                       Object.keys(school.fees || {}).length;
        return { html: "<b>Treasure Academy, Ageva</b> is a private school in " +
                       "Ageva, Okene, Kogi State, founded in <b>2016</b> by " +
                       "Shaibu Sidikat Ruth and run today by headmistress " +
                       "<b>Mrs. Salihu Nanahawa</b>.<br><br>" +
                       "It covers " + (nClasses ? "<b>" + nClasses + "</b> classes " : "") +
                       "from <b>Creche</b> at six months right through to " +
                       "<b>Primary 6</b>, on its own permanent site since 2018, " +
                       "with a computer room, a playground and an online " +
                       "portal where parents check results.<br><br>" +
                       "In 2024 every Primary 6 pupil passed the Common " +
                       "Entrance.<br><br>" +
                       "Ask me about fees, a particular class, admissions or " +
                       "visiting - I can go into any of it.",
                 source: "About" };
      }

      if (ent.intent === "leadership") {
        return { html: "<b>Mrs. Salihu Nanahawa</b> is the headmistress and runs " +
                       "the school day to day.<br><br>" +
                       "The school was founded and is owned by " +
                       "<b>Shaibu Sidikat Ruth</b>, Founder and Proprietress, " +
                       "who started it in 2016.<br><br>" +
                       "Either can be reached through the school office on <b>" +
                       WHATSAPP + "</b>.",
                 source: "About" };
      }

      if (ent.intent === "staffinfo") {
        var team = (db.staffWall || []).filter(function (x) {
          return x.name && !/\(demo\)/i.test(x.name);
        });
        if (team.length) {
          var teaching = team.filter(function (x) { return x.class; });
          var others = team.filter(function (x) { return !x.class; });
          var html = "<b>The team</b><br>" +
            teaching.map(function (x) {
              return "&bull; <b>" + esc(x.name) + "</b> - " + esc(x.class) +
                     (x.quals ? " <small>(" + esc(x.quals) + ")</small>" : "");
            }).join("<br>");
          if (others.length) {
            html += "<br><br><b>Support</b><br>" + others.map(function (x) {
              return "&bull; <b>" + esc(x.name) + "</b> - " +
                     esc(x.position || "staff") +
                     (x.quals ? " <small>(" + esc(x.quals) + ")</small>" : "");
            }).join("<br>");
          }
          html += "<br><br>Every teacher is qualified - the school hires for " +
                  "character first, then skill.";
          return { html: html, source: "Staff list" };
        }
      }

      if (ent.intent === "pickup") {
        return { html: "Pupils are released only to a <b>parent or a named " +
                       "guardian</b> - never to whoever turns up. If someone " +
                       "else must collect your child, tell the class teacher or " +
                       "the office beforehand.<br><br>" +
                       "Closing is <b>3:00pm</b>, and children are supervised " +
                       "until they are collected. Supervised school transport " +
                       "runs on three routes if you would rather your child came " +
                       "home by bus.",
                 source: "School day" };
      }

      if (ent.intent === "founder" &&
          !/\b(amazon|google|microsoft|apple|facebook|twitter|tesla|whatsapp|instagram|youtube|nigeria|africa|the world)\b/.test(s)) {
        return { html: "Treasure Academy was founded in <b>2016</b> by " +
                       "<b>Shaibu Sidikat Ruth</b>, a mother and trained " +
                       "teacher, who wanted the children of Ageva to have a " +
                       "school that feels like home and teaches like the very " +
                       "best.<br><br>" +
                       "It began with a handful of pupils and a few teachers in " +
                       "a rented apartment, and moved to its own permanent site " +
                       "in <b>2018</b>. She remains Founder and Proprietress.<br><br>" +
                       "The headmistress who runs the school day to day is " +
                       "<b>Mrs. Salihu Nanahawa</b>.",
                 source: "About" };
      }

      if (ent.intent === "mission") {
        return { html: "<b>Mission</b><br>Building an effective and efficient " +
                       "future leader - raising confident, brilliant and " +
                       "well-mannered children through strong academics and " +
                       "morals.<br><br>" +
                       "<b>Vision</b><br>To be the most trusted school in Okene, " +
                       "where every graduate shines in secondary school and " +
                       "beyond.<br><br>" +
                       "The promise the school repeats most often: " +
                       "<i>every child can excel - our work is to give them the " +
                       "foundation to do so</i>.",
                 source: "About" };
      }

      if (ent.intent === "history") {
        return { html: "<b>The journey so far</b><br>" +
                       "<b>2016</b> - Founded by Shaibu Sidikat Ruth: a handful " +
                       "of pupils, a few teachers, one big dream.<br>" +
                       "<b>2018</b> - Moved to a permanent site in Ageva with " +
                       "bigger classrooms and a playground.<br>" +
                       "<b>2021</b> - Computer room opened; the " +
                       "coding club began for Primary pupils.<br>" +
                       "<b>2024</b> - 100% Common Entrance pass; all Primary 6 " +
                       "pupils entered top secondary schools.<br>" +
                       "<b>2026</b> - Online portal launched, putting results, " +
                       "attendance and notices on parents' phones.",
                 source: "About" };
      }

      if (ent.intent === "facilities") {
        /* Answer about the specific thing asked for, the same rule used for
           lost property: name it, then give the rest. */
        var have = {
          "computer": "a <b>computer room</b>, opened in 2021, with a coding club for Primary pupils",
          "playground": "a <b>playground</b>, on the permanent site since 2018",
          "classroom": "bright <b>classrooms</b> on the school's own permanent site",
          "portal": "an <b>online portal</b> where parents check results, attendance and notices",
          "sick": "a <b>sick bay</b> for minor injuries, with parents called straight away"
        };
        var askedFor = null;
        if (/\bcomputer|ict|coding|lab\b/.test(s)) askedFor = "computer";
        else if (/\bplay ?ground|play area\b/.test(s)) askedFor = "playground";
        else if (/\bsick|clinic|nurse|first aid\b/.test(s)) askedFor = "sick";

        /* Things the school does not have. Saying so plainly is better than a
           vague answer that leaves a parent assuming. */
        /* The school reads and does science practicals, but it has no
           library and no science laboratory - the owner said so plainly,
           so the bot says so plainly too. */
        if (/\bscience (lab|laboratory)|laborator/.test(s)) {
          return { html: "Science at Treasure Academy is taught with " +
                         "<b>plenty of practicals</b> - but there is no " +
                         "separate science laboratory.<br><br>What the " +
                         "school does have: a computer room, a playground " +
                         "and an online portal for parents.",
                   source: "About" };
        }
        if (/\blibrar/.test(s)) {
          return { html: "Treasure Academy does not have a <b>library</b>. " +
                         "Reading is served by the <b>Reading Corner</b> - " +
                         "a reading programme where pupils log the books " +
                         "they finish and climb the leaderboard.<br><br>" +
                         "What the school does have: a computer room, a " +
                         "playground and an online portal for parents.",
                   source: "About" };
        }
        if (/\bswimming|pool\b/.test(s)) {
          return { html: "There is no <b>swimming pool</b> - Treasure Academy " +
                         "does not offer swimming.<br><br>What the school does " +
                         "have: a computer room, science practicals, a playground and a " +
                         "sick bay, all on its own permanent site.<br><br>" +
                         "If that matters for your decision, the office can talk " +
                         "you through the school day on <b>" + WHATSAPP + "</b>.",
                   source: "About" };
        }
        if (/\b(boarding|hostel|dormitory|sleep over)\b/.test(s)) {
          return { html: "Treasure Academy is a <b>day school</b> - there is no " +
                         "boarding. Pupils arrive from 7:00am and are collected " +
                         "by 3:00pm, and supervised transport runs on three " +
                         "routes if you need it.",
                   source: "About" };
        }

        var all = "a <b>computer room</b> (since 2021, with a coding club), " +
                  "hands-on <b>science practicals</b>, a <b>playground</b>, " +
                  "classrooms on the school's own permanent site, a " +
                  "<b>sick bay</b>, and an <b>online portal</b> for parents.";
        if (askedFor) {
          return { html: "Yes - the school has " + have[askedFor] + ".<br><br>" +
                         "Altogether: " + all,
                   source: "About" };
        }
        return { html: "<b>What the school has</b><br>" + all +
                       "<br><br>Supervised transport runs on three routes.",
                 source: "About" };
      }

      if (ent.intent === "performance" &&
          /* "who were the graduates in 2017?", "the graduands of the 4th
             graduation" and "list of graduates 2020" are about one past
             set - they belong with the graduation-ceremony answers below,
             not with the 2024 results. A bare "did my child graduate"
             (no year, no ordinal) stays right here. */
          !((/\b201[7-9]\b|\b202[01]\b/.test(s) &&
             /graduat|graduand|head[- ]?(girl|boy)|\bset\b/.test(s)) ||
            (/\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|sixth)\b/.test(s) &&
             /graduat|graduand/.test(s)) ||
            /\bgraduands?\b|\bhead[- ]?(girl|boy)s?\b/.test(s))) {
        return { html: "In <b>2024</b> every Primary 6 pupil passed the " +
                       "<b>Common Entrance</b> examination - a 100% pass rate - " +
                       "and all of them went on to top secondary schools.<br><br>" +
                       "Primary 6 pupils practise Common Entrance questions " +
                       "inside the portal through the year, which is how that " +
                       "result is built rather than hoped for.",
                 source: "About" };
      }

      if (ent.intent === "staffcount") {
        var teachers = (db.teachers || []).length;
        var pupils = (db.pupils || []).length;
        var lines = [];
        if (teachers) lines.push("<b>" + teachers + "</b> teaching staff are on the roll");
        if (pupils) lines.push("<b>" + pupils + "</b> pupils are currently enrolled");
        if (lines.length) {
          return { html: lines.join(", and ") + ".<br><br>Classes are kept " +
                         "deliberately small so every child is known by name " +
                         "rather than by number. The exact size of a particular " +
                         "class changes each term - the office will tell you " +
                         "what it is right now on <b>" + WHATSAPP + "</b>.",
                   source: "Staff list" };
        }
        return { html: "Classes are kept deliberately small so every child is " +
                       "known by name. Exact numbers change each term, so the " +
                       "office is the reliable source - <b>" + WHATSAPP + "</b>.",
                 source: "About" };
      }

      /* ---- People who are not parents here yet. -------------------------
         Prospective parents, job seekers, organisations. These visitors are
         the reason a school has a website at all, and the old bot had nothing
         for them. Every answer ends with a next step. */

      /* Someone looking for work. */
      if (ent.intent === "employment") {
        return { html: "<b>Teaching and support roles</b><br>" +
                       "Treasure Academy hires for character first, then skill - " +
                       "people who keep promises, speak kindly and treat every child " +
                       "like their own. Qualifications matter, but discipline and " +
                       "warmth matter more.<br><br>" +
                       "What you get: small classes, supportive leadership, a termly " +
                       "teaching plan that actually guides you, and pay discussed at " +
                       "interview and paid on time.<br><br>" +
                       "Apply with the form on the <b>Careers</b> page - name, " +
                       "WhatsApp number, the role, your highest qualification and " +
                       "brief experience. Shortlisted applicants are called within " +
                       "<b>two weeks</b>.<br><br>" +
                       "<a class=\"chat-link\" href=\"careers.html\">Open the Careers page</a>",
                 source: "Careers" };
      }

      /* Organisations, sponsors, would-be partners. We hold no partner list,
         so say that honestly and route them to a person rather than invent
         names. */
      if (ent.intent === "partner") {
        return { html: "Partnerships, sponsorships and supplier enquiries are " +
                       "handled personally by the school office rather than listed " +
                       "on the website, so I do not have a published list to read " +
                       "from.<br><br>" +
                       "The quickest route is to speak to the headmistress, " +
                       "<b>Mrs. Salihu Nanahawa</b>, directly on <b>" + WHATSAPP +
                       "</b>, or send the details through the <b>Contact</b> page " +
                       "and the office will come back to you by email.<br><br>" +
                       "If you are offering support in kind - books, furniture, " +
                       "fans - the <b>Support Us</b> page lists what the school is " +
                       "currently asking for.",
                 source: "Contact" };
      }

      /* A parent thinking about bringing a child here. */
      /* An admission verb next to a class name is an admissions question
         whatever the classifier decided - and a fee word next to the same
         words is a fee question, so it stays out. */
      var enterAsk = ent.klass &&
        !/fee|pay|cost|much|price/.test(s) &&
        (ent.intent === "classinfo" || !ent.intent) &&
        /\b(enter|entering|join|joining|admit|admission|admissions|enrol|enroll|register|put my|transfer)\b/.test(s);
      if ((ent.intent === "enrol" || enterAsk) &&
          !/\bdeadline|cut ?off|last day\b/.test(s)) {
        var fees0 = school.fees || {};
        var keys0 = Object.keys(fees0);
        var range = "";
        if (keys0.length) {
          var amounts = keys0.map(function (k) { return Number(fees0[k]) || 0; })
                             .filter(function (n) { return n > 0; })
                             .sort(function (a, b) { return a - b; });
          if (amounts.length) {
            range = "<br><br>Fees run from <b>" + naira(amounts[0]) + "</b> to <b>" +
                    naira(amounts[amounts.length - 1]) + "</b> per term depending on " +
                    "the class. Ask me about any class for its exact fee.";
          }
        }
        return { html: "<b>Yes - admissions are open.</b><br>" +
                       "Treasure Academy takes children from <b>Creche</b> " +
                       "(6 months) through <b>Nursery</b> to <b>Primary 6</b>, at " +
                       "Ageva, Okene, Kogi State." + range + "<br><br>" +
                       "<b>How to start:</b> tap <b>Login/Register</b> and complete " +
                       "the three steps - ward, guardian, payment - then visit the " +
                       "school within two weeks to finish. If you would rather see " +
                       "the place first, just come to the office; you are welcome to " +
                       "look around.<br><br>" +
                       "Already have a child here? Register the second one with the " +
                       "same phone number and both sit under one account.<br><br>" +
                       "<a class=\"chat-link\" href=\"admissions.html\">Open Admissions</a>",
                 source: "Admissions" };
      }

      /* Someone who wants to come and look. */
      if (ent.intent === "visit") {
        return { html: "You are welcome to visit. The school is at <b>Ageva, Okene, " +
                       "Kogi State</b> and the office is open <b>Monday to Friday, " +
                       "7:30am to 3:00pm</b>.<br><br>" +
                       "No appointment is needed to look around, but a quick message " +
                       "on <b>" + WHATSAPP + "</b> means someone is expecting you and " +
                       "the headmistress can make time for your questions.<br><br>" +
                       "<a class=\"chat-link\" href=\"contact.html\">Directions and map</a>",
                 source: "Contact" };
      }

      /* Why this school rather than another. Answered from what is true. */
      if (ent.intent === "compare") {
        return { html: "Fair question. What the school actually offers:<br><br>" +
                       "&bull; <b>Small classes</b>, so a child is known by name, not " +
                       "by number.<br>" +
                       "&bull; <b>Creche to Primary 6</b> on one site - no moving your " +
                       "child mid-way.<br>" +
                       "&bull; Founded in <b>2016</b> by Shaibu Sidikat Ruth, a mother " +
                       "and trained teacher, and on its own permanent site since " +
                       "year three.<br>" +
                       "&bull; <b>Common Entrance practice</b> built into Primary 6.<br>" +
                       "&bull; Supervised <b>school transport</b> on three routes.<br>" +
                       "&bull; Results, attendance and fees visible to parents in the " +
                       "portal, not locked in a file.<br><br>" +
                       "The honest way to judge it is to visit while school is " +
                       "running and watch how the children behave.",
                 source: "About" };
      }

      /* Safety - the question every parent asks and few sites answer. */
      if (ent.intent === "safety") {
        return { html: "Children are supervised from arrival to pick-up. The gate " +
                       "opens at 7:00am, assembly is 7:45am and closing is 3:00pm; " +
                       "pupils are released to a parent or a named guardian, not to " +
                       "anyone who turns up.<br><br>" +
                       "A duty teacher is on the assembly ground each day, minor " +
                       "injuries are handled at the sick bay and you are called " +
                       "straight away if your child is unwell.<br><br>" +
                       "If something has happened today, do not wait for email - " +
                       "call the school on <b>" + WHATSAPP + "</b>.",
                 source: "School day" };
      }

      /* Term dates, straight from the calendar. */
      if ((/\binter[- ]?house\b|\bsports? day\b|\bwhen\b[^.?!]{0,24}\bsports?\b|\bresumption|resume|term date|calendar|deadline|closing date|last day|cut off|cut-off|when.*(start|begin|open)\b|\bindependence|mid[- ]?term|\bcarol|prize ?giving|closing (day|date|ceremony)|\b(events?|program(me)?s?)\b[^.?!]{0,30}\b(coming|next|upcoming|this term|soon)\b|\b(coming|upcoming|any) events?\b|(whats|what.s|wats) happening( this term)?\b|end of (the )?term|term (ends?|finishes?|closes?|close|finish)|\bschool (ends?|finishes?|closes?)\b[^.?!]{0,25}\bterm\b|\bterm\b[^.?!]{0,25}\bschool (ends?|finishes?|closes?)\b|\bwhats new\b|\blatest news\b|\bany news\b|\bexcursion\b|\bsports? trials?\b|\btrials\b|when[^.?!]{0,24}\bclosing\b(?![^.?!]{0,12}\btime\b)|\bclosing\b(?![^.?!]{0,12}\btime\b)(?=[^.?!]{0,6}$)|\bclosing\b[^.?!]{0,24}\b(date|when)\b|when[^.?!]{0,24}\bexaminations?\b|\bexaminations?\b[^.?!]{0,30}\b(date|day)\b|\b(date|day)\b[^.?!]{0,30}\bexaminations?\b|\b(first|mid|end of) term exams?\b|graduat(?!es?\b)/.test(s) ||
          /* "who was the head girl of the 1st graduation?" and "graduands
             of 2017" are news questions too - but only with a ceremony
             context, so "who is the head boy of the school" (today's pupil
             leadership) keeps its own answer elsewhere */
          (/\bhead[- ]?(girl|boy)s?\b|\bgraduands?\b/.test(s) && /graduat|ceremony|\b201[7-9]\b|\b202[01]\b|\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth)\b/.test(s)) ||
          /* "who were the graduates in 2017?" - a historic ceremony year
             makes it about that set, not the latest results */
          (/\bgraduates?\b/.test(s) && /\b201[7-9]\b|\b202[01]\b/.test(s))) &&
          !/\bnigeria\b[^.?!]{0,40}\bindependence\b|\bindependence\b[^.?!]{0,40}\bnigeria\b/.test(s)) {
        var cal = (db.calendar || []).slice().sort(function (a, b) {
          return String(a.date).localeCompare(String(b.date));
        });
        var isoNow = new Date().toISOString().slice(0, 10);
        /* "What's new?" wants the news feed, not the term calendar. */
        if (/\bwhats new\b|\blatest news\b|\bany news\b/.test(s)) {
          var newsList = (db.newsEvents || []).filter(function (n) {
            return n.date;
          }).sort(function (a, b) {
            return String(b.date).localeCompare(String(a.date));
          }).slice(0, 3);
          if (newsList.length) {
            return { html: "<b>Latest from the school:</b><br>" +
                           newsList.map(function (n) {
                             return "\u2022 " + esc(n.title) + " - " + pretty(n.date);
                           }).join("<br>") +
                           "<br><br>The full list is on the News page.",
                     source: "News & events" };
          }
        }
        /* Inter-House Sports is published as a news event, not a term
           calendar line, so this lookup reads both lists. A date already
           past is reported honestly in the past tense, and the competition
           date itself is never invented. */
        /* "when is the excursion" and an elliptical "and the sports
           trials?" belong here too: a when-question about a thing that
           has no dated event deserves an honest no-date answer, not the
           next unrelated calendar line. */
        var ellipt = /^\s*(and|what of|how about|also)\b/.test(s);
        var whenQ = /\bwhen\b|what date|which day/.test(s);
        /* the context layer merges a fragment onto its topic, so
           "excursion and the sports trials?" carries no "when" and no
           leading "and" - the fragment shape sits mid-question instead */
        var carried = /\b(and|what of|how about|also)\s+\S/.test(s);
        if (!/fee|pay|cost|much|price/.test(s) &&
            (/\binter[- ]?house\b|\bsports? day\b/.test(s) ||
             (whenQ && /\bsports?\b/.test(s)) ||
             /* the stem survives typos ("graduatin") that the exact word
                does not; bare "graduate(s)" stays with the results answers */
             /graduat(?!es?\b)/.test(s) ||
             (/\bhead[- ]?(girl|boy)s?\b|\bgraduands?\b/.test(s) && /graduat|ceremony|\b201[7-9]\b|\b202[01]\b|\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth)\b/.test(s)) ||
             (/\bgraduates?\b/.test(s) && /\b201[7-9]\b|\b202[01]\b/.test(s)) ||
             (/\bexcursion\b/.test(s) && (whenQ || ellipt || carried)) ||
             ((ellipt || carried) && /\bsports?\b/.test(s)))) {
          var newsCal = (db.newsEvents || []).filter(function (n) {
            return n.type === "event" && n.date;
          }).map(function (n) {
            return { title: n.title, date: n.date };
          });
          /* "graduation" and "prize giving day" are different questions:
             the family asked about decides which events are in the race.
             Prize-giving day keeps its calendar answer (Closing & Carol),
             so it is deliberately not routed here. */
          var evRe = ((/graduat(?!es?\b)/.test(s) ||
                       /\bhead[- ]?(girl|boy)s?\b|\bgraduands?\b/.test(s)) ||
                      (/\bgraduates?\b/.test(s) && /\b201[7-9]\b|\b202[01]\b/.test(s))) &&
                     !/\binter[- ]?house\b|\bsports? day\b/.test(s)
            ? /graduat/i : /inter[- ]?house|sports|excursion/i;
          var pool = cal.concat(newsCal).filter(function (c) {
            return evRe.test(c.title || "");
          }).sort(function (a, b) {
            return String(a.date).localeCompare(String(b.date));
          });
          /* a numbered ceremony ("the 2nd graduation") answers itself,
             not the latest one on the list */
          var ordM = s.match(/\b(1st|2nd|3rd|4th|5th|6th|first|second|third|fourth|fifth|sixth)\b/);
          /* "when did graduation start?" / "the school's first ever set" -
             the beginning is the 1st ceremony */
          if (!ordM && /graduat/.test(s) &&
              /\b(start(ed|ing)?s?|began|first ever|earliest|inaugural)\b/.test(s)) {
            ordM = ["1st", "1st"];
          }
          if (ordM) {
            var ordMap = { "1st":"1st", "first":"1st", "2nd":"2nd", "second":"2nd",
                           "3rd":"3rd", "third":"3rd", "4th":"4th", "fourth":"4th",
                           "5th":"5th", "fifth":"5th", "6th":"6th", "sixth":"6th" };
            var want = ordMap[ordM[1]];
            var named = pool.filter(function (c) {
              return new RegExp("^" + want, "i").test(String(c.title || "").trim());
            });
            if (named.length) pool = named;
          }
          /* a year ("who graduated in 2017?") narrows the pool the same way
             an ordinal does - but only when that year has a ceremony, so a
             far-off year never empties the pool */
          if (!ordM) {
            /* a follow-up ("and 2018?") carries the old year first and the
               new one last - the last year is the one being asked about */
            var yrAll = s.match(/\b(201[5-9]|202[0-9])\b/g);
            var yrM = yrAll ? yrAll[yrAll.length - 1] : null;
            if (yrM) {
              var ypool = pool.filter(function (c) {
                return String(c.date).indexOf(yrM) === 0;
              });
              if (ypool.length) pool = ypool;
            }
          }
          /* a who-question with no set named ("who was the head girl?")
             prefers the ceremony whose graduands the school has actually
             published, so the follow-up "and the head boy?" still meets
             the named set */
          var whoQ = /\bwho\b|\b(names?|lists?)\b|head[- ]?(girl|boy)|graduands?/.test(s);
          if (whoQ && pool.length > 1) {
            var fullByTitle = {};
            (db.newsEvents || []).forEach(function (n) {
              if (n.type === "event" && n.date) fullByTitle[n.title + "|" + n.date] = n;
            });
            var namedPool = pool.filter(function (c) {
              var n = fullByTitle[c.title + "|" + c.date];
              return n && /^\s*\d+\.\s+\S/m.test(String(n.story || ""));
            });
            if (namedPool.length && namedPool.length < pool.length) pool = namedPool;
          }
          var future = pool.filter(function (c) {
            return String(c.date) >= isoNow;
          })[0];
          var ev = future || pool[pool.length - 1];
          /* follow-up fragments ("and the head boy?", "and 2018?") must
             stay with the graduation family, even when the question that
             produced this answer had no ceremony word of its own */
          if (ev && /graduat/i.test(ev.title || "")) {
            this.topic = "graduation ceremony";
          }
          var sportsQ = /inter[- ]?house|sports? day/.test(s) ||
                        /\bsports\b/.test(s);
          var excQ = /\bexcursion\b/.test(s);
          /* nothing dated: say so honestly instead of answering an
             event the family never asked about. Excursions keep the
             when-shape guard so "does primary 5 do excursions" still
             reaches the class page answer. */
          if (!ev && (sportsQ || (excQ && (whenQ || ellipt || carried)))) {
            return { html: (excQ && !sportsQ)
                      ? "The next <b>school excursion</b> has not been " +
                        "dated yet - it will be announced on the News and " +
                        "Calendar pages, or ask the office on <b>" +
                        WHATSAPP + "</b>."
                      : "We hold <b>Inter-House Sports</b> at Treasure " +
                        "Academy. The next competition has not been dated " +
                        "yet - it will be announced on the News and " +
                        "Calendar pages, or ask the office on <b>" +
                        WHATSAPP + "</b>.",
                     source: "School news" };
          }
          if (ev) {
            /* a who-question ("who was the head girl of the 1st
               graduation?") answers with the graduands the school
               published - a name that is not in the story is never
               invented. Sets whose story has no list fall through to the
               honest office answer below. */
            if (whoQ && !future && /graduat/i.test(ev.title || "")) {
              var evFull = (db.newsEvents || []).filter(function (n) {
                return n.type === "event" && n.date &&
                       String(n.title) === String(ev.title) &&
                       String(n.date) === String(ev.date);
              })[0];
              var gLines = String((evFull && evFull.story) || "").split("\n")
                .filter(function (L) { return /^\s*\d+\.\s+\S/.test(L); })
                .map(function (L) { return L.replace(/^\s*\d+\.\s+/, "").trim(); });
              if (gLines.length) {
                return { html: "The graduands of the <b>" + esc(ev.title) +
                               "</b> (" + pretty(ev.date) + ") were:<br>" +
                               gLines.map(function (L) { return "\u2022 " + esc(L); }).join("<br>") +
                               "<br><br>The full story is on our News page.",
                         source: "School news" };
              }
              return { html: "The school has not published the names of " +
                             "that set's graduands yet. The <b>" + esc(ev.title) +
                             "</b> held on " + pretty(ev.date) +
                             " - ask the office on <b>" + WHATSAPP +
                             "</b> for the list.",
                       source: "School news" };
            }
            if (future) {
              return { html: "<b>" + esc(ev.title) + "</b> is on " +
                             pretty(ev.date) + ". Watch the News page " +
                             "for the full programme.",
                       source: "School news" };
            }
            var evNext = /graduat/i.test(ev.title || "")
              ? (/^\d+(st|nd|rd|th)\b/.test(ev.title)
                   ? "The next graduation ceremony"
                   : "The next " + esc(ev.title))
              : "The main Inter-House Sports competition";
            return { html: "<b>" + esc(ev.title) + "</b> held on " +
                           pretty(ev.date) + ". " + evNext +
                           " has not been dated yet - it will be " +
                           "announced on the News and Calendar pages, or " +
                           "ask the office on <b>" + WHATSAPP + "</b>.",
                     source: "School news" };
          }
        }
        /* Any event the person actually names answers itself, past or
           future: "when is resumption" must find the resumption line even
           though that date has passed. A token nearer the end of the
           question wins, so a follow-up "and the sports trials?" is about
           the trials, not about the event the last question named. */
        var allCal = cal.concat((db.newsEvents || []).filter(function (n) {
          return n.type === "event" && n.date;
        }).map(function (n) { return { title: n.title, date: n.date }; }));
        var bestEv = null, bestPos = -1, bestFuture = false;
        for (var ac = 0; ac < allCal.length; ac++) {
          var toks = String(allCal[ac].title || "").toLowerCase()
                       .split(/[^a-z]+/).filter(function (w) {
                         return w.length > 3 &&
                           !/^(first|second|third|term|school|academy|day|service|celebration|holiday|party)$/.test(w);
                       });
          if (!toks.length) continue;
          var hitPos = -1;
          for (var tk = 0; tk < toks.length; tk++) {
            var at = s.lastIndexOf(toks[tk]);
            if (at < 0 && /s$/.test(toks[tk])) {
              at = s.lastIndexOf(toks[tk].replace(/s$/, ""));
            }
            if (at < 0) {
              /* "when do we resume" must find "Resumption": a word that
                 shares the first five letters with the token counts
                 ("resum..." is the common stem of both spellings). */
              var ws = s.split(" ");
              for (var wi = 0; wi < ws.length; wi++) {
                if (ws[wi].length >= 4 &&
                    (toks[tk].indexOf(ws[wi]) === 0 ||
                     toks[tk].slice(0, 5) === ws[wi].slice(0, 5))) {
                  at = s.lastIndexOf(ws[wi]); break;
                }
              }
            }
            if (at > hitPos) hitPos = at;
          }
          if (hitPos < 0) continue;
          var future = String(allCal[ac].date) >= isoNow;
          if (!bestEv || hitPos > bestPos ||
              (hitPos === bestPos && future && !bestFuture)) {
            bestEv = allCal[ac]; bestPos = hitPos; bestFuture = future;
          }
        }
        if (bestEv) {
          var pastEv = String(bestEv.date) < isoNow;
          /* Admissions run for the first seven weeks of term, so the
             resumption line is also where the deadline is worked out. */
          var resTail = "";
          if (/resump/i.test(bestEv.title || "")) {
            var rdd = new Date(String(bestEv.date) + "T12:00:00");
            rdd.setDate(rdd.getDate() + 46);
            resTail = "<br><br>Admissions run for the first <b>seven " +
                      "weeks</b> of term - the deadline is <b>" +
                      pretty(rdd.toISOString().slice(0, 10)) + "</b>.";
          }
          return { html: "<b>" + esc(bestEv.title) + "</b> " +
                         (pastEv ? "was on " : "is on ") +
                         pretty(bestEv.date) + "." +
                         (bestEv.desc ? "<br><br>" + esc(bestEv.desc) : "") +
                         resTail,
                   source: "School calendar" };
        }

        /* A named event answers itself: "when is independence day" is a
           question about one line of the calendar, not the next line. */
        var namedRe = /independence/.test(s) ? /independence/i
          : /mid[- ]?term/.test(s) ? /mid[- ]?term/i
          : /carol/.test(s) ? /carol/i
          : /(closing|prize ?giving|last day|end of (the )?term|term (end|finis|clos))/.test(s) ? /closing|carol/i : null;
        if (namedRe) {
          var named = cal.filter(function (c) {
            return namedRe.test(c.title || "");
          })[0];
          if (named) {
            var held = String(named.date) < isoNow;
            return { html: "<b>" + esc(named.title) + "</b> " +
                           (held ? "held on " : "is on ") +
                           pretty(named.date) + "." +
                           (named.desc ? "<br><br>" + esc(named.desc) : ""),
                     source: "School calendar" };
          }
        }
        /* "What events are coming up?" wants the list, not one date. */
        if (/\b(events?|program(me)?s?)\b|(whats|what.s|wats) happening/.test(s)) {
          var ups = cal.filter(function (c) { return String(c.date) >= isoNow; })
                       .slice(0, 4);
          if (ups.length) {
            return { html: "<b>Coming up on the school calendar:</b><br>" +
                           ups.map(function (c) {
                             return "\u2022 " + esc(c.title) + " - " + pretty(c.date);
                           }).join("<br>") +
                           "<br><br>The full calendar is on the Calendar page.",
                     source: "School calendar" };
          }
        }
        var iso0 = new Date().toISOString().slice(0, 10);
        var soon = cal.filter(function (c) { return String(c.date) >= iso0; })[0];
        /* Admissions run for the first seven weeks of term, so the
           deadline is the Friday of week 7 - resumption + 46 days when
           resumption is a Monday. The upcoming list
           only holds future events, so once term starts resumption drops out
           and the deadline used to vanish for parents asking mid-term. Fall
           back to the whole calendar so the date is still quoted, and report
           it honestly as closed. */
        var resAny = cal.filter(function (c) {
          return /resump/i.test(c.title || "");
        }).sort(function (a, b) {
          return String(b.date).localeCompare(String(a.date));
        })[0];
        var tail = "<br><br>Ask the office about the admission deadline for this term.";
        if (resAny) {
          var dd = new Date(String(resAny.date) + "T12:00:00");
          dd.setDate(dd.getDate() + 46);
          var dIso = dd.toISOString().slice(0, 10);
          var left = Math.round((dd - new Date()) / 86400000);
          tail = "<br><br>Admissions run for the first <b>seven weeks</b> " +
                 "of term. Deadline: <b>" + pretty(dIso) + "</b> (" +
                 (left < 0 ? "closed" : left === 0 ? "closes today" : left + " days left") + ").";
        }
        if (soon) {
          return { html: "<b>" + esc(soon.title) + "</b> is on " + pretty(soon.date) +
                         "." + tail, source: "School calendar" };
        }
        if (cal.length) {
          return { html: "Term dates are being updated. The last entry on the " +
                         "calendar was <b>" + esc(cal[cal.length - 1].title) +
                         "</b> on " + pretty(cal[cal.length - 1].date) + "." + tail,
                   source: "School calendar" };
        }
        /* No calendar loaded yet. Still answer rather than dropping the
           person into a handoff for a question the school can obviously
           answer. */
        return { html: "The term calendar is being updated, so I do not have " +
                       "the dates in front of me." + tail + "<br><br>" +
                       "The <b>Calendar</b> page always carries the current " +
                       "dates, or call the office on <b>" + WHATSAPP + "</b>.",
                 source: "School calendar" };
      }

      /* Follow-up: the class was just named - "what does he teach?" must
         answer the subject, not start the whole lookup again. */
      if ((/\bwhat (does|do) (he|she|they|it)\b[^.?!]*\bteach/.test(s) ||
           /\bwhich subject(s)? (does|do) (he|she|they|it)\b/.test(s)) &&
          this.topicClass) {
        var fwall = [];
        for (var fw = 0; fw < (db.staffWall || []).length; fw++) {
          var fwx = db.staffWall[fw];
          if (fwx.name && !/\(demo\)/i.test(fwx.name) &&
              String(fwx.class || "").toLowerCase() === this.topicClass) {
            fwall.push(fwx);
          }
        }
        if (fwall.length) {
          var subj = [];
          for (var fs = 0; fs < fwall.length; fs++) {
            var pos = String(fwall[fs].position || "");
            if (pos && !/^class teacher$/i.test(pos)) {
              subj.push(pos.replace(/\s*teacher\s*$/i, "").trim());
            }
          }
          if (subj.length) {
            return { html: "<b>" + esc(fwall[0].name) + "</b> teaches <b>" +
                           esc(subj.join(" and ")) + "</b> for <b>" +
                           esc(this.topicClass) + "</b>.<br><br>The Subjects " +
                           "page has the full subject list.",
                     source: "Staff list" };
          }
          return { html: "<b>" + esc(fwall[0].name) + "</b> is the class " +
                         "teacher for <b>" + esc(this.topicClass) + "</b>. " +
                         "The subjects each teacher takes are not listed " +
                         "separately - the <b>Subjects</b> page has the " +
                         "full list.",
                   source: "Staff list" };
        }
      }

      /* Who teaches a class.

         Two lists exist. db.teachers is the login roster and still carries
         retired demo rows marked "(demo)"; db.staffWall is the real staff the
         school publishes, with qualifications. Prefer the staff wall, and
         never read out a demo name to a parent. */
      if ((/\b(who|which teacher|class teacher)\b/.test(s) ||
           (/\bteaches?\b/.test(s) &&
            !/\b(talk|speak|chat|call|contact|see|meet|reach|phone)\b/.test(s))) &&
          /\bteach|teacher|handles?|takes?\b/.test(s)) {
        var real = (db.staffWall || []).filter(function (x) {
          return x.name && !/\(demo\)/i.test(x.name);
        });
        var roster = (db.teachers || db.staff || []).filter(function (x) {
          return x.name && !/\(demo\)/i.test(x.name);
        });
        var pool = real.length ? real : roster;
        var wantCls = ent.klass;
        /* A carried question can mention two classes ("teaches nursery
           and primary 6") - the one the person JUST named, the last one
           written, is the one they mean. */
        var lastAt = -1;
        pool.forEach(function (x) {
          var c = String(x.class || "").toLowerCase();
          var at = c ? s.lastIndexOf(c) : -1;
          if (at > lastAt) { lastAt = at; wantCls = c; }
        });

        for (var t = 0; t < pool.length; t++) {
          var cls = String(pool[t].class || pool[t].className || "").toLowerCase();
          if (!cls) continue;
          if ((wantCls && cls === wantCls) || (!wantCls && s.indexOf(cls) >= 0)) {
            return { html: "<b>" + esc(pool[t].name) + "</b> is the " +
                           esc(String(pool[t].position || "class teacher").toLowerCase()) +
                           " for <b>" + esc(pool[t].class || pool[t].className) + "</b>" +
                           (pool[t].quals ? ", holding " + esc(pool[t].quals) : "") + ".",
                     source: "Staff list" };
          }
        }

        /* Asked about staff generally rather than one class. */
        if (/\b(staff|teachers|team|qualif)\b/.test(s) && pool.length) {
          var listed = pool.slice(0, 12).map(function (x) {
            return "&bull; <b>" + esc(x.name) + "</b>" +
                   (x.class ? " - " + esc(x.class) : "") +
                   (x.quals ? " <small>(" + esc(x.quals) + ")</small>" : "");
          }).join("<br>");
          return { html: "<b>The teaching team</b><br>" + listed +
                         "<br><br>Every teacher is qualified, and the school " +
                         "hires for character first.",
                   source: "Staff list" };
        }
      }

      /* Phone and WhatsApp. */
      if (/\b(call|phone|number|whatsapp|reach|speak to|talk to)\b/.test(s) &&
          !/\b(best|buy|new|repair|broken|screen|charge|charging|android|iphone|brand|model|price|invented|created|group|download|install|update)\b/.test(s) &&
          !/\bwho (made|created|invented)\b/.test(s)) {
        return { html: "You can reach the school on <b>" + WHATSAPP + "</b> " +
                       "(WhatsApp or call).<br><br>For anything that can wait, " +
                       "the message form on the <b>Contact</b> page replies by email.",
                 source: "Contact" };
      }

      /* Lost property. A parent naming a specific item deserves a specific
         answer about THAT item - "no cardigan has been handed in" - and then
         the next most useful thing, never a bare referral. Checked before
         uniform because "lost his cardigan" is not a price enquiry. */
      if (ent.intent === "lost") {
        var lf = (db.lostfound || []).filter(function (x) {
          return !x.claimed && !x.archived;
        });
        var listAll = function () {
          return lf.slice(0, 6).map(function (x) {
            return "&bull; " + esc(x.item) + (x.date ? " <small>(handed in " +
                   esc(x.date) + ")</small>" : "");
          }).join("<br>");
        };

        /* They named something. Answer about that thing first. */
        if (ent.thing && global.TAEntities) {
          var hit = lf.filter(function (x) {
            return global.TAEntities.matches((x.item || "") + " " + (x.desc || ""), ent.thing);
          });
          if (hit.length) {
            return { html: "Good news - something matching that is waiting at the " +
                           "school office:<br><br>" +
                           hit.slice(0, 4).map(function (x) {
                             return "&bull; <b>" + esc(x.item) + "</b>" +
                                    (x.desc ? "<br><small>" + esc(x.desc) + "</small>" : "") +
                                    (x.date ? "<br><small>Handed in " + esc(x.date) + "</small>" : "");
                           }).join("<br><br>") +
                           "<br><br>Describe it at the office to collect it.",
                     source: "Lost & Found" };
          }
          /* Not there. Say so about their item, then still be useful. */
          if (lf.length) {
            return { html: "No <b>" + esc(ent.thing) + "</b> has been handed in yet, " +
                           "so nothing matches that exactly.<br><br>These are the " +
                           "items currently unclaimed:<br>" + listAll() +
                           "<br><br>Items are usually handed in a day or two later, " +
                           "so it is worth checking at the office. If it does not " +
                           "turn up, tell the class teacher so they can watch for it.",
                     source: "Lost & Found" };
          }
          return { html: "No <b>" + esc(ent.thing) + "</b> has been handed in, and " +
                         "the Lost &amp; Found is empty at the moment.<br><br>" +
                         "Tell the class teacher so they can look out for it, and " +
                         "check again in a day or two - things are usually found " +
                         "after the classrooms are swept.",
                   source: "Lost & Found" };
        }

        /* No specific item named. */
        if (lf.length) {
          return { html: "<b>Unclaimed items at the school office:</b><br>" +
                         listAll() +
                         "<br><br>Describe yours at the office to collect it.",
                   source: "Lost & Found" };
        }
        return { html: "Nothing is waiting in <b>Lost &amp; Found</b> right now. " +
                       "If your child has lost something today, tell the class " +
                       "teacher - most things are found once the classrooms are swept.",
                 source: "Lost & Found" };
      }

      return null;
    },

    smallTalk: function (q) {
      var s = q.toLowerCase().replace(/[^a-z\s]/g, " ").trim();
      if (/^(thanks|thank you|thank u|nice one|well done|ok thanks)\b/.test(s)) {
        return { type: "smalltalk", html: "You are very welcome. Anything else I can check for you?" };
      }
      if (/^(bye|goodbye|see you|later)\b/.test(s)) {
        return { type: "smalltalk", html: "Goodbye, and thank you for visiting Treasure Academy." };
      }
      return null;
    },

    /* Greetings, wellness checks and courtesy in every language we know,
       each answered the way a person answers it. */
    socialAnswer: function (peel) {
      if (peel.kind === "bye") {
        return { type: "smalltalk",
                 html: "Goodbye, and thank you for visiting Treasure Academy. " +
                       "You are welcome back any time." };
      }
      if (peel.kind === "thanks") {
        return { type: "smalltalk",
                 html: "You are very welcome. Anything else I can check for you?",
                 chips: this.suggestions() };
      }
      var g = peel.info || {};
      var echo = g.lang && g.lang !== "en" && g.word
        ? esc(g.word.charAt(0).toUpperCase() + g.word.slice(1)) + "! " : "";
      if (g.kind === "wellness") {
        return { type: "smalltalk",
                 html: echo + "I am very well, thank you for asking - I am here " +
                       "all day, every day.<br><br>And how are you? If there is " +
                       "anything about the school I can check for you - fees, " +
                       "admissions, exam dates, transport - just ask.",
                 chips: this.suggestions() };
      }
      if (g.kind === "casual") {
        return { type: "smalltalk",
                 html: echo + "Not much - just here, ready to answer questions " +
                       "about Treasure Academy: fees for every class, admissions, " +
                       "exam dates, results, transport, uniform, the shop, " +
                       "birthdays, lost property.<br><br>What do you want to know?",
                 chips: this.suggestions() };
      }
      return { type: "smalltalk",
               html: this.greeting(echo ? g.word : null),
               chips: this.suggestions() };
    },

    /* Questions about the assistant itself. The guard matters: "what are you
       doing about bullying" is a school question wearing the same first
       three words, so if real content follows the identity phrase, the
       normal pipeline takes it instead. */
    identity: function (q) {
      var e = global.TAEntities;
      if (!e) return null;
      var s = e.loose(e.norm(q));
      for (var polite = 0; polite < 3 && s; polite++) {
        var stripped = s.replace(/^(please|pls|kindly|excuse me|pardon me|sorry|abeg|i beg[,:]?)\s+/, "");
        if (stripped === s) break;
        s = stripped;
      }
      s = s.replace(/[\s!,.]+(please|pls|kindly|abeg|oo|o|jare|sha)$/,"").replace(/\s+/g," ").trim();
      var words = s ? s.split(" ").filter(Boolean) : [];
      if (!s || words.length > 10) return null;
      var kind = null, rest = "";
      /* The repair pipeline rewrites words it does not know - "dance"
         becomes "danke" - so personal questions are also tested against
         the raw text. */
      var raw = String(q).toLowerCase().replace(/[^a-z0-9\s]/g, " ")
                           .replace(/\s+/g, " ").trim();
      var ps = (raw + " " + s).trim();
      if (/^(who|what) (are|r|is) (you|u)\b/.test(s)) {
        kind = "who"; rest = s.replace(/^(who|what) (are|r) (you|u)\b/, "");
      } else if (/\b(your name|what should i call you|who is this|who be this|who am i talking to|what are you called|introduce yourself|tell me about yourself|who do you work for|do you work for the school|treasure bot)\b/.test(s) && words.length <= 8) {
        kind = "who"; rest = s.replace(/.*(your name|call you|who is this|who be this|talking to|called|introduce yourself|yourself|work for|treasure bot).*/, "");
      } else if (/^(what|which) (can|could|would) you (do|help|say|tell|offer)\b/.test(s) ||
                 /^what (do|does) you (do|know|have)\b/.test(s) ||
                 /\b(whats|what is|wats|what s) your (purpose|job|role|function)\b/.test(s) ||
                 /^how (can|do|will) you help\b/.test(s) ||
                 /^why are you here\b/.test(s) ||
                 /^(can|could) you help( me| us)?\b/.test(s) ||
                 /^what are you (here )?for\b/.test(s) ||
                 /^(please |kindly |pls |plz )?(help|help me|menu|options|commands|what should i ask( you)?)$/.test(s)) {
        kind = "can";
        rest = s.replace(/.*\byour (purpose|job|role|function)\b/, "")
               .replace(/^(what|which|how|why|whats|wats)\b.*\b(you|your|here)\b/, "");
      } else if (/\bare you (a |an |the )?(bot|robot|human|real|person|alive|chat ?gpt|ai|machine|computer|program|headmistress|principal|teacher|owner|bursar|proprietor|proprietress|student|pupil|staff)\b/.test(s)) {
        kind = "bot"; rest = s.replace(/\bare you.*$/, "");
      } else if (/\bwho (made|built|created|designed|trained|programmed|developed) you\b/.test(s)) {
        kind = "made"; rest = "";
      } else if (/\byour (favourite|favorite)s?\b/.test(ps) ||
                 /\b(do|can) you (dance|danke|sing|using|swim|cook|drive|sleep|eat|joke|laugh|dream|cry)\b/.test(ps) ||
                 /\bdo you (like|love|enjoy)\b/.test(ps) ||
                 /^how old are you\b/.test(ps) ||
                 /\bare you (married|single|a boy|a girl)\b/.test(ps) ||
                 /\byour (girlfriend|boyfriend|wife|husband|age|birthday)\b/.test(ps)) {
        kind = "personal"; rest = "";
      }
      if (!kind) return null;
      var meat = rest.replace(/\b(me|my|us|our|please|pls|plz|sir|ma|madam|for|with|about|now|today|o|oo|so|then|please)\b/g, " ").trim();
      if (meat && e.intent(meat)) return null;
      this.stat("asked", q);
      if (kind === "who") {
        return { type: "smalltalk",
                 html: "I am <b>Treasure Bot</b> - the assistant for " +
                       "<b>Treasure Academy, Ageva</b> (Okene, Kogi State). " +
                       "I read the school's own pages and live data to answer " +
                       "questions: fees, admissions, exam dates, results, " +
                       "transport, uniform, the shop and more. If something is " +
                       "not written in the school's information, I say so and " +
                       "put you through to a person.",
                 chips: this.suggestions() };
      }
      if (kind === "bot") {
        return { type: "smalltalk",
                 html: "I am not a person - I am <b>Treasure Bot</b>, the " +
                       "school's own assistant. I am not ChatGPT; I only answer " +
                       "from Treasure Academy's own pages and records, and I " +
                       "would rather say I do not know than guess.",
                 chips: this.suggestions() };
      }
      if (kind === "personal") {
        return { type: "smalltalk",
                 html: "I am <b>Treasure Bot</b> - I do not eat, sleep, dance " +
                       "or grow older, and I have no favourite food. The one " +
                       "subject I know deeply is Treasure Academy itself: " +
                       "fees, admissions, results, transport, the calendar.<br><br>" +
                       "Ask me any of those - or call the office on <b>" +
                       WHATSAPP + "</b> for everything else.",
                 chips: this.suggestions() };
      }
      if (kind === "made") {
        return { type: "smalltalk",
                 html: "I am <b>Treasure Bot</b> - I was built for " +
                       "Treasure Academy, Ageva, as part of " +
                       "the school's website. Everything I say comes from the " +
                       "school's own pages and records - I do not make things up.",
                 chips: this.suggestions() };
      }
      return { type: "smalltalk",
               html: "I am <b>Treasure Bot</b> - here is what I can do:<br><br>" +
                     "\u2022 School fees for every class<br>" +
                     "\u2022 Admissions - how to register, what to bring<br>" +
                     "\u2022 Exam timetable and term dates<br>" +
                     "\u2022 Transport routes and fares<br>" +
                     "\u2022 Uniform and shop prices<br>" +
                     "\u2022 Lost property - is it waiting at the office?<br>" +
                     "\u2022 Staff birthdays, alumni and school events<br>" +
                     "\u2022 Portal help - login, password, verification<br><br>" +
                     "Ask in your own words - English or pidgin, typos welcome. " +
                     "And if a question truly needs a person, I will hand you " +
                     "to the school on WhatsApp.",
               chips: this.suggestions() };
    },

    greeting: function (echo) {
      var s = session();
      var who = s && s.name ? (", " + String(s.name).split(" ")[0]) : "";
      return (echo ? esc(String(echo).charAt(0).toUpperCase() + echo.slice(1)) + "! " : "") +
             "Hello" + esc(who) + ". I am <b>Treasure Bot</b>, the assistant for " +
             "<b>Treasure Academy, Ageva</b>.<br><br>" +
             "I can answer questions about admissions, fees, results, the exam " +
             "timetable, transport, uniform, the shop and school hours - I read " +
             "the school's own pages to answer.<br><br>" +
             (s ? "You are logged in, so I can also point you to your own records."
                : "Some answers are personal to your account. If you ask for one " +
                  "of those I will offer to log you in first.") +
             "<br><br>What would you like to know?";
    },

    /* Suggested questions. They follow the conversation rather than sitting
       static, because the most useful next question depends on what was just
       asked - and a new visitor needs different prompts from a parent who is
       already logged in. */
    suggestions: function () {
      var t = this.topic;
      if (t === "fees") {
        return ["How do I pay?", "Is there a sibling discount?",
                "What does the uniform cost?", "When is the deadline?"];
      }
      if (t === "lost property") {
        return ["What else is unclaimed?", "Where is the school office?",
                "School hours", "Call the school"];
      }
      if (t === "employment") {
        return ["What roles are open?", "How do I apply?",
                "Where is the school?", "Who is the headmistress?"];
      }
      if (t === "enrol" || t === "visit") {
        return ["How much are the fees?", "Can I visit the school?",
                "What classes do you have?", "How do I register?"];
      }
      if (t === "timetable" || t === "results") {
        return ["When is the next exam?", "When does term end?",
                "How much are the fees?", "School hours"];
      }
      if (session()) {
        return ["My results", "My fees balance", "When is the next exam?",
                "School hours"];
      }
      return ["How much are the fees?", "What time does school close?",
              "Can I visit the school?", "How do I register my child?"];
    },

    /* ------------------------------------------------- urgency and handoff */
    readUrgency: function (text) {
      var s = text.toLowerCase();
      if (/\b(now|urgent|urgently|immediate|immediately|right now|fast|quick|asap|today|emergency|chat|talk|agent|human|person|call)\b/.test(s)) return "now";
      if (/\b(wait|later|anytime|any time|no rush|not urgent|whenever|tomorrow|email|form|message)\b/.test(s)) return "later";
      return null;
    },

    handoff: function (kind) {
      var q = (this.pending && this.pending.question) || "";
      this.pending = null;
      this.stat(kind === "now" ? "handoff_whatsapp" : "handoff_ticket", q);

      if (kind === "now") {
        var text = encodeURIComponent(
          "Hello Treasure Academy, I need help with: " + q);
        return {
          type: "handoff-whatsapp",
          html: "For a real-time reply, talk to a person on WhatsApp.<br><br>" +
                "<b>Support line: " + WHATSAPP + "</b><br>" +
                "Someone will chat with you directly. I have written your " +
                "question into the message so you do not have to type it again.",
          action: { label: "Open WhatsApp", kind: "whatsapp",
                    href: "https://wa.me/234" + WHATSAPP.replace(/^0/, "") + "?text=" + text },
          chips: ["Ask something else"]
        };
      }
      return {
        type: "handoff-ticket",
        html: "Then the best route is the message form on the <b>Contact</b> " +
              "page. It reaches the school office and the reply comes to you " +
              "by email, so you do not have to wait by your phone.<br><br>" +
              "I will carry your question across for you.",
        action: { label: "Open the contact form", kind: "contact",
                  href: "contact.html?q=" + encodeURIComponent(q) },
        chips: ["Ask something else"]
      };
    },

    /* --------------------------------------------------------- feedback */
    readFeedback: function (text) {
      var s = text.toLowerCase();
      if (/^(yes|yeah|yep|resolved|solved|helpful|thanks|thank you|good|correct|that helps)\b/.test(s)) return true;
      if (/^(no|nope|not really|unresolved|not resolved|wrong|unhelpful|bad)\b/.test(s)) return false;
      return null;
    },

    recordFeedback: function (helpful) {
      var p = this.pending || {};
      this.pending = null;
      this.stat(helpful ? "resolved" : "not_resolved", p.question || "", null, p.title);

      if (helpful) {
        return {
          type: "resolved",
          html: "Good - I am glad that helped. You can ask me anything else " +
                "whenever you need to.",
          chips: this.suggestions()
        };
      }
      this.pending = { kind: "urgency", question: p.question || "" };
      return {
        type: "handoff-ask",
        html: "Sorry that did not help. Let me put you in front of a person " +
              "instead.<br><br><b>Do you need a reply right now, or can it wait?</b>",
        chips: ["I need it now", "It can wait"]
      };
    },

    /* --------------------------------------------------------- analytics */
    /* Local, aggregate, and deliberately free of personal data: the question
       text is kept so the developer can see what the bot could not answer,
       which is the whole point of the dashboard. */
    stat: function (event, question, confidence, title) {
      var s = readJSON(localStorage, STATS_KEY, null) || {
        totals: {}, unanswered: [], asked: {}, daily: {},
        confidence: [], started: now()
      };
      s.totals[event] = (s.totals[event] || 0) + 1;

      var day = new Date().toISOString().slice(0, 10);
      s.daily[day] = s.daily[day] || {};
      s.daily[day][event] = (s.daily[day][event] || 0) + 1;

      var q = String(question || "").trim().slice(0, 140);
      if (event === "asked" && q) {
        var k = q.toLowerCase();
        s.asked[k] = (s.asked[k] || 0) + 1;
      }
      if ((event === "unanswered" || event === "not_resolved") && q) {
        s.unanswered.unshift({ q: q, t: now(), why: event, topic: title || "" });
        s.unanswered = s.unanswered.slice(0, 80);
      }
      if (typeof confidence === "number") {
        s.confidence.push(Math.round(confidence * 100));
        if (s.confidence.length > 300) s.confidence = s.confidence.slice(-300);
      }
      s.loggedIn = !!session();
      writeJSON(localStorage, STATS_KEY, s);
    },

    stats: function () {
      var s = readJSON(localStorage, STATS_KEY, null) || {
        totals: {}, unanswered: [], asked: {}, daily: {}, confidence: []
      };
      var t = s.totals || {};
      var answered = t.answered || 0;
      var resolved = t.resolved || 0;
      var notResolved = t.not_resolved || 0;
      var unanswered = t.unanswered || 0;
      var handoffs = (t.handoff_whatsapp || 0) + (t.handoff_ticket || 0);
      var asked = t.asked || 0;
      var rated = resolved + notResolved;

      var top = Object.keys(s.asked || {})
        .map(function (k) { return { q: k, n: s.asked[k] }; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 12);

      var avgConf = (s.confidence && s.confidence.length)
        ? Math.round(s.confidence.reduce(function (a, b) { return a + b; }, 0) / s.confidence.length)
        : 0;

      return {
        totalQuestions: asked,
        answered: answered,
        unanswered: unanswered,
        resolutionRate: asked ? Math.round((answered / asked) * 100) : 0,
        satisfaction: rated ? Math.round((resolved / rated) * 100) : 0,
        handoffRate: asked ? Math.round((handoffs / asked) * 100) : 0,
        handoffWhatsapp: t.handoff_whatsapp || 0,
        handoffTicket: t.handoff_ticket || 0,
        loginRequired: t.login_required || 0,
        avgConfidence: avgConf,
        topQuestions: top,
        gaps: s.unanswered || [],
        daily: s.daily || {},
        raw: t
      };
    },

    resetStats: function () {
      try { localStorage.removeItem(STATS_KEY); } catch (e) {}
    }
  };

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  Core.esc = esc;
  global.TAChat = Core;
})(typeof window !== "undefined" ? window : this);

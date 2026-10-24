/* ============================================================================
   Treasure Bot - entity understanding
   ----------------------------------------------------------------------------
   The difference between a search box and an assistant is that an assistant
   works out WHAT you are asking about, not just which page mentions your words.

   "my child's cardigan is missing" is not a request for the Lost & Found page.
   It is a lookup: item = cardigan, intent = lost property. The honest answer is
   either "yes, a cardigan is waiting at the office" or "no cardigan has been
   handed in - but these five things have, and here is what to do next".

   Never a dead end. If the specific thing is not there, say so plainly and
   then give the next most useful thing. That is the rule this file exists for.
   ========================================================================== */
(function (global) {
  "use strict";

  /* Every word a parent might use for a thing the school actually holds.
     The left side is what people type; the right side is what our data calls
     it. Without this, "jumper", "sweater" and "cardi" all miss a cardigan. */
  var THINGS = {
    cardigan: ["cardigan", "cardi", "sweater", "jumper", "pullover", "sweatshirt", "woolen", "woollen"],
    shirt: ["shirt", "top", "blouse", "tee", "t-shirt", "uniform top"],
    skirt: ["skirt", "pinafore", "gown"],
    shorts: ["shorts", "short", "trouser", "trousers", "pant", "pants", "knicker"],
    sandals: ["sandal", "sandals", "shoe", "shoes", "footwear", "slippers"],
    socks: ["sock", "socks", "stocking", "stockings"],
    beret: ["beret", "cap", "hat", "headgear"],
    sportswear: ["sportswear", "sports wear", "kit", "jersey", "track suit", "tracksuit", "pe kit"],
    bag: ["bag", "backpack", "school bag", "satchel", "knapsack"],
    lunchbox: ["lunch box", "lunchbox", "food flask", "flask", "food warmer", "plate", "cutlery", "spoon"],
    bottle: ["water bottle", "bottle", "flask", "cup"],
    book: ["book", "textbook", "note book", "notebook", "exercise book", "copy"],
    pen: ["pen", "biro", "pencil", "marker", "eraser", "ruler", "crayon"],
    umbrella: ["umbrella", "raincoat", "rain coat"],
    glasses: ["glasses", "spectacles", "eye glass", "goggles"],
    watch: ["watch", "wristwatch", "wrist watch"],
    money: ["money", "cash", "purse", "wallet"]
  };

  /* Class names as parents write them. "p3", "primary three", "basic 3". */
  var CLASS_WORDS = {
    "creche": ["creche", "crèche", "daycare", "day care", "baby class"],
    "pre-nursery": ["pre-nursery", "pre nursery", "prenursery", "playgroup", "play group", "toddler"],
    "nursery 1": ["nursery 1", "nursery one", "n1", "nur 1"],
    "nursery 2": ["nursery 2", "nursery two", "n2", "nur 2"],
    "primary 1": ["primary 1", "primary one", "p1", "basic 1", "class 1", "grade 1"],
    "primary 2": ["primary 2", "primary two", "p2", "basic 2", "class 2", "grade 2"],
    "primary 3": ["primary 3", "primary three", "p3", "basic 3", "class 3", "grade 3"],
    "primary 4": ["primary 4", "primary four", "p4", "basic 4", "class 4", "grade 4"],
    "primary 6": ["primary 6", "primary six", "p6", "basic 6", "class 6", "grade 6"]
  };

  var SUBJECTS = {
    "mathematics": ["maths", "math", "mathematics", "arithmetic", "number work"],
    "english language": ["english", "english language", "literacy", "grammar", "comprehension"],
    "basic science": ["science", "basic science", "biology", "physics", "chemistry"],
    "social studies": ["social studies", "social", "civic", "civics"],
    "c.r.s": ["crs", "c.r.s", "christian religious", "religious studies", "bible"],
    "creative arts": ["creative art", "creative arts", "art", "drawing", "handwork"],
    "verbal reasoning": ["verbal", "verbal reasoning"],
    "quantitative reasoning": ["quantitative", "quantitative reasoning", "quantitative aptitude"],
    "phonics": ["phonics", "sound foundation", "sounding"],
    "computer": ["computer", "computing", "ict", "coding", "programming", "computer science"],
    "handwriting": ["handwriting", "writing", "penmanship"]
  };

  /* ============================================================================
     Greetings. Families greet in English, Nigerian Pidgin, Hausa, Yoruba,
     Igbo, and sometimes whatever language they woke up in. A greeting is
     answered as a greeting - but only when it IS a greeting; "hello, how much
     are the fees" is a fee question with a friendly opener.
     kind: "hello" (introduce), "casual" (what's up), "wellness" (how are you).
     ============================================================================ */
  var GREETINGS = [
    ["hello", "en", "hello"], ["hi", "en", "hello"], ["hey", "en", "hello"],
    ["hiya", "en", "hello"], ["yo", "en", "hello"], ["howdy", "en", "hello"],
    ["greetings", "en", "hello"], ["good morning", "en", "hello"],
    ["good afternoon", "en", "hello"], ["good evening", "en", "hello"],
    ["good day", "en", "hello"], ["good morning sir", "en", "hello"],
    ["good morning ma", "en", "hello"],
    ["whats up", "en", "casual"], ["what is up", "en", "casual"],
    ["wassup", "en", "casual"], ["wasssup", "en", "casual"],
    ["whazzup", "en", "casual"], ["sup", "en", "casual"],
    ["whats popping", "en", "casual"], ["whats poppin", "en", "casual"],
    ["whats cracking", "en", "casual"], ["whats capping", "en", "casual"],
    ["whats good", "en", "casual"], ["whats gwan", "en", "casual"],
    ["whats happening", "en", "casual"], ["whats new", "en", "casual"],
    ["whats the gist", "en", "casual"], ["how far", "pcm", "casual"],
    ["how now", "pcm", "casual"], ["wetin dey happen", "pcm", "casual"], ["wetin dey sup", "pcm", "casual"],
    ["how are you", "en", "wellness"], ["how are you doing", "en", "wellness"],
    ["how are you today", "en", "wellness"], ["how are things", "en", "wellness"],
    ["hows it going", "en", "wellness"], ["how is it going", "en", "wellness"],
    ["how you doing", "en", "wellness"], ["how do you do", "en", "wellness"],
    ["how are u", "en", "wellness"], ["how r u", "en", "wellness"],
    ["hope you are fine", "en", "wellness"], ["hope you re fine", "en", "wellness"],
    ["hope all is well", "en", "wellness"], ["how body", "pcm", "wellness"], ["how was your day", "en", "wellness"],
    ["how is your day going", "en", "wellness"],
    ["how is your day", "en", "wellness"],
    ["how you dey", "pcm", "wellness"], ["wetin dey", "pcm", "casual"],
    ["sannu", "hausa", "hello"], ["sannu da zuwa", "hausa", "hello"],
    ["barka da zuwa", "hausa", "hello"], ["barka da asuba", "hausa", "hello"],
    ["barka da yamma", "hausa", "hello"], ["ina kwana", "hausa", "wellness"],
    ["ina wuni", "hausa", "wellness"], ["sannunka", "hausa", "hello"],
    /* Ebira - the language of Okene, where the school stands. Every form is
       real and verified against published Ebira phrase lists (Wikivoyage's
       curated Ebira phrasebook, PolyglotClub's Ebira vocabulary, and the
       native-speaker word lists on Nairaland); nothing here is invented.
       Spellings follow the sources: the afternoon and evening greetings are
       written both as one word and as two, so both forms are listed. */
    ["nyene", "ebira", "hello"],              /* good morning */
    ["nya rodu", "ebira", "hello"],           /* good afternoon */
    ["nyarodu", "ebira", "hello"],
    ["nyar oruva", "ebira", "hello"],         /* good evening */
    ["nya oruva", "ebira", "hello"],
    ["nyaroruva", "ebira", "hello"],
    ["ngwao", "ebira", "hello"],              /* hello */
    ["etemeya", "ebira", "wellness"],         /* how are you? */
    ["ete me ya", "ebira", "wellness"],
    ["wadahi", "ebira", "wellness"],          /* hope you are fine? */
    ["avu dahi", "ebira", "wellness"],
    ["anyari ekuhi eta", "ebira", "casual"],  /* long time no see */
    ["e kaaro", "yoruba", "hello"], ["e kaasan", "yoruba", "hello"],
    ["eku ishe", "yoruba", "hello"], ["eku aro", "yoruba", "hello"],
    ["eku osan", "yoruba", "hello"], ["eku ale", "yoruba", "hello"],
    ["sawubona", "zulu", "hello"], ["dumela", "tswana", "hello"],
    ["e kaale", "yoruba", "hello"], ["eku aaro", "yoruba", "hello"],
    ["bawo ni", "yoruba", "wellness"], ["bawoni", "yoruba", "wellness"],
    ["pele o", "yoruba", "hello"],
    ["kedu", "igbo", "wellness"], ["kedu ka i mere", "igbo", "wellness"],
    ["ndewo", "igbo", "hello"], ["nnoo", "igbo", "hello"],
    ["salam", "arabic", "hello"], ["salaam", "arabic", "hello"],
    ["salam alaikum", "arabic", "hello"], ["salaam alaikum", "arabic", "hello"],
    ["assalamu alaikum", "arabic", "hello"], ["assalam alaikum", "arabic", "hello"],
    ["salam alaykum", "arabic", "hello"], ["marhaba", "arabic", "hello"],
    ["bonjour", "french", "hello"], ["bonsoir", "french", "hello"],
    ["salut", "french", "hello"],
    ["hola", "spanish", "hello"], ["buenos dias", "spanish", "hello"],
    ["buenas tardes", "spanish", "hello"],
    ["hallo", "german", "hello"], ["guten tag", "german", "hello"],
    ["guten morgen", "german", "hello"],
    ["ciao", "italian", "hello"], ["buongiorno", "italian", "hello"],
    ["buonasera", "italian", "hello"],
    ["bom dia", "portuguese", "hello"], ["boa tarde", "portuguese", "hello"],
    ["ola", "portuguese", "hello"],
    ["jambo", "swahili", "hello"], ["hujambo", "swahili", "hello"],
    ["habari", "swahili", "wellness"], ["habari yako", "swahili", "wellness"],
    ["merhaba", "turkish", "hello"], ["selam", "turkish", "hello"],
    ["namaste", "hindi", "hello"], ["namaskar", "hindi", "hello"],
    ["konnichiwa", "japanese", "hello"], ["ohayo", "japanese", "hello"],
    ["ni hao", "chinese", "hello"], ["nihao", "chinese", "hello"],
    ["shalom", "hebrew", "hello"]
  ];
  var GREETING_SORTED = null;

  /* Courtesy. Also answered, not ignored - and not fed into retrieval. */
  var THANKS = ["thank you very much", "thank you so much", "thanks a lot",
    "much appreciated", "thank you", "thank u", "thanks", "thankx", "thanx",
    "thx", "tanks", "nice one", "well done", "good job", "keep it up",
    "good work", "great work", "you are doing well", "you are doing great",
    "you do well", "you tried", "you try", "keep going", "you are the best",
    "you too much", "we appreciate you", "i appreciate", "i appreciate it",
    "god bless you",
    "na gode", "e se", "ese", "imela", "dalu", "avo", "merci", "gracias", "danke",
    "obrigado", "shukran", "grazie", "asante", "dhanyavad"];
  var BYES = ["catch you later", "see you later", "goodbye", "good bye",
    "see you", "see ya", "bye bye", "bye", "later", "take care", "good night",
    "o dabo", "au revoir", "adios", "arrivederci", "sayonara", "kwaheri",
    "maa ko salaama", "o daabo",
    "i am leaving", "am leaving", "i have to go", "i got to go",
    "got to go", "i must go", "i need to go", "gotta go", "i dey go",
    "i wan go", "i am off", "am off"];

  /* Words that can follow a greeting without turning it into a question. */
  var FILLERS = { "please": 1, "pls": 1, "kindly": 1, "abeg": 1, "oo": 1,
    "o": 1, "oh": 1, "ok": 1, "okay": 1, "so": 1, "eh": 1, "ah": 1,
    "wahala": 1, "well": 1, "there": 1, "sir": 1, "ma": 1, "madam": 1,
    "dear": 1, "friend": 1, "my": 1, "guy": 1, "guys": 1, "everyone": 1,
    "everybody": 1, "people": 1, "baba": 1, "aunty": 1, "uncle": 1,
    "bro": 1, "bros": 1, "sis": 1, "ooo": 1, "na": 1, "naa": 1, "nah": 1,
    "today": 1, "now": 1, "too": 1, "yea": 1, "yeah": 1, "jare": 1, "sha": 1,
    "sef": 1, "wetin": 1, "concern": 1, "name": 1, "bot": 1, "tomorrow": 1 };

  /* The question words, and what each one is asking for. When a question
     misses everything else, its WH word still tells us what SHAPE of answer
     the person needed - a date, a place, a person, an amount - and that is
     enough to point somewhere useful instead of nowhere. */
  var WH_TYPES = { "who": "person", "whom": "person", "whose": "ownership",
    "what": "thing", "when": "time", "where": "place", "why": "reason",
    "which": "choice", "how": "manner" };

  /* Words that make a question the school's business, even when the exact
     answer is not written down. Used to decide between "point at what I do
     have" and "this is not a school question at all". Nouns only - verbs
     like "pay" or "call" appear in every sentence and prove nothing. */
  var DOMAIN_HINTS = { "school": 1, "schools": 1, "class": 1, "classes": 1,
    "classroom": 1, "primary": 1, "nursery": 1, "creche": 1, "teacher": 1,
    "teachers": 1, "staff": 1, "headmistress": 1, "pupil": 1, "pupils": 1,
    "student": 1, "students": 1, "child": 1, "children": 1, "kid": 1,
    "kids": 1, "exam": 1, "exams": 1, "test": 1, "tests": 1, "result": 1,
    "results": 1, "report": 1, "card": 1, "fee": 1, "fees": 1, "price": 1,
    "prices": 1, "cost": 1, "payment": 1, "admission": 1, "admissions": 1,
    "register": 1, "registration": 1, "form": 1, "uniform": 1, "uniforms": 1,
    "transport": 1, "bus": 1, "term": 1, "session": 1, "resumption": 1,
    "holiday": 1, "homework": 1, "assignment": 1, "portal": 1, "lesson": 1,
    "lessons": 1, "subject": 1, "subjects": 1, "curriculum": 1,
    "birthday": 1, "birthdays": 1, "alumni": 1, "graduate": 1,
    "graduates": 1, "graduation": 1, "shop": 1, "calendar": 1, "pta": 1, "sport": 1, "sports": 1,
    "meeting": 1, "meetings": 1, "playground": 1, "library": 1, "cbt": 1,
    "entrance": 1, "cardigan": 1, "cardigans": 1, "book": 1, "books": 1,
    "treasure": 1, "academy": 1, "ageva": 1, "okene": 1, "attendance": 1,
    "assembly": 1 };

  /* Every word the rules and data can ever answer about. A typed word that
     is not one of these but is one slip of the finger away from one is a
     typo, and gets repaired. Nothing else is ever touched. */
  var EXTRA_KNOWN = ("school schools class classes classroom classrooms primary " +
    "nursery creche teacher teachers staff tutor tutors headmistress head " +
    "principal proprietor owner founder pupil pupils student students child " +
    "children kid kids ward wards parent parents guardian guardians mother " +
    "father mum dad brother sister family fee fees price prices cost costs " +
    "money admission admissions admit applies apply application applications " +
    "enrol enrols enroll enrolls enrolment enrollment intakes intake payment " +
    "payments pay transfer bank naira charge charges amount total discount " +
    "sibling siblings instalment installment receipt teller proof slip form " +
    "forms document documents paper papers requirement requirements " +
    "certificate birth passport photo photos photograph immunisation " +
    "immunization report card cards grade grades score scores position " +
    "result results exam exams examination test tests quiz entrance common " +
    "practice cbt revision mock question questions answer answers lesson " +
    "lessons subject subjects curriculum syllabus topic topics teach teaches " +
    "teaching learn learning activity activities club clubs excursion " +
    "excursions trip trips sport sports game games uniform uniforms wear " +
    "wearing shirt shirts skirt skirts shorts cardigan cardigans sweater " +
    "jumper pullover sportswear kit jersey sandal sandals shoe shoes sock " +
    "socks beret cap hat headgear bag bags backpack lunchbox flask bottle " +
    "bottles book books pen pens pencil pencils biro marker eraser ruler " +
    "crayon stationery shop buy bought item items stock available transport " +
    "bus buses route routes pickup drop fare adavi okene ageva kogi location " +
    "address directions town state area map compound building premises " +
    "playground library computer ict lab room hall sick bay clinic fence " +
    "gate security safe safety cctv supervision first aid nurse injury " +
    "injuries sick unwell food meal meals lunch breakfast snack snacks " +
    "feeding canteen kitchen menu water drink birthday birthdays alumni " +
    "graduate graduates graduation event events news notice notices " +
    "announcement calendar schedule date dates pta meeting meetings agenda " +
    "venue visitor visit tour appointment day open inspection contact phone " +
    "number email whatsapp message messages chat reply respond response " +
    "complaint complain suggestion feedback password passwords login log " +
    "signin register registration account accounts verify verification otp " +
    "code approve approval reject pending active portal portals attendance " +
    "absent present duty duties roster timetable period periods assembly " +
    "dismissal resumption resume resumes term terms session sessions " +
    "holiday holidays break breaks deadline mission vision motto aim aims " +
    "goal goals purpose philosophy values belief ethos history story " +
    "background journey milestone milestones timeline performance " +
    "achievement waec neco bece jamb secondary testimonial testimonials " +
    "review reviews rating opinion recommend employment job jobs vacancy " +
    "vacancies career cv resume curriculum vitae hire hiring recruit " +
    "recruitment interview salary partner partners sponsor sponsors " +
    "collaboration donor ngo treasure academy ageva bot whats how what when " +
    "where who why which whose whom does did doing was were been being has " +
    "have had having you your they them their this that these those with " +
    "without about into like over under around there here now soon next " +
    "last first second third day days week weeks month months year years " +
    "time times today tomorrow yesterday morning afternoon evening night " +
    "open opens opening close closes closed hour hours early late before " +
    "after between during per fine good great well please thanks thank " +
    "hello hey hiya howdy greetings morning sunshine everybody everyone " +
    "sannu barka kedu ndewo nnoo salam salaam bonjour bonsoir salut hola " +
    "buenos dias hallo guten tag ciao buongiorno bom dia ola jambo habari " +
    "merhaba selam namaste konnichiwa ohayo nihao shalom bawo kaaro kaasan " +
    "kaale pele wetin dey body far sup wassup whazzup popping cracking " +
    "capping gwan happening gist appreciate").split(" ");

  /* Harvested from the rule regexes in this file and in chat-core.js. */
  var RULE_WORDS = ("academy accepted account accredit achievement activities address administration administrator admissions admitted adopt advantage affiliat affordable after agent aims alive alumni amenit anonymous anytime application applied apply appointment approved area around asap assessment assignments associate attach attends authentic authority babies background bad basic began begin behind belief believe belongs beret big birth bits boarder boarding boss both box bringing broadcast building built bullies bullying bursar cafeteria calendar call canteen cardigan careers cbt cctv certificate changing charges chat cheapest children choose classes classroom clinic closed closing clubs code coding collaborat collect commands common compare complaint compound computer confirm contact cooks corporal correct costs could cover created creche credential curricular curriculum dates deadline debate decision demo designed developed diet direction dismissal documents done donor dormitory drop early elearning email employee employment enrol enter entrance equipment establish ethos event exam excursions expensive explain extra facilit fare fast fed feedback feeding fence field fighting file financial find five food founded founder four free from function gate genuine goals goodbye government gpt grades graduate grant group hall handles happens harass headmistress helps hire hiring history holiday homework hostel hour human ict immediately immunisation immunization info infrastructure injur inspect instal interview issue jobs join journey kitchen large last later launch leader leading left lessons levels library licence license located location login lost lowest lunch machine madam made map mark master meals meeting menu message mid milestones ministry misplace missing mock month more motto move moving naira names network news ngo nice nope notification nursery offer office okay once opening opinion options otp outing owner owns paid papers parents partnership passport password past payment performance period philosophy phone photo plan playground please pls plz portal position practice premises previous prices primary principal problem programmed proof proprietor proprietress pta punish pupils purpose qualified quickly quiz range rate rating reading really receipt receives recommend recruiting refund registered registering registration relocat repaired report requirements respond results resume resumption reviews revision right robot role router running runs rush safety sandal saturday say schedule scholarship schoolfees schools scores secondary secure security seen session shirt shop should siblings sick signing sir six skirt sleep slip snack sock speak sponsorship spread stand started students subjects submit successful suggestion sunday supervis support swimming switch syllabus talking taught teachers teaching team teller testimonials thanks thinking three timeline timetable tomorrow topics tour town track trained transfer treasure trips tuck tuition unhappy unhelpful uniform unresolved urgently vacancies vacancy values verification verify visitors vitae weekend wetin whatsapp whenever wifi will workers would wrong yeah years yep yes").split(" ");
  /* Off-topic anchors the guards in chat-core test on the question, and
     the small-talk words its rules ask about. They join the repair
     vocabulary so one slip of the finger cannot walk a question past its
     own guard: "lnodon" finds "london", "gvernor" finds "governor",
     "fasetr" finds "faster". */
  var GUARD_WORDS = ("london lagos abuja york america ghana tokyo paris dubai " +
    "china india canada germany spain italy kenya africa governor president " +
    "minister senator speaker mayor sultan emir amazon google microsoft " +
    "apple facebook twitter tesla instagram youtube betting gamble gambling " +
    "casino lottery jackpot laptop network android iphone bitcoin ethereum " +
    "netflix jumia nollywood davido burna messi ronaldo beyonce dangote " +
    "soyinka zuckerberg weather covid gravity planet anthem french chinese " +
    "visa currency cedi egusi plantain jollof benin faster favourite favorite").split(" ");
  /* The common words of English. Known words are never "repaired". */
  var KEEP_WORDS = ("the and but for not are was were been being am is do does did doing have has had having will would shall should can could may might must with without about into like over under around there here now soon next last first second third this that these those you your they them their me my we our us he she it its his her him who whom whose what when where why which how if then than so because very much many more most some any each every other another such only own same too just also well good great fine bad new old big small long short high low early late hard soft warm cold hot wet dry day days week weeks month months year years time times today tomorrow yesterday morning afternoon evening night hour hours minute minutes tell told say said speak spoke talk talked ask asked know knew think thought see saw seen look looked find found get got give gave take took make made come came goes going gone keep kept let put bring brought buy bought sell sold send sent hear heard feel felt hold held help work works play run walk stop start open close turn need want use used try tried call called wait show seem leave left meet met sit stand lose lost win won build fall cut reach believe become bring gave rate rates pass passes lots tour tell meant goes plan plans hope hopes wish nice lovely best better worse least either neither both all cost costs spent spend saved save name names home house door water fire earth people person man woman women men boy girl mother father friend friends world thing things way ways place places part parts side end top bottom front back inside outside near far away somewhere anywhere everywhere anything everything something nothing anyone everyone someone nobody yes no okay please hello bye goodbye thanks thank morning greeting greetings registered approved operate operating launched launches except expect accept form from while whose whom which when where there their theirs below amend beside belong upgrade input indoor island off apart rice dance sing song movie movies").split(" ");
  var EXTRA_FORMS = ("registered approves approved operating operated launched launches perform performs performing performed admits admitted enrolled enrolled enroling submitting entering explaining collecting launching transferred transfers graduates graduating published publishes excursion rehearsals carols carol independence midterms resuming reopen reopens attendance verified rejecting rejected awaiting handed unclaimed claimed office offices operate operators create creates created creating cannot afford affords afforded establish establishes established establishing move moves moved launch launches happen happens happening going gone went getting putting sitting stopping planning running winning letting prizes prize compulsory optional core lead leads leader leaders coming facilities facility eat eats eating ate chatgpt pool pools interhouse e-learning elearning online posts posting post giving given real really daughter son sons queue queues set sets balance balances house night rafatu ebenezer rachel nanahawa siyaka bose idris ibrahim zeenatudeen tahab oyiza mariam yahaya rebeca omeiza momoh salihu ruth shaibu sidikat memunat stuff worse worst heading meaning trying showing seeming leaving believing becoming building falling reaching speaking writing reading paying applying living loving hoping wishing asking telling helping working playing walking starting opening closing turning needing wanting using calling waiting meeting standing losing sending hearing feeling holding keeping bringing buying selling teaching learning").split(" ");

  var KNOWN = null;
  function knownWords() {
    if (KNOWN) return KNOWN;
    var v = {};
    function add(w) {
      w = String(w || "").toLowerCase();
      var bare = w.replace(/[^a-z0-9]/g, "");
      /* Only hyphens and apostrophes collapse ("mid-term" -> "midterm").
         A space is a real boundary: folding "Nursery 1" into "nursery1"
         plants a fake word in the vocabulary that ties with "nursery"
         for every "nurseryy" slip of the finger. */
      if (bare.length >= 3 && !/\s/.test(w)) v[bare] = 1;
      if (/[-']/.test(w) && w.length >= 3) v[w] = 1;
    }
    function addPhrase(p) {
      String(p || "").toLowerCase().replace(/[^a-z0-9' -]/g, " ")
        .split(/\s+/).forEach(add);
    }
    Object.keys(THINGS).forEach(function (k) { add(k); THINGS[k].forEach(add); });
    Object.keys(CLASS_WORDS).forEach(function (k) {
      add(k); addPhrase(k); CLASS_WORDS[k].forEach(addPhrase);
    });
    Object.keys(SUBJECTS).forEach(function (k) {
      add(k); addPhrase(k); SUBJECTS[k].forEach(addPhrase);
    });
    PIDGIN.forEach(function (p) { addPhrase(p[1]); });
    GREETINGS.forEach(function (g) { addPhrase(g[0]); });
    THANKS.forEach(addPhrase); BYES.forEach(addPhrase);
    EXTRA_KNOWN.forEach(add);
    /* Every word a rule or a live branch actually tests on the QUESTION side
       must itself be a known word, or the repairer could "fix" it into a
       different word and silently break the rule ("launch" -> "lunch").
       RULE_WORDS is harvested from the rule regexes themselves. */
    RULE_WORDS.forEach(addPhrase);
    /* And ordinary English. A typo repairer that mangles real words is worse
       than no repairer: "tell" must never become "well", "from" never
       "form". The common words of the language are known words too. */
    KEEP_WORDS.forEach(addPhrase);
    EXTRA_FORMS.forEach(addPhrase);
    GUARD_WORDS.forEach(addPhrase);
    /* The live lists: the shop's own stock, the calendar's own events,
       the staff wall's own names and subjects. "noevl" is one slip from
       the "Story Novel" the school itself sells; "tirals" from the
       "Sports Trials" it published. Repairing toward the site's own
       published words can never invent something the school did not
       say. Pages that load this file without the store keep the static
       lists above. */
    try {
      if (typeof DB !== "undefined" && DB && typeof DB.load === "function") {
        var dbv = DB.load();
        (dbv.shopItems || dbv.shop || []).forEach(function (it) {
          addPhrase(it && it.name);
        });
        (dbv.calendar || []).forEach(function (c) { addPhrase(c && c.title); });
        (dbv.newsEvents || []).forEach(function (n) {
          if (n && n.type === "event") addPhrase(n.title);
        });
        (dbv.staffWall || []).forEach(function (t) {
          addPhrase(t && t.name);
          ((t && t.subjects) || []).forEach(addPhrase);
        });
      }
    } catch (e) { /* no store on this page: the static lists still cover it */ }
    KNOWN = v;
    return v;
  }

  /* Long-press keyboard accidents: holding "e" offers e-acute, e-grave,
     e-circumflex... The letter underneath is what was meant. Characters
     that do not decompose are mapped by hand. */
  var FOLD_MAP = { "\u00df": "ss", "\u00e6": "ae", "\u0153": "oe",
                   "\u00f8": "o", "\u0111": "d", "\u0142": "l",
                   "\u00f0": "d", "\u00fe": "th" };
  function fold(s) {
    var t = String(s || "").toLowerCase();
    if (typeof t.normalize === "function") {
      try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
      catch (e) { /* very old engines: accents stay, symbols still strip */ }
    }
    return t.replace(/[\u00df\u00e6\u0153\u00f8\u0111\u0142\u00f0\u00fe]/g,
      function (c) { return FOLD_MAP[c] || ""; });
  }

  /* Plain letters and digits only - the shape every matcher works on. */
  function loose(s) {
    return fold(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* Levenshtein distance with an early exit, capped: is B within A +/- cap
     edits? Used only on single words, so the cost is trivial. */
  function lev(a, b, cap) {
    if (a === b) return 0;
    var m = a.length, n = b.length;
    if (Math.abs(m - n) > cap) return cap + 1;
    var prev = [], cur = [], i, j, rowMin;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i; rowMin = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > cap) return cap + 1;
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }

  var LEET = { "0": "o", "4": "a", "3": "e", "5": "s", "1": "i", "7": "t" };

  /* Words under three letters never enter the vocab (add() drops them),
     so a key held down could not be repaired back to one: "isss" stayed
     "isss" because "is" is not a known word, and one broken token was
     enough to sink the whole question. This list is consulted only by
     the flatten step, never by edit distance, so it cannot create
     guessing ties. */
  var SHORT = { "is": 1, "am": 1, "be": 1, "do": 1, "go": 1, "no": 1,
    "so": 1, "up": 1, "at": 1, "in": 1, "on": 1, "of": 1, "to": 1,
    "it": 1, "he": 1, "we": 1, "me": 1, "my": 1, "us": 1, "hi": 1,
    "ok": 1, "an": 1, "as": 1, "or": 1, "if": 1, "by": 1 };

  /* Damage the general repair steps cannot reach. "eaches" is "teaches"
     that lost its t - and to the morphology guard below it looks exactly
     like "each" + "es", a valid shape with a wrong answer. Only keyboard
     damage belongs here, each form with one honest repair. */
  var TOKEN_FIX = { "eaches": "teaches" };

  /* Repair one word. Every step is reversible-safe: a word that is already
     known, a number, or a short word is never touched; an ambiguous repair
     (two equally-close different words) is left alone. */
  function fixToken(w) {
    if (!w) return w;
    var v = knownWords();
    if (v[w] || /^\d+$/.test(w)) return w;
    if (TOKEN_FIX[w]) return TOKEN_FIX[w];
    /* "h0w", "fe3s" - digits landed where letters belong. Short words are
       only trusted when the digit-free version is a real word - and "1s"
       is "is", too short for the vocabulary but not for SHORT. */
    if (/[045137]/.test(w)) {
      var deLeet = w.replace(/[045137]/g, function (d) { return LEET[d]; });
      if (v[deLeet] || SHORT[deLeet]) return deLeet;
    }
    if (w.length < 4) {
      /* Three letters is too short for edit distance - every real word is
         one slip from another real word. Two shapes are still safe: a
         precise swap ("mdi" -> "mid", "ady" -> "day"), and a doubled
         letter that flattens into a common short word ("mmy" -> "my",
         "oof" -> "of", "iss" -> "is"). */
      if (w.length === 3) {
        for (var s3 = 0; s3 < 2; s3++) {
          if (w.charAt(s3) === w.charAt(s3 + 1)) continue;
          var sw3 = w.slice(0, s3) + w.charAt(s3 + 1) + w.charAt(s3) + w.slice(s3 + 2);
          if (v[sw3]) return sw3;
        }
        var dd3 = w.replace(/(.)\1/, "$1");
        if (dd3 !== w && SHORT[dd3]) return dd3;
      }
      return w;
    }
    /* A key held down: "heyyyy", "goooood". Two letters kept is the likelier
       intent ("good"), so it is tried before the fully flat "god". */
    var flat1 = w.replace(/(.)\1{2,}/g, "$1");
    var flat2 = w.replace(/(.)\1{2,}/g, "$1$1");
    if (v[flat2] || SHORT[flat2]) return flat2;
    if (v[flat1] || SHORT[flat1]) return flat1;
    if (/[045137]/.test(flat1)) {
      var flatLeet = flat1.replace(/[045137]/g, function (d) { return LEET[d]; });
      if (v[flatLeet] || SHORT[flatLeet]) return flatLeet;
    }
    /* Two neighbouring letters swapped: "teh" for "the", "reslut" for
       "result". Precise by construction - the input must BE a known word
       with two neighbours crossed. */
    for (var i = 0; i < w.length - 1; i++) {
      if (w.charAt(i) === w.charAt(i + 1)) continue;
      var sw = w.slice(0, i) + w.charAt(i + 1) + w.charAt(i) + w.slice(i + 2);
      if (v[sw]) return sw;
    }
    /* A doubled letter inside a four-letter word: "whoo" is "who", "daay"
       is "day", "buss" is "bus" - the key held one beat too long. Taking
       one of the pair back off is precise where edit distance is not:
       "band" and "bend" have no doubled letter to unwind, so real words
       without doubles are safe. */
    if (w.length === 4 && /(.)\1/.test(w)) {
      var dd4 = w.replace(/(.)\1/, "$1");
      if (v[dd4]) return dd4;
    }
    /* Morphology guard: an -ing/-ed/-es/-s form of a known word is itself a
       known word. "coming" is "come" with an ending - it must never be
       "repaired" into "coding". */
    var bases = [];
    if (/ing$/.test(w)) {
      var bIng = w.slice(0, -3);
      bases.push(bIng, bIng + "e");
      if (/(.)\1$/.test(bIng)) bases.push(bIng.slice(0, -1));
    } else if (/ed$/.test(w)) {
      var bEd = w.slice(0, -2);
      bases.push(bEd, w.slice(0, -1));
      if (/(.)\1$/.test(bEd)) bases.push(bEd.slice(0, -1));
    } else if (/es$/.test(w)) {
      /* "-es" legitimately follows s, x, z, ch or sh ("buses", "watches").
         "pricees" is not "price-es". But "makes" and "phones" are
         "make" + "s" and "phone" + "s" wearing an "-es" costume - the
         vowel-plus-s reading still counts, or every verb like "takes"
         would be mangled into "take". */
      if (/(s|x|z|ch|sh)$/.test(w.slice(0, -2))) bases.push(w.slice(0, -2), w.slice(0, -1));
      else if (!/(s|x|z|ch|sh)$/.test(w.slice(0, -1))) bases.push(w.slice(0, -1));
    } else if (/s$/.test(w)) {
      /* A base ending in s, x, z, ch or sh takes "-es", never a bare
         "-s": "feess" is not the plural of "fees". */
      if (!/(s|x|z|ch|sh)$/.test(w.slice(0, -1)))
        bases.push(w.slice(0, -1));
    }
    for (var bi = 0; bi < bases.length; bi++) {
      if (bases[bi].length >= 3 && v[bases[bi]]) return w;
    }
    /* Words run together by a missed space: "schoolfees" -> "school fees".
       The eaten space may sit next to a two-letter word - "busto" is
       "bus to", "mytimetable" is "my timetable" - so the common short
       words count as a half, provided the OTHER half is a real word of
       the vocabulary ("onto" is not "on to", and stays whole). */
    for (var cut = 2; cut <= w.length - 1; cut++) {
      var a = w.slice(0, cut), b = w.slice(cut);
      if (b.length > 1 &&
          (v[a] || SHORT[a]) && (v[b] || SHORT[b]) && (v[a] || v[b])) {
        return a + " " + b;
      }
      /* A class and its number run together - "primary3" is "primary 3". */
      if (v[a] && /^\d$/.test(b)) return a + " " + b;
    }
    /* One edit away from exactly one known word: "admisson" -> "admission".
       A four-letter word is only ever repaired by ADDING a letter
       ("entr" -> "enter"): swapping one of its letters for another turns
       real words into different real words far too easily. When two known
       words are equally close, the longer one wins: "nursey" was meant as
       "nursery", not "nurses" - a class name with a number after it will
       say which. */
    var cap = w.length >= 8 ? 2 : 1, best = null, bestD = 99, bestLen = 0,
        ties = 0, c, d;
    for (c in v) {
      if (!Object.prototype.hasOwnProperty.call(v, c)) continue;
      if (Math.abs(c.length - w.length) > cap) continue;
      if (w.length === 4 && c.length < 5) continue;
      d = lev(w, c, cap);
      if (d > cap) continue;
      if (d < bestD) {
        bestD = d; bestLen = c.length; best = c; ties = 0;
      } else if (d === bestD) {
        /* A word and its own plural never both deserve the repair:
           "teacherr" is "teacher" with the r held down, not "teachers";
           "excursionn" is "excursion", not "excursions". The base form
           wins over its own +s/+es inflection; between unrelated words
           the longer one still does ("nursey" is "nursery", not
           "nurses"). */
        if (best === c + "s" || best === c + "es") {
          best = c; bestLen = c.length; ties = 0;
        } else if (c !== best + "s" && c !== best + "es") {
          if (c.length > bestLen) { bestLen = c.length; best = c; ties = 0; }
          else if (c.length === bestLen && c !== best) ties++;
        }
      }
    }
    if (best && !ties) return best;
    return w;
  }

  var NORM_CACHE = {};
  function cleanTokens(t) {
    var toks = t.split(" "), out = [], i, j, parts;
    for (i = 0; i < toks.length; i++) {
      var w = toks[i];
      if (!w) continue;
      /* "what$$s" cleaned to "what s" - that lone letter belongs to the
         previous word. Only rejoin when the joined word is a real word, and
         never a digit: "primary 3" must stay two words. */
      if (w.length === 1 && !/^[ai0-9]$/.test(w) && out.length) {
        var joined = out[out.length - 1] + w;
        if (knownWords()[joined]) { out[out.length - 1] = joined; continue; }
      }
      parts = fixToken(w).split(" ");
      for (j = 0; j < parts.length; j++) if (parts[j]) out.push(parts[j]);
    }
    return out.join(" ");
  }

  /* Last-chance greeting match for a message battered by the keyboard:
     "howbare you fojng" is "how are you doing" with a missed space and
     two wrong letters - no single word repairs cleanly, but the WHOLE
     phrase is still within touching distance of a real greeting. Strict
     guards keep this on social messages only: no domain word (a school
     question is never a greeting), no WH word except "how", at most six
     words, no digits. When two greetings are equally close it abstains
     - "hillo" (hello? hallo?) is honestly left alone. */
  function fuzzyGreeting(s) {
    if (!s) return null;
    var toks = s.split(" ").filter(function (x) { return x; });
    if (toks.length === 0 || toks.length > 6) return null;
    if (/\d/.test(s)) return null;
    if (hasDomainWord(s)) return null;
    var w = whOf(s);
    if (w && w !== "how") return null;
    /* Short strings sit within two edits of too many real words -
       "menu" is two edits from the Igbo greeting "kedu", "bye" is two
       from "yo" - so one edit is all they are trusted with. */
    var budget = s.length <= 5 ? 1 : Math.max(2, Math.floor(s.length / 4));
    var i, d;
    var best = null, bestD = 99, ties = 0;
    for (i = 0; i < GREETINGS.length; i++) {
      d = lev(s, GREETINGS[i][0], budget);
      if (d > budget) continue;
      if (d < bestD) { bestD = d; best = GREETINGS[i]; ties = 0; }
      else if (d === bestD && best && GREETINGS[i][0] !== best[0]) ties++;
    }
    if (!best || ties) return null;
    /* A farewell or a thank-you just as close always wins: the three
       lists are neighbours on the keyboard of intent. */
    var otherD = budget + 1;
    var screen = THANKS.concat(BYES);
    for (i = 0; i < screen.length; i++) {
      d = lev(s, screen[i], budget);
      if (d < otherD) otherD = d;
    }
    if (otherD <= bestD) return null;
    return { word: best[0], kind: best[2], lang: best[1] };
  }

  function matchGreetingLoose(s) {
    if (!GREETING_SORTED) {
      GREETING_SORTED = GREETINGS.slice().sort(function (a, b) {
        return b[0].length - a[0].length;
      });
    }
    if (!s) return null;
    for (var i = 0; i < GREETING_SORTED.length; i++) {
      var p = GREETING_SORTED[i][0];
      if (s === p || s.indexOf(p + " ") === 0) {
        return { word: p, kind: GREETING_SORTED[i][2], lang: GREETING_SORTED[i][1] };
      }
    }
    return null;
  }

  function matchPhraseList(s, list) {
    if (!s) return null;
    var sorted = list.slice().sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < sorted.length; i++) {
      if (s === sorted[i] || s.indexOf(sorted[i] + " ") === 0) return sorted[i];
    }
    return null;
  }

  /* Peel the social layer off a message: is it a greeting, a thank-you, a
     goodbye - and if so, what is left of the message afterwards? A message
     that is ALL social gets a social answer; a greeting bolted onto a real
     question gets the real answer (the greeting is simply removed). */
  function peelSocial(text) {
    /* Normalise FIRST: pidgin phrases like "wetin dey happen for primary 2"
       are questions, and the pidgin map says so - but only on the repaired
       text. Peeling the raw string would cut the question down to a
       fragment and answer the wrong thing. */
    var s = loose(norm(text));
    if (!s) return { kind: null, info: null, rest: "" };
    /* Politeness before a greeting ("excuse me, good morning") is not part
       of the greeting - and not part of the question either. */
    /* "please i beg, good morning" stacks two courtesies; a single pass
       peeled only the first and the greeting underneath never surfaced. */
    for (var pc = 0; pc < 3; pc++) {
      var pcStripped = s.replace(/^(please|pls|kindly|excuse me|pardon me|sorry|abeg|i beg)[,\s]*/, "");
      if (pcStripped === s) break;
      s = pcStripped;
    }
    var g = matchGreetingLoose(s);
    if (g) {
      var rest = s.slice(g.word.length).trim();
      /* "hello, how are you" - the second half is also a greeting. */
      var g2 = rest ? matchGreetingLoose(rest) : null;
      if (g2) {
        var rest2 = rest.slice(g2.word.length).trim();
        var w2 = rest2 ? rest2.split(" ") : [];
        if (w2.every(function (x) { return FILLERS[x]; })) {
          return { kind: "greeting", info: g2, rest: "" };
        }
      }
      var w = rest ? rest.split(" ") : [];
      if (w.every(function (x) { return FILLERS[x]; })) {
        return { kind: "greeting", info: g, rest: "" };
      }
      /* A casual opener ("whats up", "whats happening") is often the
         QUESTION ITSELF wearing a hat: "whats happening this term" asks
         about the term. Unlike "hello", peeling it would destroy the
         question, so it stays part of the question whenever something
         real follows it. */
      if (g.kind === "casual" && rest &&
          (hasDomainWord(rest) || rest.split(" ").length > 3)) {
        return { kind: null, info: null, rest: s };
      }
      /* "hi there, what of okene town?" - the "there" belongs to the
         greeting, not to the question that follows it. */
      var rw = rest.split(" ");
      while (rw.length && FILLERS[rw[0]]) rw.shift();
      return { kind: "greeting", info: g, rest: rw.join(" ") };
    }
    var th = matchPhraseList(s, THANKS);
    if (th) {
      var restT = s.slice(th.length).trim();
      var wT = restT ? restT.split(" ") : [];
      if (wT.every(function (x) { return FILLERS[x]; })) {
        return { kind: "thanks", info: { word: th }, rest: "" };
      }
      if (restT) return { kind: "thanks", info: { word: th }, rest: restT };
    }
    var by = matchPhraseList(s, BYES);
    if (by) {
      var restB = s.slice(by.length).trim();
      var wB = restB ? restB.split(" ") : [];
      if (wB.every(function (x) { return FILLERS[x]; })) {
        return { kind: "bye", info: { word: by }, rest: "" };
      }
    }
    /* Everything exact has had its chance. What is left may still be a
       greeting somebody battered on the keyboard - but never a farewell
       or a thank-you in disguise, and never a short word sitting two
       edits from three different real words. */
    var fg = fuzzyGreeting(s);
    if (fg) return { kind: "greeting", info: fg, rest: "" };
    return { kind: null, info: null, rest: s };
  }

  /* The first WH word, and what kind of answer it demands. "how much" and
     "how many" ask for an amount, not a method. */
  function whOf(text) {
    var toks = loose(norm(text)).split(" ");
    for (var i = 0; i < toks.length; i++) {
      if (toks[i] === "how" &&
          (toks[i + 1] === "much" || toks[i + 1] === "many")) return "amount";
      if (WH_TYPES[toks[i]]) return WH_TYPES[toks[i]];
    }
    return null;
  }

  function hasDomainWord(text) {
    var toks = loose(norm(text)).split(" ");
    for (var i = 0; i < toks.length; i++) {
      if (DOMAIN_HINTS[toks[i]]) return true;
    }
    return false;
  }

  /* What the person is trying to DO. Checked in order, so the most specific
     phrasing wins over a bare topic word. */
  var INTENTS = [
    ["lost", /\b(lost|losing|missing|misplace[d]?|left behind|can'?t find|cannot find|find my|found any|anyone (found|seen)|has anyone|lose (my|his|her|their|the|a|it|anything))\b/],
    ["staffcount", /\bclass size|\bhow (big|large|many)\b[^.?!]{0,20}\bclass\b|\bpupils? per class\b|\bchildren per class\b/],
    ["classlist", /\b(what classes|which classes|what levels|what grades|classes do you (have|offer)|do you have (a )?(creche|nursery|primary)|take babies|accept babies|youngest|age (do you|range|group)|from what age|how young|how old[^.?!]{0,25}\b(creche|nursery|primary|class|child|children|pupil|baby|admit)|how old must)\b|\b(\d+|six|three|two|four|five)[ -]?(month|year)s?[ -]?old\b|\bcheapest|most affordable|lowest fee\b/],
    ["classinfo", /\b(what (happens|do they do|is taught|do you do)|tell me about|what is|describe|activities|learn|is there|do they have|does .* have)\b[^.?!]{0,35}\b(creche|cr[eè]che|pre[- ]?nursery|nursery|primary|class)\b|\b(creche|pre[- ]?nursery|nursery [12]|primary [1-6])\b[^.?!]{0,20}\b(like|about|learn|do|activit|taught|cover)\b/],
    ["elearning", /\b(e[- ]?learning|elearning|online learning|online class|cbt|practice question|practice test|mock|revision|portal work|how does the portal)\b/],
    ["activity", /\b(club|clubs|excursion|excursions|debate|quiz|reading club|coding|extra[- ]?curricular|after school|activit\w*|show ?(and|&) ?tell|trip|trips|outing)\b/],
    ["homework", /\b(homework|home work|assignment|assignments|after school work|holiday work)\b(?![^.?!]*\b(for me|write|do it|answer)\b)/],
    ["testimonial", /\b(testimonial|testimonials|review|reviews|what do parents say|parents say|feedback from parent|recommend (the|this|us|your|treasure)|rating|opinion)\b/],
    ["curriculum", /\b(subject|subjects|curriculum|syllabus|what do you teach|do you teach|is .* taught|lesson|lessons|topics?|do you (do|offer|have) (french|arabic|music|spanish|english|mathematics|science|phonics|coding|computer))\b/],
    ["multichild", /\b(more than one child|two children|second child|another child|both (my )?children|siblings?|all my children|same account)\b/],
    ["notpublished", /\b(refund\w*|instal?ment\w*|part payment|pay in bits|spread the payment|interview (parents|the parent)|entrance exam|entry test|assessment test)\b|\bcannot afford|can'?t afford\b/],
    ["whotomeet", /\bwho (do|will|should) i (meet|see|talk to|speak to)\b|\bwho (attends to|receives) (visitors|parents)\b/],
    ["transfer", /\b(transfer\w*|moving from|coming from another|changing school|switch school|mid[- ]?term entry|previous school)\b/],
    ["afterreg", /\bwhat (happens|next|do i do)\b[^.?!]{0,25}\b(after|once|when)\b[^.?!]{0,25}\b(regist\w*|apply|applied|pay|paid|submit)\b|\bnext step\b/],
    ["documents", /\b(document|documents|paper|papers|requirement|requirements|what do i (need|bring|provide|come with)|birth certificate|passport photo\w*|photographs?|photos?|immunisation|immunization|report card|what (do i|to) bring|what is needed|credential)\b/],
    ["receipt", /\b(receipt|teller|proof of payment|payment slip|verify|genuine|authentic|confirm (my )?payment)\b/],
    ["trackapp", /\b(track|status of (my )?(application|admission)|application status|admission status|check (my )?(application|admission))\b|\bhow (do|will) i know\b[^.?!]{0,30}\b(admitted|accepted|got in|successful)\b/],
    ["contactinfo", /\b(contact (you|the school|us)|how (do|can) i (contact|reach|call|message)|phone number|your number|email|e-mail|reach you|get in touch|how (fast|quickly|soon).*(reply|respond)|reply time)\b/],
    ["officehours", /\b(office hours?|opening hours?|open on (saturdays?|sundays?|weekends?)|do you open|are you open|when are you open|working days?|working hours?|closing time|opening time)\b/],
    ["complaint", /\b(complain|complaint|anonymous|suggestion box|report (a|an) (problem|issue|teacher)|unhappy|dissatisfied|grievance)\b/],
    ["passwordhelp", /\b(create (a )?password|forgot (my )?password|reset (my )?password|can'?t log ?in|cannot log ?in|registration number|login detail|otp|how (do|does|can) (i |my child |my son |my daughter |we )?log ?in\b|logging in)\b/],
    ["overview", /^\s*(tell me about|what about|describe|info(rmation)? about|talk about|explain)\s+(the\s+|your\s+|this\s+)?(school|treasure|academy|place|it)\s*[.?!]?\s*$|^\s*(what is|who are)\s+(this|the)?\s*(school|treasure academy|treasure)\s*[.?!]?\s*$/],
    ["leadership", /\bwho (is|are)\b[^.?!]{0,20}\b(in charge|head|headmistress|principal|leader|leading|running|manage|boss|authority)\b|\bwho (leads?|runs?)\b|\bhead ?(mistress|master|teacher)\b|\bwho manages\b/],
    ["staffinfo", /\b(tell me about|who are|list|meet)\b[^.?!]{0,15}\b(staff|teachers|team)\b|\b(school administrator|administrator|administration|admin staff|support staff|non[- ]teaching)\b|\bhow qualified\b|\bwho (handles|runs|manages)\b[^.?!]{0,15}\b(admin\w*|office)\b/],
    ["pickup", /\b(who can (collect|pick)|pick ?up|collect my child|release my child|drop off|hand over|dismissal)\b/],
    ["founder", /\b(founder|founded|found the school|who started|who built|who created|who owns|owner|proprietress|proprietor|establish(ed)?|set up|began|origin|since when|how old is the school|how long have you)\b/],
    ["mission", /\b(mission|vision|motto|aim|aims|goal|goals|purpose|philosophy|values|believe|belief|what do you stand for|ethos)\b/],
    ["history", /\b(history|story|background|journey|milestone|milestones|timeline|over the years|past)\b|\bhow did\b[^.?!]{0,25}\b(start|begin|found)\b|\bwhen did\b[^.?!]{0,30}\b(move|open|launch|start|begin|built|relocat)\b|\bwhat year\b/],
    ["facilities", /\bfacilit\w*\b|\b(library|computer room|computer lab|ict|playground|play ground|play area|classroom|building|premises|compound|equipment|amenit|what do you have|infrastructure|swimming|pool|field|hall|sick bay|clinic|boarding|boarder|hostel|dormitory|day school)\b/],
    ["performance", /\b(pass rate|result rate|common entrance|how well|performance|perform|achievement|success|record|graduates?|alumni|old students?|secondary school|secondary schools)\b|\bhow do\b[^.?!]{0,25}\b(pupil|pupils|student|students|children)\b[^.?!]{0,15}\b(do|perform|fare)\b/],
    ["staffcount", /\bhow many\b[^.?!]{0,20}\b(teacher|teachers|staff|pupil|pupils|student|students|children|child|class|classes)\b|\bnumber of (teacher|staff|pupil|student|child)/],
    ["employment", /\b(job|jobs|vacancy|vacancies|employ|employment|hiring|hire|recruit|teaching job|career|careers|cv|curriculum vitae)\b|\b(send|submit|attach|my)\s+(my\s+)?resum[eé]\b|\b(i|we|my)\b[^.?!]{0,25}\b(work|working|teach|teaching|join)\b[^.?!]{0,30}\b(there|here|with you|for you|at your|in your|as a teacher|as teacher|your school|the school)\b|\bcan i (work|teach|join)\b|\bapply\b[^.?!]{0,20}\b(teach|job|position|role|work)\b|\b(need|want|looking for|require|recruiting)\b[^.?!]{0,15}\b(teacher|teachers|staff|worker|workers|employee)\b/],
    ["partner", /\b(partner|partners|partnership|sponsor|sponsors|sponsorship|collaborat|affiliat|accredit|associate with|work with|donor|ngo)\b/],
    ["enrol", /\b(enrol\w*|admission\w*|admit|apply|application|register my|registering|bring my child|join the school|new pupil|start school|place for my|space for my|vacancy for my child|accept|enter (the |your |this )?(school|creche|nursery|primary))\b/],
    ["visit", /\b(visit|tour|come and see|inspect|look around|open day|see the school|appointment)\b/],
    ["location", /\b(where (is|are|can i find|do i find) (the |your |this )?(school|academy|treasure|it|you)|located|location|address|direction|how do i get|how to get|find the school|map|which (town|state|area))\b/],
    ["price", /\b(how much|price|cost|costs|fee|fees|pay|payment|expensive|cheap|naira)\b|\bcharges?\b(?![^.?!]*\b(of|in charge)\b)/],
    ["birthday", /\bbirthdays?\b/],
    ["timetable", /\b(timetable|time table|schedule|when is|what time|period|lesson plan)\b/],
    ["result", /\b(result|results|report card|grade|score|performance|position in class)\b/],
    ["contact", /\b(contact|call|phone|number|whatsapp|email|reach|speak to|talk to)\b/],
    ["compare", /\b(why (should|choose)|better than|compare|different from|what makes|why treasure|advantage)\b/],
    ["safety", /\b(safe|safety|secure|security|fence|gate|cctv|supervis|first aid|sick|nurse|injur|bully|bullying|bullies|harass\w*|corporal|punish\w*|fight|fighting)\b/],
    ["food", /\b(food|meal|meals|lunch|feed|feeding|eat|snack|diet|canteen|kitchen)\b/]
  ];

  /* Nigerian English, normalised to the phrasing the rules expect. Parents
     type how they speak; the rules should not have to know both. */
  var PIDGIN = [
    [/\bwetin dey happen (for|in)\b/g, "what happens in"],
    [/\bwetin\b(?!\s+dey\s+(happen|sup)\b)/g, "what"],
    [/\babeg\b/g, ""],
    [/\bwho be\b/g, "who is"],
    [/\bwhich year\b/g, "what year"],
    [/\buna\b/g, "you"],
    [/\bdem dey\b/g, "they"],
    [/\bdey teach\b/g, "teach"],
    [/\byou get\b/g, "do you have"],
    [/\bi wan\b/g, "i want to"],
    [/\bmy pikin\b/g, "my child"],
    [/\bpikin\b/g, "child"],
    [/\btalk about\b/g, "say about"],
    [/\bhow much be\b/g, "how much is"],
    [/\bwhat be\b/g, "what is"],
    [/\bdey for\b/g, "are in"],
    [/\bcome your\b/g, "to your"],
    [/\bsabi\b/g, "know"],
    [/\bhow far\b(?=[^.?!]*\b(my|the|our)\b)/g, "what is the status of"],
    [/\bi need bring\b/g, "what do i bring"],
    [/\bi wan\b/g, "i want to"],
    [/\bcheap pass\b/g, "cheapest"],
    [/\bi don\b/g, "i have"],
    [/\bi forget\b/g, "i forgot"],
    [/\bna real one\b/g, "genuine"],
    [/\bhow i go\b/g, "how do i"],
    [/\bcome school\b/g, "to school"]
  ];

  function norm(s) {
    var raw = String(s || "");
    if (NORM_CACHE[raw]) return NORM_CACHE[raw];
    var t = fold(raw);
    /* Symbols wedged BETWEEN two letters ("b*uilt", "what$$s") are
       long-press accidents, not punctuation - the word was meant whole.
       Hyphens and apostrophes are real spelling, so they stay. */
    for (var strip = 0; strip < 3; strip++) {
      var before = t;
      t = t.replace(/([a-z])([^\sa-z0-9'-]+)([a-z])/g, "$1$3");
      if (t === before) break;
    }
    t = t.replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
    t = cleanTokens(t);
    t = " " + t + " ";
    for (var i = 0; i < PIDGIN.length; i++) {
      t = t.replace(PIDGIN[i][0], PIDGIN[i][1]);
    }
    t = " " + t.replace(/\s+/g, " ").trim() + " ";
    if (Object.keys(NORM_CACHE).length < 400) NORM_CACHE[raw] = t;
    return t;
  }

  /* Find which known thing the sentence is about. Longest phrase wins so
     "water bottle" beats "bottle". */
  function findIn(map, text) {
    var t = norm(text), best = null, bestLen = 0;
    for (var key in map) {
      if (!map.hasOwnProperty(key)) continue;
      for (var i = 0; i < map[key].length; i++) {
        var word = map[key][i];
        if (t.indexOf(" " + word + " ") >= 0 ||
            t.indexOf(" " + word + "s ") >= 0 ||
            t.indexOf(" " + word + "'s ") >= 0) {
          if (word.length > bestLen) { best = key; bestLen = word.length; }
        }
      }
    }
    return best;
  }

  function detectIntent(text) {
    var t = norm(text);
    for (var i = 0; i < INTENTS.length; i++) {
      if (INTENTS[i][1].test(t)) return INTENTS[i][0];
    }
    return null;
  }

  /* Does a stored record match the thing the user named? Checks the record's
     own words against every synonym of that thing. */
  function recordMatches(recordText, thingKey) {
    if (!thingKey) return false;
    var r = norm(recordText);
    var words = THINGS[thingKey] || [thingKey];
    for (var i = 0; i < words.length; i++) {
      if (r.indexOf(words[i]) >= 0) return true;
    }
    return false;
  }

  global.TAEntities = {
    THINGS: THINGS,
    CLASS_WORDS: CLASS_WORDS,
    SUBJECTS: SUBJECTS,
    GREETINGS: GREETINGS,
    norm: norm,
    fold: fold,
    loose: loose,
    _fixToken: fixToken,
    _known: knownWords,
    wh: whOf,
    hasDomainWord: hasDomainWord,
    peelSocial: peelSocial,
    matchGreeting: function (t) { return matchGreetingLoose(loose(t)); },
    thing: function (t) { return findIn(THINGS, t); },
    klass: function (t) { return findIn(CLASS_WORDS, t); },
    subject: function (t) { return findIn(SUBJECTS, t); },
    intent: detectIntent,
    matches: recordMatches,

    /* Everything understood about one sentence, in one object. */
    read: function (text) {
      return {
        intent: detectIntent(text),
        thing: findIn(THINGS, text),
        klass: findIn(CLASS_WORDS, text),
        subject: findIn(SUBJECTS, text)
      };
    }
  };
})(typeof window !== "undefined" ? window : this);

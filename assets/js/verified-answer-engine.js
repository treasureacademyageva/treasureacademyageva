(function (global) {
  'use strict';
  function normal(value) { return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+]+/g, ' ').trim(); }
  function has(text, pattern) { return pattern.test(text); }
  function answer(title, text, actions, topic, confidence) {
    return { title: title, text: text, actions: actions || [], topic: topic, confidence: confidence || 1, verified: true };
  }
  var published = [];
  var publishedMatchers = {
    school_hours:/\b(hour|hours|open|close|closing|school day)\b/,
    address:/\b(address|location|located|direction|visit)\b/,
    class_progression:/\b(class|classes|progression|primary|nursery|creche)\b/,
    admission_procedure:/\b(apply|application|admission|enrol|enroll|join)\b/,
    admissions:/\b(apply|application|admission|enrol|enroll|join)\b/,
    class_availability:/\b(class|space|place|availability|available)\b/,
    fees:/\b(fee|fees|cost|price|amount)\b/,
    calendar:/\b(calendar|term date|holiday|resumption|vacation)\b/,
    exam_timetable:/\b(exam|timetable|test date)\b/,
    transport:/\b(transport|bus|route|pickup|pick up)\b/,
    uniform:/\b(uniform|sportswear|dress code)\b/,
    supplies:/\b(supplies|materials|books|stationery)\b/,
    pta:/\b(pta|parent teacher)\b/,
    events:/\b(event|programme|ceremony|open day)\b/,
    public_policy:/\b(policy|privacy|safeguard|safety|child protection)\b/,
    general_notice:/\b(notice|announcement|update|news)\b/
  };
  var topicPages = {school_hours:'/contact#visit',address:'/contact#visit',class_progression:'/academics',admission_procedure:'/admissions',admissions:'/admissions',class_availability:'/admissions',fees:'/fees',calendar:'/calendar',exam_timetable:'/exams',transport:'/transport',uniform:'/uniform',supplies:'/shop',pta:'/pta',events:'/news',public_policy:'/privacy',general_notice:'/board'};
  function load(items) {
    published = Array.isArray(items) ? items.filter(function (item) {
      return item && typeof item.topic === 'string' && typeof item.title === 'string' && typeof item.summary === 'string';
    }).slice(0, 30) : [];
    return published.length;
  }
  function publishedAnswer(q) {
    var item = published.find(function (candidate) {
      var matcher = publishedMatchers[candidate.topic];
      return matcher && matcher.test(q);
    });
    if (!item) return null;
    var text = String(item.summary || '').trim();
    return answer(item.title, text, [['Read the related page',topicPages[item.topic] || '/board']], item.topic, 1);
  }
  function resolve(query) {
    var q = normal(query);
    if (!q) return null;
    if (has(q, /\b(password|sign in|login|result|report card|linked child|linked pupil|payment record|invoice|bank detail|account)\b/)) {
      return answer('Private information requires secure sign-in', 'Pupil records, results, invoices, approved bank details and linked-family information are never returned by public Search or chat.', [['Open secure portal','/portal/login.html'],['Get account help','/request-centre?type=account_help']], 'private_information', 1);
    }
    var current = publishedAnswer(q);
    if (current) return current;
    if (has(q, /\b(hour|hours|open|close|closing|start time|school time|school day)\b/)) {
      return answer('School hours are Monday–Friday, 7:30 a.m.–3:00 p.m.', 'Confirm holiday, break and special-day arrangements before travelling to the school.', [['Plan a visit','/contact#visit'],['Calendar guidance','/calendar']], 'school_hours', 1);
    }
    if (has(q, /\b(where|address|location|located|direction|find school|visit)\b/)) {
      return answer('Treasure Academy is in Ageva, Okene', 'The school is opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State. Call before visiting during a holiday or break.', [['Contact and directions','/contact#visit'],['Call the school','tel:+2348141943478']], 'address', 1);
    }
    if (has(q, /\b(class|classes|progression|primary 5|primary five|creche|pre nursery|nursery|primary [1-6]|graduate hall)\b/)) {
      return answer('Published class progression', 'Pre-Nursery → Nursery 1 → Nursery 2 → Primary 1 → Primary 2 → Primary 3 → Primary 4 → Primary 6 → Graduate Hall. Crèche/Daycare is no longer an active class. There is no Primary 5.', [['Explore classes','/academics'],['Ask about availability','/request-centre?type=class_enquiry']], 'class_progression', 1);
    }
    if (has(q, /\b(apply|application|admission|enrol|enroll|new pupil|join school)\b/) && !has(q, /\b(pay|payment|bank|transfer|pos|card|cash|account number|receipt)\b/)) {
      return answer('Admissions use the official online process', 'A family may complete admission online or receive assistance at school using the same online process. Applications may be accepted for every active class, subject to an authorised admission decision.', [['Start admission','/admissions#apply'],['Track a new-pupil application','/admissions#tracker']], 'admission_procedure', 1);
    }
    if (has(q, /\b(pay|payment|bank|transfer|pos|card|cash|account number|receipt)\b/)) {
      return answer('Payments require manual school-office approval', 'Use an approved bank transfer or the physical school-office POS. Bank details appear only in the signed-in portal or an official invoice. The website does not take online card payments, and payment never approves admission.', [['Read payment guidance','/fees'],['Secure parent portal','/portal/login.html']], 'payment_policy', 1);
    }
    if (has(q, /\b(fee|fees|cost|price|how much|amount)\b/)) {
      return answer('Ask for the current written fee schedule', 'The public website does not publish an unverified amount. Fees depend on class and term; approved details are provided by the office, signed-in portal or official invoice.', [['Request current fees','/request-centre?type=fee_schedule'],['Read safe-payment guidance','/fees']], 'fees', .98);
    }
    if (has(q, /\b(term date|calendar|holiday date|resumption|resume|vacation|next term|school date)\b/)) {
      return answer('Calendar dates are awaiting publication', 'The school will publish calendar dates after authorised staff verification. No date should be inferred from an older notice.', [['Open calendar guidance','/calendar'],['Ask the school to add or update it','/request-centre?type=information_update']], 'calendar', .98);
    }
    if (has(q, /\b(transport|school bus|bus route|pickup|pick up)\b/)) {
      return answer('Transport details need office confirmation', 'Ask the office whether transport is available for your area and request the current verified route, capacity and price.', [['Transport guidance','/transport'],['Ask the school to add or update it','/request-centre?type=information_update']], 'transport', .96);
    }
    if (has(q, /\b(uniform|sportswear|school wear|dress code)\b/)) {
      return answer('Use the current approved uniform guidance', 'Ask the office to confirm the approved list, sizes, prices and supply arrangement before buying.', [['Uniform guidance','/uniform'],['Ask the school to add or update it','/request-centre?type=information_update']], 'uniform', .96);
    }
    if (has(q, /\b(cbt|common entrance|computer based test|practice test)\b/)) {
      return answer('CBT is Primary 6 Common Entrance practice', 'The school’s computer-based practice is limited to Primary 6 Common Entrance preparation. It is not a general online examination programme.', [['Read CBT guidance','/elearning'],['Secure portal','/portal/login.html']], 'cbt', 1);
    }
    if (has(q, /\b(birthday|birthdays)\b/)) {
      return answer('Birthday notices are staff-only', 'Website birthday notices are for staff and the Headmistress only; pupil birthdays are not publicly listed.', [['Birthday notice guidance','/birthdays'],['Ask the office','/request-centre?type=birthday_greeting']], 'birthday_policy', 1);
    }
    if (has(q, /\b(homework|assignment|submit online|upload assignment)\b/)) {
      return answer('Assignments are not submitted online', 'The website may publish guidance, but pupils do not upload or submit ordinary assignments through the website.', [['Homework guidance','/homework'],['Ask for guidance','/request-centre?type=homework']], 'homework_policy', 1);
    }
    if (has(q, /\b(policy|privacy|safeguard|safety|child protection|bully|abuse|concern)\b/)) {
      return answer('Use the published school policy and verified help route', 'Public policy guidance is available on the website. Private safeguarding details should not be entered in Search or public chat.', [['Read safeguarding guidance','/safeguarding'],['Send a private safeguarding request','/request-centre?type=safeguarding']], 'public_policy', 1);
    }
    if (has(q, /\b(phone|call|whatsapp|email|contact|talk to|speak to)\b/)) {
      return answer('Use a verified school contact', 'Call +234 814 194 3478, use WhatsApp 09063932487, or email treasuregroupofschool@gmail.com. WhatsApp remains an ordinary contact channel.', [['Contact options','/contact'],['Call the school','tel:+2348141943478']], 'contact', 1);
    }
    return { title: 'This detail is not verified yet', text: 'The website will not guess. Ask the school to add or update the missing public information, or browse the related page matches below.', actions: [['Ask the school to add or update it','/request-centre?type=information_update'],['Browse all sections','/site-map']], topic: 'information_needed', confidence: .25, verified: false };
  }
  global.TAVerifiedAnswers = { answer: resolve, normalize: normal, load: load };
})(typeof window !== 'undefined' ? window : this);

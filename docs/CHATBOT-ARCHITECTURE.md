# Treasure Support AI — architecture

## The constraint that shapes everything

The site is static: Vercel, preset "Other", no build command, no server. A
chatbot that *requires* Python is a chatbot that is switched off in production.

So the system is built in two layers, and the school never sees a dead widget:

    Layer 1  BROWSER RAG        always on, zero infrastructure, works offline
    Layer 2  FastAPI + Postgres optional upgrade: real embeddings, LLM, analytics

Layer 1 is a genuine retrieval pipeline, not a keyword table:

    question -> normalise -> expand (Nigerian English synonyms)
             -> TF-IDF vector -> cosine search over the KB index
             -> best passages -> compose answer -> confidence score

Confidence decides the outcome. Above the bar it answers; below it, it hands
off. That threshold is the whole product.

Layer 2, when TREASURE_AI_URL is configured, replaces the retrieval and the
answer with sentence-transformer embeddings, real vector search and an LLM,
and persists conversations for analytics. The browser falls back the moment
the API is unreachable, so the widget cannot break the site.

## Knowledge base

Built by tools/build-kb.py from the site itself, so it cannot drift:
every public page, plus live school data (fees, exams, transport, uniform,
shop, calendar) and the portal route map. Output: assets/data/kb.json.

## Answers that depend on who is asking

"What are the fees?" is public. "How much do I owe?" is not. Each KB entry
carries needs_login. If the answer needs an account the bot says so and opens
the login popup instead of guessing.

## History

    guest     sessionStorage - dies when the browser tab closes, by design
    logged in localStorage + DB - survives, and on login the guest thread is
              merged in so nothing said before signing in is lost

## Handoff — the part most bots get wrong

When confidence is low the bot does not dump a phone number. It asks one
question first:

    "Do you need an answer right now, or can it wait?"
      right now  -> WhatsApp agent 09063932487 (real-time human)
      can wait   -> contact form ticket (reply by email)

Urgency picks the channel. Both paths return to the chat, so the
conversation continues afterwards.

## Files

    assets/js/chat-rag.js    retrieval: TF-IDF, cosine, confidence
    assets/js/chat-core.js   conversation, live data, history, handoff, analytics
    assets/js/chat-ui.js     the widget
    assets/data/kb.json      generated - do not hand-edit
    tools/build-kb.py        regenerates kb.json from the site
    ai/main.py               optional FastAPI backend
    developer.html           analytics dashboard

## Two sources of truth, on purpose

Static facts come from kb.json. Anything that changes by the hour is read from
the live database at the moment the question is asked: an emergency closure,
whether there is school today, this term's fee for one named class, the next
PTA meeting, the next exam paper, unclaimed lost property, uniform prices and
the admission deadline (resumption + 14 days, which keeps being quoted after
term starts instead of vanishing).

Order matters. A parent who says "my child lost his cardigan" wants the lost
property desk, not the uniform price list, so lost-and-found is checked first.

## After changing site content

    python3 tools/build-kb.py        # rebuild
    node tools/tests/chatbot.test.js # 77 checks

If the FastAPI backend is running, POST /reindex as well.

## Reading the dashboard

Knowledge gaps is the panel that matters: the exact questions that scored
below the confidence bar or were marked unhelpful. Each one is a fact worth
adding to tools/build-kb.py. Rebuild, and the bot answers it next time.

## Deliberate decisions

**It refuses to guess.** Below the confidence bar it hands off. A parent acting
on an invented school fee is worse than a parent who was told to ring.

**Weak matches cannot be talked up.** One stray word ("colour" matching
"Colouring Textbook") used to clear the bar. Any top score under 0.18 is
capped, whatever the rest of the field looks like.

**Courtesy is not a rating.** "Thank you" while feedback is pending is not a
thumbs-up: counting it would flatter the satisfaction figure.

**Urgency picks the channel, not the bot.** Real-time need goes to WhatsApp;
anything that can wait goes to the contact form. The bot asks rather than
assuming.

## Treasure Bot — entity understanding

`assets/js/chat-entities.js` works out **what** a question is about before
anything searches for it. Three maps: things the school holds (with every
synonym a parent might use), class names as people write them, and subjects.
Plus an intent list — lost, employment, partner, enrol, visit, location,
price, timetable, result, contact, compare, safety, food.

This is what separates an assistant from a search box:

    "my child's cardigan is missing"
      -> intent: lost, thing: cardigan
      -> look in the real lost-property records for a cardigan
      -> found:     "Blue cardigan (age 5-6), handed in 2026-09-12"
      -> not found: "No cardigan has been handed in yet. These are the items
                     currently unclaimed: ... Items usually arrive a day or
                     two later, and tell the class teacher."

"sweater", "jumper", "cardi" and "pullover" all reach the same record. The
answer is about **their item**, and when it is not there the bot still gives
the real list and a next step. Never a bare referral.

## The never-dead-end rule

Three layers, in order:

1. **Live data** — emergency notices, today's status, a named class's fee,
   next PTA, next exam, lost property, uniform prices, term dates.
2. **Retrieval** — 53 documents from the site's own pages.
3. **Salvage** (`nearestHelp`) — no confident match, but the question named a
   class or subject, or retrieval was a genuine near miss (>= 0.26). Say
   plainly that it is not written down, give the nearest real fact, offer
   another route.

Only when all three find nothing does it ask the urgency question. Suggesting
"School Hours" to someone asking about swimming lessons is noise, so the
salvage floor is deliberately set above that.

## Visitors who are not parents yet

Employment, partnerships, prospective parents, visits, "why this school",
and safety all have first-class answers, written from what is true on the
site. **Partnerships are answered honestly**: the school publishes no partner
list, so the bot says so and routes to the headmistress rather than inventing
names.

Intent matching is precise about this: "I want to teach at your school" is a
job enquiry; "do you teach French" is not.

## Conversation memory

The clearest way a bot gives itself away is losing the thread:

    "Where is my term bill?"   ->  Use the current pupil invoice in the signed-in parent portal.
    "and transport?"           ->  (generic Academics page)

`withContext()` fixes that. It remembers what the last substantive question
was *about* - fees, timetable, lost property, results, employment - and when
the next message is only a fragment it carries the topic forward before
anything searches. Current payment safeguards still override inherited
context: the bot never quotes a former price, bank account or route value.

Guardrails, because stale context is worse than none:

- Only short messages that open like a continuation, or a bare entity with no
  intent of its own, inherit anything.
- Any message with its own clear intent replaces the topic outright, so
  asking about a lost cardigan after a fee question does not return a price.
- Greetings and courtesy pass through untouched.

The topic lives in memory, not storage: it is conversational state, not
history.

## Suggested questions follow the conversation

The chips change with the topic - after a fee answer they offer paying,
sibling discounts, uniform cost and the deadline. A test asserts the bot can
actually answer **every question it suggests**, because a chip that leads to
"I don't know" is worse than no chip. That test immediately caught "When is
the deadline?" landing in a handoff, and the calendar answer was widened to
cover deadline wording and to degrade gracefully when no calendar has loaded.

## Honesty about what is not fixed

"Sibling discounts may apply - ask the office" is exactly how the admissions
page words it, so that is exactly how the bot words it. It is never stated as
a fixed promise, and a test pins that phrasing.

## The rules Treasure Bot follows

Not a list of questions and answers. A set of rules applied to whatever is
asked. Everything is answered from **this website and its own database** -
there is no external API, no internet search, and none is needed: the site
already holds the school's facts and its live data.

**Rule 1 - Work out the intent before searching.**
Thirteen-plus intents (lost, price, curriculum, founder, mission, history,
facilities, performance, staffcount, employment, partner, enrol, visit,
location, timetable, result, contact, compare, safety, food). Intent is
matched before retrieval so "my child lost his cardigan" never lands on the
uniform price list.

**Rule 2 - Resolve synonyms, classes and subjects to what the data calls them.**
Parents do not type the stored word. Sweater, jumper, cardi and pullover all
resolve to *cardigan*; p3, primary three and basic 3 all resolve to
*Primary 3*; maths, arithmetic and number work all resolve to *Mathematics*.

**Rule 3 - Be specific about the thing named.**
If the question names an item, class or subject, answer about **that** one -
"Primary 4 is N35,000", "Yes, Computer Science is taught", "a Blue cardigan
was handed in on 2026-09-12". Never answer a specific question with a general
page.

**Rule 4 - When the specific thing is absent, say so plainly, then stay useful.**
"No cardigan has been handed in yet" followed by what *is* unclaimed and what
to do next. "French is not one of the subjects the school records" followed by
the subjects that are. A clean no beats a vague deflection.

**Rule 5 - Prefer live data over prose.**
Fees, exams, lost property, PTA dates, subjects and staff counts are read from
the database at the moment of asking, so the answer cannot go stale. Scraped
page text is the fallback, never the first choice.

**Rule 6 - Never dead-end.**
Live data, then retrieval, then salvage (nearest real fact). Only when all
three find nothing does it ask whether the reply is needed now or can wait -
and that question decides WhatsApp versus the contact form.

**Rule 7 - Refuse rather than guess.**
Below the confidence bar it hands off. A parent acting on an invented school
fee is worse than a parent who was told to ring the office.

**Rule 8 - Never invent what the school has not published.**
No partner list exists, so the bot says so and routes to the headmistress.
Sibling discounts are hedged exactly as the admissions page hedges them.

**Rule 9 - Carry the thread.**
A fragment inherits the previous topic; any message with its own clear intent
replaces it.

**Rule 10 - Only suggest what it can answer.**
A test asserts every suggested chip produces a real answer.

## About-page coverage

Founder, mission and vision, the 2015-2026 milestones, facilities (library,
computer room, playground, sick bay, portal), what the school does **not**
have (no swimming pool, no boarding - answered plainly), Common Entrance
performance, and staff/pupil counts read live from the database.

## Academics, the class pages, and staff

`academics.html` links to `class.html?class=NAME` - ten pages generated from
`classPages` data. None of them were indexed, so "what happens in Nursery 1"
had no answer at all. They are now both indexed and answered by rule: the class
page text, its activities, the real class teacher and that class's fee, in one
reply.

Staff had a worse problem. `db.teachers` is the login roster and still carries
rows the owner retired, marked `(demo)`. The bot would have told a parent
*"Mrs. Ngozi Obi (demo) teaches Creche"*. Staff answers now read `db.staffWall`
- the real published team with their qualifications - and filter `(demo)` out
everywhere. A test pins that no answer can ever contain it.

## More rules

**Rule 11 - Normalise Nigerian English before matching.**
"abeg who be the head", "wetin dey happen for primary 2", "which year una
start" are rewritten to standard phrasing before any rule sees them, so the
rules never have to know both dialects.

**Rule 12 - A greeting is only a greeting when that is the whole message.**
"abeg who be the head of the school" is a question with a polite opener, not a
hello.

**Rule 13 - Refuse internal information outright.**
A wifi password or a staff PIN is not login help. The bot says so and points
staff at the headmistress, rather than helpfully offering the login page.

**Rule 14 - "Not published" is an answer.**
Scholarships, accreditation papers, the canteen menu: the school holds these
but does not publish them. Say that plainly and name who does know. Silence and
a handoff are worse.

**Rule 15 - Prefer stems over whole words in triggers.**
`\bscholarship\b` cannot match "scholarships" and `\bfacilit\b` can never match
anything. Both were real bugs that silently disabled whole branches.

## The coverage suite

`tools/tests/ask-coverage.test.js` runs **151 real questions** - about, history,
facilities, classes, staff, subjects, e-learning, activities, fees, admissions,
plus Nigerian-English phrasings and four that must be refused - against a live
snapshot of `store.js`.

Every question must be answered from the site's own content and none may dead
end. Written as a measurement first: the first run scored **69/101**, which is
how the missing class pages, the demo-staff leak and the trigger bugs were
found. It now scores **151/151**.

Nonsense is still refused - answering everything would mean the confidence bar
had stopped working.

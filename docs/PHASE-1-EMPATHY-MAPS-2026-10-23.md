# Nigerian parent and staff empathy maps

**Date:** 23 October 2026  
**Use:** design hypotheses for validation with real Treasure Academy families and staff; these are not quotes, analytics findings or claims about named people.

The maps use Says / Thinks / Does / Feels. They reflect common service conditions relevant to a Nigerian private primary school—mobile-first access, bank-transfer reconciliation, shared devices, variable connectivity and strong safeguarding expectations—without stereotyping any family or employee.

## 1. Prospective parent deciding whether to apply

### Says

- “Which class is right for my child?”
- “What documents and fees do I need before we come?”
- “Can I see the school and speak with someone first?”
- “How do I know this WhatsApp number and bank instruction are really from the school?”

### Thinks

- I do not want to pay a form or fee and later discover that a place was not approved.
- A polished website is helpful, but accurate contact details and a real visit matter more.
- I need to compare the school with other household priorities and explain the decision to another caregiver.
- If a photo or testimonial is not clearly authentic, can I trust the rest of the information?

### Does

- Opens the site on a phone, often from WhatsApp or search.
- Scans the first screen for school identity, classes, location and a phone/WhatsApp action.
- Checks fees, admissions requirements and visit options before reading school history.
- Screenshots instructions or shares a link with a spouse/guardian.
- Calls or messages before transferring money.

### Feels

- Hopeful about a safe and academically supportive school.
- Cautious about hidden fees, false bank details and premature promises.
- Impatient if key information is buried in long pages.
- Reassured by consistent contact details, plain status language and a visit option.

### Design implications

- Establish Treasure Academy, Ageva and class range immediately.
- Place Apply Now and Schedule a Visit early; both must lead to truthful next steps.
- State that a payment does not approve admission.
- Keep unverified imagery and social links unpublished.
- Make Admissions, Fees and Contact one click away throughout the public site.

## 2. Current parent checking results or payment status

### Says

- “Has the school received my transfer?”
- “Is this result final, and who should I speak to if it looks wrong?”
- “I have more than one child—can I see each one without mixing records?”
- “I am using a shared phone; how do I keep this private?”

### Thinks

- The amount, term and pupil name must match my bank evidence.
- A wrong score can affect trust, so corrections need a clear process.
- I should not see another family’s information, and they must not see mine.
- I do not want to send a password, result sheet or bank alert into a public chat.

### Does

- Signs in from a mobile device.
- Switches between linked children, published results and payment records.
- Compares a portal record with a bank debit or paper communication.
- Messages the verified school number if access or a record is wrong.
- Signs out if reminded, especially on a shared device.

### Feels

- Relieved when records are current and clearly linked to the right child.
- Anxious when a transfer remains pending without an explanation.
- Protective of the child’s educational and personal information.
- Frustrated by technical wording or a generic “something went wrong”.

### Design implications

- Parent RLS must use the authenticated parent ID and student link, not a phone-number lookup.
- Display pupil, session, term, description, amount, method and status together.
- Show published results only; distinguish staff draft from parent-visible result.
- Use a generic sign-in failure but actionable, non-blaming recovery guidance.
- Keep sessions in session storage and display a shared-device sign-out reminder.

## 3. Parent raising a safeguarding or records concern

### Says

- “I need the right person to hear this privately.”
- “Please do not put my child’s details on a public page.”
- “What happens after I report this?”

### Thinks

- I need urgency without having to retell sensitive information to many people.
- A website form must not claim the school received something when it only opened WhatsApp.
- I want to know the verified channel and what minimum information to share initially.

### Does

- Looks for Safeguarding or Contact, often under stress.
- Chooses call or verified WhatsApp.
- May abandon if presented with a long generic form or uncertain destination.

### Feels

- Concerned, exposed or urgent.
- Reassured by calm language, a named role/process and an immediate verified route.

### Design implications

- Keep safeguarding and verified contact routes direct and non-promotional.
- Tell users when an action opens another service and that they must tap Send.
- Discourage sending passwords, full result sheets, diagnoses or bank evidence in a public first message.
- Never send problem-report content or form values to analytics.

## 4. Teacher entering results

### Says

- “Show me only the classes and subjects I am responsible for.”
- “I need to check the scores before parents can see them.”
- “I must not enter a score for the wrong child or term.”
- “If a score is corrected, the final record should be accurate.”

### Thinks

- Class lists and pupil names must be current.
- A whole-class permission is too broad if I teach one subject.
- Network failure must not leave me thinking a result was saved when it was not.
- Comments should be professional and related to learning.

### Does

- Works in short windows between school responsibilities.
- Enters repeated pupil/subject/term data, sometimes on a phone or low-powered laptop.
- Saves drafts, checks totals, then publishes.
- Requests class-assignment correction from an administrator.

### Feels

- Responsible for accuracy.
- Time-pressured during assessment periods.
- Frustrated by repeated data entry or loss after network interruptions.
- Confident when scope and save/publish state are visible.

### Design implications

- Teacher access must be class-and-subject scoped in RLS.
- Use constrained numeric inputs and database checks for CA/exam maximums.
- Default to draft; make publication an explicit checkbox.
- Confirm save success in text and keep failure states honest.
- Future enhancement: queued draft recovery only after a privacy/security design, never silent local storage of pupil records.

## 5. Administrator reconciling payments and admissions

### Says

- “I need evidence before I mark a bank transfer paid.”
- “A fee payment is not the same as completing admission review.”
- “Who changed this status, and when?”
- “Which teacher needs access to which class?”

### Thinks

- Matching the wrong transfer to a pupil creates financial and trust problems.
- Automatic admission approval from a webhook would bypass required judgement.
- Role escalation must not be possible through a profile edit.
- Audit information should help investigations without copying full payment payloads.

### Does

- Creates pending payment records.
- Checks bank evidence and records the bank reference.
- Separately reviews admission documents and records an admission decision.
- Assigns teachers to class/subject scopes.
- Reviews audit and rejected/duplicate webhook outcomes.

### Feels

- Accountable for money, data protection and school decisions.
- Concerned about mistakes during busy periods.
- Reassured by separation of duties, confirmations and append-only logs.

### Design implications

- Separate payment and admission tables, forms, triggers and audit logs.
- The historical gateway webhook RPC remains dormant and is not part of the approved manual payment workflow.
- New auth users default to parent; admin/teacher promotion is protected.
- Initial admin UI omits destructive deletion and emphasises status changes.

## 6. Headmistress/owner governing authenticity and release

### Says

- “Do not publish claims or media I have not verified.”
- “Keep the site simple and maintainable.”
- “Manual bank transfer and the physical school-office POS both require office verification; no gateway may be activated.”
- “I do not want private records or credentials exposed.”

### Thinks

- A new feature creates an ongoing support responsibility.
- The site should work on ordinary phones and weak connections.
- Domain, DNS and verified contact records must not be disrupted.

### Does

- Reviews evidence, contact details, fees and operational readiness.
- Approves specific assets and production switches.
- Creates or delegates authorised admin access.
- Validates release and rollback plans before activation.

### Feels

- Protective of the school’s name and families.
- Cautious about online payments and external account access.
- More confident when changes are incremental, documented and reversible.

### Design implications

- Keep owner verification gates visible in the runbook.
- Preserve files and restoration history; never equate “exists in repository” with “approved for publication”.
- Keep `PORTAL_ENABLED`, `PORTAL_OFFICE_ENABLED` and all historical gateway switches separate and fail closed.
- Require explicit owner verification and production credentials before webhook activation; expose no checkout.

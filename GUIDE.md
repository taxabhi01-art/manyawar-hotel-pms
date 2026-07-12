# MANYAWAR HOTEL PMS — Apna App Live Karne Ki Guide

Ye guide bilkul step-by-step hai. Koi coding knowledge nahi chahiye — sirf click aur copy-paste karna hai.
Total time: 15-20 minute. Teen free account banane honge: **Supabase**, **GitHub**, **Vercel**.

---

## Step 1 — Supabase account banao (database + login)

1. Jao: https://supabase.com aur **"Start your project"** pe click karo
2. GitHub ya email se sign up karo (free hai)
3. **"New Project"** click karo
   - Name: `manyawar-hotel` (kuch bhi rakho)
   - Database Password: koi strong password banao aur **kahin save kar lo** (notes app mein)
   - Region: apne se sabse pass wala choose karo (jaise Mumbai/Singapore)
4. "Create new project" dabao — 1-2 minute wait karo jab tak project ban raha hai

### Table banao (SQL run karo)
5. Left sidebar mein **"SQL Editor"** pe click karo
6. **"New Query"** click karo
7. Is folder mein di gayi `supabase-schema.sql` file kholo, poora content copy karo, aur yahan paste kar do
8. Neeche right mein **"Run"** button dabao — "Success" dikhna chahiye

### Apni keys nikaalo
9. Left sidebar mein **"Project Settings"** (gear icon) → **"API"** pe jao
10. Do cheezein copy karo aur kahin save karo:
    - **Project URL** (jaise `https://xxxxx.supabase.co`)
    - **anon public key** (ek lambi string)

### Apna staff account banao
11. Left sidebar mein **"Authentication"** → **"Users"** pe jao
12. **"Add user"** → **"Create new user"** click karo
13. Apna email aur ek password daalo (ye aapka login hoga app ke liye)
14. "Auto Confirm User" ka checkbox ON rakhna — save karo
15. Baad mein staff ke liye bhi yahi step repeat karke unke email/password bana sakte ho

---

## Step 2 — GitHub pe code upload karo

1. Jao: https://github.com aur free account banao (agar nahi hai)
2. Top-right **"+"** → **"New repository"** click karo
3. Name: `manyawar-hotel-pms`, "Public" ya "Private" koi bhi choose karo → **"Create repository"**
4. Naye page pe **"uploading an existing file"** link pe click karo
5. Is poore folder ke **saare files aur folders** ko drag-and-drop karke upload kar do
   (`package.json`, `vite.config.js`, `index.html`, `src` folder, `supabase-schema.sql`, sab kuch — `node_modules` folder nahi hai isliye chinta mat karo)
6. Neeche **"Commit changes"** dabao

---

## Step 3 — Vercel pe deploy karo

1. Jao: https://vercel.com aur **GitHub se sign up** karo (free hai)
2. **"Add New..."** → **"Project"** click karo
3. Apni `manyawar-hotel-pms` repository dhoondo aur **"Import"** click karo
4. **"Environment Variables"** section kholo, do variables add karo:
   - Name: `VITE_SUPABASE_URL` → Value: (Step 1 se apna Project URL paste karo)
   - Name: `VITE_SUPABASE_ANON_KEY` → Value: (Step 1 se apna anon key paste karo)
5. **"Deploy"** button dabao — 1-2 minute wait karo
6. Deploy hone ke baad ek live URL milega (jaise `manyawar-hotel-pms.vercel.app`) — yehi aapka **permanent app link** hai!

---

## Bas, ho gaya!

- Us link ko apne staff ko bhejo
- Har staff member ko Supabase Authentication mein ek alag email/password bana ke do (Step 1.15 dekho)
- Data ab ek **real database** mein save hota hai — koi manual backup ki zaroorat nahi, Supabase khud sambhalta hai

## Agar kahin error aaye

Jo bhi error message dikhe (Vercel ke "Deployment" tab mein "Build Logs" ya browser mein), uska **poora text copy karke mujhe bhejo** — main dekh ke bata dunga kya fix karna hai. Aapko sirf error paste karna hai aur mere bataye hue file changes GitHub mein update karne hain (GitHub website pe file khol ke edit karo, seedha browser mein).

## Naye features add karwane ke liye

Jab bhi kuch naya chahiye ho (jaise Excel export, charts, backup jaisa jo pehle wale artifact mein tha), mujhe bata dena — main code likh dunga, aap sirf GitHub mein file replace karoge aur Vercel khud-ba-khud update kar dega.

---

## UPDATE: Reports, GST invoice, auto-cleaning task (naya batch)

Is baar bahut saare naye features aaye hain — inhe active karne ke liye 3 chhote steps hain:

### Step A — Naya SQL run karo
1. Supabase → **SQL Editor** → **New Query**
2. Is folder ki `supabase-schema-v2.sql` file ka poora content copy-paste karo
3. **Run** dabao — ye sirf naya add karta hai, purana kuch nahi todta

### Step B — Apna account "owner" banao
1. Supabase → **Table Editor** → `profiles` table kholo
2. Apni email wali row dhoondo
3. `role` column pe click karo, `staff` se `owner` kar do — save ho jayega apne aap
   (Isse sirf aapko Reports aur Settings tab dikhega, staff ko nahi)

### Step C — Sab files GitHub pe replace karo
Is baar bahut saari files badli/nayi hain, isliye simplest tareeka:
1. GitHub repo kholo → saari purani files select karke delete karo
2. Is naye zip ka **poora content** wapas upload kar do (drag-and-drop)
3. **"Commit changes"** dabao — Vercel khud rebuild kar dega (2-3 minute)

### Naye features kya karte hain
- **Reports tab** (sirf owner ko dikhega): 15-din aur mahine ka revenue comparison, aur Excel export with date range
- **Settings tab** (sirf owner ko dikhega): Hotel name, address, GST number, GST % — ye invoice pe use hoga
- **Billing → "Invoice PDF"**: har booking ka professional PDF invoice, GST ke saath
- **Check-in/Check-out**: agar balance bacha hai to ek warning popup aayega
- **Check-out ke baad**: room automatically "Cleaning" queue mein chala jata hai — Staff tab ke top pe "Housekeeping queue" mein dikhega, koi bhi Housekeeping staff use claim/complete kar sakta hai
- **Dashboard**: ab available/occupied/cleaning/maintenance rooms ka poora count dikhega

## UPDATE 2: Calendar, real availability, task alerts, modern invoice

Naye SQL migration ke saath ek aur update hai:

### Step A — Naya SQL run karo
1. Supabase → SQL Editor → New Query
2. `supabase-schema-v3.sql` ka content paste karke Run karo (sirf staff table mein email column add karta hai)

### Step B — Staff members ko email se link karo
Task notifications ke liye zaroori: Staff tab mein har staff member ko edit karke unka **wahi email daalo jo unke Supabase login mein hai** (Authentication → Users wala email). Bina iske system ye nahi jaan payega ki koi login kis staff member ka hai.

### Step C — Files replace karo GitHub pe (poora folder wapas upload, jaisa pehle kiya tha)

### Naye features:
1. **Calendar tab** — poore mahine ka view, har din pe kitni bookings hain wo dikhta hai, click karke us din ki poori list milegi
2. **Real date-based availability** — ab New Booking mein sirf wahi rooms dikhenge jo **chuni hui dates ke liye khaali hain** — future ki overlapping booking wale rooms automatically hide ho jayenge, double-booking nahi ho sakti
3. **Task alerts** — jab staff ko koi cleaning/task assign hoti hai (checkout ke baad automatic wali bhi), unke login karte hi ek notification banner dikhega top pe, saath mein badge count Staff tab pe. **Imandaari se baat**: ye tabhi kaam karta hai jab wo apna browser tab khole hue hon — real push notification (jo band app mein bhi aaye) ke liye paid service chahiye hogi, wo alag setup hai
4. **Dashboard "Reserved" card clickable** — click karte hi saari upcoming reservations ki detail list khulti hai
5. **Modern invoice PDF** — naya design, hotel branding ke saath, cleaner layout
6. **Date validation** — check-in kabhi aaj se pehle ki date nahi ho sakti, check-out hamesha check-in ke baad hi honi chahiye — dono jagah (New booking aur Edit dates) enforce hota hai

## UPDATE 3: Occupancy pricing, co-guests, aur ID proof scanning

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v4.sql` ka poora content paste karke Run karo. Ye ek **Storage bucket** bhi banata hai (`id-proofs`) jahan scanned ID photos private taur pe save hongi — sirf logged-in staff hi dekh/upload kar sakte hain, koi outsider nahi.

### Step B — GitHub pe files replace karo (poora zip wapas upload karo, Commit karo)

### Naye features:

**1. Room tariff ab 3 tier ka hai** — Rooms tab mein har room ke liye set karo: 1 guest ka rate, 2 guest ka rate, aur har extra guest (3rd, 4th...) ka alag rate.

**2. Co-guests** — New booking banate waqt "Co-guests" field mein batao kitne extra log guest ke saath hain. Isi se system automatically sahi rate/night calculate kar dega (occupancy ke hisaab se).

**3. ID proof scan — check-in ke time** — Jab "Check in" dabaoge, ek screen khulegi jahan phone ka camera use karke guest aur har co-guest ka ID proof photo click kar sakte ho (ya gallery se upload). Ye future ke liye save ho jata hai guest ke record mein.

**4. Guest details dekhna** — Har booking pe "Guest details" button hai jo main guest + saare co-guests aur unke scanned ID dikhata hai. Guests tab mein bhi har guest pe "View ID" button hai (agar scan hui hai).

### Data kahan store hota hai (imandaari se):
- **Saara text data** (bookings, guests, rooms, payments, sab) — Supabase ke **real Postgres database** mein, jo humne Step 1 mein banaya tha
- **Scanned ID photos** — Supabase ke **Storage** mein (`id-proofs` naam ka bucket), database se alag hota hai lekin usi Supabase project ke andar hai. Private hai — sirf app ke logged-in staff access kar sakte hain, koi bhi random link se nahi khol sakta
- Guest ka record aur unka scan **hamesha link rehta hai** — jab bhi guest dobara aaye, unka purana ID already saved milega

### Ek chhoti si sacchai
Ye "scan" asal mein ek **photo capture** hai (phone camera se), na ki automatic OCR/barcode reading jo ID se naam-number khud nikaal le. Wo feature banane ke liye paid OCR service chahiye hogi — abhi ke liye photo hi kaafi hai zyadatar hotels ke liye (jaisa guest register mein photocopy rakhte hain, waisa hi digital version).

## UPDATE 4: Phone pe app jaisa install karo (PWA)

Is update ke baad app ko phone ke **home screen pe icon** ki tarah install kar sakte ho — khulega to browser ka address bar tak nahi dikhega, bilkul native app jaisa lagega.

**Koi naya SQL nahi lagta** — sirf naye files GitHub pe upload karo (poora zip content), jaisa pehle kiya.

### Android (Chrome) pe install karna
1. Site kholo browser mein
2. Address bar ke paas ya ⋮ (three-dot) menu mein **"Install app"** ya **"Add to Home screen"** dikhega
3. Tap karo — icon home screen pe aa jayega

### iPhone (Safari) pe install karna
1. Site kholo Safari mein (Chrome se nahi hoga, iPhone pe sirf Safari se kaam karta hai)
2. Neeche **Share button** (□ upward arrow) dabao
3. **"Add to Home Screen"** choose karo
4. Icon home screen pe aa jayega

Dono jagah, icon pe tap karne se app **poori screen** mein khulega, browser ka koi UI nahi dikhega — bilkul Play Store se install kiye app jaisa feel hoga, bas ye web-based hai (isliye Play Store pe listing ki zaroorat nahi).

## UPDATE 5: Finance, deposit adjust, WhatsApp, front/back ID, proforma

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v5.sql` ka content paste karke Run karo.

### Step B — GitHub pe naya code upload karo (poora zip wapas)

### Naye features:

**1. Finance tab (sirf owner ko dikhega)** — Income (bookings se) aur manual expenses (category ke saath) track karo. Ye tab **database level** pe bhi protected hai — staff login se koshish karega to bhi data nahi milega, sirf UI mein chhupaya nahi gaya.

**2. Deposit adjust ya refund** — Billing tab mein ab deposit ke 2 options hain: **"Adjust deposit to bill"** (deposit ko bill mein add kar deta hai, balance kam ho jata hai) ya **"Refund deposit"** (guest ko wapas de diya, cash mein).

**3. Naye reports** — Reports tab mein: mahine-wise revenue comparison (3/6/12/18/24 mahine choose kar sakte ho), aur "Most-booked rooms" chart (kaunsa room sabse zyada book hota hai).

**5. Proforma + Print** — Billing mein "Proforma / Print" button — 2 template design (Branded / Simple), PDF download ya seedha browser se **Print** kar sakte ho. "Tax Invoice PDF" wahi GST wala formal invoice hai, alag button.

**6. WhatsApp (free, manual-send)** — 3 jagah add kiya:
   - Booking banane ke baad "Send WhatsApp confirmation" popup
   - Billing mein balance-due guests ko "WhatsApp reminder"
   - Staff ko task assign karne par automatically WhatsApp khulta hai pre-filled message ke saath
   
   **Zaroori baat:** Ye `wa.me` links use karta hai — **bilkul free hai**, koi account/API nahi chahiye, lekin staff ko khud "Send" button dabana padta hai WhatsApp mein. Automatic bhejna (bina tap kiye) ke liye paid WhatsApp Business API chahiye hogi (jiski cost hum discuss kar chuke hain).

**7. ID proof front + back** — Check-in ke time ab har guest/co-guest ke liye **2 photo** capture hoti hai (front + back), dono alag-alag save hoti hain aur Guest details mein dono dikhti hain.

**8. Cash flow reports** — Finance tab mein Daily / Monthly / Yearly toggle — jitne bhi months peeche dekhne hain (3 se 24 tak) choose kar sakte ho.

### Extra jo maine add kiya (na maanga tha, lekin useful laga)
- Expense category-wise breakdown (is mahine kahan sabse zyada kharch hua)
- Booking source tracking already tha, ab reports mein room-popularity se combine hota hai decision lene ke liye

## UPDATE 6: Dashboard se direct check-in/out, early/late fee, date filter, booking ID

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v6.sql` Run karo.

### Step B — GitHub pe naya code upload karo (poora zip)

### Naye features:

**1. Dashboard se direct check-in/check-out** — "Arriving today" card pe click karo, ek list khulegi jisme har guest ke saamne seedha **"Check in"** button hai. Same "Departing today" pe **"Check out"** button.

**2. Standard timing: Check-in 12:00 PM, Check-out 11:00 AM**
- Agar koi guest **2 ghante ya usse pehle** (10:00 AM se pehle) check-in kare, to "Early check-in" ka option apne aap dikhega — fee daal sakte ho (ya 0 rakh ke waive kar sakte ho), wo bill mein add ho jayega
- Agar koi guest **1 ghanta ya usse zyada** late (12:00 PM ke baad) checkout kare, to "Late checkout" fee ka option dikhega, wahi bill mein add hoga
- Dono fees invoice/proforma pe alag line mein dikhengi

**3. Highlighted tags** — Bookings list mein agar early check-in ya late checkout hua hai, to guest ke naam ke paas ek **highlighted badge** dikhega (⚡ Early check-in / ⏰ Late checkout), fee amount ke saath.

**4. Bookings page filter** — Ab status filter (all/reserved/checked-in/checked-out) ke saath ek **date range filter** bhi hai — "From" aur "To" date daal ke sirf us period ki bookings dekh sakte ho (check-in date ke hisaab se).

**5. Manual Booking ID** — New booking banate waqt ek "Booking ID / Reference" field hai (optional) — apna khud ka number ya OTA ka reference daal sakte ho. Ye number Bookings list aur **Tax Invoice PDF** dono pe dikhega.

### Zaroori baat
Early/late fee detection aapke device/computer ki **local time** se hoti hai — isliye device ka time-zone aur ghadi sahi honi chahiye (India Standard Time). Fee amount har baar manually daalna hota hai — system khud koi fixed amount नहीं lagata, aap decide karte ho har case mein.

## UPDATE 7: Cancel (not delete), Night Audit, salary tracking, WhatsApp-first staff

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v7.sql` Run karo.

### Step B — GitHub pe naya code upload karo

### Naye/badle features:

**1. WhatsApp confirm** — WhatsApp feature pehle (v6) mein hi add ho chuka tha: booking confirmation, billing reminder, staff task assign — sab jagah hai. Agar nahi dikh raha tha, ho sakta hai wo update deploy nahi hui thi — is baar poori tarah confirm ho jayega.

**2. Staff ab WhatsApp number se add hote hain** — Staff add karte waqt ab **naam + WhatsApp number** zaroori hai (email optional, sirf app-login ke liye chahiye). Jab bhi kisi staff ko koi task assign karo (seedha unke card se ya "Housekeeping queue" se), **WhatsApp apne aap khul jata hai** pre-filled message ke saath — bas "Send" dabana hai.

**3. Same-day checkout** — ab check-in aur check-out **same date** ho sakti hai (day-use booking ke liye), pehle minimum 1 din force hota tha.

**4. Check-in/check-out time automatic** — jab bhi "Confirm check-in" ya "Confirm check-out" dabate ho, us waqt ka exact time (date + time) database mein save ho jata hai apne aap.

**5. Finance mein Salary tracking** — Expense category "Salaries" choose karoge to 2 naye fields aayenge: **kaunsa staff member** aur **kis period ki salary** (jaise "July 2026"). Expense list mein ye dikhega bhi.

**6. Delete hata diya, Cancel add kiya** — Booking pe ab "✕ delete" nahi hai — **"Cancel booking"** button hai jo record ko database se **hataata nahi**, sirf "Cancelled" status de deta hai (reason ke saath). History/reporting ke liye poora record surakshit rehta hai. Filter mein "cancelled" aur "no-show" bhi add kiye hain.

**7. Night Audit (naya tab, sabko dikhega)** — Din ke end mein: aaj kitne arrival/departure hone the vs hue, **possible no-shows** (jo aana tha but nahi aaye) ki list with "Mark no-show" button, occupancy/revenue summary, aur **"Run night audit"** button jo us din ka poora snapshot save kar deta hai (history ke liye). Ye front-desk ka roz ka closing process hai.

**8. Proforma simplify** — Proforma se PDF-download aur template-choice hata diya, ab sirf **"Print"** (seedha browser se print) aur **"Send via WhatsApp"** (text summary) hai. Tax Invoice PDF (GST wala) waisa hi hai, alag button.

**10. Check-in/check-out time dikhta hai** — Bookings list mein har booking pe agar check-in/checkout ho chuka hai, uska **exact time** dikhega ("In: 08 Jul, 2:30 PM · Out: 09 Jul, 11:15 AM" jaisa).

## UPDATE 8: Bug fixes + Proforma hataya + salary quick-add + round charts

**Koi naya SQL nahi lagta** — sirf code files replace karo.

### Fixes:

**1. Early/Late fee ka logic sahi kiya** — Pehle sirf time check hota tha (koi bhi din agar 10 AM se pehle check-in dabao to "early" dikha deta tha, chahe booking ki date kuch bhi ho). Ab **date bhi check hota hai**: Early check-in sirf tab lagega jab check-in **booking ki asli check-in date par** ho AND 12 PM se 2+ ghante pehle ho. Late checkout sirf tab jab checkout **booking ki checkout date par** ho AND 11 AM se 1+ ghanta baad ho.

**2. Staff add/save aur task-assign ka bug fix** — Iski wajah ye thi: jab task assign hota tha, code pehle database mein save karta tha (thoda time lagta hai), **uske baad** WhatsApp kholta tha — kai browsers is delay ki wajah se WhatsApp ko "popup" samajh kar **block** kar dete the, aur us error ki wajah se poora save process beech mein ruk jata tha (task list refresh hi nahi hoti thi, lagta tha kuch save hi nahi hua). Ab WhatsApp tab **turant** (click hote hi) khulta hai, database save hone ka wait nahi karta — koi popup-block nahi hoga. Saath hi, agar kabhi bhi staff save/task assign fail ho, ab ek **clear error message** dikhega (pehle chup-chap fail ho jata tha).

**3. Proforma pura hata diya** — Proforma ka Print/WhatsApp dono hata diye. Ab Billing mein **"Send bill via WhatsApp"** button hai — ye asli bill ki details (GST, discount, fees sab) WhatsApp pe bhej deta hai text mein. "Tax Invoice PDF" wahi purana GST invoice hai.

**4. Finance mein salary dete waqt naya staff add karo** — "Salaries" category choose karo, Staff dropdown mein **"+ Add new staff…"** option hai — wahi se naya staff member (naam + WhatsApp number) turant add kar sakte ho, expense save karte hi wo staff list mein bhi aa jayega.

**5. Reports mein round (pie) charts** — "Bookings by source" aur "Bookings by status" — dono donut-chart ke roop mein, kaunse channel se zyada booking aa rahi hai turant dikh jayega.

**6. Night Audit ab sirf Owner ko dikhega** — pehle sab staff ko dikhta tha, ab sirf owner login ko (Finance/Reports/Settings ki tarah).

## UPDATE 9: Tax-inclusive GST, mandatory booking ID, Inventory (naya tab)

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v8.sql` Run karo.

### Step B — GitHub pe naya code upload karo

### Naye/badle features:

**1. GST ab tax-inclusive hai** — Pehle GST **add** hoti thi total ke upar (jo galat tha, kyunki room rate mein tax already included hai). Ab jo bhi amount guest pay karta hai (booking total) **wahi bill pe final total dikhega** — GST sirf ek **breakdown** ke roop mein alag se dikhegi (kitna base price tha, kitna usme GST tha), lekin total badlega nahi. Ye Tax Invoice PDF aur WhatsApp bill dono mein sahi kar diya.

**2. Booking ID ab mandatory hai** — New booking banate waqt "Booking ID / reference" field bharna **zaroori** hai ab, khali nahi chhod sakte.

**3. Inventory (naya tab, sabko dikhega)** — Minibar/room-service jaisi cheezein manage karne ke liye:
   - **Item catalog banao**: naam, price per unit, kitna stock hai
   - **"Log item used"** — jab bhi koi item guest ko diya jaaye, yahan se select karo (kaunsa guest/room, kaunsa item, kitni quantity) — **automatically**:
     - Us item ka **stock kam ho jata hai**
     - Us guest ke **bill mein amount add ho jata hai** (Billing tab mein dikhega, aur invoice/WhatsApp bill mein bhi)
   - "Undo" button se galti se add ho gayi entry wapas reverse kar sakte ho (stock aur bill dono wapas ho jayenge)

Sab kuch automatic hai — ek baar item log karne ke baad, alag se kahin manually total update karne ki zaroorat nahi.

## UPDATE 10: Aaj ka cash flow, night audit mein early/late count, payment-mode chart

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v9.sql` Run karo.

### Step B — GitHub pe naya code upload karo

### Naye features:

**1. Finance mein "Aaj ka Cash Flow"** — naya section: aaj kitna **Cash** aaya, kitna **UPI** se, kitna **Bank/Card** se, total kitna receive hua, aaj ke **expenses**, **net** (bacha hua), aur **total pending** (sab bookings mila ke kitna balance due hai) — sab ek jagah.

**2. Night Audit mein early check-in / late checkout count** — us din kitne guests early aaye aur kitne late gaye, dono alag stat card mein dikhega, aur "Run night audit" karte waqt ye history mein bhi save ho jata hai.

**3. Reports mein payment-mode chart** — ek naya round (pie) chart "Payments by mode" — Cash/UPI/Bank/Card ka poora breakdown, kitna paisa kaunse mode se aaya.

## UPDATE 11: Activity log, global search, checklist, maintenance tickets, cash-flow range, full night-audit detail

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v10.sql` Run karo.

### Step B — GitHub pe naya code upload karo

### Naye features:

**1. Activity log + owner notification** — koi bhi zaroori action (booking cancel, discount, deposit refund, staff remove, expense add, no-show mark, maintenance ticket) automatically log hota hai. Owner ko top pe ek **banner** dikhta hai "X naye activity log entries" — "View" ya "Mark as read" kar sakte ho. "Activity" naam ka naya tab (sirf owner) poora history dikhata hai (kisne kya kiya, kab).

**2. Global search** — Sidebar mein top pe search box hai — guest naam, phone, room number, ya booking ref type karo, results turant dikhenge. Kisi bhi result pe click karo, **seedha us tab pe le jayega aur us cheez ko highlight kar dega** (2-3 second ke liye brass color se glow karega taaki turant dikh jaye).

**3. Housekeeping checklist** — Staff tab mein task assign karte waqt ab standard checklist items (bedsheets, bathroom, vacuum, etc.) **one-click** se add kar sakte ho, ya **"Assign full checklist"** dabao to sab ek saath assign ho jayenge.

**4. Maintenance tickets (naya tab, sabko dikhega)** — Cleaning se alag — "AC kharab hai" jaisi complaints report karo, priority set karo (Low/Medium/High/Urgent), staff ko assign karo (WhatsApp se automatic), status track karo (Open → In Progress → Resolved).

**5. Finance cash-flow mein date range** — Ab "Today" fix nahi hai — From/To date daal sakte ho, ya "Today"/"Yesterday"/"Last 7 days"/"Last 30 days" quick-buttons use kar sakte ho, jo bhi period dekhna hai.

**6. Night Audit ab poori tarah detailed hai** — Sirf counts nahi, ab poori list dikhti hai: sab arrivals/departures naam ke saath, early check-in/late checkout kisne kiye (fee ke saath), revenue payment-mode ke hisaab se, expenses category ke hisaab se. History mein bhi har purani date ke liye **"View details"** button hai jo us din ka poora record dikhata hai (jaisa audit run karte waqt tha).

## UPDATE 12: Room change, Billing search, guest search, Inventory bug-fix, mobile fix

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v11.sql` Run karo.

### Step B — GitHub pe naya code upload karo

### Naye/badle features:

**1. Check-in ke baad room change** — Checked-in booking pe ab **"Change room"** button hai. Naya (khaali) room choose karo — agar naye room ka rate alag hai to ek checkbox se decide kar sakte ho ki guest ka **purana agreed rate rakhna hai ya naye room ke hisaab se update karna hai** (default: purana rate rehta hai). Purana room automatically "cleaning" mein chala jata hai, naya "occupied" ho jata hai.

**2. Billing mein search + period filter** — Ab Billing tab mein guest naam/room/booking-ref se search kar sakte ho, aur "Today"/"Last 7 days"/"Last 30 days" ya custom date-range se filter kar sakte ho.

**3. New booking mein existing-guest search** — Booking banate waqt "Existing guest" choose karne par ab ek **search box** hai — naam ya phone type karo, list turant filter ho jayegi (bade guest-list ke saath dhoondna aasan ho gaya).

**4. Inventory ka bug fix ho gaya** — Asli wajah: "Log item used" button **sirf tab dikhta tha jab koi active booking ho** — agar koi guest currently reserved/checked-in nahi tha, to button hi gayab ho jata tha! Ab button **hamesha dikhega**. Saath hi ek naya option add kiya — **"Self-use / internal"** — jab item kisi guest ko nahi, khud staff ke istemal ke liye ya kisi aur wajah se nikala ho, to bina kisi booking ke bhi log kar sakte ho (stock kam hoga, lekin kisi guest ke bill mein nahi jayega).

**5. Mobile mein search bar ka layout fix** — Phone pe ab search bar apni **alag row** mein hai (sabse neeche), isliye Dashboard/Bookings jaise nav options ab hide nahi honge — sab dikhenge aur scroll kar sakte ho.

## UPDATE 13: ⚠ Zaroori bug-fix — same-day booking se double-booking ho rahi thi

**Koi naya SQL nahi lagta** — sirf code files replace karo. Lekin ye update **sabse zaroori** hai, deploy karne se pehle zaroor daal lena.

### Asli bug (jo screenshot mein dikha)

Jab bhi koi **same-day (day-use) booking** hoti thi (check-in aur check-out dono ek hi din), room-availability check karne wala logic isko "0-din ka stay" samajh kar **completely ignore** kar deta tha. Iska matlab: us room ke liye ek aur booking bana dena possible ho jata tha **usi din ke liye** — jaisa screenshot mein hua, Room 101 mein do guests (aman aur Abhi) **dono checked-in** dikh rahe the!

**Fix ho gaya hai** — ab same-day booking bhi poori tarah us din ke liye room ko "occupied" maan kar block karti hai. Ye fix in teeno jagah apply hota hai:
1. **New booking** — sirf wahi rooms dikhenge jo check-in/check-out dates ke liye sach mein khaali hain
2. **Change room** — sirf wahi rooms dikhenge jo us booking ki dates ke liye khaali hain
3. **Edit dates** — date change karte waqt bhi sahi se check hota hai

### ⚠ Purana data theek karna hoga
Aapke screenshot mein jo Room 101 do baar checked-in dikh raha hai (aman aur Abhi dono), **wo purani galti hai jo already database mein ho chuki hai** — naya code isse automatically theek nahi karega. Aapko manually ek karna hoga:
- Dono mein se jo galat/duplicate hai use **Cancel booking** kar do, ya
- Agar dono sach mein valid hain, to unmein se ek ko **Change room** karke kisi aur khaali room mein shift kar do

### Naya feature: Maintenance alert
Ab jab bhi **New booking** banate ho ya **Change room** karte ho, agar select kiya hua room mein koi **open maintenance ticket** hai (Open ya In Progress), to ek warning dikhegi jisme **poora reason** hoga (jaise "AC kharab hai — Priority: High"). Aap chahe to **confirm karke aage badh sakte ho** (jaise emergency mein), ya cancel karke doosra room choose kar sakte ho.

## UPDATE 14: ⚠ Doosra bug-fix — occupied/cleaning rooms bhi New Booking mein dikh rahe the

**Koi naya SQL nahi lagta.**

### Asli wajah (aapne sahi pakड़ा tha)

UPDATE 13 wala fix sirf "same-day booking ka overlap-math" theek karta tha. Lekin ek aur gap tha: availability check **sirf booking ki stored dates** dekhta tha — agar koi guest apni booked checkout date se **aage bhi room mein reh raha ho** (overstay, ya checkout process abhi nahi hua), to system ko pata nahi chalta tha ki room **abhi bhi physically occupied hai**, kyunki uski booking-dates ke hisaab se stay "khatam" ho chuki dikhti thi.

Ye gap "Change room" mein kam dikhta tha (kyunki wahan poori booking ki dates use hoti hain, jo zyada wide range hone se overlap pakड़ leta tha), lekin "New Booking" mein zyada expose hota tha jab aap **aaj ke liye** (same-day) booking bana rahe the.

### Fix
Ab availability check mein **room ka live status bhi dekha jata hai** — agar koi room abhi "occupied" ya "cleaning" mein hai AUR aap **aaj ke liye** koi booking bana rahe ho, to wo room **hamesha excluded** hoga, chahe uski booking ki dates kuch bhi kahen. Future dates (aane wale din) ke liye booking banate waqt ye extra check nahi lagta — sirf "aaj" wale case mein.

### ⚠ Ek baar phir — purana data
Room 201 wali double-booking (aman + sadhna) abhi bhi database mein hai — agar theek nahi kiya to abhi bhi confusing rahega. Dono mein se ek ko **Cancel** karo ya **Change room** se kisi aur khaali room mein shift karo.

## UPDATE 15: Split payments, deposit mode, owner payment-correction

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v12.sql` Run karo.

### Step B — GitHub pe naya code upload karo

### Naye features:

**1. Split payment (part cash, part online)** — "Record payment" mein ab **"+ Add another mode"** button hai — jitne bhi hisso mein guest pay kar raha hai (jaise ₹600 Cash + ₹400 UPI), sab ek hi jagah se ek saath record kar sakte ho. Har hissa alag payment entry banega, isliye mode-wise total (Finance tab) sahi rahega.

**2. Deposit ka payment mode** — New booking banate waqt agar advance/deposit daalo, to ab ek naya field aayega — **"Deposit paid via"** (Cash/UPI/Bank/Card/Other). Ye Bookings aur Billing dono jagah dikhega.

**3. Owner ke liye payment correction** — Agar kabhi galat amount ya galat mode record ho jaye, to **sirf owner login** ko har payment entry ke paas "**edit**" aur "**delete**" link dikhega (staff ko nahi dikhega). Edit karne se booking ka total paid amount **automatically sahi ho jata hai**, aur ye correction Activity log mein bhi record hoti hai.

## UPDATE 16: Purani booking/payment entry karne ka option (backdating)

**Koi naya SQL nahi lagta.**

### Problem jo aapne bataya
Jab purana data ab enter karte the (jaise kisi register se past ki bookings app mein daalna), "Booked on" date aur payment ki date hamesha **aaj ki** ban jaati thi — chahe booking/payment asal mein kisi purani date ki ho. Isse Reports aur Finance galat period mein revenue dikha rahe the.

### Fix
**New Booking** aur **Record payment**, dono forms mein ab ek extra date-field hai:
- New booking: **"Booked on"** — default aaj ki date, lekin badal sakte ho purani date pe
- Record payment: **"Paid on"** — same tareeka

Ye sirf **tabhi badlo jab purana data enter kar rahe ho** — normal roz ke istemal mein defaults (aaj ki date) waise hi rakho, kuch alag se nahi karna padega. Ek baar sahi date daal do, uske baad **Reports aur Finance dono automatically us sahi date ke hisaab se hi count karenge** — kyunki wo pehle se hi payment ki date (na ki "aaj") ke hisaab se calculate hote hain.

## UPDATE 17: Staff bhi expense add kar sake + mode-wise cash flow

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v13.sql` Run karo.

### Step B — GitHub pe naya code upload karo

### Naye features:

**1. Staff ke liye naya "Add Expense" tab** — Ab **sabko** (owner + staff) sidebar mein "Add Expense" tab dikhega. Staff sirf **naya expense add kar sakta hai** — poori financial ledger (Finance tab, reports, totals) **abhi bhi sirf owner ko dikhti hai**. Isse front-desk staff jab bhi cash se koi cheez kharide (jaise supplies, repair payment), turant record kar sakta hai, bina financial details dekhe.

**2. Expense mein ab Payment mode hai** — "Cash", "UPI", "Bank Transfer", "Card", "Other" — jaisa payments mein hota hai, wahi ab expenses mein bhi hai.

**3. Finance tab mein mode-wise cash flow** — selected date range ke liye ab dikhta hai:
   - Har mode mein **kitna aaya, kitna gaya** (Cash received/spent, UPI received/spent, alag-alag)
   - **Net Cash, Net UPI, Net Other** — alag-alag balance
   - Sabse neeche **"Total Net Profit / Loss"** — poore period ka final result, ek nazar mein

## UPDATE 18: Deeper reports, Booking edit, Backup, aur real Push Notifications

### Yahan 2 tarah ke steps hain:
- **A, B, C** — normal (SQL + GitHub upload jaisa hamesha karte hain)
- **D** — **bilkul naya tarika** (Supabase Edge Functions deploy karna), thoda technical hai, ek baar hi karna hai

---

### A) Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v14.sql` Run karo.

### B) GitHub pe naya code upload karo (poora zip, `supabase/functions` folder bhi saath aayega — usko GitHub pe daalna zaroori nahi, wo sirf reference ke liye hai)

### C) Ye seedhe features hain, kaam karna shuru ho jayega:

**1. Deeper Reports — ADR, RevPAR, Occupancy** — Reports tab mein ab hotel-industry ke standard metrics hain (month-to-date):
   - **Occupancy %** — kitne room-nights bike, kitne available the
   - **ADR (Average Daily Rate)** — average kitne mein room bika
   - **RevPAR** — total revenue ÷ total available rooms (dono metrics ek saath dekhne se pricing decisions lena aasan hota hai)

**2. Booking Edit** — "Edit dates" ab **"Edit booking"** ban gaya — dates ke alawa ab **co-guests count, booking source, aur booking ID/reference** bhi edit kar sakte ho. Agar co-guests badalte ho to rate/total automatically naye occupancy ke hisaab se recalculate ho jata hai.

**3. Data Backup (naya tab, sirf owner)** — Ek button dabao aur **poora data ek Excel file mein download** ho jata hai (rooms, guests, bookings, payments, staff, expenses, inventory, maintenance, night audits — sab alag-alag sheet mein). Mahine mein ek baar download karke Google Drive/email pe save kar lena — automatic nahi hai, jab bhi chaho tab manually download karna hoga.

---

### D) Real Push Notifications — naya setup (ek baar karna hai)

**Ye kya karta hai:** Ab jab staff ko koi task assign hota hai, unhe **turant phone pe notification** aayegi — chahe app khula ho ya band. Pehle sirf tab khula hone par hi dikhta tha.

**Isके liye Supabase CLI install karna padega** (ye ek command-line tool hai, ek baar setup karna hai):

1. Apne computer pe terminal/command-prompt kholo, ye install karo:
   ```
   npm install -g supabase
   ```
2. Login karo: `supabase login`
3. Apne project se link karo (project folder ke andar jaake):
   ```
   supabase link --project-ref <aapka-project-ref>
   ```
   (project-ref Supabase dashboard ke URL mein milega: `supabase.com/dashboard/project/XXXXX` — wahi XXXXX)
4. Secrets set karo (ye humesha ke liye ek baar):
   ```
   supabase secrets set VAPID_PUBLIC_KEY=BDNvyO732-JpdAt3J6MOqRuWIIj2svazkTwzz_ESGcCt7hrn1gVh2Y-fJRHVV8IX_gE4ws_XQ8nKvZELH9KpJOM
   supabase secrets set VAPID_PRIVATE_KEY=Jvt4oLzKYUW0Mb5bHFuedIbE9p0vrLft_tORiijQ36k
   supabase secrets set VAPID_SUBJECT=mailto:aapka-email@example.com
   ```
   ⚠️ **VAPID_PRIVATE_KEY kisi ko mat dena, ye secret hai.**
5. Dono functions deploy karo:
   ```
   supabase functions deploy send-push
   supabase functions deploy daily-reminders
   ```

**"Kal checkout/check-in hai" wala automatic reminder set karne ke liye:**
- Supabase Dashboard → **Edge Functions** → `daily-reminders` kholo → **"Schedule"** ya **"Cron"** tab mein jaake roz ek time set kar do (jaise subah 9 baje) — bas itna hi, uske baad automatic chalta rahega.

**Agar ye technical setup abhi nahi karna:** Koi baat nahi — baaki sab (WhatsApp notification, in-app banner, aur naya **"Tomorrow's schedule"** reminder jo Dashboard pe dikhta hai) already kaam karta hai **bina iss setup ke bhi**. Push notification sirf ek extra layer hai.

**Test kaise karo:** Deploy karne ke baad, app mein login karo (browser notification permission maangega, "Allow" karna), phir kisi ko task assign karo — unke phone/browser pe notification aani chahiye.

## UPDATE 19: Duplicate-booking prevention, Finance drill-down, checkout→billing, invoice payment trail, Maintenance common areas, Expense document upload

### Step A — Naya SQL run karo
Supabase → SQL Editor → `supabase-schema-v15.sql` Run karo.
⚠️ Isme ek **Storage bucket** banane wali line bhi hai (`expense-receipts`). Agar wo line error de (permission issue), to use skip karke **manually** bana lo: Supabase → **Storage** → **New bucket** → naam `expense-receipts` → **Private** rakhna.

### Step B — GitHub pe naya code upload karo

### Naye features:

**1. Duplicate booking rokna** — Ab New Booking banate waqt agar **booking ID/reference** pehle se kisi active booking mein use ho chuki hai, ya **guest ka naam + check-in + check-out date** hubahu kisi purani booking se match karta hai, to app **turant rok degi** aur bata degi ki konsi purani booking se conflict ho raha hai. Agar genuinely dobara booking banani hai (jaise koi correction), pehle purani wali cancel karo.

**2. Finance mein Cash/UPI pe click karo** — "Cash received", "UPI received", ya "Other" wale card pe click karo, ek list khulegi jisme us mode ke **saare payments** (guest naam, date, booking ref ke saath) dikhenge. Wahan se **Print** ya **Download PDF** kar sakte ho.

**3. Checkout → seedha Billing** — Ab jab bhi koi guest checkout kare, agar unka **kuch payment pending hai**, to app **automatically Billing tab** pe le jaayegi aur us guest ki **"Record payment"** window seedha khol degi — dhoondna nahi padega.

**4. Invoice (Tax Invoice PDF) behtar hua** — Check-in/check-out/nights pehle se tha; ab isme **"Payment history"** table bhi hai — har payment ki date, mode (Cash/UPI/etc) alag-alag dikhegi, sirf total nahi. Deposit ka mode bhi ab dikhta hai. Thank-you message bhi thoda behtar kiya.

**5. Maintenance mein Common Areas** — Naya ticket banate waqt ab **"Room"** ya **"Common area"** choose kar sakte ho. Common area mein preset list hai — Lobby, Reception, Parking, Garden, Restaurant, Kitchen, waghera. Ab sirf rooms ke issues nahi, poore hotel ki common jagah ke issues bhi track ho sakte hain.

**6. Expense mein document upload** — Jab bhi koi expense add/edit karo, ab ek naya option hai — **"Related document"** — receipt, bill, ya invoice ki photo/PDF upload kar sakte ho. Expense list mein jin entries ka document hai unke aage **"📎 Doc"** button dikhega, click karke turant dekh sakte ho.

## UPDATE 20: Guest QR-code issue reporting (bina login guest complaint bhej sake)

**Koi naya SQL nahi lagta** — sirf code upload + ek naya Edge Function deploy karna hai (agar aapne pehle push-notifications wala Supabase CLI setup kiya tha, to yahi tareeka repeat karna hai).

### Kya banaya

1. **Har room ke liye QR code** — Rooms tab mein ab **"🏷 Print QR codes"** button hai. Click karo, sab rooms ke QR codes dikhenge, **"Print all"** se print kar sakte ho aur har room mein ek-ek chipka do.
2. Jab guest apne phone se QR **scan** karega, ek **simple page** khulega (koi login/app install nahi chahiye) — "AC not cooling", "No hot water" jaise quick-options, ya khud likh sakte hain, "urgent" bhi mark kar sakte hain.
3. Submit karte hi:
   - Maintenance tab mein automatically ek **ticket ban jata hai** ("Guest (QR) 📱" label ke saath, brass-color highlight)
   - Owner/staff ko **push notification** turant chali jaati hai (agar push notification setup already kiya hai)
   - Activity log mein bhi record hota hai

### Deploy karne ka tareeka

**Step A — Code upload** (normal tareeka, GitHub Desktop se)

**Step B — Naya Edge Function deploy karo** (agar pehle push-notifications ka Supabase CLI setup kiya tha, to isi terminal se):
```
supabase functions deploy guest-report
```
Bas itna hi — VAPID secrets already set hain (push notifications wale update se), unhi ko reuse karta hai.

**Agar push notifications ka setup pehle nahi kiya:** Guest complaint ka **ticket to ban jayega** Maintenance mein (wo turant kaam karega, bina Edge Function ke bhi — chalo isko double check karte hain)... **Nahi** — is baar ticket banane ka kaam bhi Edge Function ke through hi hota hai (security ke liye), isliye `supabase functions deploy guest-report` chalana **zaroori hai** poora feature kaam karne ke liye. Agar CLI setup nahi kiya hai, GUIDE.md ke UPDATE 18 → Section D dekho, wahi steps follow karo (Node.js, Supabase CLI install), bas is baar sirf `supabase functions deploy guest-report` chalana hai — VAPID secrets set karne ki zaroorat nahi (wo already set hain agar UPDATE 18 kiya tha; agar nahi kiya tha, wo bhi karna padega).

### Test kaise karo
1. Rooms tab → "Print QR codes" → kisi bhi room ka QR **apne phone se scan karo** (ya seedha browser mein URL type karo: `https://aapki-app-ka-url.vercel.app/?report=101`)
2. Ek issue submit karo
3. Maintenance tab mein wo turant dikhna chahiye, "Guest (QR)" label ke saath

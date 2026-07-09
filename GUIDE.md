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

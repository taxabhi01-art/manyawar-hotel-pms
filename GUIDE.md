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

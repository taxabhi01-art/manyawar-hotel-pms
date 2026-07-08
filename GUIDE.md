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

### Ek imandaari se baat
Real-time SMS/WhatsApp jaisa "message chala jaana" is app mein nahi hai — uske liye paid SMS service (jaise Twilio) chahiye hoti, jo scope se bahar hai. Iske badle, checkout hote hi task turant **app ke andar** "Housekeeping queue" mein aa jata hai — jab bhi staff app kholega, turant dikh jayega. Agar future mein real SMS chahiye, bata dena, uske liye alag setup karna padega (aur ek chhota monthly cost bhi ho sakta hai).

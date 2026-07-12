# MANYAWAR HOTEL PMS — Project Summary

Ye document poori project ki history aur current state batata hai. Naye Claude Project mein isko
"Project knowledge" ke roop mein daal do — future conversations mein Claude turant context samajh
jayega, poori kahani dobara batani nahi padegi.

---

## 1. Ye kya hai

MANYAWAR HOTEL ke liye ek **poora Property Management System (PMS)** — rooms, bookings, guests,
billing, staff, attendance sab manage karne ke liye. Do phases mein bana:

**Phase 1 (chhod diya gaya):** Claude.ai ka "Artifact" feature — browser mein hi chalta tha, data
Anthropic ke storage mein save hota tha. Ye temporary/demo tha.

**Phase 2 (current, live hai):** Poora real web application — apna database (Supabase), apna
hosting (Vercel), real staff logins. Ye ab **production mein live hai** aur roz use ho raha hai.

---

## 2. Live app ki details

- **Live URL:** https://manyawar-hotel-pms.vercel.app
- **GitHub repo:** github.com/taxabhi01-art/manyawar-hotel-pms
- **Hosting:** Vercel (free tier), GitHub se connected, `main` branch pe push karte hi auto-deploy
- **Database + Auth + Storage:** Supabase (free tier)
- **Owner login:** ashufhotels@gmail.com (Supabase → Authentication → Users mein bana, role='owner' hai `profiles` table mein)
- **Tech stack:** React + Vite, plain CSS (no Tailwind), @supabase/supabase-js, jsPDF, xlsx, recharts

---

## 3. Poora feature list (jo abhi live hai)

### Core operations
- **Dashboard** — occupancy %, aaj ke arrivals/departures, revenue, room-status counts
  (available/occupied/cleaning/maintenance/reserved), overstay alerts, "Reserved" card click karke
  detail dikhta hai
- **Calendar tab** — mahine ka view, har din kitni bookings hain, click karke detail
- **Rooms** — CRUD, status management, **occupancy-based 3-tier pricing** (1 guest / 2 guest / extra
  person rate)
- **Bookings** —
  - Real date-based availability check (ek room future ki overlapping dates ke liye double-book nahi
    ho sakta)
  - Co-guests count field, occupancy ke hisaab se rate auto-calculate
  - Advance/deposit tracking, discount, edit dates
  - Check-in/check-out ke time balance-due warning
  - Check-in ke time **ID proof photo capture** (camera + file upload dono options) guest aur
    co-guests ke liye — Supabase Storage (`id-proofs` private bucket) mein save hota hai
  - Checkout ke baad auto-generate hoti hai ek "cleaning" task (Staff tab ki "Housekeeping queue" mein)
  - Past check-in date allowed hai (sirf warning dikhta hai, block nahi karta)
  - Booking creation date ("Booked on") dikhta hai
  - Early check-in (2+ hrs before 12 PM) / late checkout (1+ hr after 11 AM) detect hota hai, optional
    fee jo total mein add hoti hai aur highlighted badge se list mein dikhti hai
  - Date-range filter (check-in date se) aur manual "Booking ID/reference" field jo invoice pe dikhta hai
  - Check-in/check-out modals ab App.jsx level pe hain — Dashboard ke "Arriving/Departing today" cards
    se seedha trigger ho sakte hain
  - Same-day checkout allowed (day-use bookings)
  - Cancel booking (status change, record delete nahi hota) — "no-show" status bhi hai (Night Audit se)
- **Night Audit tab** (owner only) — end-of-day summary with full itemized detail (not just counts):
  arrivals/departures with names, no-show detection + marking, early check-in/late checkout lists,
  revenue-by-mode and expenses-by-category breakdowns, "Run audit" saves a full JSON snapshot so
  history entries can show complete detail later via "View details"
- **Activity log** (owner only) — auto-logs significant actions (cancellations, discounts, deposit
  refunds, staff removal, expenses, no-shows, maintenance tickets); owner sees an unread-count banner
  (tracked via localStorage, not push notifications)
- **Global search** (sidebar) — search guests/bookings/rooms by name/phone/ref/number, clicking a
  result switches tab and highlights + scrolls to that row (`highlightId` prop pattern)
- **Maintenance tickets** (sab dekh sakte hain) — separate from housekeeping tasks; priority levels,
  WhatsApp staff assignment, Open/In Progress/Resolved status
- **Housekeeping checklist** — quick-add standard task chips in Staff tab, or "Assign full checklist"
  for a complete room turnover in one click
- **Staff** — WhatsApp number (phone) primary/required field hai, email optional (sirf app-login ke
  liye). Task assign karte hi WhatsApp automatically khulta hai — popup-blocker-safe (tab pehle khulta
  hai, phir database save hota hai, taaki browser block na kare)
- **Guests** — directory, VIP tag, repeat-guest badge, search, ID-proof view button
- **Billing** — payments (mode: Cash/UPI/Bank/Card/Other), discount, **PDF tax invoice** (GST
  shown as tax-inclusive breakdown — total never inflates, matches what guest actually paid),
  **Send bill via WhatsApp**
- **Inventory** (sab dekh sakte hain) — item catalog (name/price/stock), "Log item used" against
  any active booking — auto-deducts stock AND auto-adds the charge to that guest's bill total
  (`bookings.items_total`, folded into `computeBookingTotal`)
- **Staff** — CRUD, housekeeping tasks, attendance marking, task-notification badge (staff.email se
  login match hota hai)
- **Reports** (sirf `role='owner'` ko dikhta hai) — 15-din/mahine revenue comparison (custom months back),
  Excel export with date range, most-booked-rooms chart
- **Finance** (sirf `role='owner'`, database-level protected via `is_owner()` function) — income vs
  manual expenses (categorized), daily/monthly/yearly cash flow charts, expense breakdown by category
- **Settings** (sirf owner) — hotel name, address, GST number/percent (invoice pe use hota hai)
- **WhatsApp (free, manual-send via wa.me links)** — booking confirmation prompt, billing balance-due
  reminder, staff task assignment message — sab pre-filled, staff khud "Send" dabata hai (real API
  integration nahi hai, uski cost discuss ho chuki hai)

### Security & access
- Real Supabase Auth login (email/password) — koi bhi staff ke liye Authentication → Users mein
  account banao
- Row Level Security (RLS): koi bhi signed-in staff full access (shared operations model), lekin
  Reports/Settings sirf `profiles.role = 'owner'` ko UI mein dikhte hain
- ID-proof photos private Storage bucket mein — sirf logged-in staff access kar sakte hain

### Mobile
- **PWA (installable)** — phone ke home screen pe icon jaisa install ho sakta hai (Android: Chrome
  menu → "Install app"; iPhone: Safari → Share → "Add to Home Screen")
- Responsive layout — chhoti screen pe sidebar horizontal top-bar ban jaati hai

---

## 4. Database schema (Supabase Postgres)

Migrations is order mein chalayi gayi hain (sab already run ho chuki hain live project pe):

1. `supabase-schema.sql` — base tables: `rooms`, `guests`, `bookings`, `payments`, `staff`, `tasks`,
   `attendance` + RLS policies (authenticated = full access)
2. `supabase-schema-v2.sql` — `profiles` table (owner/staff role), `settings` table (hotel info + GST)
3. `supabase-schema-v3.sql` — `staff.email` column (task-notification matching ke liye)
4. `supabase-schema-v4.sql` — occupancy pricing columns on `rooms`
   (`rate_single`, `rate_double`, `rate_extra_person`), `bookings.co_guests_count`,
   `co_guests` table, `guests.id_proof_image_path`, **Storage bucket `id-proofs`** + policies
5. `supabase-schema-v5.sql` — `is_owner()` helper function, `expenses` table (owner-only at DB level),
   `bookings.deposit_status` (held/adjusted/refunded), separate `id_proof_front_path` /
   `id_proof_back_path` on `guests` and `co_guests`
6. `supabase-schema-v6.sql` — `bookings.checked_in_at`/`checked_out_at`, early check-in and late
   checkout flags + fees, `bookings.booking_ref` (manual booking ID shown on invoices)
7. `supabase-schema-v7.sql` — salary expense fields (`expenses.staff_id`, `expenses.salary_period`),
   `night_audits` table, `bookings.cancel_reason`
8. `supabase-schema-v8.sql` — `inventory_items` (catalog), `inventory_usage` (auto stock-deduct +
   auto bill-add when logged against a booking), `bookings.items_total`
9. `supabase-schema-v9.sql` — `night_audits.early_checkins` / `late_checkouts` counts
10. `supabase-schema-v10.sql` — `activity_log` table, `maintenance_tickets` table,
    `night_audits.details` (jsonb full-detail snapshot)
11. `supabase-schema-v11.sql` — `inventory_usage.note` (for self-use/internal entries)

Agar future mein koi naya SQL change ho, isi pattern mein `supabase-schema-v5.sql` banega —
additive rehta hai (purana kabhi nahi todta), `create table if not exists` /
`alter table add column if not exists` style mein.

---

## 5. Project structure (code)

```
manyawar-pms/
├── GUIDE.md                    ← poora deployment + update guide (Hinglish, step-by-step)
├── index.html                  ← PWA meta tags, manifest link
├── package.json
├── vite.config.js
├── icon-source.svg             ← app icon ka source (sharp se PNG banaya)
├── public/
│   ├── manifest.json           ← PWA manifest
│   ├── sw.js                   ← minimal service worker
│   └── icons/                  ← app icons (192, 512, apple-touch)
├── supabase-schema*.sql        ← saari 4 migrations
└── src/
    ├── main.jsx                ← entry point, SW registration
    ├── App.jsx                 ← auth, nav, data loading, task-notification banner
    ├── App.css                 ← poora design system (CSS variables, responsive)
    ├── components.jsx          ← shared UI (Button, Modal, Field, Pill...) + helpers
    │                              (currency, fmtDate, computeRoomRate, isRoomAvailableForDates,
    │                              IdCaptureField)
    ├── supabaseClient.js        ← Supabase client init (env vars se)
    ├── lib/api.js               ← saare Supabase queries (CRUD functions har table ke liye)
    └── pages/
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── Calendar.jsx
        ├── Rooms.jsx
        ├── Bookings.jsx         ← sabse bada file: booking modal, check-in ID capture, edit dates
        ├── Guests.jsx
        ├── Billing.jsx          ← payments, tax invoice + proforma PDFs, print, deposit adjust
        ├── Staff.jsx            ← tasks + attendance + WhatsApp task assign
        ├── Finance.jsx          ← owner-only: income, expenses (with salary tracking), cash flow
        ├── Inventory.jsx        ← item catalog + usage log (auto stock + auto bill)
        ├── NightAudit.jsx       ← end-of-day summary with full detail, no-show marking, history
        ├── Maintenance.jsx      ← repair ticket system (priority, assignment, status)
        ├── Activity.jsx         ← owner-only activity log viewer
        ├── Reports.jsx          ← owner-only revenue + Excel export + charts
        └── Settings.jsx         ← owner-only GST/hotel settings
```

---

## 6. Deploy/update process (jo baar-baar use hota hai)

1. Claude naya/updated code deta hai → **poora zip** milta hai (sirf changed files nahi, safety ke liye
   pura project)
2. Agar SQL migration hai, pehle Supabase → SQL Editor mein Run karo
3. Zip extract karo apne computer pe
4. GitHub repo pe **"Add file" → "Upload files"** → naye folder ki saari files drag-drop → **Commit**
   (GitHub khud purani files replace kar deta hai same naam ki)
5. Vercel automatically detect karke naya build banata hai (1-2 min)
6. Phone pe installed app ho to band karke dobara kholo naya version dekhne ke liye

Poora detail `GUIDE.md` mein hai (usi zip ke andar), including har UPDATE ka apna section.

---

## 7. Jaani-pehchani limitations (honestly documented)

- **ID scan** = photo capture hai, OCR/auto-read nahi (uske liye paid service chahiye hogi)
- **Task notifications** = sirf app khula tab kaam karta hai, real push notification (band app mein
  bhi aaye) ke liye alag paid setup chahiye hoga
- **Play Store** pe nahi hai — PWA hai (install hoke app jaisa dikhta hai, lekin Play Store listing
  nahi hai; TWA wrapper se possible hai future mein agar chahiye)
- **Free tier limits** — Supabase aur Vercel dono free tier pe hain; bahut zyada traffic/data badhne
  par paid plan lena pad sakta hai (abhi ke liye kaafi hai)

---

## 8. Future kaam ke liye is Project ko kaise use karo

Naya Claude Project banao (claude.ai left sidebar → "Projects" → "Create project"), aur:
1. Ye `PROJECT_SUMMARY.md` file "Project knowledge" mein upload kar do
2. Latest code zip bhi upload kar do (ya reference ke liye rakho)
3. Naya kaam maangte waqt bas seedha bata do kya chahiye — Claude ye document padhke context samajh
   jayega, dobara sab explain nahi karna padega

Jab bhi main naya code doon, is summary ko bhi update karke doonga taaki ye document hamesha
"current state" reflect kare.

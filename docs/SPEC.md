# Sufra (سفرة) — Product Spec v0.4

## 1. What Sufra is
A mobile-first, offline app that helps adults on dialysis (and their caregivers) plan what to eat, how to eat, and how to manage daily life — warmly and without judgment.

**Core rule:** Sufra never replaces the care team. Limits for fluid, potassium, phosphorus, sodium and protein come from the user's nephrologist or renal dietitian. If the user doesn't know them yet, Sufra shows general guidance (clearly labelled) and prompts them to ask their team. Sufra never diagnoses or changes treatment.

## 2. Markets, languages, cuisines, customs
- **Countries at launch:** Saudi Arabia, UAE, Qatar, Kuwait, Oman, Iraq, Jordan, Lebanon, Syria, Egypt, Morocco, Algeria, Tunisia, Libya, plus "Another country".
- **Languages:** English, Arabic (Modern Standard Arabic, full right-to-left), French. Arabic digits follow the country (Arabic-Indic in the Mashreq and Gulf, Western digits in North Africa).
- **Cuisines to choose from:** Gulf, Lebanese, Levantine, Egyptian, Iraqi, North African, South Asian, Filipino, Western, East Asian, "A bit of everything".
- **Dish library:** goal **1,000+ home recipes** across all 11 cuisines, built in batches of about 50. Each dish has values per portion, step-by-step cooking and prep-ahead tasks, in English, Arabic and French. Every dish is DRAFT until a renal dietitian reviews it; the most-used dishes are reviewed first.
- **Batch 1 (done):** 30 dishes: Gulf, Levantine (including Lebanese), Egyptian. Next: Maghrebi, Iraqi, then the rest.
- **What you eat:** Halal, Kosher, Vegetarian, Vegan, No dairy, No pork, No beef, No alcohol.
- **Fasting observed:** Ramadan, Orthodox fasts, Coptic fasts, Catholic Lent (including Maronite and Melkite), other Christian fasts, Jewish fast days, Hindu fasting days, other fasting days. The app advises talking to the care team before fasting.
- All of these lists live in `data/options.json`; adding one is a data change.

## 3. Screens (max 4 tabs)
| Tab | One job |
|---|---|
| **Today** | Fluid used vs. limit · one-tap cups · next dialysis session · next meal idea · "Feeling unwell?" |
| **Meals** | Dish library and search · dish page (values, steps, prep-ahead) · create my own dish · "I love…" favourite ingredient · plan a meal (Phase 6) |
| **Track** | Cups, ice cubes, other amounts · today's drinks with remove · last 7 days |
| **Learn** | Lifestyle guides · thirst tips · questions for my care team (Phase 7) |

Settings (language, text size, my cup and ice cube sizes, edit my answers, disclaimer, delete data) opens from the gear icon on Today.

## 4. Key user flows
1. **First open:** language → disclaimer (must accept) → country → dialysis type → days, time, place, center phone → cuisines → food customs and fasting → care-team limits → Today. Every step after the disclaimer can be skipped.
2. **Log a drink:** tap a cup on Today or Track → fluid bar updates → "Undo" for 10 seconds.
3. **Log ice cubes:** Track → − / + count → Add → counted as fluid using the user's measured cube size (or a placeholder labelled "estimate").
4. **Log another amount:** Track → type ml → Add.
5. **Fix a mistake:** Track → today's drinks → remove.
6. **"Can I enjoy this dish?":** search → green/amber/red per nutrient (colour + icon + word) → "How to enjoy it" → "Why this?" shows the source.
7. **Create my own dish:** Meals → "Create a dish" → add ingredients and grams (search the food database) → name it → Sufra calculates values per portion and saves it on the phone. Edit or delete any time.
8. **"I love…":** pick a favourite ingredient (for example chickpeas) → dishes built around it, lowest potassium and phosphorus first → or "Ask for a new idea" (AI helper, needs internet).
9. **Plan a meal and prep ahead:** choose a dish, a day and a time → Sufra lists what to do ahead (soak, thaw, marinate, rise, chill) with the time to start → reminders show on Today → one tap adds each reminder to the phone calendar → cooking mode shows one step at a time with timers.
10. **Plan my day:** "Dialysis day / Non-dialysis day" and fasting days → meals from my cuisines, within my targets.
11. **Before an appointment:** "Questions for my care team" built from my logs → share or print.
12. **Safety (always reachable):** "Feeling unwell?" → urgent symptoms → call local emergency number or the user's dialysis center.

## 5. Evidence rules
- Priority: (1) care-team targets → (2) KDIGO/KDOQI general ranges → (3) food composition tables: ANSES-CIQUAL 2025 (EU), USDA SR28 / FoodData Central, regional tables → (4) NKF/NIDDK patient-education wording.
- **AI recipe helper:** the AI may suggest a dish name, ingredients with grams, and steps. It never supplies nutrient values: Sufra matches each ingredient to the food database and calculates the values itself. Ingredients it cannot match show "No verified data yet". AI dishes are labelled "AI idea · not reviewed". Only the ingredient names and language are sent; no health data, targets or logs leave the phone.
- Cooking tips that affect potassium, phosphorus or sodium (soaking, double-boiling, rinsing) are added only with a published source (Phase 7).
- Every value and tip stores a source and a confidence level (measured / calculated / estimated).
- Nothing medical is generated by AI alone. Missing data shows "No verified data yet — ask your dietitian" and is logged as a content gap.
- Guidance shows "Last reviewed by [renal dietitian], [date]".
- Country emergency numbers are added only after checking official sources (Phase 7).
- Cup and ice cube sizes are measured by the user. Until then, defaults are shown and ice is labelled "estimate".
- Thirst tips wait for the source registry (Phase 5) so each tip carries its source.

## 6. Not in the first version
Photo lookup · caregiver sharing · accounts or cloud sync · push notifications (prep-ahead reminders use the Today screen plus a calendar file instead, so they work offline).

## 7. Data model (stored on the device, key `sufra.v1`)
- **Profile:** lang, size, country, dialysisType, schedule {days, time, place, centerPhone}, cuisines [ids], diet {rules [ids], fasts [ids], allergies}, diabetes, disclaimerAccepted, cups {small, glass, mug, ice5 = ml from 5 melted cubes}.
- **Targets:** fluid, potassium, phosphorus, sodium, protein — each {value or empty, unit, set / unsure, lastUpdated}.
- **Dish:** id, cuisine, tags, names {en, ar, fr}, portion {en, ar, fr}, portionGrams, ingredients [{key, name, source food id, g}], nutrients per portion {value, unit, calc, confidence, sourceId}, fluid (soups), saltAddedG, main [ingredient families], time {prepMin, cookMin, aheadMin}, ahead [{id, leadMin, text, optional}], steps [{text, timer}], tips, gaps, status draft/reviewed, reviewedBy, reviewedOn.
- **Ingredient families:** `data/families.json`, names in en/ar/fr, used for "I love…".
- **My dishes:** same shape as a dish, source "mine" or "ai", stored on the phone only.
- **Meal plan:** {id, dishId, portions, date, time, aheadDone [ids]}.
- **Logs:** fluid {id, time, unitMl, count, ml, container: small / glass / mug / ice / custom}; meal {id, time, dishId, portions}. Soups also add their fluid.
- **Source registry:** id, name, publisher, version, date, link, type, countries.
- **Content gaps:** what was missing, date.
- Older saved answers are upgraded automatically when the app loads.

## 8. Design system
- File: `css/sufra.css` (v1.5). Palette: **Mist blue** (background #F4F6F8, accent #3F5B72, soft fill #DFE8EF). All text passes WCAG AA contrast.
- 18px base text with 3 size steps, 48px+ tap targets, colour + icon + word on every nutrient label, full right-to-left support.

## 9. Folder layout
```
index.html          app shell (loads css and js with ?v=version)
manifest.webmanifest  app name, icon and colours for installing
sw.js               offline copy and update control
/icons              app icon in all sizes
/css/sufra.css      design system
/js/app.js          app logic
/i18n               en.json · ar.json · fr.json
/data/options.json  countries, cuisines, food customs, fasts
/data/sources.json  source registry
/data/families.json ingredient families for "I love…"
/data/dishes/       one file per cuisine (gulf, levantine, egyptian, …)
/data/foods/        ingredient database from CIQUAL + USDA (Phase 6)
/worker/            AI recipe helper (Phase 6b, runs online)
/docs/SPEC.md       this document
```

## 10. Install and updates
- **Install:** the first screen, Today (until "Not now") and Settings offer "Install Sufra as an app". Android and desktop Chrome show the real install prompt; iPhone shows the 2-tap "Add to Home Screen" steps. On iPhone the installed app keeps its own data, so people are told to install first.
- **Icon:** "Sufra tray" (brass tray with three small dishes on mist blue), `icons/`.
- **Offline:** `sw.js` keeps a saved copy of every app file listed in `version.json`, so Sufra works without internet.
- **Updates only when the person chooses:** Sufra looks at `version.json` quietly on start and with Settings → "Check for updates". When a newer version exists it shows "A new version of Sufra is ready · Update now". Only that tap downloads the new files and restarts the app. Closing or reopening the app never changes the version, because `sw.js` itself never changes between releases (the browser would otherwise switch versions on its own).
- **Every release:** run `python3 release.py <version>`. It sets the version in `js/app.js` and `index.html` and writes `version.json` with the list of files. Upload `version.json` last.

## 11. Editing rule (applies to drinks, meals and meal plans)
- Every logged item shows **−  count  +** to remove or add one of the same, **Edit** (time and amount for one) and **Delete** (with Undo for 10 seconds).
- The Track tab has a day bar (**‹ previous day · next day ›**) so any past day can be viewed and changed, up to one year back. No future days.
- Tapping a day in "Last 7 days" opens that day.
- Items store the amount for one, the count and the time, so changing cup sizes later never rewrites history.

## 12. Plan (updated 29 Sep 2026)
| Phase | What | New tools |
|---|---|---|
| 5 | Food data, sources, first 30 dishes with steps and prep-ahead | none |
| 6 ✅ (6.1, 6.2) | Meals tab: library and search, dish page, cooking mode with timers, log a meal (same +/− edit rule, any day), create my own dish, "I love…", plan a meal, prep-ahead on Today + calendar | none |
| 6b | AI recipe helper | a small online helper (Cloudflare Worker), like Zahi Fit |
| 7 | Guides, thirst tips, kidney-friendly cooking tips with sources, questions for my care team, verified emergency numbers | none |
| 8 | Install, offline, accessibility, desktop width | none |
| 9 | Risk list and clinical review pack | none |
| Library | Batches of about 50 dishes alongside phases 6–9 until 1,000+ | none |

## 13. Meal plans and cooking mode (release 6.2, v0.6.3)
- **Plan it** (dish page): day, meal time, portions. Sufra suggests the next lunch (13:00) or dinner (19:00) that leaves enough time for the prep, and warns when prep should already have started.
- **Coming up** (Today): prep tasks due in the next 24 hours (or late) and meals planned for today and tomorrow. Each has **Done** (with Undo) and **Add to calendar**.
- **Calendar app:** the first time, Sufra asks which calendar app the person uses (Android: Samsung, Google, Outlook, other; iPhone: Apple, Google, Outlook) and remembers it (Settings → My calendar app, with "Send a test"). Samsung, Apple, Outlook and other apps receive a calendar file with an alarm, which opens in that app with Save or Add. Google does not let other apps open its app with a new event, so Google opens Google's add-event page; the event then appears in the Google Calendar app.
- **My plan** (Meals): − / + half portions, edit day and time, delete with Undo.
- **Cooking mode:** ingredients checklist, one step at a time in large text, timers (pause, +1 min, reset) that keep running across steps, a sound and vibration when done, and the screen kept awake. The last screen offers "I ate this", which also marks the plan as eaten.


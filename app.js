/* Sufra app v0.6.1 — onboarding, Today, fluid tracker, Meals library and meal log. All data stays on this device. */
"use strict";

const LANGS = ["en", "ar", "fr"];
const LANG_NAMES = { en: "English", ar: "العربية", fr: "Français" };
const KEY = "sufra.v1";
const MAGHREB = ["MA", "DZ", "TN", "LY"];
const STEPS = ["lang", "disc", "country", "type", "sched", "cuis", "diet", "targets", "done"];
const TARGETS = ["fluid", "potassium", "phosphorus", "sodium", "protein"];
const WEEK = [6, 0, 1, 2, 3, 4, 5]; // Saturday first
const LEVEL_NUTS = ["potassium", "phosphorus", "sodium"];
const NUTS = [...LEVEL_NUTS, "protein"];
const DV = { potassium: 4700, phosphorus: 1250, sodium: 2300 }; // US Daily Values (FDA), used only when no care-team limit is saved
const SRC_NAMES = { "usda-sr28": "USDA SR28 (USDA ARS, 2015)", "ciqual-2025": "ANSES-CIQUAL 2025" };

let S = load();
let T = {}, TE = {}, OPT = { countries: [], cuisines: [] }, DISHES = [], FAMS = {};
let view = { name: "loading", step: 0, tab: "today", page: null };
let ice = 2, toastTimer = null, lastRemoved = null;
const CUPS = ["small", "glass", "mug"];
const ICE_EST = 15; // placeholder ml per cube until the user measures their own

/* ---------- storage ---------- */
function tgt(unit) { return { value: null, unit, status: "unsure", lastUpdated: null }; }
function blank() {
  return {
    onboarded: false,
    profile: {
      lang: null, size: 1, country: null, dialysisType: null,
      schedule: { days: [], time: "", place: null, centerPhone: "" },
      cuisines: [], diet: { rules: [], fasts: [], allergies: "" },
      diabetes: null, disclaimerAccepted: null,
      cups: { small: 100, glass: 200, mug: 250, ice5: null } // ice5 = ml from 5 melted cubes
    },
    targets: { fluid: tgt("ml"), potassium: tgt("mg"), phosphorus: tgt("mg"), sodium: tgt("mg"), protein: tgt("g") },
    logs: { fluid: [], meal: [] }
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.profile) {
      const b = blank(), d = s.profile.diet || {};
      if (!Array.isArray(d.rules)) { // upgrade answers saved by v0.3
        s.profile.diet = { rules: [d.halal && "halal", d.vegetarian && "vegetarian"].filter(Boolean), fasts: d.ramadan ? ["ramadan"] : [], allergies: d.allergies || "" };
      }
      const out = { ...b, ...s, profile: { ...b.profile, ...s.profile }, targets: { ...b.targets, ...s.targets } };
      out.logs = { fluid: [], meal: [], ...(s.logs || {}) };
      out.logs.meal = (out.logs.meal || []).filter(x => x && x.dishId && x.per);
      out.logs.fluid = out.logs.fluid.map(x => { const c = x.count || 1; return { ...x, count: c, unitMl: x.unitMl || x.ml / c }; }); // upgrade v0.4 entries
      return out;
    }
  } catch (e) {}
  return blank();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------- language and formatting ---------- */
async function getJSON(url) { try { const r = await fetch(url, { cache: "no-cache" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
function lang() { return S.profile.lang || "en"; }
async function loadLang(l) {
  T = (l === "en" ? TE : await getJSON(`i18n/${l}.json`)) || {};
  const h = document.documentElement;
  h.lang = l; h.dir = l === "ar" ? "rtl" : "ltr";
  h.classList.remove("size-2", "size-3");
  if (S.profile.size > 1) h.classList.add("size-" + S.profile.size);
  document.title = t("app_name");
}
function t(k, v = {}) {
  let s = T[k] ?? TE[k] ?? k;
  for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(b);
  return s;
}
function loc() { return lang() !== "ar" ? lang() : (MAGHREB.includes(S.profile.country) ? "ar-u-nu-latn" : "ar-EG"); }
function num(n) { return new Intl.NumberFormat(loc()).format(n); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function nm(o) { return o.names[lang()] || o.names.en; }
function weekday(d, style = "long") { return new Intl.DateTimeFormat(loc(), { weekday: style }).format(d); }
function clock(d) { return new Intl.DateTimeFormat(loc(), { hour: "numeric", minute: "2-digit" }).format(d); }
function dayOf(i) { const d = new Date(2024, 0, 7 + i); return d; } // 7 Jan 2024 was a Sunday

/* ---------- small helpers ---------- */
function getPath(p) { return p.split(".").reduce((o, k) => o?.[k], S); }
function setPath(p, v) { const ks = p.split("."); const last = ks.pop(); ks.reduce((o, k) => o[k], S)[last] = v; save(); }
function paras(s) { return s.split("\n").map(x => `<p>${esc(x)}</p>`).join(""); }
function radio(field, v, label, hint = "") {
  const on = String(getPath(field)) === String(v);
  return `<button type="button" class="choice" role="radio" aria-checked="${on}" data-act="pick" data-field="${field}" data-v="${esc(v)}"><strong>${esc(label)}</strong>${hint ? `<small>${esc(hint)}</small>` : ""}</button>`;
}
function chip(field, v, label, isNum = false) {
  const on = (getPath(field) || []).includes(isNum ? Number(v) : v);
  return `<button type="button" class="chip" aria-pressed="${on}" data-act="toggle" data-field="${field}" data-v="${esc(v)}"${isNum ? " data-num" : ""}>${esc(label)}</button>`;
}
function sameDay(x, day) { return new Date(x.time).toDateString() === day.toDateString(); }
function fluidOn(day) { return S.logs.fluid.filter(x => sameDay(x, day)); }
function mealsOn(day) { return S.logs.meal.filter(x => sameDay(x, day)); }
function dayDate(off) { const d = new Date(); d.setDate(d.getDate() - off); return d; }
function soupFluid(day) { return Math.round(mealsOn(day).reduce((a, x) => a + (x.per.fluid || 0) * x.count, 0)); }
function fluidTotal(day) { return fluidOn(day).reduce((a, x) => a + (x.ml || 0), 0) + soupFluid(day); }
function fluidToday() { return fluidTotal(new Date()); }
function foodTotals(day) {
  const o = { potassium: 0, phosphorus: 0, sodium: 0, protein: 0 };
  mealsOn(day).forEach(x => NUTS.forEach(k => { o[k] += (x.per[k] || 0) * x.count; }));
  return o;
}
function dayName(off, d = dayDate(off)) {
  if (off === 0) return t("next_today");
  if (off === 1) return t("yesterday");
  return new Intl.DateTimeFormat(loc(), { weekday: "long", day: "numeric", month: "long" }).format(d);
}
function cubeMl() { const v = S.profile.cups.ice5; return v > 0 ? Math.round((v / 5) * 10) / 10 : ICE_EST; }
/* Every logged item follows one rule: + one more, − one less, edit amount and time, delete with Undo, on any day.
   Drinks count in cups (steps of 1); meals count in portions (steps of ½). */
function newId() { return Date.now() + "-" + Math.floor(Math.random() * 1000); }
function whenFor(off) { const d = new Date(); d.setDate(d.getDate() - off); return d; }
function addFluid(unitMl, container, count = 1, off = 0) {
  unitMl = Math.round(unitMl * 10) / 10;
  if (!(unitMl > 0)) return;
  const id = newId(), ml = Math.round(unitMl * count);
  S.logs.fluid.push({ id, time: whenFor(off).toISOString(), unitMl, count, ml, container });
  save(); render(false);
  toast(t("added", { ml: num(ml), unit: t("ml") }), "undo", id);
}
function addMeal(d, portions, off = 0) {
  const per = {};
  NUTS.forEach(k => { per[k] = d.nutrients[k].calc; });
  if (d.fluid) per.fluid = d.fluid.calc;
  const id = newId();
  S.logs.meal.push({ id, time: whenFor(off).toISOString(), dishId: d.id, names: d.names, portion: d.portion, count: portions, per });
  save(); render(false);
  toast(t("logged", { day: dayName(off) }), "undo", id);
}
function listOf(id) { return S.logs.fluid.some(x => x.id === id) ? "fluid" : S.logs.meal.some(x => x.id === id) ? "meal" : null; }
function entry(id) { const l = listOf(id); return l ? S.logs[l].find(x => x.id === id) : null; }
function changeCount(id, dir) {
  const x = entry(id); if (!x) return;
  if (listOf(id) === "meal") x.count = Math.max(0.5, Math.min(20, x.count + dir * 0.5));
  else { x.count = Math.max(1, Math.min(99, x.count + dir)); x.ml = Math.round(x.unitMl * x.count); }
  save(); render(false);
}
function setEntryTime(id, hhmm) {
  const x = entry(id); if (!x || !/^\d\d:\d\d$/.test(hhmm)) return;
  const d = new Date(x.time), [h, m] = hhmm.split(":").map(Number); d.setHours(h, m, 0, 0); x.time = d.toISOString(); save();
}
function setEntryUnit(id, v) {
  const x = entry(id), n = Number(v); if (!x || listOf(id) !== "fluid" || !(n > 0 && n <= 5000)) return;
  x.unitMl = n; x.ml = Math.round(n * x.count); save();
}
function removeEntry(id, withUndo = true) {
  const l = listOf(id); if (!l) return;
  const x = entry(id);
  S.logs[l] = S.logs[l].filter(y => y.id !== id); lastRemoved = { list: l, x }; if (view.edit === id) view.edit = null;
  save(); render(false);
  if (withUndo) toast(t("removed"), "restore", id);
}
function toast(msg, act, undoId) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${act ? `<button type="button" class="btn-link" data-act="${act}" data-v="${esc(undoId)}">${t("undo")}</button>` : ""}`;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 10000);
}
function hideToast() { const el = document.getElementById("toast"); if (el) el.classList.remove("show"); clearTimeout(toastTimer); }
function nextSession() {
  const s = S.profile.schedule;
  if (!s.days.length) return null;
  const now = new Date();
  const [hh, mm] = (s.time || "").split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    if (!s.days.includes(d.getDay())) continue;
    if (s.time) { d.setHours(hh, mm, 0, 0); if (d < now) continue; }
    return { d, offset: i, hasTime: !!s.time };
  }
  return null;
}

/* ---------- icons ---------- */
const ICON = {
  // Colourful duotone icons: soft fill + deeper outline, one colour family per meaning
  gear: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="#E6ECF2" stroke="#5B7389"/><circle cx="12" cy="12" r="2.6" fill="#fff" stroke="#3F5B72"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="#5B7389"/></svg>',
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3F5B72" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="flip"><path d="M15 18l-6-6 6-6"/></svg>',
  fwd: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3F5B72" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="flip"><path d="M9 6l6 6-6 6"/></svg>',
  heart: '<svg width="24" height="24" viewBox="0 0 24 24" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" fill="#F6CFC9" stroke="#B5483C"/></svg>',
  phone: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  today: '<svg width="26" height="26" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.6" fill="#FCE3A0" stroke="#C98414"/><path d="M12 2.3v2.2M12 19.5v2.2M2.3 12h2.2M19.5 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M5.1 18.9l1.6-1.6M17.3 6.7l1.6-1.6" stroke="#E0A93A"/></svg>',
  meals: '<svg width="26" height="26" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18a9 9 0 0 1-18 0z" fill="#FAD9C4" stroke="#C0613A"/><path d="M8.5 7.5c0-1.6 1.6-1.6 1.6-3.5M13.5 7.5c0-1.6 1.6-1.6 1.6-3.5" fill="none" stroke="#E29A74"/></svg>',
  track: '<svg width="26" height="26" viewBox="0 0 24 24" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" fill="#CFE6F7" stroke="#2F77B0"/><path d="M9.3 14.5a2.8 2.8 0 0 0 2.2 2.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  learn: '<svg width="26" height="26" viewBox="0 0 24 24" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" fill="#D5EEDD" stroke="#3B8458"/><path d="M4 21V5M9 7.5h6M9 11h4" fill="none" stroke="#3B8458" stroke-linecap="round"/></svg>',
  small: '<svg width="34" height="34" viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 10h11l-1.2 7.2a2 2 0 0 1-2 1.8H8.7a2 2 0 0 1-2-1.8z" fill="#F5DFC2" stroke="#9A6436"/><path d="M16.5 11.5h1.2a1.8 1.8 0 0 1 0 3.6h-1.6" fill="none" stroke="#9A6436"/><path d="M9 7.5c0-1 1-1 1-2.2M12.5 7.5c0-1 1-1 1-2.2" fill="none" stroke="#C99A6B"/></svg>',
  glass: '<svg width="34" height="34" viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M7.1 11.5h9.8l-.9 8.5H8z" fill="#BFE0F6"/><path d="M6 4h12l-2 16H8z" fill="none" stroke="#2F77B0"/><path d="M7.1 11.5c1.6.8 3.3.8 4.9 0s3.3-.8 4.9 0" fill="none" stroke="#2F77B0"/></svg>',
  mug: '<svg width="34" height="34" viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h11v10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z" fill="#F7D5C2" stroke="#B85A2E"/><path d="M15.5 9.5h1.8a2.3 2.3 0 0 1 0 4.6h-1.8" fill="none" stroke="#B85A2E"/><path d="M4.5 10.5h11" stroke="#D98B63"/></svg>',
  ice: '<svg width="34" height="34" viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4z" fill="#DDF3FA" stroke="#2F8FB0"/><path d="M4 8l8 4 8-4M12 12v8" fill="none" stroke="#2F8FB0"/><path d="M7 9.6l2.5 1.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  custom: '<svg width="34" height="34" viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10l-1 3v12a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V6z" fill="#E4E1F4" stroke="#6A5CA8"/><path d="M8 11h3M8 14h2M8 17h3" stroke="#6A5CA8" stroke-linecap="round"/></svg>',
  pen: '<svg width="22" height="22" viewBox="0 0 24 24" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="#E1EAF1" stroke="#3F5B72"/><path d="M13.5 6.5l4 4" stroke="#3F5B72"/></svg>',
  trash: '<svg width="22" height="22" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7l1 13h10l1-13z" fill="#F6DAD5" stroke="#A4473B"/><path d="M4 7h16M9 7V4h6v3" fill="none" stroke="#A4473B"/></svg>',
  meal: '<svg width="32" height="32" viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="13" rx="9" ry="6" fill="#FBE3D3" stroke="#C0613A"/><ellipse cx="12" cy="12" rx="5.5" ry="3" fill="#F3B48F" stroke="#C0613A"/><path d="M9.5 11.5c.8-.6 1.8-.6 2.6 0M12.5 12.3c.7-.5 1.5-.5 2.1 0" fill="none" stroke="#8C3F1E"/></svg>',
  soup: '<svg width="32" height="32" viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18a9 9 0 0 1-18 0z" fill="#FCE3A0" stroke="#B07A1E"/><path d="M5.5 13.5c2 1 4 1 6.5 0s4.5-1 6.5 0" fill="none" stroke="#D9A43C"/><path d="M9 7.5c0-1.4 1.4-1.4 1.4-3M13.5 7.5c0-1.4 1.4-1.4 1.4-3" fill="none" stroke="#9CC3E0"/></svg>',
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="#FCEBC9" stroke="#B07A1E"/><path d="M12 7.5V12l3 2" fill="none" stroke="#B07A1E"/></svg>',
  timer: '<svg width="18" height="18" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="7.5" fill="#E7F2FB" stroke="#2F77B0"/><path d="M12 9v4M9.5 2.8h5" fill="none" stroke="#2F77B0"/></svg>',
  search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5E6A6E" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5E6A6E" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ---------- onboarding ---------- */
const OB = {
  lang: () => `<h1 tabindex="-1">${LANGS.map(l => esc(({ en: "Choose your language", ar: "اختر لغتك", fr: "Choisissez votre langue" })[l])).join("<br>")}</h1>
    <div class="choices">${LANGS.map(l => `<button type="button" class="choice" role="radio" lang="${l}" aria-checked="${S.profile.lang === l}" data-act="setlang" data-v="${l}"><strong>${LANG_NAMES[l]}</strong></button>`).join("")}</div>`,
  disc: () => `<h1 tabindex="-1">${t("ob_disc_title")}</h1><div class="card">${paras(t("ob_disc_body"))}</div>`,
  country: () => `<h1 tabindex="-1">${t("ob_country_title")}</h1><p class="muted">${t("ob_country_hint")}</p>
    <div class="choices two" role="radiogroup">${OPT.countries.map(c => radio("profile.country", c.id, nm(c))).join("")}</div>`,
  type: () => `<h1 tabindex="-1">${t("ob_type_title")}</h1>
    <div class="choices" role="radiogroup">${radio("profile.dialysisType", "hemodialysis", t("type_hd"), t("type_hd_hint"))}${radio("profile.dialysisType", "peritoneal", t("type_pd"), t("type_pd_hint"))}${radio("profile.dialysisType", "unsure", t("type_unsure"))}</div>`,
  sched: () => `<h1 tabindex="-1">${t("ob_sched_title")}</h1><p class="muted">${t("ob_sched_hint")}</p>
    <div class="chips">${WEEK.map(d => chip("profile.schedule.days", d, weekday(dayOf(d)), true)).join("")}</div>
    <label class="field" for="f-time">${t("sched_time")}</label>
    <input id="f-time" type="time" data-field="profile.schedule.time" value="${esc(S.profile.schedule.time)}">
    <p class="field">${t("sched_place")}</p>
    <div class="choices two" role="radiogroup">${radio("profile.schedule.place", "center", t("place_center"))}${radio("profile.schedule.place", "home", t("place_home"))}</div>
    <label class="field" for="f-phone">${t("center_phone")}</label>
    <input id="f-phone" type="tel" dir="ltr" autocomplete="off" data-field="profile.schedule.centerPhone" value="${esc(S.profile.schedule.centerPhone)}">`,
  cuis: () => `<h1 tabindex="-1">${t("ob_cuis_title")}</h1><p class="muted">${t("ob_cuis_hint")}</p>
    <div class="chips">${OPT.cuisines.map(c => chip("profile.cuisines", c.id, nm(c))).join("")}</div>`,
  diet: () => `<h1 tabindex="-1">${t("ob_diet_title")}</h1><p class="muted">${t("ob_diet_hint")}</p>
    <h2 class="field">${t("ob_diet_eat")}</h2>
    <div class="chips">${(OPT.diets || []).map(o => chip("profile.diet.rules", o.id, nm(o))).join("")}</div>
    <h2 class="field">${t("ob_diet_fast")}</h2>
    <p class="muted">${t("ob_diet_fast_hint")}</p>
    <div class="chips">${(OPT.fasts || []).map(o => chip("profile.diet.fasts", o.id, nm(o))).join("")}</div>
    <label class="field" for="f-all">${t("allergies")}</label>
    <input id="f-all" type="text" data-field="profile.diet.allergies" placeholder="${esc(t("allergies_ph"))}" value="${esc(S.profile.diet.allergies)}">`,
  targets: () => `<h1 tabindex="-1">${t("ob_targets_title")}</h1><p class="muted">${t("ob_targets_hint")}</p>
    ${TARGETS.map(k => { const g = S.targets[k]; return `<label class="field" for="t-${k}">${t("t_" + k)}</label>
      <div class="unit-input"><input id="t-${k}" type="number" inputmode="numeric" min="0" dir="ltr" data-field="targets.${k}" data-target placeholder="${esc(t("not_sure"))}" value="${g.value ?? ""}"><span>${t(g.unit)}</span></div>`; }).join("")}
    <p class="field">${t("diabetes")}</p>
    <div class="choices two" role="radiogroup">${radio("profile.diabetes", "yes", t("yes"))}${radio("profile.diabetes", "no", t("no"))}${radio("profile.diabetes", "unsure", t("not_sure"))}</div>`,
  done: () => `<h1 tabindex="-1">${t("ob_done_title")}</h1><p>${t("ob_done_body")}</p>`
};
function renderOb() {
  const st = STEPS[view.step], n = view.step + 1, total = STEPS.length;
  const canSkip = !["lang", "disc", "done"].includes(st);
  let main;
  if (st === "lang") main = `<button type="button" class="btn btn-primary" data-act="next"${S.profile.lang ? "" : " disabled"}>${t("next")}</button>`;
  else if (st === "disc") main = `<button type="button" class="btn btn-primary" data-act="accept">${t("ob_disc_accept")}</button>`;
  else if (st === "done") main = `<button type="button" class="btn btn-primary" data-act="finish">${t("start")}</button>`;
  else main = `<button type="button" class="btn btn-primary" data-act="next">${t("next")}</button>`;
  return `<div class="ob">
    <p class="muted">${t("step", { n: num(n), total: num(total) })}</p>
    <div class="progress" aria-hidden="true"><span style="width:${(n / total) * 100}%"></span></div>
    ${OB[st]()}
    <div class="ob-nav">${view.step > 0 ? `<button type="button" class="btn btn-secondary" data-act="back">${t("back")}</button>` : ""}${main}</div>
    ${canSkip ? `<p class="center"><button type="button" class="btn btn-link" data-act="next">${t("skip")}</button></p>` : ""}
  </div>`;
}

/* ---------- main app ---------- */
function ib(k) { return `<span class="ib ib-${k}">${ICON[k] || ICON.custom}</span>`; } // icon on a soft coloured tile
function cupButtons() {
  return `<div class="cups">${CUPS.map(k => `<button type="button" class="btn cup" data-act="addcup" data-v="${k}">${ib(k)}<span>${t("cup_" + k)}</span><span class="muted">${num(S.profile.cups[k])} ${t("ml")}</span></button>`).join("")}</div>`;
}
function fluidSummary(off = 0) {
  const used = fluidTotal(dayDate(off)), f = S.targets.fluid, u = t("ml");
  const lim = f.status === "set" ? f.value : null;
  let fluid;
  if (lim) {
    const pct = Math.min(100, Math.round((used / lim) * 100));
    const left = lim - used;
    fluid = `<div class="bar" role="img" aria-label="${esc(t("fluid_aria", { used: num(used), limit: num(lim) }))}"><span style="width:${pct}%"></span></div>
      <p class="big">${t("fluid_of", { used: num(used), limit: num(lim), unit: u })}</p>
      ${off ? "" : `<p class="muted">${left >= 0 ? t("fluid_left", { left: num(left), unit: u }) : t("fluid_over", { over: num(-left), unit: u })}</p>`}`;
  } else {
    fluid = `<p class="big">${t(off ? "week_total" : "fluid_used", { used: num(used), unit: u })}</p>${off ? "" : `<p class="muted">${t("fluid_nolimit")}</p>`}`;
  }
  const sf = soupFluid(dayDate(off));
  return fluid + (sf ? `<p class="muted small">${t("from_soups", { ml: num(sf), unit: u })}</p>` : "");
}
function renderToday() {
  const ns = nextSession();
  let next = `<p class="muted">${t("next_none")}</p>`;
  if (ns) {
    const day = ns.offset === 0 ? t("next_today") : ns.offset === 1 ? t("next_tomorrow") : weekday(ns.d);
    const sep = lang() === "ar" ? "، " : ", ";
    const place = S.profile.schedule.place;
    next = `<p class="big">${esc(day)}${ns.hasTime ? sep + clock(ns.d) : ""}</p>${place ? `<p class="muted">${t("place_" + place)}</p>` : ""}`;
  }
  const cz = OPT.cuisines.filter(c => S.profile.cuisines.includes(c.id)), idea = ideaFor();
  return `<div class="head"><h1 tabindex="-1">${t("today")}</h1>
      <button type="button" class="icon-btn" data-act="page" data-v="settings" aria-label="${esc(t("settings"))}">${ICON.gear}</button></div>
    <p class="muted">${esc(new Intl.DateTimeFormat(loc(), { weekday: "long", day: "numeric", month: "long" }).format(new Date()))}</p>
    <section class="card" aria-labelledby="h-fluid"><h2 id="h-fluid" class="card-title">${t("fluid_title")}</h2>${fluidSummary()}</section>
    ${cupButtons()}
    <button type="button" class="btn btn-secondary wide" data-act="tab" data-v="track">${ib("ice")}<span>${t("more_options")}</span></button>
    <section class="card" aria-labelledby="h-next"><h2 id="h-next" class="card-title">${t("next_title")}</h2>${next}</section>
    <section class="card" aria-labelledby="h-meal"><h2 id="h-meal" class="card-title">${t("meal_title")}</h2>
      ${idea ? `<button type="button" class="rowbtn" data-act="dish" data-v="${esc(idea.id)}">${ib(idea.fluid ? "soup" : "meal")}<span class="grow"><strong class="big">${esc(dname(idea))}</strong><span class="badges">${LEVEL_NUTS.map(k => badge(k, idea.nutrients[k].calc)).join("")}</span></span>${ICON.fwd}</button>
        <p class="muted small" style="margin-top:.4rem">${t(cz.length ? "idea_hint" : "idea_hint_all")}</p>` : `<p class="muted">${t("meal_soon")}</p>`}
      <button type="button" class="btn btn-secondary wide" data-act="tab" data-v="meals">${t("see_all")}</button></section>
    <button type="button" class="btn btn-unwell" data-act="page" data-v="unwell">${ICON.heart}<span>${t("unwell_link")}</span></button>`;
}
function renderUnwell() {
  const ph = S.profile.schedule.centerPhone.trim();
  return `${pageHead(t("unwell_title"))}
    <div class="alert" role="note"><p><strong>${t("unwell_urgent")}</strong></p></div>
    <div class="card"><p>${t("unwell_missed")}</p>
    ${ph ? `<a class="btn btn-primary" href="tel:${esc(ph.replace(/[^\d+]/g, ""))}">${ICON.phone}<span>${t("call_center")}</span></a>` : ""}</div>`;
}
function renderSettings() {
  const p = S.profile;
  return `${pageHead(t("settings"))}
    <p class="field">${t("s_lang")}</p>
    <div class="seg" role="group" aria-label="${esc(t("s_lang"))}">${LANGS.map(l => `<button type="button" lang="${l}" aria-pressed="${lang() === l}" data-act="setlang" data-v="${l}">${LANG_NAMES[l]}</button>`).join("")}</div>
    <p class="field">${t("s_size")}</p>
    <div class="seg" role="group" aria-label="${esc(t("s_size"))}">${[1, 2, 3].map(n => `<button type="button" aria-pressed="${p.size === n}" data-act="size" data-v="${n}" style="font-size:${1 + (n - 1) * 0.15}em">A</button>`).join("")}</div>
    <h2>${t("s_cups")}</h2>
    <p class="muted">${t("s_cups_hint")}</p>
    ${CUPS.map(k => `<label class="field" for="c-${k}">${t("cup_" + k)}</label>
      <div class="unit-input"><input id="c-${k}" type="number" inputmode="numeric" min="1" dir="ltr" data-field="profile.cups.${k}" data-num value="${p.cups[k]}"><span>${t("ml")}</span></div>`).join("")}
    <label class="field" for="c-ice">${t("s_ice5")}</label>
    <div class="unit-input"><input id="c-ice" type="number" inputmode="numeric" min="1" dir="ltr" data-field="profile.cups.ice5" data-num value="${p.cups.ice5 ?? ""}"><span>${t("ml")}</span></div>
    <p class="muted" id="ice-result" aria-live="polite">${p.cups.ice5 > 0 ? t("s_ice_result", { ml: num(cubeMl()), unit: t("ml") }) : ""}</p>
    <div class="stack">
      <button type="button" class="btn btn-secondary" data-act="edit">${t("s_edit")}</button>
      <button type="button" class="btn btn-secondary" data-act="page" data-v="disclaimer">${t("s_disc")}</button>
      <button type="button" class="btn btn-danger" data-act="delete">${t("s_delete")}</button>
    </div>
    <p class="muted">${t("s_private")}</p>`;
}
function renderDisclaimer() { return `${pageHead(t("ob_disc_title"))}<div class="card">${paras(t("ob_disc_body"))}</div>`; }
function pageHead(title) {
  return `<div class="head"><button type="button" class="icon-btn" data-act="page" data-v="" aria-label="${esc(t("back"))}">${ICON.back}</button>
    <h1 tabindex="-1" class="grow">${esc(title)}</h1></div>`;
}
function entryLabel(x) { return x.container === "ice" ? t("ice_title") : t("cup_" + x.container); }
function entryRow(x) {
  const u = t("ml"), what = entryLabel(x), open = view.edit === x.id;
  const hhmm = new Date(x.time).toTimeString().slice(0, 5);
  return `<li class="entry">
    <div class="entry-top">${ib(x.container)}
      <span class="grow"><strong>${esc(what)}</strong><br><span class="muted">${esc(clock(new Date(x.time)))}</span></span>
      <strong class="big">${num(x.ml)} ${u}</strong></div>
    <div class="entry-actions">
      <div class="stepper sm">
        <button type="button" data-act="less" data-v="${esc(x.id)}" aria-label="${esc(t("less_aria", { what }))}"${x.count <= 1 ? " disabled" : ""}>−</button>
        <output aria-live="polite">${num(x.count)}</output>
        <button type="button" data-act="more" data-v="${esc(x.id)}" aria-label="${esc(t("more_aria", { what }))}">+</button>
      </div>
      <span class="grow"></span>
      <button type="button" class="icon-btn small-btn" data-act="editlog" data-v="${esc(x.id)}" aria-expanded="${open}" aria-label="${esc(t("edit_aria", { what }))}">${ICON.pen}</button>
      <button type="button" class="icon-btn small-btn" data-act="rmlog" data-v="${esc(x.id)}" aria-label="${esc(t("remove_aria", { what: what + " " + num(x.ml) + " " + u }))}">${ICON.trash}</button>
    </div>
    ${open ? `<div class="entry-edit">
      <label class="field" for="e-time">${t("time")}</label>
      <input id="e-time" type="time" data-entry-time="${esc(x.id)}" value="${hhmm}">
      <label class="field" for="e-unit">${t("amount_each")}</label>
      <div class="unit-input"><input id="e-unit" type="number" inputmode="numeric" min="1" dir="ltr" data-entry-unit="${esc(x.id)}" value="${x.unitMl}"><span>${u}</span></div>
      <button type="button" class="btn btn-primary" style="margin-top:.75rem" data-act="editdone">${t("done")}</button>
    </div>` : ""}
  </li>`;
}
function renderTrack() {
  const u = t("ml"), cm = cubeMl(), measured = S.profile.cups.ice5 > 0, off = view.day || 0;
  const list = fluidOn(dayDate(off)).slice().sort((a, b) => new Date(b.time) - new Date(a.time));
  const lim = S.targets.fluid.status === "set" ? S.targets.fluid.value : null;
  const seg = view.seg || "drinks";
  const head = `<h1 tabindex="-1">${t("tab_track")}</h1>
    <div class="seg two" role="group" aria-label="${esc(t("tab_track"))}">
      <button type="button" aria-pressed="${seg === "drinks"}" data-act="seg" data-v="drinks">${ib("glass")}<span>${t("seg_drinks")}</span></button>
      <button type="button" aria-pressed="${seg === "food"}" data-act="seg" data-v="food">${ib("meal")}<span>${t("seg_food")}</span></button>
    </div>
    <div class="daynav">
      <button type="button" class="icon-btn" data-act="dayprev" aria-label="${esc(t("day_prev"))}"${off >= 365 ? " disabled" : ""}>${ICON.back}</button>
      <strong class="grow center" aria-live="polite">${esc(dayName(off))}</strong>
      <button type="button" class="icon-btn" data-act="daynext" aria-label="${esc(t("day_next"))}"${off === 0 ? " disabled" : ""}>${ICON.fwd}</button>
    </div>`;
  if (seg === "food") return head + renderFood(off);
  return head + `<section class="card" aria-labelledby="h-fl"><h2 id="h-fl" class="card-title">${t("fluid_title")}</h2>${fluidSummary(off)}</section>
    <h2>${off ? t("day_list") : t("today_list")}</h2>
    ${list.length ? `<ul class="log entries">${list.map(entryRow).join("")}</ul>` : `<p class="muted">${t(off ? "none_day" : "none_yet")}</p>`}
    <h2>${t("add_drink")}</h2>
    ${cupButtons()}
    <section class="card" aria-labelledby="h-ice">
      <div class="row" style="justify-content:space-between">
        <div class="row">${ib("ice")}
          <div><h3 id="h-ice" class="big" style="margin:0">${t("ice_title")}</h3>
          <div class="muted">${t(measured ? "ice_measured" : "ice_est", { ml: num(Math.round(ice * cm)), unit: u })}</div></div></div>
        <div class="stepper">
          <button type="button" data-act="iceminus" aria-label="${esc(t("ice_less"))}"${ice <= 1 ? " disabled" : ""}>−</button>
          <output aria-live="polite">${num(ice)}</output>
          <button type="button" data-act="iceplus" aria-label="${esc(t("ice_more"))}">+</button>
        </div>
      </div>
      <button type="button" class="btn btn-primary" style="margin-top:.75rem" data-act="addice">${t("ice_add")}</button>
      ${measured ? "" : `<p class="muted small" style="margin-top:.5rem">${t("ice_tip")}</p>`}
    </section>
    <section class="card" aria-labelledby="h-cust"><div class="row" style="margin-bottom:.4rem">${ib("custom")}<h3 id="h-cust" class="big" style="margin:0">${t("custom_title")}</h3></div>
      <div class="unit-input wrap"><input id="f-custom" type="number" inputmode="numeric" min="1" dir="ltr" aria-labelledby="h-cust" placeholder="${esc(t("custom_ph"))}"><span>${u}</span>
      <button type="button" class="btn btn-secondary" data-act="addcustom">${t("add")}</button></div>
    </section>
    <h2>${t("week_title")}</h2>
    <p class="muted">${t("week_hint")}</p>
    <ul class="log">${[...Array(7)].map((_, i) => { const tot = fluidTotal(dayDate(i));
      return `<li><button type="button" class="rowbtn" data-act="gotoday" data-v="${i}"${i === off ? ' aria-current="date"' : ""}><span class="grow">${esc(dayName(i))}</span>
      <strong>${lim ? t("week_of", { used: num(tot), limit: num(lim), unit: u }) : `${num(tot)} ${u}`}</strong></button></li>`; }).join("")}</ul>`;
}
/* ---------- meals ---------- */
function dname(d) { return (d.names && (d.names[lang()] || d.names.en)) || ""; }
function dish(id) { return DISHES.find(d => d.id === id); }
function limitFor(k) { const g = S.targets[k]; return g && g.status === "set" && g.value > 0 ? g.value : null; }
function level(k, v) { // 5% or less of the daily reference = low, 20% or more = high (FDA %DV rule)
  const ref = limitFor(k) || DV[k], pct = (v / ref) * 100;
  const c = pct <= 5 ? "low" : pct >= 20 ? "high" : "mid";
  return { c, word: t("lvl_" + c), glyph: { low: "○", mid: "◐", high: "●" }[c] };
}
function badge(k, v, withName = true) {
  const L = level(k, v);
  return `<span class="badge ${L.c}"><span aria-hidden="true">${L.glyph}</span>${withName ? esc(t("n_" + k)) + ": " : ""}${esc(L.word)}</span>`;
}
function portionNum(n) { return num(n); }
function allowed(d) { // follows "What you eat" from onboarding
  const r = S.profile.diet.rules || [], c = d.contains || [];
  if ((r.includes("vegetarian") || r.includes("vegan")) && (c.includes("meat") || c.includes("fish"))) return false;
  if (r.includes("vegan") && (c.includes("dairy") || c.includes("egg") || c.includes("honey"))) return false;
  if (r.includes("no_dairy") && c.includes("dairy")) return false;
  if (r.includes("no_beef") && c.includes("beef")) return false;
  if (r.includes("kosher") && c.includes("meat_dairy")) return false;
  return true;
}
function cuisineOf(d) { return OPT.cuisines.find(c => c.id === d.cuisine); }
function inCuisine(d, id) { return d.cuisine === id || (d.tags || []).includes(id); }
function mine(d) { return S.profile.cuisines.some(c => inCuisine(d, c)); }
function dishList() {
  const q = (view.q || "").trim().toLowerCase();
  let list = DISHES.filter(allowed);
  if (view.cui && view.cui !== "all") list = list.filter(d => inCuisine(d, view.cui));
  if (view.fam) list = list.filter(d => (d.main || []).includes(view.fam));
  if (q) list = list.filter(d => Object.values(d.names).some(n => n.toLowerCase().includes(q)) ||
    (d.ingredients || []).some(i => Object.values(i.names || {}).some(n => n.toLowerCase().includes(q))));
  return list.sort((a, b) => (mine(b) - mine(a)) || dname(a).localeCompare(dname(b), lang()));
}
function dishRow(d) {
  const cu = cuisineOf(d);
  return `<li><button type="button" class="rowbtn dishrow" data-act="dish" data-v="${esc(d.id)}">
    ${ib(d.fluid ? "soup" : "meal")}
    <span class="grow"><strong>${esc(dname(d))}</strong>
      <span class="muted small block">${esc(d.portion[lang()] || d.portion.en)}${cu ? " · " + esc(nm(cu)) : ""}${d.time.aheadMin >= 600 ? " · " + esc(t("ahead_night_short")) : ""}</span>
      <span class="badges">${LEVEL_NUTS.map(k => badge(k, d.nutrients[k].calc)).join("")}</span></span>
    ${ICON.fwd}</button></li>`;
}
function renderDishList() {
  const list = dishList();
  return list.length ? `<p class="muted small">${t("n_dishes", { n: num(list.length) })}</p><ul class="log dishes">${list.map(dishRow).join("")}</ul>`
    : `<p class="muted">${t("no_dishes")}</p>`;
}
function renderMeals() {
  const avail = OPT.cuisines.filter(c => DISHES.some(d => inCuisine(d, c.id)));
  const fams = Object.keys(FAMS).filter(f => DISHES.some(d => allowed(d) && (d.main || []).includes(f)));
  const hidden = DISHES.some(d => !allowed(d));
  const off = view.logDay || 0;
  return `<h1 tabindex="-1">${t("tab_meals")}</h1>
    ${off ? `<div class="note-bar" role="status">${ICON.clock}<span class="grow">${t("adding_to", { day: esc(dayName(off)) })}</span><button type="button" class="btn-link" data-act="logday0">${t("next_today")}</button></div>` : ""}
    <div class="search">${ICON.search}<input id="f-q" type="search" autocomplete="off" aria-label="${esc(t("search_ph"))}" placeholder="${esc(t("search_ph"))}" value="${esc(view.q || "")}"></div>
    <div class="chips scroll" role="group" aria-label="${esc(t("ob_cuis_title"))}">
      <button type="button" class="chip" aria-pressed="${!view.cui || view.cui === "all"}" data-act="cui" data-v="all">${t("cui_all")}</button>
      ${avail.map(c => `<button type="button" class="chip" aria-pressed="${view.cui === c.id}" data-act="cui" data-v="${c.id}">${esc(nm(c))}</button>`).join("")}
    </div>
    <h2>${t("love_title")}</h2>
    <p class="muted small">${t("love_hint")}</p>
    <div class="chips scroll" role="group" aria-label="${esc(t("love_title"))}">
      ${fams.map(f => `<button type="button" class="chip" aria-pressed="${view.fam === f}" data-act="fam" data-v="${f}">${esc(FAMS[f][lang()] || FAMS[f].en)}</button>`).join("")}
    </div>
    ${hidden ? `<p class="muted small">${t("diet_note")}</p>` : ""}
    <div id="dish-list">${renderDishList()}</div>`;
}
function grams(g) { return g >= 10 ? num(Math.round(g / 5) * 5) : num(Math.round(g * 10) / 10); }
function leadText(m) {
  if (m >= 600) return t("ahead_night");
  if (m >= 60) { const h = Math.round(m / 30) / 2; return h === 1 ? t("ahead_1h") : t("ahead_h", { h: num(h) }); }
  return t("ahead_m", { m: num(m) });
}
function renderDish() {
  const d = dish(view.dish);
  if (!d) return `${pageHead(t("tab_meals"))}<p class="muted">${t("no_dishes")}</p>`;
  const n = view.portions || 1, L = lang(), off = view.logDay || 0, u = t("ml");
  const cu = cuisineOf(d), nT = LEVEL_NUTS.filter(limitFor).length;
  const rows = NUTS.map(k => {
    const v = Math.round(d.nutrients[k].calc * n), unit = t(d.nutrients[k].unit);
    const shown = k === "protein" ? num(Math.round(d.nutrients[k].calc * n)) : num(v >= 140 ? Math.round(v / 10) * 10 : Math.round(v / 5) * 5);
    const lim = limitFor(k);
    const extra = k === "protein" ? (lim ? `<span class="muted small">${t("of_target", { pct: num(Math.round((d.nutrients[k].calc * n / lim) * 100)) })}</span>` : "")
      : `<span class="nut-right">${badge(k, d.nutrients[k].calc * n, false)}${lim ? `<span class="muted small">${t("of_limit", { pct: num(Math.round((d.nutrients[k].calc * n / lim) * 100)) })}</span>` : ""}</span>`;
    return `<div class="nut"><span><strong>${esc(t("n_" + k))}</strong><br><span class="big">${shown} ${unit}</span></span>${extra}</div>`;
  }).join("");
  const fl = d.fluid ? `<div class="nut"><span><strong>${t("n_fluid")}</strong><br><span class="big">≈ ${num(Math.round(d.fluid.calc * n / 10) * 10)} ${u}</span></span><span class="muted small">${t("fluid_counts")}</span></div>` : "";
  const ing = d.ingredients.filter(i => i.key !== "water").map(i => `<li><span class="grow">${esc((i.names && i.names[L]) || i.name)}${i.key === "salt" ? ` <span class="muted">${t("salt_taste")}</span>` : ""}</span><strong>${grams(i.g * n)} ${t("g")}</strong></li>`).join("");
  const water = d.ingredients.find(i => i.key === "water");
  const ahead = d.ahead.length ? `<ul class="log">${d.ahead.map(a => `<li>${ICON.clock}<span class="grow"><strong>${esc(leadText(a.leadMin))}</strong>${a.optional ? ` <span class="muted">(${t("if_needed")})</span>` : ""}<br>${esc(a.text[L] || a.text.en)}</span></li>`).join("")}</ul>`
    : `<p class="muted">${t("ahead_none")}</p>`;
  const steps = `<ol class="steps">${d.steps.map(x => `<li><span>${esc(x.text[L] || x.text.en)}</span>${x.timer ? `<span class="tag timer">${ICON.timer}${t("timer_min", { m: num(Math.round(x.timer / 60)) })}</span>` : ""}</li>`).join("")}</ol>`;
  const src = SRC_NAMES[d.nutrients.potassium.sourceId] || d.nutrients.potassium.sourceId;
  return `${pageHead(dname(d))}
    <p class="muted">${esc(d.portion[L] || d.portion.en)}${cu ? " · " + esc(nm(cu)) : ""}</p>
    <p class="muted small">${t("time_line", { p: num(d.time.prepMin), c: num(d.time.cookMin) })}</p>
    <p class="draft-tag">${t("draft")}</p>
    <section class="card" aria-labelledby="h-val">
      <div class="row" style="justify-content:space-between">
        <h2 id="h-val" class="card-title" style="margin:0">${t("portions")}</h2>
        <div class="stepper sm">
          <button type="button" data-act="pless" aria-label="${esc(t("less_aria", { what: t("portions") }))}"${n <= 0.5 ? " disabled" : ""}>−</button>
          <output aria-live="polite">${portionNum(n)}</output>
          <button type="button" data-act="pmore" aria-label="${esc(t("more_aria", { what: t("portions") }))}"${n >= 10 ? " disabled" : ""}>+</button>
        </div>
      </div>
      ${rows}${fl}
      <p class="muted small" style="margin-top:.6rem">${t(nT === LEVEL_NUTS.length ? "basis_target" : nT ? "basis_mixed" : "basis_dv")}</p>
    </section>
    ${d.note ? `<div class="note-bar">${esc(d.note[L] || d.note.en)}</div>` : ""}
    ${d.saltAddedG ? `<p class="muted small">${t("salt_added", { g: num(Math.round(d.saltAddedG * n * 10) / 10) })}</p>` : ""}
    <button type="button" class="btn btn-primary wide" data-act="ate">${off ? t("ate_on", { day: esc(dayName(off)) }) : t("ate")}</button>
    <h2>${t("ahead_title")}</h2>${ahead}
    <h2>${t("ingredients")}</h2>
    <p class="muted small">${n === 1 ? t("for_portion_1") : t("for_portions", { n: portionNum(n) })}</p>
    <ul class="log ing">${ing}</ul>
    ${water ? `<p class="muted small">${t("water_note", { ml: grams(water.g * n) })}</p>` : ""}
    <h2>${t("steps_title")}</h2>${steps}
    <section class="card" aria-labelledby="h-src"><h2 id="h-src" class="card-title">${t("source_title")}</h2>
      <p class="small">${t(d.method === "direct" ? "source_direct" : "source_recipe", { src: esc(src) })}</p>
      <p class="small muted">${t("reviewed_no")}</p></section>`;
}
function mealLabel(x) { return (x.names && (x.names[lang()] || x.names.en)) || ""; }
function mealRow(x) {
  const what = mealLabel(x), open = view.edit === x.id;
  const hhmm = new Date(x.time).toTimeString().slice(0, 5);
  return `<li class="entry">
    <div class="entry-top">${ib(x.per.fluid ? "soup" : "meal")}
      <span class="grow"><strong>${esc(what)}</strong><br><span class="muted">${esc(clock(new Date(x.time)))}</span></span>
      <span class="small muted" style="text-align:end">${t("n_potassium")} ${num(Math.round(x.per.potassium * x.count))} ${t("mg")}<br>${t("n_sodium")} ${num(Math.round(x.per.sodium * x.count))} ${t("mg")}</span></div>
    <div class="entry-actions">
      <div class="stepper sm">
        <button type="button" data-act="less" data-v="${esc(x.id)}" aria-label="${esc(t("less_half_aria", { what }))}"${x.count <= 0.5 ? " disabled" : ""}>−</button>
        <output aria-live="polite" aria-label="${esc(t("portions"))}">${portionNum(x.count)}</output>
        <button type="button" data-act="more" data-v="${esc(x.id)}" aria-label="${esc(t("more_half_aria", { what }))}">+</button>
      </div>
      <span class="muted small">${t("portions")}</span>
      <span class="grow"></span>
      <button type="button" class="icon-btn small-btn" data-act="editlog" data-v="${esc(x.id)}" aria-expanded="${open}" aria-label="${esc(t("edit_aria", { what }))}">${ICON.pen}</button>
      <button type="button" class="icon-btn small-btn" data-act="rmlog" data-v="${esc(x.id)}" aria-label="${esc(t("remove_aria", { what }))}">${ICON.trash}</button>
    </div>
    ${open ? `<div class="entry-edit">
      <label class="field" for="e-time">${t("time")}</label>
      <input id="e-time" type="time" data-entry-time="${esc(x.id)}" value="${hhmm}">
      <button type="button" class="btn btn-secondary" style="margin-top:.75rem" data-act="dish" data-v="${esc(x.dishId)}">${t("see_dish")}</button>
      <button type="button" class="btn btn-primary" style="margin-top:.75rem" data-act="editdone">${t("done")}</button>
    </div>` : ""}
  </li>`;
}
function foodSummary(off) {
  const tot = foodTotals(dayDate(off)), sf = soupFluid(dayDate(off));
  return NUTS.map(k => {
    const lim = limitFor(k), v = Math.round(tot[k]), unit = t(k === "protein" ? "g" : "mg");
    return `<div class="nut"><strong>${t("n_" + k)}</strong><span>${lim ? t("week_of", { used: num(v), limit: num(lim), unit }) : `${num(v)} ${unit}`}</span></div>
      ${lim ? `<div class="bar thin" aria-hidden="true"><span style="width:${Math.min(100, Math.round((v / lim) * 100))}%"></span></div>` : ""}`;
  }).join("") + (sf ? `<p class="muted small" style="margin-top:.5rem">${t("from_soups", { ml: num(sf), unit: t("ml") })}</p>` : "");
}
function renderFood(off) {
  const list = mealsOn(dayDate(off)).slice().sort((a, b) => new Date(b.time) - new Date(a.time));
  return `<section class="card" aria-labelledby="h-food"><h2 id="h-food" class="card-title">${t(off ? "food_day" : "food_today")}</h2>${foodSummary(off)}</section>
    <h2>${t(off ? "meals_day" : "meals_today")}</h2>
    ${list.length ? `<ul class="log entries">${list.map(mealRow).join("")}</ul>` : `<p class="muted">${t(off ? "none_food_day" : "none_food")}</p>`}
    <button type="button" class="btn btn-primary wide" data-act="addfood">${ib("meal")}<span>${t("add_food")}</span></button>`;
}
function ideaFor(date = new Date()) {
  let list = DISHES.filter(allowed);
  const m = list.filter(mine); if (m.length) list = m;
  if (!list.length) return null;
  const k = Math.floor(date.getTime() / 864e5);
  return list[k % list.length];
}
function renderSoon() { return `<h1 tabindex="-1">${t("tab_" + view.tab)}</h1><div class="card"><p>${t("soon")}</p></div>`; }
function tabs() {
  return `<nav class="tabs" aria-label="${esc(t("tabs_aria"))}">${["today", "meals", "track", "learn"].map(k =>
    `<button type="button" class="tab" data-act="tab" data-v="${k}"${view.tab === k && !view.page ? ' aria-current="page"' : ""}>${ICON[k]}<span>${t("tab_" + k)}</span></button>`).join("")}</nav>`;
}

/* ---------- render + events ---------- */
function render(focus = true) {
  const app = document.getElementById("app");
  if (view.name === "ob") app.innerHTML = renderOb();
  else {
    const pages = { settings: renderSettings, unwell: renderUnwell, disclaimer: renderDisclaimer, dish: renderDish };
    const tabView = { today: renderToday, meals: renderMeals, track: renderTrack }[view.tab] || renderSoon;
    app.innerHTML = (view.page ? pages[view.page]() : tabView()) + tabs();
  }
  if (focus) { window.scrollTo(0, 0); const h = app.querySelector("h1"); if (h) h.focus({ preventScroll: true }); }
}
function trackDay() { return view.tab === "track" && !view.page ? (view.day || 0) : 0; }
function go(step) { view.step = Math.max(0, Math.min(STEPS.length - 1, step)); render(); }

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const a = b.dataset.act, f = b.dataset.field, v = b.dataset.v;
  switch (a) {
    case "setlang": S.profile.lang = v; save(); await loadLang(v); render(false); break;
    case "next": go(view.step + 1); break;
    case "back": go(view.step - 1); break;
    case "accept": S.profile.disclaimerAccepted = new Date().toISOString(); save(); go(view.step + 1); break;
    case "finish": S.onboarded = true; save(); view = { name: "app", step: 0, tab: "today", page: null }; render(); break;
    case "pick":
      setPath(f, v);
      document.querySelectorAll(`[data-act="pick"][data-field="${f}"]`).forEach(x => x.setAttribute("aria-checked", x === b));
      break;
    case "toggle": {
      const val = "num" in b.dataset ? Number(v) : v, arr = getPath(f);
      const i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val);
      save(); b.setAttribute("aria-pressed", i < 0); break;
    }
    case "tab": view.tab = v; view.page = null; view.day = 0; view.edit = null; view.logDay = 0; hideToast(); render(); break;
    case "seg": view.seg = v; view.edit = null; render(false); break;
    case "cui": view.cui = v; render(false); break;
    case "fam": view.fam = view.fam === v ? null : v; render(false); break;
    case "dish": view.from = view.page ? null : view.tab; view.dish = v; view.portions = 1; view.page = "dish"; view.edit = null; hideToast(); render(); break;
    case "pless": view.portions = Math.max(0.5, (view.portions || 1) - 0.5); render(false); break;
    case "pmore": view.portions = Math.min(10, (view.portions || 1) + 0.5); render(false); break;
    case "ate": { const d = dish(view.dish); if (d) addMeal(d, view.portions || 1, view.logDay || 0); break; }
    case "addfood": view.logDay = view.day || 0; view.tab = "meals"; view.page = null; view.edit = null; hideToast(); render(); break;
    case "logday0": view.logDay = 0; render(false); break;
    case "addcup": addFluid(S.profile.cups[v], v, 1, trackDay()); break;
    case "iceplus": if (ice < 30) { ice++; render(false); } break;
    case "iceminus": if (ice > 1) { ice--; render(false); } break;
    case "addice": addFluid(cubeMl(), "ice", ice, trackDay()); break;
    case "addcustom": { const el = document.getElementById("f-custom"); const n = Number(el && el.value); if (n > 0 && n <= 5000) addFluid(n, "custom", 1, trackDay()); else if (el) el.focus(); break; }
    case "undo": removeEntry(v, false); hideToast(); break;
    case "restore": if (lastRemoved) { S.logs[lastRemoved.list].push(lastRemoved.x); lastRemoved = null; save(); render(false); } hideToast(); break;
    case "rmlog": removeEntry(v); break;
    case "more": changeCount(v, 1); break;
    case "less": changeCount(v, -1); break;
    case "editlog": view.edit = view.edit === v ? null : v; render(false); if (view.edit) document.getElementById("e-time")?.focus(); break;
    case "editdone": view.edit = null; render(false); break;
    case "dayprev": view.day = Math.min(365, (view.day || 0) + 1); view.edit = null; render(false); break;
    case "daynext": view.day = Math.max(0, (view.day || 0) - 1); view.edit = null; render(false); break;
    case "gotoday": view.day = Number(v); view.edit = null; render(); break;
    case "page": view.page = v || null; view.edit = null; render(); break;
    case "size": S.profile.size = Number(v); save(); await loadLang(lang()); render(false); break;
    case "edit": view = { name: "ob", step: 2, tab: "today", page: null }; render(); break;
    case "delete":
      if (b.dataset.armed) {
        try { localStorage.removeItem(KEY); } catch (err) {}
        S = blank(); view = { name: "ob", step: 0, tab: "today", page: null };
        await loadLang("en"); render();
      } else {
        b.dataset.armed = "1"; b.textContent = t("s_delete_confirm");
        setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("s_delete"); } }, 5000);
      }
      break;
  }
});
document.addEventListener("input", e => {
  const el = e.target, f = el.dataset.field;
  const id = el.dataset.entryTime || el.dataset.entryUnit;
  if (id) { // live edit: save and refresh the row's text without redrawing the page
    if (el.dataset.entryTime) setEntryTime(id, el.value); else setEntryUnit(id, el.value);
    const x = entry(id), li = el.closest(".entry");
    if (x && li) { const b = li.querySelector(".entry-top .big"); if (b && x.ml != null) b.textContent = `${num(x.ml)} ${t("ml")}`; li.querySelector(".entry-top .grow .muted").textContent = clock(new Date(x.time)); }
    return;
  }
  if (el.id === "f-q") { view.q = el.value; const box = document.getElementById("dish-list"); if (box) box.innerHTML = renderDishList(); return; }
  if (!f) return;
  if ("target" in el.dataset) {
    const g = getPath(f), n = el.value === "" ? null : Math.max(0, Number(el.value));
    g.value = Number.isFinite(n) ? n : null; g.status = g.value ? "set" : "unsure"; g.lastUpdated = new Date().toISOString(); save();
  } else if ("num" in el.dataset) {
    const n = el.value === "" ? null : Number(el.value);
    setPath(f, n > 0 ? n : (f.endsWith("ice5") ? null : getPath(f)));
    const r = document.getElementById("ice-result");
    if (r && f.endsWith("ice5")) r.textContent = S.profile.cups.ice5 > 0 ? t("s_ice_result", { ml: num(cubeMl()), unit: t("ml") }) : "";
  } else setPath(f, el.value);
});

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "f-custom") document.querySelector('[data-act="addcustom"]').click();
});

/* ---------- start ---------- */
(async function init() {
  TE = (await getJSON("i18n/en.json")) || {};
  OPT = (await getJSON("data/options.json")) || OPT;
  const [idx, fam] = await Promise.all([getJSON("data/dishes/index.json"), getJSON("data/families.json")]);
  FAMS = (fam && fam.families) || {};
  const files = await Promise.all(((idx && idx.files) || []).map(f => getJSON(`data/dishes/${f}.json`)));
  DISHES = files.filter(Boolean).flatMap(f => f.dishes || []);
  await loadLang(lang());
  if (S.onboarded) view = { name: "app", step: 0, tab: "today", page: null };
  else view = { name: "ob", step: S.profile.lang ? (S.profile.disclaimerAccepted ? 2 : 1) : 0, tab: "today", page: null };
  render();
})();

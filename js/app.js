/* Sufra app v0.4 — onboarding, Today, fluid tracker. All data stays on this device. */
"use strict";

const LANGS = ["en", "ar", "fr"];
const LANG_NAMES = { en: "English", ar: "العربية", fr: "Français" };
const KEY = "sufra.v1";
const MAGHREB = ["MA", "DZ", "TN", "LY"];
const STEPS = ["lang", "disc", "country", "type", "sched", "cuis", "diet", "targets", "done"];
const TARGETS = ["fluid", "potassium", "phosphorus", "sodium", "protein"];
const WEEK = [6, 0, 1, 2, 3, 4, 5]; // Saturday first

let S = load();
let T = {}, TE = {}, OPT = { countries: [], cuisines: [] };
let view = { name: "loading", step: 0, tab: "today", page: null };
let ice = 2, toastTimer = null;
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
      return { ...b, ...s, profile: { ...b.profile, ...s.profile }, targets: { ...b.targets, ...s.targets } };
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
function fluidOn(day) {
  const d = day.toDateString();
  return S.logs.fluid.filter(x => new Date(x.time).toDateString() === d);
}
function fluidToday() { return fluidOn(new Date()).reduce((a, x) => a + (x.ml || 0), 0); }
function cubeMl() { const v = S.profile.cups.ice5; return v > 0 ? Math.round((v / 5) * 10) / 10 : ICE_EST; }
function addFluid(ml, container, count = 1) {
  ml = Math.round(ml);
  if (!(ml > 0)) return;
  const id = Date.now() + "-" + Math.floor(Math.random() * 1000);
  S.logs.fluid.push({ id, time: new Date().toISOString(), ml, container, count });
  save(); render(false);
  toast(t("added", { ml: num(ml), unit: t("ml") }), id);
}
function removeFluid(id) { S.logs.fluid = S.logs.fluid.filter(x => x.id !== id); save(); render(false); }
function toast(msg, undoId) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${undoId ? `<button type="button" class="btn-link" data-act="undo" data-v="${esc(undoId)}">${t("undo")}</button>` : ""}`;
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
  gear: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" class="flip"><path d="M15 18l-6-6 6-6"/></svg>',
  heart: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  phone: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  today: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>',
  meals: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11h18a9 9 0 0 1-18 0zM8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4"/></svg>',
  track: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>',
  small: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 9h10l-1 9H8z"/></svg>',
  glass: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 4h12l-2 16H8z"/></svg>',
  mug: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 6h11v12H5zM16 9h2a2 2 0 0 1 0 4h-2"/></svg>',
  ice: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>',
  x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  learn: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5"/></svg>'
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
function cupButtons() {
  return `<div class="cups">${CUPS.map(k => `<button type="button" class="btn cup" data-act="addcup" data-v="${k}">${ICON[k]}<span>${t("cup_" + k)}</span><span class="muted">${num(S.profile.cups[k])} ${t("ml")}</span></button>`).join("")}</div>`;
}
function fluidSummary() {
  const used = fluidToday(), f = S.targets.fluid, u = t("ml");
  const lim = f.status === "set" ? f.value : null;
  let fluid;
  if (lim) {
    const pct = Math.min(100, Math.round((used / lim) * 100));
    const left = lim - used;
    fluid = `<div class="bar" role="img" aria-label="${esc(t("fluid_aria", { used: num(used), limit: num(lim) }))}"><span style="width:${pct}%"></span></div>
      <p class="big">${t("fluid_of", { used: num(used), limit: num(lim), unit: u })}</p>
      <p class="muted">${left >= 0 ? t("fluid_left", { left: num(left), unit: u }) : t("fluid_over", { over: num(-left), unit: u })}</p>`;
  } else {
    fluid = `<p class="big">${t("fluid_used", { used: num(used), unit: u })}</p><p class="muted">${t("fluid_nolimit")}</p>`;
  }
  return fluid;
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
  const cz = OPT.cuisines.filter(c => S.profile.cuisines.includes(c.id));
  return `<div class="head"><h1 tabindex="-1">${t("today")}</h1>
      <button type="button" class="icon-btn" data-act="page" data-v="settings" aria-label="${esc(t("settings"))}">${ICON.gear}</button></div>
    <p class="muted">${esc(new Intl.DateTimeFormat(loc(), { weekday: "long", day: "numeric", month: "long" }).format(new Date()))}</p>
    <section class="card" aria-labelledby="h-fluid"><h2 id="h-fluid" class="card-title">${t("fluid_title")}</h2>${fluidSummary()}</section>
    ${cupButtons()}
    <button type="button" class="btn btn-secondary wide" data-act="tab" data-v="track">${ICON.ice}<span>${t("more_options")}</span></button>
    <section class="card" aria-labelledby="h-next"><h2 id="h-next" class="card-title">${t("next_title")}</h2>${next}</section>
    <section class="card" aria-labelledby="h-meal"><h2 id="h-meal" class="card-title">${t("meal_title")}</h2>
      ${cz.length ? `<div class="chips">${cz.map(c => `<span class="tag">${esc(nm(c))}</span>`).join("")}</div>` : ""}<p class="muted">${t("meal_soon")}</p></section>
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
function renderTrack() {
  const u = t("ml"), cm = cubeMl(), measured = S.profile.cups.ice5 > 0;
  const list = fluidOn(new Date()).slice().reverse();
  const label = x => x.container === "ice" ? `${t("ice_title")} × ${num(x.count)}` : t("cup_" + x.container);
  const week = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return { d, total: fluidOn(d).reduce((a, x) => a + x.ml, 0) }; });
  const lim = S.targets.fluid.status === "set" ? S.targets.fluid.value : null;
  return `<h1 tabindex="-1">${t("tab_track")}</h1>
    <section class="card" aria-labelledby="h-fl"><h2 id="h-fl" class="card-title">${t("fluid_title")}</h2>${fluidSummary()}</section>
    <h2>${t("add_drink")}</h2>
    ${cupButtons()}
    <section class="card" aria-labelledby="h-ice">
      <div class="row" style="justify-content:space-between">
        <div class="row"><span style="color:var(--accent)">${ICON.ice}</span>
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
    <section class="card" aria-labelledby="h-cust"><h3 id="h-cust" class="big" style="margin:0 0 .4rem">${t("custom_title")}</h3>
      <div class="unit-input wrap"><input id="f-custom" type="number" inputmode="numeric" min="1" dir="ltr" aria-labelledby="h-cust" placeholder="${esc(t("custom_ph"))}"><span>${u}</span>
      <button type="button" class="btn btn-secondary" data-act="addcustom">${t("add")}</button></div>
    </section>
    <h2>${t("today_list")}</h2>
    ${list.length ? `<ul class="log">${list.map(x => `<li><span class="muted">${esc(clock(new Date(x.time)))}</span><span class="grow">${esc(label(x))}</span><strong>${num(x.ml)} ${u}</strong>
      <button type="button" class="icon-btn small-btn" data-act="rmlog" data-v="${esc(x.id)}" aria-label="${esc(t("remove_aria", { what: label(x) + " " + num(x.ml) + " " + u }))}">${ICON.x}</button></li>`).join("")}</ul>`
      : `<p class="muted">${t("none_yet")}</p>`}
    <h2>${t("week_title")}</h2>
    <ul class="log">${week.map(w => `<li><span class="grow">${esc(w.d.toDateString() === new Date().toDateString() ? t("next_today") : new Intl.DateTimeFormat(loc(), { weekday: "long", day: "numeric" }).format(w.d))}</span>
      <strong>${lim ? t("week_of", { used: num(w.total), limit: num(lim), unit: u }) : `${num(w.total)} ${u}`}</strong></li>`).join("")}</ul>`;
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
    const pages = { settings: renderSettings, unwell: renderUnwell, disclaimer: renderDisclaimer };
    const tabView = { today: renderToday, track: renderTrack }[view.tab] || renderSoon;
    app.innerHTML = (view.page ? pages[view.page]() : tabView()) + tabs();
  }
  if (focus) { window.scrollTo(0, 0); const h = app.querySelector("h1"); if (h) h.focus({ preventScroll: true }); }
}
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
    case "tab": view.tab = v; view.page = null; hideToast(); render(); break;
    case "addcup": addFluid(S.profile.cups[v], v); break;
    case "iceplus": if (ice < 30) { ice++; render(false); } break;
    case "iceminus": if (ice > 1) { ice--; render(false); } break;
    case "addice": addFluid(ice * cubeMl(), "ice", ice); break;
    case "addcustom": { const el = document.getElementById("f-custom"); const n = Number(el && el.value); if (n > 0 && n <= 5000) addFluid(n, "custom"); else if (el) el.focus(); break; }
    case "undo": removeFluid(v); hideToast(); toast(t("removed")); break;
    case "rmlog": removeFluid(v); toast(t("removed")); break;
    case "page": view.page = v || null; render(); break;
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
  await loadLang(lang());
  if (S.onboarded) view = { name: "app", step: 0, tab: "today", page: null };
  else view = { name: "ob", step: S.profile.lang ? (S.profile.disclaimerAccepted ? 2 : 1) : 0, tab: "today", page: null };
  render();
})();

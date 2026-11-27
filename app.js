/* Bookshelf — app logic. Everything a reader enters stays in this browser (localStorage).
   Nothing is sent anywhere except book searches to Open Library when the reader asks. */
"use strict";
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => Math.round(n).toLocaleString("en-US");
const fmt1 = n => (Math.round(n*10)/10).toFixed(1);
const starTxt = r => r ? `${r%1 ? r.toFixed(1) : r}★` : "–";
const rCls = r => !r ? "r0" : r>=5 ? "r5" : r>=4 ? "r4" : r>=3 ? "r3" : "r2";
const TALK = ["","Light","Moderate","Heavy"], PACE = ["","Slow burn","Steady","Fast"];
const today = () => new Date().toISOString().slice(0,10);
const dateTxt = d => d ? new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "";
const meter = v => `<span class="meter" aria-hidden="true">${[1,2,3].map(i=>`<i class="${i<=v?"on":""}"></i>`).join("")}</span>`;
const LENF = {any:["Any length",0,1e9], short:["Under 350",0,350], medium:["350–499",350,500], long:["500–699",500,700], epic:["700+",700,1e9], "long+":["500+",500,1e9]};
const inLen = (p, k) => { const r = LENF[k]||LENF.any; return !p ? k==="any" : (p>=r[1] && p<r[2]); };
const normT = t => String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\(.*?\)/g,"").split(":")[0].replace(/^(the|a|an)\s+/,"").replace(/[^a-z0-9]+/g,"");
const lastName = a => String(a||"").split(/,| & | and /)[0].trim().split(/\s+/).pop().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z]/g,"");
const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60);

/* ---------- catalog ---------- */
const CAT = CATALOG_ROWS.map(([id,t,a,lane,sub,p,y,pov,era,talk,pace,series,tags,hook,set,aw])=>({id,t,a,lane,sub,p,y,pov,era,talk,pace,series,tags:tags.split(" ").filter(Boolean),hook,set,aw,cat:true}));
const CATMAP = Object.fromEntries(CAT.map(b=>[b.id,b]));
const CATIDX = {}; CAT.forEach(b=>{ CATIDX[normT(b.t)+"|"+lastName(b.a)] = b; (CATIDX[normT(b.t)] ||= b); });

/* ---------- reader state (this browser only) ---------- */
const KEY = "bookshelf-v1";
const blank = () => ({v:1, profile:{name:"", lanes:[], hooks:[], favorites:[], length:null, series:"mix", onboarded:false, created:today()}, shelf:{}, custom:{}, next:null, lastBackup:null, friends:{}, hints:{}});
const STATUSES = ["read","reading","want","passed","dnf"];
const FORMATS = {print:"Print", ebook:"Ebook", audio:"Audiobook"};
let S = (()=>{ try{ const s = JSON.parse(localStorage.getItem(KEY)); if(s && s.v===1) return Object.assign(blank(), s); }catch(e){} return blank(); })();

/* Anything that arrives from a file or a link is cleaned before use, so a bad or hostile file can't break the page. */
const isDate = d => typeof d==="string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
const numIn = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n>=lo && n<=hi ? n : null; };
const str = (v, max=500) => v==null ? "" : String(v).slice(0, max);
function cleanBook(b, id){
  return {id, t:str(b.t,300)||"Untitled", a:str(b.a,200)||"Unknown", lane:LANES.includes(b.lane)?b.lane:null, sub:str(b.sub,80),
    p:numIn(b.p,1,20000), y:numIn(b.y,-3000,2100), pov:POVS[b.pov]?b.pov:null, era:ERAS[b.era]?b.era:null,
    talk:numIn(b.talk,1,3), pace:numIn(b.pace,1,3), series:str(b.series,120), tags:(Array.isArray(b.tags)?b.tags:[]).filter(t=>TAGS[t]).slice(0,8),
    hook:str(b.hook), set:str(b.set,200), aw:str(b.aw,120), cat:false, src:b.src==="goodreads"?"goodreads":"openlibrary", gr:numIn(b.gr,0,5)};
}
function cleanEntry(e){
  const out = {st:STATUSES.includes(e.st)?e.st:null, at:isDate(e.at)||today()};
  const r = numIn(e.r,0.5,5), dr = numIn(e.dr,0.5,5), pct = numIn(e.pct,0,100);
  if(r) out.r = Math.round(r*2)/2; if(dr) out.dr = Math.round(dr*2)/2; if(pct!==null) out.pct = Math.round(pct);
  ["start","fin","stop"].forEach(k=>{ const d=isDate(e[k]); if(d) out[k]=d; });
  if(e.note) out.note = str(e.note, 4000);
  if(FORMATS[e.fmt]) out.fmt = e.fmt;
  return out.st ? out : null;
}
function cleanState(j){
  if(!j || j.v!==1 || typeof j.shelf!=="object" || !j.shelf) return null;
  const s = blank(), P = j.profile||{};
  s.profile = {name:str(P.name,60), lanes:(Array.isArray(P.lanes)?P.lanes:[]).filter(l=>LANES.includes(l)), hooks:(Array.isArray(P.hooks)?P.hooks:[]).filter(h=>TAGS[h]).slice(0,4),
    favorites:(Array.isArray(P.favorites)?P.favorites:[]).map(String).slice(0,50), length:["short","medium","long"].includes(P.length)?P.length:null,
    series:["mix","standalone","series"].includes(P.series)?P.series:"mix", onboarded:!!P.onboarded, created:isDate(P.created)||today(), goals:{}, covers:P.covers==="off"?"off":"on"};
  for(const [y,n] of Object.entries(P.goals||{})){ const g = numIn(n,1,500); if(/^\d{4}$/.test(y) && g) s.profile.goals[y] = Math.round(g); }
  for(const [k,v] of Object.entries(j.hints||{})){ if(/^[a-z0-9]{1,20}$/.test(k) && isDate(v)) s.hints[k] = v; }
  for(const [id,b] of Object.entries(j.custom||{})) if(b && typeof b==="object" && /^(gr|ol)-[a-z0-9-]+$/.test(id)) s.custom[id] = cleanBook(b, id);
  for(const [id,e] of Object.entries(j.shelf)){ if(!e || typeof e!=="object" || !(CATMAP[id] || s.custom[id])) continue; const c = cleanEntry(e); if(c) s.shelf[id] = c; }
  s.next = typeof j.next==="string" && s.shelf[j.next] ? j.next : null;
  s.lastBackup = isDate(j.lastBackup);
  for(const [k,f] of Object.entries(j.friends||{})) if(f && typeof f.code==="string" && f.code.length<200000) s.friends[str(k,80)] = {name:str(f.name,60), at:isDate(f.at)||today(), code:f.code};
  return s;
}
let storageOK = true;
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); storageOK = true; }catch(e){ storageOK = false; toast("Couldn't save in this browser. Download a backup from Profile so you don't lose changes."); } }
const book = id => CATMAP[id] || S.custom[id];
const entry = id => S.shelf[id];
const status = id => (S.shelf[id]||{}).st || null;
function setEntry(id, patch){
  const cur = S.shelf[id] || {at:today()};
  const next = {...cur, ...patch};
  if(next.st===null){ delete S.shelf[id]; } else S.shelf[id] = next;
  if(S.next===id && next.st!=="want") S.next = null;
  save(); changed(); if(PERSIST!==true) protect();
}

/* ---------- derived ---------- */
let RATED = [], TP = null, FIT = {}, PREFS = null, NEG = [];
function readBooks(){ return Object.entries(S.shelf).filter(([,e])=>e.st==="read").map(([id,e])=>({...book(id), ...e, id})).filter(b=>b.t); }
function recompute(){
  RATED = readBooks().filter(b=>b.r>0);
  TP = tasteProfile(RATED);
  PREFS = {lanes:S.profile.lanes||[], hooks:S.profile.hooks||[], favorites:S.profile.favorites||[], length:S.profile.length, series:S.profile.series};
  NEG = Object.entries(S.shelf).filter(([,e])=>e.st==="dnf"||e.st==="passed").map(([id,e])=>{ const b = book(id); return b && {...b, id, st:e.st, r:e.st==="dnf"&&e.dr ? e.dr : MODEL.negRating[e.st], w:MODEL.negWeight[e.st]}; }).filter(Boolean);
  FIT = {}; SN = null;
}
function fit(id){ if(!FIT[id]){ const b = book(id); FIT[id] = fitFor(b, RATED, TP, PREFS, NEG); } return FIT[id]; }
function pagesPerDay(){
  const done = readBooks().filter(b=>b.start && b.fin && b.p);
  const spans = done.map(b=>({p:b.p, d:Math.max(1,(new Date(b.fin)-new Date(b.start))/864e5)})).filter(x=>x.d<400);
  if(!spans.length) return {ppd:30, basis:"a typical reading pace"};
  const p = spans.reduce((a,x)=>a+x.p,0), d = spans.reduce((a,x)=>a+x.d,0);
  return {ppd:Math.max(5, Math.round(p/d)), basis:`your pace across ${spans.length} dated book${spans.length>1?"s":""}`};
}
const daysFor = p => p ? Math.max(1, Math.round(p/pagesPerDay().ppd)) : null;

/* ---------- series ---------- */
// Catalog series look like "Slough House #3, ongoing" or "Karla Trilogy #1 of 3".
const parseSeries = s => { const m = /^(.*?)\s+#(\d+)\b/.exec(s||""); return m ? {name:m[1].trim(), k:+m[2]} : null; };
const SERIES = {}; CAT.forEach(b=>{ const p = parseSeries(b.series); if(p) (SERIES[p.name] ||= []).push({k:p.k, b}); });
Object.values(SERIES).forEach(l=>l.sort((x,y)=>x.k-y.k));
// For each series you've finished at least one book of (and didn't dislike), the lowest-numbered entry after the furthest one you've read.
let SN = null;
function seriesNext(){
  if(SN) return SN;
  const out = [];
  for(const [name, list] of Object.entries(SERIES)){
    const done = list.filter(x=>status(x.b.id)==="read");
    if(!done.length) continue;
    const rated = done.filter(x=>entry(x.b.id).r), avg = rated.length ? rated.reduce((a,x)=>a+entry(x.b.id).r,0)/rated.length : null;
    if(avg!==null && avg<3) continue;
    const maxK = Math.max(...done.map(x=>x.k));
    const nx = list.find(x=>x.k>maxK && (!status(x.b.id) || status(x.b.id)==="want"));
    if(nx) out.push({name, b:nx.b, k:nx.k, after:done.find(x=>x.k===maxK).b, avg, gap:nx.k>maxK+1, count:done.length});
  }
  return SN = out;
}
const nextInSeriesFor = id => seriesNext().find(x=>x.b.id===id);
const seriesNextAfter = id => { const p = parseSeries((CATMAP[id]||{}).series); return p ? seriesNext().find(x=>x.name===p.name) : null; };
const hrs = p => p*1.5/60;
const isSparse = b => !b.cat && (!b.lane || !b.pace || !b.talk || !b.pov || b.tags.length<2);
function candidates(){ return CAT.filter(b=>{ const s = status(b.id); return !s || s==="want"; }).concat(Object.values(S.custom).filter(b=>status(b.id)==="want")); }
function upNext(){
  if(S.next && status(S.next)==="want") return {b:book(S.next), auto:false};
  const pool = candidates().filter(b=>!PREFS.lanes.length || PREFS.lanes.includes(b.lane));
  const want = pool.filter(b=>status(b.id)==="want").sort((a,c)=>fit(c.id).score-fit(a.id).score);
  if(want.length) return {b:want[0], auto:true, fromList:true};
  pool.sort((a,c)=>fit(c.id).score-fit(a.id).score);
  return pool[0] ? {b:pool[0], auto:true} : null;
}

/* ---------- small UI helpers ---------- */
let toastT; function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true, 3200); }
const OPEN = new Set();
document.addEventListener("toggle", e=>{ const d=e.target; if(d.classList && d.classList.contains("bk")) d.open ? OPEN.add(d.dataset.key) : OPEN.delete(d.dataset.key); }, true);

function whyLines(b){
  const f = fit(b.id), out = [], sn = nextInSeriesFor(b.id);
  if(sn) out.push(sn.gap ? `Continues the ${sn.name} series: you've read up to ${sn.after.t}, and this is #${sn.k}.` : `Next in the ${sn.name} series, after ${sn.after.t}${entry(sn.after.id).r?` (${starTxt(entry(sn.after.id).r)})`:""}.`);
  if(f.hooks.length) out.push(`Has ${f.hooks.length===1?"one":f.hooks.length} of the things you said hook you: ${f.hooks.map(h=>TAGS[h].toLowerCase()).join(", ")}.`);
  const good = f.near.filter(x=>x.score>0.35 && x.r.r>=Math.max(4,(TP.raw||4))).slice(0,2);
  if(good.length) out.push(`Most like ${good.map(x=>`${x.r.t} (${starTxt(x.r.r)})`).join(" and ")}.`);
  if(f.strong.length){ const t=f.strong[0]; out.push(`Books you've rated with “${TAGS[t]}” average ${fmt1(TP.aff[t].avg)}★.`); }
  const top = f.near[0];
  if(top && top.score>0.45 && top.r.r < (TP.raw||4)-0.4) out.push(`Heads up: it's closest to ${top.r.t}, which you rated ${starTxt(top.r.r)}.`);
  if(f.warn) out.push(`Heads up: it's a lot like ${f.warn.r.t}, which you ${f.warn.r.st==="dnf"?"didn't finish":"passed on"}. That lowers its score a little.`);
  if(f.offLane) out.push(`It's outside the genres you picked (${b.lane}).`);
  if(b.p) out.push(`About ${daysFor(b.p)} days at ${pagesPerDay().basis} (${pagesPerDay().ppd} pages a day).`);
  if(!RATED.length) out.unshift("Rate a few books you've read and these reasons get specific.");
  return out;
}
function statsGrid(b, e){
  const avgP = (()=>{ const r = readBooks().filter(x=>x.p); return r.length ? r.reduce((a,x)=>a+x.p,0)/r.length : null; })();
  const rows = [];
  if(b.p) rows.push(["Pages", fmt(b.p)], ["Reading time", `~${fmt(hrs(b.p))} hrs · ~${daysFor(b.p)} days`]);
  if(b.p && avgP) rows.push(["Vs. your average", `${b.p-avgP>=0?"+":"−"}${fmt(Math.abs(b.p-avgP))} pages`]);
  if(b.y) rows.push(["First published", b.y<0?`${-b.y} BC`:b.y]);
  if(b.lane) rows.push(["Genre", b.sub ? `${b.lane} · ${b.sub}` : b.lane]);
  if(b.cat) rows.push(["Series", b.series || "Standalone"]);
  if(b.pov) rows.push(["Narration", POVS[b.pov]]);
  if(b.set) rows.push(["Setting", b.set]);
  if(b.era) rows.push(["Era", ERAS[b.era]]);
  if(b.talk) rows.push(["Dialogue", `${meter(b.talk)}${TALK[b.talk]}`, true]);
  if(b.pace) rows.push(["Pace", `${meter(b.pace)}${PACE[b.pace]}`, true]);
  if(b.aw) rows.push(["Awards", b.aw]);
  if(b.gr) rows.push(["Goodreads average", `${b.gr.toFixed(2)}★`]);
  if(e && e.fmt) rows.push(["Format", FORMATS[e.fmt]]);
  if(e && e.start) rows.push(["Started", dateTxt(e.start)]);
  if(e && e.st==="dnf"){ rows.push(["Stopped at", `${e.pct||0}%${b.p?` · about page ${fmt(b.p*(e.pct||0)/100)}`:""}`]); if(e.stop) rows.push(["Stopped", dateTxt(e.stop)]); if(e.dr) rows.push(["Rating so far", starTxt(e.dr)]); }
  if(e && e.fin && e.st==="read") rows.push(["Finished", dateTxt(e.fin)]);
  if(e && e.st==="read" && e.start && e.fin){ const d=Math.max(1,Math.round((new Date(e.fin)-new Date(e.start))/864e5)); rows.push(["Took", `${d} days${b.p?` · ${Math.round(b.p/d)} pages a day`:""}`]); }
  return `<dl class="stats">${rows.map(([k,v,raw])=>`<div><dt>${k}</dt><dd>${raw?v:esc(v)}</dd></div>`).join("")}</dl>`;
}
const tagList = b => b.tags.length ? `<div>${b.tags.map(t=>TAGS[t]?`<span class="tag${PREFS.hooks.includes(t)?" hook":""}">${esc(TAGS[t])}</span>`:"").join("")}</div>` : "";
function pills(b){
  const s = status(b.id), nx = upNext(), out = [];
  if(nx && nx.b && nx.b.id===b.id && s!=="read" && s!=="reading") out.push(`<span class="pill next">Up next</span>`);
  if(s==="read") out.push(`<span class="pill read">Read</span>`);
  if(s==="reading") out.push(`<span class="pill reading">Reading</span>`);
  if(s==="want") out.push(`<span class="pill want">On your list</span>`);
  if(s==="passed") out.push(`<span class="pill pass">Passed</span>`);
  if(s==="dnf") out.push(`<span class="pill dnf">Didn't finish · ${(entry(b.id).pct||0)}%</span>`);
  if((!s || s==="want") && nextInSeriesFor(b.id)) out.push(`<span class="pill series">Next in series</span>`);
  if(isSparse(b)) out.push(`<span class="pill sparse">Needs details</span>`);
  return out.join("");
}
function scoreBadge(b){
  const e = entry(b.id);
  if(e && e.st==="read") return `<span class="score ${rCls(e.r)}" title="Your rating"><span><b>${e.r ? (e.r%1?e.r.toFixed(1):e.r) : "–"}</b><small>${e.r?"stars":"unrated"}</small></span></span>`;
  if(e && e.st==="dnf") return `<span class="score fit dnf" style="--v:${e.pct||0}" title="Where you stopped"><span><b>${e.pct||0}%</b><small>stopped</small></span></span>`;
  if(e && e.st==="reading") return `<span class="score fit" style="--v:${e.pct||0}" title="Progress"><span><b>${e.pct||0}%</b><small>read</small></span></span>`;
  const f = fit(b.id);
  return `<span class="score fit" style="--v:${f.fit}" title="Fit score"><span><b>${f.fit}</b><small>fit</small></span></span>`;
}
function ratingSelect(id, r, attr="data-rate", label="Your rating"){
  const opts = [["","Rate it"],...[5,4.5,4,3.5,3,2.5,2,1.5,1,0.5].map(v=>[v, `${v}★`])];
  return `<label class="ctrl"><span class="lbl">${label}</span><select ${attr}="${id}">${opts.map(([v,l])=>`<option value="${v}"${String(r||"")===String(v)?" selected":""}>${l}</option>`).join("")}</select></label>`;
}
function trackBox(b){
  const e = entry(b.id) || {}, s = e.st;
  const btn = (st,label) => `<button class="btn ghost" data-st="${st}" data-id="${b.id}" aria-pressed="${s===st}">${label}</button>`;
  let html = `<div class="actions">${btn("want","Want to read")}${btn("reading","Reading")}${btn("read","Read it")}${btn("dnf","Didn't finish")}${btn("passed","Not for me")}${s?`<button class="btn quiet" data-st="" data-id="${b.id}">Remove</button>`:""}</div>`;
  if(s==="want") html += `<div class="actions"><button class="btn ghost" data-act="next" data-id="${b.id}" aria-pressed="${S.next===b.id}">${S.next===b.id?"Up next ✓":"Make it up next"}</button></div>`;
  if(s==="reading") html += `<div class="track-row"><label class="ctrl"><span class="lbl">Progress: <span id="pv-${b.id}">${e.pct||0}</span>%</span><input type="range" min="0" max="100" step="1" value="${e.pct||0}" data-pct="${b.id}" aria-label="Progress percent"></label><label class="ctrl"><span class="lbl">Started</span><input type="date" value="${e.start||""}" data-date="start" data-id="${b.id}"></label></div>`;
  if(s==="dnf") html += `<div class="track-row"><label class="ctrl"><span class="lbl">Stopped at: <span id="pv-${b.id}">${e.pct||0}</span>%</span><input type="range" min="0" max="100" step="1" value="${e.pct||0}" data-pct="${b.id}" aria-label="Where you stopped, percent"></label>${ratingSelect(b.id, e.dr, "data-drate", "Rating so far (optional)")}<label class="ctrl"><span class="lbl">Started</span><input type="date" value="${e.start||""}" data-date="start" data-id="${b.id}"></label><label class="ctrl"><span class="lbl">Stopped</span><input type="date" value="${e.stop||""}" data-date="stop" data-id="${b.id}"></label></div>
    <p class="muted small">Books you didn't finish stay off your recommendations and don't count toward your average or your taste charts. If you pick it back up, tap <b>Reading</b> and your place is kept.</p>`;
  if(s==="read") html += `<div class="track-row">${ratingSelect(b.id, e.r)}<label class="ctrl"><span class="lbl">Started</span><input type="date" value="${e.start||""}" data-date="start" data-id="${b.id}"></label><label class="ctrl"><span class="lbl">Finished</span><input type="date" value="${e.fin||""}" data-date="fin" data-id="${b.id}"></label></div>
    <label class="check"><input type="checkbox" data-fav="${b.id}"${PREFS.favorites.includes(b.id)?" checked":""}> One of my all-time favorites (counts extra in recommendations)</label>`;
  if(s==="read"||s==="reading"||s==="dnf") html += `<div class="ctrl"><span class="lbl">Format</span><div class="chips">${Object.entries(FORMATS).map(([k,l])=>`<button class="chip" data-fmt="${k}" data-id="${b.id}" aria-pressed="${e.fmt===k}">${l}</button>`).join("")}</div></div>`;
  if(s) html += `<label class="ctrl"><span class="lbl">Notes</span><textarea data-note="${b.id}" placeholder="What you thought">${esc(e.note||"")}</textarea></label>`;
  return `<div class="track-box">${html}</div>`;
}
function quickDetails(b){
  if(!isSparse(b)) return "";
  const pick = (k, label, opts) => `<div class="ctrl"><span class="lbl">${label}</span><div class="chips">${opts.map(([v,l])=>`<button class="chip" data-qd="${k}" data-v="${v}" data-id="${b.id}" aria-pressed="${String(b[k])===String(v)}">${l}</button>`).join("")}</div></div>`;
  return `<div class="quick"><div><b>Quick details</b> <span class="muted small">A few taps. They make this book count fully toward your recommendations.</span></div>
    ${b.lane?"":pick("lane","Genre",LANES.map(l=>[l,l]))}
    ${pick("pace","Pace",[[3,"Fast"],[2,"Steady"],[1,"Slow burn"]])}
    ${pick("talk","Dialogue",[[1,"Light"],[2,"Moderate"],[3,"Heavy"]])}
    ${pick("pov","Narrator",[["f","First person"],["t","Third person"],["o","Mixed or unusual"],["m","Memoir"],["r","Reported nonfiction"]])}
    <div class="ctrl"><span class="lbl">Themes (pick up to 5)</span><div class="chips">${Object.keys(TAGS).map(t=>`<button class="chip" data-qtag="${t}" data-id="${b.id}" aria-pressed="${b.tags.includes(t)}">${esc(TAGS[t])}</button>`).join("")}</div></div></div>`;
}
/* Covers: real ones from Open Library when this reader allows it, otherwise (and while loading) a generated title card. */
const LANE_HUE = {Thriller:200, Mystery:265, "Sci-fi":185, Fantasy:290, Literary:30, Historical:40, Horror:355, Nonfiction:150};
const hashN = t => { let h=0; for(const c of String(t)) h = (h*31 + c.charCodeAt(0))|0; return Math.abs(h); };
let COV = (()=>{ try{ return JSON.parse(localStorage.getItem("bookshelf-covers"))||{}; }catch(e){ return {}; } })();
const coversOn = () => S.profile.covers!=="off";
function coverEl(b){
  const hue = (LANE_HUE[b.lane] ?? 160) + (hashN(b.t)%24) - 12, light = 28 + hashN(b.a)%12;
  const n = COV[b.id], img = coversOn() && n>0 ? `<img src="https://covers.openlibrary.org/b/id/${n}-M.jpg" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="cover" data-cid="${esc(b.id)}" style="--h:${hue};--l:${light}%" aria-hidden="true"><span class="ct">${esc(String(b.t).replace(/^(The|A|An) /,"").slice(0,1))}</span>${img}</span>`;
}
const COVQ = []; let covBusy = 0, covSaveT;
const covIO = "IntersectionObserver" in window ? new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting){ covIO.unobserve(en.target); queueCover(en.target.dataset.cid); } }), {rootMargin:"200px"}) : null;
function queueCover(id){ if(!coversOn() || id in COV || COVQ.includes(id)) return; COVQ.push(id); pumpCovers(); }
async function pumpCovers(){
  while(covBusy<2 && COVQ.length){
    const id = COVQ.shift(), b = book(id); if(!b || id in COV) continue; covBusy++;
    (async()=>{
      try{
        const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(b.t)}&author=${encodeURIComponent(String(b.a).split(/ & | and |,/)[0])}&fields=cover_i&limit=5`);
        if(r.ok){ const j = await r.json(); const d = (j.docs||[]).find(x=>x.cover_i); COV[id] = d ? d.cover_i : 0; clearTimeout(covSaveT); covSaveT = setTimeout(()=>{ try{ localStorage.setItem("bookshelf-covers", JSON.stringify(COV)); }catch(e){} }, 800);
          if(d) $$(`.cover[data-cid="${CSS.escape(id)}"]`).forEach(el=>{ if(!el.querySelector("img")) el.insertAdjacentHTML("beforeend", `<img src="https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg" alt="" loading="lazy" onerror="this.remove()">`); }); }
      }catch(e){}
      covBusy--; setTimeout(pumpCovers, 250);
    })();
  }
}
function scanCovers(){
  if(!coversOn()) return;
  $$(".cover[data-cid]:not([data-seen])").forEach(el=>{ el.dataset.seen="1"; if(el.dataset.cid in COV) return; covIO ? covIO.observe(el) : queueCover(el.dataset.cid); });
}
let scanT; new MutationObserver(()=>{ clearTimeout(scanT); scanT = setTimeout(scanCovers, 60); }).observe(document.querySelector("main"), {childList:true, subtree:true});

function bookCard(b, opt={}){
  const key = (opt.ctx||"x")+":"+b.id, s = status(b.id);
  const meta = [esc(b.a), b.p?`${fmt(b.p)} pages`:"", b.lane?esc(b.lane):"", (!s||s==="want")&&RATED.length?`predicted ${fmt1(fit(b.id).pred)}★`:"", opt.note?`<b>${esc(opt.note)}</b>`:""].filter(Boolean).join(" · ");
  let body = b.hook ? `<p>${esc(b.hook)}</p>` : `<p class="muted">From ${b.src==="goodreads"?"your Goodreads import":"Open Library"}. Not in the Bookshelf catalog yet.</p>`;
  body += trackBox(b);
  if(!s || s==="want" || s==="passed"){
    const f = fit(b.id);
    body += `<div><div class="eyebrow" style="margin-bottom:.35rem">Why it could work</div><ul class="why">${whyLines(b).map(l=>`<li>${esc(l)}</li>`).join("")}</ul></div>`;
    if(RATED.length) body += `<div class="near"><div class="eyebrow">Closest books you've read</div>${f.near.map(x=>`<div class="nearrow"><span>${esc(x.r.t)} <span class="muted">${starTxt(x.r.r)}</span></span><span class="bar"><i style="width:${Math.round(x.score*100)}%"></i></span><span class="muted small">${Math.round(x.score*100)}%</span></div>`).join("")}</div>`;
  }
  body += quickDetails(b) + statsGrid(b, entry(b.id)) + tagList(b);
  if(s==="read"){ const sn = seriesNextAfter(b.id); body += `<div class="actions"><button class="btn ghost" data-act="like" data-id="${b.id}">Find books like this</button>${sn?`<button class="btn ghost" data-act="open" data-id="${sn.b.id}">Next in series: ${esc(sn.b.t)}</button>`:""}</div>`; }
  return `<li><details class="bk" data-key="${key}"${OPEN.has(key)?" open":""}><summary>${opt.badge || scoreBadge(b)}${coverEl(b)}<span style="min-width:0">${opt.rank?`<span class="rank">#${opt.rank} </span>`:""}<span class="bt">${esc(b.t)}</span><div class="bm">${meta}</div></span><span class="side">${pills(b)}<span class="chev" aria-hidden="true">›</span></span></summary><div class="body">${body}</div></details></li>`;
}
function dotPlot(rows, ref){
  const min=1, max=5, x = v => ((v-min)/(max-min)*100).toFixed(2);
  return `<div class="chart">${rows.map(r=>`<div class="dotrow"><span class="lab" title="${esc(r.label)}">${r.bold?`<b>${esc(r.label)}</b>`:esc(r.label)}</span><span class="dottrack"><span class="ref" style="left:${x(ref)}%"></span><span class="dot" style="left:${x(r.v)}%"></span></span><span class="val">${fmt1(r.v)}★ · ${r.n}</span></div>`).join("")}
  <div class="axis" aria-hidden="true"><span></span><div>${[1,2,3,4,5].map(v=>`<span>${v}</span>`).join("")}</div><span>avg · books</span></div></div>`;
}
function hbars(rows, unit=""){
  const max = Math.max(...rows.map(r=>r.v), 1);
  return `<div class="chart">${rows.map(r=>`<div class="hbar"><span class="lab" title="${esc(r.label)}">${esc(r.label)}</span><span class="track"><i style="width:${(r.v/max*100).toFixed(1)}%"></i></span><span class="val">${fmt(r.v)}${unit}</span></div>`).join("")}</div>`;
}
function groupAvg(books, keyFn, order){
  const g={}; books.forEach(b=>{ const k=keyFn(b); if(k==null) return; (g[k] ||= []).push(b.r); });
  let keys = Object.keys(g); if(order) keys = order.filter(k=>g[k]);
  return keys.map(k=>({label:k, n:g[k].length, v:g[k].reduce((a,c)=>a+c,0)/g[k].length}));
}

/* ---------- onboarding ---------- */
let OB = {step:0, q:""};
let GRMSG = "";
function renderOnboard(){
  const P = S.profile, steps = 5;
  const bar = `<div class="steps" aria-hidden="true">${Array.from({length:steps},(_,i)=>`<i class="${i<=OB.step?"on":""}"></i>`).join("")}</div>`;
  let h = "";
  if(OB.step===0) h = `
    <div class="block"><div class="eyebrow">Welcome</div><h1>Your own bookshelf.</h1>
    <p class="lede">Track what you read, rate it, and get recommendations from about ${fmt(Math.floor(CAT.length/50)*50)} hand-described books, tuned to your taste. Everything you enter stays on this device.</p></div>
    <label class="ctrl"><span class="lbl">What should we call you? (optional)</span><input type="text" id="ob-name" value="${esc(P.name)}" placeholder="Your first name" autocomplete="given-name"></label>
    <div class="actions"><button class="btn big" data-ob="next">Get started</button><button class="btn ghost" data-ob="restore">Restore a backup</button></div>
    <p class="muted small">Use Goodreads? You can import your whole library in the next steps or any time from Profile.</p>`;
  if(OB.step===1) h = `
    <div class="block"><div class="eyebrow">Step 1 of 4</div><h2>Which genres do you enjoy?</h2><p class="lede">Pick as many as you like. Recommendations lean toward these, but nothing's off-limits.</p></div>
    <div class="chips">${LANES.map(l=>`<button class="chip" data-oblane="${l}" aria-pressed="${P.lanes.includes(l)}">${l}</button>`).join("")}</div>
    <div class="actions"><button class="btn big" data-ob="next">Next</button><button class="btn quiet" data-ob="back">Back</button></div>`;
  if(OB.step===2){
    const favs = P.favorites.map(book).filter(Boolean);
    h = `<div class="block"><div class="eyebrow">Step 2 of 4</div><h2>Pick a few books you loved.</h2><p class="lede">Three to five is ideal. They're saved as 5-star reads and anchor your recommendations. Or import your Goodreads library instead.</p></div>
    <input type="search" id="ob-q" placeholder="Search by title or author" value="${esc(OB.q)}" aria-label="Search books">
    <ul class="results" id="ob-results"></ul>
    ${favs.length?`<div class="block"><h3>Your picks</h3><div class="chips">${favs.map(b=>`<button class="chip" aria-pressed="true" data-obfav="${b.id}" title="Remove">${esc(b.t)} ✕</button>`).join("")}</div></div>`:""}
    <div class="panel block"><h3>Or import from Goodreads</h3><p class="small">On goodreads.com, go to <b>My Books → Import and export → Export library</b>, then choose the file here.</p><input type="file" accept=".csv,text/csv" data-grfile="1" aria-label="Goodreads export"><p class="muted small" data-grmsg="1">${esc(GRMSG)}</p></div>
    <div class="actions"><button class="btn big" data-ob="next">${favs.length||Object.keys(S.shelf).length?"Next":"Skip for now"}</button><button class="btn quiet" data-ob="back">Back</button></div>`;
  }
  if(OB.step===3) h = `
    <div class="block"><div class="eyebrow">Step 3 of 4</div><h2>What hooks you in a book?</h2><p class="lede">Pick up to four. Books with these get a boost.</p></div>
    <div class="chips">${HOOK_CHOICES.map(t=>`<button class="chip" data-obhook="${t}" aria-pressed="${P.hooks.includes(t)}">${esc(TAGS[t])}</button>`).join("")}</div>
    <p class="muted small" id="ob-hookmsg">${P.hooks.length}/4 picked</p>
    <div class="actions"><button class="btn big" data-ob="next">Next</button><button class="btn quiet" data-ob="back">Back</button></div>`;
  if(OB.step===4) h = `
    <div class="block"><div class="eyebrow">Step 4 of 4</div><h2>Last two quick ones.</h2></div>
    <div class="ctrl"><span class="lbl">Book length</span><div class="chips">${[[null,"No preference"],["short","Shorter, under 400"],["medium","Middle, 350–500"],["long","Long, 500+"]].map(([v,l])=>`<button class="chip" data-oblen="${v}" aria-pressed="${P.length===v}">${l}</button>`).join("")}</div></div>
    <div class="ctrl"><span class="lbl">Standalones or series?</span><div class="chips">${[["mix","Either"],["standalone","Standalones"],["series","I like a series"]].map(([v,l])=>`<button class="chip" data-obser="${v}" aria-pressed="${P.series===v}">${l}</button>`).join("")}</div></div>
    <div class="actions"><button class="btn big" data-ob="done">See my recommendations</button><button class="btn quiet" data-ob="back">Back</button></div>`;
  $("#v-onboard").innerHTML = `<div class="onb">${bar}${h}</div>`;
  if(OB.step===2) renderObResults();
}
function searchCatalog(q, limit=12){
  const n = q.trim().toLowerCase(); if(n.length<2) return [];
  const words = n.split(/\s+/);
  return CAT.map(b=>{ const t=b.t.toLowerCase(), a=b.a.toLowerCase(); let s=0;
      if(t.startsWith(n)) s+=5; else if(t.includes(n)) s+=3;
      if(a.includes(n)) s+=3;
      if(words.every(w=>t.includes(w)||a.includes(w))) s+=2;
      return {b,s}; }).filter(x=>x.s>0).sort((x,y)=>y.s-x.s||x.b.t.localeCompare(y.b.t)).slice(0,limit).map(x=>x.b);
}
function renderObResults(){
  const el = $("#ob-results"); if(!el) return;
  const res = searchCatalog(OB.q, 8);
  el.innerHTML = res.map(b=>`<li><span><b>${esc(b.t)}</b><br><span class="muted small">${esc(b.a)} · ${b.y<0?-b.y+" BC":b.y}</span></span><span class="acts"><button class="btn ${S.profile.favorites.includes(b.id)?"":"ghost"}" data-obfav="${b.id}">${S.profile.favorites.includes(b.id)?"Picked ✓":"Pick"}</button></span></li>`).join("")
    || (OB.q.trim().length>=2?`<li><span class="muted">No matches in the catalog. You can add it later with “Add a book”, which also searches Open Library.</span></li>`:"");
}

/* ---------- Home ---------- */
function renderHome(){
  const P = S.profile, read = readBooks(), pages = read.reduce((a,b)=>a+(b.p||0),0);
  const year = new Date().getFullYear(), thisYear = read.filter(b=>b.fin && b.fin.startsWith(String(year))).length;
  const reading = Object.entries(S.shelf).filter(([,e])=>e.st==="reading").map(([id])=>book(id)).filter(Boolean);
  const want = Object.entries(S.shelf).filter(([,e])=>e.st==="want").length;
  const nx = upNext();
  const top = candidates().filter(b=>status(b.id)!=="want" && (!PREFS.lanes.length||PREFS.lanes.includes(b.lane))).sort((a,c)=>fit(c.id).score-fit(a.id).score).slice(0,5);
  const sparse = Object.values(S.custom).filter(b=>status(b.id)==="read" && isSparse(b)).length;
  const shelf = [...read].sort((a,b)=>(b.r||0)-(a.r||0) || (b.p||0)-(a.p||0)).slice(0,40);
  const series = seriesNext().sort((a,c)=>(status(c.b.id)==="want")-(status(a.b.id)==="want") || (c.avg||0)-(a.avg||0) || fit(c.b.id).score-fit(a.b.id).score).slice(0,4);
  $("#v-home").innerHTML = `
  <div class="block"><div class="eyebrow">${P.name?esc(P.name)+"'s bookshelf":"Your bookshelf"}</div>
    <h1>${read.length ? `${fmt(pages)} pages. ${read.length} book${read.length===1?"":"s"}.` : "Let's find your next book."}</h1></div>
  ${!storageOK?`<p class="notice">This browser isn't letting Bookshelf save. Download a backup from Profile before closing the page.</p>`:""}
  ${safetyNotices()}
  ${sparse?`<p class="notice">${sparse} book${sparse>1?"s you've read need":" you've read needs"} quick details to count fully. <a href="#mybooks" data-act="showsparse">Fill them in</a></p>`:""}
  <div class="kpis">
    <div class="kpi"><b>${read.length}</b><span>books read</span></div>
    <div class="kpi"><b>${fmt(pages)}</b><span>pages read</span></div>
    <div class="kpi"><b>${RATED.length?fmt1(TP.raw)+"★":"–"}</b><span>average rating</span></div>
    <div class="kpi"><b>${thisYear}</b><span>finished in ${year}</span></div>
    <div class="kpi"><b>${pagesPerDay().ppd}</b><span>pages a day${pagesPerDay().basis.startsWith("your")?"":" (estimate)"}</span></div>
    <div class="kpi"><b>${want}</b><span>on your list</span></div>
  </div>
  <div class="grid3">
    <div class="panel feature"><div class="eyebrow">Reading now</div>
      ${reading.length?reading.map(b=>{ const e=entry(b.id); return `<div class="t">${esc(b.t)}</div><div class="muted small">${esc(b.a)}${b.p?` · ${fmt(Math.round(b.p*(e.pct||0)/100))} of ${fmt(b.p)} pages`:""}</div><div class="progress"><i style="width:${e.pct||0}%"></i></div><div class="actions"><button class="btn ghost" data-act="open" data-id="${b.id}">Update progress</button></div>`; }).join("<hr style='border:0;border-top:1px solid var(--rule);width:100%'>"):`<p class="muted small">Nothing yet. Open any book and tap <b>Reading</b>.</p>`}
    </div>
    <div class="panel feature"><div class="eyebrow">${nx?(nx.auto?(nx.fromList?"Up next · best fit on your list":"Up next · top recommendation"):"Up next · your pick"):"Up next"}</div>
      ${nx?`<div style="display:flex;gap:.8rem;align-items:flex-start">${coverEl(nx.b).replace('class="cover"','class="cover big"')}<div style="min-width:0"><div class="t">${esc(nx.b.t)}</div><div class="muted small">${esc(nx.b.a)}${nx.b.p?` · ${fmt(nx.b.p)} pages · ~${daysFor(nx.b.p)} days`:""}</div></div></div>
      <div class="progress" title="Fit ${fit(nx.b.id).fit}"><i style="width:${fit(nx.b.id).fit}%"></i></div>
      <div class="muted small">Fit ${fit(nx.b.id).fit}. ${esc(whyLines(nx.b)[0])}</div>
      <div class="actions"><button class="btn ghost" data-act="open" data-id="${nx.b.id}">See details</button></div>`:`<p class="muted small">Add some books to get a pick.</p>`}
    </div>
    <div class="panel feature"><div class="eyebrow">Add to your shelf</div>
      <p class="small">Log what you've read, what you're reading and what you want to read. Rating books you've finished is what makes recommendations good.</p>
      <div class="actions"><button class="btn" data-act="addbook">Add a book</button><a class="btn ghost" href="#profile">Import Goodreads</a></div>
      ${read.length?`<p class="small"><a href="#profile" data-act="gofriend">Share your shelf with a friend</a> to compare tastes.</p>`:""}
    </div>
  </div>
  ${goalPanel()}
  ${series.length?`<div class="block"><h2>Next in your series</h2><p class="muted small">You've started these. Here's the next one in each that you haven't read.</p>
    <ul class="books">${series.map(x=>bookCard(x.b,{ctx:"ser", note:x.gap?`${x.name} #${x.k}`:`${x.name} #${x.k}, after ${x.after.t}`})).join("")}</ul></div>`:""}
  ${read.length?`<div class="block"><h2>Your shelf</h2><p class="muted small">Spine width is book length. Darker means a higher rating.</p>
    <div class="shelf">${shelf.map((b,i)=>`<button class="spine ${rCls(b.r)}" style="flex:${b.p||300} 1 0;height:${80+((i*37)%21)}%" data-act="open" data-id="${b.id}" title="${esc(b.t)}${b.r?", "+starTxt(b.r):""}"><span>${esc(b.t)}</span></button>`).join("")}</div>
    <div class="legend"><span><i class="r5"></i>5 stars</span><span><i class="r4"></i>4 to 4.5</span><span><i class="r3"></i>3 to 3.5</span><span><i class="r2"></i>Under 3</span><span><i class="r0"></i>Not rated</span></div></div>`:""}
  <div class="grid2">
    <div class="block"><h2>Top picks for you</h2><p class="muted small">${PREFS.lanes.length?`In your genres: ${PREFS.lanes.join(", ")}.`:"Across every genre."} Open one to see why.</p>
      <ul class="books">${top.map((b,i)=>bookCard(b,{ctx:"home",rank:i+1})).join("")}</ul><p><a href="#discover">Explore all recommendations</a></p></div>
    <div class="block"><h2>What your ratings say</h2>${RATED.length>=3?`<ul class="insights">${insights().map(s=>`<li>${s}</li>`).join("")}</ul><p><a href="#taste">See every chart</a></p>`:`<p class="empty">Rate at least three books you've read and patterns in your taste show up here.</p>`}</div>
  </div>`;
}
function insights(){
  const out=[], avg=a=>a.reduce((s,b)=>s+b.r,0)/a.length;
  const withP = RATED.filter(b=>b.p);
  const hi = withP.filter(b=>b.r>=4.5), lo = withP.filter(b=>b.r<4.5);
  if(hi.length && lo.length) out.push(`Your favorite books (4.5★ and up) average <b>${fmt(hi.reduce((a,b)=>a+b.p,0)/hi.length)} pages</b>. The rest average ${fmt(lo.reduce((a,b)=>a+b.p,0)/lo.length)}.`);
  const lanes = groupAvg(RATED,b=>b.lane).filter(x=>x.n>=2).sort((a,b)=>b.v-a.v);
  if(lanes.length>=2) out.push(`Highest-rated genre: <b>${esc(lanes[0].label)}</b> at ${fmt1(lanes[0].v)}★ (${lanes[0].n} books). Lowest: ${esc(lanes[lanes.length-1].label)} at ${fmt1(lanes[lanes.length-1].v)}★.`);
  const fp = RATED.filter(b=>povClass(b)==="first"), tp = RATED.filter(b=>povClass(b)==="third");
  if(fp.length>=2 && tp.length>=2) out.push(`First-person books average <b>${fmt1(avg(fp))}★</b> vs ${fmt1(avg(tp))}★ for third person.`);
  const fast = RATED.filter(b=>b.pace===3), slow = RATED.filter(b=>b.pace&&b.pace<3);
  if(fast.length>=2 && slow.length>=2) out.push(`Fast-paced books average <b>${fmt1(avg(fast))}★</b> vs ${fmt1(avg(slow))}★ for steadier ones.`);
  const tags = Object.entries(TP.aff).filter(([,v])=>v.n>=2).sort((a,b)=>b[1].avg-a[1].avg||b[1].n-a[1].n);
  if(tags.length) out.push(`Best-rated theme: <b>${esc(TAGS[tags[0][0]])}</b>, ${fmt1(tags[0][1].avg)}★ across ${tags[0][1].n} books.`);
  const auth={}; readBooks().forEach(b=>auth[b.a]=(auth[b.a]||0)+1); const rep=Object.entries(auth).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if(rep.length) out.push(`Most-read author${rep.length>1?"s":""}: ${rep.map(([a,n])=>`${esc(a)} (${n})`).join(", ")}.`);
  return out;
}

/* ---------- reading goal ---------- */
const goalFor = y => (S.profile.goals||{})[y] || null;
const finishedIn = y => readBooks().filter(b=>b.fin && b.fin.startsWith(String(y)));
let GOALEDIT = false;
function goalPanel(){
  const y = new Date().getFullYear(), g = goalFor(y), n = finishedIn(y).length;
  if(GOALEDIT || !g){
    if(!GOALEDIT && S.hints && S.hints["goal"+y]) return `<p class="muted small"><a href="#year" >Your ${y} in books</a> · <a href="#home" data-act="goaledit">Set a ${y} reading goal</a></p>`;
    return `<div class="panel resultbar"><span><b>${g?"Change your":"Set a"} ${y} reading goal</b> <span class="muted small">How many books do you want to finish this year?</span></span>
      <span class="actions"><input type="number" id="goal-n" min="1" max="500" value="${g||Math.max(12, n+4)}" style="width:6rem" aria-label="Books this year"><button class="btn" data-act="goalsave">Save</button>${g?`<button class="btn quiet" data-act="goaloff">Remove goal</button>`:`<button class="btn quiet" data-act="hint" data-k="goal${y}">No thanks</button>`}</span></div>`;
  }
  const start = new Date(y,0,1), end = new Date(y+1,0,1), frac = (Date.now()-start)/(end-start);
  const due = g*frac, diff = Math.round(n-due), pct = Math.min(100, Math.round(n/g*100));
  const pace = n>=g ? `Goal reached${n>g?`, ${n-g} over`:""}. Nice.` : diff>=1 ? `${diff} book${diff===1?"":"s"} ahead of pace.` : diff<=-1 ? `${-diff} book${diff===-1?"":"s"} behind pace. ${Math.ceil((g-n)/Math.max(1,(end-Date.now())/(7*864e5)))} a week gets you there.` : "Right on pace.";
  return `<div class="panel block"><div class="resultbar"><span><span class="eyebrow">${y} goal</span><div class="t" style="font-family:var(--display);font-size:1.25rem">${n} of ${g} books</div></span><span class="actions"><a class="btn ghost" href="#year">Your ${y} in books</a><button class="btn quiet" data-act="goaledit">Edit</button></span></div>
    <div class="progress" title="${pct}%"><i style="width:${pct}%"></i></div><p class="muted small">${pace}</p></div>`;
}

/* ---------- Year in review ---------- */
let YEAR = null;
function renderYear(){
  const all = readBooks(), years = [...new Set(all.filter(b=>b.fin).map(b=>+b.fin.slice(0,4)))].sort((a,b)=>b-a);
  const thisY = new Date().getFullYear(); if(!years.includes(thisY)) years.unshift(thisY);
  const y = YEAR && years.includes(YEAR) ? YEAR : years[0];
  const books = finishedIn(y), prev = finishedIn(y-1), g = goalFor(y);
  const undated = all.filter(b=>!b.fin).length;
  const chips = years.length>1 ? `<div class="chips">${years.map(v=>`<button class="chip" data-year="${v}" aria-pressed="${v===y}">${v}</button>`).join("")}</div>` : "";
  const head = `<div class="block"><div class="eyebrow">Year in review</div><h1>Your ${y} in books</h1>${chips}</div>`;
  if(!books.length){ $("#v-year").innerHTML = head + `<p class="empty">No finished books dated ${y} yet. Books count here once they have a finish date${undated?`. ${undated} of your read books ${undated===1?"doesn't":"don't"} have one: open them in My books to add it`:""}.</p>`; return; }
  const pages = books.reduce((a,b)=>a+(b.p||0),0), rated = books.filter(b=>b.r), avg = rated.length ? rated.reduce((a,b)=>a+b.r,0)/rated.length : null;
  const top = [...rated].sort((a,b)=>b.r-a.r || (b.p||0)-(a.p||0));
  const best = top.filter(b=>b.r===top[0].r).slice(0,5);
  const withP = books.filter(b=>b.p), longest = [...withP].sort((a,b)=>b.p-a.p)[0], shortest = [...withP].sort((a,b)=>a.p-b.p)[0];
  const timed = books.filter(b=>b.start && b.fin && b.p).map(b=>({b, d:Math.max(1,Math.round((new Date(b.fin)-new Date(b.start))/864e5))})).filter(x=>x.d<400);
  const fastest = [...timed].sort((a,c)=>c.b.p/c.d - a.b.p/a.d)[0];
  const months = Array.from({length:12},(_,i)=>{ const k = `${y}-${String(i+1).padStart(2,"0")}`; return {label:new Date(y,i,1).toLocaleDateString("en-US",{month:"short"}), v:books.filter(b=>b.fin.startsWith(k)).length}; });
  const busiest = [...months].sort((a,b)=>b.v-a.v)[0];
  const lanes = LANES.map(l=>({label:l, v:books.filter(b=>b.lane===l).length})).filter(x=>x.v).sort((a,b)=>b.v-a.v);
  const prevL = {}; prev.forEach(b=>{ if(b.lane) prevL[b.lane]=(prevL[b.lane]||0)+1; });
  const shift = prev.length>=3 ? lanes.map(x=>({l:x.label, d:x.v-(prevL[x.label]||0)})).concat(Object.keys(prevL).filter(l=>!lanes.some(x=>x.label===l)).map(l=>({l, d:-prevL[l]}))).filter(x=>Math.abs(x.d)>=2).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,3) : [];
  const auth = {}; books.forEach(b=>auth[b.a]=(auth[b.a]||0)+1); const topAuth = Object.entries(auth).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const pubs = books.filter(b=>b.y), oldest = [...pubs].sort((a,b)=>a.y-b.y)[0], newest = [...pubs].sort((a,b)=>b.y-a.y)[0];
  const dnf = Object.entries(S.shelf).filter(([,e])=>e.st==="dnf" && e.stop && e.stop.startsWith(String(y))).length;
  const seriesDone = books.filter(b=>parseSeries(b.series)).length;
  const facts = [];
  if(longest) facts.push(`Longest: <b>${esc(longest.t)}</b>, ${fmt(longest.p)} pages.`);
  if(shortest && shortest!==longest) facts.push(`Shortest: <b>${esc(shortest.t)}</b>, ${fmt(shortest.p)} pages.`);
  if(fastest) facts.push(`Fastest read: <b>${esc(fastest.b.t)}</b>, ${fmt(fastest.b.p/fastest.d)} pages a day over ${fastest.d} day${fastest.d===1?"":"s"}.`);
  if(busiest.v>1) facts.push(`Busiest month: <b>${busiest.label}</b>, ${busiest.v} books.`);
  if(topAuth.length) facts.push(`Most-read author${topAuth.length>1?"s":""}: ${topAuth.map(([a,n])=>`<b>${esc(a)}</b> (${n})`).join(", ")}.`);
  if(oldest && newest && oldest!==newest) facts.push(`Oldest book: <b>${esc(oldest.t)}</b> (${oldest.y<0?-oldest.y+" BC":oldest.y}). Newest: <b>${esc(newest.t)}</b> (${newest.y}).`);
  const fm = {}; books.forEach(b=>{ if(b.fmt) fm[b.fmt]=(fm[b.fmt]||0)+1; });
  if(Object.keys(fm).length) facts.push(`Formats: ${Object.entries(fm).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<b>${n}</b> ${k==="audio"?(n===1?"audiobook":"audiobooks"):k==="ebook"?(n===1?"ebook":"ebooks"):"in print"}`).join(", ")}.`);
  if(seriesDone) facts.push(`${seriesDone} of your books were part of a series.`);
  if(dnf) facts.push(`You set aside ${dnf} book${dnf===1?"":"s"} without finishing. Life's short.`);
  shift.forEach(x=>facts.push(`${x.d>0?"More":"Less"} <b>${esc(x.l)}</b> than ${y-1} (${x.d>0?"+":""}${x.d}).`));
  const shelf = [...books].sort((a,b)=>String(a.fin).localeCompare(String(b.fin)));
  $("#v-year").innerHTML = head + `
  <div class="kpis">
    <div class="kpi"><b>${books.length}</b><span>books finished${g?` of ${g}`:""}</span></div>
    <div class="kpi"><b>${fmt(pages)}</b><span>pages</span></div>
    <div class="kpi"><b>${avg?fmt1(avg)+"★":"–"}</b><span>average rating</span></div>
    <div class="kpi"><b>${fmt(pages/ (y===thisY ? Math.max(1,(Date.now()-new Date(y,0,1))/864e5) : 365))}</b><span>pages a day</span></div>
    <div class="kpi"><b>${prev.length?(books.length-prev.length>=0?"+":"")+(books.length-prev.length):"–"}</b><span>vs. ${y-1}</span></div>
    <div class="kpi"><b>${lanes[0]?esc(lanes[0].label):"–"}</b><span>top genre</span></div>
  </div>
  ${g?`<div class="block"><div class="progress"><i style="width:${Math.min(100,Math.round(books.length/g*100))}%"></i></div><p class="muted small">${books.length>=g?`Goal of ${g} reached.`:`${g-books.length} to go to reach your goal of ${g}.`}</p></div>`:""}
  <div class="block"><h2>Your ${y} shelf</h2><p class="muted small">In the order you finished them. Darker means a higher rating.</p>
    <div class="shelf">${shelf.map((b,i)=>`<button class="spine ${rCls(b.r)}" style="flex:${b.p||300} 1 0;height:${80+((i*37)%21)}%" data-act="open" data-id="${b.id}" title="${esc(b.t)}${b.r?", "+starTxt(b.r):""}"><span>${esc(b.t)}</span></button>`).join("")}</div></div>
  <div class="grid2">
    <div class="panel block"><h3>Your best of ${y}</h3>${best.length?`<ul class="insights">${best.map(b=>`<li><b>${esc(b.t)}</b> <span class="muted">${esc(b.a)} · ${starTxt(b.r)}</span></li>`).join("")}</ul>`:`<p class="muted small">Rate the books you finished to see your favorites.</p>`}</div>
    <div class="panel block"><h3>The year in numbers</h3><ul class="insights">${facts.map(f=>`<li>${f}</li>`).join("")}</ul></div>
    <div class="panel block"><h3>Books by month</h3>${hbars(months,"")}</div>
    <div class="panel block"><h3>By genre</h3>${hbars(lanes," books")}</div>
  </div>
  ${undated?`<p class="muted small">${undated} read book${undated===1?" has":"s have"} no finish date, so ${undated===1?"it isn't":"they aren't"} counted here. Add dates in My books.</p>`:""}`;
}

/* ---------- Discover ---------- */
const FS = Object.assign({mode:"fit", like:null, len:"any", lanes:null, series:"any", pace:"any", must:[], hooksMin:0, award:false, all:false, preset:"best"}, (()=>{ try{ return JSON.parse(localStorage.getItem("bookshelf-find"))||{}; }catch(e){ return {}; } })());
function presets(){
  const favs = PREFS.favorites.map(book).filter(Boolean).slice(0,3);
  return [
    ["best","Best for you",{}],
    ...favs.map(b=>["like:"+b.id,`More like ${b.t.length>28?b.t.slice(0,26)+"…":b.t}`,{mode:"like",like:b.id,lanes:"all"}]),
    ["hooks","Lots of what hooks you",{hooksMin:2,lanes:"all"}],
    ["quick","Quick and gripping",{len:"short",pace:"3"}],
    ["big","Big and immersive",{len:"long+"}],
    ["awards","Award winners",{award:true,lanes:"all"}],
    ["different","Something different",{lanes:"off"}]
  ];
}
function applyPreset(key){
  const p = presets().find(x=>x[0]===key); if(!p) return; const v = p[2];
  Object.assign(FS, {preset:key, mode:v.mode||"fit", like:v.like||FS.like, len:v.len||"any", pace:v.pace||"any", must:[], hooksMin:v.hooksMin||0, series:"any", award:!!v.award, all:false});
  FS.lanes = v.lanes==="all" ? [...LANES] : v.lanes==="off" ? LANES.filter(l=>PREFS.lanes.length && !PREFS.lanes.includes(l)) : null;
}
const fLanes = () => FS.lanes || (PREFS.lanes.length ? PREFS.lanes : [...LANES]);
function findResults(){
  const like = FS.mode==="like" && FS.like ? book(FS.like) : null, lanes = fLanes();
  let list = candidates().filter(b=>
    (!b.lane || lanes.includes(b.lane)) && inLen(b.p, FS.len) && (FS.pace==="any" || String(b.pace)===FS.pace) &&
    (FS.series==="any" || (FS.series==="standalone" ? (!b.series || /stands alone/.test(b.series)) : (b.series && !/stands alone/.test(b.series)))) &&
    FS.must.every(t=>b.tags.includes(t)) && fit(b.id).hooks.length>=FS.hooksMin && (!FS.award || b.aw));
  list = list.map(b=>{ const f=fit(b.id); const sim = like ? similarity(b, like) : 0; return {b, key: like ? sim*0.7+(f.fit/100)*0.3 : f.score, sim}; });
  list.sort((a,c)=>c.key-a.key);
  return list;
}
function renderDiscoverControls(){
  const tagOpts = ["narrator","catmouse","twists","underdog","mystery","spy","time","heist","war","academy","worldbuild","science","funny","emotional","epic","truestory","sports","space"];
  const readOpts = readBooks().sort((a,b)=>(b.r||0)-(a.r||0));
  $("#v-discover").innerHTML = `
  <div class="block"><div class="eyebrow">Discover</div><h2>What are you in the mood for?</h2>
    <p class="lede">Ranked by fit: how you rated the books most like each one, plus a boost for what you said hooks you. ${RATED.length<5?"Rate more of what you've read and this gets sharper.":""}</p></div>
  <div class="panel controls">
    <div class="ctrl"><span class="lbl">Start from</span><div class="chips">${presets().map(([k,l])=>`<button class="chip" data-preset="${k}" aria-pressed="${FS.preset===k}">${esc(l)}</button>`).join("")}</div></div>
    ${readOpts.length?`<div class="ctrl"><span class="lbl">Rank by</span><div class="chips"><button class="chip" data-fmode="fit" aria-pressed="${FS.mode==="fit"}">Best fit for you</button><button class="chip" data-fmode="like" aria-pressed="${FS.mode==="like"}">Most like a book you've read</button>
      <select id="f-like" aria-label="Book to compare against" style="width:auto;min-width:12rem"${FS.mode==="like"?"":" hidden"}>${readOpts.map(b=>`<option value="${b.id}"${FS.like===b.id?" selected":""}>${esc(b.t)}${b.r?` (${starTxt(b.r)})`:""}</option>`).join("")}</select></div></div>`:""}
    <div class="ctrl"><span class="lbl">Genres</span><div class="chips">${LANES.map(l=>`<button class="chip" data-flane="${l}" aria-pressed="${fLanes().includes(l)}">${l}</button>`).join("")}</div></div>
    <div class="selects">
      <label class="ctrl"><span class="lbl">Length</span><select id="f-len">${Object.entries(LENF).map(([k,v])=>`<option value="${k}"${FS.len===k?" selected":""}>${v[0]}</option>`).join("")}</select></label>
      <label class="ctrl"><span class="lbl">Pace</span><select id="f-pace"><option value="any">Any pace</option><option value="3"${FS.pace==="3"?" selected":""}>Fast</option><option value="2"${FS.pace==="2"?" selected":""}>Steady</option><option value="1"${FS.pace==="1"?" selected":""}>Slow burn</option></select></label>
      <label class="ctrl"><span class="lbl">Series</span><select id="f-series"><option value="any">Either</option><option value="standalone"${FS.series==="standalone"?" selected":""}>Standalone</option><option value="series"${FS.series==="series"?" selected":""}>Start a series</option></select></label>
      <label class="ctrl"><span class="lbl">Your hooks</span><select id="f-hooks"><option value="0">Any</option><option value="1"${FS.hooksMin===1?" selected":""}>At least 1</option><option value="2"${FS.hooksMin===2?" selected":""}>At least 2</option><option value="3"${FS.hooksMin===3?" selected":""}>At least 3</option></select></label>
    </div>
    <div class="ctrl"><span class="lbl">Must include</span><div class="chips">${tagOpts.map(t=>`<button class="chip" data-fmust="${t}" aria-pressed="${FS.must.includes(t)}">${esc(TAGS[t])}</button>`).join("")}</div></div>
    <label class="check"><input type="checkbox" id="f-award"${FS.award?" checked":""}> Major award winners only</label>
  </div>
  <div id="f-results" class="block"></div>`;
}
function renderDiscoverResults(){
  try{ localStorage.setItem("bookshelf-find", JSON.stringify(FS)); }catch(e){}
  const list = findResults(), like = FS.mode==="like" && FS.like ? book(FS.like) : null, show = FS.all ? list : list.slice(0,12);
  const el = $("#f-results"); if(!el) return;
  el.innerHTML = `<div class="resultbar"><h3>${list.length} match${list.length===1?"":"es"}${like?` · ranked by similarity to ${esc(like.t)}`:""}</h3><button class="btn ghost" data-act="surprise"${list.length?"":" disabled"}>Surprise me</button></div>
    ${list.length?`<ul class="books">${show.map((x,i)=>bookCard(x.b,{ctx:"disc",rank:i+1})).join("")}</ul>`:`<p class="empty">Nothing matches every filter. Try removing a “Must include” theme or widening the length.</p>`}
    ${list.length>12?`<button class="btn ghost" data-act="findall">${FS.all?"Show top 12":"Show all "+list.length}</button>`:""}`;
}

/* ---------- My books ---------- */
const MB = {tab:"read", sort:"recent", onlySparse:false, fmt:"any"};
function renderMyBooks(){
  const groups = {read:[],reading:[],want:[],dnf:[],passed:[]};
  Object.entries(S.shelf).forEach(([id,e])=>{ const b=book(id); if(b && groups[e.st]) groups[e.st].push(b); });
  let list = groups[MB.tab] || [];
  if(MB.onlySparse) list = list.filter(isSparse);
  if(MB.fmt!=="any") list = list.filter(b=>(S.shelf[b.id]||{}).fmt===MB.fmt);
  const e = id => S.shelf[id] || {};
  const sorts = {recent:(a,b)=>String(e(b.id).fin||e(b.id).stop||e(b.id).at||"").localeCompare(String(e(a.id).fin||e(a.id).at||"")), rating:(a,b)=>(e(b.id).r||0)-(e(a.id).r||0), fit:(a,b)=>fit(b.id).score-fit(a.id).score, title:(a,b)=>a.t.localeCompare(b.t), pages:(a,b)=>(a.p||0)-(b.p||0)};
  list.sort(sorts[MB.sort]||sorts.recent);
  const labels = {read:"Read",reading:"Reading",want:"Want to read",dnf:"Didn't finish",passed:"Not for me"};
  const sortOpts = MB.tab==="read" ? [["recent","Recently finished"],["rating","Your rating"],["title","Title"],["pages","Shortest first"]] : [["recent","Recently added"],["fit","Best fit"],["title","Title"],["pages","Shortest first"]];
  if(!sortOpts.some(o=>o[0]===MB.sort)) MB.sort = sortOpts[0][0];
  $("#v-mybooks").innerHTML = `
  <div class="block"><div class="eyebrow">My books</div><h2>Your shelf</h2></div>
  <div class="resultbar"><div class="chips">${Object.keys(labels).map(k=>`<button class="chip" data-mbtab="${k}" aria-pressed="${MB.tab===k}">${labels[k]} (${groups[k].length})</button>`).join("")}</div>
    <div class="actions"><label class="ctrl" style="min-width:11rem"><span class="lbl">Sort</span><select id="mb-sort">${sortOpts.map(([v,l])=>`<option value="${v}"${MB.sort===v?" selected":""}>${l}</option>`).join("")}</select></label><label class="ctrl" style="min-width:9rem"><span class="lbl">Format</span><select id="mb-fmt"><option value="any">Any format</option>${Object.entries(FORMATS).map(([k,l])=>`<option value="${k}"${MB.fmt===k?" selected":""}>${l}</option>`).join("")}</select></label><button class="btn" data-act="addbook">Add a book</button></div></div>
  ${MB.onlySparse?`<p class="notice">Showing books that need quick details. <a href="#mybooks" data-act="allbooks">Show all</a></p>`:""}
  ${list.length?`<ul class="books">${list.map(b=>bookCard(b,{ctx:"mb"})).join("")}</ul>`:`<p class="empty">${MB.tab==="read"?"Books you finish go here. Tap “Add a book” to log ones you've already read.":MB.tab==="want"?"Your to-read list is empty. Add books from Discover or Browse.":MB.tab==="reading"?"Nothing in progress.":MB.tab==="dnf"?"Books you stop partway go here, with where you stopped. Open a book and tap “Didn't finish”.":"Books you pass on go here and stop showing up in recommendations."}</p>`}`;
}

/* ---------- Browse ---------- */
const BS = {q:"", lanes:[], len:"any", pace:"any", talk:"any", pov:"any", era:"any", series:"any", award:false, tags:[], sort:"fit", hideShelf:false, limit:60};
function browseMatches(b){
  const q = BS.q.trim().toLowerCase();
  if(q){ const hay = [b.t,b.a,b.sub,b.set,b.lane,ERAS[b.era]||"",b.hook,b.series,...b.tags.map(t=>TAGS[t])].join(" ").toLowerCase(); if(!q.split(/\s+/).every(w=>hay.includes(w))) return false; }
  if(BS.lanes.length && !BS.lanes.includes(b.lane)) return false;
  if(!inLen(b.p, BS.len)) return false;
  if(BS.pace!=="any" && String(b.pace)!==BS.pace) return false;
  if(BS.talk!=="any" && String(b.talk)!==BS.talk) return false;
  if(BS.pov!=="any" && povClass(b)!==BS.pov) return false;
  if(BS.era!=="any" && b.era!==BS.era) return false;
  if(BS.series==="standalone" && b.series && !/stands alone/.test(b.series)) return false;
  if(BS.series==="series" && (!b.series || /stands alone/.test(b.series))) return false;
  if(BS.award && !b.aw) return false;
  if(BS.tags.length && !BS.tags.every(t=>b.tags.includes(t))) return false;
  if(BS.hideShelf && status(b.id)) return false;
  return true;
}
function browseSort(a,b){
  switch(BS.sort){
    case "pagesA": return (a.p||0)-(b.p||0); case "pagesD": return (b.p||0)-(a.p||0);
    case "yearD": return b.y-a.y; case "yearA": return a.y-b.y;
    case "title": return a.t.replace(/^(The|A|An) /,"").localeCompare(b.t.replace(/^(The|A|An) /,""));
    case "author": return lastName(a.a).localeCompare(lastName(b.a));
    default: return fit(b.id).score-fit(a.id).score;
  }
}
function renderBrowseControls(){
  const sel = (id,label,opts,cur) => `<label class="ctrl"><span class="lbl">${label}</span><select id="${id}">${opts.map(([v,l])=>`<option value="${v}"${String(cur)===String(v)?" selected":""}>${l}</option>`).join("")}</select></label>`;
  const wide = window.matchMedia("(min-width: 760px)").matches;
  $("#v-browse").innerHTML = `
  <div class="block"><div class="eyebrow">Browse</div><h2>The whole catalog</h2><p class="lede">${fmt(CAT.length)} books, each described by hand: themes, pace, dialogue, narration, setting and more. Search by title, author, place or theme.</p></div>
  <input type="search" id="b-q" placeholder="Try “spy”, “Mars”, “Civil War”, “le Carré” or “twists”" value="${esc(BS.q)}" aria-label="Search the catalog">
  <details class="filterbox panel"${wide?" open":""}><summary>Filters and sorting <span class="muted small" id="b-active"></span></summary>
    <div class="controls">
      <div class="ctrl"><span class="lbl">Genres</span><div class="chips">${LANES.map(l=>`<button class="chip" data-blane="${l}" aria-pressed="${BS.lanes.includes(l)}">${l}</button>`).join("")}</div></div>
      <div class="selects">
        ${sel("b-sort","Sort by",[["fit","Best fit for you"],["pagesA","Shortest first"],["pagesD","Longest first"],["yearD","Newest first"],["yearA","Oldest first"],["title","Title A–Z"],["author","Author A–Z"]],BS.sort)}
        ${sel("b-len","Length",Object.entries(LENF).map(([k,v])=>[k,v[0]]),BS.len)}
        ${sel("b-pace","Pace",[["any","Any pace"],["3","Fast"],["2","Steady"],["1","Slow burn"]],BS.pace)}
        ${sel("b-talk","Dialogue",[["any","Any amount"],["1","Light"],["2","Moderate"],["3","Heavy"]],BS.talk)}
        ${sel("b-pov","Narration",[["any","Any"],["first","First person or memoir"],["third","Third person or reported"],["other","Other voices"]],BS.pov)}
        ${sel("b-era","Setting era",[["any","Any era"],...Object.entries(ERAS)],BS.era)}
        ${sel("b-series","Series",[["any","Either"],["standalone","Standalone"],["series","Series starter or entry"]],BS.series)}
      </div>
      <div class="ctrl"><span class="lbl">Themes (match all)</span><div class="chips">${Object.keys(TAGS).map(t=>`<button class="chip" data-btag="${t}" aria-pressed="${BS.tags.includes(t)}">${esc(TAGS[t])}</button>`).join("")}</div></div>
      <div class="resultbar"><span class="actions"><label class="check"><input type="checkbox" id="b-award"${BS.award?" checked":""}> Award winners only</label><label class="check"><input type="checkbox" id="b-hide"${BS.hideShelf?" checked":""}> Hide books already on my shelf</label></span><button class="btn ghost" data-act="bclear">Clear filters</button></div>
    </div>
  </details>
  <div id="b-results" class="block"></div>`;
}
function renderBrowseResults(){
  const list = CAT.filter(browseMatches).sort(browseSort);
  const n = ["len","pace","talk","pov","era","series"].filter(k=>BS[k]!=="any").length + BS.lanes.length + BS.tags.length + (BS.award?1:0) + (BS.hideShelf?1:0);
  const a = $("#b-active"); if(a) a.textContent = n ? `· ${n} active` : "";
  const el = $("#b-results"); if(!el) return;
  el.innerHTML = `<div class="resultbar"><h3>${fmt(list.length)} book${list.length===1?"":"s"}</h3><span class="muted small">Fit is your predicted rating on a 0–100 scale: 60 ≈ 4★, 80 ≈ 4.5★.</span></div>
    ${list.length?`<ul class="books">${list.slice(0,BS.limit).map(b=>bookCard(b,{ctx:"br"})).join("")}</ul>`:`<p class="empty">No books match. <button class="btn ghost" data-act="bclear">Clear filters</button></p>`}
    ${list.length>BS.limit?`<button class="btn ghost" data-act="bmore">Show more (${fmt(list.length-BS.limit)} left)</button>`:""}`;
}

/* ---------- Taste ---------- */
function scatter(){
  const host = $("#t-scatter"); if(!host) return;
  const pts = RATED.filter(b=>b.p); if(!pts.length){ host.innerHTML = `<p class="muted small">No page counts yet.</p>`; return; }
  const W = Math.max(300, host.clientWidth||600), H = 260, m = {l:40,r:14,t:14,b:38};
  const maxP = Math.max(600, Math.ceil(Math.max(...pts.map(b=>b.p))/250)*250);
  const x = p => m.l + p/maxP*(W-m.l-m.r), y = r => m.t + (5.25-r)/(5.25-0.25)*(H-m.t-m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Pages against your rating">`;
  [1,2,3,4,5].forEach(v=>{ s += `<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/><text x="${m.l-8}" y="${y(v)+4}" text-anchor="end" font-size="12">${v}★</text>`; });
  for(let v=250; v<=maxP; v+=250) s += `<text x="${x(v)}" y="${H-m.b+18}" text-anchor="middle" font-size="12">${v}</text>`;
  s += `<text x="${(W+m.l)/2}" y="${H-4}" text-anchor="middle" font-size="12">pages</text>`;
  pts.forEach(b=>{ s += `<circle cx="${x(b.p)}" cy="${y(b.r)}" r="6.5" fill="var(--accent)" stroke="var(--card)" stroke-width="2" data-tip="${esc(b.t)} · ${b.p} pages · ${starTxt(b.r)}" tabindex="0"/>`; });
  host.innerHTML = s + "</svg>";
}
function renderTaste(){
  if(RATED.length<3){ $("#v-taste").innerHTML = `<div class="block"><div class="eyebrow">My taste</div><h2>Your patterns show up here</h2><p class="empty">Rate at least three books you've read. With ten or more, the charts get genuinely telling.</p><div class="actions"><button class="btn" data-act="addbook">Add a book you've read</button></div></div>`; return; }
  const ref = TP.raw;
  const dist = [5,4.5,4,3.5,3,2.5,2,1.5,1,0.5].map(r=>({label:starTxt(r), v:RATED.filter(b=>b.r===r).length})).filter(x=>x.v);
  const tagRows = Object.entries(TP.aff).filter(([,v])=>v.n>=2).sort((a,b)=>b[1].avg-a[1].avg||b[1].n-a[1].n).map(([t,v])=>({label:TAGS[t]||t, v:v.avg, n:v.n, bold:PREFS.hooks.includes(t)}));
  const months = []; const now = new Date(); for(let i=11;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); months.push([d.toISOString().slice(0,7), d.toLocaleDateString("en-US",{month:"short",year:"2-digit"})]); }
  const read = readBooks();
  const perMonth = months.map(([k,l])=>({label:l, v:read.filter(b=>b.fin&&b.fin.startsWith(k)).length}));
  const dec = {}; read.forEach(b=>{ if(b.y){ const d=b.y<1900?"Before 1900":Math.floor(b.y/10)*10+"s"; dec[d]=(dec[d]||0)+1; } });
  const loo = RATED.length>=6 ? RATED.map(r=>{ const others=RATED.filter(x=>x!==r); return Math.abs(fitFor(r, others, tasteProfile(others), PREFS).pred - r.r); }).reduce((a,b)=>a+b,0)/RATED.length : null;
  $("#v-taste").innerHTML = `
  <p><a class="btn ghost" href="#year">Your ${new Date().getFullYear()} in books</a></p>
  <div class="block"><div class="eyebrow">My taste</div><h2>What ${RATED.length} ratings say</h2>
    <p class="lede">Each chart compares groups of books you've rated. The dashed line is your average of ${fmt1(ref)}★. The number of books sits beside every average, since small groups swing easily.</p></div>
  <div class="grid2">
    <div class="panel block"><h3>How you rate</h3>${hbars(dist," books")}</div>
    <div class="panel block"><h3>Length vs. rating</h3><div id="t-scatter"></div></div>
    <div class="panel block"><h3>Books finished, last 12 months</h3>${hbars(perMonth,"")}</div>
    <div class="panel block"><h3>By genre</h3>${dotPlot(groupAvg(RATED,b=>b.lane,LANES),ref)}</div>
    <div class="panel block"><h3>By narration</h3>${dotPlot(groupAvg(RATED,b=>povClass(b)==="first"?"First person or memoir":povClass(b)==="third"?"Third person or reported":povClass(b)?"Other voices":null),ref)}</div>
    <div class="panel block"><h3>By pace</h3>${dotPlot(groupAvg(RATED,b=>b.pace?PACE[b.pace]:null,["Fast","Steady","Slow burn"]),ref)}</div>
    <div class="panel block"><h3>By dialogue</h3>${dotPlot(groupAvg(RATED,b=>b.talk?TALK[b.talk]:null,["Light","Moderate","Heavy"]),ref)}</div>
    <div class="panel block"><h3>By length</h3>${dotPlot(groupAvg(RATED,b=>b.p?LEN_BUCKETS[lenIdx(b.p)][0]:null,LEN_BUCKETS.map(x=>x[0])),ref)}</div>
    <div class="panel block"><h3>By setting era</h3>${dotPlot(groupAvg(RATED,b=>b.era?ERAS[b.era]:null,Object.values(ERAS)),ref)}</div>
    ${RATED.filter(b=>b.fmt).length>=2?`<div class="panel block"><h3>By format</h3>${dotPlot(groupAvg(RATED,b=>b.fmt?FORMATS[b.fmt]:null,Object.values(FORMATS)),ref)}</div>`:""}
    <div class="panel block"><h3>When they were published</h3>${hbars(Object.keys(dec).sort().map(d=>({label:d,v:dec[d]}))," books")}</div>
  </div>
  ${tagRows.length?`<div class="panel block"><h3>By theme</h3><p class="muted small">Themes in at least two of your rated books. Bold rows are the ones you said hook you.</p>${dotPlot(tagRows,ref)}</div>`:""}
  <div class="panel block"><h3>How fit scores work</h3>
    <p>For each book, Bookshelf finds the books you've rated that are most like it (genre, themes, narration, pace, dialogue, length and era), averages your ratings of those with the closest counting most, and blends in how you rate each theme. Books with the things you said hook you get a boost, and genres you didn't pick get a small penalty. Your favorites count extra. Books you didn't finish or passed on count a little against books very like them (but never for having lots of dialogue).</p>
    <p style="margin-top:.6rem">The fit score is just the predicted rating on a 0–100 scale: 40 ≈ 3.5★, 60 ≈ 4★, 80 ≈ 4.5★, 99 ≈ 5★.</p>
    ${loo!==null?`<p class="muted" style="margin-top:.6rem">Tested on your own ratings (hiding each one and predicting it from the rest), it's off by about ${fmt1(loo)}★ on average. It gets sharper with every rating.</p>`:""}</div>`;
  scatter();
}

/* ---------- Profile ---------- */
function renderProfile(){
  const P = S.profile;
  const customs = Object.values(S.custom);
  const missing = customs.filter(b=>["read","want","reading"].includes(status(b.id)));
  $("#v-profile").innerHTML = `
  <div class="block"><div class="eyebrow">Profile</div><h2>${P.name?esc(P.name):"Your settings"}</h2></div>
  <div class="grid2">
    <div class="panel block"><h3>Your preferences</h3>
      <label class="ctrl"><span class="lbl">Name</span><input type="text" id="p-name" value="${esc(P.name)}"></label>
      <div class="ctrl"><span class="lbl">Genres you enjoy</span><div class="chips">${LANES.map(l=>`<button class="chip" data-plane="${l}" aria-pressed="${P.lanes.includes(l)}">${l}</button>`).join("")}</div></div>
      <div class="ctrl"><span class="lbl">What hooks you (up to 4)</span><div class="chips">${HOOK_CHOICES.map(t=>`<button class="chip" data-phook="${t}" aria-pressed="${P.hooks.includes(t)}">${esc(TAGS[t])}</button>`).join("")}</div></div>
      <div class="ctrl"><span class="lbl">Book length</span><div class="chips">${[[null,"No preference"],["short","Shorter"],["medium","Middle"],["long","Long"]].map(([v,l])=>`<button class="chip" data-plen="${v}" aria-pressed="${P.length===v}">${l}</button>`).join("")}</div></div>
      <div class="ctrl"><span class="lbl">Series</span><div class="chips">${[["mix","Either"],["standalone","Standalones"],["series","Series"]].map(([v,l])=>`<button class="chip" data-pser="${v}" aria-pressed="${P.series===v}">${l}</button>`).join("")}</div></div>
      <p class="muted small">Favorites: ${P.favorites.map(book).filter(Boolean).map(b=>esc(b.t)).join(", ")||"none yet"}. Mark favorites from any book you've read.</p>
    </div>
    <div class="panel block"><h3>Import from Goodreads</h3>
      <p class="small">On goodreads.com (desktop), go to <b>My Books → Import and export → Export library</b>, download the CSV, then choose it here. Ratings, read dates and shelves come across. Running it again updates books instead of duplicating them.</p>
      <input type="file" accept=".csv,text/csv" data-grfile="1" aria-label="Goodreads export">
      <p class="muted small" data-grmsg="1">${esc(GRMSG)}</p>
      ${customs.some(b=>!b.lane)?`<button class="btn ghost" data-act="olfill">Look up genres on Open Library for ${customs.filter(b=>!b.lane).length} imported books</button><p class="muted small" id="olfill-msg"></p>`:""}
    </div>
    <div class="panel block" id="p-backup"><h3>Back up and move devices</h3>
      <p class="small">Your shelf is saved in this browser only. <b>Send to another device</b> makes a link that carries your whole shelf to your phone or another computer. A backup file does the same and is a good safety net.</p>
      <p class="muted small">${S.lastBackup?`Last backup or device link: ${dateTxt(S.lastBackup)}.`:"No backup yet."} ${PERSIST===true?"This browser has agreed to keep your shelf permanently.":PERSIST===false?"This browser may clear its saved data if space runs low or you stay away a long time, so keep a backup.":""}</p>
      ${IOS && !STANDALONE?`<p class="notice small">On iPhone, add Bookshelf to your Home Screen (Share → Add to Home Screen) so Safari doesn't erase it after a week away.</p>`:""}
      <div class="actions"><button class="btn" data-act="mktransfer">Send to another device</button><button class="btn ghost" data-act="backup">Download backup</button><label class="btn ghost" style="cursor:pointer">Restore backup<input type="file" accept=".json,application/json" data-restore="1" hidden></label>${INSTALL && !STANDALONE?`<button class="btn ghost" data-act="install">Install as an app</button>`:""}</div>
      ${linkPanel("transfer")}
      <p class="muted small" id="restore-msg"></p>
    </div>
    <div class="panel block" id="p-friends"><h3>Friends</h3>
      <p class="small">Make a link with the books you've read and your ratings, then text it to a friend. They'll see your favorites they haven't read and a taste match score. Your notes, dates and reading list aren't included, and nothing is uploaded anywhere.</p>
      <div class="actions"><button class="btn" data-act="mkfriend"${readBooks().length?"":" disabled"}>Make my share link</button>${readBooks().length?"":`<span class="muted small">Mark a few books as read first.</span>`}</div>
      ${linkPanel("friend")}
      ${Object.keys(S.friends).length?`<div class="block"><span class="lbl eyebrow">Saved on this device</span>${Object.entries(S.friends).map(([k,f])=>`<div class="resultbar"><span><b>${esc(f.name)}</b> <span class="muted small">shared ${dateTxt(f.at)}</span></span><span class="actions"><button class="btn ghost" data-act="fropen" data-k="${esc(k)}">Compare</button><button class="btn quiet" data-act="frdel" data-k="${esc(k)}">Remove</button></span></div>`).join("")}</div>`:`<p class="muted small">When a friend sends you their link, open it and you can save it here to compare again later.</p>`}
    </div>
    <div class="panel block"><h3>Books not in the catalog</h3>
      ${missing.length?`<p class="small">${missing.length} book${missing.length>1?"s on your shelf aren't":" on your shelf isn't"} in the Bookshelf catalog. Copy the list and send it to whoever runs this site so they can be added with full details.</p>
      <div class="actions"><button class="btn ghost" data-act="copymissing">Copy list</button></div>
      <textarea id="missing-list" readonly rows="4">${esc(missing.map(b=>`${b.t} — ${b.a}`).join("\n"))}</textarea>`:`<p class="muted small">Every book on your shelf is in the catalog.</p>`}
    </div>
  </div>
  <div class="panel block"><h3>About Bookshelf</h3>
    <div class="ctrl"><span class="lbl">Book covers</span><div class="chips"><button class="chip" data-covers="on" aria-pressed="${coversOn()}">Real covers from Open Library</button><button class="chip" data-covers="off" aria-pressed="${!coversOn()}">Generated covers only</button></div>
      <p class="muted small">Real covers are looked up on Open Library (openlibrary.org) the first time a book appears, then remembered on this device. Only the book's title and author are sent, never anything about you or your shelf.</p></div>
    <p class="small">Recommendations come from a catalog of ${fmt(CAT.length)} books, each described by hand with its themes, pace, dialogue level, narration, setting and era. Books you add that aren't in the catalog get basic details from Open Library, which you can complete with a few quick taps. Nothing you enter leaves this device. The only outside requests go to Open Library: cover images (unless you turn them off above) and searches when you look up a book that isn't in the catalog. Page counts are approximate and vary by edition.</p>
    <div class="actions"><button class="btn quiet" data-act="redo">Redo the setup questions</button><button class="btn quiet" data-act="reset" id="reset-btn">Erase everything on this device</button></div>
  </div>`;
}

/* ---------- Add-a-book sheet ---------- */
const SH = {q:"", ol:null, olq:"", olBusy:false, olErr:""};
function openSheet(q){ SH.q = q||""; SH.ol=null; SH.olErr=""; $("#sheet").hidden=false; document.body.style.overflow="hidden"; renderSheet(); setTimeout(()=>{ const i=$("#sh-q"); if(i) i.focus(); }, 30); }
function closeSheet(){ $("#sheet").hidden=true; document.body.style.overflow=""; }
function renderSheet(){
  $("#sheet-inner").innerHTML = `<div class="resultbar"><h2>Add a book</h2><button class="btn quiet" data-act="closesheet" aria-label="Close">Close</button></div>
    <input type="search" id="sh-q" placeholder="Title or author" value="${esc(SH.q)}" aria-label="Search for a book">
    <ul class="results" id="sh-results"></ul><div id="sh-ol"></div>`;
  renderSheetResults();
}
function shelfButtons(id){
  const s = status(id), b = (st,l) => `<button class="btn ${s===st?"":"ghost"}" data-st="${st}" data-id="${id}" data-sheet="1">${s===st?l+" ✓":l}</button>`;
  return b("want","Want")+b("reading","Reading")+b("read","Read");
}
function renderSheetResults(){
  const el = $("#sh-results"); if(!el) return;
  const res = searchCatalog(SH.q, 10);
  el.innerHTML = res.map(b=>`<li><span><b>${esc(b.t)}</b><br><span class="muted small">${esc(b.a)} · ${b.y<0?-b.y+" BC":b.y} · ${esc(b.lane)}</span></span><span class="acts">${shelfButtons(b.id)}</span></li>`).join("");
  const ol = $("#sh-ol");
  if(SH.q.trim().length<2){ ol.innerHTML = `<p class="muted small">Search ${fmt(CAT.length)} catalog books. If yours isn't here, you can search Open Library.</p>`; return; }
  let h = `<div class="resultbar" style="margin-top:.6rem"><span class="muted small">${res.length?"Not the one?":"Not in the catalog."}</span><button class="btn ghost" data-act="olsearch"${SH.olBusy?" disabled":""}>${SH.olBusy?"Searching…":"Search Open Library"}</button></div>`;
  if(SH.olErr) h += `<p class="notice">${esc(SH.olErr)}</p>`;
  if(SH.ol && SH.olq===SH.q) h += SH.ol.length ? `<ul class="results">${SH.ol.map((d,i)=>`<li><span><b>${esc(d.title)}</b><br><span class="muted small">${esc((d.author_name||["Unknown"])[0])}${d.first_publish_year?` · ${d.first_publish_year}`:""}${d.number_of_pages_median?` · ${d.number_of_pages_median} pages`:""}</span></span><span class="acts">${["want","reading","read"].map(st=>`<button class="btn ghost" data-olst="${st}" data-oli="${i}">${{want:"Want",reading:"Reading",read:"Read"}[st]}</button>`).join("")}</span></li>`).join("")}</ul>` : `<p class="muted small">Open Library found nothing for that search.</p>`;
  ol.innerHTML = h;
}
async function olSearch(){
  const q = SH.q.trim(); if(q.length<2) return;
  SH.olBusy = true; SH.olErr = ""; renderSheetResults();
  try{
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,first_publish_year,number_of_pages_median,subject&limit=8`);
    if(!r.ok) throw new Error("status "+r.status);
    const j = await r.json(); SH.ol = j.docs||[]; SH.olq = q;
  }catch(e){ SH.olErr = "Couldn't reach Open Library. Check your connection and try again."; SH.ol = null; }
  SH.olBusy = false; renderSheetResults();
}
function addFromOL(d, st){
  const dup = CATIDX[normT(d.title)+"|"+lastName((d.author_name||[""])[0])];
  if(dup){ addToShelf(dup.id, st); return; }
  const id = "ol-"+slug(d.title)+"--"+slug(lastName((d.author_name||[""])[0])||"x");
  if(!S.custom[id]){ const det = detailsFromSubjects(d.subject); S.custom[id] = {id, t:d.title, a:(d.author_name||["Unknown"])[0], lane:det.lane, sub:"", p:d.number_of_pages_median||null, y:d.first_publish_year||null, pov:null, era:null, talk:null, pace:null, series:"", tags:det.tags, hook:"", set:"", aw:"", cat:false, src:"openlibrary"}; }
  addToShelf(id, st);
}
function addToShelf(id, st){
  const e = S.shelf[id] || {};
  const patch = {st};
  if(st==="read" && !e.fin) patch.fin = today();
  if(st==="reading" && !e.start) patch.start = today();
  setEntry(id, patch);
  const b = book(id);
  toast(st==="read" ? `Added ${b.t}. Open it in My books to rate it.` : `Added ${b.t} to ${st==="want"?"your list":"Reading"}.`);
  if(!$("#sheet").hidden) renderSheetResults();
}

/* ---------- Goodreads import ---------- */
function parseCSV(text){
  const rows=[]; let row=[], f="", q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
    else if(c==='"') q=true; else if(c===","){ row.push(f); f=""; }
    else if(c==="\n"||c==="\r"){ if(c==="\r"&&text[i+1]==="\n") i++; row.push(f); rows.push(row); row=[]; f=""; }
    else f+=c; }
  if(f||row.length){ row.push(f); rows.push(row); }
  return rows.filter(r=>r.length>1);
}
function importGoodreads(text){
  const rows = parseCSV(text); if(!rows.length) return null;
  const h = rows[0].map(x=>x.trim()), col = n => h.indexOf(n);
  if(["Title","Author","My Rating","Exclusive Shelf"].some(n=>col(n)<0)) return null;
  const num = v => { const x=parseFloat(v); return isFinite(x)?x:null; };
  let matched=0, added=0, n=0;
  rows.slice(1).forEach(r=>{
    const t = r[col("Title")], a = r[col("Author")]; if(!t) return; n++;
    const shelf = r[col("Exclusive Shelf")], st = shelf==="read"?"read":shelf==="currently-reading"?"reading":shelf==="to-read"?"want":/^(dnf|did-not-finish|abandoned|didnt-finish|did-not-finish-dnf)$/i.test(shelf||"")?"dnf":null; if(!st) return;
    let b = CATIDX[normT(t)+"|"+lastName(a)] || null;
    if(b) matched++;
    else {
      const id = "gr-"+slug(t)+"--"+slug(lastName(a)||"x");
      if(!S.custom[id]){ S.custom[id] = {id, t:t.replace(/\s*\(.*?#\d+.*?\)\s*$/,""), a, lane:null, sub:"", p:num(r[col("Number of Pages")]), y:num(r[col("Original Publication Year")])||num(r[col("Year Published")]), pov:null, era:null, talk:null, pace:null, series:"", tags:[], hook:"", set:"", aw:"", cat:false, src:"goodreads"}; added++; }
      b = S.custom[id];
    }
    const my = num(r[col("My Rating")]), dr = (r[col("Date Read")]||"").replace(/\//g,"-"), avg = num(r[col("Average Rating")]);
    if(avg && !b.cat) b.gr = avg;
    const e = {...(S.shelf[b.id]||{at:today()}), st};
    if(st==="read"){ if(my) e.r = my; if(/^\d{4}-\d{2}-\d{2}$/.test(dr)) e.fin = dr; }
    if(st==="dnf" && my) e.dr = my;
    const bind = (r[col("Binding")]||"").toLowerCase();
    if(!e.fmt && bind) e.fmt = /audio|audible|mp3|cd/.test(bind) ? "audio" : /kindle|ebook|e-book|nook|epub|digital/.test(bind) ? "ebook" : /hardcover|paperback|mass market|board|library binding|leather/.test(bind) ? "print" : undefined;
    if(!e.fmt) delete e.fmt;
    S.shelf[b.id] = e;
  });
  save(); changed();
  return {n, matched, added};
}
async function olFill(){
  const todo = Object.values(S.custom).filter(b=>!b.lane).slice(0,150);
  const msg = $("#olfill-msg"); let done=0, filled=0;
  for(const b of todo){
    if(msg) msg.textContent = `Looking up ${done+1} of ${todo.length}…`;
    try{
      const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(b.t)}&author=${encodeURIComponent(b.a)}&fields=subject,number_of_pages_median,first_publish_year&limit=1`);
      const j = await r.json(); const d = (j.docs||[])[0];
      if(d){ const det = detailsFromSubjects(d.subject); if(det.lane){ b.lane = det.lane; filled++; } if(det.tags.length && !b.tags.length) b.tags = det.tags; if(!b.p && d.number_of_pages_median) b.p = d.number_of_pages_median; if(!b.y && d.first_publish_year) b.y = d.first_publish_year; }
    }catch(e){ if(msg) msg.textContent = "Open Library stopped responding. Try again later; what was found so far is saved."; break; }
    done++; if(done%10===0) save();
    await new Promise(res=>setTimeout(res, 350));
  }
  save(); changed(); toast(`Found genres for ${filled} of ${todo.length} books.`);
}

/* ---------- routing ---------- */
const VIEWS = ["home","discover","mybooks","browse","taste","profile","year"];
const dirty = new Set(VIEWS); let current = null;
const ALLVIEWS = ["onboard","home","discover","mybooks","browse","taste","profile","year","friend","incoming"];
function showOnly(v){ ALLVIEWS.forEach(k=>$("#v-"+k).hidden = k!==v); }
function show(v){
  v = v || "";
  if(v.startsWith("transfer=")){ current="incoming"; $("#topbar").hidden=true; showOnly("incoming"); renderIncoming(v.slice(9)); window.scrollTo(0,0); return; }
  if(v.startsWith("friend=")){ current="friend"; $("#topbar").hidden=!S.profile.onboarded; showOnly("friend"); $$(".tabs a").forEach(a=>a.setAttribute("aria-current","false")); renderFriend(v.slice(7)); window.scrollTo(0,0); return; }
  if(!S.profile.onboarded){ current="onboard"; $("#topbar").hidden=true; showOnly("onboard"); renderOnboard(); return; }
  $("#topbar").hidden=false;
  if(!VIEWS.includes(v)) v="home"; current=v;
  showOnly(v);
  $$(".tabs a").forEach(a=>a.setAttribute("aria-current", a.dataset.tab===v?"page":"false"));
  if(dirty.has(v)) renderView(v);
  window.scrollTo(0,0);
}
function renderView(v){
  dirty.delete(v);
  if(v==="home") renderHome();
  if(v==="discover"){ if(!$("#f-results")) renderDiscoverControls(); renderDiscoverResults(); }
  if(v==="mybooks") renderMyBooks();
  if(v==="browse"){ if(!$("#b-results")) renderBrowseControls(); renderBrowseResults(); }
  if(v==="taste") renderTaste();
  if(v==="profile") renderProfile();
  if(v==="year") renderYear();
}
function changed(){
  recompute(); VIEWS.forEach(v=>dirty.add(v));
  const a = document.activeElement; if(a && (a.tagName==="TEXTAREA" || a.type==="range")) { dirty.delete(current); return; }
  if(current==="friend"){ renderFriend(location.hash.slice(8)); return; }
  if(current && VIEWS.includes(current)) renderView(current);
}
window.addEventListener("hashchange", ()=>show(location.hash.slice(1)));
function openBook(id){
  const b = book(id); if(!b) return;
  if(!b.cat || status(id)){ MB.tab = status(id)||"read"; MB.onlySparse=false; OPEN.add("mb:"+id); dirty.add("mybooks"); if(location.hash!=="#mybooks") location.hash="mybooks"; else renderView("mybooks"); }
  else { BS.q = b.t; Object.assign(BS,{lanes:[],len:"any",pace:"any",talk:"any",pov:"any",era:"any",series:"any",award:false,tags:[],hideShelf:false}); OPEN.add("br:"+id); $("#v-browse").innerHTML=""; dirty.add("browse"); if(location.hash!=="#browse") location.hash="browse"; else renderView("browse"); }
  setTimeout(()=>{ const d=document.querySelector(`[data-key$=":${CSS.escape(id)}"]`); if(d) d.scrollIntoView({block:"start"}); }, 40);
}

/* ---------- events ---------- */
const toggleIn = (arr, v, max) => { const i = arr.indexOf(v); if(i>=0) arr.splice(i,1); else if(!max || arr.length<max) arr.push(v); return arr; };
document.addEventListener("click", e=>{
  const t = e.target.closest("button,[data-act],a[data-act]"); if(!t) return;
  const d = t.dataset;
  // onboarding
  if(d.ob){
    if(d.ob==="next"){ if(OB.step===0){ const n=$("#ob-name"); if(n) S.profile.name = n.value.trim(); } OB.step++; save(); renderOnboard(); window.scrollTo(0,0); }
    if(d.ob==="back"){ OB.step=Math.max(0,OB.step-1); renderOnboard(); }
    if(d.ob==="done"){ S.profile.onboarded = true; save(); changed(); const back = OB.returnTo; OB.returnTo = null; if(back){ location.hash = back; } else { location.hash="home"; show("home"); } }
    if(d.ob==="restore"){ const i=document.createElement("input"); i.type="file"; i.accept=".json,application/json"; i.onchange=()=>restoreFile(i.files[0]); i.click(); }
    return;
  }
  if(d.oblane){ toggleIn(S.profile.lanes, d.oblane); t.setAttribute("aria-pressed", S.profile.lanes.includes(d.oblane)); save(); return; }
  if(d.obhook){ toggleIn(S.profile.hooks, d.obhook, 4); $$("[data-obhook]").forEach(x=>x.setAttribute("aria-pressed", S.profile.hooks.includes(x.dataset.obhook))); $("#ob-hookmsg").textContent=`${S.profile.hooks.length}/4 picked`; save(); return; }
  if(d.oblen!==undefined){ S.profile.length = d.oblen==="null"?null:d.oblen; $$("[data-oblen]").forEach(x=>x.setAttribute("aria-pressed", x.dataset.oblen===d.oblen)); save(); return; }
  if(d.obser){ S.profile.series = d.obser; $$("[data-obser]").forEach(x=>x.setAttribute("aria-pressed", x.dataset.obser===d.obser)); save(); return; }
  if(d.obfav){ const id=d.obfav, P=S.profile; if(P.favorites.includes(id)){ toggleIn(P.favorites,id); if(S.shelf[id]&&S.shelf[id].r===5) delete S.shelf[id]; } else { P.favorites.push(id); S.shelf[id] = {...(S.shelf[id]||{at:today()}), st:"read", r:5}; } save(); recompute(); renderOnboard(); return; }
  // shelf status
  if(d.st!==undefined && d.id){
    const id=d.id, st=d.st||null;
    if(d.sheet){ addToShelf(id, st); return; }
    if(st===status(id) && st) return;
    if(st===null){ setEntry(id,{st:null}); toast("Removed from your shelf."); return; }
    const patch = {st}; const e=S.shelf[id]||{};
    if(st==="read" && !e.fin) patch.fin = today(); if(st==="reading" && !e.start) patch.start = today(); if(st==="dnf" && !e.stop) patch.stop = today();
    OPEN.add(($(`[data-key$=":${CSS.escape(id)}"]`)||{dataset:{}}).dataset.key);
    setEntry(id, patch); return;
  }
  if(d.olst){ const doc = SH.ol && SH.ol[+d.oli]; if(doc) addFromOL(doc, d.olst); return; }
  if(d.fmt && d.id){ const cur = (S.shelf[d.id]||{}).fmt; setEntry(d.id, {fmt: cur===d.fmt ? null : d.fmt}); return; }
  if(d.qd){ const b=book(d.id); let v=d.v; if(d.qd==="pace"||d.qd==="talk") v=+v; b[d.qd]=v; save(); changed(); return; }
  if(d.qtag){ const b=book(d.id); toggleIn(b.tags, d.qtag, 5); save(); changed(); return; }
  // discover
  if(d.preset){ applyPreset(d.preset); renderDiscoverControls(); renderDiscoverResults(); return; }
  if(d.fmode){ FS.mode=d.fmode; FS.preset=""; if(d.fmode==="like" && !FS.like){ const r=readBooks()[0]; if(r) FS.like=r.id; } renderDiscoverControls(); renderDiscoverResults(); return; }
  if(d.flane){ const s=fLanes().slice(); toggleIn(s,d.flane); FS.lanes=s; FS.preset=""; t.setAttribute("aria-pressed", s.includes(d.flane)); renderDiscoverResults(); return; }
  if(d.fmust){ toggleIn(FS.must,d.fmust); FS.preset=""; t.setAttribute("aria-pressed", FS.must.includes(d.fmust)); renderDiscoverResults(); return; }
  // my books
  if(d.year){ YEAR = +d.year; renderYear(); return; }
  if(d.mbtab){ MB.tab=d.mbtab; MB.onlySparse=false; renderMyBooks(); return; }
  // browse
  if(d.blane){ toggleIn(BS.lanes,d.blane); t.setAttribute("aria-pressed",BS.lanes.includes(d.blane)); BS.limit=60; renderBrowseResults(); return; }
  if(d.btag){ toggleIn(BS.tags,d.btag); t.setAttribute("aria-pressed",BS.tags.includes(d.btag)); BS.limit=60; renderBrowseResults(); return; }
  // profile
  if(d.plane){ toggleIn(S.profile.lanes,d.plane); save(); changed(); return; }
  if(d.phook){ toggleIn(S.profile.hooks,d.phook,4); save(); changed(); return; }
  if(d.plen!==undefined){ S.profile.length = d.plen==="null"?null:d.plen; save(); changed(); return; }
  if(d.covers){ S.profile.covers = d.covers==="off" ? "off" : "on"; save(); VIEWS.forEach(v=>dirty.add(v)); renderProfile(); return; }
  if(d.pser){ S.profile.series=d.pser; save(); changed(); return; }
  const act = d.act; if(!act) return;
  if(t.tagName==="A") e.preventDefault();
  const id = d.id;
  if(act==="addbook") openSheet();
  if(act==="closesheet") closeSheet();
  if(act==="olsearch") olSearch();
  if(act==="open") openBook(id);
  if(act==="next"){ S.next = S.next===id ? null : id; save(); changed(); }
  if(act==="like"){ FS.mode="like"; FS.like=id; FS.lanes=[...LANES]; FS.preset=""; FS.must=[]; FS.hooksMin=0; FS.len="any"; FS.pace="any"; FS.series="any"; FS.award=false; $("#v-discover").innerHTML=""; dirty.add("discover"); location.hash="discover"; if(current==="discover") renderView("discover"); }
  if(act==="surprise"){ const l=findResults().slice(0,10); if(l.length) openBook(l[Math.floor(Math.random()*l.length)].b.id); }
  if(act==="findall"){ FS.all=!FS.all; renderDiscoverResults(); }
  if(act==="bclear"){ Object.assign(BS,{q:"",lanes:[],len:"any",pace:"any",talk:"any",pov:"any",era:"any",series:"any",award:false,tags:[],hideShelf:false,limit:60}); renderBrowseControls(); renderBrowseResults(); }
  if(act==="bmore"){ BS.limit+=60; renderBrowseResults(); }
  if(act==="showsparse"){ MB.tab="read"; MB.onlySparse=true; dirty.add("mybooks"); location.hash="mybooks"; if(current==="mybooks") renderMyBooks(); }
  if(act==="allbooks"){ MB.onlySparse=false; renderMyBooks(); }
  if(act==="backup") downloadBackup();
  if(act==="goaledit"){ GOALEDIT = true; renderHome(); const i=$("#goal-n"); if(i) i.focus(); }
  if(act==="goalsave"){ const n = Math.round(+($("#goal-n")||{}).value); if(n>=1 && n<=500){ (S.profile.goals ||= {})[new Date().getFullYear()] = n; GOALEDIT = false; save(); changed(); toast(`Goal set: ${n} books.`); } else toast("Pick a number from 1 to 500."); }
  if(act==="goaloff"){ if(S.profile.goals) delete S.profile.goals[new Date().getFullYear()]; GOALEDIT = false; S.hints["goal"+new Date().getFullYear()] = today(); save(); changed(); }
  if(act==="mktransfer") makeLink("transfer");
  if(act==="mkfriend") makeLink("friend");
  if(act==="gotransfer" || act==="gofriend"){ const kind = act==="gotransfer"?"transfer":"friend"; dirty.add("profile"); if(current!=="profile") location.hash="profile"; makeLink(kind); }
  if(act==="copylink"){ const ta=$("#link-text"); (navigator.clipboard?navigator.clipboard.writeText(LINK.url):Promise.reject()).then(()=>toast("Link copied.")).catch(()=>{ ta.select(); toast("Selected. Copy it with your keyboard or long-press."); }); }
  if(act==="sharelink"){ navigator.share({title: LINK.kind==="friend" ? `${S.profile.name||"My"} Bookshelf` : "My Bookshelf", text: LINK.kind==="friend" ? "Here's what I've been reading. Open it to compare tastes:" : "My Bookshelf, for my other device:", url: LINK.url}).catch(()=>{}); }
  if(act==="hint"){ S.hints[d.k] = today(); save(); renderView(current); }
  if(act==="install" && INSTALL){ INSTALL.prompt(); INSTALL.userChoice.finally(()=>{ INSTALL=null; dirty.add("home"); dirty.add("profile"); renderView(current); }); }
  if(act==="incancel"){ IN = null; clearHash(); show("home"); }
  if(act==="inmerge" && IN){ mergeIncoming(); save(); recompute(); VIEWS.forEach(v=>dirty.add(v)); IN = null; clearHash(); show("home"); toast("Merged. Your shelf now includes the other device's books."); }
  if(act==="inreplace" && IN){
    if(!t.dataset.armed){ t.dataset.armed="1"; t.textContent="Tap again to replace this shelf"; t.classList.remove("ghost"); return; }
    S = IN; S.profile.onboarded = true; save(); recompute(); VIEWS.forEach(v=>dirty.add(v)); IN = null; clearHash(); show("home"); toast("Your shelf is here now."); protect();
  }
  if(act==="frall" && FR){ FR.all = !FR.all; renderFriend(FR.code); }
  if(act==="frsave" && FR){ const k = slug(FR.name||"friend")+"-"+FR.date; S.friends[k] = {name:FR.name, at:FR.date||today(), code:FR.code}; save(); dirty.add("profile"); renderFriend(FR.code); toast(`Saved. Find ${FR.name} under Profile → Friends.`); }
  if(act==="frstart"){ OB.returnTo = location.hash.slice(1); OB.step = 0; clearHash(""); show(""); }
  if(act==="fropen"){ const f = S.friends[d.k]; if(f) location.hash = "friend="+f.code; }
  if(act==="frdel"){ delete S.friends[d.k]; save(); renderProfile(); }
  if(act==="olfill") olFill();
  if(act==="copymissing"){ const ta=$("#missing-list"); const txt=ta.value; (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast("Copied.")).catch(()=>{ ta.select(); toast("Selected. Copy it with your keyboard or long-press."); }); }
  if(act==="redo"){ S.profile.onboarded=false; OB.step=1; save(); show("onboard"); }
  if(act==="reset"){ if(t.dataset.armed){ localStorage.removeItem(KEY); S = blank(); OB={step:0,q:""}; recompute(); location.hash=""; show(""); toast("Erased."); } else { t.dataset.armed="1"; t.textContent="Tap again to erase everything"; t.classList.remove("quiet"); setTimeout(()=>{ if(t.isConnected){ delete t.dataset.armed; t.textContent="Erase everything on this device"; t.classList.add("quiet"); } }, 4000); } }
});
document.addEventListener("change", async e=>{
  const t = e.target, id = t.id;
  if(t.dataset.drate){ setEntry(t.dataset.drate, {dr: t.value ? +t.value : null}); return; }
  if(t.dataset.rate){ const v = t.value ? +t.value : null; setEntry(t.dataset.rate, {r:v}); return; }
  if(t.dataset.date){ setEntry(t.dataset.id, {[t.dataset.date]: t.value||null}); return; }
  if(t.dataset.note!==undefined){ const v=t.value.trim(); if(v!==(S.shelf[t.dataset.note]||{}).note) setEntry(t.dataset.note, {note:v}); return; }
  if(t.dataset.pct){ setEntry(t.dataset.pct, {pct:+t.value}); return; }
  if(t.dataset.fav){ toggleIn(S.profile.favorites, t.dataset.fav); save(); changed(); return; }
  if(t.dataset.grfile && t.files[0]){
    const msgs = $$("[data-grmsg]"); msgs.forEach(m=>m.textContent="Reading the file…");
    try{ const res = importGoodreads(await t.files[0].text());
      const txt = !res ? "That file doesn't look like a Goodreads export. It needs Title, Author, My Rating and Exclusive Shelf columns." : `Imported ${res.n} books: ${res.matched} matched the catalog and ${res.added} ${res.added===1?"was":"were"} added from Goodreads. ${res.added?"Add quick details to the ones you've read, or look up their genres from Profile.":""}`;
      GRMSG = txt; $$("[data-grmsg]").forEach(m=>m.textContent=txt); if(current==="onboard") renderOnboard();
    }catch(err){ $$("[data-grmsg]").forEach(m=>m.textContent="Couldn't read that file. Export it again from Goodreads and retry."); }
    return;
  }
  if(t.dataset.restore && t.files[0]){ restoreFile(t.files[0]); return; }
  if(id==="p-name"){ S.profile.name=t.value.trim(); save(); changed(); return; }
  const fmap = {"f-len":"len","f-pace":"pace","f-series":"series"};
  if(fmap[id]){ FS[fmap[id]]=t.value; FS.preset=""; renderDiscoverResults(); return; }
  if(id==="f-hooks"){ FS.hooksMin=+t.value; FS.preset=""; renderDiscoverResults(); return; }
  if(id==="f-like"){ FS.like=t.value; renderDiscoverResults(); return; }
  if(id==="f-award"){ FS.award=t.checked; renderDiscoverResults(); return; }
  if(id==="mb-sort"){ MB.sort=t.value; renderMyBooks(); return; }
  if(id==="mb-fmt"){ MB.fmt=t.value; renderMyBooks(); return; }
  const bmap = {"b-sort":"sort","b-len":"len","b-pace":"pace","b-talk":"talk","b-pov":"pov","b-era":"era","b-series":"series"};
  if(bmap[id]){ BS[bmap[id]]=t.value; BS.limit=60; renderBrowseResults(); return; }
  if(id==="b-award"){ BS.award=t.checked; renderBrowseResults(); return; }
  if(id==="b-hide"){ BS.hideShelf=t.checked; renderBrowseResults(); return; }
});
let qT;
document.addEventListener("input", e=>{
  const t=e.target;
  if(t.id==="b-q"){ BS.q=t.value; BS.limit=60; clearTimeout(qT); qT=setTimeout(renderBrowseResults,120); }
  if(t.id==="ob-q"){ OB.q=t.value; clearTimeout(qT); qT=setTimeout(renderObResults,100); }
  if(t.id==="sh-q"){ SH.q=t.value; clearTimeout(qT); qT=setTimeout(renderSheetResults,100); }
  if(t.dataset.pct){ const s=$("#pv-"+CSS.escape(t.dataset.pct)); if(s) s.textContent=t.value; }
});
document.addEventListener("keydown", e=>{ if(e.key==="Escape" && !$("#sheet").hidden) closeSheet(); if(e.key==="Enter" && e.target.id==="sh-q") olSearch(); });
$("#sheet").addEventListener("click", e=>{ if(e.target.id==="sheet") closeSheet(); });

function downloadBackup(){
  const blob = new Blob([JSON.stringify(S,null,1)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bookshelf-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  S.lastBackup = today(); save(); dirty.add("home"); dirty.add("profile");
  toast("Backup downloaded.");
}
async function restoreFile(f){
  try{ const j = cleanState(JSON.parse(await f.text())); if(!j) throw 0; S = j; save(); recompute(); dirty.clear(); VIEWS.forEach(v=>dirty.add(v)); toast("Backup restored."); show(location.hash.slice(1)||"home"); }
  catch(e){ const m=$("#restore-msg"); if(m) m.textContent="That file isn't a Bookshelf backup."; toast("That file isn't a Bookshelf backup."); }
}

/* ---------- links: move devices, share with friends ----------
   The whole payload rides in the part of the link after #, which browsers never send to any server,
   so GitHub Pages never sees it. */
const b64u = bytes => { let s=""; for(let i=0;i<bytes.length;i+=0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i,i+0x8000)); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); };
const unb64u = t => { const s = atob(t.replace(/-/g,"+").replace(/_/g,"/")); const b = new Uint8Array(s.length); for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i); return b; };
async function pipe(bytes, stream){ return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
async function packLink(kind, obj){
  let bytes = new TextEncoder().encode(JSON.stringify(obj)), tag = "j";
  if(typeof CompressionStream==="function"){ try{ bytes = await pipe(bytes, new CompressionStream("deflate-raw")); tag = "z"; }catch(e){} }
  return `${location.origin}${location.pathname}#${kind}=${tag}${b64u(bytes)}`;
}
async function unpack(code){
  const tag = code[0], bytes = unb64u(code.slice(1));
  if(tag==="z"){ if(typeof DecompressionStream!=="function") throw new Error("old"); return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream("deflate-raw")))); }
  if(tag==="j") return JSON.parse(new TextDecoder().decode(bytes));
  throw new Error("bad");
}
const linkErr = e => e && e.message==="old" ? "This browser is too old to open Bookshelf links. Try the latest Safari or Chrome." : "That link looks incomplete or damaged. Ask for it to be sent again, and copy the whole thing.";
function clearHash(to="home"){ history.replaceState(null, "", location.pathname + (to?"#"+to:"")); }
const LINK = {kind:null, url:"", busy:false};
async function makeLink(kind){
  LINK.busy = true; LINK.kind = kind; LINK.url = ""; renderProfile();
  try{
    LINK.url = kind==="transfer" ? await packLink("transfer", S) : await packLink("friend", friendPayload());
    if(kind==="transfer"){ S.lastBackup = today(); save(); dirty.add("home"); }
  }catch(e){ LINK.url = ""; toast("Couldn't make the link in this browser."); }
  LINK.busy = false; renderProfile();
  const box = $("#link-box"); if(box) box.scrollIntoView({block:"center"});
}
function linkPanel(kind){
  if(LINK.kind!==kind) return "";
  if(LINK.busy) return `<p class="muted small" id="link-box">Making your link…</p>`;
  if(!LINK.url) return "";
  const kb = Math.ceil(LINK.url.length/1024);
  return `<div class="track-box" id="link-box"><textarea readonly rows="3" id="link-text" aria-label="Your link">${esc(LINK.url)}</textarea>
    <div class="actions"><button class="btn" data-act="copylink">Copy link</button>${navigator.share?`<button class="btn ghost" data-act="sharelink">Share…</button>`:""}<span class="muted small">${kb} KB${kb>60?" · long links can get cut off in some apps, so email works best":""}</span></div>
    <p class="muted small">${kind==="transfer"?"Open it on your other phone or computer. It holds your whole shelf, notes included, so send it only to yourself (email or AirDrop work well).":"Anyone with this link can see the books and ratings in it. It doesn't update itself: make a new one after you've read more."}</p></div>`;
}

/* Incoming: a whole shelf from another device */
let IN = null;
async function renderIncoming(code){
  const el = $("#v-incoming");
  try{ const j = cleanState(await unpack(code)); if(!j) throw new Error("bad"); IN = j; }
  catch(e){ IN = null; el.innerHTML = `<div class="onb"><div class="block"><div class="eyebrow">Move devices</div><h2>That link didn't work</h2><p class="lede">${esc(linkErr(e))}</p></div><div class="actions"><button class="btn" data-act="incancel">Go to my shelf</button></div></div>`; return; }
  const cnt = sh => { const c={}; Object.values(sh).forEach(e=>c[e.st]=(c[e.st]||0)+1); return c; };
  const ci = cnt(IN.shelf), mine = Object.keys(S.shelf).length, cm = cnt(S.shelf);
  const line = c => [["read","read"],["reading","reading"],["want","on the list"],["dnf","didn't finish"]].filter(([k])=>c[k]).map(([k,l])=>`${c[k]} ${l}`).join(", ") || "no books";
  el.innerHTML = `<div class="onb">
    <div class="block"><div class="eyebrow">Move devices</div><h2>${IN.profile.name?esc(IN.profile.name)+"'s shelf":"A shelf"} from another device</h2>
      <p class="lede">This link holds ${Object.keys(IN.shelf).length} books: ${line(ci)}.</p></div>
    ${mine?`<p class="notice">This device already has ${mine} books (${line(cm)}). <b>Merge</b> keeps both, using the link's version where a book is on both. <b>Replace</b> erases this device's shelf first.</p>`:""}
    <div class="actions">${mine?`<button class="btn big" data-act="inmerge">Merge into this shelf</button><button class="btn ghost" data-act="inreplace">Replace this shelf</button>`:`<button class="btn big" data-act="inreplace" data-armed="1">Use this shelf here</button>`}<button class="btn quiet" data-act="incancel">Cancel</button></div>
  </div>`;
}
function mergeIncoming(){
  for(const [id,b] of Object.entries(IN.custom)) if(!S.custom[id]) S.custom[id] = b;
  for(const [id,e] of Object.entries(IN.shelf)){ const cur = S.shelf[id]; S.shelf[id] = cur ? {...cur, ...e, r:e.r||cur.r, note:e.note||cur.note} : e; }
  IN.profile.favorites.forEach(f=>{ if(!S.profile.favorites.includes(f)) S.profile.favorites.push(f); });
  Object.assign(S.friends, IN.friends);
  if(!S.profile.onboarded) S.profile = IN.profile;
}

/* Friends: a read-only snapshot of someone's read books and ratings */
function friendPayload(){
  const b = Object.entries(S.shelf).filter(([,e])=>e.st==="read").map(([id,e])=>{ const bk = book(id); if(!bk) return null; const fav = S.profile.favorites.includes(id) ? 1 : 0; return CATMAP[id] ? [id, e.r||0, fav] : [null, e.r||0, fav, bk.t, bk.a]; }).filter(Boolean);
  return {k:"friend", v:1, n:S.profile.name||"", d:today(), b};
}
function cleanFriend(j){
  if(!j || j.k!=="friend" || !Array.isArray(j.b)) return null;
  const books = j.b.slice(0,3000).map(x=>{ if(!Array.isArray(x)) return null; const r = numIn(x[1],0.5,5);
    if(typeof x[0]==="string" && CATMAP[x[0]]) return {id:x[0], b:CATMAP[x[0]], r:r?Math.round(r*2)/2:null, fav:!!x[2]};
    if(x[0]===null && x[3]) return {id:null, t:str(x[3],300), a:str(x[4],200), r:r?Math.round(r*2)/2:null, fav:!!x[2]};
    return null; }).filter(Boolean);
  return {name:str(j.n,60)||"Your friend", date:isDate(j.d), books};
}
let FR = null;
// 0-100: how closely your ratings line up with theirs. Books you've both rated count fully;
// books only they've read count a little, using your predicted rating.
function tasteMatch(F){
  const theirs = F.books.filter(x=>x.b && x.r);
  const both = theirs.filter(x=>status(x.id)==="read" && entry(x.id).r);
  const predicted = RATED.length>=3 ? theirs.filter(x=>!status(x.id)) : [];
  if(!both.length && predicted.length<5) return null;
  let wsum=0, dsum=0;
  both.forEach(x=>{ wsum+=1; dsum+=Math.abs(entry(x.id).r - x.r); });
  predicted.forEach(x=>{ const w=0.3; wsum+=w; dsum+=w*Math.abs(fit(x.id).pred - x.r); });
  const score = Math.round(Math.max(5, Math.min(99, 100 - (dsum/wsum)*38)));
  const label = score>=82?"Very similar taste":score>=68?"Similar taste":score>=52?"Some overlap":"Different tastes";
  return {score, label, both, nPred:predicted.length};
}
async function renderFriend(code){
  const el = $("#v-friend");
  if(!FR || FR.code!==code){
    try{ const F = cleanFriend(await unpack(code)); if(!F) throw new Error("bad"); FR = {...F, code}; }
    catch(e){ FR = null; el.innerHTML = `<div class="block"><div class="eyebrow">A friend's shelf</div><h2>That link didn't work</h2><p class="lede">${esc(linkErr(e))}</p></div><div class="actions"><button class="btn" data-act="incancel">Go to my shelf</button></div>`; return; }
  }
  const F = FR, name = esc(F.name), rated = F.books.filter(x=>x.r);
  const avg = rated.length ? rated.reduce((a,x)=>a+x.r,0)/rated.length : null;
  const m = S.profile.onboarded ? tasteMatch(F) : null;
  const mineDone = id => ["read","dnf","passed"].includes(status(id));
  const loved = F.books.filter(x=>x.b && x.r>=4 && !mineDone(x.id)).sort((a,c)=>(c.r+(c.fav?0.5:0))-(a.r+(a.fav?0.5:0)) || fit(c.id).score-fit(a.id).score);
  const showN = FR.all ? loved.length : 10;
  const bothLoved = m ? m.both.filter(x=>x.r>=4.5 && entry(x.id).r>=4.5) : [];
  const split = m ? m.both.filter(x=>Math.abs(x.r-entry(x.id).r)>=1.5).sort((a,c)=>Math.abs(c.r-entry(c.id).r)-Math.abs(a.r-entry(a.id).r)) : [];
  const others = F.books.filter(x=>!x.b);
  const saved = Object.values(S.friends).some(f=>f.code===code);
  el.innerHTML = `
  <div class="block"><div class="eyebrow">A friend's shelf${F.date?` · shared ${dateTxt(F.date)}`:""}</div>
    <h1>${name}'s books</h1>
    <p class="lede">${F.books.length} book${F.books.length===1?"":"s"} read${avg?`, averaging ${fmt1(avg)}★`:""}. This is a snapshot ${name} sent you. It's read-only and never changes your own recommendations.</p></div>
  ${!S.profile.onboarded?`<div class="panel block"><h3>Start your own shelf to compare</h3><p class="small">Set up your own Bookshelf in about a minute and you'll see how your taste matches ${name}'s. Your shelf stays on your device.</p><div class="actions"><button class="btn" data-act="frstart">Set up my shelf</button></div></div>`:""}
  ${m?`<div class="grid3">
    <div class="panel feature"><div class="eyebrow">Taste match</div><div class="kpi" style="border:0;padding:0"><b>${m.score}</b></div><div class="t">${m.label}</div>
      <p class="muted small">From ${m.both.length} book${m.both.length===1?"":"s"} you've both rated${m.nPred?`, plus how Bookshelf predicts you'd rate ${m.nPred} more of theirs`:""}.${m.both.length<5?" It firms up as you share more books.":""}</p></div>
    <div class="panel feature"><div class="eyebrow">You both loved</div>${bothLoved.length?bothLoved.slice(0,6).map(x=>`<div class="small"><b>${esc(x.b.t)}</b> <span class="muted">you ${starTxt(entry(x.id).r)}, ${name} ${starTxt(x.r)}</span></div>`).join(""):`<p class="muted small">No shared 4.5★+ books yet.</p>`}</div>
    <div class="panel feature"><div class="eyebrow">Where you disagree</div>${split.length?split.slice(0,6).map(x=>`<div class="small"><b>${esc(x.b.t)}</b> <span class="muted">you ${starTxt(entry(x.id).r)}, ${name} ${starTxt(x.r)}</span></div>`).join(""):`<p class="muted small">${m.both.length?"No big disagreements.":"Rate more of the same books to see this."}</p>`}</div>
  </div>`:(S.profile.onboarded?`<p class="notice">Rate a few books you've read and you'll see how your taste matches ${name}'s.</p>`:"")}
  <div class="block"><h2>${name}'s favorites you haven't read</h2><p class="muted small">Books ${name} rated 4★ or higher${S.profile.onboarded?", with your fit score for each. Open one to add it to your list.":", best first."}</p>
    ${loved.length?`<ul class="books">${loved.slice(0,showN).map(x=>bookCard(x.b,{ctx:"fr", note:`${F.name} ${starTxt(x.r)}${x.fav?" · all-time favorite":""}`, badge: RATED.length ? null : `<span class="score ${rCls(x.r)}" title="${name}'s rating"><span><b>${x.r%1?x.r.toFixed(1):x.r}</b><small>stars</small></span></span>`})).join("")}</ul>${loved.length>10?`<button class="btn ghost" data-act="frall">${FR.all?"Show top 10":"Show all "+loved.length}</button>`:""}`:`<p class="empty">${rated.length?`You've already read everything ${name} rated 4★ or higher.`:`${name} hasn't rated any books yet.`}</p>`}</div>
  ${others.length?`<div class="block"><h3>Also on ${name}'s shelf</h3><p class="muted small">Not in the Bookshelf catalog, so there's no fit score.</p><p class="small">${others.slice(0,60).map(x=>`${esc(x.t)} <span class="muted">(${esc(x.a)}${x.r?`, ${starTxt(x.r)}`:""})</span>`).join(" · ")}</p></div>`:""}
  <div class="actions">${saved?`<span class="muted small">Saved on this device. Find it later under Profile → Friends.</span>`:`<button class="btn ghost" data-act="frsave">Save ${name}'s shelf on this device</button>`}${S.profile.onboarded?`<a class="btn quiet" href="#home">Back to my shelf</a>`:""}</div>`;
}

/* ---------- keeping the shelf safe ---------- */
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const STANDALONE = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone===true;
let PERSIST = null, persistTried = false, INSTALL = null;
// Ask the browser to treat this site's storage as permanent, so it isn't cleared to save space.
function protect(){
  if(!navigator.storage || !navigator.storage.persisted) return;
  navigator.storage.persisted().then(p=>{ PERSIST = p;
    if(!p && !persistTried && Object.keys(S.shelf).length){ persistTried = true; return navigator.storage.persist().then(r=>{ PERSIST = r; if(current==="profile") renderProfile(); }); }
  }).catch(()=>{});
}
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); INSTALL = e; dirty.add("profile"); dirty.add("home"); if(current==="home") renderHome(); });
const daysSince = d => d ? Math.floor((Date.now() - new Date(d+"T12:00:00"))/864e5) : Infinity;
const hintOff = k => daysSince(S.hints && S.hints[k]) < (k==="ios"?21:14);
function safetyNotices(){
  const n = Object.keys(S.shelf).length, out = [];
  if(!n) return "";
  if(IOS && !STANDALONE && !hintOff("ios")) out.push(`<div class="notice"><b>Keep your shelf safe on iPhone.</b> Safari can erase a website's saved data if you don't visit for about a week. Add Bookshelf to your Home Screen to stop that: tap the Share button, then <b>Add to Home Screen</b>, and open it from there. <button class="btn quiet" data-act="hint" data-k="ios">Got it</button></div>`);
  else if(INSTALL && !STANDALONE && !hintOff("install")) out.push(`<div class="notice"><b>Install Bookshelf as an app</b> so it opens like one and your browser is less likely to clear it. <button class="btn" data-act="install">Install</button> <button class="btn quiet" data-act="hint" data-k="install">Not now</button></div>`);
  if(n>=5 && daysSince(S.lastBackup)>30 && !hintOff("backup")) out.push(`<div class="notice"><b>${S.lastBackup?`Your last backup was ${dateTxt(S.lastBackup)}.`:"You haven't backed up your shelf yet."}</b> It's saved only in this browser, so a backup is your safety net. <span class="actions" style="display:inline-flex;margin-top:.4rem"><button class="btn" data-act="backup">Download backup</button><button class="btn ghost" data-act="gotransfer">Send to another device</button><button class="btn quiet" data-act="hint" data-k="backup">Later</button></span></div>`);
  return out.join("");
}

const tip = $("#tip");
document.addEventListener("pointerover", e=>{ const c=e.target.closest&&e.target.closest("[data-tip]"); if(!c){ tip.hidden=true; return; } tip.textContent=c.dataset.tip; tip.hidden=false; });
document.addEventListener("pointermove", e=>{ if(!tip.hidden){ tip.style.left=Math.min(e.clientX+12, innerWidth-tip.offsetWidth-8)+"px"; tip.style.top=(e.clientY+14)+"px"; } });
let rz; window.addEventListener("resize", ()=>{ clearTimeout(rz); rz=setTimeout(()=>{ if(current==="taste") scatter(); },150); });

recompute();
protect();
show(location.hash.slice(1) || "home");

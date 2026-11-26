/* Bookshelf — shared vocabulary and the fit model.
   Predicted rating = how this reader rated the books most like a candidate
   (weighted toward the closest), blended with how they rate each theme,
   plus boosts for what they said hooks them. */

const TAGS = {
  narrator:"Memorable narrator", catmouse:"Cat-and-mouse", twists:"Big twists",
  underdog:"Gifted underdog", worldbuild:"Deep world-building", academy:"School or training",
  war:"War and battles", spy:"Espionage", conspiracy:"Conspiracy", mystery:"Mystery to solve",
  heist:"Heist or con", time:"Time or reality-bending", survival:"Survival",
  science:"Science and problem-solving", revenge:"Revenge", coming:"Coming of age",
  family:"Family saga", books:"Love of books", truestory:"True story", western:"Western",
  globe:"Globe-trotting", funny:"Funny", emotional:"Emotional punch", dark:"Dark",
  epic:"Epic scope", sports:"Sports", crime:"Crime world", ideas:"Big ideas",
  gothic:"Gothic atmosphere", space:"Space", nature:"Nature and wilderness", politics:"Politics and power"
};
const LANES = ["Thriller","Mystery","Sci-fi","Fantasy","Literary","Historical","Horror","Nonfiction"];
const ERAS = {B:"Before 1900", E:"1900–1945", M:"1945–1999", N:"2000–today", F:"Future", I:"Invented world"};
const POVS = {f:"First person", t:"Third person", o:"Multiple or unusual voices", m:"Memoir", r:"Reported nonfiction"};
const HOOK_CHOICES = ["narrator","catmouse","twists","underdog","worldbuild","epic","emotional","funny","ideas","mystery","war","survival","science","dark","truestory","heist","time","coming"];

const LEN_BUCKETS = [["Under 300",0,300],["300–399",300,400],["400–499",400,500],["500–699",500,700],["700+",700,1e9]];
const lenIdx = p => p ? LEN_BUCKETS.findIndex(([,lo,hi])=>p>=lo&&p<hi) : -1;
const povClass = b => !b.pov ? null : (b.pov==="f"||b.pov==="m") ? "first" : (b.pov==="t"||b.pov==="r") ? "third" : "other";

const MODEL = {
  weights: {lane:1, tags:4, pov:0.75, pace:1, talk:0.5, length:0.75, era:0.25},
  neighborPower: 3,
  shrink: 0.35,
  blend: {neighbors:0.6, tags:0.4},
  priorMean: 3.9,       // a new reader's ratings are pulled toward this until they've rated more
  priorWeight: 5,
  hookBoost: 0.15,
  favoriteWeight: 1.5,  // books picked as favorites count extra as comparisons
  offLanePenalty: 0.15,
  lengthBoost: 0.1,
  seriesBoost: 0.08,
  maxPred: 4.9
};

// Similarity over the details both books have. Missing details are skipped, not guessed.
function similarity(c, r){
  const W = MODEL.weights; let s=0, tot=0;
  const add = (k, v) => { if(v===null || v===undefined || Number.isNaN(v)) return; s += W[k]*v; tot += W[k]; };
  if(c.lane && r.lane) add("lane", c.lane===r.lane ? 1 : 0);
  if(c.tags.length && r.tags.length){
    const a = new Set(c.tags), b = new Set(r.tags); let inter=0; a.forEach(x=>{ if(b.has(x)) inter++; });
    add("tags", inter/(a.size+b.size-inter));
  }
  const pc = povClass(c), pr = povClass(r); if(pc && pr) add("pov", pc===pr ? 1 : 0);
  if(c.pace && r.pace) add("pace", 1-Math.abs(c.pace-r.pace)/2);
  if(c.talk && r.talk) add("talk", 1-Math.abs(c.talk-r.talk)/2);
  const lc = lenIdx(c.p), lr = lenIdx(r.p); if(lc>=0 && lr>=0) add("length", 1-Math.abs(lc-lr)/4);
  if(c.era && r.era) add("era", c.era===r.era ? 1 : 0);
  // Sparse comparisons are less trustworthy: scale by how much of the full picture we had.
  const full = Object.values(W).reduce((a,b)=>a+b,0);
  return tot ? (s/tot) * (0.5 + 0.5*tot/full) : 0;
}

function tasteProfile(rated){
  const n = rated.length, sum = rated.reduce((a,b)=>a+b.r,0);
  const mean = (sum + MODEL.priorMean*MODEL.priorWeight) / (n + MODEL.priorWeight);
  const raw = n ? sum/n : null;
  const acc = {};
  rated.forEach(r=>r.tags.forEach(t=>{ (acc[t] ||= {n:0,dev:0,sum:0}); acc[t].n++; acc[t].dev += r.r-mean; acc[t].sum += r.r; }));
  const aff = {}; for(const t in acc) aff[t] = {n:acc[t].n, avg:acc[t].sum/acc[t].n, dev:acc[t].dev/(acc[t].n+1)};
  return {mean, raw, n, aff};
}

function fitFor(c, rated, TP, prefs){
  const mean = TP.mean;
  const sims = rated.map(r=>({r, score:similarity(c,r)})).sort((x,y)=>y.score-x.score);
  let num=0, den=0;
  sims.forEach(s=>{ const w = Math.pow(s.score, MODEL.neighborPower) * (prefs.favorites.includes(s.r.id) ? MODEL.favoriteWeight : 1); num += w*(s.r.r-mean); den += w; });
  const knn = num/(den+MODEL.shrink);
  const known = c.tags.filter(t=>TP.aff[t]);
  const tagDev = known.length ? known.reduce((a,t)=>a+TP.aff[t].dev,0)/known.length : 0;
  let pred = mean + MODEL.blend.neighbors*knn + MODEL.blend.tags*tagDev;
  const hooks = prefs.hooks.filter(h=>c.tags.includes(h));
  pred += hooks.length*MODEL.hookBoost;
  const offLane = prefs.lanes.length && c.lane && !prefs.lanes.includes(c.lane);
  if(offLane) pred -= MODEL.offLanePenalty;
  const L = lenIdx(c.p);
  if(prefs.length==="short" && L>=0 && L<=1) pred += MODEL.lengthBoost;
  if(prefs.length==="medium" && (L===1||L===2)) pred += MODEL.lengthBoost;
  if(prefs.length==="long" && L>=3) pred += MODEL.lengthBoost;
  if(prefs.series==="standalone" && !c.series) pred += MODEL.seriesBoost;
  if(prefs.series==="series" && c.series && !/stands alone/.test(c.series)) pred += MODEL.seriesBoost;
  const score = pred;                       // uncapped, used for ranking
  pred = Math.max(1, Math.min(MODEL.maxPred, pred));
  const lo = mean-0.45, hi = mean+0.45+MODEL.hookBoost*Math.max(1, prefs.hooks.length); // top of scale = a close match with every hook
  const fit = Math.round(Math.max(0, Math.min(99, (score-lo)/(hi-lo)*100)));
  const strong = known.filter(t=>TP.aff[t].n>=2 && TP.aff[t].avg>=Math.max(4.3, (TP.raw||4)+0.2)).sort((a,b)=>TP.aff[b].avg-TP.aff[a].avg);
  return {pred, score, fit, hooks, offLane, strong, near: sims.slice(0,3)};
}

// Rough details for a book found on Open Library, from its subject labels.
function detailsFromSubjects(subjects){
  const s = (subjects||[]).join(" | ").toLowerCase();
  const has = (...w) => w.some(x=>s.includes(x));
  let lane = null;
  const fiction = has("fiction","novel","stories");
  if(has("science fiction")) lane = "Sci-fi";
  else if(has("fantasy","magic","wizards","dragons")) lane = "Fantasy";
  else if(has("horror","ghost stories","supernatural")) lane = "Horror";
  else if(has("detective and mystery","mystery","whodunit","private investigators")) lane = "Mystery";
  else if(has("thriller","suspense","spy stories","espionage")) lane = "Thriller";
  else if(has("historical fiction")) lane = "Historical";
  else if(!fiction && has("biography","autobiography","memoir","history","nonfiction","true crime","essays","science","politics")) lane = "Nonfiction";
  else if(fiction) lane = "Literary";
  const map = [["spy","spies","espionage","intelligence service"],["time","time travel"],["mystery","detective","mystery"],["war","war,","world war","military","battles"],
    ["crime","murder","crime","criminals","gangsters","mafia"],["space","space","interplanetary","astronaut"],["worldbuild","imaginary places","magic"],["funny","humor","humorous","comic"],
    ["coming","coming of age","bildungsroman","teenagers"],["family","family"],["survival","survival"],["revenge","revenge"],["heist","robbery","thieves","heist"],["conspiracy","conspiracies"],
    ["truestory","biography","autobiography","memoir","true crime"],["western","western stories","cowboys","frontier"],["gothic","ghost","haunted","gothic"],["sports","baseball","football","basketball","sports","hockey","golf"],
    ["politics","politics","political"],["nature","nature","wilderness","animals"],["ideas","philosophy","artificial intelligence"],["science","science","scientists"],["dark","psychological"],["emotional","grief","loss"]];
  const tags = []; map.forEach(([tag,...words])=>{ if(words.some(w=>s.includes(w)) && !tags.includes(tag)) tags.push(tag); });
  return {lane, tags: tags.slice(0,6)};
}

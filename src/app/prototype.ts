// @ts-nocheck
/* eslint-disable */
// Khata app logic; bootKhata() runs once, after the Angular view mounts.
declare const XLSX: any;
export function bootKhata(): void {


const LEDGER_SEED = [];


// ---- Category palette (light theme: pastel fill + dark same-family text) ----
const CAT = {
  "Vegetables":          {fill:"#C2E0B6", text:"#2E6B2A"},
  "Fruits":              {fill:"#F6C9B4", text:"#A0431F"},
  "Dairy":               {fill:"#BCD8F2", text:"#1C5A93"},
  "Staples":             {fill:"#F2DBA0", text:"#8A5E12"},
  "Snacks":              {fill:"#F3C2C1", text:"#9B2E2D"},
  "Dry Fruits":          {fill:"#D9CAEA", text:"#5B3E7E"},
  "Snacks & Confect.":   {fill:"#F3C2C1", text:"#9B2E2D"},
  "Snacks & Dry Fruits": {fill:"#D9CAEA", text:"#5B3E7E"},
  "Ready-to-Cook":       {fill:"#EBDCB0", text:"#836A1E"},
  "Beverages":           {fill:"#E4C9B2", text:"#7A4A22"},
  "Household":           {fill:"#CDD4DC", text:"#45525F"},
  "Baby & Personal Care":{fill:"#F3CEDE", text:"#8E3560"},
  "Personal Care":       {fill:"#B8E0DA", text:"#1E6B62"},
  "Health & Wellness":   {fill:"#D5E5AE", text:"#54701F"},
  "Bakery":              {fill:"#EFD0B4", text:"#8A5326"},
};
function hashHue(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h;}
function catColor(c){ if(CAT[c]) return CAT[c]; const hue=hashHue(c); return {fill:`hsl(${hue} 45% 82%)`, text:`hsl(${hue} 55% 30%)`}; }

// Live ledger - starts from the seed baked in, replaced when a master Excel is uploaded
let SAVED_LEDGER = lsGet("khata_ledger", null);
let LEDGER = (SAVED_LEDGER && SAVED_LEDGER.length) ? SAVED_LEDGER : LEDGER_SEED.slice();
let UPLOAD_B64 = null, UPLOAD_NAME = null;   // raw bytes + name of the last uploaded workbook, for re-download
let EX = {};   // signatures of purchases excluded from all totals/graphs (persists across re-uploads)
// UI labels for the three taxonomy levels - taken from your Excel header row, so renaming reflects here
let LABELS = lsGet("khata_labels", null) || {cat:"Category", sub:"Subcategory", it:"Item Type"};
function typeLabel(t){ return t==="platform"?"Platform":t==="item"?LABELS.it:t==="subcategory"?LABELS.sub:LABELS.cat; }

const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function rowDate(r){ return new Date(r.y!=null?r.y:new Date().getFullYear(), r.m!=null?r.m:0, r.d||1); }
function fmtD(dt){ return dt.getDate()+" "+MONTHS[dt.getMonth()]; }
function inr(n){ return "₹"+Math.round(n).toLocaleString("en-IN"); }

// ---- weight parsing for ₹/kg ----
function grams(sz){
  if(!sz) return null;
  let s=String(sz).toLowerCase().trim();
  let hasUnit=/\d\s*(kg|gm|g|ml|l)\b/.test(s);
  // count-only sizes (pcs, pulls, etc.) with no weight/volume -> not weighable
  if(/pull|pcs|pc\b|piece|pack of|count|sheet|\bm\b/.test(s) && !hasUnit) return null;
  function val(n,u){ n=parseFloat(n); return (u==="kg"||u==="l")? n*1000 : n; } // g/gm/ml as-is
  let m;
  // N unit x M   e.g. "52g x 6", "27 g x 3"
  if((m=s.match(/([\d.]+)\s*(kg|gm|g|ml|l)\s*[x×]\s*([\d.]+)/))) return val(m[1],m[2])*parseFloat(m[3]);
  // M x N unit   e.g. "3x750 ml"
  if((m=s.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*(kg|gm|g|ml|l)/))) return parseFloat(m[1])*val(m[2],m[3]);
  // N + N unit   e.g. "250+250 g"
  if((m=s.match(/([\d.]+)\s*\+\s*([\d.]+)\s*(kg|gm|g|ml|l)/))){ let u=m[3]; return (parseFloat(m[1])+parseFloat(m[2]))*((u==="kg"||u==="l")?1000:1); }
  // range  e.g. "900g-1kg", "450-550 gm"
  if(s.includes("-")){
    let nums=[...s.matchAll(/([\d.]+)\s*(kg|gm|g|ml|l)?/g)].filter(x=>x[1]);
    if(nums.length>=2){ let u=nums[nums.length-1][2]||nums[0][2]||"g";
      return (val(nums[0][1],nums[0][2]||u)+val(nums[1][1],nums[1][2]||u))/2; }
  }
  // simple  e.g. "500 g", "1 kg", "100 ml"
  if((m=s.match(/([\d.]+)\s*(kg|gm|g|ml|l)\b/))) return val(m[1],m[2]);
  return null;
}

// ---- price-spike detection ----
// Flags a buy whose unit price is >=20% above the item's own median (needs >=3 buys)
function spikeFlags(series){
  let n=series.length, sp=new Array(n).fill(false);
  if(n<3) return {flags:sp, any:false};
  let us=series.map(s=>s.unit).slice().sort((a,b)=>a-b);
  let med = n%2 ? us[(n-1)/2] : (us[n/2-1]+us[n/2])/2;
  let any=false;
  series.forEach((s,i)=>{ if(med>0 && s.unit>=med*1.2){ sp[i]=true; any=true; } });
  return {flags:sp, any, med};
}

// ---- date range state ----
const TODAY=(function(){var n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate());})();
// "This month" and "Today" step through time via STATE.off:
//   month mode -> off counts whole months (0 = this month, -1 = last month)
//   today mode -> off counts days (0 = today, -1 = yesterday)
let STATE={level:0,cat:null,sub:null,it:null,platform:null,tab:"dash",rangeKey:"month",off:0,custom:[null,null]};

function refMonth(){ return new Date(TODAY.getFullYear(), TODAY.getMonth()+STATE.off, 1); }
function refDay(){ return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()+STATE.off); }
function activeRange(){
  if(STATE.rangeKey==="custom"){
    if(STATE.custom[0] && STATE.custom[1]) return [STATE.custom[0],STATE.custom[1]];
    return [new Date(TODAY.getFullYear(),TODAY.getMonth(),1), new Date(TODAY.getFullYear(),TODAY.getMonth()+1,0,23,59,59,999)];
  }
  if(STATE.rangeKey==="today"){
    let d=refDay();
    return [new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0,0),
            new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999)];
  }
  let m=refMonth();
  return [m, new Date(m.getFullYear(), m.getMonth()+1, 0, 23,59,59,999)];
}
function rowSig(r){ return r.y+"-"+(r.m||0)+"-"+r.d+"|"+(r.it||"")+"|"+(r.nm||"")+"|"+r.p+"|"+(r.pl||""); }
function applyEx(){ LEDGER.forEach(r=>{ r.ex = !!EX[rowSig(r)]; }); }
function toggleExclude(sig){ if(EX[sig]) delete EX[sig]; else EX[sig]=1; applyEx(); persistLedger(LEDGER, LABELS, UPLOAD_NAME); }
function toggleExcludeDay(it,y,m,d){ let rs=LEDGER.filter(r=>r.it===it && r.y===y && (r.m||0)===m && r.d===d); if(!rs.length)return; let allEx=rs.every(r=>r.ex); rs.forEach(r=>{ let s=rowSig(r); if(allEx) delete EX[s]; else EX[s]=1; }); applyEx(); persistLedger(LEDGER, LABELS, UPLOAD_NAME); }
function filtered(){
  let [a,b]=activeRange();
  return LEDGER.filter(r=>{let d=rowDate(r); return !r.ex && d>=a && d<=b && (!STATE.platform || r.pl===STATE.platform);});
}

// ---- aggregation ----
function agg(rows, keyFn){
  let m={};
  rows.forEach(r=>{let k=keyFn(r); if(k==null)return; (m[k]=m[k]||{paid:0,qty:0,lines:0,rows:[]}); m[k].paid+=r.p; m[k].qty+=r.q; m[k].lines++; m[k].rows.push(r);});
  return m;
}
function sortedEntries(m){ return Object.entries(m).sort((x,y)=>y[1].paid-x[1].paid); }

// ---- accent for current view ----
function accent(){ return STATE.cat ? catColor(STATE.cat).text : "#B5730F"; }
function accentFill(){ return STATE.cat ? catColor(STATE.cat).fill : "#E3A53A"; }

// ---- sparkline of daily spend over active range, weekly marks, dotted outside data ----
function dataExtent(){ let ts=LEDGER.filter(r=>!r.ex).map(r=>rowDate(r).getTime()); return ts.length?[Math.min(...ts),Math.max(...ts)]:[0,0]; }
function sparkline(rows){
  let [a,b]=activeRange();
  let bFloor=new Date(b.getFullYear(),b.getMonth(),b.getDate());
  let span=Math.max(1,Math.round((bFloor-a)/86400000)+1);
  let [dMin,dMax]=dataExtent();
  let days={}; rows.forEach(r=>{let k=rowDate(r).toDateString(); days[k]=(days[k]||0)+r.p;});
  let arr=[], maxV=1, inWin=[];
  for(let i=0;i<span;i++){ let dt=new Date(a.getTime()+i*86400000); let v=days[dt.toDateString()]||0; arr.push(v); if(v>maxV)maxV=v;
    inWin.push(dt.getTime()>=dMin-43200000 && dt.getTime()<=dMax+43200000); }
  let W=Math.max(280,(document.getElementById('view')||{}).clientWidth||300),H=60,top=6,base=42,plotH=base-top;
  let xAt=i=>span>1?(i/(span-1))*W:W/2;
  // solid line across in-data days only
  let solidPts=arr.map((v,i)=>inWin[i]?`${xAt(i).toFixed(0)},${(base-(v/maxV)*plotH).toFixed(0)}`:null).filter(Boolean).join(" ");
  // dotted baseline for leading/trailing no-data regions
  let firstIn=inWin.indexOf(true), lastIn=inWin.lastIndexOf(true);
  let dotted="";
  if(firstIn>0) dotted+=`<line x1="0" y1="${base}" x2="${xAt(firstIn).toFixed(0)}" y2="${base}" stroke="${accent()}" stroke-width="2" stroke-dasharray="3 3" opacity="0.45"/>`;
  if(lastIn>=0 && lastIn<span-1) dotted+=`<line x1="${xAt(lastIn).toFixed(0)}" y1="${base}" x2="${W}" y2="${base}" stroke="${accent()}" stroke-width="2" stroke-dasharray="3 3" opacity="0.45"/>`;
  // weekly demarcation lines (every 7 days); thinned on very long ranges
  let weeks=[]; for(let i=0;i<span;i+=7) weeks.push(i);
  let lineEvery=Math.ceil(weeks.length/16);
  let drawn=weeks.filter((_,k)=>k%lineEvery===0);
  let maxLabels=Math.max(2,Math.floor(W/44));
  let labelEvery=Math.ceil(drawn.length/maxLabels);
  let grid=drawn.map((i,k)=>{
    let x=xAt(i).toFixed(0);
    let line=`<line x1="${x}" y1="${top-2}" x2="${x}" y2="${base}" stroke="var(--line)" stroke-width="1"/>`;
    let lab=(k%labelEvery===0)?`<text x="${x}" y="${H-3}" class="tk" text-anchor="${k===0?'start':'middle'}">${fmtD(new Date(a.getTime()+i*86400000))}</text>`:"";
    return line+lab;
  }).join("");
  // hover points only on days with an actual purchase -> (date, money spent)
  let hov=arr.map((v,i)=>{ if(!inWin[i]||v<=0)return ""; let dt=new Date(a.getTime()+i*86400000);
    let cx=xAt(i).toFixed(1), cy=(base-(v/maxV)*plotH).toFixed(1);
    let tip=fmtD(dt)+'<br>'+inr(v)+' spent';
    return `<circle class="pt" data-tip="${tip}" cx="${cx}" cy="${cy}" r="9" fill="transparent"/>`+
           `<circle class="pt" data-tip="${tip}" cx="${cx}" cy="${cy}" r="2.4" fill="${accent()}"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;margin-top:10px">
    ${grid}
    <line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="var(--line)" stroke-width="1"/>
    ${dotted}
    <polyline points="${solidPts}" fill="none" stroke="${accent()}" stroke-width="2" stroke-linejoin="round"/>
    ${hov}</svg>`;
}

// ---- render ----
const app=()=>document.getElementById("view");

function bar(label, value, maxV, color, txt, drillable, flag){
  let pct=Math.max(5,(value/maxV)*100);
  return `<div class="row" ${drillable?`data-drill="${encodeURIComponent(label)}"`:""} style="${drillable?'cursor:pointer':''}">
    <div class="track">
      <div class="fill" style="width:${pct}%;background:${color}"></div>
      <div class="blabel" style="color:${txt}">${label}${drillable?' <span class=chev>›</span>':''}</div>
    </div>
    <span class="val mono">${flag||""}${inr(value)}</span></div>`;
}

function breadcrumb(){
  if(STATE.level===0) return "";
  let parts=[`<span class="crumb" data-go="0">khata</span>`];
  if(STATE.cat) parts.push(`<span class="crumb" data-go="1" style="color:${accent()}">${STATE.cat}</span>`);
  if(STATE.sub) parts.push(`<span class="crumb" data-go="2">${STATE.sub}</span>`);
  if(STATE.it)  parts.push(`<span class="crumb cur">${STATE.it}</span>`);
  return `<div class="bc">`+parts.join(`<span class="sep">›</span>`)+`</div>`;
}

function siblings(){
  let rows=filtered(), items=[], active, level=STATE.level;
  if(level===1){ items=Object.keys(agg(rows,r=>r.cat)); active=STATE.cat; }
  else if(level===2){ items=Object.keys(agg(rows.filter(r=>r.cat===STATE.cat),r=>r.sub)); active=STATE.sub; }
  else if(level===3){ items=Object.keys(agg(rows.filter(r=>r.cat===STATE.cat&&r.sub===STATE.sub),r=>r.it)); active=STATE.it; }
  else return "";
  let ac=accent(), af=accentFill();
  return `<div class="sw">`+items.map(n=>{
    let on=n===active;
    return `<span class="chip ${on?'on':''}" data-sib="${encodeURIComponent(n)}" style="${on?`background:${af};color:${ac};font-weight:600`:''}">${n}</span>`;
  }).join("")+`</div>`;
}

function hero(rows, eyebrow, sub){
  let total=rows.reduce((s,r)=>s+r.p,0);
  let ac=accent();
  return `<div class="hero">
    <div class="eb">${eyebrow}</div>
    <div class="num" style="color:${ac}"><span class="rs">₹</span>${Math.round(total).toLocaleString("en-IN")}</div>
    <div class="sub mono">${sub}</div>
    ${sparkline(rows)}

  </div>`;
}

// ---- shared price-series builder ----
// Item is treated as weighed (₹/kg) when most buys carry a real weight (>=100g);
// size-less buys (e.g. Swiggy Instamart) are excluded from the ₹/kg trend, not mixed in.
function priceSeries(rows){
  let byDay={}; rows.forEach(r=>{let key=r.y*10000+(r.m||0)*100+r.d; let g=grams(r.sz);
    (byDay[key]=byDay[key]||{dt:rowDate(r),paid:0,qty:0,g:0,gOK:true,plats:{},szs:{}});
    let o=byDay[key]; o.paid+=r.p; o.qty+=r.q; if(g==null)o.gOK=false; else o.g+=g*r.q;
    if(r.pl)o.plats[r.pl]=1; if(r.sz)o.szs[r.sz]=1;});
  let buys=Object.values(byDay).sort((a,b)=>a.dt-b.dt);
  let weighable=buys.filter(o=>o.gOK && o.g>0);
  let weighed = weighable.length>0 && weighable.length>=Math.ceil(buys.length/2);
  let totG=weighable.reduce((s,o)=>s+o.g,0);
  let weighablePaid=weighable.reduce((s,o)=>s+o.paid,0);
  let avgPerKg = (weighed && totG>0) ? weighablePaid/(totG/1000) : null;
  // effective grams per buy - inferred from avg ₹/kg when a buy has no usable size
  let inferredG=0;
  buys.forEach(o=>{
    if(weighed){
      if(o.gOK && o.g>=100){ o.gEff=o.g; }
      else if(avgPerKg>0){ o.gEff=(o.paid/avgPerKg)*1000; o.inferred=true; inferredG+=o.gEff; }
      else { o.gEff=0; }
    }
  });
  let used = weighed? weighable : buys;
  let series=used.map(o=>({dt:o.dt,t:o.dt.getTime(),
    unit: weighed? o.paid/(o.g/1000) : o.paid/o.qty,
    plats:Object.keys(o.plats), paid:o.paid, qty:o.qty, szs:Object.keys(o.szs)}));
  let excluded = weighed? (buys.length-weighable.length) : 0;
  return {weighed,series,buys,totG,weighablePaid,excluded,avgPerKg,inferredG};
}
// compact "avg price for the size usually bought": e.g. ₹27 / 200 g, ₹52 / 1 L, ₹37 each
function fmtAmt(g, isVol){
  let big=isVol?"L":"kg", small=isVol?"ml":"g";
  if(g>=1000){ let v=g/1000; return (Number.isInteger(v)?v:+v.toFixed(2))+" "+big; }
  return Math.round(g)+" "+small;
}
function rhythmRate(ps, rows){
  if(ps.weighed && ps.avgPerKg>0){
    let gc={}, mass=0, vol=0;
    rows.forEach(r=>{ let g=grams(r.sz); if(g){ gc[g]=(gc[g]||0)+1; let k=unitKind(r.sz); if(k==="vol")vol++; else if(k==="mass")mass++; } });
    let isVol=vol>mass;
    let modal=Object.entries(gc).sort((a,b)=> b[1]-a[1] || (+a[0])-(+b[0]))[0];   // most-bought size; ties -> smaller
    if(modal){ let g=+modal[0]; return inr(ps.avgPerKg*(g/1000))+" / "+fmtAmt(g,isVol); }
    return inr(ps.avgPerKg)+(isVol?"/L":"/kg");
  }
  let q=rows.reduce((s,r)=>s+r.q,0), p=rows.reduce((s,r)=>s+r.p,0);
  return (q>0&&p>0)? inr(p/q)+" each" : null;
}

function itemDetail(){
  let rows=filtered().filter(r=>r.cat===STATE.cat&&r.sub===STATE.sub&&r.it===STATE.it);
  let ac=accent();
  if(!rows.length){
    return `<div class="detail"><div class="dhead"><div><div class="iname">${STATE.it}</div>
      <div class="sub mono">no purchases in this range</div></div></div>
      <div class="empty mono">Nothing bought in the selected dates. Widen the range, or pick a sibling above.</div></div>`;
  }
  let total=rows.reduce((s,r)=>s+r.p,0), qty=rows.reduce((s,r)=>s+r.q,0);
  let {weighed,series,buys,totG,weighablePaid,excluded,avgPerKg,inferredG}=priceSeries(rows);
  let nBuys=buys.length;
  // restock interval (days between consecutive buys) - uses all purchase occasions
  let gaps=[]; for(let i=1;i<buys.length;i++)gaps.push(Math.round((buys[i].dt-buys[i-1].dt)/86400000));
  let avgGap=gaps.length?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):null;
  // typical purchase quantity = most common pack size actually bought for this item
  let szCount={}; rows.forEach(r=>{ if(r.sz) szCount[String(r.sz)]=(szCount[String(r.sz)]||0)+1; });
  let modeSz=Object.entries(szCount).sort((a,b)=>b[1]-a[1])[0];
  let typQty = modeSz ? modeSz[0] : (weighed ? ((totG/Math.max(1,buys.length))/1000).toFixed(2)+" kg" : Math.round(qty/Math.max(1,buys.length))+" units");
  // price-spike flags
  let sp=spikeFlags(series);
  // chart - x spans the selected range; solid across actual data, dotted before/after
  let chart="";
  if(series.length){
    let [ra,rb]=activeRange(); let rT0=ra.getTime(), rT1=rb.getTime();
    let W=Math.max(280,(document.getElementById('view')||{}).clientWidth||304),H=92, us=series.map(s=>s.unit), mn=Math.min(...us), mx=Math.max(...us); if(mx===mn){mx+=1;mn-=1;}
    let dT0=series[0].t, dT1=series[series.length-1].t;          // data extent for this item
    let axMin=Math.min(rT0,dT0), axMax=Math.max(rT1,dT1);
    let xs=t=>axMax>axMin?20+((t-axMin)/(axMax-axMin))*(W-40):W/2;
    let ys=u=>18+(1-(u-mn)/(mx-mn))*(H-44);
    let pts=series.map(s=>`${xs(s.t).toFixed(0)},${ys(s.unit).toFixed(0)}`).join(" ");
    // dotted extensions (flat at first/last known value) into no-data regions
    let lead = axMin<dT0 ? `<polyline points="${xs(axMin).toFixed(0)},${ys(series[0].unit).toFixed(0)} ${xs(dT0).toFixed(0)},${ys(series[0].unit).toFixed(0)}" fill="none" stroke="${ac}" stroke-width="2" stroke-dasharray="3 3" opacity="0.5"/>`:"";
    let trail= axMax>dT1 ? `<polyline points="${xs(dT1).toFixed(0)},${ys(series[series.length-1].unit).toFixed(0)} ${xs(axMax).toFixed(0)},${ys(series[series.length-1].unit).toFixed(0)}" fill="none" stroke="${ac}" stroke-width="2" stroke-dasharray="3 3" opacity="0.5"/>`:"";
    let dots=series.map((s,i)=>{
      let f=sp.flags[i];
      let cx=xs(s.t).toFixed(0), cy=ys(s.unit).toFixed(0);
      let pct=(f&&sp.med)?Math.round((s.unit/sp.med-1)*100):0;
      let priceLine=weighed?inr(s.unit)+'/kg':inr(s.unit)+'/unit';
      let tip=fmtD(s.dt)+'<br>'+(s.plats.join(', ')||'platform ?')+'<br>'+priceLine+'<br>paid '+inr(s.paid)+(s.szs.length?'<br>pack '+s.szs.join(', '):'')+(f?'<br>▲ '+pct+'% above usual':'');
      return `<circle class="pt" data-tip="${tip}" cx="${cx}" cy="${cy}" r="12" fill="transparent"/>`+
             `<circle class="pt" data-tip="${tip}" cx="${cx}" cy="${cy}" r="${f?5.5:4.5}" fill="${f?'#C0392B':'#fff'}" stroke="${f?'#C0392B':ac}" stroke-width="2.5"/>`;
    }).join("");
    let labs=[`<text x="${xs(series[0].t).toFixed(0)}" y="${H-6}" class="tk" text-anchor="middle">${fmtD(series[0].dt)}</text>`];
    if(series.length>1) labs.push(`<text x="${xs(series[series.length-1].t).toFixed(0)}" y="${H-6}" class="tk" text-anchor="middle">${fmtD(series[series.length-1].dt)}</text>`);
    let vstep=Math.ceil(series.length/3)||1;
    let vlab=series.map((s,i)=> i%vstep===0?`<text x="${(xs(s.t)+8).toFixed(0)}" y="${(ys(s.unit)-7).toFixed(0)}" class="vk" fill="${sp.flags[i]?'#C0392B':'var(--accent)'}">${inr(s.unit)}</text>`:"").join("");
    chart=`<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">
      <line x1="0" y1="20" x2="${W}" y2="20" stroke="var(--line)"/><line x1="0" y1="${H-26}" x2="${W}" y2="${H-26}" stroke="var(--line)"/>
      ${lead}${trail}<polyline points="${pts}" fill="none" stroke="${ac}" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labs.join("")}${vlab}</svg>`;
  }
  let spikeNote = sp.any ? `<div class="spikenote"><span class="spkdot"></span>price spike - a buy 20%+ above this item's usual rate</div>` : "";
  let exclNote = excluded>0 ? `<div class="exclnote mono">${excluded} size-less buy${excluded>1?'s':''} estimated from average ₹/kg</div>` : "";
  let volG = totG + (inferredG||0);
  let unitLabel = weighed? "avg ₹/kg" : "avg ₹/unit";
  let unitVal = weighed? (totG>0?inr(weighablePaid/(totG/1000)):"-") : inr(total/qty);
  let volLabel = weighed? "volume" : "units";
  let volVal = weighed? ((inferredG>0?"~":"")+(volG/1000).toFixed(2)+" kg") : qty;
  // estimate depletion for this item from ALL its data (not range-limited)
  let allItemRows=LEDGER.filter(r=>r.it===STATE.it && !r.ex);
  let aps=priceSeries(allItemRows), abuys=aps.buys, runsOut="—";
  if(abuys.length>=3){
    let g=[]; for(let i=1;i<abuys.length;i++)g.push((abuys[i].dt-abuys[i-1].dt)/86400000);
    let ai=g.reduce((a,b)=>a+b,0)/g.length;
    if(ai>0){ let today=dataExtent()[1];
      let du=(abuys[abuys.length-1].dt.getTime()+ai*86400000-today)/86400000;
      runsOut = du<=0? "now" : "~"+Math.round(du)+"d"; }
  }
  let restockMain = avgGap? ("~"+avgGap+" days") : "one buy";
  let pByDay={}; LEDGER.filter(r=>r.it===STATE.it).forEach(r=>{ let k=r.y+"-"+(r.m||0)+"-"+r.d; (pByDay[k]=pByDay[k]||{y:r.y,m:(r.m||0),d:r.d,paid:0,ex:true}); pByDay[k].paid+=r.p; if(!r.ex)pByDay[k].ex=false; });
  let purchaseList=Object.values(pByDay).sort((a,b)=>new Date(b.y,b.m,b.d)-new Date(a.y,a.m,a.d)).map(o=>`<div class="prow${o.ex?' exline':''}"><span class="dot mono daychip" data-y="${o.y}" data-m="${o.m}" data-d="${o.d}" style="border-color:${ac};color:${ac};cursor:pointer">${fmtD(new Date(o.y,o.m,o.d))}</span><span class="ppaid mono">${inr(o.paid)}</span><button class="exbtn" data-exday="${o.y}|${o.m}|${o.d}">${o.ex?'include':'exclude'}</button></div>`).join("");
  return `<div class="detail">
    <div class="dhead">
      <div><div class="iname">${STATE.it}</div><div class="sub mono">bought ${nBuys}× · ${weighed?((inferredG>0?"~":"")+(volG/1000).toFixed(2)+" kg"):qty+" units"}</div></div>
      <div style="text-align:right"><div class="tk">paid</div><div class="mono" style="font-size:20px;color:${ac}">${inr(total)}</div></div>
    </div>
    <div class="eb" style="margin:14px 0 6px">price trend · ${weighed?'₹/kg':'₹/unit'} &nbsp;·&nbsp; dotted = no data</div>
    ${chart||'<div class="sub mono">single data point</div>'}
    ${spikeNote}${exclNote}
    <div class="stats">
      <div class="stat"><div class="tk">${unitLabel}</div><div class="sv mono">${unitVal}</div></div>
      <div class="stat"><div class="tk">restock</div><div class="sv mono">${restockMain}</div><div class="sv2 mono">buy ${typQty}</div></div>
      <div class="stat"><div class="tk">runs out</div><div class="sv mono">${runsOut}</div></div>
    </div>
    <div class="eb" style="margin:16px 0 8px">purchases · exclude a one-off to drop it from all totals</div>
    <div class="plist">${purchaseList}</div>
  </div>`;
}

function emptyMsg(){ return `<div class="empty mono">No purchases in the selected dates. Widen the range, or step up via the breadcrumb.</div>`; }

// ---- Restock tab: infer what's likely run out and nudge ----
function restockList(){
  let today=dataExtent()[1];
  let byItem={}; LEDGER.filter(r=>!r.ex).forEach(r=>{ (byItem[r.it]=byItem[r.it]||[]).push(r); });
  let out=[];
  Object.entries(byItem).forEach(([it,rows])=>{
    let ps=priceSeries(rows), buys=ps.buys;
    if(buys.length<3) return;                       // high-confidence only
    let gaps=[]; for(let i=1;i<buys.length;i++)gaps.push((buys[i].dt-buys[i-1].dt)/86400000);
    let avgInt=gaps.reduce((a,b)=>a+b,0)/gaps.length;
    if(!(avgInt>0)) return;
    let lastBuy=buys[buys.length-1].dt.getTime();
    let daysSince=(today-lastBuy)/86400000;
    let daysUntilOut=(lastBuy+avgInt*86400000-today)/86400000;
    let szc={}; rows.forEach(r=>{if(r.sz)szc[String(r.sz)]=(szc[String(r.sz)]||0)+1;});
    let modeSz=Object.entries(szc).sort((a,b)=>b[1]-a[1])[0];
    let qty=modeSz?modeSz[0]:(ps.weighed?((ps.totG/Math.max(1,buys.length))/1000).toFixed(2)+" kg":"1 unit");
    out.push({it,cat:rows[0].cat,sub:rows[0].sub,qty,avgInt,daysSince,daysUntilOut});
  });
  return out;
}
function restockView(){
  let today=dataExtent()[1], tomorrow=new Date(today+86400000);
  let list=restockList();
  let overdue=list.filter(x=>x.daysUntilOut<=0).sort((a,b)=>a.daysUntilOut-b.daysUntilOut);
  let tmr=list.filter(x=>x.daysUntilOut>0&&x.daysUntilOut<=1.5).sort((a,b)=>a.daysUntilOut-b.daysUntilOut);
  let soon=list.filter(x=>x.daysUntilOut>1.5&&x.daysUntilOut<=3).sort((a,b)=>a.daysUntilOut-b.daysUntilOut);
  let count=overdue.length+tmr.length;
  let row=(x)=>{ let col=catColor(x.cat); let since=Math.round(x.daysSince), every=Math.round(x.avgInt);
    return `<div class="rkrow" data-rkitem="${encodeURIComponent(x.it)}" data-rkcat="${encodeURIComponent(x.cat)}" data-rksub="${encodeURIComponent(x.sub)}">
      <span class="rkdot" style="background:${col.text}"></span>
      <div class="rkmain"><div class="rkname">${x.it}</div><div class="rkreason mono">last bought ${since}d ago · usually every ${every}d</div></div>
      <div class="rkqty">${x.qty}</div></div>`; };
  let section=(title,arr,cls)=> arr.length? `<div class="rksec"><div class="rkhead ${cls}">${title} · ${arr.length}</div>${arr.map(row).join("")}</div>`:"";
  let body=(overdue.length||tmr.length||soon.length)
    ? section("Overdue - likely out",overdue,"od")+section("Due tomorrow",tmr,"dt")+section("Coming up",soon,"cu")
    : `<div class="empty mono">Nothing due in the next few days.</div>`;
  return `<div class="rkhero">
      <div class="eb">restock for ${fmtD(tomorrow)}</div>
      <div class="num" style="color:var(--accent)">${count}</div>
      <div class="sub mono">item${count!==1?'s':''} to buy now or tomorrow</div>
    </div>${body}
    <div class="rknote mono">Inferred from your buying rhythm across all platforms. Assumes you log purchases nightly and that buying an item again means the previous lot ran out. Only items bought 3+ times are shown; one-offs are skipped.</div>`;
}
// ---- Rhythm tab: when you actually buy each staple, on a shared timeline ----
function rhythmView(){
  let [axMin,axMax]=dataExtent();
  let byItem={}; LEDGER.filter(r=>!r.ex).forEach(r=>{ (byItem[r.it]=byItem[r.it]||[]).push(r); });
  let items=[];
  Object.entries(byItem).forEach(([it,rows])=>{
    let ps=priceSeries(rows); let buys=ps.buys;
    if(buys.length<3) return;                       // need a rhythm to show
    let gaps=[]; for(let i=1;i<buys.length;i++)gaps.push((buys[i].dt-buys[i-1].dt)/86400000);
    let avg=gaps.reduce((a,b)=>a+b,0)/gaps.length;
    items.push({it,cat:rows[0].cat,sub:rows[0].sub,buys,n:buys.length,avg,rate:rhythmRate(ps,rows)});
  });
  items.sort((a,b)=> b.n-a.n || a.avg-b.avg);
  if(!items.length) return `<div class="empty mono">Need an item bought 3+ times to show a rhythm. Widen your data or log more buys.</div>`;
  let W=Math.max(280,(document.getElementById('view')||{}).clientWidth||320), PADL=4, PADR=4, span=(axMax-axMin)||1;
  let xs=t=> PADL + ((t-axMin)/span)*(W-PADL-PADR);
  // weekly marks, shared across all lanes (echoes the dashboard sparkline language)
  let weeks=[]; for(let t=axMin; t<=axMax+1; t+=7*86400000) weeks.push(t);
  let grid=weeks.map(t=>`<line x1="${xs(t).toFixed(1)}" y1="1" x2="${xs(t).toFixed(1)}" y2="21" stroke="var(--line)" opacity="0.55"/>`).join("");
  let axTicks=weeks.map((t,i)=> (i%2===0||weeks.length<=6)?`<text x="${xs(t).toFixed(1)}" y="10" class="tk" text-anchor="middle">${fmtD(new Date(t))}</text>`:"").join("");
  let axisSvg=`<svg viewBox="0 0 ${W} 14" width="100%" height="14" style="display:block">${axTicks}</svg>`;
  let lanes=items.map(o=>{
    let col=catColor(o.cat);
    let dots=o.buys.map(b=>`<circle cx="${xs(b.dt.getTime()).toFixed(1)}" cy="11" r="3.6" fill="${col.text}"/>`).join("");
    let lane=`<svg viewBox="0 0 ${W} 22" width="100%" height="22" style="display:block">${grid}`+
      `<line x1="${PADL}" y1="11" x2="${W-PADR}" y2="11" stroke="var(--line)"/>${dots}</svg>`;
    return `<div class="rhitem" data-rkitem="${encodeURIComponent(o.it)}" data-rkcat="${encodeURIComponent(o.cat)}" data-rksub="${encodeURIComponent(o.sub)}">
      <div class="rhrow"><span class="rhname">${o.it}${o.rate?` <span class="rhunit mono">(${o.rate})</span>`:""}</span><span class="rhevery mono" style="color:${col.text}">every ${Math.round(o.avg)}d · ${o.n}×</span></div>
      ${lane}</div>`;
  }).join("");
  return `<div class="rkhero">
      <div class="eb">buying rhythm</div>
      <div class="num" style="color:var(--accent)">${items.length}</div>
      <div class="sub mono">staples with a steady pattern</div>
    </div>
    <div class="rhaxis">${axisSvg}</div>
    ${lanes}
    <div class="rknote mono">Each dot is a day you bought the item, plotted on a shared timeline with weekly marks. Even spacing means a predictable rhythm; the figure on the right is your average gap between buys. Only items bought 3+ times are shown. Tap a row to open its price trend.</div>`;
}
function setTab(t){
  STATE.tab=t;
  document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("on",x.getAttribute("data-tab")===t));
  let dash=(t==="dash");
  let sw=document.querySelector(".searchwrap"); if(sw)sw.style.display=dash?"block":"none";
  let fl=document.querySelector(".filter"); if(fl)fl.style.display=dash?"block":"none";
  let nv=document.querySelector(".navrow"); if(nv)nv.style.display=dash?"flex":"none";
  render();
}
function bindTabs(){ document.querySelectorAll("[data-tab]").forEach(el=>el.onclick=()=>setTab(el.getAttribute("data-tab"))); }


// ---- Inventory tab: everything logged, assumed still on hand ----
// is a size measured by volume (ml/L) or mass (g/kg)?
function unitKind(sz){
  if(!sz) return null;
  let s=String(sz).toLowerCase();
  if(/\d\s*(ml|l)\b/.test(s)) return "vol";
  if(/\d\s*(kg|gm|g)\b/.test(s)) return "mass";
  return null;
}
function invAmount(rows){
  let totalQty=rows.reduce((s,r)=>s+r.q,0);
  let totG=0, mass=0, vol=0;
  rows.forEach(r=>{ let g=grams(r.sz); if(g){ totG+=g*r.q; let k=unitKind(r.sz); if(k==="vol")vol++; else if(k==="mass")mass++; } });
  let weighable=rows.filter(r=>grams(r.sz)!=null).length;
  if(weighable>=Math.ceil(rows.length/2) && totG>0){
    let isVol=vol>mass, big=isVol?"L":"kg", small=isVol?"ml":"g";
    return totG>=1000 ? (totG/1000).toFixed(totG>=10000?0:1)+" "+big : Math.round(totG)+" "+small;
  }
  return totalQty+" pk";
}
function inventoryView(){
  let byItem={}; LEDGER.filter(r=>!r.ex).forEach(r=>{ (byItem[r.it]=byItem[r.it]||[]).push(r); });
  let items=Object.entries(byItem).map(([it,rows])=>{
    let last=rows.slice().sort((a,b)=>rowDate(b)-rowDate(a))[0];
    return {it, cat:rows[0].cat, sub:rows[0].sub, last:rowDate(last), n:rows.length, amount:invAmount(rows)};
  });
  if(!items.length) return `<div class="empty mono">Nothing logged yet - upload a ledger to see what's on hand.</div>`;
  let byCat={}; items.forEach(x=>{ (byCat[x.cat]=byCat[x.cat]||[]).push(x); });
  let cats=Object.keys(byCat).sort((a,b)=> byCat[b].length-byCat[a].length || a.localeCompare(b));
  let body=cats.map(c=>{
    let col=catColor(c);
    let list=byCat[c].sort((a,b)=> b.last-a.last);
    let rws=list.map(x=>`<div class="rkrow" data-rkitem="${encodeURIComponent(x.it)}" data-rkcat="${encodeURIComponent(x.cat)}" data-rksub="${encodeURIComponent(x.sub)}">
        <span class="rkdot" style="background:${col.text}"></span>
        <div class="rkmain"><div class="rkname">${x.it}</div><div class="rkreason mono">added ${fmtD(x.last)} · ${x.n} buy${x.n>1?'s':''} logged</div></div>
        <div class="rkqty">${x.amount}</div></div>`).join("");
    return `<div class="rksec"><div class="rkhead" style="color:${col.text}">${c} · ${list.length}</div>${rws}</div>`;
  }).join("");
  return `<div class="rkhero">
      <div class="eb">in your kitchen</div>
      <div class="num" style="color:var(--accent)">${items.length}</div>
      <div class="sub mono">items on hand · ${cats.length} categories</div>
    </div>${body}
    <div class="rknote mono">Everything you've logged, assumed still on hand. "Added" is the most recent purchase; the amount is the total logged quantity. Tap an item for its price history.</div>`;
}

function render(){
  if(STATE.tab==="restock"){ app().innerHTML=restockView(); bind(); return; }
  if(STATE.tab==="rhythm"){ app().innerHTML=rhythmView(); bind(); return; }
  if(STATE.tab==="inventory"){ app().innerHTML=inventoryView(); bind(); return; }
  let rows=filtered();
  let html="";
  if(STATE.platform) html+=`<div class="pbanner">Platform · <b>${STATE.platform}</b><span class="pclear" id="pclear">clear ✕</span></div>`;
  html+=breadcrumb();
  html+=siblings();
  if(STATE.level===0){
    let m=sortedEntries(agg(rows,r=>r.cat));
    let maxV=m.length?m[0][1].paid:1;
    let dys=new Set(rows.map(r=>r.d)).size;
    html+=hero(rows,"total spent",`${rows.length} items · ${dys} days`);
    html+=`<div class="eb sect">spend by ${LABELS.cat.toLowerCase()} &nbsp;·&nbsp; tap to drill</div>`;
    html+= m.length ? m.map(([c,o])=>{let col=catColor(c);return bar(c,o.paid,maxV,col.fill,col.text,true);}).join("") : emptyMsg();
  } else if(STATE.level===1){
    let cr=rows.filter(r=>r.cat===STATE.cat);
    let m=sortedEntries(agg(cr,r=>r.sub));
    let maxV=m.length?m[0][1].paid:1;
    let col=catColor(STATE.cat);
    html+=hero(cr,STATE.cat+" · "+LABELS.cat.toLowerCase()+" total",`${cr.length} items`);
    html+=`<div class="eb sect">${LABELS.sub.toLowerCase()}</div>`;
    html+= m.length ? m.map(([s,o])=>bar(s,o.paid,maxV,col.fill,col.text,true)).join("") : emptyMsg();
  } else if(STATE.level===2){
    let cr=rows.filter(r=>r.cat===STATE.cat&&r.sub===STATE.sub);
    let m=sortedEntries(agg(cr,r=>r.it));
    let maxV=m.length?m[0][1].paid:1;
    let col=catColor(STATE.cat);
    html+=hero(cr,STATE.sub+" · "+LABELS.sub.toLowerCase()+" total",`${cr.length} items`);
    html+=`<div class="eb sect">${LABELS.it.toLowerCase()}s &nbsp;·&nbsp; tap for price trend</div>`;
    html+= m.length ? m.map(([it,o])=>{
      let irows=cr.filter(r=>r.it===it);
      let flag=spikeFlags(priceSeries(irows).series).any?`<span class="spk" title="price spike in range">▲</span>`:"";
      return bar(it,o.paid,maxV,col.fill,col.text,true,flag);
    }).join("") : emptyMsg();
  } else if(STATE.level===3){
    html+=itemDetail();
  }
  app().innerHTML=html;
  bind();
  bindChartTips();
}

function bindChartTips(){
  let tip=document.getElementById("tip"); if(!tip)return;
  let place=(e)=>{ let x=(e.touches&&e.touches[0]?e.touches[0].clientX:e.clientX), y=(e.touches&&e.touches[0]?e.touches[0].clientY:e.clientY);
    tip.style.left=Math.max(8,Math.min(window.innerWidth-200,x+12))+"px"; tip.style.top=(y+14)+"px"; };
  app().querySelectorAll(".pt").forEach(el=>{
    let show=(e)=>{ tip.innerHTML=el.getAttribute("data-tip"); tip.classList.add("show"); place(e); };
    el.addEventListener("mouseenter",show);
    el.addEventListener("mousemove",place);
    el.addEventListener("mouseleave",()=>tip.classList.remove("show"));
    el.addEventListener("click",(e)=>{e.stopPropagation(); show(e);});
  });
}

// ---- day detail: all purchases on a given date, across platforms ----
function showDay(y,m,d){
  let all=LEDGER.filter(r=>r.y===y && (r.m||0)===m && r.d===d);
  if(!all.length)return;
  let dt=new Date(y,m,d);
  let incl=all.filter(r=>!r.ex), exCount=all.length-incl.length, total=incl.reduce((s,r)=>s+r.p,0);
  let byPlat={}; all.forEach(r=>{(byPlat[r.pl]=byPlat[r.pl]||[]).push(r);});
  let np=Object.keys(byPlat).length;
  let html=`<div class="dayhdr"><div><div class="iname" style="font-size:20px">${fmtD(dt)}</div><div class="sub mono">${incl.length} item${incl.length!==1?'s':''} · ${inr(total)} across ${np} platform${np>1?'s':''}${exCount?` · ${exCount} excluded`:''}</div></div><span class="dayclose" id="dayclose">✕</span></div>`;
  Object.keys(byPlat).sort().forEach(pl=>{
    let pt=byPlat[pl].filter(r=>!r.ex).reduce((s,r)=>s+r.p,0);
    html+=`<div class="dayplat">${pl} · ${inr(pt)}</div>`;
    byPlat[pl].forEach(r=>{ html+=`<div class="dayline${r.ex?' exline':''}"><div><div class="daynm">${r.it}</div><div class="daysub">${r.br?r.br+' · ':''}${r.sz||''}${r.q>1?' × '+r.q:''}</div></div><div class="dayright"><div class="daypaid">${inr(r.p)}</div><button class="exbtn" data-exsig="${encodeURIComponent(rowSig(r))}">${r.ex?'include':'exclude'}</button></div></div>`; });
  });
  let card=document.getElementById("daycard"); card.innerHTML=html;
  document.getElementById("daymodal").classList.add("show");
  document.getElementById("dayclose").onclick=()=>document.getElementById("daymodal").classList.remove("show");
  card.querySelectorAll(".exbtn").forEach(b=>{ b.onclick=()=>{ toggleExclude(decodeURIComponent(b.getAttribute("data-exsig"))); showDay(y,m,d); render(); }; });
}

function bind(){
  app().querySelectorAll(".daychip").forEach(el=>el.onclick=()=>showDay(+el.getAttribute("data-y"),+el.getAttribute("data-m"),+el.getAttribute("data-d")));
  app().querySelectorAll(".exbtn[data-exday]").forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); let p=b.getAttribute("data-exday").split("|"); toggleExcludeDay(STATE.it,+p[0],+p[1],+p[2]); render(); });
  app().querySelectorAll("[data-rkitem]").forEach(el=>el.onclick=()=>{
    let it=decodeURIComponent(el.getAttribute("data-rkitem"));
    let cat=decodeURIComponent(el.getAttribute("data-rkcat"));
    let sub=decodeURIComponent(el.getAttribute("data-rksub"));
    setTab("dash"); navigateTo({type:"item",name:it,cat,sub});
  });
  let pc=document.getElementById("pclear");
  if(pc)pc.onclick=()=>{ STATE.platform=null; STATE.level=0; STATE.cat=STATE.sub=STATE.it=null; nav(); };
  app().querySelectorAll("[data-drill]").forEach(el=>el.onclick=()=>{
    let name=decodeURIComponent(el.getAttribute("data-drill"));
    if(STATE.level===0){STATE.cat=name;STATE.level=1;}
    else if(STATE.level===1){STATE.sub=name;STATE.level=2;}
    else if(STATE.level===2){STATE.it=name;STATE.level=3;}
    nav();
  });
  app().querySelectorAll("[data-go]").forEach(el=>el.onclick=()=>{
    let lv=+el.getAttribute("data-go");
    STATE.level=lv;
    if(lv<3)STATE.it=null; if(lv<2)STATE.sub=null; if(lv<1)STATE.cat=null;
    nav();
  });
  app().querySelectorAll("[data-sib]").forEach(el=>el.onclick=()=>{
    let name=decodeURIComponent(el.getAttribute("data-sib"));
    if(STATE.level===1)STATE.cat=name;
    else if(STATE.level===2)STATE.sub=name;
    else if(STATE.level===3)STATE.it=name;
    nav();
  });
}

// ---- navigation history (browser-style back / forward) ----
let HIST=[], HI=-1;
function snap(){return {level:STATE.level,cat:STATE.cat,sub:STATE.sub,it:STATE.it,platform:STATE.platform,rangeKey:STATE.rangeKey,off:STATE.off,custom:STATE.custom.slice()};}
function restoreSnap(s){STATE.level=s.level;STATE.cat=s.cat;STATE.sub=s.sub;STATE.it=s.it;STATE.platform=s.platform;STATE.rangeKey=s.rangeKey;STATE.off=s.off||0;STATE.custom=s.custom.slice();}
function sameAsTop(){ if(HI<0)return false; let s=HIST[HI],n=snap(); return JSON.stringify(s)===JSON.stringify(n); }
function pushHist(){ if(sameAsTop())return; HIST=HIST.slice(0,HI+1); HIST.push(snap()); HI=HIST.length-1; updateNav(); }
function updateNav(){ let b=document.getElementById("backbtn"),f=document.getElementById("fwdbtn"),h=document.getElementById("homebtn");
  if(b)b.disabled=HI<=0; if(f)f.disabled=HI>=HIST.length-1; if(h)h.disabled=false; }
function syncFilterUI(){
  document.querySelectorAll("[data-range]").forEach(x=>x.classList.toggle("on",x.getAttribute("data-range")===STATE.rangeKey));
  let cw=document.getElementById("customwrap"); if(cw)cw.style.display=STATE.rangeKey==="custom"?"flex":"none";
  let st=document.getElementById("stepper"); if(st)st.style.display=STATE.rangeKey==="custom"?"none":"flex";
  updatePeriodLabel();
}
function updatePeriodLabel(){
  let el=document.getElementById("periodlabel"); if(!el)return;
  if(STATE.rangeKey==="today"){ let d=refDay(); el.textContent=(STATE.off===0?"Today · ":"")+fmtD(d)+" "+d.getFullYear(); }
  else if(STATE.rangeKey==="month"){ let m=refMonth(); el.textContent=MONTHS[m.getMonth()]+" "+m.getFullYear(); }
  let nb=document.getElementById("nextPeriod"); if(nb)nb.disabled=STATE.off>=0;
}
function goBack(){ if(HI>0){HI--;restoreSnap(HIST[HI]);syncFilterUI();render();updateNav();} }
function goFwd(){ if(HI<HIST.length-1){HI++;restoreSnap(HIST[HI]);syncFilterUI();render();updateNav();} }
function goHome(){ STATE.level=0;STATE.cat=null;STATE.sub=null;STATE.it=null; STATE.platform=null; STATE.rangeKey="month";STATE.off=0;STATE.custom=[null,null]; setTab("dash"); syncFilterUI(); nav(); }
function nav(){ pushHist(); render(); }
function bindNav(){ document.getElementById("backbtn").onclick=goBack; document.getElementById("fwdbtn").onclick=goFwd; document.getElementById("homebtn").onclick=goHome; }

// ---- search (jump straight to an item / subcategory / category) ----
function lsGet(k,def){ try{let v=localStorage.getItem(k); return v?JSON.parse(v):def;}catch(e){return def;} }
function lsSet(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch(e){} }
function persistLedger(rows, labels, fname){ lsSet("khata_labels",labels); lsSet("khata_ledger",rows); lsSet("khata_ledger_name",fname); }
function abToB64(buf){ let b=new Uint8Array(buf),s="",c=0x8000; for(let i=0;i<b.length;i+=c){ s+=String.fromCharCode.apply(null,b.subarray(i,i+c)); } return btoa(s); }
function b64ToBlob(b64,type){ let bin=atob(b64),n=bin.length,a=new Uint8Array(n); for(let i=0;i<n;i++)a[i]=bin.charCodeAt(i); return new Blob([a],{type:type||"application/octet-stream"}); }
function downloadUpload(){ if(!UPLOAD_B64){ setStatus("No stored file yet - upload your Excel first to enable download.",true); return; } let blob=b64ToBlob(UPLOAD_B64,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); let url=URL.createObjectURL(blob); let a=document.createElement("a"); a.href=url; a.download=UPLOAD_NAME||"khata-ledger.xlsx"; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function(){URL.revokeObjectURL(url);},1500); }
let RECENTS=(lsGet("khata_recents",[])||[]).filter(x=>x&&typeof x==="object"&&x.name);
function addRecent(r){ if(!r||!r.name)return; RECENTS=[{type:r.type,name:r.name,cat:r.cat||null,sub:r.sub||null},...RECENTS.filter(x=>!(x.type===r.type&&x.name===r.name))].slice(0,3); lsSet("khata_recents",RECENTS); }
function navigateTo(r){
  if(r.type==="platform"){STATE.platform=r.name;STATE.level=0;STATE.cat=null;STATE.sub=null;STATE.it=null;}
  else if(r.type==="item"){STATE.cat=r.cat;STATE.sub=r.sub;STATE.it=r.name;STATE.level=3;}
  else if(r.type==="subcategory"){STATE.cat=r.cat;STATE.sub=r.name;STATE.it=null;STATE.level=2;}
  else {STATE.cat=r.name;STATE.sub=null;STATE.it=null;STATE.level=1;}
  nav();
}
function showRecents(){
  let box=document.getElementById("searchresults"); if(!box)return;
  if(!RECENTS.length){ box.classList.remove("show"); box.innerHTML=""; return; }
  box.innerHTML='<div class="rhead"><span>Recent searches</span><span class="rclear" id="rclear">clear</span></div>'+
    RECENTS.map((r,i)=>`<div class="ritem" data-rec="${i}"><span class="rname" style="font-weight:500">${r.name}</span><span class="rtag">${typeLabel(r.type)}</span></div>`).join("");
  box.classList.add("show");
  let cl=document.getElementById("rclear"); if(cl)cl.onclick=(e)=>{e.stopPropagation(); RECENTS=[]; lsSet("khata_recents",RECENTS); box.classList.remove("show"); box.innerHTML="";};
  box.querySelectorAll("[data-rec]").forEach(el=>el.onclick=()=>{ let r=RECENTS[+el.getAttribute("data-rec")]; document.getElementById("search").value=""; box.classList.remove("show"); box.innerHTML=""; navigateTo(r); });
}
function buildIndex(){
  let items={}, subs={}, cats={}, plats={};
  LEDGER.forEach(r=>{
    if(r.it){
      let e=items[r.it]||(items[r.it]={cat:r.cat,sub:r.sub,brand:null,hay:r.it.toLowerCase()});
      if(r.br){ if(!e.brand)e.brand=r.br; e.hay+=" "+String(r.br).toLowerCase(); }
      if(r.nm) e.hay+=" "+String(r.nm).toLowerCase();
    }
    if(r.sub)subs[r.sub]=r.cat; if(r.cat)cats[r.cat]=1; if(r.pl)plats[r.pl]=1;
  });
  return {items,subs,cats,plats};
}
function doSearch(q){
  let box=document.getElementById("searchresults"); if(!box)return;
  q=(q||"").trim().toLowerCase();
  if(!q){ showRecents(); return; }
  let idx=buildIndex(), res=[];
  Object.keys(idx.plats).forEach(p=>{ if(p.toLowerCase().includes(q)) res.push({type:"platform",name:p}); });
  Object.keys(idx.items).forEach(it=>{ if(idx.items[it].hay.includes(q)) res.push({type:"item",name:it,brand:idx.items[it].brand,cat:idx.items[it].cat,sub:idx.items[it].sub}); });
  Object.keys(idx.subs).forEach(s=>{ if(s.toLowerCase().includes(q)) res.push({type:"subcategory",name:s,cat:idx.subs[s]}); });
  Object.keys(idx.cats).forEach(c=>{ if(c.toLowerCase().includes(q)) res.push({type:"category",name:c}); });
  res.sort((a,b)=>{let o={platform:0,item:1,subcategory:2,category:3}; return o[a.type]-o[b.type] || a.name.localeCompare(b.name);});
  res=res.slice(0,8);
  if(!res.length){ box.innerHTML='<div class="ritem"><span class="rname" style="font-weight:400;color:var(--dim)">No match</span></div>'; box.classList.add("show"); return; }
  box.innerHTML=res.map((r,i)=>`<div class="ritem" data-ri="${i}"><span class="rname">${r.name}${r.brand?`<span class="rbrand"> · ${r.brand}</span>`:""}</span><span class="rtag">${typeLabel(r.type)}</span></div>`).join("");
  box.classList.add("show");
  box.querySelectorAll("[data-ri]").forEach(el=>el.onclick=()=>{
    let r=res[+el.getAttribute("data-ri")];
    addRecent(r);
    document.getElementById("search").value=""; box.classList.remove("show"); box.innerHTML="";
    navigateTo(r);
  });
}
function bindSearch(){
  let inp=document.getElementById("search"); if(!inp)return;
  inp.oninput=()=>doSearch(inp.value);
  inp.onfocus=()=>{ if(inp.value)doSearch(inp.value); else showRecents(); };
  document.addEventListener("click",e=>{ if(!e.target.closest(".searchwrap")){ let b=document.getElementById("searchresults"); if(b)b.classList.remove("show"); }});
}

// ---- Excel upload (reads the master ledger in-browser via SheetJS) ----
const MSET={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function sheetYear(name){ let m=String(name||"").match(/\b(19|20)\d{2}\b/); return m?+m[0]:null; }
function sheetMonth(name){ let s=String(name||"").toLowerCase(); for(let k in MSET){ if(s.indexOf(k)>=0) return MSET[k]; } return null; }
function parseRowDate(v, ctxY, ctxM){
  if(v instanceof Date && !isNaN(v.getTime())) return {d:v.getDate(), m:v.getMonth(), y:v.getFullYear()};
  let s=String(v==null?"":v).trim();
  let iso=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(iso) return {d:+iso[3], m:+iso[2]-1, y:+iso[1]};
  let m=s.match(/(\d{1,2})[-\s/.]+([A-Za-z]{3,})[-\s/.,']*(\d{2,4})?/);
  if(m){ let mi=MSET[m[2].slice(0,3).toLowerCase()];
    let y=m[3]?(+m[3]<100?2000+(+m[3]):+m[3]):(ctxY!=null?ctxY:new Date().getFullYear());
    return {d:+m[1], m:(mi==null?(ctxM!=null?ctxM:0):mi), y:y}; }
  return {d:1, m:(ctxM!=null?ctxM:new Date().getMonth()), y:(ctxY!=null?ctxY:new Date().getFullYear())};
}
function colMap(hdr){
  let H=(hdr||[]).map(x=>String(x==null?"":x).toLowerCase().replace(/\s+/g," ").trim());
  let f=p=>{ for(let i=0;i<H.length;i++) if(p(H[i])) return i; return -1; };
  return { date:f(h=>h.indexOf("date")>=0),
    plat:f(h=>h.indexOf("platform")>=0),
    brand:f(h=>h.indexOf("brand")>=0),
    item:f(h=>h==="item"||h.indexOf("item name")>=0),
    variant:f(h=>h.indexOf("variant")>=0||h.indexOf("size")>=0),
    cat:f(h=>h.indexOf("category")>=0&&h.indexOf("subcategory")<0),
    sub:f(h=>h.indexOf("subcategory")>=0),
    itype:f(h=>h.indexOf("item type")>=0),
    qty:f(h=>h==="qty"||h.indexOf("quantity")>=0),
    mrp:f(h=>h.indexOf("unit price")>=0||h.indexOf("(mrp)")>=0||h==="mrp"),
    paid:f(h=>h.indexOf("final paid")>=0||h==="paid"||h.indexOf("amount paid")>=0) };
}
function setStatus(msg,err){ let s=document.getElementById("ustatus"); if(s){s.textContent=msg; s.style.color=err?"#B5730F":"var(--dim)";} }
function loadWorkbook(buf,fname){
  if(typeof XLSX==="undefined"){ setStatus("Spreadsheet reader still loading - try again in a second",true); return; }
  try{
    let wb=XLSX.read(buf,{type:"array",cellDates:true});
    let out=[], lab=null, tabs=[];
    for(let si=0; si<wb.SheetNames.length; si++){
      let nm=wb.SheetNames[si];
      let aoa=XLSX.utils.sheet_to_json(wb.Sheets[nm],{header:1,raw:true});
      if(!aoa.length) continue;
      let hr=-1, idx=null;
      for(let h=0; h<Math.min(aoa.length,6); h++){ let mp=colMap(aoa[h]); if(mp.date>=0 && (mp.cat>=0||mp.item>=0||mp.itype>=0)){ hr=h; idx=mp; break; } }
      if(hr<0) continue;                       // not a ledger sheet (summaries skipped)
      let H=aoa[hr];
      if(!lab) lab={cat:(idx.cat>=0&&String(H[idx.cat]).trim())||"Category",
                    sub:(idx.sub>=0&&String(H[idx.sub]).trim())||"Subcategory",
                    it:(idx.itype>=0&&String(H[idx.itype]).trim())||"Item Type"};
      let cy=sheetYear(nm), cm=sheetMonth(nm), n0=out.length;
      for(let i=hr+1;i<aoa.length;i++){
        let r=aoa[i]; if(!r) continue;
        let cv=idx.cat>=0?r[idx.cat]:null, dv=idx.date>=0?r[idx.date]:null;
        if(cv==null||String(cv).trim()===""||dv==null) continue;   // skip blank/subtotal rows
        let dt=parseRowDate(dv, cy, cm);
        out.push({d:dt.d,m:dt.m,y:dt.y, cat:cv, sub:idx.sub>=0?r[idx.sub]:null, it:idx.itype>=0?r[idx.itype]:null,
          q:(typeof r[idx.qty]==="number"?r[idx.qty]:1),
          p:(typeof r[idx.paid]==="number"?r[idx.paid]:0),
          mrp:(idx.mrp>=0&&typeof r[idx.mrp]==="number"?r[idx.mrp]:null),
          pl:idx.plat>=0?r[idx.plat]:null,
          sz:(idx.variant>=0&&r[idx.variant]&&r[idx.variant]!=="?")?String(r[idx.variant]):null,
          br:(idx.brand>=0&&r[idx.brand]&&r[idx.brand]!=="?")?String(r[idx.brand]):null,
          nm:(idx.item>=0&&r[idx.item])?String(r[idx.item]):null});
      }
      if(out.length>n0) tabs.push(nm);
    }
    if(!out.length){ setStatus("No ledger rows found - check the sheet has a Date and a Category column",true); return; }
    LEDGER=out;
    LABELS=lab;
    applyEx();
    try{ UPLOAD_B64=abToB64(buf); UPLOAD_NAME=fname; }catch(e){}
    persistLedger(out, lab, fname);
    HIST=[];HI=-1; STATE.level=0;STATE.cat=STATE.sub=STATE.it=null; STATE.rangeKey="month"; STATE.off=0;
    syncFilterUI(); pushHist(); render();
    setStatus(out.length+" rows loaded from "+(tabs.length>1?tabs.length+" tabs":fname)+" - saved on this device");
  }catch(e){ setStatus("Couldn't read file: "+e.message,true); }
}
function bindUpload(){
  let dl=document.getElementById("dlxlsx"); if(dl)dl.onclick=downloadUpload;
  let inp=document.getElementById("xlsxfile"); if(!inp)return;
  inp.onchange=()=>{ let f=inp.files&&inp.files[0]; if(!f)return;
    setStatus("reading "+f.name+" ...");
    let rd=new FileReader(); rd.onload=e=>loadWorkbook(e.target.result,f.name); rd.readAsArrayBuffer(f); };
}

// ---- date filter UI ----
function bindFilter(){
  document.querySelectorAll("[data-range]").forEach(el=>el.onclick=()=>{
    STATE.rangeKey=el.getAttribute("data-range");
    STATE.off=0;
    syncFilterUI();
    nav();
  });
  let prev=document.getElementById("prevPeriod"), next=document.getElementById("nextPeriod");
  if(prev)prev.onclick=()=>{ STATE.off-=1; updatePeriodLabel(); nav(); };
  if(next)next.onclick=()=>{ if(STATE.off<0){ STATE.off+=1; updatePeriodLabel(); nav(); } };
  document.getElementById("applycustom").onclick=()=>{
    let f=document.getElementById("from").value, t=document.getElementById("to").value;
    if(f&&t){
      let [fy,fm,fd]=f.split("-").map(Number), [ty,tm,td]=t.split("-").map(Number);
      STATE.custom=[new Date(fy,fm-1,fd,0,0,0,0), new Date(ty,tm-1,td,23,59,59,999)];
      nav();
    }
  };
}

bindNav();
bindTabs();
bindUpload();
bindSearch();
document.addEventListener("click",e=>{ if(!e.target.closest(".pt")){ let t=document.getElementById("tip"); if(t)t.classList.remove("show"); }});
(function(){let dm=document.getElementById("daymodal"); if(dm)dm.addEventListener("click",e=>{ if(e.target===dm)dm.classList.remove("show"); });})();
(function(){let rt;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){try{render();}catch(e){}},160);});})();
// Android/PWA hardware back: navigate within the app instead of closing it (installed app only)
(function(){
  function dm(q){ return !!(window.matchMedia && window.matchMedia(q).matches); }
  var isPWA = dm("(display-mode: standalone)")||dm("(display-mode: minimal-ui)")||dm("(display-mode: fullscreen)")||window.navigator.standalone===true;
  if(!isPWA) return;
  var backArmed=false;
  function armBack(){ if(!backArmed){ try{history.pushState({khata:1},"");}catch(e){} backArmed=true; } }
  function closeTop(){
    var d=document.getElementById("daymodal"); if(d&&d.classList.contains("show")){d.classList.remove("show");return true;}
    var s=document.getElementById("searchresults"); if(s&&s.classList.contains("show")){s.classList.remove("show");return true;}
    var hg=document.getElementById("hhgate"),mb=document.getElementById("hhmanagebox");
    if(hg&&hg.style.display!=="none"&&mb&&mb.style.display!=="none"){hg.style.display="none";return true;}
    if(typeof HI!=="undefined"&&HI>0){goBack();return true;}
    return false;
  }
  window.addEventListener("popstate",function(){
    backArmed=false;
    closeTop();   // close an overlay or step back in-app if possible; root = no-op
    armBack();    // always re-arm so back never exits the installed app
  });
  armBack();
})();
(function(){var f=document.getElementById("from"),t=document.getElementById("to");if(f&&t){var iso=function(d){var mm=d.getMonth()+1,dd=d.getDate();return d.getFullYear()+"-"+(mm<10?"0"+mm:mm)+"-"+(dd<10?"0"+dd:dd);};f.value=iso(new Date(TODAY.getFullYear(),TODAY.getMonth(),1));t.value=iso(TODAY);f.max=iso(TODAY);t.max=iso(TODAY);}})();
bindFilter();
syncFilterUI();
pushHist();   // seed initial state so Back is disabled at the root
render();
if(SAVED_LEDGER && SAVED_LEDGER.length){
  let nm=lsGet("khata_ledger_name",null);
  setStatus(SAVED_LEDGER.length+" rows from your last upload"+(nm?(" ("+nm+")"):"")+" - tap to reset");
  let s=document.getElementById("ustatus");
  if(s){ s.style.cursor="pointer"; s.title="Reset to built-in sample data";
    s.onclick=()=>{ try{localStorage.removeItem("khata_ledger");localStorage.removeItem("khata_ledger_name");localStorage.removeItem("khata_labels");}catch(e){}
      LEDGER=LEDGER_SEED.slice(); LABELS={cat:"Category",sub:"Subcategory",it:"Item Type"}; HIST=[];HI=-1; STATE.level=0;STATE.cat=STATE.sub=STATE.it=null; STATE.rangeKey="month"; STATE.off=0;
      syncFilterUI(); pushHist(); render(); setStatus("reset to built-in June 2026 data · upload replaces it"); s.onclick=null; s.style.cursor="default"; };
  }
}



// ---- Household: shared via Supabase (Google sign-in, join by code) ----
(function () {
  "use strict";
  var cfg = window.SUPABASE_CONFIG || {};

  var LS_KEY = "khata_household_id";
  var hhCurrentName = "Household";
  var householdId = localStorage.getItem(LS_KEY) || null;
  var householdCode = null, isOwner = false;
  var user = null, sb = null;

  var gate = document.getElementById("authgate"),
      gErr = document.getElementById("autherr"),
      btnIn = document.getElementById("gsignin"),
      btnOut = document.getElementById("signoutbtn"),
      hh = document.getElementById("hhgate"),
      hhErr = document.getElementById("hherr"),
      hhNameEl = document.getElementById("hhname"),
      hhInfo = document.getElementById("hhinfo"),
      hhCodeBox = document.getElementById("hhcodebox"),
      hhJoinEl = document.getElementById("hhjoincode"),
      hhSetup = document.getElementById("hhsetup"),
      hhManage = document.getElementById("hhmanagebox"),
      hhCur = document.getElementById("hhcur"),
      hhLink = document.getElementById("hhmanage");

  function show(el, s) { if (el) el.style.display = s ? "flex" : "none"; }
  function setErr(el, m) { if (el) el.textContent = m || ""; }
  function setHName(n) { hhCurrentName = n || "Household"; var rl = document.getElementById("rangelabel"); if (rl) rl.textContent = hhCurrentName; }

  show(gate, true);

  if (!cfg.url || !cfg.anonKey) {
    setErr(gErr, "This app is not configured. A valid supabase-config.js is required.");
    if (btnIn) btnIn.style.display = "none";
    return;
  }

  function packet() { return { entries: LEDGER, labels: LABELS, excluded: Object.keys(EX), file: UPLOAD_B64 || null, fileName: UPLOAD_NAME || null, updatedAt: new Date().toISOString() }; }
  function loadData(d) {
    if (d && Array.isArray(d.entries)) LEDGER = d.entries;
    if (d && d.labels) LABELS = d.labels;
    EX = {}; if (d && Array.isArray(d.excluded)) d.excluded.forEach(function (s) { EX[s] = 1; });
    applyEx();
    UPLOAD_B64 = (d && d.file) || null; UPLOAD_NAME = (d && d.fileName) || null;
    render();
  }

  // every save writes the household row, so all members see it
  persistLedger = function (rows, labels) {
    LEDGER = rows; LABELS = labels;
    if (!user || !householdId || !sb) return;
    sb.from("households").update({ data: packet(), updated_at: new Date().toISOString() }).eq("id", householdId)
      .then(function (res) {
        if (res.error) { console.warn("[khata] save failed:", res.error.message); setStatus("Changes could not be saved right now.", true); }
        else setStatus(rows.length + " rows saved to " + hhCurrentName);
      });
  };

  function loadHousehold() {
    show(hh, false); setStatus("loading the household ledger...");
    sb.from("households").select("name,code,data,created_by").eq("id", householdId).single()
      .then(function (res) {
        if (res.error || !res.data) {
          localStorage.removeItem(LS_KEY); householdId = null; show(hh, true);
          setErr(hhErr, "Could not open that household - it may have been removed.");
          return;
        }
        var d = res.data;
        householdCode = d.code; isOwner = (d.created_by === (user && user.id));
        setHName(d.name); loadData(d.data || {});
        if (hhLink) hhLink.style.display = "inline-flex";
        setStatus("synced with " + hhCurrentName);
      });
  }
  function createHousehold() {
    setErr(hhErr, "");
    var nm = (hhNameEl && hhNameEl.value.trim()) || "Household";
    sb.rpc("create_household", { p_name: nm }).then(function (res) {
      if (res.error || !res.data || !res.data.length) {
        console.warn("[khata] create failed:", res.error && res.error.message);
        setErr(hhErr, "The household could not be created. Please try again.");
        return;
      }
      var row = res.data[0];
      householdId = row.id; householdCode = row.code; isOwner = true;
      localStorage.setItem(LS_KEY, householdId); setHName(nm);
      sb.from("households").update({ data: packet() }).eq("id", householdId).then(function () {});
      if (hhCodeBox) hhCodeBox.textContent = householdCode;
      if (hhInfo) hhInfo.style.display = "block";
    });
  }
  function joinHousehold() {
    var code = (hhJoinEl && hhJoinEl.value.trim()) || "";
    if (!code) { setErr(hhErr, "Enter a household code"); return; }
    setErr(hhErr, "joining...");
    sb.rpc("join_household", { p_code: code }).then(function (res) {
      if (res.error || !res.data) { setErr(hhErr, "No household found for that code. Check it and try again."); return; }
      householdId = res.data; localStorage.setItem(LS_KEY, householdId);
      setErr(hhErr, ""); loadHousehold();
    });
  }

  function showManage(on) { if (hhManage) hhManage.style.display = on ? "flex" : "none"; if (hhSetup) hhSetup.style.display = on ? "none" : "flex"; if (hhInfo && !on) hhInfo.style.display = "none"; }
  function openManage() {
    if (hhCur) hhCur.textContent = hhCurrentName;
    var cb = document.getElementById("hhmanagecode"); if (cb) cb.textContent = householdCode || "";
    var del = document.getElementById("hhdelete"), lv = document.getElementById("hhleave");
    if (del) del.style.display = isOwner ? "block" : "none";
    if (lv) lv.style.display = isOwner ? "none" : "block";
    setErr(hhErr, ""); showManage(true); show(hh, true);
  }
  function forgetLocal() { localStorage.removeItem(LS_KEY); householdId = null; householdCode = null; if (hhLink) hhLink.style.display = "none"; }
  function leaveHousehold() {
    if (householdId && user) sb.from("household_members").delete().eq("household_id", householdId).eq("user_id", user.id).then(function () {});
    forgetLocal(); setErr(hhErr, ""); showManage(false);
  }
  function deleteHousehold() {
    if (!householdId) { leaveHousehold(); return; }
    setErr(hhErr, "deleting...");
    sb.from("households").delete().eq("id", householdId).then(function (res) {
      if (res.error) { setErr(hhErr, "Only the creator can delete this household."); return; }
      forgetLocal(); LEDGER = []; render(); setErr(hhErr, ""); showManage(false);
    });
  }
  function clearAllLocal() {
    try { [LS_KEY, "khata_ledger", "khata_ledger_name", "khata_labels", "khata_recents"].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  }
  function finishAccountWipe() {
    clearAllLocal(); householdId = null; householdCode = null; LEDGER = []; render();
    if (sb) sb.auth.signOut().then(function () {});
    user = null;
    if (btnOut) btnOut.style.display = "none";
    if (hhLink) hhLink.style.display = "none";
    show(hh, false); show(gate, true);
    setErr(gErr, "Account deleted. Sign in to start fresh.");
  }
  function deleteAccount() {
    // owner: delete the household for everyone; member: just leave. Then sign out and wipe local.
    if (householdId && user) {
      if (isOwner) sb.from("households").delete().eq("id", householdId).then(finishAccountWipe, finishAccountWipe);
      else sb.from("household_members").delete().eq("household_id", householdId).eq("user_id", user.id).then(finishAccountWipe, finishAccountWipe);
    } else finishAccountWipe();
  }
  var b1 = document.getElementById("hhcreate"); if (b1) b1.onclick = createHousehold;
  var b2 = document.getElementById("hhjoin"); if (b2) b2.onclick = joinHousehold;
  var b3 = document.getElementById("hhdone"); if (b3) b3.onclick = function () { show(hh, false); loadHousehold(); };
  var b4 = document.getElementById("hhback"); if (b4) b4.onclick = function () { if (sb) sb.auth.signOut().then(function () {}); user = null; if (hhLink) hhLink.style.display = "none"; show(hh, false); show(gate, true); };
  var b5 = document.getElementById("hhleave"); if (b5) b5.onclick = leaveHousehold;
  var b6 = document.getElementById("hhdelete"); if (b6) b6.onclick = deleteHousehold;
  var b7 = document.getElementById("hhcancel"); if (b7) b7.onclick = function () { show(hh, false); };
  var bcopy = document.getElementById("hhcopylink");
  if (bcopy) bcopy.onclick = function () {
    if (!householdCode) return;
    var done = function () { bcopy.textContent = "Copied"; setTimeout(function () { bcopy.textContent = "Copy code"; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(householdCode).then(done, function () {});
    else done();
  };
  if (hhLink) hhLink.onclick = openManage;
  var bda = document.getElementById("hhdeleteacct"), bdaArmed = false, bdaTimer = null;
  if (bda) bda.onclick = function () {
    if (!bdaArmed) { bdaArmed = true; bda.textContent = "Tap again to delete your account and data"; bdaTimer = setTimeout(function () { bdaArmed = false; bda.textContent = "Delete account"; }, 4000); return; }
    clearTimeout(bdaTimer); bdaArmed = false; bda.textContent = "Deleting..."; deleteAccount();
  };

  function signedIn(u) {
    user = u; show(gate, false);
    if (btnOut) btnOut.style.display = "inline";
    if (householdId) { loadHousehold(); return; }
    setStatus("checking your household...");
    sb.from("household_members").select("household_id").eq("user_id", u.id).limit(1).then(function (res) {
      if (res.data && res.data.length) {
        householdId = res.data[0].household_id; localStorage.setItem(LS_KEY, householdId); loadHousehold();
      } else { showManage(false); show(hh, true); }
    }, function () { showManage(false); show(hh, true); });
  }
  if (btnIn) btnIn.onclick = function () {
    setErr(gErr, ""); if (!sb) return;
    sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
  };
  if (btnOut) btnOut.onclick = function () {
    if (sb) sb.auth.signOut().then(function () {});
    user = null; if (btnOut) btnOut.style.display = "none"; if (hhLink) hhLink.style.display = "none"; show(hh, false); show(gate, true);
  };
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !user || !householdId || !sb) return;
    sb.from("households").select("name,data").eq("id", householdId).single().then(function (res) {
      if (res.error) {
        forgetLocal(); LEDGER = []; render(); showManage(false); show(hh, true); setErr(hhErr, "This household is no longer available.");
      } else if (res.data) { setHName(res.data.name); loadData(res.data.data || {}); }
    });
  });

  function whenSb(cb, tries) {
    tries = tries || 0;
    if (window.supabase && window.supabase.createClient) {
      if (!sb) sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
      return cb();
    }
    if (tries > 60) { setErr(gErr, "Could not load Supabase."); show(gate, true); return; }
    setTimeout(function () { whenSb(cb, tries + 1); }, 150);
  }
  whenSb(function () {
    sb.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) { if (!user) signedIn(session.user); }
      else if (user) { user = null; if (btnOut) btnOut.style.display = "none"; if (hhLink) hhLink.style.display = "none"; show(hh, false); show(gate, true); }
    });
    sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (session && session.user) signedIn(session.user); else show(gate, true);
    });
  });
})();
}

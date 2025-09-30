/************ KONFIG ************/
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxR-LcgCukny9hSmX9611U-tv1gb1vnaHYP7Sb7LWeY_6HgqnIxYD6UuDua6vnSv2s/exec';
const FORM_IMAGE = 'of019.png'; // pastikan imej ini ada di root repo

/************ STATE/DOM ************/
const $ = s => document.querySelector(s);
const $pins = $('#pins');
const $canvas = $('#c');
const ctx = $canvas.getContext('2d');

let cacheRows = [];              // rekod daripada CSV
let showPins = false;
let MAP = loadMap();             // MAP default + yang tersimpan
let bgImg = null;

/************ CSV PARSER (tanpa library) ************/
function parseCSV(text){
  const lines = text.replace(/\r/g,'').split('\n').filter(x => x.length);
  if (!lines.length) return [];
  const headers = splitCSVLine(lines[0]);
  const out = [];
  for (let i=1; i<lines.length; i++){
    const cols = splitCSVLine(lines[i]);
    const obj = Object.fromEntries(headers.map((h,idx)=>[h, (cols[idx] ?? '').trim()]));
    if (!obj.status) obj.status = 'PENDING';
    out.push(obj);
  }
  return out;
}
function splitCSVLine(s){
  const out = []; let cur = ''; let q = false;
  for (let i=0; i<s.length; i++){
    const ch = s[i];
    if (ch === '"'){
      if (q && s[i+1] === '"'){ cur += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q){
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/************ GRAFIK ************/
async function ensureImage(){
  if (bgImg) return bgImg;
  bgImg = await new Promise((ok, err)=>{
    const im = new Image(); im.onload=()=>ok(im); im.onerror=()=>err(new Error('Gagal muat of019.png'));
    im.src = FORM_IMAGE + '?t=' + Date.now();
  });
  $canvas.width = bgImg.width; $canvas.height = bgImg.height;
  return bgImg;
}

async function renderRecord(rec){
  const img = await ensureImage();
  // Latar
  ctx.clearRect(0,0,$canvas.width,$canvas.height);
  ctx.drawImage(img, 0, 0, img.width, img.height);

  // Grid halus hanya bila pins ON (bantu kalibrasi)
  if (showPins) drawGrid(ctx, $canvas.width, $canvas.height);

  // Teks
  ctx.fillStyle = '#000';
  ctx.font = '22px Helvetica';
  const put = (key, text) => {
    const m = getPoint(key);
    if (m) ctx.fillText(text || '', m.x, m.y);
  };

  put('name', rec.name);
  put('address', rec.address);
  put('postcode', rec.postcode);
  put('mrn', rec.mrn);
  put('nric_passport', rec.nric_passport);
  put('dob', rec.dob);
  put('age', rec.age);
  put('contact', rec.contact);
  put('sex', rec.sex);
  put('email', rec.email);
  put('doctor_name', rec.doctor_name);
  put('doctor_clinic', rec.doctor_clinic);
  put('history_notes', rec.history_notes);
  put('drug_last_dose_date', rec.drug_last_dose_date);
  put('drug_last_dose_time', rec.drug_last_dose_time);
  put('specimen_collection_date', rec.specimen_collection_date);
  put('specimen_collection_time', rec.specimen_collection_time);
  put('collected_by', rec.collected_by);
  put('gestation_week', rec.gestation_week);

  // Checkbox ✓
  ctx.font = '24px Helvetica';
  const fasting = (rec.fasting||'').toUpperCase();
  if (fasting==='YES') { const p=getPoint('fasting_yes'); if (p) ctx.fillText('✓', p.x, p.y); }
  if (fasting==='NO')  { const p=getPoint('fasting_no');  if (p) ctx.fillText('✓', p.x, p.y); }

  const st = (rec.specimen_type||'').toUpperCase();
  const pst = getPoint(`specimen_type.${st}`);
  if (pst) ctx.fillText('✓', pst.x, pst.y);

  (rec.tests_profile||'').split(';').map(s=>s.trim()).filter(Boolean).forEach(label=>{
    const p = getPoint(`profile.${label}`);
    if (p) ctx.fillText('✓', p.x, p.y);
  });
  (rec.tests_individual||'').split(';').map(s=>s.trim()).filter(Boolean).forEach(label=>{
    const p = getPoint(`individual.${label}`);
    if (p) ctx.fillText('✓', p.x, p.y);
  });

  const others = (rec.other_tests||'').split('|').map(s=>s.trim()).filter(Boolean);
  if (others.length && Array.isArray(MAP.other_tests_rows)){
    ctx.font = '18px Helvetica';
    for (let i=0;i<Math.min(others.length, MAP.other_tests_rows.length); i++){
      const pos = MAP.other_tests_rows[i];
      if (pos?.x && pos?.y) ctx.fillText(others[i], pos.x, pos.y);
    }
  }

  // Papar/hide pin
  if (showPins) renderPinsLayer(); else $pins.innerHTML='';
}

function drawGrid(ctx, w, h){
  ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
  for (let x=0; x<=w; x+=100){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for (let y=0; y<=h; y+=100){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();
}

/************ PINS (drag & drop) ************/
function listAllKeysForPins(){
  const baseKeys = [
    'name','address','postcode','mrn','nric_passport','dob','age','contact','sex','email',
    'doctor_name','doctor_clinic','history_notes','drug_last_dose_date','drug_last_dose_time',
    'specimen_collection_date','specimen_collection_time','collected_by','gestation_week',
    'fasting_yes','fasting_no'
  ];
  const subPairs = [
    ['specimen_type',['BLOOD','URINE','STOOL']]
  ];
  const out = [...baseKeys];
  subPairs.forEach(([grp, arr])=>arr.forEach(v=>out.push(`${grp}.${v}`)));
  return out;
}

function renderPinsLayer(){
  $pins.innerHTML = '';
  const keys = listAllKeysForPins();
  keys.forEach(key=>{
    const p = getPoint(key);
    if (!p) return; // skip yang belum ada
    const el = document.createElement('div');
    el.className = 'pin';
    el.dataset.key = key;
    el.style.left = p.x + 'px';
    el.style.top =  p.y + 'px';
    el.innerHTML = `<span class="dot"></span>${key}`;
    makeDraggable(el);
    $pins.appendChild(el);
  });
  $pins.style.pointerEvents = 'auto';
}

function makeDraggable(el){
  let drag = false, ox=0, oy=0;
  const onDown = (ev)=>{
    drag = true;
    const pt = getEventXY(ev);
    ox = pt.x - parseFloat(el.style.left);
    oy = pt.y - parseFloat(el.style.top);
    el.setPointerCapture?.(ev.pointerId || 1);
  };
  const onMove = (ev)=>{
    if (!drag) return;
    const pt = getEventXY(ev);
    const nx = clamp(pt.x - ox, 0, $canvas.width);
    const ny = clamp(pt.y - oy, 0, $canvas.height);
    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';
  };
  const onUp = ()=>{
    if (!drag) return;
    drag = false;
    const nx = parseFloat(el.style.left);
    const ny = parseFloat(el.style.top);
    setPoint(el.dataset.key, {x:nx,y:ny});
    saveMap();
    if (cacheRows.length) renderRecord(cacheRows[0]);
  };
  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function getEventXY(ev){
  const r = $canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}
const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));

/************ MAP + SIMPANAN ************/
function defaultMap(){
  // Anggaran awal (A4 tinggi ~1654×2339). Seret pin untuk tepatkan.
  return {
    name:{x:220,y:820},
    address:{x:220,y:900},
    postcode:{x:640,y:900},
    mrn:{x:980,y:820},
    height_weight:{x:980,y:860},
    nric_passport:{x:980,y:900},
    dob:{x:980,y:940},
    age:{x:1430,y:940},
    contact:{x:980,y:980},
    sex:{x:1430,y:980},
    email:{x:980,y:1020},
    doctor_name:{x:220,y:1080},
    doctor_clinic:{x:220,y:1120},

    specimen_collection_date:{x:1180,y:1180},
    specimen_collection_time:{x:1450,y:1180},
    collected_by:{x:220,y:1180},
    gestation_week:{x:1450,y:1020},

    fasting_yes:{x:1230,y:1240},
    fasting_no:{x:1320,y:1240},

    specimen_type:{
      BLOOD:{x:185,y:700}, URINE:{x:270,y:700}, STOOL:{x:360,y:700}
    },

    profile:{},
    individual:{},
    other_tests_rows:[{x:220,y:1500},{x:220,y:1530},{x:220,y:1560}]
  };
}
function loadMap(){
  const d = defaultMap();
  try {
    const saved = JSON.parse(localStorage.getItem('OF019_MAP')||'{}');
    return mergeDeep(d, saved);
  } catch { return d; }
}
function saveMap(){
  localStorage.setItem('OF019_MAP', JSON.stringify(MAP));
}
function mergeDeep(a,b){
  const out = Array.isArray(a)?[...a]:{...a};
  for (const k of Object.keys(b||{})){
    if (a?.[k] && typeof a[k]==='object' && !Array.isArray(a[k])) out[k] = mergeDeep(a[k], b[k]);
    else out[k] = b[k];
  }
  return out;
}
function getPoint(path){
  const seg = path.split('.');
  let cur = MAP;
  for (const s of seg){
    cur = cur?.[s];
    if (!cur) return null;
  }
  if (cur && typeof cur==='object' && 'x' in cur && 'y' in cur) return cur;
  return null;
}
function setPoint(path, pt){
  const seg = path.split('.');
  let cur = MAP;
  for (let i=0;i<seg.length-1;i++){
    const s = seg[i]; cur[s] = cur[s] || {};
    cur = cur[s];
  }
  cur[seg[seg.length-1]] = pt;
}

/************ UI EVENTS ************/
$('#csv').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  cacheRows = parseCSV(text);
  $('#list').textContent = JSON.stringify(cacheRows.slice(0,10), null, 2);
  if (cacheRows.length) await renderRecord(cacheRows[0]);
});

$('#btnPreview').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  await renderRecord(cacheRows[0]);
});

$('#btnTogglePins').addEventListener('click', async ()=>{
  showPins = !showPins;
  $('#btnTogglePins').textContent = showPins ? 'Hide Pins' : 'Show Pins (drag to place)';
  if (cacheRows.length) await renderRecord(cacheRows[0]); // redraw with/without pins
});

$('#btnExportMap').addEventListener('click', ()=>{
  const text = 'const MAP = ' + JSON.stringify(MAP, null, 2) + ';';
  navigator.clipboard.writeText(text).then(()=>alert('MAP disalin ke clipboard. Tampal ke app.js jika mahu jadikan tetap.'));
});

$('#btnResetMap').addEventListener('click', ()=>{
  if (!confirm('Padam semua koordinat tersimpan?')) return;
  localStorage.removeItem('OF019_MAP');
  MAP = loadMap();
  alert('MAP direset kepada anggaran asal.');
  if (cacheRows.length) renderRecord(cacheRows[0]);
});

/************ Upload/Print (no-cors + FormData) ************/
$('#btnUpload').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  try {
    const fd = new FormData();
    fd.append('method','INSERT');
    fd.append('items', JSON.stringify(cacheRows));
    await fetch(WEB_APP_URL, { method:'POST', mode:'no-cors', body: fd });
    alert('Permintaan upload dihantar. Semak Google Sheet — rekod baharu sepatutnya masuk di bawah header.');
  } catch(e){ alert('Gagal hantar: ' + e.message); }
});

$('#btnPrintAll').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  const printedKeys = [];
  for (const rec of cacheRows){
    await renderRecord(rec);
    window.print();
    const key = (String(rec.name||'').trim() + '|' + String(rec.nric_passport||'').trim()).toLowerCase();
    printedKeys.push(key);
  }
  try {
    const fd = new FormData();
    fd.append('method','MARK_PRINTED');
    fd.append('keys', JSON.stringify(printedKeys));
    await fetch(WEB_APP_URL, { method:'POST', mode:'no-cors', body: fd });
    alert('Cetak selesai. Permintaan tanda PRINTED dihantar (semak Sheet).');
  } catch(e) {
    alert('Cetak selesai, tetapi gagal hantar tanda PRINTED: ' + e.message);
  }
});

/************ Init ************/
(async ()=>{ await ensureImage(); })();

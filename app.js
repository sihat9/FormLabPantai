/************ KONFIG ************/
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxR-LcgCukny9hSmX9611U-tv1gb1vnaHYP7Sb7LWeY_6HgqnIxYD6UuDua6vnSv2s/exec';
const FORM_IMAGE = 'of019.png'; // pastikan imej ini wujud sebaris index.html

/************ STATE/DOM ************/
const $ = s => document.querySelector(s);
let cacheRows = [];             // rekod daripada CSV
let MAP = loadMap();            // MAP gabungan: default + localStorage

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

/************ RENDER + OVERLAY (PNG latar) ************/
async function renderRecord(rec){
  const img = await loadImage(FORM_IMAGE);
  const c = $('#c'); const ctx = c.getContext('2d');
  c.width = img.width; c.height = img.height;
  ctx.drawImage(img, 0, 0, img.width, img.height);

  // Grid halus (bantu kalibrasi)
  if ($('#calibrate').checked) drawGrid(ctx, c.width, c.height);

  // Teks umum
  ctx.fillStyle = '#000';
  ctx.font = '22px Helvetica';
  const write = (key, text) => {
    const m = MAP[key];
    if (m && Number.isFinite(m.x) && Number.isFinite(m.y)) ctx.fillText(text || '', m.x, m.y);
  };

  write('name', rec.name);
  write('address', rec.address);
  write('postcode', rec.postcode);
  write('mrn', rec.mrn);
  write('nric_passport', rec.nric_passport);
  write('dob', rec.dob);
  write('age', rec.age);
  write('contact', rec.contact);
  write('sex', rec.sex);
  write('email', rec.email);
  write('doctor_name', rec.doctor_name);
  write('doctor_clinic', rec.doctor_clinic);
  write('history_notes', rec.history_notes);
  write('drug_last_dose_date', rec.drug_last_dose_date);
  write('drug_last_dose_time', rec.drug_last_dose_time);
  write('specimen_collection_date', rec.specimen_collection_date);
  write('specimen_collection_time', rec.specimen_collection_time);
  write('collected_by', rec.collected_by);
  write('gestation_week', rec.gestation_week);

  // Checkbox “✓”
  ctx.font = '24px Helvetica';
  if ((rec.fasting||'').toUpperCase()==='YES' && MAP.fasting_yes) ctx.fillText('✓', MAP.fasting_yes.x, MAP.fasting_yes.y);
  if ((rec.fasting||'').toUpperCase()==='NO'  && MAP.fasting_no)  ctx.fillText('✓', MAP.fasting_no.x, MAP.fasting_no.y);

  const st = (rec.specimen_type||'').toUpperCase();
  if (MAP.specimen_type && MAP.specimen_type[st]) ctx.fillText('✓', MAP.specimen_type[st].x, MAP.specimen_type[st].y);

  (rec.tests_profile||'').split(';').map(s=>s.trim()).filter(Boolean).forEach(label=>{
    const p = MAP.profile[label]; if (p) ctx.fillText('✓', p.x, p.y);
  });
  (rec.tests_individual||'').split(';').map(s=>s.trim()).filter(Boolean).forEach(label=>{
    const p = MAP.individual[label]; if (p) ctx.fillText('✓', p.x, p.y);
  });

  const others = (rec.other_tests||'').split('|').map(s=>s.trim()).filter(Boolean);
  if (others.length && MAP.other_tests_rows?.length){
    ctx.font = '18px Helvetica';
    for (let i=0;i<Math.min(others.length, MAP.other_tests_rows.length); i++){
      const pos = MAP.other_tests_rows[i];
      ctx.fillText(others[i], pos.x, pos.y);
    }
  }

  // Tunjuk semua titik MAP semasa (untuk semak)
  if ($('#calibrate').checked) drawMapDots(ctx);
}

function loadImage(url){
  return new Promise((ok, err)=>{
    const im = new Image(); im.onload = ()=>ok(im); im.onerror = ()=>err(new Error('Gagal memuat imej: '+url));
    im.src = url + '?t=' + Date.now();
  });
}
function drawGrid(ctx, w, h){
  ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
  for (let x=0; x<=w; x+=100){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for (let y=0; y<=h; y+=100){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();
}
function drawMapDots(ctx){
  ctx.save(); ctx.fillStyle='#d00'; ctx.font='14px Helvetica';
  Object.entries(MAP).forEach(([k,v])=>{
    if (!v) return;
    if (Array.isArray(v)) return;             // rows, abaikan
    if (typeof v==='object' && 'x' in v && 'y' in v){
      ctx.beginPath(); ctx.arc(v.x,v.y,3,0,6.283); ctx.fill();
      ctx.fillText(k, v.x+6, v.y-6);
    }
    if (typeof v==='object' && !('x' in v) && !Array.isArray(v)){
      Object.entries(v).forEach(([kk,pp])=>{
        if (pp?.x!=null && pp?.y!=null){ ctx.beginPath(); ctx.arc(pp.x,pp.y,3,0,6.283); ctx.fill(); ctx.fillText(`${k}.${kk}`, pp.x+6, pp.y-6); }
      });
    }
  });
  ctx.restore();
}

/************ MAP DEFAULT + SIMPANAN ************/
function defaultMap(){
  // Anggaran untuk PNG A4 tinggi (±1654×2339). Sesuaikan sedikit dengan Calibrate.
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

    profile:{
      // contoh — tambah ikut borang anda
      'Anaemia':{x:210,y:1320}, 'Diabetes':{x:210,y:1360}, 'Thyroid':{x:210,y:1400}
    },
    individual:{
      'FBC':{x:640,y:1320}, 'HbA1C':{x:640,y:1360}, 'HBsAg':{x:640,y:1400}
    },
    other_tests_rows:[
      {x:220,y:1500},{x:220,y:1530},{x:220,y:1560}
    ]
  };
}
function loadMap(){
  const d = defaultMap();
  try{
    const saved = JSON.parse(localStorage.getItem('OF019_MAP')||'{}');
    return mergeDeep(d, saved);
  }catch{ return d; }
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

/************ CALIBRATE: klik → assign ke medan terpilih ************/
(function(){
  const c = $('#c'), ctx = c.getContext('2d');
  c.addEventListener('click',(ev)=>{
    if (!$('#calibrate').checked) return;
    const field = $('#field').value;
    if (!field) return alert('Pilih medan di dropdown "— pilih medan —" dahulu');

    const r = c.getBoundingClientRect();
    const x = Math.round(ev.clientX - r.left);
    const y = Math.round(ev.clientY - r.top);

    // Tulis titik & label kecil
    ctx.beginPath(); ctx.arc(x,y,3,0,6.283); ctx.fill();
    ctx.font='14px Helvetica'; ctx.fillText(`(${x},${y})`, x+6, y-6);

    // Simpan ke MAP (top-level shj; untuk subgroup seperti specimen_type.* — set manual)
    if (field.includes('.')){ // contoh: specimen_type.BLOOD
      const [grp,key] = field.split('.');
      MAP[grp] = MAP[grp] || {};
      MAP[grp][key] = {x,y};
    } else {
      MAP[field] = {x,y};
    }
    saveMap();
    console.log('MAP dikemas kini:', field, {x,y});
  });

  $('#btnExportMap').addEventListener('click', ()=>{
    const text = 'const MAP = ' + JSON.stringify(MAP, null, 2) + ';';
    navigator.clipboard.writeText(text).then(()=>alert('MAP disalin ke clipboard. Tampal ke app.js jika mahu jadikan tetap.'));
  });
})();

/************ EVENTS ************/
$('#csv').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  cacheRows = parseCSV(text);
  $('#list').textContent = JSON.stringify(cacheRows.slice(0,10), null, 2);
  // auto-preview
  if (cacheRows.length) await renderRecord(cacheRows[0]);
});

$('#btnPreview').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  await renderRecord(cacheRows[0]);
});

// Upload → Sheet (FormData + no-cors: tiada preflight/CORS)
$('#btnUpload').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  try {
    const fd = new FormData();
    fd.append('method', 'INSERT');
    fd.append('items', JSON.stringify(cacheRows)); // array rekod

    await fetch(WEB_APP_URL, { method:'POST', mode:'no-cors', body: fd });
    alert('Permintaan upload dihantar. Semak Google Sheet — rekod baharu sepatutnya masuk di bawah header.');
  } catch(e){ alert('Gagal hantar: ' + e.message); }
});

// Print All dari CSV + tanda PRINTED (optional)
$('#btnPrintAll').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  const printedKeys = [];
  for (const rec of cacheRows){
    await renderRecord(rec);
    window.print();
    const key = (String(rec.name||'').trim() + '|' + String(rec.nric_passport||'').trim()).toLowerCase();
    printedKeys.push(key);
  }
  try{
    const fd = new FormData();
    fd.append('method','MARK_PRINTED');
    fd.append('keys', JSON.stringify(printedKeys));
    await fetch(WEB_APP_URL, { method:'POST', mode:'no-cors', body: fd });
    alert('Cetak selesai. Permintaan tanda PRINTED dihantar (semak Sheet).');
  }catch(e){ alert('Cetak selesai, tetapi gagal hantar tanda PRINTED: ' + e.message); }
});

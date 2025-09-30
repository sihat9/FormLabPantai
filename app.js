/************ KONFIG ************/
// Web App URL anda:
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxR-LcgCukny9hSmX9611U-tv1gb1vnaHYP7Sb7LWeY_6HgqnIxYD6UuDua6vnSv2s/exec';
// Imej borang (PNG) di root repo:
const FORM_IMAGE = 'of019.png';

/************ STATE/DOM ************/
const $ = s => document.querySelector(s);
let cacheRows = []; // rekod daripada CSV (array of objects)

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
  const canvas = $('#c');
  const ctx = canvas.getContext('2d');
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0, img.width, img.height);

  // Teks umum
  ctx.fillStyle = '#000';
  ctx.font = '20px Helvetica';
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
  ctx.font = '22px Helvetica';
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
}

function loadImage(url){
  return new Promise((ok, err)=>{
    const im = new Image();
    im.onload = ()=>ok(im);
    im.onerror = ()=>err(new Error('Gagal memuat imej: ' + url));
    im.src = url + '?t=' + Date.now(); // elak cache
  });
}

/************ MAP KOORDINAT (isi selepas calibrate) ************/
const MAP = {
  // Contoh awal—anda ubah ikut koordinat borang anda (guna Calibrate)
  // name:{x:240,y:610}, mrn:{x:1210,y:610}, nric_passport:{x:1210,y:710},
  specimen_type: { /* BLOOD:{x:...,y:...}, URINE:{...}, ... */ },
  fasting_yes: null, // {x:...,y:...}
  fasting_no:  null,
  profile:    { /* 'Anaemia':{x:...,y:...}, ... */ },
  individual: { /* 'FBC':{x:...,y:...}, ... */ },
  other_tests_rows: [ /* {x:...,y:...}, ... */ ]
};

/************ CALIBRATE: klik dapat (x,y) ************/
(function(){
  const c = $('#c'), ctx = c.getContext('2d');
  c.addEventListener('click',(ev)=>{
    if (!$('#calibrate').checked) return;
    const r = c.getBoundingClientRect();
    const x = Math.round(ev.clientX - r.left);
    const y = Math.round(ev.clientY - r.top);
    ctx.beginPath(); ctx.arc(x,y,3,0,6.283); ctx.fill();
    ctx.font='14px Helvetica'; ctx.fillText(`(${x},${y})`, x+6, y-6);
    alert(`Koordinat: ${x}, ${y}\nSalin ke MAP dalam app.js`);
  });
})();

/************ EVENTS ************/
$('#csv').addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  if (!f) return;
  const text = await f.text();
  cacheRows = parseCSV(text);
  $('#list').textContent = JSON.stringify(cacheRows.slice(0,10), null, 2);
});

$('#btnPreview').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  await renderRecord(cacheRows[0]);
});

$('#btnUpload').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  try {
    await fetch(WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',                                 // elak preflight CORS
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cacheRows)
    });
    alert('Permintaan upload dihantar. Semak Google Sheet — rekod baharu sepatutnya masuk di atas header.');
  } catch(e){
    alert('Gagal menghantar: ' + e.message);
  }
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
  // tanda PRINTED di Sheet (jika rekod dah di-upload)
  try{
    await fetch(WEB_APP_URL + '?method=MARK_PRINTED', {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({keys: printedKeys})
    });
    alert('Cetak selesai. Saya telah hantar permintaan untuk tanda PRINTED (semak Sheet).');
  }catch(e){
    alert('Cetak selesai, tetapi gagal hantar tanda PRINTED: ' + e.message);
  }
});

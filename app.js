/************ KONFIG ************/
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxR-LcgCukny9hSmX9611U-tv1gb1vnaHYP7Sb7LWeY_6HgqnIxYD6UuDua6vnSv2s/exec';
const FORM_IMAGE = 'of019.png'; // letak imej borang di root repo

/************ STATE/DOM ************/
const $ = s => document.querySelector(s);
let cacheRows = []; // rekod dari CSV (array of objects)

/************ CSV PARSER SIMPLE ************/
function parseCSV(text){
  // parser ringkas: sokong petikan "..." & koma; baris pertama = header
  const lines = text.replace(/\r/g,'').split('\n').filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(s=>s.trim());
  const out = [];
  for (let i=1;i<lines.length;i++){
    let row = []; let cur = ''; let inQ=false;
    const s = lines[i];
    for (let j=0;j<s.length;j++){
      const ch = s[j];
      if (ch === '"'){
        if (inQ && s[j+1] === '"'){ cur += '"'; j++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ){
        row.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    const obj = Object.fromEntries(headers.map((h,k)=>[h, (row[k]??'').trim()]));
    if (!obj.status) obj.status = 'PENDING';
    out.push(obj);
  }
  return out;
}

/************ RENDER + OVERLAY (PNG latar) ************/
async function renderRecord(rec){
  const img = await new Promise((ok,err)=>{
    const im = new Image();
    im.onload = ()=>ok(im);
    im.onerror = err;
    im.src = FORM_IMAGE + '?t=' + Date.now(); // bypass cache
  });
  const canvas = $('#c');
  const ctx = canvas.getContext('2d');
  // skala ikut imej sebenar
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0, img.width, img.height);

  ctx.fillStyle = '#000';
  ctx.font = '18px Helvetica'; // laras ikut saiz imej
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

  // checkbox kecil “✓”
  ctx.font = '20px Helvetica';
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
    ctx.font = '16px Helvetica';
    for (let i=0;i<Math.min(others.length, MAP.other_tests_rows.length); i++){
      const pos = MAP.other_tests_rows[i];
      ctx.fillText(others[i], pos.x, pos.y);
    }
  }
}

/************ MAP KOORDINAT (isi sedikit demi sedikit) ************/
const MAP = {
  // Contoh awal — anda akan isi sendiri guna Calibrate
  // name:{x:200,y:220}, mrn:{x:1300,y:220}, nric_passport:{x:1300,y:270},
  specimen_type: { /* BLOOD:{x:...,y:...}, URINE:{...} */ },
  fasting_yes: null, // {x:...,y:...}
  fasting_no:  null,
  profile: { /* 'Anaemia':{x:...,y:...}, ... */ },
  individual:{ /* 'FBC':{x:...,y:...}, ... */ },
  other_tests_rows:[ /* {x:...,y:...}, ... */ ]
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
    alert(`Koordinat: ${x}, ${y} — salin ke MAP dalam app.js`);
  });
})();

/************ EVENTS ************/
$('#csv').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  cacheRows = parseCSV(text);
  $('#list').textContent = JSON.stringify(cacheRows.slice(0,10), null, 2);
});

$('#btnPreview').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  await renderRecord(cacheRows[0]);
});

$('#btnUpload').addEventListener('click', async ()=>{
  if (!cacheRows.length) return alert('Sila pilih CSV dahulu');
  const res = await fetch(WEB_APP_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(cacheRows) // method INSERT (default)
  });
  const out = await res.json();
  alert('Upload → ' + JSON.stringify(out));
});

$('#btnPrintAll').addEventListener('click', async ()=>{
  // Ambil terus dari Sheet status=PENDING
  const res = await fetch(WEB_APP_URL + '?status=PENDING');
  const out = await res.json();
  const items = out.data || [];
  if (!items.length) return alert('Tiada rekod PENDING di Sheet');
  const printedKeys = [];
  for (const rec of items){
    await renderRecord(rec);
    window.print();
    printedKeys.push((String(rec.name||'').trim() + '|' + String(rec.nric_passport||'').trim()).toLowerCase());
  }
  await fetch(WEB_APP_URL + '?method=MARK_PRINTED', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({keys: printedKeys})
  });
  alert('Selesai cetak & ditanda PRINTED');
});

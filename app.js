let WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxR-LcgCukny9hSmX9611U-tv1gb1vnaHYP7Sb7LWeY_6HgqnIxYD6UuDua6vnSv2s/exec';
const $ = s => document.querySelector(s);
$('#webapp').addEventListener('change', e => WEB_APP_URL = e.target.value.trim());

// ====== PETA KOORDINAT (ISI SEDIKIT DEMI SEDIKIT GUNA MODE CALIBRATE) ======
const MAP = {
  // Contoh: isikan hasil bacaan koordinat anda (klik canvas ketika "Calibrate" ON)
  // name: {x: 105, y: 145},
  // mrn:  {x: 535, y: 145},
  // nric_passport: {x: 535, y: 170},
  // ...
  specimen_type: {
    // BLOOD:{x:128,y:495}, URINE:{x:208,y:495}, ...
  },
  fasting_yes: null, // {x:530,y:540}
  fasting_no:  null, // {x:575,y:540}
  // Tambah profile & individual test kotak semak selepas anda calibrate:
  profile: {
    // 'Anaemia': {x: 38, y: 635},
    // 'Diabetes': {x: 38, y: 695},
  },
  individual: {
    // 'FBC': {x: 305, y: 705},
    // 'HbA1C': {x: 305, y: 750},
  },
  other_tests_rows: [
    // {x:470,y:870}, {x:470,y:885}, ...
  ]
};

// ====== UTIL ======
async function readExcel(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, {defval:''});
  json.forEach(r => { if(!r.status) r.status='PENDING'; });
  return json;
}

// ====== PDF RENDER + OVERLAY ======
async function renderPDF(record){
  const url = 'of019.pdf';
  const pdf = await pdfjsLib.getDocument(url).promise;
  const page = await pdf.getPage(1);
  const scale = 1.6; // laras ikut kualiti
  const viewport = page.getViewport({ scale });
  const canvas = $('#c');
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({canvasContext: ctx, viewport}).promise;

  // Overlay
  ctx.fillStyle = '#000';
  ctx.font = '11px Helvetica';

  // helper tulis teks jika ada mapping
  const write = (key, text) => {
    const m = MAP[key];
    if (m && typeof m.x === 'number' && typeof m.y === 'number') {
      ctx.fillText(text || '', m.x, m.y);
    }
  };

  write('name', record.name);
  write('address', record.address);
  write('postcode', record.postcode);
  write('mrn', record.mrn);
  write('nric_passport', record.nric_passport);
  write('dob', record.dob);
  write('age', record.age);
  write('contact', record.contact);
  write('sex', record.sex);
  write('email', record.email);
  write('doctor_name', record.doctor_name);
  write('doctor_clinic', record.doctor_clinic);
  write('history_notes', record.history_notes);
  write('drug_last_dose_date', record.drug_last_dose_date);
  write('drug_last_dose_time', record.drug_last_dose_time);
  write('specimen_collection_date', record.specimen_collection_date);
  write('specimen_collection_time', record.specimen_collection_time);
  write('collected_by', record.collected_by);
  write('gestation_week', record.gestation_week);

  // fasting / pregnant checkbox
  if (record.fasting?.toUpperCase()==='YES' && MAP.fasting_yes) ctx.fillText('✓', MAP.fasting_yes.x, MAP.fasting_yes.y);
  if (record.fasting?.toUpperCase()==='NO'  && MAP.fasting_no)  ctx.fillText('✓', MAP.fasting_no.x, MAP.fasting_no.y);

  // specimen type checkbox
  const st = record.specimen_type?.toUpperCase();
  if (MAP.specimen_type && st && MAP.specimen_type[st]) {
    ctx.fillText('✓', MAP.specimen_type[st].x, MAP.specimen_type[st].y);
  }

  // tests_profile: "Anaemia;Diabetes;Lipid Profile"
  (record.tests_profile||'').split(';').map(s=>s.trim()).filter(Boolean).forEach(label=>{
    const p = MAP.profile[label];
    if (p) ctx.fillText('✓', p.x, p.y);
  });

  // tests_individual: "FBC;HbA1C;HBsAg"
  (record.tests_individual||'').split(';').map(s=>s.trim()).filter(Boolean).forEach(label=>{
    const p = MAP.individual[label];
    if (p) ctx.fillText('✓', p.x, p.y);
  });

  // other_tests: "VDRL|Blood C/S|..."
  const others = (record.other_tests||'').split('|').map(s=>s.trim()).filter(Boolean);
  if (others.length && MAP.other_tests_rows?.length){
    const N = Math.min(others.length, MAP.other_tests_rows.length);
    for (let i=0;i<N;i++){
      const pos = MAP.other_tests_rows[i];
      if (pos) ctx.fillText(others[i], pos.x, pos.y);
    }
  }
}

// ====== CALIBRATE MODE (klik dapat koordinat) ======
(function(){
  const c = $('#c'), ctx = c.getContext('2d');
  c.addEventListener('click', (ev)=>{
    if (!$('#calibrate').checked) return;
    const rect = c.getBoundingClientRect();
    const x = Math.round(ev.clientX - rect.left);
    const y = Math.round(ev.clientY - rect.top);
    // titik panduan
    ctx.beginPath(); ctx.arc(x,y,3,0,6.283); ctx.fill();
    ctx.fillText(`(${x},${y})`, x+6, y-6);
    console.log('Koordinat:', x, y);
    alert(`Koordinat: ${x}, ${y}\nSalin ke MAP anda.`);
  });
})();

// ====== EVENTS ======
let cacheExcel = [];
$('#excel').addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  cacheExcel = await readExcel(f);
  $('#list').textContent = JSON.stringify(cacheExcel.slice(0,10), null, 2);
});

$('#btnUpload').addEventListener('click', async ()=>{
  if (!WEB_APP_URL) return alert('Isi Web App URL');
  if (!cacheExcel.length) return alert('Pilih Excel dahulu');
  const res = await fetch(WEB_APP_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(cacheExcel) // method=INSERT default
  });
  const out = await res.json();
  alert('Upload → ' + JSON.stringify(out));
});

$('#btnPreview').addEventListener('click', async ()=>{
  if (!cacheExcel.length) return alert('Pilih Excel dulu');
  await renderPDF(cacheExcel[0]);
});

$('#btnPrintAll').addEventListener('click', async ()=>{
  if (!WEB_APP_URL) return alert('Isi Web App URL');
  const res = await fetch(WEB_APP_URL + '?status=PENDING');
  const out = await res.json();
  const items = out.data || [];
  if (!items.length) return alert('Tiada rekod PENDING');
  const printedKeys = [];
  for (const rec of items){
    await renderPDF(rec);
    window.print();
    // kumpul key untuk MARK_PRINTED
    const key = (String(rec.name||'').trim() + '|' + String(rec.nric_passport||'').trim()).toLowerCase();
    printedKeys.push(key);
  }
  // tanda PRINTED
  await fetch(WEB_APP_URL + '?method=MARK_PRINTED', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({keys: printedKeys})
  });
  alert('Selesai cetak & ditanda PRINTED');
});

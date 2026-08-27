const ENCRYPTED_DATA = JSON.parse(atob(window.__ONC_DATA_PARTS.join("")));
let students=[];
let inactivityTimer=null;
let lastVisible=[];
let cloudAttendance={};
let unsubscribeAttendance=null;
let firebaseApi=null;
let db=null;
let firebaseOnline=false;
const $=s=>document.querySelector(s);
const enc=new TextEncoder(), dec=new TextDecoder();

const firebaseConfig={
  apiKey:"AIzaSyCN7q60QjDx3T2XqpHRgil8lwBKk7Me_W8",
  authDomain:"onc-2026.firebaseapp.com",
  projectId:"onc-2026",
  storageBucket:"onc-2026.firebasestorage.app",
  messagingSenderId:"536799852500",
  appId:"1:536799852500:web:9e6797f74c99ae40e30841"
};

function b64bytes(s){const bin=atob(s);return Uint8Array.from(bin,c=>c.charCodeAt(0));}
async function decryptData(password){
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64bytes(ENCRYPTED_DATA.salt),iterations:ENCRYPTED_DATA.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64bytes(ENCRYPTED_DATA.iv)},key,b64bytes(ENCRYPTED_DATA.ciphertext));
  const rows=JSON.parse(dec.decode(plain));
  return rows.map((r,i)=>({id:`S${String(i+1).padStart(3,'0')}`,name:r[0],series:`${r[1]}º Ano do Ensino Médio`,level:`Nível ${r[2]}`,school:'SESI 113 CENTRO EDUCACIONAL',schoolCode:'35108303',login:r[3],password:r[4],url:'http://alunos.onciencias.org/'}));
}

async function initFirebase(){
  const status=$('#cloudStatus');
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js');
    const fsMod=await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js');
    const app=appMod.initializeApp(firebaseConfig);
    db=fsMod.getFirestore(app);
    firebaseApi=fsMod;
    firebaseOnline=true;
    if(status)status.textContent='Firebase: online';
    return true;
  }catch(err){
    console.error('Firebase indisponível:',err);
    firebaseOnline=false;
    if(status)status.textContent='Firebase: modo local';
    return false;
  }
}

function todayLocal(){const d=new Date();const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10)}
function attendanceKey(){return 'onc2026_attendance_'+$('#dateFilter').value}
function readLocalAttendance(){try{return JSON.parse(localStorage.getItem(attendanceKey())||'{}')}catch{return {}}}
function writeLocalAttendance(a){localStorage.setItem(attendanceKey(),JSON.stringify(a))}
function readAttendance(){return Object.keys(cloudAttendance).length||firebaseOnline?cloudAttendance:readLocalAttendance()}
function esc(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function masked(p){return '•'.repeat(Math.max(6,Math.min(10,p.length)))}
function filteredStudents(){const q=$('#search').value.trim().toLocaleLowerCase('pt-BR');const sf=$('#seriesFilter').value;return students.filter(s=>(sf==='all'||s.series===sf)&&(!q||s.name.toLocaleLowerCase('pt-BR').includes(q)||s.login.toLocaleLowerCase('pt-BR').includes(q)))}

function render(){
  const att=readAttendance();lastVisible=filteredStudents();
  const body=$('#studentsBody');
  body.innerHTML=lastVisible.map(s=>{const a=att[s.id];const present=!!a;return `<tr class="${present?'present':''}" data-id="${s.id}"><td><label class="presence"><input class="presenceBox" type="checkbox" ${present?'checked':''}><span class="time">${present?esc(a.time||''):''}</span></label></td><td><div class="name">${esc(s.name)}</div><div class="sub">${esc(s.level)} · Cód. escola ${esc(s.schoolCode)}</div></td><td><span class="series-badge">${esc(s.series.replace(' do Ensino Médio',''))}</span></td><td><div class="cred"><code>${esc(s.login)}</code><button class="iconbtn copyLogin">Copiar</button></div></td><td><div class="cred"><code class="pass" data-show="0">${masked(s.password)}</code><button class="iconbtn togglePass">Mostrar</button><button class="iconbtn copyPass">Copiar</button></div></td><td><a class="portal" href="${esc(s.url)}" target="_blank" rel="noopener">Acessar</a></td></tr>`}).join('');
  $('#empty').classList.toggle('hidden',lastVisible.length>0);
  updateStats();
}

function updateStats(){const att=readAttendance();const total=lastVisible.length;const present=lastVisible.filter(s=>att[s.id]).length;$('#statTotal').textContent=total;$('#statPresent').textContent=present;$('#statAbsent').textContent=total-present;$('#statPercent').textContent=total?Math.round(present/total*100)+'%':'0%'}

async function subscribeAttendance(){
  if(unsubscribeAttendance){unsubscribeAttendance();unsubscribeAttendance=null;}
  cloudAttendance={};
  if(!firebaseOnline||!db||!firebaseApi){render();return;}
  const date=$('#dateFilter').value;
  const {collection,query,where,onSnapshot}=firebaseApi;
  try{
    const q=query(collection(db,'presencas'),where('data','==',date));
    unsubscribeAttendance=onSnapshot(q,snap=>{
      const next={};
      snap.forEach(doc=>{const d=doc.data();if(d.presente!==false)next[d.alunoId]={time:d.horario||''};});
      cloudAttendance=next;
      writeLocalAttendance(next);
      $('#cloudStatus').textContent='Firebase: sincronizado';
      render();
    },err=>{
      console.error('Erro ao sincronizar Firestore:',err);
      firebaseOnline=false;
      cloudAttendance=readLocalAttendance();
      $('#cloudStatus').textContent='Firebase: modo local';
      render();
    });
  }catch(err){
    console.error(err);
    firebaseOnline=false;
    cloudAttendance=readLocalAttendance();
    $('#cloudStatus').textContent='Firebase: modo local';
    render();
  }
}

async function savePresenceCloud(id,on,time=''){
  const local=readLocalAttendance();
  if(on)local[id]={time};else delete local[id];
  writeLocalAttendance(local);
  cloudAttendance={...local};
  render();
  if(!firebaseOnline||!db||!firebaseApi){toast('Salvo neste navegador');return;}
  const {doc,setDoc,deleteDoc,serverTimestamp}=firebaseApi;
  const date=$('#dateFilter').value;
  const ref=doc(db,'presencas',`${date}_${id}`);
  try{
    if(on){await setDoc(ref,{alunoId:id,data:date,presente:true,horario:time,atualizadoEm:serverTimestamp()},{merge:true});}
    else{await deleteDoc(ref);}
    $('#cloudStatus').textContent='Firebase: sincronizado';
  }catch(err){
    console.error('Erro ao salvar presença:',err);
    firebaseOnline=false;
    $('#cloudStatus').textContent='Firebase: modo local';
    toast('Sem acesso ao Firebase; salvo localmente');
  }
}

async function setPresence(id,on){const now=new Date();const time=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});await savePresenceCloud(id,on,on?time:'')}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),1800)}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Copiado')}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Copiado')}}
function exportCSV(){const att=readAttendance();const rows=[['Data','Nome','Turma','Nível','Presença','Horário']];filteredStudents().forEach(s=>rows.push([$('#dateFilter').value,s.name,s.series,s.level,att[s.id]?'Presente':'Ausente',att[s.id]?.time||'']));const csv='﻿'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`presenca_onc_${$('#dateFilter').value}.csv`;a.click();URL.revokeObjectURL(a.href)}
function lock(){students=[];if(unsubscribeAttendance){unsubscribeAttendance();unsubscribeAttendance=null;}$('#app').classList.add('hidden');$('#lockScreen').classList.remove('hidden');$('#masterPassword').value='';$('#unlockError').textContent='';clearTimeout(inactivityTimer);setTimeout(()=>$('#masterPassword').focus(),50)}
function resetInactivity(){clearTimeout(inactivityTimer);inactivityTimer=setTimeout(lock,15*60*1000)}

async function unlock(){
  const p=$('#masterPassword').value;if(!p)return;
  $('#unlockBtn').disabled=true;$('#unlockBtn').textContent='Abrindo...';$('#unlockError').textContent='';
  try{
    students=await decryptData(p);
    $('#lockScreen').classList.add('hidden');$('#app').classList.remove('hidden');$('#dateFilter').value=todayLocal();
    cloudAttendance=readLocalAttendance();render();
    await initFirebase();
    await subscribeAttendance();
    resetInactivity();
  }catch(e){$('#unlockError').textContent='Senha mestra incorreta.'}
  finally{$('#unlockBtn').disabled=false;$('#unlockBtn').textContent='Entrar'}
}

$('#unlockBtn').addEventListener('click',unlock);
$('#masterPassword').addEventListener('keydown',e=>{if(e.key==='Enter')unlock()});
$('#search').addEventListener('input',render);
$('#seriesFilter').addEventListener('change',render);
$('#dateFilter').addEventListener('change',()=>{cloudAttendance=readLocalAttendance();render();subscribeAttendance()});
$('#lockBtn').addEventListener('click',lock);
$('#printBtn').addEventListener('click',()=>window.print());
$('#exportCsv').addEventListener('click',exportCSV);

$('#markAll').addEventListener('click',async()=>{
  const visible=filteredStudents();
  const now=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const local=readLocalAttendance();visible.forEach(s=>local[s.id]={time:now});writeLocalAttendance(local);cloudAttendance={...local};render();
  if(firebaseOnline&&db&&firebaseApi){
    try{
      const {writeBatch,doc,serverTimestamp}=firebaseApi;const batch=writeBatch(db);const date=$('#dateFilter').value;
      visible.forEach(s=>batch.set(doc(db,'presencas',`${date}_${s.id}`),{alunoId:s.id,data:date,presente:true,horario:now,atualizadoEm:serverTimestamp()},{merge:true}));
      await batch.commit();toast('Presenças sincronizadas');
    }catch(err){console.error(err);firebaseOnline=false;$('#cloudStatus').textContent='Firebase: modo local';toast('Salvo localmente');}
  }
});

$('#clearAll').addEventListener('click',async()=>{
  const visible=filteredStudents();
  const local=readLocalAttendance();visible.forEach(s=>delete local[s.id]);writeLocalAttendance(local);cloudAttendance={...local};render();
  if(firebaseOnline&&db&&firebaseApi){
    try{
      const {writeBatch,doc}=firebaseApi;const batch=writeBatch(db);const date=$('#dateFilter').value;
      visible.forEach(s=>batch.delete(doc(db,'presencas',`${date}_${s.id}`)));await batch.commit();toast('Presenças removidas');
    }catch(err){console.error(err);firebaseOnline=false;$('#cloudStatus').textContent='Firebase: modo local';toast('Alteração mantida localmente');}
  }
});

$('#studentsBody').addEventListener('change',e=>{if(e.target.classList.contains('presenceBox')){const id=e.target.closest('tr').dataset.id;setPresence(id,e.target.checked)}});
$('#studentsBody').addEventListener('click',e=>{const tr=e.target.closest('tr');if(!tr)return;const s=students.find(x=>x.id===tr.dataset.id);if(e.target.classList.contains('copyLogin'))copyText(s.login);if(e.target.classList.contains('copyPass'))copyText(s.password);if(e.target.classList.contains('togglePass')){const code=tr.querySelector('.pass');const show=code.dataset.show==='1';code.dataset.show=show?'0':'1';code.textContent=show?masked(s.password):s.password;e.target.textContent=show?'Mostrar':'Ocultar'}});
['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{if(!$('#app').classList.contains('hidden'))resetInactivity()},{passive:true}));

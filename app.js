/**
 * MoneyFlow – app.js
 * Vanilla JS · IndexedDB · PWA · No dependencies
 */
'use strict';

/* ===== CONSTANTS ===== */
const APP_VERSION = '1.0.0';
const DB_NAME     = 'moneyflow_db';
const DB_VERSION  = 1;
const CURRENCY    = '৳';

const FUND_TYPES = {
  cash:       { label: 'Cash',           emoji: '💵' },
  bank:       { label: 'Bank Account',   emoji: '🏦' },
  mobile:     { label: 'Mobile Banking', emoji: '📱' },
  savings:    { label: 'Savings',        emoji: '🐖' },
  investment: { label: 'Investment',     emoji: '📈' },
  crypto:     { label: 'Crypto',         emoji: '₿'  },
  other:      { label: 'Other',          emoji: '💼' },
};

const CATEGORIES_PRESET = [
  'Salary','Freelance','Business','Investment Return','Bonus','Gift',
  'Food','Rent','Transport','Utilities','Shopping','Healthcare',
  'Education','Entertainment','Travel','Clothing','Savings Transfer','Other'
];

/* ===== DATABASE ===== */
let db = null;

function initDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('funds')) {
        const fs = d.createObjectStore('funds', { keyPath: 'id', autoIncrement: true });
        fs.createIndex('type', 'type', { unique: false });
      }
      if (!d.objectStoreNames.contains('transactions')) {
        const ts = d.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        ts.createIndex('date',     'date',     { unique: false });
        ts.createIndex('fundId',   'fundId',   { unique: false });
        ts.createIndex('type',     'type',     { unique: false });
        ts.createIndex('category', 'category', { unique: false });
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror   = e => rej(e.target.error);
  });
}

const dbGet    = (store, key)  => new Promise((res, rej) => { const tx = db.transaction(store,'readonly'); const r = tx.objectStore(store).get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
const dbGetAll = (store)       => new Promise((res, rej) => { const tx = db.transaction(store,'readonly'); const r = tx.objectStore(store).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
const dbPut    = (store, data) => new Promise((res, rej) => { const tx = db.transaction(store,'readwrite'); const r = tx.objectStore(store).put(data); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
const dbAdd    = (store, data) => new Promise((res, rej) => { const tx = db.transaction(store,'readwrite'); const r = tx.objectStore(store).add(data); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
const dbDelete = (store, key)  => new Promise((res, rej) => { const tx = db.transaction(store,'readwrite'); const r = tx.objectStore(store).delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
const dbClear  = (store)       => new Promise((res, rej) => { const tx = db.transaction(store,'readwrite'); const r = tx.objectStore(store).clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });

async function getSetting(key, def=null) { const r = await dbGet('settings',key); return r ? r.value : def; }
async function setSetting(key, val) { await dbPut('settings',{key,value:val}); }

/* ===== STATE ===== */
const state = {
  funds:[],
  transactions:[],
  summaryPeriod:'daily',
  analyticsPeriod:'monthly',
  theme:'dark',
  deleteCallback:null,
};

/* ===== UTILS ===== */
function fmt(n) { return CURRENCY + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function today() { return new Date().toISOString().slice(0,10); }
function weekStart(d) { const dt=new Date(d+'T00:00:00'); dt.setDate(dt.getDate()-dt.getDay()); return dt.toISOString().slice(0,10); }
function isSameDay(a,b) { return a.slice(0,10)===b.slice(0,10); }
function isSameWeek(a,b) { return weekStart(a)===weekStart(b); }
function isSameMonth(a,b) { return a.slice(0,7)===b.slice(0,7); }
function escHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

/* ===== TOAST ===== */
function toast(msg, type='success') {
  const c=document.getElementById('toastContainer');
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span class="toast-dot"></span>${escHtml(msg)}`;
  c.appendChild(el);
  setTimeout(()=>{ el.classList.add('fade-out'); el.addEventListener('animationend',()=>el.remove()); },2800);
}

/* ===== MODALS ===== */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  const any=['modalFund','modalTx','modalConfirm'].some(m=>!document.getElementById(m).classList.contains('hidden'));
  if(!any) document.getElementById('overlay').classList.add('hidden');
}
function closeAllModals() {
  ['modalFund','modalTx','modalConfirm'].forEach(closeModal);
  document.getElementById('overlay').classList.add('hidden');
}

/* ===== NAV ===== */
const PAGE_TITLES = { dashboard:'Dashboard', funds:'Funds', transactions:'Transactions', analytics:'Analytics' };

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(a=>a.classList.remove('active'));
  const target=document.getElementById('page-'+page);
  if(target) target.classList.add('active');
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(a=>a.classList.add('active'));
  document.getElementById('pageTitle').textContent=PAGE_TITLES[page]||page;
  const fab=document.getElementById('addBtnMobile');
  fab.style.display=(page==='dashboard'||page==='analytics')?'none':'inline-flex';
  if(page==='dashboard')    renderDashboard();
  if(page==='funds')        renderFunds();
  if(page==='transactions') renderTransactions();
  if(page==='analytics')    renderAnalytics();
  closeMobileSidebar();
}

/* ===== MOBILE SIDEBAR ===== */
function openMobileSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('visible'); }
function closeMobileSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('visible'); }

/* ===== THEME ===== */
async function applyTheme(theme) {
  state.theme=theme;
  document.documentElement.setAttribute('data-theme',theme);
  document.getElementById('themeIconSun').classList.toggle('hidden', theme==='dark');
  document.getElementById('themeIconMoon').classList.toggle('hidden', theme==='light');
  await setSetting('theme',theme);
}
async function toggleTheme() { await applyTheme(state.theme==='dark'?'light':'dark'); }

/* ===== LOAD DATA ===== */
async function loadAll() {
  state.funds        = await dbGetAll('funds');
  state.transactions = await dbGetAll('transactions');
  state.transactions.sort((a,b)=>b.date.localeCompare(a.date)||(b.id-a.id));
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const {funds,transactions}=state;
  const totalAssets   = funds.reduce((s,f)=>s+Number(f.balance),0);
  const cashFunds     = funds.filter(f=>['cash','bank','mobile','savings'].includes(f.type));
  const investFunds   = funds.filter(f=>['investment','crypto'].includes(f.type));
  const totalCash     = cashFunds.reduce((s,f)=>s+Number(f.balance),0);
  const totalInvested = investFunds.reduce((s,f)=>s+Number(f.balance),0);
  const allInc  = transactions.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const allExp  = transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);

  document.getElementById('kpiTotalAssets').textContent   = fmt(totalAssets);
  document.getElementById('kpiTotalCash').textContent     = fmt(totalCash);
  document.getElementById('kpiTotalInvested').textContent = fmt(totalInvested);
  document.getElementById('kpiNetBalance').textContent    = fmt(allInc-allExp);
  document.getElementById('kpiAssetCount').textContent    = `${funds.length} fund${funds.length!==1?'s':''}`;
  document.getElementById('dashLastUpdated').textContent  = `Updated ${new Date().toLocaleTimeString()}`;

  renderSummary(state.summaryPeriod);

  const fundsEl=document.getElementById('dashFundsList');
  fundsEl.innerHTML = funds.length===0
    ? '<div style="padding:16px;color:var(--text3);text-align:center;font-size:.85rem;">No funds yet.</div>'
    : funds.slice(0,5).map(f=>fundMiniHTML(f,totalAssets)).join('');

  const txEl=document.getElementById('dashRecentTx');
  const recent=transactions.slice(0,8);
  txEl.innerHTML = recent.length===0
    ? '<div style="padding:16px;color:var(--text3);text-align:center;font-size:.85rem;">No transactions yet.</div>'
    : recent.map(t=>txItemHTML(t,true)).join('');
}

function renderSummary(period) {
  const ref=today();
  const txs=state.transactions.filter(t=>{
    if(period==='daily')   return isSameDay(t.date,ref);
    if(period==='weekly')  return isSameWeek(t.date,ref);
    if(period==='monthly') return isSameMonth(t.date,ref);
    return false;
  });
  const inc = txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const exp = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  document.getElementById('summaryIncome').textContent  = fmt(inc);
  document.getElementById('summaryExpense').textContent = fmt(exp);
  document.getElementById('summarySavings').textContent = fmt(inc-exp);
}

function fundMiniHTML(f, total) {
  const info=FUND_TYPES[f.type]||FUND_TYPES.other;
  return `<div class="fund-mini-item">
    <div class="fund-mini-left">
      <div class="fund-icon fund-type-${f.type}">${info.emoji}</div>
      <div><div class="fund-mini-name">${escHtml(f.name)}</div><div class="fund-mini-type">${info.label}</div></div>
    </div>
    <div class="fund-mini-balance">${fmt(f.balance)}</div>
  </div>`;
}

/* ===== FUNDS PAGE ===== */
function renderFunds() {
  const {funds}=state;
  const total=funds.reduce((s,f)=>s+Number(f.balance),0);
  document.getElementById('fundsTotalAmount').textContent=fmt(total);
  const el=document.getElementById('fundsList');
  if(funds.length===0){
    el.innerHTML='<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 12c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3"/></svg><p>No funds yet. Add your first fund!</p></div>';
    return;
  }
  el.innerHTML=funds.map(f=>{
    const info=FUND_TYPES[f.type]||FUND_TYPES.other;
    return `<div class="fund-item">
      <div class="fund-icon fund-type-${f.type}">${info.emoji}</div>
      <div class="fund-info">
        <div class="fund-name">${escHtml(f.name)}</div>
        <div class="fund-meta">${info.label}${f.note?' · '+escHtml(f.note):''}</div>
      </div>
      <div class="fund-balance">${fmt(f.balance)}</div>
      <div class="fund-actions">
        <button class="icon-btn" onclick="editFund(${f.id})" title="Edit">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" onclick="deleteFundConfirm(${f.id})" title="Delete">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

/* ===== FUND CRUD ===== */
function openAddFund() {
  document.getElementById('fundId').value='';
  document.getElementById('fundName').value='';
  document.getElementById('fundType').value='cash';
  document.getElementById('fundBalance').value='';
  document.getElementById('fundNote').value='';
  document.getElementById('modalFundTitle').textContent='Add Fund';
  openModal('modalFund');
}

async function editFund(id) {
  const f=state.funds.find(x=>x.id===id);
  if(!f) return;
  document.getElementById('fundId').value=f.id;
  document.getElementById('fundName').value=f.name;
  document.getElementById('fundType').value=f.type;
  document.getElementById('fundBalance').value=f.balance;
  document.getElementById('fundNote').value=f.note||'';
  document.getElementById('modalFundTitle').textContent='Edit Fund';
  openModal('modalFund');
}

async function saveFund() {
  const name=document.getElementById('fundName').value.trim();
  const type=document.getElementById('fundType').value;
  const balance=parseFloat(document.getElementById('fundBalance').value);
  const note=document.getElementById('fundNote').value.trim();
  const idRaw=document.getElementById('fundId').value;
  if(!name){toast('Fund name is required','error');return;}
  if(isNaN(balance)||balance<0){toast('Enter a valid balance','error');return;}
  const fund={name,type,balance,note,updatedAt:new Date().toISOString()};
  if(idRaw){
    fund.id=parseInt(idRaw);
    await dbPut('funds',fund);
    toast('Fund updated');
  } else {
    fund.createdAt=new Date().toISOString();
    await dbAdd('funds',fund);
    toast('Fund added');
  }
  closeModal('modalFund');
  await loadAll();
  renderFunds();
  renderDashboard();
}

function deleteFundConfirm(id) {
  const f=state.funds.find(x=>x.id===id);
  if(!f) return;
  document.getElementById('confirmMessage').textContent=`Delete "${f.name}"? All associated transactions will also be deleted.`;
  state.deleteCallback=async()=>{
    const txs=state.transactions.filter(t=>t.fundId===id);
    for(const t of txs) await dbDelete('transactions',t.id);
    await dbDelete('funds',id);
    toast('Fund deleted');
    await loadAll(); renderFunds(); renderDashboard();
  };
  openModal('modalConfirm');
}

/* ===== TRANSACTIONS PAGE ===== */
function getFilteredTransactions() {
  const search  =document.getElementById('txSearch').value.toLowerCase();
  const catF    =document.getElementById('filterCategory').value;
  const fundF   =document.getElementById('filterFund').value;
  const typeF   =document.getElementById('filterType').value;
  const dateFrom=document.getElementById('filterDateFrom').value;
  const dateTo  =document.getElementById('filterDateTo').value;
  return state.transactions.filter(t=>{
    if(search&&!t.category.toLowerCase().includes(search)&&!(t.note||'').toLowerCase().includes(search)) return false;
    if(catF   && t.category!==catF)            return false;
    if(fundF  && String(t.fundId)!==fundF)     return false;
    if(typeF  && t.type!==typeF)               return false;
    if(dateFrom && t.date<dateFrom)            return false;
    if(dateTo   && t.date>dateTo)              return false;
    return true;
  });
}

function renderTransactions() {
  populateFilterDropdowns();
  const txs=getFilteredTransactions();
  const el=document.getElementById('txList');
  const empty=document.getElementById('txEmpty');
  if(txs.length===0){ el.innerHTML=''; empty.classList.remove('hidden'); }
  else { empty.classList.add('hidden'); el.innerHTML=txs.map(t=>txItemHTML(t,false)).join(''); }
}

function txItemHTML(t,compact) {
  const fund=state.funds.find(f=>f.id===t.fundId);
  const fundName=fund?fund.name:'Unknown Fund';
  const actions=compact?'':`
    <div class="tx-actions">
      <button class="icon-btn" onclick="editTransaction(${t.id})" title="Edit">
        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn" onclick="deleteTxConfirm(${t.id})" title="Delete">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`;
  return `<div class="tx-item">
    <div class="tx-dot ${t.type}"></div>
    <div class="tx-info">
      <div class="tx-category">${escHtml(t.category)}</div>
      <div class="tx-meta"><span>${t.date}</span><span class="tx-meta-fund">${escHtml(fundName)}</span>${t.note?`<span>${escHtml(t.note)}</span>`:''}</div>
    </div>
    <div class="tx-right">
      <div class="tx-amount ${t.type}">${fmt(t.amount)}</div>
      ${actions}
    </div>
  </div>`;
}

function populateFilterDropdowns() {
  const cats=[ ...new Set(state.transactions.map(t=>t.category)) ].sort();
  const catEl=document.getElementById('filterCategory');
  const curCat=catEl.value;
  catEl.innerHTML='<option value="">All Categories</option>'+cats.map(c=>`<option value="${escHtml(c)}" ${c===curCat?'selected':''}>${escHtml(c)}</option>`).join('');
  const fundEl=document.getElementById('filterFund');
  const curFund=fundEl.value;
  fundEl.innerHTML='<option value="">All Funds</option>'+state.funds.map(f=>`<option value="${f.id}" ${String(f.id)===curFund?'selected':''}>${escHtml(f.name)}</option>`).join('');
}

/* ===== TRANSACTION CRUD ===== */
let txType='income';

function openAddTransaction() {
  txType='income';
  document.getElementById('txId').value='';
  document.getElementById('txAmount').value='';
  document.getElementById('txCategory').value='';
  document.getElementById('txNote').value='';
  document.getElementById('txDate').value=today();
  document.getElementById('modalTxTitle').textContent='Add Transaction';
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.toggle('active',b.dataset.type==='income'));
  populateFundSelect('');
  updateCategoryDatalist();
  openModal('modalTx');
}

async function editTransaction(id) {
  const t=state.transactions.find(x=>x.id===id);
  if(!t) return;
  txType=t.type;
  document.getElementById('txId').value=t.id;
  document.getElementById('txAmount').value=t.amount;
  document.getElementById('txCategory').value=t.category;
  document.getElementById('txNote').value=t.note||'';
  document.getElementById('txDate').value=t.date;
  document.getElementById('modalTxTitle').textContent='Edit Transaction';
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.toggle('active',b.dataset.type===t.type));
  populateFundSelect(t.fundId);
  updateCategoryDatalist();
  openModal('modalTx');
}

function populateFundSelect(selectedId) {
  document.getElementById('txFund').innerHTML='<option value="">Select a fund…</option>'+
    state.funds.map(f=>`<option value="${f.id}" ${f.id==selectedId?'selected':''}>${escHtml(f.name)}</option>`).join('');
}

function updateCategoryDatalist() {
  const existing=[...new Set(state.transactions.map(t=>t.category))];
  const all=[...new Set([...CATEGORIES_PRESET,...existing])].sort();
  document.getElementById('categoryList').innerHTML=all.map(c=>`<option value="${escHtml(c)}"></option>`).join('');
}

async function saveTransaction() {
  const idRaw   =document.getElementById('txId').value;
  const amount  =parseFloat(document.getElementById('txAmount').value);
  const category=document.getElementById('txCategory').value.trim();
  const fundId  =parseInt(document.getElementById('txFund').value);
  const date    =document.getElementById('txDate').value;
  const note    =document.getElementById('txNote').value.trim();

  if(isNaN(amount)||amount<=0){toast('Enter a valid amount > 0','error');return;}
  if(!category){toast('Category is required','error');return;}
  if(!fundId){toast('Please select a fund','error');return;}
  if(!date){toast('Date is required','error');return;}

  const fund=state.funds.find(f=>f.id===fundId);
  if(!fund){toast('Selected fund not found','error');return;}

  if(idRaw) {
    const oldTx=state.transactions.find(t=>t.id===parseInt(idRaw));
    if(oldTx) {
      const oldFund=state.funds.find(f=>f.id===oldTx.fundId);
      if(oldFund) {
        let bal=Number(oldFund.balance);
        if(oldTx.type==='income')  bal-=Number(oldTx.amount);
        if(oldTx.type==='expense') bal+=Number(oldTx.amount);
        await dbPut('funds',{...oldFund,balance:Math.max(0,bal)});
      }
    }
    await dbPut('transactions',{id:parseInt(idRaw),type:txType,amount,category,fundId,date,note,updatedAt:new Date().toISOString()});
    toast('Transaction updated');
  } else {
    await dbAdd('transactions',{type:txType,amount,category,fundId,date,note,createdAt:new Date().toISOString()});
    toast('Transaction added');
  }

  // Apply to fund balance (re-fetch in case it changed above)
  await loadAll();
  const updatedFund=state.funds.find(f=>f.id===fundId);
  if(updatedFund) {
    let bal=Number(updatedFund.balance);
    if(txType==='income')  bal+=amount;
    if(txType==='expense') bal-=amount;
    await dbPut('funds',{...updatedFund,balance:Math.max(0,bal)});
  }

  closeModal('modalTx');
  await loadAll();
  renderTransactions();
  renderDashboard();
}

function deleteTxConfirm(id) {
  const t=state.transactions.find(x=>x.id===id);
  if(!t) return;
  document.getElementById('confirmMessage').textContent=`Delete "${t.category}" (${fmt(t.amount)})? The fund balance will be reversed.`;
  state.deleteCallback=async()=>{
    const fund=state.funds.find(f=>f.id===t.fundId);
    if(fund) {
      let bal=Number(fund.balance);
      if(t.type==='income')  bal-=Number(t.amount);
      if(t.type==='expense') bal+=Number(t.amount);
      await dbPut('funds',{...fund,balance:Math.max(0,bal)});
    }
    await dbDelete('transactions',id);
    toast('Transaction deleted');
    await loadAll(); renderTransactions(); renderDashboard();
  };
  openModal('modalConfirm');
}

/* ===== ANALYTICS ===== */
function renderAnalytics() {
  const period=state.analyticsPeriod;
  const txs=state.transactions;
  const ref=today();
  let periods=[];

  if(period==='daily') {
    for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); periods.push(d.toISOString().slice(0,10)); }
  } else if(period==='weekly') {
    for(let i=5;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i*7); periods.push(weekStart(d.toISOString().slice(0,10))); }
    periods=[...new Set(periods)];
  } else {
    for(let i=5;i>=0;i--){ const d=new Date(); d.setMonth(d.getMonth()-i); periods.push(d.toISOString().slice(0,7)); }
  }

  const labels=[]; const incomes=[]; const expenses=[]; const savings=[];

  for(const p of periods) {
    let pTxs;
    if(period==='daily') {
      pTxs=txs.filter(t=>t.date===p);
      labels.push(new Date(p+'T00:00:00').toLocaleDateString('en',{month:'short',day:'numeric'}));
    } else if(period==='weekly') {
      pTxs=txs.filter(t=>weekStart(t.date)===p);
      labels.push(new Date(p+'T00:00:00').toLocaleDateString('en',{month:'short',day:'numeric'}));
    } else {
      pTxs=txs.filter(t=>t.date.slice(0,7)===p);
      labels.push(new Date(p+'-01T00:00:00').toLocaleDateString('en',{month:'short',year:'2-digit'}));
    }
    const inc=pTxs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
    const exp=pTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
    incomes.push(inc); expenses.push(exp); savings.push(inc-exp);
  }

  let curTxs;
  if(period==='daily')        curTxs=txs.filter(t=>t.date===ref);
  else if(period==='weekly')  curTxs=txs.filter(t=>isSameWeek(t.date,ref));
  else                        curTxs=txs.filter(t=>isSameMonth(t.date,ref));

  const catMap={};
  curTxs.filter(t=>t.type==='expense').forEach(t=>{ catMap[t.category]=(catMap[t.category]||0)+Number(t.amount); });
  const catEntries=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8);

  drawBarChart('chartIncExp',labels,[{label:'Income',data:incomes,color:'#6ee7b7'},{label:'Expenses',data:expenses,color:'#f87171'}]);
  drawLineChart('chartSavings',labels,savings,'#60a5fa');
  drawPieChart('chartCategory',catEntries.map(e=>e[0]),catEntries.map(e=>e[1]));

  const totInc=incomes.reduce((a,b)=>a+b,0);
  const totExp=expenses.reduce((a,b)=>a+b,0);
  const totSav=totInc-totExp;
  document.getElementById('analyticsSummary').innerHTML=`
    <div class="analytics-summary-row"><span class="analytics-summary-label">Total Income</span><span class="analytics-summary-value" style="color:var(--accent-green)">${fmt(totInc)}</span></div>
    <div class="analytics-summary-row"><span class="analytics-summary-label">Total Expenses</span><span class="analytics-summary-value" style="color:var(--accent-red)">${fmt(totExp)}</span></div>
    <div class="analytics-summary-row"><span class="analytics-summary-label">Net Savings</span><span class="analytics-summary-value" style="color:var(--accent-blue)">${fmt(totSav)}</span></div>
    <div class="analytics-summary-row"><span class="analytics-summary-label">Transactions</span><span class="analytics-summary-value">${curTxs.length}</span></div>
    <div class="analytics-summary-row"><span class="analytics-summary-label">Savings Rate</span><span class="analytics-summary-value">${totInc>0?Math.round((totSav/totInc)*100):0}%</span></div>`;
}

/* ===== CHARTS (pure canvas) ===== */
function getThemeColors() {
  const s=getComputedStyle(document.documentElement);
  return { text2:s.getPropertyValue('--text2').trim()||'#9aa3b8', text3:s.getPropertyValue('--text3').trim()||'#6b7490', border:s.getPropertyValue('--border').trim()||'rgba(255,255,255,.07)', bg2:s.getPropertyValue('--bg2').trim()||'#161b27' };
}

function resizeCanvas(canvas) {
  const p=canvas.parentElement;
  canvas.width=p.clientWidth;
  canvas.height=p.clientHeight;
}

function drawBarChart(id,labels,datasets) {
  const canvas=document.getElementById(id);
  if(!canvas) return;
  resizeCanvas(canvas);
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  const C=getThemeColors();
  const PAD={top:22,right:14,bottom:40,left:52};
  const cW=W-PAD.left-PAD.right,cH=H-PAD.top-PAD.bottom;
  ctx.clearRect(0,0,W,H);
  const allV=datasets.flatMap(d=>d.data);
  const maxV=Math.max(...allV,1);
  const n=labels.length;
  const gW=cW/n;
  const bW=Math.min(gW/(datasets.length+0.5),24);
  const gap=bW*0.25;

  ctx.font='10px DM Sans,system-ui,sans-serif';
  for(let i=0;i<=4;i++) {
    const y=PAD.top+cH-(i/4)*cH;
    ctx.strokeStyle=C.border; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(PAD.left,y); ctx.lineTo(PAD.left+cW,y); ctx.stroke();
    const v=(maxV/4)*i;
    ctx.fillStyle=C.text3; ctx.textAlign='right';
    ctx.fillText(v>=1000?(v/1000).toFixed(1)+'k':v.toFixed(0),PAD.left-4,y+3);
  }

  datasets.forEach((ds,di)=>{
    ctx.fillStyle=ds.color;
    ds.data.forEach((v,i)=>{
      const bH=v>0?(v/maxV)*cH:0;
      const x=PAD.left+i*gW+(gW-datasets.length*(bW+gap))/2+di*(bW+gap);
      const y=PAD.top+cH-bH;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(x,y,bW,Math.max(bH,2),[3,3,0,0]);
      else ctx.rect(x,y,bW,Math.max(bH,2));
      ctx.fill();
    });
  });

  ctx.fillStyle=C.text3; ctx.textAlign='center';
  labels.forEach((l,i)=>ctx.fillText(l,PAD.left+i*gW+gW/2,H-6));

  let lx=PAD.left;
  datasets.forEach(ds=>{
    ctx.fillStyle=ds.color; ctx.fillRect(lx,4,9,9);
    ctx.fillStyle=C.text2; ctx.textAlign='left';
    ctx.fillText(ds.label,lx+13,12);
    lx+=ctx.measureText(ds.label).width+26;
  });
}

function drawLineChart(id,labels,data,color) {
  const canvas=document.getElementById(id);
  if(!canvas) return;
  resizeCanvas(canvas);
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  const C=getThemeColors();
  const PAD={top:16,right:14,bottom:40,left:52};
  const cW=W-PAD.left-PAD.right,cH=H-PAD.top-PAD.bottom;
  ctx.clearRect(0,0,W,H);
  const minV=Math.min(...data,0),maxV=Math.max(...data,1);
  const range=maxV-minV||1;
  const n=data.length;

  ctx.font='10px DM Sans,system-ui,sans-serif';
  for(let i=0;i<=4;i++) {
    const y=PAD.top+cH-(i/4)*cH;
    const v=minV+(range/4)*i;
    ctx.strokeStyle=C.border; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(PAD.left,y); ctx.lineTo(PAD.left+cW,y); ctx.stroke();
    ctx.fillStyle=C.text3; ctx.textAlign='right';
    ctx.fillText(v>=1000?(v/1000).toFixed(1)+'k':v.toFixed(0),PAD.left-4,y+3);
  }

  const pts=data.map((v,i)=>({x:PAD.left+(n<2?cW/2:(i/(n-1))*cW),y:PAD.top+cH-((v-minV)/range)*cH}));
  const grad=ctx.createLinearGradient(0,PAD.top,0,PAD.top+cH);
  grad.addColorStop(0,color+'40'); grad.addColorStop(1,color+'00');
  ctx.fillStyle=grad;
  ctx.beginPath();
  ctx.moveTo(pts[0].x,PAD.top+cH);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x,PAD.top+cH);
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.lineJoin='round';
  ctx.beginPath();
  pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.stroke();

  pts.forEach(p=>{
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=C.bg2; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill();
  });

  ctx.fillStyle=C.text3; ctx.textAlign='center';
  labels.forEach((l,i)=>ctx.fillText(l,pts[i].x,H-6));
}

function drawPieChart(id,labels,data) {
  const canvas=document.getElementById(id);
  if(!canvas) return;
  resizeCanvas(canvas);
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  const C=getThemeColors();
  ctx.clearRect(0,0,W,H);
  if(!data.length||data.every(v=>v===0)){
    ctx.fillStyle=C.text3; ctx.font='12px DM Sans,system-ui,sans-serif'; ctx.textAlign='center';
    ctx.fillText('No expense data for this period',W/2,H/2); return;
  }
  const COLORS=['#6ee7b7','#60a5fa','#a78bfa','#fb923c','#f87171','#fbbf24','#34d399','#818cf8'];
  const total=data.reduce((a,b)=>a+b,0);
  const r=Math.min(W,H)*0.30;
  const cx=W*0.34,cy=H/2;
  let ang=-Math.PI/2;
  data.forEach((v,i)=>{
    const slice=(v/total)*Math.PI*2;
    ctx.fillStyle=COLORS[i%COLORS.length];
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,ang,ang+slice); ctx.closePath(); ctx.fill();
    ang+=slice;
  });
  ctx.fillStyle=C.bg2;
  ctx.beginPath(); ctx.arc(cx,cy,r*0.55,0,Math.PI*2); ctx.fill();

  const lgX=W*0.63,lh=17,sy=cy-(data.length*lh)/2;
  data.slice(0,8).forEach((v,i)=>{
    const y=sy+i*lh;
    const pct=Math.round((v/total)*100);
    ctx.fillStyle=COLORS[i%COLORS.length]; ctx.fillRect(lgX,y+2,8,8);
    ctx.fillStyle=C.text2; ctx.font='10px DM Sans,system-ui,sans-serif'; ctx.textAlign='left';
    const lbl=labels[i].length>11?labels[i].slice(0,11)+'…':labels[i];
    ctx.fillText(`${lbl} ${pct}%`,lgX+12,y+10);
  });
}

/* ===== EXPORT / IMPORT ===== */
async function exportData() {
  const data={version:APP_VERSION,exportedAt:new Date().toISOString(),funds:state.funds,transactions:state.transactions};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`moneyflow-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('Data exported');
}

async function importData(file) {
  try {
    const text=await file.text();
    const data=JSON.parse(text);
    if(!data.funds||!data.transactions){toast('Invalid file format','error');return;}
    await dbClear('funds'); await dbClear('transactions');
    for(const f of data.funds) await dbPut('funds',f);
    for(const t of data.transactions) await dbPut('transactions',t);
    await loadAll(); renderDashboard();
    toast(`Imported ${data.funds.length} funds, ${data.transactions.length} transactions`);
  } catch(e) { toast('Import failed: '+e.message,'error'); }
}

/* ===== SERVICE WORKER ===== */
async function registerSW() {
  if('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('service-worker.js'); }
    catch(e) { console.warn('[SW]',e); }
  }
}

/* ===== EVENTS ===== */
function bindEvents() {
  document.querySelectorAll('.nav-item[data-page]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();navigateTo(a.dataset.page);}));
  document.querySelectorAll('[data-page]:not(.nav-item)').forEach(btn=>btn.addEventListener('click',()=>navigateTo(btn.dataset.page)));

  document.getElementById('menuToggle').addEventListener('click',openMobileSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click',closeMobileSidebar);
  document.getElementById('addBtnMobile').addEventListener('click',()=>{
    const active=document.querySelector('.page.active');
    if(active&&active.id==='page-funds')        openAddFund();
    if(active&&active.id==='page-transactions') openAddTransaction();
  });

  document.getElementById('themeToggle').addEventListener('click',toggleTheme);
  document.getElementById('exportBtn').addEventListener('click',exportData);
  document.getElementById('importFile').addEventListener('change',e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value='';});

  document.getElementById('overlay').addEventListener('click',closeAllModals);
  document.querySelectorAll('.modal-close').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.modal)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAllModals();});

  document.getElementById('addFundBtn').addEventListener('click',openAddFund);
  document.getElementById('saveFundBtn').addEventListener('click',saveFund);
  document.getElementById('addTxBtn').addEventListener('click',openAddTransaction);
  document.getElementById('saveTxBtn').addEventListener('click',saveTransaction);

  document.querySelectorAll('.type-btn').forEach(btn=>btn.addEventListener('click',()=>{
    txType=btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b=>b.classList.toggle('active',b.dataset.type===txType));
  }));

  document.getElementById('confirmDeleteBtn').addEventListener('click',async()=>{
    if(state.deleteCallback){await state.deleteCallback();state.deleteCallback=null;}
    closeModal('modalConfirm');
  });

  document.getElementById('summaryTabs').addEventListener('click',e=>{
    const pill=e.target.closest('.tab-pill');
    if(!pill) return;
    document.querySelectorAll('#summaryTabs .tab-pill').forEach(p=>p.classList.remove('active'));
    pill.classList.add('active');
    state.summaryPeriod=pill.dataset.period;
    renderSummary(state.summaryPeriod);
  });

  document.getElementById('analyticsTabs').addEventListener('click',e=>{
    const pill=e.target.closest('.tab-pill');
    if(!pill) return;
    document.querySelectorAll('#analyticsTabs .tab-pill').forEach(p=>p.classList.remove('active'));
    pill.classList.add('active');
    state.analyticsPeriod=pill.dataset.analytics;
    renderAnalytics();
  });

  ['txSearch','filterCategory','filterFund','filterType','filterDateFrom','filterDateTo'].forEach(id=>{
    document.getElementById(id).addEventListener('input',renderTransactions);
    document.getElementById(id).addEventListener('change',renderTransactions);
  });
  document.getElementById('clearFiltersBtn').addEventListener('click',()=>{
    ['txSearch','filterCategory','filterFund','filterType','filterDateFrom','filterDateTo'].forEach(id=>document.getElementById(id).value='');
    renderTransactions();
  });

  let rTimer;
  window.addEventListener('resize',()=>{
    clearTimeout(rTimer);
    rTimer=setTimeout(()=>{if(document.querySelector('.page.active#page-analytics'))renderAnalytics();},150);
  });
}

/* ===== INIT ===== */
async function init() {
  await registerSW();
  await initDB();
  const savedTheme=await getSetting('theme','dark');
  await applyTheme(savedTheme);
  await loadAll();
  bindEvents();
  renderDashboard();
  setTimeout(()=>{
    document.getElementById('splash').classList.add('fade-out');
    document.getElementById('app').classList.remove('hidden');
    setTimeout(()=>document.getElementById('splash').style.display='none',400);
  },600);
}

window.editFund          = editFund;
window.deleteFundConfirm = deleteFundConfirm;
window.editTransaction   = editTransaction;
window.deleteTxConfirm   = deleteTxConfirm;

document.addEventListener('DOMContentLoaded',init);

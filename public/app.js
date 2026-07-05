const $ = (s) => document.querySelector(s);
const app = $('#app');
let state = null;
let page = location.pathname.startsWith('/admin') ? 'admin' : 'home';
let adminTab = 'dashboard';
let selectedCategory = '全部';
let selectedPoolId = null;
let cart = JSON.parse(localStorage.ww_cart || '[]');
let user = JSON.parse(localStorage.ww_user || 'null');

function money(n) { return '$' + Number(n || 0).toLocaleString('zh-TW'); }
function coin(n) { return Number(n || 0).toLocaleString('zh-TW') + ' 代幣'; }
function dateText(v) { return v ? new Date(v).toLocaleString('zh-TW', { hour12: false }) : '-'; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
async function api(path, opt = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opt.admin ? { 'x-admin-password': localStorage.ww_admin || '' } : {}) };
  const res = await fetch(path, { ...opt, headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || '系統連線異常');
  return data;
}
async function load() {
  state = await api('/api/state');
  if (user) {
    try {
      const me = await api('/api/me/' + user.id);
      user = me.customer;
      localStorage.ww_user = JSON.stringify(user);
    } catch (_) { user = null; localStorage.removeItem('ww_user'); }
  }
  render();
}
function go(p) {
  page = p;
  history.replaceState(null, '', p === 'admin' ? '/admin' : '/');
  render();
  scrollTo({ top: 0, behavior: 'smooth' });
}
function nav() {
  const items = [ ['home','🏠','首頁'], ['oripa','🎯','抽賞'], ['shop','🛍️','商城'], ['member','👤','會員'], ['support','💬','客服'] ];
  return `<nav class="tabs">${items.map(([id,icon,label]) => `<button class="tab ${page===id?'active':''}" onclick="go('${id}')"><i>${icon}</i>${label}</button>`).join('')}</nav>`;
}
function shell(html) { return `<main class="app"><div class="mobile-frame">${topbar()}${nav()}${html}</div></main>`; }
function topbar() {
  return `<div class="topbar"><div class="brand"><div class="logo">🌀</div><div><b class="spark">${state.settings.brand}</b><div class="mini">戰鬥陀螺線上一番賞</div></div></div><button class="wallet" onclick="go('member')"><span class="coin"></span><b>${user ? coin(user.coins) : '登入會員'}</b></button></div>`;
}
function marquee() {
  const wins = state.latestWins.length ? state.latestWins.map(w => `🎉 ${w.customerName} 抽中 ${w.rank} ${w.prizeName}`).join('　　') : '🎁 歡迎加入萬萬沒想到，登入會員領取 300 代幣體驗。';
  return `<div class="marquee"><span>${wins}　　${wins}</span></div>`;
}
function hero() {
  const b = state.banners[0];
  return `<section class="hero"><span class="kicker">ONLINE KUJI · 每抽必中 · 庫存透明</span><h1>${state.settings.campaignName.replace('｜','<br>').replace('第 1 彈','<em>第 1 彈</em>')}</h1><p>${state.settings.notice}</p><div class="row" style="justify-content:flex-start"><button class="btn gold" onclick="go('oripa')">立即挑戰</button><button class="btn alt" onclick="openTopup()">儲值代幣</button></div><div class="hero-art"><div class="toy"><img src="${b.image}" alt=""></div><div class="toy"><img src="/assets/products/ux09.svg" alt=""></div></div></section>`;
}
function quickActions() {
  const items = [ ['🎯','本期賞池','oripa'], ['🛍️','商品商城','shop'], ['🪙','儲值代幣','topup'], ['📦','出貨進度','member'], ['🏆','中獎紀錄','member'], ['💬','客服專區','support'] ];
  return `<div class="quick-actions">${items.map(([i,t,p]) => `<button class="qa" onclick="${p==='topup'?'openTopup()':`go('${p}')`}"><i>${i}</i><b>${t}</b></button>`).join('')}</div>`;
}
function section(title, right='', body='') { return `<section class="section"><div class="section-head"><h2>${title}</h2>${right}</div>${body}</section>`; }
function poolProgress(pool) {
  const pct = pool.initialTickets ? Math.max(0, Math.min(100, Math.round(pool.remainingTickets / pool.initialTickets * 100))) : 0;
  return `<div class="progress"><i style="width:${pct}%"></i></div>`;
}
function poolCard(pool, compact=false) {
  const aStock = pool.prizes.find(p => p.rank === 'A賞')?.stock ?? 0;
  const last = pool.lastOneEnabled && pool.lastOnePrize ? `<span class="badge">最後賞 ${pool.lastOnePrize.stock>0?'待解鎖':'已中出'}</span>` : `<span class="badge">一般賞池</span>`;
  return `<article class="pool-card ${pool.featured?'featured':''}"><div class="pool-cover"><img src="${pool.cover}" alt="${pool.title}"><span class="badge">${pool.category}</span><span class="badge remain">剩 ${pool.remainingTickets} 抽</span></div><div class="pool-body"><h3 class="pool-title">${pool.title}</h3><div class="sub">${pool.subtitle}</div><div class="pool-meta"><div class="metric"><b>${coin(pool.priceCoins).replace(' 代幣','')}</b><small>每抽</small></div><div class="metric"><b>${aStock}</b><small>A賞剩餘</small></div><div class="metric"><b>${pool.remainingTickets}</b><small>總剩餘</small></div></div>${poolProgress(pool)}<div class="row" style="margin-top:12px"><div>${last}</div><button class="btn small ${pool.soldOut?'alt':''}" ${pool.soldOut?'disabled':''} onclick="openPool('${pool.id}')">${pool.soldOut?'Sold out':'看賞池'}</button></div></div></article>`;
}
function productCard(p) {
  return `<article class="product"><div class="product-img"><img src="${p.image}" alt="${p.name}"><span class="badge">${p.tag||p.category}</span></div><div class="product-body"><h3 class="product-title">${p.name}</h3><div class="sub">${p.description || p.category}</div><div class="row" style="margin-top:10px"><span class="price">${money(p.price)}</span><span class="badge ${p.stock<=0?'tag-danger':''}">${p.stock>0?'庫存 '+p.stock:'Sold out'}</span></div><button class="btn small" style="width:100%;margin-top:10px" ${p.soldOut||p.stock<=0?'disabled':''} onclick="addCart('${p.id}')">加入購物車</button></div></article>`;
}
function home() {
  const pools = state.pools.filter(p => p.featured).map(p => poolCard(p)).join('');
  const products = state.products.filter(p => p.category !== '儲值').slice(0,4).map(productCard).join('');
  const announcements = state.announcements.map(a => `<div class="record-card"><b>${a.title}</b><div class="sub">${a.body}</div></div>`).join('');
  app.innerHTML = shell(`${marquee()}${hero()}${quickActions()}${section('主打賞池', '<button class="btn small alt" onclick="go(\'oripa\')">全部賞池</button>', `<div class="pool-grid">${pools}</div>`)}${section('熱門商品', '<button class="btn small alt" onclick="go(\'shop\')">逛商城</button>', `<div class="grid">${products}</div>`)}${section('最新公告', '', `<div class="stack">${announcements}</div>`)}`);
}
function categoryChips() {
  return `<div class="chips">${state.categories.map(c => `<button class="chip ${selectedCategory===c?'active':''}" onclick="selectedCategory='${c}';render()">${c}</button>`).join('')}</div>`;
}
function oripa() {
  const pools = state.pools.filter(p => selectedCategory === '全部' || p.category === selectedCategory).map(p => poolCard(p)).join('') || `<div class="empty">此分類目前沒有賞池。</div>`;
  app.innerHTML = shell(`${marquee()}${section('線上一番賞', '<button class="btn small gold" onclick="openTopup()">儲值</button>', `${categoryChips()}<div class="pool-grid">${pools}</div>`)}`);
}
function shop() {
  const products = state.products.filter(p => selectedCategory === '全部' || p.category === selectedCategory || (selectedCategory==='戰鬥陀螺' && p.category==='限定賞')).map(productCard).join('');
  app.innerHTML = shell(`${section('商品商城', `<button class="btn small gold" onclick="openCart()">購物車 ${cart.reduce((s,i)=>s+i.qty,0)}</button>`, `${categoryChips()}<div class="grid">${products}</div>`)}`);
}
function support() {
  app.innerHTML = shell(`<section class="hero"><span class="kicker">客服與活動說明</span><h1>怎麼玩？</h1><p>登入會員 → 儲值代幣或購買商品 → 選擇賞池 → 抽中實體獎項後填寫寄件資料。後台確認付款與出貨後，會員中心可查詢進度。</p></section>${section('常見問題','',`<div class="stack"><div class="record-card"><b>抽中實體獎品怎麼領？</b><div class="sub">請到會員中心填寫收件人、手機、縣市、地址或超商資料。</div></div><div class="record-card"><b>庫存會不會超抽？</b><div class="sub">系統抽中獎項時會即時扣減獎項庫存，庫存為 0 的獎項不會再抽出。</div></div><div class="record-card"><b>付款方式？</b><div class="sub">目前封包內建銀行匯款與金流 Webhook 預留；正式營運可接綠界、藍新、LINE Pay。</div></div></div>`)}`);
}
function member() {
  if (!user) {
    app.innerHTML = shell(`<section class="hero"><span class="kicker">會員登入</span><h1>登入後開始抽賞</h1><p>支援平台帳號，Google / Apple / LINE 登入入口已預留。正式上線需填 OAuth 參數。</p></section><section class="section"><div class="admin-card"><div class="form-grid"><input id="regName" class="input" placeholder="姓名 / 暱稱"><input id="regPhone" class="input" placeholder="手機"><input id="regEmail" class="input" placeholder="Email"><select id="regProvider" class="select"><option value="platform">平台帳號</option><option value="google">Google 帳號</option><option value="apple">Apple 帳號</option><option value="line">LINE 帳號</option></select></div><button class="btn gold" style="width:100%;margin-top:12px" onclick="register()">建立 / 登入會員</button><div class="footer-note">Demo 模式會直接建立會員並贈送 300 代幣，方便測試完整流程。</div></div></section>`);
    return;
  }
  Promise.resolve(api('/api/me/' + user.id)).then(me => {
    const today = new Date().toISOString().slice(0,10);
    const todayOrders = me.orders.filter(o => o.createdAt?.startsWith(today));
    const draws = me.draws.map(d => `<div class="record-card row"><img src="${d.prizeImage}" alt=""><div style="flex:1"><b>${d.rank}｜${d.prizeName}</b><div class="sub">${d.poolTitle} · ${dateText(d.createdAt)}</div></div><span class="badge">${d.status}</span></div>`).join('') || `<div class="empty">尚無抽賞紀錄。</div>`;
    const orders = todayOrders.map(o => `<div class="record-card"><div class="row"><b>${o.id}</b><span class="badge">${o.status}</span></div><div class="sub">${o.items.map(i=>i.name+' x'+i.qty).join('、')}</div><div class="row"><span>${dateText(o.createdAt)}</span><b>${money(o.total)}</b></div></div>`).join('') || `<div class="empty">今天尚無消費紀錄。</div>`;
    const shipments = me.shipments.map(s => `<div class="record-card row"><img src="${s.prizeImage}" alt=""><div style="flex:1"><b>${s.prizeName}</b><div class="sub">${s.status}${s.trackingNo?' · '+s.trackingNo:''}</div></div>${s.status==='待填地址'?`<button class="btn small" onclick="openShipping('${s.drawId}')">填地址</button>`:''}</div>`).join('') || `<div class="empty">尚無待出貨獎品。</div>`;
    app.innerHTML = shell(`<section class="hero"><span class="kicker">${me.customer.level} 會員</span><h1>${me.customer.name || '會員'}，歡迎回來</h1><p>目前餘額：${coin(me.customer.coins)}｜點數：${me.customer.points}</p><div class="row" style="justify-content:flex-start"><button class="btn gold" onclick="openTopup()">儲值代幣</button><button class="btn alt" onclick="logout()">登出</button></div></section>${section('今天消費內容','',`<div class="history">${orders}</div>`)}${section('中獎 / 抽賞紀錄','',`<div class="history">${draws}</div>`)}${section('寄送與出貨','',`<div class="history">${shipments}</div>`)}`);
  }).catch(e => toast(e.message));
}
function render() {
  if (!state) return;
  if (page === 'home') return home();
  if (page === 'oripa') return oripa();
  if (page === 'shop') return shop();
  if (page === 'member') return member();
  if (page === 'support') return support();
  if (page === 'admin') return admin();
}
async function register() {
  try {
    const payload = { name: $('#regName').value, phone: $('#regPhone').value, email: $('#regEmail').value, provider: $('#regProvider').value };
    const c = await api('/api/auth/register', { method: 'POST', body: payload });
    user = c; localStorage.ww_user = JSON.stringify(c); toast('登入成功，已贈送體驗代幣'); await load(); page='member'; render();
  } catch (e) { toast(e.message); }
}
function logout() { localStorage.removeItem('ww_user'); user = null; render(); }
function addCart(id) {
  if (!user) return go('member');
  const item = cart.find(i => i.productId === id);
  if (item) item.qty += 1; else cart.push({ productId: id, qty: 1 });
  localStorage.ww_cart = JSON.stringify(cart); toast('已加入購物車');
}
function openCart() {
  if (!user) return go('member');
  const rows = cart.map(i => {
    const p = state.products.find(x => x.id === i.productId);
    return p ? `<div class="record-card row"><img src="${p.image}"><div style="flex:1"><b>${p.name}</b><div class="sub">${money(p.price)} x ${i.qty}</div></div><button class="btn small alt" onclick="removeCart('${p.id}')">移除</button></div>` : '';
  }).join('') || '<div class="empty">購物車是空的。</div>';
  const total = cart.reduce((s,i)=>{const p=state.products.find(x=>x.id===i.productId); return s + (p? p.price*i.qty : 0)},0);
  modal(`<button class="x" onclick="closeModal()">×</button><h2>購物車</h2><div class="stack">${rows}</div><div class="row" style="margin-top:12px"><b>合計</b><b>${money(total)}</b></div><button class="btn gold" style="width:100%;margin-top:12px" ${cart.length?'':'disabled'} onclick="checkout()">建立付款單</button>`);
}
function removeCart(id) { cart = cart.filter(i => i.productId !== id); localStorage.ww_cart = JSON.stringify(cart); closeModal(); openCart(); }
async function checkout() {
  try {
    const result = await api('/api/orders', { method: 'POST', body: { customerId: user.id, items: cart, paymentMethod: 'bank' } });
    cart = []; localStorage.ww_cart = '[]';
    closeModal(); await load();
    modal(`<button class="x" onclick="closeModal()">×</button><h2>付款單已建立</h2><div class="record-card"><b>${result.order.id}</b><div class="sub">金額 ${money(result.order.total)}</div><div class="sub">${result.bankAccount}</div></div><p class="footer-note">匯款完成後由後台確認付款，商品庫存會在確認付款時扣減。</p><button class="btn" style="width:100%" onclick="closeModal();go('member')">查看紀錄</button>`);
  } catch (e) { toast(e.message); }
}
function openTopup() {
  if (!user) return go('member');
  modal(`<button class="x" onclick="closeModal()">×</button><h2>儲值代幣</h2><p class="sub">建立付款單後，後台確認付款才會入帳。</p><div class="grid">${[300,500,1000,2000].map(v=>`<button class="qa" onclick="topup(${v})"><i>🪙</i><b>${v} 代幣</b><div class="sub">${money(v)}</div></button>`).join('')}</div>`);
}
async function topup(amount) {
  try {
    const r = await api('/api/wallet/topup', { method:'POST', body:{ customerId:user.id, amount, method:'bank' } });
    closeModal(); await load();
    modal(`<button class="x" onclick="closeModal()">×</button><h2>儲值付款單</h2><div class="record-card"><b>${r.order.id}</b><div class="sub">金額 ${money(r.order.total)}</div><div class="sub">${r.bankAccount}</div></div><button class="btn" style="width:100%" onclick="closeModal();go('member')">查看會員中心</button>`);
  } catch(e) { toast(e.message); }
}
function openPool(id) {
  selectedPoolId = id;
  const pool = state.pools.find(p => p.id === id);
  const prizes = pool.prizes.map(p => `<div class="prize-pill"><img src="${p.image}"><b>${p.rank}</b><div class="sub">${p.name}</div><span class="badge">剩 ${p.stock}</span></div>`).join('');
  const last = pool.lastOneEnabled && pool.lastOnePrize ? `<div class="record-card row"><img src="${pool.lastOnePrize.image}"><div style="flex:1"><b>最後賞｜${pool.lastOnePrize.name}</b><div class="sub">一般獎項抽完後解鎖</div></div><span class="badge">${pool.lastOnePrize.stock>0?'待解鎖':'已中出'}</span></div>` : '';
  modal(`<button class="x" onclick="closeModal()">×</button><h2>${pool.title}</h2><p class="sub">${pool.subtitle}</p><div class="scratch-stage"><div class="scratch-card"><div class="scratch-result"><div class="rank">?</div><div class="name">準備挑戰</div><button class="btn gold" style="margin-top:14px" ${pool.soldOut?'disabled':''} onclick="draw('${pool.id}')">${pool.soldOut?'Sold out':coin(pool.priceCoins)+' 抽一次'}</button></div></div><div><div class="row"><span class="badge">剩 ${pool.remainingTickets} 抽</span><span class="badge">A賞剩 ${pool.prizes.find(p=>p.rank==='A賞')?.stock||0}</span></div><div style="margin:12px 0">${poolProgress(pool)}</div>${last}<h3>獎項庫存</h3><div class="prize-strip">${prizes}</div></div></div>`);
}
async function draw(poolId) {
  try {
    if (!user) { closeModal(); return go('member'); }
    const r = await api(`/api/pools/${poolId}/draw`, { method:'POST', body:{ customerId:user.id } });
    user = r.customer; localStorage.ww_user = JSON.stringify(user);
    closeModal(); await load();
    modal(`<button class="x" onclick="closeModal()">×</button><div class="scratch-stage"><div class="scratch-card"><div class="scratch-result"><div class="rank">${r.draw.rank}</div><div class="name">${r.draw.prizeName}</div></div></div><div><h2>恭喜中獎</h2><p class="sub">已自動扣減獎項庫存，庫存為 0 的獎項不會再被抽出。</p>${r.draw.isPhysical?`<button class="btn gold" onclick="openShipping('${r.draw.id}')">填寫寄件資料</button>`:`<button class="btn" onclick="closeModal()">完成</button>`}</div></div>`);
  } catch(e) { toast(e.message); }
}
function openShipping(drawId) {
  modal(`<button class="x" onclick="closeModal()">×</button><h2>中獎寄件資料</h2><div class="form-grid"><input id="shipReceiver" class="input" placeholder="收件人姓名"><input id="shipPhone" class="input" placeholder="手機"><input id="shipZip" class="input" placeholder="郵遞區號"><input id="shipCity" class="input" placeholder="縣市"><input id="shipDistrict" class="input" placeholder="區域"><input id="shipStore" class="input" placeholder="超商門市，可留空"></div><textarea id="shipAddress" class="textarea" style="margin-top:10px" placeholder="詳細地址"></textarea><button class="btn gold" style="width:100%;margin-top:12px" onclick="saveShipping('${drawId}')">送出資料</button>`);
}
async function saveShipping(drawId) {
  try {
    await api('/api/shipping', { method:'POST', body:{ drawId, receiver:$('#shipReceiver').value, phone:$('#shipPhone').value, zipcode:$('#shipZip').value, city:$('#shipCity').value, district:$('#shipDistrict').value, address:$('#shipAddress').value, storeName:$('#shipStore').value }});
    closeModal(); await load(); toast('寄件資料已送出'); go('member');
  } catch(e) { toast(e.message); }
}
function modal(html) { document.body.insertAdjacentHTML('beforeend', `<div class="modal" onclick="if(event.target.className==='modal')closeModal()"><div class="sheet">${html}</div></div>`); }
function closeModal() { const m = document.querySelector('.modal'); if (m) m.remove(); }

async function admin() {
  const pass = localStorage.ww_admin;
  if (!pass) {
    app.innerHTML = `<main class="admin-layout"><div class="hero" style="max-width:520px;margin:80px auto"><span class="kicker">後台登入</span><h1>營運控制台</h1><p>輸入後台密碼後可管理付款、庫存、賞池、出貨。</p><input id="adminPass" class="input" placeholder="後台密碼" type="password"><button class="btn gold" style="width:100%;margin-top:12px" onclick="adminLogin()">登入</button></div></main>`;
    return;
  }
  try {
    const d = await api('/api/admin/dashboard', { admin:true });
    app.innerHTML = `<main class="admin-layout"><div class="admin-top"><div class="brand"><div class="logo">⚙️</div><div><b class="spark">V6 營運後台</b><div class="mini">商品 · 賞池 · 金流 · 出貨 · 庫存</div></div></div><button class="btn alt small" onclick="localStorage.removeItem('ww_admin');render()">登出</button></div><div class="admin-shell"><aside class="side">${['dashboard','payments','orders','products','pools','shipping','members','logs'].map(t=>`<button class="${adminTab===t?'active':''}" onclick="adminTab='${t}';render()">${adminLabel(t)}</button>`).join('')}</aside><section>${adminContent(d)}</section></div></main>`;
  } catch(e) { localStorage.removeItem('ww_admin'); toast(e.message); render(); }
}
function adminLabel(t) { return ({dashboard:'總覽 Dashboard',payments:'付款確認',orders:'訂單紀錄',products:'商品 / 庫存',pools:'賞池管理',shipping:'出貨管理',members:'會員 CRM',logs:'操作 Logs'})[t]; }
function adminContent(d) {
  if (adminTab === 'dashboard') {
    const statsHtml = [
      stat('今日營收', money(d.stats.revenueToday)),
      stat('今日訂單', d.stats.ordersToday),
      stat('今日抽數', d.stats.drawsToday),
      stat('會員數', d.stats.members),
      stat('待付款', d.stats.pendingPayments),
      stat('待出貨', d.stats.pendingShipments)
    ].join('');
    return `<div class="stats">${statsHtml}</div><div class="admin-grid" style="margin-top:14px"><div class="admin-card"><h2>低庫存警示</h2>${[...d.lowStock.products.map(p=>p.name+'：'+p.stock),...d.lowStock.prizes.map(p=>p.poolTitle+' / '+p.rank+'：'+p.stock)].slice(0,12).map(x=>`<div class="record-card">${x}</div>`).join('')||'<div class="empty">目前無低庫存警示。</div>'}</div><div class="admin-card"><h2>AI 營運摘要</h2><p class="sub">今日重點：待付款 ${d.stats.pendingPayments} 筆、待出貨 ${d.stats.pendingShipments} 筆。建議優先確認付款與補足低庫存獎項，避免賞池 Sold out 造成轉換流失。</p></div></div>`;
  }
  if (adminTab === 'payments') return table(['付款單','會員','金額','方式','狀態','時間','操作'], d.payments.map(p => [p.id,p.customerName,money(p.amount),p.method,status(p.status),dateText(p.createdAt),p.status==='pending'?`<button class="btn small gold" onclick="confirmPay('${p.id}')">確認付款</button>`:'-']));
  if (adminTab === 'orders') return table(['訂單','會員','類型','內容','金額','狀態','時間'], d.orders.map(o => [o.id,o.customerName,o.type,(o.items||[]).map(i=>i.name+' x'+i.qty).join('、'),money(o.total),status(o.status),dateText(o.createdAt)]));
  if (adminTab === 'products') return `<div class="admin-card"><h2>新增商品</h2><div class="form-grid"><input id="pName" class="input" placeholder="商品名稱"><input id="pPrice" class="input" placeholder="價格"><input id="pStock" class="input" placeholder="庫存"><input id="pCat" class="input" placeholder="分類"><input id="pTag" class="input" placeholder="標籤"><input id="pImg" class="input" placeholder="圖片網址，可留空"></div><button class="btn gold" style="margin-top:10px" onclick="addProductAdmin()">新增商品</button></div>` + table(['商品','分類','價格','庫存','狀態'], d.products.map(p => [p.name,p.category,money(p.price),p.stock,p.soldOut?'<span class="tag-danger">Sold out</span>':'<span class="tag-ok">販售中</span>']));
  if (adminTab === 'pools') return d.pools.map(p => `<div class="admin-card" style="margin-bottom:12px"><div class="row"><div><h2>${p.title}</h2><div class="sub">${p.subtitle}</div></div><span class="badge">${p.status}</span></div><div class="prize-strip" style="margin-top:12px">${p.prizes.map(x=>`<div class="prize-pill"><img src="${x.image}"><b>${x.rank}</b><div class="sub">${x.name}</div><span class="badge">剩 ${x.stock}</span></div>`).join('')}</div></div>`).join('');
  if (adminTab === 'shipping') return table(['出貨單','會員','獎品','狀態','收件人','地址','物流','操作'], d.shipments.map(s => [s.id,s.customerName,s.prizeName,status(s.status),s.receiver||'-',[s.zipcode,s.city,s.district,s.address,s.storeName].filter(Boolean).join(' '),s.trackingNo||'-',`<button class="btn small" onclick="shipUpdate('${s.id}')">更新</button>`]));
  if (adminTab === 'members') return table(['會員','手機','Email','代幣','點數','等級','加入時間'], d.customers.map(c => [c.name,c.phone,c.email,c.coins,c.points,c.level,dateText(c.createdAt)]));
  if (adminTab === 'logs') return table(['時間','類型','訊息'], d.logs.map(l => [dateText(l.time),l.type,l.message]));
}
function stat(label, value) { return `<div class="stat"><div class="mini">${label}</div><b>${value}</b></div>`; }
function status(s) { const cls = s==='paid'||s==='已出貨'||s==='completed' ? 'tag-ok' : (s==='pending'||s==='待出貨'||s==='待填地址' ? 'tag-warn' : ''); return `<span class="${cls}">${s}</span>`; }
function table(head, rows) { return `<div class="table-wrap"><table class="table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function adminLogin() { localStorage.ww_admin = $('#adminPass').value; render(); }
async function confirmPay(id) { try { await api('/api/admin/payments/'+id+'/confirm', { method:'POST', admin:true, body:{ note:'後台確認' }}); toast('已確認付款'); render(); } catch(e) { toast(e.message); } }
async function addProductAdmin() { try { await api('/api/admin/products', { method:'POST', admin:true, body:{ name:$('#pName').value, price:$('#pPrice').value, stock:$('#pStock').value, category:$('#pCat').value, tag:$('#pTag').value, image:$('#pImg').value || '/assets/products/mystery.svg' }}); toast('已新增商品'); render(); } catch(e){toast(e.message)} }
function shipUpdate(id) { modal(`<button class="x" onclick="closeModal()">×</button><h2>更新出貨</h2><input id="sStatus" class="input" placeholder="狀態，例如 已出貨"><input id="sTracking" class="input" placeholder="物流單號"><button class="btn gold" style="width:100%;margin-top:12px" onclick="saveShipAdmin('${id}')">儲存</button>`); }
async function saveShipAdmin(id) { try { await api('/api/admin/shipments/'+id, { method:'PATCH', admin:true, body:{ status:$('#sStatus').value || '已出貨', trackingNo:$('#sTracking').value }}); closeModal(); toast('已更新出貨'); render(); } catch(e) { toast(e.message); } }

load().catch(e => { app.innerHTML = `<main class="app"><div class="empty">${e.message}</div></main>`; });

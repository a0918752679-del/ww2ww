import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '3mb' }));
app.use(morgan('tiny'));
app.use(express.static(path.join(__dirname, 'public')));

const todayKey = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));

function readDb() {
  return JSON.parse(readFileSync(DB_FILE, 'utf8'));
}
function saveDb(db) {
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function addLog(db, type, message, meta = {}) {
  db.logs = db.logs || [];
  db.logs.unshift({ id: uuid(), time: now(), type, message, meta });
  db.logs = db.logs.slice(0, 800);
}
function requireAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass !== (process.env.ADMIN_PASSWORD || '69677323')) {
    return res.status(401).json({ error: '後台密碼錯誤或未登入' });
  }
  next();
}
function getCustomer(db, id) {
  return db.customers.find((c) => c.id === id);
}
function publicState(db) {
  const pools = db.pools.map((p) => {
    const total = p.prizes.reduce((s, x) => s + Number(x.stock || 0), 0) + (p.lastOneEnabled && p.lastOnePrize?.stock > 0 ? 1 : 0);
    const initial = p.prizes.reduce((s, x) => s + Number(x.initialStock || x.stock || 0), 0) + (p.lastOneEnabled ? 1 : 0);
    return { ...p, remainingTickets: total, initialTickets: initial, soldOut: p.status !== 'active' || total <= 0 };
  });
  const latestWins = db.draws.slice(0, 12).map((d) => ({ id: d.id, customerName: d.customerName || '玩家', rank: d.rank, prizeName: d.prizeName, createdAt: d.createdAt }));
  return {
    settings: { ...db.settings, bankAccount: process.env.BANK_ACCOUNT || db.settings.bankAccount },
    banners: db.banners,
    categories: db.categories,
    products: db.products,
    pools,
    announcements: db.announcements,
    latestWins,
    stats: {
      members: db.customers.length,
      drawsToday: db.draws.filter((d) => d.createdAt?.startsWith(todayKey())).length,
      ordersToday: db.orders.filter((o) => o.createdAt?.startsWith(todayKey())).length,
      paidRevenueToday: db.orders.filter((o) => o.status === 'paid' && o.createdAt?.startsWith(todayKey())).reduce((s, o) => s + Number(o.total || 0), 0)
    }
  };
}
function calcOrderTotal(db, items) {
  let total = 0;
  const normalized = [];
  for (const item of items || []) {
    const product = db.products.find((p) => p.id === item.productId);
    const qty = Math.max(1, Number(item.qty || 1));
    if (!product) throw new Error(`商品不存在：${item.productId}`);
    if (product.soldOut || product.stock < qty) throw new Error(`商品庫存不足：${product.name}`);
    total += Number(product.price || 0) * qty;
    normalized.push({ productId: product.id, name: product.name, price: product.price, qty, image: product.image, category: product.category });
  }
  return { total, normalized };
}
function decrementProductStock(db, order) {
  if (order.stockDeducted) return;
  for (const item of order.items || []) {
    const product = db.products.find((p) => p.id === item.productId);
    if (!product) continue;
    if (product.stock < item.qty) throw new Error(`付款確認失敗，庫存不足：${product.name}`);
    product.stock -= item.qty;
    if (product.stock <= 0) {
      product.stock = 0;
      product.soldOut = true;
    }
  }
  order.stockDeducted = true;
}
function drawPrize(pool) {
  const regular = pool.prizes.filter((p) => Number(p.stock) > 0);
  const remainingRegular = regular.reduce((s, p) => s + Number(p.stock || 0), 0);
  if (pool.lastOneEnabled && pool.lastOnePrize?.stock > 0 && remainingRegular === 0) {
    pool.lastOnePrize.stock -= 1;
    return { ...clone(pool.lastOnePrize), fromLastOne: true };
  }
  if (!regular.length) return null;
  const totalWeight = regular.reduce((s, p) => s + Number(p.weight || 1), 0);
  let r = Math.random() * totalWeight;
  let selected = regular[regular.length - 1];
  for (const prize of regular) {
    r -= Number(prize.weight || 1);
    if (r <= 0) { selected = prize; break; }
  }
  selected.stock -= 1;
  if (selected.stock < 0) selected.stock = 0;
  return clone(selected);
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'wanwan-beyblade-kuji-v6', time: now() }));
app.get('/api/state', (req, res) => res.json(publicState(readDb())));

app.post('/api/auth/register', (req, res) => {
  const db = readDb();
  const { name = '', phone = '', email = '', provider = 'platform', lineUserId = '' } = req.body || {};
  let customer = db.customers.find((c) => (email && c.email === email) || (phone && c.phone === phone) || (lineUserId && c.lineUserId === lineUserId));
  if (!customer) {
    customer = { id: 'CUS' + Date.now(), name, phone, email, provider, lineUserId, avatar: '', coins: 300, points: 0, level: 'Bronze', createdAt: now(), lastLoginAt: now(), tags: ['新會員'] };
    db.customers.unshift(customer);
    addLog(db, 'customer', '新增會員', { id: customer.id, name });
  } else {
    customer.lastLoginAt = now();
  }
  saveDb(db);
  res.json(customer);
});

app.get('/api/me/:customerId', (req, res) => {
  const db = readDb();
  const customer = getCustomer(db, req.params.customerId);
  if (!customer) return res.status(404).json({ error: '查無會員' });
  const orders = db.orders.filter((o) => o.customerId === customer.id);
  const draws = db.draws.filter((d) => d.customerId === customer.id);
  const shipments = db.shipments.filter((s) => s.customerId === customer.id);
  res.json({ customer, orders, draws, shipments });
});

app.post('/api/orders', (req, res) => {
  try {
    const db = readDb();
    const { customerId, items, paymentMethod = 'bank', note = '' } = req.body || {};
    const customer = getCustomer(db, customerId);
    if (!customer) return res.status(404).json({ error: '請先登入會員' });
    const { total, normalized } = calcOrderTotal(db, items);
    const order = { id: 'OD' + Date.now(), customerId, customerName: customer.name, type: 'product', items: normalized, total, paymentMethod, status: 'pending', note, stockDeducted: false, createdAt: now() };
    const payment = { id: 'PAY' + Date.now(), orderId: order.id, customerId, customerName: customer.name, amount: total, method: paymentMethod, status: 'pending', createdAt: now() };
    db.orders.unshift(order);
    db.payments.unshift(payment);
    addLog(db, 'order', '建立商品訂單', { orderId: order.id, total });
    saveDb(db);
    res.json({ order, payment, bankAccount: process.env.BANK_ACCOUNT || db.settings.bankAccount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/wallet/topup', (req, res) => {
  const db = readDb();
  const { customerId, amount = 1000, method = 'bank' } = req.body || {};
  const customer = getCustomer(db, customerId);
  if (!customer) return res.status(404).json({ error: '請先登入會員' });
  const numeric = Math.max(100, Number(amount || 0));
  const order = { id: 'OD' + Date.now(), customerId, customerName: customer.name, type: 'topup', items: [{ name: `${numeric} 代幣儲值`, price: numeric, qty: 1, category: '儲值' }], total: numeric, paymentMethod: method, status: 'pending', coinsGranted: 0, createdAt: now() };
  const payment = { id: 'PAY' + Date.now(), orderId: order.id, customerId, customerName: customer.name, amount: numeric, method, status: 'pending', createdAt: now() };
  db.orders.unshift(order);
  db.payments.unshift(payment);
  addLog(db, 'payment', '建立儲值付款單', { orderId: order.id, amount: numeric });
  saveDb(db);
  res.json({ order, payment, bankAccount: process.env.BANK_ACCOUNT || db.settings.bankAccount });
});

app.post('/api/pools/:poolId/draw', (req, res) => {
  const db = readDb();
  const { customerId } = req.body || {};
  const customer = getCustomer(db, customerId);
  if (!customer) return res.status(404).json({ error: '請先登入會員' });
  const pool = db.pools.find((p) => p.id === req.params.poolId);
  if (!pool || pool.status !== 'active') return res.status(404).json({ error: '賞池不存在或未開放' });
  if (customer.coins < pool.priceCoins) return res.status(400).json({ error: `代幣不足，尚缺 ${pool.priceCoins - customer.coins} 代幣` });
  const prize = drawPrize(pool);
  if (!prize) {
    pool.status = 'soldout';
    saveDb(db);
    return res.status(400).json({ error: '本賞池已售完' });
  }
  customer.coins -= pool.priceCoins;
  customer.points += Math.floor(pool.priceCoins / 10);
  const draw = { id: 'DW' + Date.now(), customerId: customer.id, customerName: customer.name, poolId: pool.id, poolTitle: pool.title, rank: prize.rank, prizeName: prize.name, prizeImage: prize.image, isPhysical: !!prize.physical, status: prize.physical ? 'need_shipping' : 'completed', costCoins: pool.priceCoins, createdAt: now() };
  db.draws.unshift(draw);
  if (prize.physical) {
    db.shipments.unshift({ id: 'SHP' + Date.now(), drawId: draw.id, customerId: customer.id, customerName: customer.name, prizeName: prize.name, prizeImage: prize.image, status: '待填地址', receiver: '', phone: '', zipcode: '', city: '', district: '', address: '', trackingNo: '', createdAt: now() });
  }
  const remaining = pool.prizes.reduce((s, p) => s + Number(p.stock || 0), 0) + (pool.lastOneEnabled && pool.lastOnePrize?.stock > 0 ? 1 : 0);
  if (remaining <= 0) pool.status = 'soldout';
  addLog(db, 'draw', '完成抽賞', { drawId: draw.id, rank: draw.rank, prizeName: draw.prizeName });
  saveDb(db);
  res.json({ draw, prize, customer, pool });
});

app.post('/api/shipping', (req, res) => {
  const db = readDb();
  const { drawId, receiver, phone, zipcode, city, district, address, storeName = '' } = req.body || {};
  const shipment = db.shipments.find((s) => s.drawId === drawId);
  if (!shipment) return res.status(404).json({ error: '查無出貨資料' });
  Object.assign(shipment, { receiver, phone, zipcode, city, district, address, storeName, status: '待出貨', updatedAt: now() });
  const draw = db.draws.find((d) => d.id === drawId);
  if (draw) draw.status = 'shipping_pending';
  addLog(db, 'shipping', '會員填寫寄送資料', { drawId, receiver });
  saveDb(db);
  res.json(shipment);
});

app.post('/api/admin/payments/:id/confirm', requireAdmin, (req, res) => {
  try {
    const db = readDb();
    const payment = db.payments.find((p) => p.id === req.params.id || p.orderId === req.params.id);
    if (!payment) return res.status(404).json({ error: '查無付款單' });
    const order = db.orders.find((o) => o.id === payment.orderId);
    if (!order) return res.status(404).json({ error: '查無訂單' });
    const customer = getCustomer(db, order.customerId);
    if (!customer) return res.status(404).json({ error: '查無會員' });
    if (order.type === 'product') decrementProductStock(db, order);
    if (order.type === 'topup' && !order.coinsGranted) {
      customer.coins += Number(order.total || 0);
      order.coinsGranted = Number(order.total || 0);
    }
    order.status = 'paid';
    order.paidAt = now();
    payment.status = 'paid';
    payment.confirmedAt = now();
    payment.confirmNote = req.body?.note || '後台人工確認';
    addLog(db, 'payment', '確認付款', { paymentId: payment.id, orderId: order.id });
    saveDb(db);
    res.json({ payment, order, customer });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const db = readDb();
  const today = todayKey();
  const todayOrders = db.orders.filter((o) => o.createdAt?.startsWith(today));
  const paidRevenueToday = todayOrders.filter((o) => o.status === 'paid').reduce((s, o) => s + Number(o.total || 0), 0);
  const pendingPayments = db.payments.filter((p) => p.status === 'pending');
  const pendingShipments = db.shipments.filter((s) => ['待填地址', '待出貨'].includes(s.status));
  const lowStockProducts = db.products.filter((p) => Number(p.stock) <= 8);
  const lowStockPrizes = db.pools.flatMap((pool) => pool.prizes.filter((p) => Number(p.stock) <= 3).map((p) => ({ ...p, poolTitle: pool.title })));
  res.json({
    stats: {
      revenueToday: paidRevenueToday,
      ordersToday: todayOrders.length,
      members: db.customers.length,
      drawsToday: db.draws.filter((d) => d.createdAt?.startsWith(today)).length,
      pendingPayments: pendingPayments.length,
      pendingShipments: pendingShipments.length
    },
    customers: db.customers,
    products: db.products,
    pools: db.pools,
    orders: db.orders,
    payments: db.payments,
    draws: db.draws,
    shipments: db.shipments,
    lowStock: { products: lowStockProducts, prizes: lowStockPrizes },
    logs: db.logs
  });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const db = readDb();
  const body = req.body || {};
  const product = { id: body.id || 'prd_' + uuid().slice(0, 8), category: body.category || '戰鬥陀螺', name: body.name || '未命名商品', price: Number(body.price || 0), stock: Number(body.stock || 0), image: body.image || '/assets/products/mystery.svg', tag: body.tag || '新品', soldOut: !!body.soldOut, description: body.description || '' };
  db.products.unshift(product);
  addLog(db, 'product', '後台新增商品', { name: product.name });
  saveDb(db);
  res.json(product);
});

app.patch('/api/admin/products/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: '查無商品' });
  Object.assign(product, req.body || {});
  product.price = Number(product.price || 0);
  product.stock = Number(product.stock || 0);
  if (product.stock <= 0) product.soldOut = true;
  addLog(db, 'product', '後台更新商品', { id: product.id, name: product.name });
  saveDb(db);
  res.json(product);
});

app.post('/api/admin/pools', requireAdmin, (req, res) => {
  const db = readDb();
  const body = req.body || {};
  const pool = { id: body.id || 'pool_' + uuid().slice(0, 8), title: body.title || '新賞池', subtitle: body.subtitle || '請設定說明', category: body.category || '戰鬥陀螺', cover: body.cover || '/assets/products/mystery.svg', priceCoins: Number(body.priceCoins || 100), status: body.status || 'active', featured: !!body.featured, lastOneEnabled: !!body.lastOneEnabled, lastOnePrize: body.lastOnePrize || null, prizes: body.prizes || [] };
  db.pools.unshift(pool);
  addLog(db, 'pool', '後台新增賞池', { title: pool.title });
  saveDb(db);
  res.json(pool);
});

app.patch('/api/admin/shipments/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const shipment = db.shipments.find((s) => s.id === req.params.id || s.drawId === req.params.id);
  if (!shipment) return res.status(404).json({ error: '查無出貨資料' });
  Object.assign(shipment, req.body || {}, { updatedAt: now() });
  addLog(db, 'shipping', '後台更新出貨狀態', { shipmentId: shipment.id, status: shipment.status });
  saveDb(db);
  res.json(shipment);
});

app.post('/line/webhook', (req, res) => {
  // LINE Messaging API Webhook placeholder. Fill LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET for production.
  res.json({ ok: true, message: 'LINE webhook placeholder ready' });
});

app.post('/api/payment/webhook/:provider', (req, res) => {
  // Payment provider webhook placeholder. Validate provider signature before enabling production confirmation.
  res.json({ ok: true, provider: req.params.provider, receivedAt: now() });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Wanwan Beyblade Kuji V6 running on :${PORT}`));

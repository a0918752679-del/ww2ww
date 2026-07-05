import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import cron from 'node-cron';
import * as line from '@line/bot-sdk';
import { appendRow, readRows, initSheets, updateById, addLog } from './store.js';

const app=express();
const PORT=process.env.PORT||8080;
const JWT_SECRET=process.env.JWT_SECRET||'dev-secret';
const lineConfig={channelAccessToken:process.env.LINE_CHANNEL_ACCESS_TOKEN||'', channelSecret:process.env.LINE_CHANNEL_SECRET||''};
const lineClient=lineConfig.channelAccessToken?new line.messagingApi.MessagingApiClient({channelAccessToken:lineConfig.channelAccessToken}):null;
app.use(cors());
app.use('/line/webhook', express.raw({type:'*/*'}));
app.use(express.json({limit:'3mb'}));
app.use(express.static('public'));
const now=()=>new Date().toISOString();
function sign(payload){return jwt.sign(payload,JWT_SECRET,{expiresIn:'30d'});}
function adminAuth(req,res,next){const t=(req.headers.authorization||'').replace('Bearer ',''); try{req.admin=jwt.verify(t,JWT_SECRET); if(req.admin.role!=='admin') throw new Error('not admin'); next();}catch{res.status(401).json({error:'unauthorized'});}}
function userAuth(req,res,next){const t=(req.headers.authorization||'').replace('Bearer ',''); try{req.user=jwt.verify(t,JWT_SECRET); next();}catch{res.status(401).json({error:'unauthorized'});}}

function publicPaymentMethods(){
  const methods = [
    {code:'bank_transfer', name:'銀行匯款 / 人工確認', enabled:true, description:process.env.BANK_ACCOUNT||'請於後台 .env 設定 BANK_ACCOUNT'},
    {code:'line_pay', name:'LINE Pay', enabled:Boolean(process.env.LINE_PAY_CHANNEL_ID && process.env.LINE_PAY_CHANNEL_SECRET), description:'啟用 LINE Pay 參數後可導向付款頁'},
    {code:'ecpay_credit', name:'綠界信用卡', enabled:Boolean(process.env.ECPAY_MERCHANT_ID && process.env.ECPAY_HASH_KEY && process.env.ECPAY_HASH_IV), description:'啟用綠界參數後可導向信用卡付款'},
    {code:'ecpay_atm', name:'綠界 ATM', enabled:Boolean(process.env.ECPAY_MERCHANT_ID && process.env.ECPAY_HASH_KEY && process.env.ECPAY_HASH_IV), description:'啟用綠界參數後可產生 ATM 付款資訊'},
    {code:'newebpay_credit', name:'藍新信用卡', enabled:Boolean(process.env.NEWEBPAY_MERCHANT_ID && process.env.NEWEBPAY_HASH_KEY && process.env.NEWEBPAY_HASH_IV), description:'啟用藍新參數後可導向信用卡付款'},
    {code:'tappay', name:'TapPay / Apple Pay / Google Pay', enabled:Boolean(process.env.TAPPAY_PARTNER_KEY && process.env.TAPPAY_MERCHANT_ID), description:'啟用 TapPay 後可串接卡號、Apple Pay、Google Pay'}
  ];
  return methods.filter(m=>m.code==='bank_transfer' || m.enabled || process.env.SHOW_DISABLED_PAYMENT_METHODS==='true');
}
async function createPaymentRecord(order, method){
  const paymentId = uuid();
  const enabled = publicPaymentMethods().some(m=>m.code===method && m.enabled);
  const isBank = method === 'bank_transfer';
  const gateway = method.startsWith('ecpay')?'ecpay':method.startsWith('newebpay')?'newebpay':method==='line_pay'?'line_pay':method==='tappay'?'tappay':'manual';
  const checkoutUrl = isBank ? '' : `${process.env.BASE_URL||''}/payment-pending.html?paymentId=${paymentId}`;
  const payment={paymentId,orderId:order.orderId,customerId:order.customerId,gateway,method,amount:order.amount,status:isBank?'manual_pending':(enabled?'checkout_created':'disabled'),providerTradeNo:'',checkoutUrl,paidAt:'',failedAt:'',refundedAt:'',raw:JSON.stringify({enabled, bankAccount:process.env.BANK_ACCOUNT||''}),createdAt:now(),updatedAt:now()};
  await appendRow('payments',payment);
  return payment;
}
async function completePaidOrder(orderId, note='付款確認', providerTradeNo=''){
  const order=(await readRows('orders')).find(o=>o.orderId===orderId); if(!order) throw Object.assign(new Error('order not found'),{status:404});
  if(order.paymentStatus==='paid') return {order,message:'already paid'};
  const products=await readRows('products'); const items=(await readRows('orderItems')).filter(i=>i.orderId===order.orderId);
  for(const item of items){ const p=products.find(x=>x.productId===item.productId); if(!p||Number(p.stock)<Number(item.qty)) throw Object.assign(new Error(`付款確認失敗：${item.name} 庫存不足`),{status:409}); }
  for(const item of items){ const p=products.find(x=>x.productId===item.productId); const before=Number(p.stock); const after=before-Number(item.qty); await updateById('products','productId',p.productId,{stock:after,updatedAt:now()}); await appendRow('inventory',{inventoryId:uuid(),type:'sale',refType:'order',refId:order.orderId,sku:p.sku,name:p.name,qtyBefore:before,qtyChange:-Number(item.qty),qtyAfter:after,note:'訂單付款扣庫存',createdAt:now()}); }
  const updated=await updateById('orders','orderId',order.orderId,{paymentStatus:'paid',orderStatus:'paid',paidAt:now()});
  for(let i=0;i<Number(order.cardsQty||1);i++) await appendRow('scratchCards',{cardId:uuid(),orderId:order.orderId,customerId:order.customerId,campaign:order.campaign,status:'unused',prizeId:'',prizeName:'',result:'',scratchedAt:'',createdAt:now()});
  await appendRow('accounting',{accountingId:uuid(),type:'income',category:'order',amount:order.amount,paymentMethod:order.paymentMethod,orderId:order.orderId,note,createdAt:now()});
  const points=Math.floor(Number(order.amount||0)/10);
  if(points>0) await appendRow('pointLogs',{pointLogId:uuid(),customerId:order.customerId,type:'earn',points,source:'order',orderId:order.orderId,note:'付款成功自動累積點數',createdAt:now()});
  const customer=(await readRows('customers')).find(c=>c.customerId===order.customerId);
  if(customer) await updateById('customers','customerId',customer.customerId,{points:Number(customer.points||0)+points,totalSpend:Number(customer.totalSpend||0)+Number(order.amount||0),updatedAt:now()});
  const payments=(await readRows('payments')).filter(p=>p.orderId===order.orderId);
  for(const pay of payments){ if(pay.status!=='paid') await updateById('payments','paymentId',pay.paymentId,{status:'paid',providerTradeNo:providerTradeNo||pay.providerTradeNo||'',paidAt:now(),updatedAt:now()}); }
  return {order:updated,message:'付款已確認，商品庫存已扣減，刮刮卡已發放'};
}


app.post('/api/admin/login',(req,res)=>{ if(req.body.password!==process.env.ADMIN_PASSWORD) return res.status(401).json({error:'密碼錯誤'}); res.json({token:sign({role:'admin'})}); });
app.post('/api/setup/sheets', adminAuth, async(_req,res)=>res.json(await initSheets()));

app.post('/api/auth/register', async(req,res)=>{
  const {email,password,name,phone,lineUserId}=req.body; if(!email||!password) return res.status(400).json({error:'email and password required'});
  const accounts=await readRows('accounts'); if(accounts.find(a=>String(a.email).toLowerCase()===email.toLowerCase())) return res.status(409).json({error:'此 Email 已註冊'});
  const customer={customerId:uuid(), lineUserId:lineUserId||'', email, name:name||'', phone:phone||'', birthday:'', city:'', referrer:'', points:0, totalSpend:0, tags:'member', createdAt:now(), updatedAt:now()};
  const account={accountId:uuid(), customerId:customer.customerId, provider:'local', providerId:email, email, passwordHash:await bcrypt.hash(password,10), createdAt:now(), lastLoginAt:now()};
  await appendRow('customers',customer); await appendRow('accounts',account); await appendRow('logs',{time:now(),action:'customer_register',payload:JSON.stringify({email})});
  res.json({token:sign({role:'customer',customerId:customer.customerId,email}), customer});
});
app.post('/api/auth/login', async(req,res)=>{
  const {email,password}=req.body; const accounts=await readRows('accounts'); const acc=accounts.find(a=>String(a.email).toLowerCase()===String(email).toLowerCase()&&a.provider==='local');
  if(!acc || !(await bcrypt.compare(password,acc.passwordHash))) return res.status(401).json({error:'帳號或密碼錯誤'});
  await updateById('accounts','accountId',acc.accountId,{lastLoginAt:now()}); const customer=(await readRows('customers')).find(c=>c.customerId===acc.customerId);
  res.json({token:sign({role:'customer',customerId:acc.customerId,email}), customer});
});
app.get('/api/auth/oauth-config',(_req,res)=>res.json({googleUrl:process.env.GOOGLE_OAUTH_URL||'',appleUrl:process.env.APPLE_OAUTH_URL||'',note:'Google/Apple 登入需完成 OAuth Client 與 callback 後啟用；本封包已保留入口。'}));

app.get('/api/me', userAuth, async(req,res)=>{
  const customer=(await readRows('customers')).find(c=>c.customerId===req.user.customerId);
  const orders=(await readRows('orders')).filter(o=>o.customerId===req.user.customerId);
  const orderItems=(await readRows('orderItems')).filter(i=>orders.some(o=>o.orderId===i.orderId));
  const cards=(await readRows('scratchCards')).filter(c=>c.customerId===req.user.customerId);
  const winners=(await readRows('winners')).filter(w=>w.customerId===req.user.customerId);
  res.json({customer,orders,orderItems,cards,winners});
});


app.get('/api/home', async(_req,res)=>{
  const [campaigns,products,prizes,orders,winners,reports]=await Promise.all(['campaigns','products','prizes','orders','winners','aiReports'].map(readRows));
  const activeCampaigns=campaigns.filter(c=>String(c.status||'active')!=='disabled');
  const enabledProducts=products.filter(p=>String(p.enabled).toLowerCase()!=='false');
  const prizeSummary=prizes.map(p=>({...p, remaining: Math.max(0, Number(p.stock||0)-Number(p.issued||0))}));
  const paidOrders=orders.filter(o=>o.paymentStatus==='paid');
  res.json({
    campaigns: activeCampaigns,
    products: enabledProducts,
    prizeSummary,
    latestWinners:winners.slice(0,8),
    latestReport:reports[0]||null,
    stats:{paidOrders:paidOrders.length,totalRevenue:paidOrders.reduce((s,o)=>s+Number(o.amount||0),0),activeProducts:enabledProducts.length,activeCampaigns:activeCampaigns.length}
  });
});
app.post('/api/admin/campaigns', adminAuth, async(req,res)=>{
  const row={campaignId:uuid(),name:req.body.name||'新一期線上一番賞',type:req.body.type||'online_kuji',status:req.body.status||'active',heroTitle:req.body.heroTitle||'',heroSubtitle:req.body.heroSubtitle||'',pricePerDraw:Number(req.body.pricePerDraw||0),totalTickets:Number(req.body.totalTickets||0),soldTickets:Number(req.body.soldTickets||0),lastOnePrize:req.body.lastOnePrize||'',startAt:req.body.startAt||'',endAt:req.body.endAt||'',imageUrl:req.body.imageUrl||'',description:req.body.description||'',createdAt:now(),updatedAt:now()};
  await appendRow('campaigns',row); res.json(row);
});
app.patch('/api/admin/campaigns/:id', adminAuth, async(req,res)=>{ const c=await updateById('campaigns','campaignId',req.params.id,{...req.body,updatedAt:now()}); if(!c)return res.status(404).json({error:'not found'}); res.json(c); });
app.post('/api/admin/coupons', adminAuth, async(req,res)=>{
  const row={couponId:uuid(),code:req.body.code||`CP${Date.now()}`,name:req.body.name||'',discountType:req.body.discountType||'amount',discountValue:Number(req.body.discountValue||0),minSpend:Number(req.body.minSpend||0),stock:Number(req.body.stock||0),issued:0,enabled:req.body.enabled??'true',startAt:req.body.startAt||'',endAt:req.body.endAt||'',createdAt:now()};
  await appendRow('coupons',row); res.json(row);
});
app.post('/api/admin/ai-report/generate', adminAuth, async(_req,res)=>{
  const [orders,products,prizes,shipping,payments]=await Promise.all(['orders','products','prizes','shipping','payments'].map(readRows));
  const paid=orders.filter(o=>o.paymentStatus==='paid');
  const lowStock=products.filter(p=>Number(p.stock||0)<=3).map(p=>p.name);
  const soldOut=prizes.filter(p=>String(p.soldOut).toLowerCase()==='true').map(p=>p.name);
  const metrics={revenue:paid.reduce((s,o)=>s+Number(o.amount||0),0),paidOrders:paid.length,pendingPayments:payments.filter(p=>!['paid','failed','refunded'].includes(String(p.status))).length,pendingShipping:shipping.filter(s=>s.status!=='已完成').length,lowStock,soldOut};
  const recommendations=[];
  if(lowStock.length) recommendations.push(`商品低庫存：${lowStock.slice(0,5).join('、')}，建議補貨或下架避免超賣。`);
  if(soldOut.length) recommendations.push(`已有 Sold out 獎項：${soldOut.slice(0,5).join('、')}，建議檢查活動剩餘吸引力。`);
  if(metrics.pendingPayments>0) recommendations.push('仍有待確認付款，建議每日固定時段清帳並自動配卡。');
  if(metrics.pendingShipping>0) recommendations.push('仍有待出貨中獎品，建議優先處理以降低客服壓力。');
  if(!recommendations.length) recommendations.push('目前營運狀態正常，可加強新品曝光、會員推播與社群分享。');
  const row={reportId:uuid(),title:'AI營運摘要',summary:`已付款訂單 ${metrics.paidOrders} 筆，累積營收 ${metrics.revenue} 元。`,metrics:JSON.stringify(metrics),recommendations:JSON.stringify(recommendations),createdAt:now()};
  await appendRow('aiReports',row); res.json(row);
});

app.get('/api/products', async(_req,res)=>res.json((await readRows('products')).filter(p=>String(p.enabled).toLowerCase()!=='false')));
app.post('/api/admin/products', adminAuth, async(req,res)=>{
  const p={productId:uuid(), sku:req.body.sku||`SKU-${Date.now()}`, name:req.body.name||'', category:req.body.category||'戰鬥陀螺', price:Number(req.body.price||0), stock:Number(req.body.stock||0), enabled:req.body.enabled??'true', description:req.body.description||'', imageUrl:req.body.imageUrl||'', createdAt:now(), updatedAt:now()};
  await appendRow('products',p); await appendRow('inventory',{inventoryId:uuid(),type:'initial',refType:'product',refId:p.productId,sku:p.sku,name:p.name,qtyBefore:0,qtyChange:p.stock,qtyAfter:p.stock,note:'新品上架初始庫存',createdAt:now()}); res.json(p);
});
app.patch('/api/admin/products/:id', adminAuth, async(req,res)=>{ const p=await updateById('products','productId',req.params.id,{...req.body,updatedAt:now()}); if(!p)return res.status(404).json({error:'not found'}); res.json(p); });
app.post('/api/admin/prizes', adminAuth, async(req,res)=>{
  const prize={prizeId:uuid(),campaign:req.body.campaign||'戰鬥陀螺刮刮樂',tier:req.body.tier||'C',name:req.body.name||'',stock:Number(req.body.stock||0),issued:0,rate:Number(req.body.rate||0),enabled:req.body.enabled??'true',requiresShipping:req.body.requiresShipping??'true',soldOut:'false',note:req.body.note||'',createdAt:now(),updatedAt:now()};
  await appendRow('prizes',prize); res.json(prize);
});
app.patch('/api/admin/prizes/:id', adminAuth, async(req,res)=>{ const p=await updateById('prizes','prizeId',req.params.id,{...req.body,updatedAt:now()}); if(!p)return res.status(404).json({error:'not found'}); res.json(p); });

app.post('/api/order/create', userAuth, async(req,res)=>{
  const items=Array.isArray(req.body.items)?req.body.items:[]; if(!items.length) return res.status(400).json({error:'items required'});
  const products=await readRows('products'); let amount=0; const orderId=uuid(); const built=[];
  for(const it of items){ const p=products.find(x=>x.productId===it.productId); const qty=Number(it.qty||1); if(!p||String(p.enabled).toLowerCase()==='false') return res.status(400).json({error:'商品不存在或未啟用'}); if(Number(p.stock)<qty) return res.status(409).json({error:`${p.name} 庫存不足`}); const subtotal=Number(p.price)*qty; amount+=subtotal; built.push({itemId:uuid(),orderId,productId:p.productId,sku:p.sku,name:p.name,qty,unitPrice:Number(p.price),subtotal,createdAt:now()}); }
  const cardsQty=Number(req.body.cardsQty||built.reduce((s,i)=>s+i.qty,0));
  const method=req.body.paymentMethod||'bank_transfer';
  const order={orderId,customerId:req.user.customerId,amount,paymentMethod:method,paymentStatus:'pending',orderStatus:'created',cardsQty,campaign:'戰鬥陀螺刮刮樂',createdAt:now(),paidAt:'',note:req.body.note||''};
  await appendRow('orders',order); for(const b of built) await appendRow('orderItems',b);
  const payment=await createPaymentRecord(order, method);
  res.json({order,items:built,payment,nextAction:payment.checkoutUrl?{type:'redirect',url:payment.checkoutUrl}:{type:'bank_transfer',bankAccount:process.env.BANK_ACCOUNT||'請於 Zeabur 環境變數設定 BANK_ACCOUNT'},message:method==='bank_transfer'?'訂單已建立，請匯款後於備註留下後五碼，內部確認後會自動配卡。':'訂單已建立，請依付款頁完成付款；正式金流 Webhook 會自動配卡。'});
});
app.post('/api/admin/orders/:id/mark-paid', adminAuth, async(req,res)=>{ try{res.json(await completePaidOrder(req.params.id,'後台人工付款確認',req.body.providerTradeNo||''));}catch(e){res.status(e.status||500).json({error:e.message});} });
app.get('/api/payment/methods', async(_req,res)=>res.json(publicPaymentMethods()));
app.post('/api/admin/payments/:id/mark-failed', adminAuth, async(req,res)=>{ const p=await updateById('payments','paymentId',req.params.id,{status:'failed',failedAt:now(),raw:JSON.stringify(req.body||{}),updatedAt:now()}); if(!p)return res.status(404).json({error:'payment not found'}); res.json(p); });
app.post('/api/admin/payments/:id/refund-note', adminAuth, async(req,res)=>{ const p=await updateById('payments','paymentId',req.params.id,{status:'refund_pending',raw:JSON.stringify(req.body||{}),updatedAt:now()}); if(!p)return res.status(404).json({error:'payment not found'}); await appendRow('accounting',{accountingId:uuid(),type:'expense',category:'refund_pending',amount:p.amount,paymentMethod:p.method,orderId:p.orderId,note:req.body.note||'退款待處理',createdAt:now()}); res.json(p); });
app.post('/api/payment/webhook/:gateway', async(req,res)=>{ try{ const {orderId,paymentId,status,providerTradeNo}=req.body||{}; await appendRow('logs',{time:now(),action:`payment_webhook_${req.params.gateway}`,payload:JSON.stringify(req.body||{})}); if((status==='paid'||status==='SUCCESS') && orderId){ const result=await completePaidOrder(orderId,`${req.params.gateway} webhook 付款成功`,providerTradeNo||''); return res.json({ok:true,...result}); } if(paymentId){ await updateById('payments','paymentId',paymentId,{status:status||'webhook_received',providerTradeNo:providerTradeNo||'',raw:JSON.stringify(req.body||{}),updatedAt:now()}); } res.json({ok:true,message:'webhook received'});}catch(e){res.status(e.status||500).json({ok:false,error:e.message});} });

app.get('/api/my/cards', userAuth, async(req,res)=>res.json((await readRows('scratchCards')).filter(c=>c.customerId===req.user.customerId)));
app.post('/api/scratch/play', userAuth, async(req,res)=>{
  const cards=await readRows('scratchCards'); const card=cards.find(c=>c.cardId===req.body.cardId&&c.customerId===req.user.customerId); if(!card)return res.status(404).json({error:'card not found'}); if(card.status==='scratched')return res.status(409).json({error:'此刮刮卡已使用'});
  const prizes=(await readRows('prizes')).filter(p=>String(p.enabled).toLowerCase()!=='false'&&String(p.soldOut).toLowerCase()!=='true'&&Number(p.stock)>Number(p.issued));
  let prize=null, roll=Math.random()*100, acc=0; for(const p of prizes){acc+=Number(p.rate||0); if(roll<=acc){prize=p;break;}}
  let result='lose', prizeName='未中獎', winner=null;
  if(prize){ const issued=Number(prize.issued||0)+1; await updateById('prizes','prizeId',prize.prizeId,{issued,soldOut:issued>=Number(prize.stock)?'true':'false',updatedAt:now()}); await appendRow('inventory',{inventoryId:uuid(),type:'prize_win',refType:'card',refId:card.cardId,sku:prize.prizeId,name:prize.name,qtyBefore:Number(prize.stock)-Number(prize.issued||0),qtyChange:-1,qtyAfter:Number(prize.stock)-issued,note:'中獎自動扣獎品庫存',createdAt:now()}); result='win'; prizeName=prize.name; winner={winnerId:uuid(),cardId:card.cardId,customerId:card.customerId,prizeId:prize.prizeId,prizeName,status:'待填地址',createdAt:now()}; await appendRow('winners',winner); await appendRow('collections',{collectionId:uuid(),customerId:card.customerId,prizeId:prize.prizeId,prizeName:prize.name,campaign:prize.campaign,tier:prize.tier,createdAt:now()}); }
  await updateById('scratchCards','cardId',card.cardId,{status:'scratched',prizeId:prize?.prizeId||'',prizeName,result,scratchedAt:now()});
  res.json({result,prizeName,winner});
});
app.post('/api/shipping/submit', userAuth, async(req,res)=>{ const shipping={shippingId:uuid(),winnerId:req.body.winnerId,customerId:req.user.customerId,recipientName:req.body.recipientName,recipientPhone:req.body.recipientPhone,zip:req.body.zip||'',city:req.body.city||'',district:req.body.district||'',address:req.body.address||'',storePickup:req.body.storePickup||'',status:'待出貨',trackingNo:'',shippedAt:'',note:req.body.note||'',createdAt:now()}; await appendRow('shipping',shipping); await updateById('winners','winnerId',shipping.winnerId,{status:'待出貨'}); res.json(shipping); });

app.get('/api/admin/dashboard', adminAuth, async(_req,res)=>{ const keys=['customers','products','orders','orderItems','payments','scratchCards','prizes','winners','shipping','inventory','accounting']; const data=Object.fromEntries(await Promise.all(keys.map(async k=>[k,await readRows(k)]))); const today=new Date().toISOString().slice(0,10); const todayOrders=data.orders.filter(o=>String(o.createdAt).startsWith(today)); const revenue=data.orders.filter(o=>o.paymentStatus==='paid').reduce((s,o)=>s+Number(o.amount||0),0); res.json({...data, counts:{customers:data.customers.length, todayOrders:todayOrders.length, pendingOrders:data.orders.filter(o=>o.paymentStatus!=='paid').length, pendingShipping:data.shipping.filter(s=>s.status!=='已完成').length, pendingPayments:data.payments.filter(p=>!['paid','failed','refunded'].includes(String(p.status))).length, soldOutPrizes:data.prizes.filter(p=>String(p.soldOut).toLowerCase()==='true').length}, revenue}); });
app.post('/api/admin/accounting', adminAuth, async(req,res)=>{const row={accountingId:uuid(),type:req.body.type,category:req.body.category,amount:req.body.amount,paymentMethod:req.body.paymentMethod||'',orderId:req.body.orderId||'',note:req.body.note||'',createdAt:now()}; await appendRow('accounting',row); res.json(row);});

app.post('/line/webhook', async(req,res)=>{res.status(200).end(); try{const body=JSON.parse(req.body.toString('utf8')); for(const ev of body.events||[]){ if(!lineClient||ev.type!=='message')continue; const text=ev.message?.text||''; let reply='歡迎參加「萬萬沒想到｜戰鬥陀螺線上刮刮樂」。請進入平台登入會員。'; if(text.includes('會員')||text.includes('刮')) reply=`${process.env.BASE_URL}/login.html?lineUserId=${ev.source.userId}`; if(text.includes('客服')) reply='請留下問題、訂單編號或中獎編號，客服會於營業時間回覆。'; await lineClient.replyMessage({replyToken:ev.replyToken,messages:[{type:'text',text:reply}]});}}catch(e){addLog('line_webhook_error',{message:e.message});}});
cron.schedule('0 10 * * *',async()=>appendRow('logs',{time:now(),action:'daily_scheduler',payload:'定時推播排程觸發'}));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`running on http://localhost:${PORT}`);
  console.log('手機連線方式：請確認手機與電腦在同一個 Wi-Fi，然後開啟 http://<電腦區域網路IP>:' + PORT);
});

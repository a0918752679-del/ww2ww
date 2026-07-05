import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const localPath = path.join(process.cwd(), 'data', 'local-db.json');
export const defaultDb = { customers: [], accounts: [], products: [], inventory: [], orders: [], orderItems: [], payments: [], paymentMethods: [], scratchCards: [], prizes: [], winners: [], shipping: [], accounting: [], broadcast: [], campaigns: [], coupons: [], pointLogs: [], collections: [], aiReports: [], logs: [] };

export const sheetTabs = { customers:'Customers', accounts:'Accounts', products:'Products', inventory:'Inventory', orders:'Orders', orderItems:'OrderItems', payments:'Payments', paymentMethods:'PaymentMethods', scratchCards:'ScratchCards', prizes:'Prizes', winners:'Winners', shipping:'Shipping', accounting:'Accounting', broadcast:'Broadcast', campaigns:'Campaigns', coupons:'Coupons', pointLogs:'PointLogs', collections:'Collections', aiReports:'AIReports', logs:'Logs' };
export const headers = {
  customers:['customerId','lineUserId','email','name','phone','birthday','city','referrer','points','totalSpend','tags','createdAt','updatedAt'],
  accounts:['accountId','customerId','provider','providerId','email','passwordHash','createdAt','lastLoginAt'],
  products:['productId','sku','name','category','price','stock','enabled','description','imageUrl','createdAt','updatedAt'],
  inventory:['inventoryId','type','refType','refId','sku','name','qtyBefore','qtyChange','qtyAfter','note','createdAt'],
  orders:['orderId','customerId','amount','paymentMethod','paymentStatus','orderStatus','cardsQty','campaign','createdAt','paidAt','note'],
  orderItems:['itemId','orderId','productId','sku','name','qty','unitPrice','subtotal','createdAt'],
  payments:['paymentId','orderId','customerId','gateway','method','amount','status','providerTradeNo','checkoutUrl','paidAt','failedAt','refundedAt','raw','createdAt','updatedAt'],
  paymentMethods:['methodId','code','name','enabled','feeType','feeValue','description','sort','createdAt','updatedAt'],
  scratchCards:['cardId','orderId','customerId','campaign','status','prizeId','prizeName','result','scratchedAt','createdAt'],
  prizes:['prizeId','campaign','tier','name','stock','issued','rate','enabled','requiresShipping','soldOut','note','createdAt','updatedAt'],
  winners:['winnerId','cardId','customerId','prizeId','prizeName','status','createdAt'],
  shipping:['shippingId','winnerId','customerId','recipientName','recipientPhone','zip','city','district','address','storePickup','status','trackingNo','shippedAt','note','createdAt'],
  accounting:['accountingId','type','category','amount','paymentMethod','orderId','note','createdAt'],
  broadcast:['broadcastId','title','message','targetTag','scheduleAt','status','sentAt','createdAt'],
  campaigns:['campaignId','name','type','status','heroTitle','heroSubtitle','pricePerDraw','totalTickets','soldTickets','lastOnePrize','startAt','endAt','imageUrl','description','createdAt','updatedAt'],
  coupons:['couponId','code','name','discountType','discountValue','minSpend','stock','issued','enabled','startAt','endAt','createdAt'],
  pointLogs:['pointLogId','customerId','type','points','source','orderId','note','createdAt'],
  collections:['collectionId','customerId','prizeId','prizeName','campaign','tier','createdAt'],
  aiReports:['reportId','title','summary','metrics','recommendations','createdAt'],
  logs:['time','action','payload']
};
function ensureLocal(){ fs.mkdirSync(path.dirname(localPath), {recursive:true}); if(!fs.existsSync(localPath)) fs.writeFileSync(localPath, JSON.stringify(defaultDb,null,2)); }
export function loadLocal(){ ensureLocal(); const db=JSON.parse(fs.readFileSync(localPath,'utf8')); for(const k of Object.keys(defaultDb)) if(!db[k]) db[k]=[]; return db; }
export function saveLocal(db){ ensureLocal(); fs.writeFileSync(localPath, JSON.stringify(db,null,2)); }
export function addLog(action,payload={}){ const db=loadLocal(); db.logs.unshift({time:new Date().toISOString(), action, payload:JSON.stringify(payload)}); saveLocal(db); }
async function sheetsClient(){
  if(!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) return null;
  const auth = new google.auth.JWT({email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key:process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n'), scopes:['https://www.googleapis.com/auth/spreadsheets']});
  return google.sheets({version:'v4', auth});
}
export async function initSheets(){
  const sheets=await sheetsClient(); if(!sheets) return {mode:'local', message:'Google Sheet env not configured; local JSON enabled'};
  const spreadsheetId=process.env.GOOGLE_SHEET_ID;
  const meta=await sheets.spreadsheets.get({spreadsheetId});
  const existing=new Set(meta.data.sheets.map(s=>s.properties.title));
  const requests=Object.values(sheetTabs).filter(t=>!existing.has(t)).map(title=>({addSheet:{properties:{title}}}));
  if(requests.length) await sheets.spreadsheets.batchUpdate({spreadsheetId, requestBody:{requests}});
  for(const [key,tab] of Object.entries(sheetTabs)){
    const res=await sheets.spreadsheets.values.get({spreadsheetId, range:`${tab}!1:1`}).catch(()=>({data:{values:[]}}));
    if(!res.data.values?.[0]?.length) await sheets.spreadsheets.values.update({spreadsheetId, range:`${tab}!A1`, valueInputOption:'RAW', requestBody:{values:[headers[key]]}});
  }
  return {mode:'sheets', message:'Google Sheets initialized'};
}
export async function appendRow(key,obj){
  const sheets=await sheetsClient();
  if(!sheets){ const db=loadLocal(); db[key].unshift(obj); saveLocal(db); return obj; }
  const row=headers[key].map(h=>typeof obj[h]==='object'?JSON.stringify(obj[h]):(obj[h]??''));
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID, range:`${sheetTabs[key]}!A:AZ`, valueInputOption:'USER_ENTERED', requestBody:{values:[row]}});
  return obj;
}
export async function readRows(key){
  const sheets=await sheetsClient(); if(!sheets) return loadLocal()[key]||[];
  const res=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID, range:`${sheetTabs[key]}!A:AZ`}).catch(()=>({data:{values:[]}}));
  const values=res.data.values||[]; const [head,...rows]=values; if(!head) return [];
  return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??'']))).reverse();
}
export async function replaceRows(key, rows){
  const sheets=await sheetsClient();
  if(!sheets){ const db=loadLocal(); db[key]=rows; saveLocal(db); return rows; }
  const tab=sheetTabs[key]; const values=[headers[key], ...rows.slice().reverse().map(obj=>headers[key].map(h=>obj[h]??''))];
  await sheets.spreadsheets.values.clear({spreadsheetId:process.env.GOOGLE_SHEET_ID, range:`${tab}!A:AZ`});
  await sheets.spreadsheets.values.update({spreadsheetId:process.env.GOOGLE_SHEET_ID, range:`${tab}!A1`, valueInputOption:'USER_ENTERED', requestBody:{values}});
  return rows;
}
export async function updateById(key,idField,id,patch){ const rows=await readRows(key); const idx=rows.findIndex(r=>r[idField]===id); if(idx<0) return null; rows[idx]={...rows[idx],...patch}; await replaceRows(key, rows); return rows[idx]; }

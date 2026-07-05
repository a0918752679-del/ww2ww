# Zeabur 部署說明｜萬萬沒想到 戰鬥陀螺刮刮樂 V3 金流管理版

## 啟動

```bash
npm install
npm start
```

Zeabur 會依 `package.json` 自動執行 `npm start`。

## 主要頁面

- 客戶首頁：`/`
- 登入 / 註冊：`/login.html`
- 商品購買：`/shop.html`
- 刮刮樂：`/scratch.html`
- 會員中心：`/member.html`
- 後台：`/admin.html`

## 後台功能

- 今日訂單查詢
- 付款單管理
- 銀行匯款人工入帳
- 金流 Webhook 入帳
- 商品上架
- 商品庫存扣減
- 獎項庫存扣減
- Sold out 防呆
- 中獎寄件資料
- 內部記帳
- Google Sheet 同步

## 金流邏輯

1. 客戶建立訂單。
2. 系統建立 `Payments` 付款單。
3. 付款成功後由後台或 Webhook 觸發入帳。
4. 入帳後系統自動：扣商品庫存、發放刮刮卡、寫入 Accounting。
5. 客戶刮中獎項時，再扣獎品庫存；庫存為 0 自動 Sold out。

## 必填環境變數

```env
PORT=8080
BASE_URL=https://your-project.zeabur.app
JWT_SECRET=change-me-long-random-string
ADMIN_PASSWORD=69677323
BANK_ACCOUNT=銀行代碼 / 帳號 / 戶名
```

## LINE

```env
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

Webhook：

```text
https://your-project.zeabur.app/line/webhook
```

## Google Sheet

```env
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

部署後進後台呼叫初始化 API：

```text
POST /api/setup/sheets
```

## 金流環境變數

詳見 `.env.example` 與 `docs/PAYMENT_SETUP.md`。

本版已預留：

- 銀行匯款
- LINE Pay
- 綠界 ECPay
- 藍新 NewebPay
- TapPay / Apple Pay / Google Pay

正式商用前，需依金流商規格補齊簽章驗證與正式付款頁建立流程。

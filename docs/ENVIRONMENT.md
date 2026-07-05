# 環境參數參考

## 基本

```env
PORT=8080
BASE_URL=https://your-project.zeabur.app
ADMIN_PASSWORD=69677323
JWT_SECRET=change-this-long-random-string
BANK_ACCOUNT=銀行代碼 / 帳號 / 戶名
```

## LINE

```env
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_LIFF_ID=
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
```

用途：

- LINE Bot Webhook
- Rich Menu
- LINE Login / LIFF
- 中獎、付款、出貨推播

## Google / Apple 登入

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

## 金流

```env
ECPAY_MERCHANT_ID=
ECPAY_HASH_KEY=
ECPAY_HASH_IV=
NEWEBPAY_MERCHANT_ID=
NEWEBPAY_HASH_KEY=
NEWEBPAY_HASH_IV=
LINE_PAY_CHANNEL_ID=
LINE_PAY_CHANNEL_SECRET=
```

目前封包已預留：

```text
/api/payment/webhook/:provider
```

正式上線要做：

1. 檢查金流簽章。
2. 查詢交易狀態。
3. 確認付款成功。
4. 更新訂單狀態。
5. 儲值代幣入帳或商品庫存扣減。
6. 寫入 Logs。
7. LINE 推播通知會員。

## 資料庫 / Google Sheet

```env
DATABASE_URL=
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

正式營運建議：

- PostgreSQL：主資料庫
- Google Sheet：報表同步、每日營運摘要、會計對帳

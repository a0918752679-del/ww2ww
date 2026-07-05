# 萬萬沒想到｜戰鬥陀螺線上一番賞平台 V4

這版是可部署 Zeabur 的手機優先商業版，包含：

- 前台首頁 Landing Page
- 商品商城與商品圖片展示
- 會員登入 / 註冊，Google、Apple OAuth 入口預留
- 購買商品、付款單、銀行匯款人工確認、金流 Webhook 預留
- 付款成功後自動發放刮刮卡
- 線上一番賞 / 刮刮樂
- 獎項庫存即時扣減，0 庫存自動 Sold out
- 中獎寄件資料留存
- 後台 Dashboard
- 新品上架、活動管理、Last One 賞設定
- 訂單、付款、記帳、出貨、庫存、Log
- AI 營運摘要產生器
- Google Sheet 同步；未設定時自動使用本地 JSON

## Zeabur 啟動

```bash
npm install
npm start
```

主要入口：

- `/`：手機版首頁
- `/shop.html`：商品商城
- `/login.html`：會員登入
- `/member.html`：會員中心
- `/scratch.html`：刮刮樂
- `/admin.html`：後台

## 後台預設密碼

請在 Zeabur 環境變數設定：

```env
ADMIN_PASSWORD=69677323
```

## Google Sheet

執行一次：

```text
POST /api/setup/sheets
```

需帶後台 Bearer Token。

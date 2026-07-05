# 萬萬沒想到｜戰鬥陀螺線上一番賞 V6 Zeabur Ready

這是一版可直接部署到 Zeabur 的手機優先互動式平台封包。視覺方向改為「遊戲化抽賞平台」，不是一般平淡商城。

## 入口

- 前台：`/`
- 後台：`/admin`
- 健康檢查：`/health`
- LINE Webhook 預留：`/line/webhook`
- 金流 Webhook 預留：`/api/payment/webhook/:provider`

## 預設後台密碼

```text
69677323
```

可在 Zeabur 環境變數 `ADMIN_PASSWORD` 修改。

## 本版重點

### 前台 UI / UX

- 手機優先版型
- 深色霓虹、抽賞平台風格
- 首頁 Banner、即時中獎跑馬燈
- 主打賞池卡片
- 商品圖片直接呈現
- 分類篩選
- 手機底部導覽列
- 儲值代幣入口
- 賞池詳情頁
- 抽賞互動動畫
- 中獎後寄件資料填寫
- 會員中心：今日消費、抽賞紀錄、出貨紀錄

### 抽賞與庫存

- 每個賞池有獨立獎項庫存
- 抽中即時扣減獎項庫存
- 庫存為 0 的獎項不會再抽出
- 總剩餘抽數即時顯示
- A賞剩餘數顯示
- Last One 最後賞邏輯
- 賞池售完自動 Sold out

### 商城與付款

- 商品列表
- 商品購物車
- 商品訂單建立
- 銀行匯款付款單
- 後台人工確認付款
- 商品庫存在付款確認時扣減
- 儲值代幣付款單
- 後台確認後自動入帳代幣

### 後台

- Dashboard 營運總覽
- 今日營收、今日訂單、今日抽數、會員數
- 待付款、待出貨
- 付款確認
- 訂單紀錄
- 商品與庫存管理
- 賞池管理
- 出貨狀態與物流單號更新
- 會員 CRM
- 操作 Logs
- AI 營運摘要區塊

### LINE Rich Menu

位置：

```text
public/assets/richmenu/
```

內含：

- `page1.png`
- `page2.png`
- `page3.png`
- `richmenu-actions.json`

圖片規格：`2500 x 1686 px`，符合 LINE Rich Menu 常用大尺寸規格。

## Zeabur 部署方式

1. 解壓縮封包。
2. 上傳到 GitHub Repository。
3. Zeabur 新增 Project。
4. Add Service → GitHub → 選擇此 Repository。
5. 設定 Environment Variables。
6. Deploy。

Zeabur 會依 `zeabur.json` 執行：

```bash
npm install
npm start
```

## 必填環境參數

最低可啟動：

```env
PORT=8080
BASE_URL=https://your-project.zeabur.app
ADMIN_PASSWORD=69677323
JWT_SECRET=change-this-long-random-string
BANK_ACCOUNT=銀行代碼 / 帳號 / 戶名
```

完整參數請看：

```text
.env.example
docs/ENVIRONMENT.md
```

## 正式營運注意

本封包是可部署、可操作的營運雛形，資料目前使用 `data/db.json`。若要正式商業營運，建議把資料層升級為 PostgreSQL，避免服務重啟或多實例部署造成資料不一致。

金流、Google / Apple / LINE OAuth、Google Sheet 同步目前是預留欄位與 Webhook 入口，正式收款前需要依金流商文件完成簽章驗證與付款結果確認，不能只依前端回傳作為付款成功依據。

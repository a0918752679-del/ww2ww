# 手機可開啟版本｜本地端部署說明

此版本可讓同一個 Wi-Fi 內的手機直接開啟測試。

## 啟動方式

### Windows
雙擊：

```txt
start-mobile-windows.bat
```

畫面會顯示電腦的 IPv4 位址。

手機瀏覽器輸入：

```txt
http://電腦IPv4位址:8080
```

例如：

```txt
http://192.168.1.10:8080
```

### macOS
執行：

```txt
start-mobile-mac.command
```

手機瀏覽器輸入：

```txt
http://電腦IP:8080
```

## 預設入口

- 客戶首頁：`/`
- 會員登入：`/login.html`
- 商品購買：`/shop.html`
- 會員中心：`/member.html`
- 刮刮樂：`/scratch.html`
- 後台：`/admin.html`
- 後台密碼：`69677323`

## 重要設定

1. 手機與電腦必須在同一個 Wi-Fi。
2. Windows 防火牆若跳出提示，請允許 Node.js 存取私人網路。
3. 若手機打不開，通常是防火牆擋住 8080 port。
4. 本地端資料存於 `data/local-db.json`。

## 這版包含

- 手機 RWD 客戶端介面
- 會員登入 / 註冊
- 商品購買與付款模擬
- 後台人工確認付款
- 今日訂單查詢
- 商品上架
- 商品庫存扣減
- 獎項庫存扣減
- Sold out 防呆
- 中獎寄件地址留存
- LINE Bot webhook 預留

## V1.1 UI 調整
- 前台改為清爽活潑手機版 UI。
- 商品區支援商品圖直接展示。
- 購買頁新增訂單摘要、庫存標籤與 Sold out 標示。

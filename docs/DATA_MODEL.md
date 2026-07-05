# 資料結構摘要

目前資料存放於：

```text
data/db.json
```

主要集合：

- `settings`：平台設定
- `banners`：首頁 Banner
- `categories`：分類
- `products`：商品與庫存
- `pools`：賞池
- `pools.prizes`：每個賞池的獎項與庫存
- `customers`：會員
- `orders`：訂單
- `payments`：付款單
- `draws`：抽賞紀錄
- `shipments`：出貨資料
- `logs`：操作紀錄

正式營運建議改為 PostgreSQL，並建立資料表：

- users
- products
- product_inventory_logs
- prize_pools
- prize_items
- draw_records
- orders
- order_items
- payments
- shipments
- coupons
- point_logs
- line_messages
- admin_logs

# 金流管理建置說明

## 目前已建置

- 付款方式清單 API：`GET /api/payment/methods`
- 建立訂單時自動建立付款單：`Payments`
- 人工匯款確認：後台按「入帳」後自動：
  1. 訂單改為 `paid`
  2. 扣商品庫存
  3. 發放刮刮卡
  4. 新增收入到 `Accounting`
  5. 更新付款單狀態
- 金流 Webhook 入口：`POST /api/payment/webhook/:gateway`
- 退款註記：後台可建立 `refund_pending` 記帳紀錄
- Google Sheet 新增分頁：`Payments`、`PaymentMethods`

## 建議正式營運流程

1. 前期：銀行匯款 + 後台人工確認。
2. 正式：優先串接綠界或藍新信用卡/ATM。
3. LINE 導流強：加上 LINE Pay。
4. 行動體驗要求高：再加 TapPay / Apple Pay / Google Pay。

## Webhook 測試格式

```json
{
  "orderId": "訂單ID",
  "paymentId": "付款單ID，可空白",
  "status": "paid",
  "providerTradeNo": "金流交易序號"
}
```

付款成功會呼叫同一套 `completePaidOrder()`，避免重複扣庫存或重複發卡。

## 重要控管

- 獎品庫存由刮中時扣減，扣到 0 會自動 Sold out。
- 商品庫存由付款確認時扣減。
- 未付款訂單不會發刮刮卡。
- Webhook 正式上線前，需依各金流規格補上簽章驗證。

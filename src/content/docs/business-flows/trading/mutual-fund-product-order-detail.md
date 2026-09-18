---
title: Mutual Fund Product Order Detail
description: Read-only contract สำหรับ product conditions, fund availability, risk agreement และ penalty ที่ใช้เตรียมคำสั่งกองทุนรวม
capability: Trading
services: [order-service]
aliases: [mutual fund product order detail, product order detail v2, product detail v2, mutual fund order conditions, fund availability, fund order eligibility, P0337, api v2 products, รายละเอียดกองทุนก่อนทำรายการ, เงื่อนไขการซื้อขายกองทุน, ความพร้อมกองทุน]
errorCodes: ["400", "401", "500"]
status: active
lastUpdated: 2026-09-18
documentType: flow
---

## Purpose and scope

อธิบาย read-only endpoint `GET /api/v2/products/{product_id}` ของ `order-service` ซึ่งรวม product data, NAV/mark-to-market, mutual-fund extension, customer risk/knowledge context และเงื่อนไขที่ client ใช้เตรียม buy/sell/switch order

หน้านี้ไม่อ้างว่า endpoint ถูกใช้โดย frontend ปัจจุบัน: source ที่ตรวจพบว่า `xspring-mobile-app` ยังเรียก `/api/v1/product/detail` สำหรับหน้ารายละเอียด product และไม่พบ consumer ของ `/api/v2/products/{product_id}` ใน frontend repositories ที่อยู่ใน scope

## Trigger and preconditions

**Owner and executing service: `order-service`**

- Caller ต้องมี `PortalClaims` และส่ง `product_id` ที่เป็น UUID
- `order-service` ต้องอ่าน customer identification จาก claims, product, mark-to-market, `product_mf_extension`, keyword tags และ customer background knowledge ได้
- Customer risk level ใช้สร้าง agreement list; customer knowledge ที่ไม่พบทำให้ response ระบุว่าต้องทำ knowledge assessment
- Endpoint นี้ไม่สร้าง order, ไม่เปลี่ยน order/payment/ledger state และไม่คำนวณ cutoff time; cutoff เป็น contract แยกของ `GET /api/v1/order/available-trade-date`

## Participating services

| Service | Responsibility |
| :--- | :--- |
| `order-service` | รับ authenticated request, อ่าน product/customer context, คำนวณ display/eligibility flags และคืน response V2 |

ไม่มี consumer/worker หรือ frontend executor ของ route V2 ที่ยืนยันได้จาก repositories ในรอบนี้

## End-to-end sequence

### 1. Authenticate and resolve product context

**Owner and executing service: `order-service`**

Handler ตรวจ `PortalClaims`, แปลง `claims.UserUUID` เป็น customer identification UUID และแปลง path `product_id` เป็น product UUID หาก claims หรือ UUID ไม่ถูกต้อง request จบก่อนอ่าน product context

### 2. Load source data

**Owner and executing service: `order-service`**

Service อ่านตามลำดับ:

1. customer identification เพื่อใช้ customer risk level
2. product master และ product mark-to-market เพื่อสร้างชื่อกองทุน, symbol, issuer, NAV และ minimum-sell validation
3. `product_mf_extension` เพื่ออ่าน risk, complexity, tax type, minimum/step, balance condition, holding-period และ penalty configuration
4. product keywords เพื่อสร้าง tags
5. customer traditional knowledge เพื่อกำหนด knowledge-assessment flag

Fund fact sheet URL ถูกอ่านแบบ best effort; ถ้า document lookup error จะคืน URL ว่างโดยไม่ทำให้ product detail request ล้มเหลว

### 3. Build agreements and fund-availability response

**Owner and executing service: `order-service`**

Response คืน product description, risk detail, asset group, fact sheet, agreement list, minimum/step/balance values, `maximum_qr_payment`, penalty และ fund availability flags โดย V2 ตัด `cut_off_time_buy`, `cut_off_time_sell` และ over-cutoff flags ออกจาก response

Agreement list เริ่มด้วย `FactSheet`, เพิ่ม `HigherRiskLevel` เมื่อ product risk สูงกว่าเพดานของ customer risk, เพิ่ม `ExchangeRateRisk` เมื่อเป็น FX risk, เพิ่ม `ComplexityRisk` เมื่อ product complexity เป็น `Complex` และปิดท้ายด้วย `DefaultAgreement`

## Business rules

- `UseFundAvailable` เป็น `true` เมื่อ product เป็น complex หรือเปิด `is_check_holding_periods`
- กองทุน complex ที่ issuer ไม่ใช่ XSpring จะไม่ available สำหรับ buy/sell; กองทุน complex ที่ issuer เป็น XSpring จึงยัง available ตาม `MapFundAvailable`
- Product ที่มี tax type และเป็น complex จะปิด buy/sell online และคืนข้อความติดต่อ XSpring/AMC สำหรับ sell
- Product ที่เปิด `is_check_holding_periods` จะเปิด buy/sell flag กลับเป็น `true` แต่ switch ยังคง `false`; penalty response จะมีข้อความตาม `penalty_rates`
- `risk_detail.is_show_risk_detail` เป็น `true` เฉพาะ complex product และ `is_required_knowledge_assessment` เป็น `true` เมื่อไม่พบ customer traditional knowledge
- `minimum_sell_amount_validation` และ `minimum_sell_unit_validation` ใช้ค่าจาก mark-to-market เมื่อค่าดังกล่าวมากกว่าศูนย์; ค่าอื่นมาจาก product extension
- Agreement/risk flags เป็น display/preparation contract; final order validation, cutoff, account status และ ledger effect อยู่ใน flow create order ของ backend

## State transitions

Flow นี้เป็น read-only:

```text
request received
→ authenticated and UUID validated
→ product/customer context loaded
→ display and eligibility response returned
```

ไม่มี order, payment, account หรือ ledger state transition จาก endpoint นี้

## Error and recovery behavior

**Owner and executing service: `order-service`**

- HTTP `401`: request ไม่มี `PortalClaims`
- HTTP `400`: missing `product_id`, customer UUID หรือ product UUID แปลงไม่ได้
- Dependency error จาก customer identification, product, mark-to-market, mutual-fund extension, keyword หรือ customer knowledge: service คืน error ให้ handler; public response mapping ต้องยืนยันกับ runtime handler/middleware ก่อนผูกเป็นรหัสย่อย
- Fact sheet document lookup failure: คืน `fund_fact_sheet` เป็นค่าว่างแบบ best effort และยังคืน product detail ได้
- Endpoint failure ไม่สร้างหรือเปลี่ยน order state จึงไม่ต้อง rollback business state

## Final outcomes

- Success: client ได้ product-order-detail V2 พร้อมเงื่อนไขการเตรียมคำสั่งและ fund/risk/penalty flags โดยไม่มี cutoff fields
- Partial document data: product detail สำเร็จแต่ `fund_fact_sheet` อาจว่างเมื่อ document lookup ล้มเหลว
- Failure: ไม่ได้ product detail และไม่มี order/payment/ledger state เปลี่ยน

## Related shared rules

- [Mutual Fund Switching](/business-flows/trading/mutual-fund-switching/)
- [Mutual Fund Sell Order Cancellation](/business-flows/trading/mutual-fund-sell-cancellation/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`order-service`:

- `routes/route.go`: `GET /api/v2/products/{product_id}` and authorization key `P0337`
- `handler/product_handler.go`: `GetProductOrderDetailV2`
- `handler/product_handler_response.go`: V2 response mapping
- `pkg/product/service.go`: `GetProductOrderDetailV2`
- `pkg/product/transform_data.go`: product detail, `MapFundAvailable`, `MapPenaltyDetail` and `GetOrderAgreement`
- `internal/entities/product.go`: product extension and response domain fields
- `pkg/customer/service.go`: customer knowledge lookup used by risk/assessment flags

---
title: White Glove Dealer FX Trade
description: Flow ขอราคาและยืนยันรายการ USD/THB ผ่าน Dealer ตั้งแต่ตรวจคำขอและ hold ยอดจนถึง ledger, portfolio และผลจาก Gateway
capability: Trading
services: [order-service, asset-consumer]
integrations: [Kafka, Payment Gateway, KTB]
aliases: [White Glove FX Trade, dealer FX trade, FX trade, FX-trade submit, order_fx_trade, bank_gateway, order_side, ซื้อขาย FX แบบ Dealer, รายการ FX สำหรับ Dealer, ซื้อขาย USD/THB, คำสั่ง FX ของ White Glove]
errorCodes: ["400", "401", "403", "404", "409", "500", "504"]
status: active
lastUpdated: 2026-10-11
documentType: flow
---

## Purpose and scope

อธิบาย Dealer FX Trade สกุล USD/THB ตั้งแต่ `order-service` รับคำขอสร้าง deal, ขอราคาและบันทึก deal ที่ยังไม่ accept, ตรวจยอดและ hold เงิน, ส่ง accept ไป Payment Gateway/KTB, ลง ledger ตามผล และส่ง logical-ledger event ให้ `asset-consumer` ปรับ portfolio

Flow นี้ครอบคลุมพฤติกรรมฝั่ง `order-service` และการ project logical ledger ใน `asset-consumer`; ไม่รวม post-trade FX exposure/auto-hedge ซึ่งอธิบายใน [Post-Trade FX Hedging](/business-flows/trading/hedging/). ไม่สรุปวิธีประมวลผลภายใน Payment backend หรือ KTB เพราะ repository เหล่านั้นไม่ได้อยู่ใน source set ของรอบนี้

## Trigger and preconditions

**Owner service: `order-service`**

**Executing service: `order-service`**

- ผู้เรียกส่ง `POST /api/v1/white-glove/fx-trade/deal/submit` พร้อม `identification_id`, `quantity`, `deal_type`, `symbol`, `side` และ optional `is_refresh`; Handler ต้องได้รับ `PortalClaims` ที่มี `Subject` และ UUID ของ identification ที่ถูกต้อง
- Backend รับเฉพาะ `quantity > 0`, `symbol = USD`, `deal_type` เป็น `SPOT`, `TODAY` หรือ `TOM`, และ `side` เป็น `BUY` หรือ `SELL` โดยตรวจ side/symbol แบบไม่สนตัวพิมพ์เล็กใหญ่
- `order-service` ใช้ identification กับ employee `Subject` เพื่อ resolve digital-asset customer account และใช้ transaction-fee configuration สำหรับ `trade_fx` เพื่อ resolve bank fee และ transfer fee ของ side นั้น
- `POST /api/v1/white-glove/fx-trade/deal/accept` รับ `trade_id` และ `identification_id`; รายการต้องยังมีสถานะ `created` และ customer ต้องมียอด `available` เพียงพอในสกุลเงินและจำนวนที่ต้องจ่ายรวม fee

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `order-service` | เป็น owner ของ Dealer FX order, ตรวจ request และ balance, บันทึก state, เรียก FX Gateway, สร้าง logical-ledger transactions และ publish customer-ledger event |
| `asset-consumer` | Consume customer logical-ledger event, เก็บ ledger projection และปรับ customer asset portfolio |
| Payment Gateway / KTB | รับคำขอ submit quote และ accept/inquiry จาก adapter ใน `order-service`; behavior ภายใน Gateway ไม่ได้ยืนยันจาก source repository ที่มีในรอบนี้ |
| Kafka topic ที่ตั้งค่าด้วย `KAFKA_TOPIC_ORDER_ASSET_CUSTOMER_LEDGER_ENTRY` | ส่ง customer logical-ledger data จาก `order-service` ไปยัง consumer `customer-logical-entry` ของ `asset-consumer` |

`CustomerService`, product lookup และ portfolio lookup ที่ใช้ใน Flow นี้ถูกเรียกผ่าน dependency ของ `order-service`; source ที่ตรวจไม่ยืนยันว่าเป็น service execution แยกสำหรับขั้นตอนดังกล่าว

## End-to-end sequence

### 1. ขอราคาและสร้าง deal ที่รอการยืนยัน

**Owner service: `order-service`**

**Executing service: `order-service`**

Handler ส่งคำขอไป `SubmitDeal`. หลัง validation และ resolve account/fee แล้ว `order-service` เรียก Hedge Gateway ด้วย USD/THB, `direction` แบบ lowercase, จำนวนที่ปัดสองตำแหน่ง และ `is_auto_accept = false`. สำหรับ SELL จำนวนที่ส่งเป็น capture amount หลังหัก transfer fee; สำหรับ BUY ใช้ quantity ที่ส่งมา

เมื่อ Gateway ตอบสำเร็จ `order-service` บันทึก `order_fx_trade` สถานะ `created`, เก็บ request/ref/deal IDs, rate, amount, fee และเวลา expiry แล้วคืนค่าให้ caller ใช้ยืนยัน deal. ระบบยังไม่ accept อัตโนมัติ

### 2. ผู้เรียกยืนยัน deal และ Backend ตรวจยอด

**Owner service: `order-service`**

**Executing service: `order-service`**

เมื่อรับ `POST /api/v1/white-glove/fx-trade/deal/accept`, service ตรวจว่า order ยัง `created`, มี bank request/ref IDs ที่ใช้ต่อได้ และมี customer account ที่ระบุได้ จากนั้นตรวจ `available_unit_balance` ของสกุลเงินที่ต้องจ่ายรวม fee:

- BUY: THB จำนวน contra amount บวก bank fee
- SELL: USD จำนวน capture amount บวก transfer fee

ถ้ายอดไม่พอ Backend คืน HTTP `400`; ถ้าสถานะไม่รับ accept แล้วคืน HTTP `409`

### 3. เปลี่ยนเป็น processing และ hold เงิน

**Owner service: `order-service`**

**Executing service: `order-service`**

ภายใน database transaction, `order-service` lock และตรวจ order ซ้ำ, เปลี่ยนสถานะ `created → processing`, แล้วบันทึก logical-ledger batch เพื่อย้ายยอดจาก customer `AVAILABLE` ไป `HOLD_IN_ORDER`. ขั้นตอน hold นี้เกิดก่อนเรียก accept Gateway

### 4. ส่ง accept และตรวจผลจาก Gateway

**Owner service: `order-service`**

**Executing service: `order-service`**

`order-service` ส่ง `request_id`, `ref_id`, `accept_status = Y`, merchant code และ `bank_gateway` ที่อ่านจาก order row ไป `FXTradeGatewayService`. ตั้งแต่ source change วันที่ 2026-10-11 ค่า `bank_gateway` ที่บันทึกใน order row และส่งใน accept request เป็น lowercase `ktb`; การเปลี่ยนนี้ไม่เปลี่ยนตัวแปร `BankGateway` ของ submit quote ที่ใช้ `HEDGE_GATEWAY_KTB = ktb`

ถ้า accept คืน `pmg005` หรือ transport timeout, service เรียก inquiry ตาม delay/configured attempts โดยจำกัดไม่เกิน 3 ครั้ง. Source ที่ตรวจยืนยันเฉพาะ request/response handling ใน `order-service`; ไม่ยืนยันว่า Payment backend รองรับ casing หรือจัดการคำขอต่ออย่างไร

### 5. Finalize order และ ledger ตามผล accept

**Owner service: `order-service`**

**Executing service: `order-service`**

| ผลที่ `order-service` จำแนกจาก response | Order state | Ledger effect |
| :--- | :--- | :--- |
| `pmg000` พร้อม `status = SUCCESS` และ `response_code = 00` หรือ `200` | `processing → completed` | ลด customer `HOLD_IN_ORDER`; เพิ่มยอดที่จ่ายสุทธิให้ XD main; ลด XD main ด้วยสกุลเงิน/ยอดรับ; เพิ่ม customer `AVAILABLE` ด้วยยอดรับสุทธิ; บันทึก fee ใน XD fee ledger เมื่อมี fee |
| `pmg999` พร้อม `status = FAIL` หรือ response code `400` | `processing → rejected` | ลด customer `HOLD_IN_ORDER` และคืนยอดเข้า customer `AVAILABLE` |
| `pmg005` ที่ยัง unresolved หรือ response ที่ไม่เข้า outcome ที่รู้จัก | คง `processing` | ยอดยังอยู่ใน `HOLD_IN_ORDER`; source path นี้ไม่ finalize หรือปล่อย hold เมื่อผลยังไม่ชัดเจน |

การเปลี่ยน order state และสร้าง logical-ledger batch ทำผ่าน transaction ของ `order-service`. ผลจาก Gateway ถูกใช้จำแนกเฉพาะใน service นี้; behavior ภายใน Gateway อยู่นอกขอบเขตหลักฐาน

### 6. Project logical ledger ไปยัง portfolio

**Owner service: `order-service`**

**Executing service: `asset-consumer`**

`order-service` publish customer logical-ledger data ด้วย customer identification เป็น key ไปยัง topic ที่ตั้งค่าด้วย `KAFKA_TOPIC_ORDER_ASSET_CUSTOMER_LEDGER_ENTRY`. Consumer `customer-logical-entry` ใน `asset-consumer` บันทึก ledger projection และ update asset portfolio ภายใน transaction ของ consumer ก่อน publish portfolio update ต่อ

การ update portfolio เป็น asynchronous projection หลัง `order-service` สร้าง ledger event; จึงอาจเกิดหลัง API accept ตอบกลับ

### 7. หมดอายุ deal ที่ยังไม่ accept

**Owner service: `order-service`**

**Executing service: `order-service`**

Service-account endpoint `POST /api/v1/white-glove/fx-trade/deal/expire` เปลี่ยนเฉพาะ order ที่ยัง `created`, มี `deal_expire_at` และเวลานั้นถึงหรือก่อน cutoff เป็น `expired`. Repository recheck เงื่อนไขใน update; รายการที่ `processing` จะไม่ถูกเปลี่ยนเป็น expired. Source ยืนยัน endpoint แต่ไม่ยืนยันว่า scheduler/job ใดเป็นผู้เรียก

### 8. อ่าน order history หรือ detail

**Owner service: `order-service`**

**Executing service: `order-service`**

`GET /api/v1/white-glove/fx-trade/order-history` map counterparty เป็น `KTB` และ direction เป็น `Buy`/`Sell`. `GET /api/v1/white-glove/fx-trade/{order_id}` ก็จัดรูป counterparty และ direction เป็น display format; ผู้ใช้จึงไม่ได้รับ raw lowercase จาก row ผ่าน detail response

## Business rules

- Submit รับเฉพาะ USD และ deal type `SPOT`, `TODAY`, `TOM`; Side รับ `BUY`/`SELL` แบบ case-insensitive
- Fee ถูกหาแยกตาม `side`; bank fee ต้องเป็น THB และ transfer fee ต้องเป็น USD. ถ้าไม่มี fee row ที่ match side จะใช้ active fee ที่ match เงื่อนไขว่างได้
- Submit quote ตั้ง `is_auto_accept = false`; order เริ่ม `created` และต้องผ่าน accept endpoint แยกต่างหาก
- `order_side` และ `bank_gateway` ใน `order_fx_trade` ใหม่ถูก persist เป็น lowercase. Accept request ส่ง `bank_gateway = ktb`; list/detail API แปลงค่าที่แสดงกลับเป็น `KTB` และ `Buy`/`Sell`
- จัดการ pending hold และ settlement จากผลที่ Backend จำแนก; ห้ามสรุปว่า HTTP success ของ submit เท่ากับ completed trade
- Payment backend repository ไม่อยู่ใน source set นี้ จึงยังต้องยืนยัน contract ของ `bank_gateway = ktb` กับเจ้าของ Payment Gateway ก่อนสรุป behavior ปลายทาง

## State transitions

**Owner service: `order-service`**

```text
Gateway quote success → created
created → processing + customer AVAILABLE to HOLD_IN_ORDER
processing → completed + settlement ledger       [Gateway success is classified]
processing → rejected + hold released            [Gateway rejection is classified]
processing → processing + hold retained          [outcome pending or unrecognized]
created → expired                                [expire endpoint; deal_expire_at reached]
```

ไม่พบหลักฐานใน Flow นี้ว่ามีการเปลี่ยน `processing` ที่ unresolved กลับเป็น `created` หรือปล่อย hold ด้วย background recovery

## Error and recovery behavior

- Request/side/quantity/symbol/deal type ไม่ผ่าน validation: submit handler คืน HTTP `400`; ไม่มีหลักฐานว่า order ถูกสร้างก่อน validation ผ่าน
- ไม่มีหรือไม่ผ่าน `PortalClaims`: submit/accept คืน HTTP `401`; service-account expire endpoint มี authorization guard ที่อาจปฏิเสธ request (`401`/`403` ตาม handler contract)
- ก่อนเรียก accept หาก customer `available` ไม่พอ: คืน HTTP `400` และไม่เริ่ม hold
- Order ไม่อยู่สถานะ `created` หรือมี accept ซ้ำหลัง finalize: คืน HTTP `409`
- อ่าน detail ด้วย order ID ที่ไม่พบ: คืน HTTP `404`
- Gateway ปฏิเสธด้วย `pmg999`/`FAIL` หรือ code `400`: order ถูก finalize เป็น `rejected` และปล่อย hold แต่ handler map Gateway error เป็น HTTP `500`
- Gateway outcome เป็น `pmg005` หรือ request timeout: ทำ inquiry ได้ไม่เกิน 3 ครั้งตาม configured delay; หากยัง unresolved handler คืน HTTP `504` และ order ยังคง `processing` พร้อม hold
- Gateway success แต่สร้าง local order row ไม่สำเร็จ: submit คืน error พร้อม log request/ref/deal identifiers เพราะ bank-side deal อาจมีอยู่แล้วและต้อง reconcile
- Gateway success แต่ local finalize/ledger transaction ล้มเหลว: accept คืน error; transaction rollback ทำให้ order ยัง `processing` และ hold จาก transaction ก่อนหน้าอยู่ โดย source ที่ตรวจไม่ยืนยัน automatic recovery
- สำหรับ SELL, net receive ถูกคำนวณจาก contra amount หัก bank fee หลัง Gateway response; ถ้าไม่เป็นบวก row จะถูก persist แล้ว service คืน validation error
- Failure ระหว่าง accept, logical-ledger creation หรือ event publish ถูกส่งกลับจาก `order-service`; source ที่ตรวจไม่ยืนยัน retry/DLQ หรือ automatic recovery สำหรับ failure เหล่านี้
- `asset-consumer` บันทึก ledger projection และ update portfolio ใน consumer transaction; retry/offset behavior ของ runtime ไม่สรุปจาก business service อย่างเดียว

## Final outcomes

- `created`: quote/deal ถูกบันทึกและรอ accept หรือ expiry
- `completed`: Gateway outcome ผ่าน success rule และ ledger settlement ถูกสร้าง
- `rejected`: Gateway rejection ถูกจำแนกและ customer hold ถูกปล่อย
- `expired`: deal ที่ยัง created หมดเวลาและถูก service-account endpoint เปลี่ยนสถานะ
- `processing`: accept ยังทำงานหรือผล Gateway ยังไม่ยืนยัน; customer funds ยังคงถูก hold
- หลัง ledger event ถูก consume, `asset-consumer` ปรับ logical-ledger projection และ customer asset portfolio

## Related shared rules

- [Permissions](/shared-rules/permissions/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

- `order-service/routes/route.go`: White Glove FX Trade routes and authorization keys
- `order-service/handler/white_glove_fx_trade_handler.go`: submit, accept, history/detail and expire handlers
- `order-service/handler/white_glove_dto.go`: request/response fields and display casing
- `order-service/pkg/order_fx_trade/service_submit.go`: validation, fee resolution, Gateway submit and lowercase persistence
- `order-service/pkg/order_fx_trade/service.go`: accept balance check and accept request mapping
- `order-service/pkg/order_fx_trade/service_accept_flow.go`: hold, state transition and finalize handling
- `order-service/pkg/order_fx_trade/service_accept_inquiry.go`: timeout/pending inquiry behavior
- `order-service/pkg/order_fx_trade/service_ledger.go`: logical-ledger batch and customer event publication
- `order-service/pkg/order_fx_trade/service_expire.go` and `order-service/storages/postgres/ordercryptorepository/order_fx_trade_expire_repository.go`: expiry cutoff and eligible status
- `order-service/internal/domain/order_fx_trade.go`: accept states, payment amount and ledger rules
- `order-service/third_party/hedgegateway/` and `order-service/third_party/fxtradegateway/`: Gateway request/response adapters
- `order-service/pkg/produce/service.go`: customer logical-ledger topic producer
- `asset-consumer/cmd/customer-logical-entry/main.go` and `asset-consumer/pkg/customer-logical-entry/service.go`: logical-ledger consume and portfolio projection

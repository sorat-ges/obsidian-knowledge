---
title: Swap Limit Order
description: Flow คำสั่ง Swap Limit ตั้งแต่ตั้งราคาและ estimate, สร้าง order, hold balance, ส่ง Remarketer, partial fill, cancellation, ledger และ portfolio
capability: Trading
services: [order-service, order-consumer, asset-service, asset-consumer]
integrations: [Remarketer, kafka]
aliases: [swap limit, limit order, open order, cancel limit order, cancel limit order on account freeze, suspended account limit order, ตั้งราคารอซื้อขาย, คำสั่งลิมิต, ยกเลิกคำสั่งลิมิต, ยกเลิกคำสั่งลิมิตเมื่อบัญชีถูกระงับ]
errorCodes: ["60002"]
status: active
lastUpdated: 2026-08-27
documentType: flow
---

## Purpose and scope

<span class="search-alias-variants sr-only" aria-hidden="true" data-pagefind-weight="10">คำ สั่ง ลิ มิต</span> คำสั่งลิมิต (Swap Limit Order) คือ Swap แบบ `limit` ที่ลูกค้ากำหนดราคาและรอ Remarketer จับคู่ หน้านี้ครอบคลุมตั้งแต่ client ตรวจขั้นต่ำและคำนวณ estimate, `order-service` สร้าง order, `order-consumer` ล็อกยอดและส่งคำสั่ง, Remarketer callback, การยกเลิก, ledger settlement จน `asset-consumer` materialize portfolio

Create API ตอบสำเร็จหมายถึงรับคำสั่งแล้ว ไม่ได้หมายความว่า trade ถูก match แล้ว สินทรัพย์ต้นทางจะอยู่ใน `HOLD_IN_ORDER` จนคำสั่งถูก fill, reject หรือ cancel

## Trigger and preconditions

**Owner service: `order-service`**

- Client เลือก `order_type = limit`, side `buy` หรือ `sell`, ระบุ source amount และ limit `price`
- Customer endpoint ใช้ channel ตาม client ได้แก่ `XspringApp` หรือ `TradeWeb`
- Digital Asset account status ต้องอนุญาต operation: `active` อนุญาตทุก side, `suspended` อนุญาตเฉพาะ SELL (`swap_sell`), ส่วน `closed`/`freeze` ไม่อนุญาตทั้ง BUY และ SELL; `60002` ใช้เมื่อถูก block
- คู่สินทรัพย์ต้อง swap ได้, product ต้อง on-shelf/tradable สำหรับ channel และ investor class, เอกสารที่เกี่ยวข้องต้องไม่หมดอายุ
- คู่สินทรัพย์ต้องไม่อยู่ใน maintenance
- Source amount ต้องไม่น้อยกว่า configured minimum และ available balance ต้องเพียงพอ
- Retail Limit Order ไม่ต้องเลือก Remarketer route; `order-service` persist `route = null`

`trading-web` และ `xspring-mobile-app` ที่ committed HEAD ปัจจุบันปิด Limit Order เมื่อ crypto symbol เป็น `SIRIHUB2` หรือ `AQUAROUS` แต่ Backend ไม่มี symbol-specific rejection นี้ จึงเป็น client-side restriction ไม่ใช่กฎที่ Backend บังคับ

## Participating services

| Service/Integration | Role |
| :--- | :--- |
| `order-service` | Business owner; คำนวณ estimate, validate, สร้าง order, publish event, รับ Remarketer webhook, คำนวณ fill/refund และสร้าง settlement ledger |
| `order-consumer` | Executing service; recheck balance, ย้าย source asset เข้า `HOLD_IN_ORDER`, submit/cancel ที่ Remarketer และเปลี่ยน order เป็น `processing` หรือ `rejected` |
| Remarketer | รับ Limit Order, เก็บคำสั่งรอ match, รับคำสั่ง cancel และส่ง callback ของ fill/reject |
| `asset-service` | Business owner ของ portfolio/balance ที่ downstream เปิดเผย |
| `asset-consumer` | Executing service ที่ consume logical-ledger event และ materialize `asset_portfolio` |
| kafka | ส่ง create/cancel order event ไป `order-consumer` และส่ง logical-ledger event ไป portfolio processing |

`order-consumer` และ `asset-consumer` เป็น executors ของ asynchronous steps ไม่ใช่ Business owner ของ Trading flow

## End-to-end sequence

### 1. Load market rate and calculate Limit estimate

**Owner service: `order-service`**

**Executing service: `order-service`**

Client ใช้ market rate เป็นค่าตั้งต้นและเรียก estimate ด้วย `unit`, `rate`, `swap_pair` และ `side`:

- Mobile: `POST /api/v1/order-crypto/swap-limit-estimated/inquiry`
- Trade Web: `POST /api/v1/trading/order-crypto/swap-limit-estimated/inquiry`

`order-service` เลือก fee จาก customer account และ product แล้วคำนวณ:

- BUY: fee ถูกหักจาก source THB ก่อนหารด้วย rate เพื่อหา estimated received crypto
- SELL: `matched amount = unit × rate`, หัก fee แล้วได้ estimated received fiat
- Response คืน `minimum_amount`, `minimum_amount_display`, fee rate/amount และ net amount สำหรับแสดง preview

Trade Web ใช้ minimum จาก response ทำ client validation และยังไม่เรียก estimate ต่อเมื่อ source amount ต่ำกว่าขั้นต่ำ

### 2. Submit the Limit Order

**Owner service: `order-service`**

**Executing service: `order-service`**

Client ส่ง:

- Mobile: `POST /api/v1/order-trade/swap`
- Trade Web: `POST /api/v1/trading/order-trade/swap`

Payload หลักคือ `from_symbol`, `from_unit`, `to_symbol`, `side`, `order_type = limit`, `price`, `estimate_received_quantity`, `fee_amount` และ `fee_rate`

Backend:

1. ตรวจ authentication, suspension, side และ maintenance
2. ตรวจ investor class, minimum, trade pair, product-on-shelf, document expiry และ available balance
3. เมื่อ `order_type = limit`, `CanSwap` return หลัง eligibility checks โดยไม่เรียก route/order-book/liquidity pre-validation
4. ปัด source quantity ตาม decimal digit ของ source product
5. สร้าง `order_trade`, `order_trade_info` และ action flow ใน database transaction
6. เปลี่ยน `draft` → `open`
7. Retail order persist `route = null`
8. Publish Kafka `CreateOrderSwap` หลัง database transaction

Create path persist `price`, fee และ estimate จาก request โดยไม่เรียก Limit estimate ซ้ำ

### 3. Recheck and hold source balance

**Owner service: `order-service`**

**Executing service: `order-consumer`**

เมื่อ `order-consumer` รับ `CreateOrderSwap`:

1. โหลด order และ recheck available balance
2. สร้าง ledger movement จาก `AVAILABLE` ไป `HOLD_IN_ORDER`
3. Publish logical-ledger event
4. BUY ล็อก source fiat ซึ่งปกติคือ THB
5. SELL ล็อก crypto ที่ลูกค้าต้องการขาย

การ hold ทำให้ available ลดและ pending-out เพิ่ม แต่ total holding ยังไม่ลดจนมีผลการ match

### 4. Submit to Remarketer

**Owner service: `order-service`**

**Executing service: `order-consumer`**

`order-consumer` ส่ง `client_order_id`, symbol/pair, side, placed quantity, `route = null` สำหรับ retail, callback URL, limit price, `order_type = limit`, volume size และ client type ไป Remarketer

สำหรับ BUY, placed quantity ถูกคำนวณจาก source order quantity หลังหัก fee ตาม order data เมื่อ Remarketer รับคำสั่งสำเร็จ ระบบเก็บ Remarketer order ID และเปลี่ยน `open` → `processing`

### 5. Process fill or reject callback

**Owner service: `order-service`**

**Executing service: `order-service`**

Remarketer เรียก `POST /api/v1/order-trade/webhook`:

| Callback | Current behavior |
| :--- | :--- |
| `filling` | เปลี่ยน order ไป `filling` และยังคง remaining source amount ใน Hold |
| `filled` ที่ยังมี remaining quantity | บันทึก transaction/exchange, settle fill ปัจจุบัน และรอ callback ถัดไป |
| final `filled` | aggregate fills/fee, สร้าง executed และ refund ledger, เปลี่ยน `sync-ledger` → `filled` |
| `rejected` ก่อนมี fill | คืน Hold ทั้งหมดและจบ `rejected` |
| `rejected` หลัง partial fill | รักษา fill เดิม, คืนส่วนที่เหลือ และจบ `filled` |

Webhook quantity และ price ที่ execute จริงเป็น source of truth ของ settlement ไม่ใช่ estimate ตอนสร้าง order

### 6. Cancel an open Limit Order

**Owner service: `order-service`**

**Executing service: `order-service` และ `order-consumer`**

Customer ใช้ `POST /api/v1/order-trade/:order_trade_id/cancel`; Trade Web ใช้ route ภายใต้ `/api/v1/trading/order-trade/:order_trade_id/cancel` และมี API cancel-all สำหรับรายการที่ผ่านเงื่อนไข

`order-service` ตรวจ ownership, order type ต้องเป็น `limit`, status ต้องไม่ใช่ `cancelled`/`filled`/`rejected`, ต้องไม่อยู่ระหว่าง cancel และ remaining quantity ต้องไม่เป็นศูนย์ จากนั้น:

1. ตั้ง `is_cancelling = true` พร้อมเหตุผล `cancelled_by_customer`
2. Publish Kafka `CancelSwapOrder`
3. `order-consumer` ตรวจ flag/status แล้วเรียก Remarketer cancel
4. Remarketer ส่ง `rejected` callback เพื่อให้ `order-service` finalize cancellation

ถ้ายังไม่มี fill ระบบคืน Hold ทั้งหมดและจบ `cancelled`; ถ้ามี partial fill ระบบรักษาส่วนที่ execute, คืน remaining Hold และจบ `filled` พร้อม cancellation reason

### 7. Apply ledger and expose the final portfolio

**Owner service: `asset-service`**

**Executing service: `asset-consumer`**

`asset-consumer` consume logical-ledger batches, บันทึก audit, สร้าง portfolio เมื่อยังไม่มี, ปรับ balance และคำนวณ/reset cost fields ภายใน database transaction จากนั้น `asset-service` เปิดเผย balance และ report ที่รวม hold, fill และ refund แล้ว

### 8. Cancel pending Limit Orders after account status change

**Owner service: `order-service` สำหรับ cancellation policy; `onboarding-service` เป็น owner ของ status event**

**Executing service: `order-consumer` เป็น `CustomerSync` trigger และ cancel-event executor; `order-service` เป็น order-state executor**

เมื่อ `order-consumer` ได้รับ `CustomerSync` ที่มี Digital Asset account status ไม่ใช่ `active` จะเรียก `/api/v1/customer/suspend/cancel-orders` `order-service` เลือกเฉพาะ non-terminal Limit Order ตาม side:

- `suspended`: cancel เฉพาะ BUY; SELL ไม่เข้า system-cancel branch
- `closed` หรือ `freeze`: cancel ทั้ง BUY และ SELL

สำหรับแต่ละรายการ `order-service` ตั้ง `is_cancelling = true`, ใช้ reason `CancelledBySystem` และ publish `CancelSwapOrder`; `order-consumer` จึงเป็น executor ของ asynchronous cancellation ต่อไปยัง Remarketer และ callback เป็นตัวกำหนด final outcome ตาม partial-fill state

## Business rules

- Limit Order ผ่าน minimum validation แต่ข้าม route/order-book/liquidity pre-validation
- Retail Limit Order persist `route = null`; White Glove Dealer variant อาจคง route จาก request เพราะ `IsDealerTrading` ต่างจาก retail
- `order_quantity` ถูกปัดตาม decimal configuration ของ source product
- Fee rate, fee amount, estimate และ price มาจาก client payload; Backend create path ไม่ recompute ค่าเหล่านี้
- BUY hold source fiat; SELL hold source crypto
- Partial fill settle ได้หลายครั้งและ remaining quantity ยังคงอยู่ใน Hold
- Reject หรือ cancel หลัง partial fill จบ status เป็น `filled` เพราะมี trade ที่เกิดขึ้นแล้ว
- Backend cancel predicate กว้างกว่า client UI: Backend รับ non-terminal Limit Order ที่ยังมี remaining quantity ขณะที่ Mobile UI ปัจจุบันแสดง cancel เฉพาะ status `open`
- Account status gate ของ Digital Asset แยกตาม side: `suspended` ยังสร้าง/ทำ SELL ได้ แต่ไม่ให้ BUY; `closed`/`freeze` block ทั้งสอง side
- `SIRIHUB2` และ `AQUAROUS` ถูกปิดเฉพาะใน supporting clients; Backend generic validation ไม่บังคับ restriction นี้
- Database transaction กับ Kafka publish ไม่ใช่ atomic operation เดียวกัน
- System cancellation หลัง status event ใช้ side-specific selection และไม่ยกเลิก Market Order เพราะ repository query จำกัด `order_type = limit`

## State transitions

**Owner service: `order-service`**

```text
draft → open → processing → filling → sync-ledger → filled
          │         │          │
          │         │          └─ cancel/reject after partial fill → sync-ledger → filled
          │         └─ cancel before fill → cancelled
          └─ async validation/placement failure → rejected
```

`is_cancelling = true` เป็น flag ระหว่างรอ `CancelSwapOrder` processing และ Remarketer callback ไม่ใช่ order status แยก

เมื่อ status event เรียก system cancellation: `non-active CustomerSync → order-service selection → is_cancelling = true → CancelSwapOrder → order-consumer/Remarketer callback`; ถ้ามี partial fill final state ยังเป็น `filled` ตาม callback contract

## Error and recovery behavior

- Request/body/side ไม่ถูกต้อง, maintenance, minimum, pair/product/document validation หรือ synchronous balance check ไม่ผ่าน: Create API ไม่สร้างคำสั่ง
- Digital Asset account status ไม่อนุญาตตาม side: HTTP `400`, code `60002` (`ErrorCustomerSuspend`); Digital Asset handler ใช้ข้อความ `customer is <status>.`
- Consumer balance recheck ไม่ผ่าน: Create API อาจตอบสำเร็จแล้ว แต่ order ถูกเปลี่ยนเป็น `rejected`
- Hold สำเร็จแต่ Remarketer placement ล้มเหลว: consumer reject order และสร้าง ledger คืน `HOLD_IN_ORDER` ไป `AVAILABLE`
- Kafka create publish ล้มหลัง order transaction: API คืน error แต่ order อาจคงอยู่ที่ `open`; ต้องตรวจ order row/event processing ก่อน client retry
- Cancel event publish ล้มหลังตั้ง `is_cancelling = true`: API คืน error แต่ flag อาจค้าง ต้องตรวจ order/event ก่อน retry
- Consumer เรียก Remarketer cancel ล้มเหลว: current consumer path log error แล้วจบโดยไม่ clear `is_cancelling`; ต้อง monitor/retry event หรือแก้สถานะตาม operational procedure
- System cancellation ของ pending Limit Order ถ้า selection, order lookup, consumer หรือ Remarketer path ล้มเหลว อาจค้างที่ `is_cancelling`; `CustomerSuspendService` เก็บ failure/ส่ง internal notification แต่ไม่ยืนยัน rollback ของรายการอื่น
- Callback race ระหว่าง fill กับ cancel ถูกตัดสินจาก callback และข้อมูล partial fill ที่ Backend เห็น: ส่วนที่ execute คงอยู่ ส่วน remaining จึงถูกคืน
- Client-only block ของ `SIRIHUB2`/`AQUAROUS` ไม่ป้องกัน API client อื่น จึงต้องยืนยันกับ Business owner ว่าต้องเป็น Backend rule หรือไม่

## Final outcomes

- Full fill: settle executed quantity/fee, คืนส่วนเกินถ้ามี และจบ `filled`
- Partial fill: settle เฉพาะแต่ละ fill และคง remaining source amount ใน Hold
- Reject ก่อน fill: คืน Hold ทั้งหมดและจบ `rejected`
- Reject/cancel หลัง partial fill: เก็บ trade ที่สำเร็จ, คืน remaining Hold และจบ `filled`
- Cancel ก่อน fill: คืน Hold ทั้งหมดและจบ `cancelled`
- `suspended` status event: pending BUY Limit Order ที่ cancellation สำเร็จจบ `cancelled`; pending SELL ไม่ถูก system-cancel จาก branch นี้
- `closed`/`freeze` status event: pending BUY/SELL Limit Order ที่ cancellation สำเร็จเข้าสู่ cancellation flow เดียวกัน; partial fill ยึด final callback
- Portfolio และ report สะท้อนผลหลัง `asset-consumer` apply logical-ledger events

## Related shared rules

- [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Permissions and Access Control](/shared-rules/permissions/)
- [Third-Party Integrations Profile](/system-context/integrations/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)

## Code references

`order-service`:

- `routes/route.go`: customer, Trade Web และ White Glove endpoints
- `handler/order_crypto.go`: Mobile Limit estimate response
- `handler/trading_handler.go`: Trade Web Limit estimate/create/cancel handlers
- `handler/order_trade_handler.go`: customer create/detail/cancel/cancel-all handlers
- `handler/order_trade_dto.go`: create payload mapping
- `pkg/order_crypto/service.go`: Limit fee, net amount และ minimum calculation
- `pkg/order_trade/service.go`: `CanSwap`, cancellation predicates และ cancel event publication
- `pkg/order_trade/swap_service.go`: order persistence, retail route resolution และ cancellation settlement
- `pkg/order_trade/webhook_service.go`: fill/reject callback, ledger และ final status
- `pkg/customer/suspend_service.go`: status-specific Limit Order selection และ system cancellation trigger

`order-consumer`:

- `pkg/digital-asset-order-request/service.go`: dispatch `CreateSwapOrder` และ `CancelSwapOrder`
- `pkg/digital-asset-order-request/swap.go`: balance recheck, hold, Remarketer submit/cancel, reject และ hold reversal
- `pkg/customer-account/service.go`: `CustomerSync` non-active trigger ของ system cancellation

Supporting frontend:

- `trading-web/src/features/trade/hooks/swap/use-swap.ts`
- `trading-web/src/features/trade/components/trading/swap/swap-limit-form.tsx`
- `xspring-mobile-app/lib/domains/digital_portal/swap/controller.dart`
- `xspring-mobile-app/lib/domains/digital_portal/order_history/order_detail/controller.dart`

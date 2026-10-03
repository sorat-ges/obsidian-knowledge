---
title: Post-Trade FX Hedging
description: Flow บันทึก USD exposure จาก trade activity และส่ง hedge เมื่อ Outstanding Balance ถึง threshold
capability: Trading
services: [order-service, order-consumer]
integrations: [Kafka, Bank Gateway, KTB]
aliases: [hedge, hedging, fx management, fx-management/information, FX management information, auto hedge, order-hedge-transaction, OsBalance, outstanding FX balance, OriginalNavBuy, OriginalNavPU, OriginalNavSell, ป้องกันความเสี่ยงค่าเงิน, ยอดคงค้าง FX]
errorCodes: ["400", "401"]
status: active
lastUpdated: 2026-10-03
documentType: flow
---

## Purpose and scope

อธิบาย post-trade flow ที่บันทึก FX movement, คำนวณ `OsBalance` และเรียก Bank Gateway เมื่อ exposure ถึง threshold ที่กำหนด รวม read contract ของ FX management information. Flow นี้ไม่อธิบายการสร้าง order ต้นทางหรือรายละเอียดของ bank settlement ที่อยู่นอก `order-service`.

## Trigger and preconditions

**Owner service: `order-service`**

หลัง trade fill, producer จะส่ง hedge event เมื่อเปิด `FEATURE_PRODUCE_FX_MOVEMENT_HEDGE_TRANSACTION`, มี exchange อย่างน้อยหนึ่งรายการ, customer quote currency ไม่ใช่ USD และ exchange รายการแรกเป็น USD pair. การไม่ผ่านข้อใดข้อหนึ่งจะไม่ส่ง `order-hedge-transaction`.

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `order-service` | ตัดสินใจ publish event, รับ movement request, persist exposure และประเมิน auto-hedge threshold |
| Kafka topic `order-hedge-transaction` | ส่ง customer trade activity ไปยัง asynchronous consumer |
| `order-consumer` | Consume hedge event และเรียก movement API ของ `order-service` |
| Bank Gateway (`KTB`) | External execution ของ FX hedge transaction |

## End-to-end sequence

### 1. Publish eligible trade activity

**Owner service: `order-service`**

**Executing service: `order-service`**

เมื่อเงื่อนไขใน Trigger ผ่าน producer ส่ง transaction ID และ activity ของ exchange รายการแรกไป Kafka topic `order-hedge-transaction`. การ publish failure ถูก log หลัง trade flow ทำงานต่อ; ไม่ยืนยันว่ามี hedge movement ถูกสร้างจาก event นั้น.

### 2. Forward the movement request

**Owner service: `order-service`**

**Executing service: `order-consumer`**

`order-consumer` consume event แล้วเรียก `POST /api/v1/fx-management/movement` แบบ asynchronous เพื่อให้ `order-service` ประมวลผล customer activity.

### 3. Record FX movement and update exposure

**Owner service: `order-service`**

`order-service` บันทึก movement ใน `fx_movement_auto_hedge` และอัปเดต `OsBalance`:

| Trade side | Movement direction | `OsBalance` update |
| :--- | :--- | :--- |
| BUY | `OUT` | `OldOsBalance - ExecutedAmount` |
| SELL | `IN` | `OldOsBalance + ExecutedAmount` |

Weighted Average Cost ใช้เมื่อ position ขยายในทิศทางเดิม; เมื่อ position ลดลง Average Cost คงเดิมจน position flip side.

### 4. Evaluate the configured threshold

**Owner service: `order-service`**

- Customer-triggered activity ใช้ `FxMovementAutoHedgeThreshold`.
- Scheduled hedge ใช้ `FxMovementScheduleHedgeThreshold`.
- ทั้งสอง path เปรียบเทียบค่าสัมบูรณ์ของ `OsBalance`; ถ้ายังต่ำกว่า threshold จะเก็บ movement แล้วจบโดยไม่ส่ง hedge.
- เมื่อ `abs(OsBalance)` เท่ากับหรือมากกว่า threshold จะเดินต่อไปประเมิน hedge.

### 5. Send hedge instruction

**Owner service: `order-service`**

เมื่อถึง threshold `order-service` ส่งคำสั่งไป Bank Gateway ตาม sign ของ exposure:

- `OsBalance < 0` (Short): BUY เพื่อลด position.
- `OsBalance > 0` (Long): SELL เพื่อลด position.

FX transaction ถูกบันทึกใน `order_fx_transaction`; movement history ยังคงอยู่ใน `fx_movement_auto_hedge`.

### 6. Read FX management information

**Owner service: `order-service`**

`GET /api/v1/fx-management/information` เป็น read-only dashboard endpoint ที่ต้องใช้ `PortalClaims` และรับปีตั้งแต่ 2025 เป็นต้นไป. FX mark-to-market response map `Buy` จาก `OriginalNavBuy` และ `Sell` จาก `OriginalNavPU`; implementation ไม่ได้ใช้ `OriginalNavSell` สำหรับ field `Sell` นี้.

## Business rules

- Event producer guard ต้องผ่านทุกเงื่อนไขก่อน publish; การเป็น USD pair อย่างเดียวไม่พอ.
- Customer-triggered และ scheduled path ใช้คนละ threshold configuration.
- `OsBalance` ใช้ absolute value ตัดสิน threshold; direction ของคำสั่ง hedge ใช้ sign ของ balance.
- `GET /api/v1/fx-management/information` แสดง `Sell = OriginalNavPU` ตาม current mapping.

## State transitions

**Owner service: `order-service`**

Flow นี้ไม่มี order state machine ใหม่; การเปลี่ยนข้อมูลที่ยืนยันได้คือ:

```text
trade activity → fx_movement_auto_hedge / OsBalance update → [threshold reached] → hedge request / order_fx_transaction
```

การเปลี่ยนผลสำเร็จหรือสถานะ settlement ภายใน Bank Gateway ไม่ได้ยืนยันจาก path นี้.

## Error and recovery behavior

- Kafka publish failure ถูก log โดย trade callback ไม่เปลี่ยนผล callback เป็น failure; event จึงอาจไม่มี movement downstream.
- Error จากการ consume/call movement API ต้องตรวจจาก consumer result และ service logs; source ที่ตรวจไม่ยืนยัน retry, dead-letter หรือ recovery policy เพิ่มเติม.
- Error ระหว่าง persist movement, คำนวณ threshold หรือเรียก Bank Gateway ส่งกลับจาก hedge service; ห้ามสรุปว่า FX transaction สำเร็จจากการมี trade fill เพียงอย่างเดียว.

## Final outcomes

- ต่ำกว่า threshold: movement และ Outstanding Balance ถูกเก็บเพื่อใช้ประเมินครั้งถัดไป โดยไม่มี hedge request.
- ถึง threshold: `order-service` ส่ง BUY หรือ SELL ตาม sign ของ `OsBalance` และบันทึก FX transaction ตามผลของ gateway path.
- Dashboard information อ่าน current mark-to-market/exposure โดยไม่เปลี่ยน FX state.

## Related shared rules

- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)

## Code references

- `order-service/pkg/order_trade/webhook_service.go`: producer guard และ Kafka event
- `order-consumer/pkg/hedge-transaction/service.go`: consume และ forward movement request
- `order-service/pkg/hedge/service.go`: movement, threshold, hedge execution และ FX information mapping
- `order-service/handler/hedge_handler.go`: FX management endpoints

---
title: Mutual Fund Sell Order Cancellation
description: Flow ยกเลิกคำสั่งขายกองทุนรวมโดย customer ตั้งแต่ตรวจ cutoff และ effective date จนถึงยกเลิก FundConnext และ payment records
capability: Trading
services: [order-service, order-consumer, xspring-mobile-app]
aliases: [mutual fund sell cancellation, cancel MF sell order, cancel sell order, system cancel sell on freeze, closed account sell cancellation, holding-period penalty, check-holding-period, sell penalty warning, ยกเลิกคำสั่งขายกองทุน, ยกเลิกคำสั่งขายกองทุนรวม, ยกเลิกคำสั่งขายเมื่อ Freeze, แจ้งเตือนค่าปรับขายกองทุน, ตรวจสอบระยะเวลาถือครอง, cancel mutual fund order]
integrations: [FundConnext]
errorCodes: ["400", "401", "404", "500", "60002", "60004"]
status: active
lastUpdated: 2026-09-15
documentType: flow
---

## Purpose and scope

อธิบาย customer cancellation ของคำสั่งขาย Mutual Fund ผ่าน `order-service` รวม cancel predicate, การเรียก `FundConnext.CancelOrder`, การเปลี่ยน state, การยกเลิก payment records และ system cancellation เมื่อ account เป็น `closed` หรือ `freeze`

หน้านี้ไม่ครอบคลุม ICO, digital-asset order หรือ switch order ซึ่งมี cancellation predicate แยกกัน และไม่สรุป frontend behavior ของ cancellation endpoint เพราะ `order-service` เป็น owner ของ cancellation policy; อย่างไรก็ตาม mobile sell flow มี holding-period penalty preflight ก่อน review ซึ่งเป็น warning/read-only contract แยกจาก cancellation

## Trigger and preconditions

**Owner service: `order-service`**

- Request ใช้ `POST /api/v1/order/cancel` พร้อม `order_request_id` และ `order_type = sell`
- order request ต้องหาได้ และมี payment ที่สัมพันธ์กับ order
- channel ของ order ต้องไม่ใช่ `WEARE_WEB`
- status ต้องอยู่ใน `AllowStatusCancelSell`: `order-request`, `order-confirm`, `failed` หรือ `waiting-allot`
- effective date, product cutoff และ `ResponseTransactionID` ต้องผ่านกฎตามสถานะที่อธิบายด้านล่าง

## Supporting mobile sell penalty check

**Owner service: `order-service`**

**Executing client: `xspring-mobile-app` สำหรับการเรียก preflight และแสดงผล; `order-service` สำหรับการคำนวณ**

ก่อนเปิด sell review, mobile เรียก `POST /api/v1/order/check-holding-period` (P0299) ด้วย `account_id`, `order_type = sell`, `product_id`, ค่า `order_unit` ที่มากกว่า 0, `order_unit_type` เป็น `amount`, `unit` หรือ `all_unit` และ `effective_date` รูปแบบ ISO date ที่ไม่ย้อนหลัง

`order-service` อ่าน `product_mf_extension`: ถ้า `is_check_holding_periods = false` จะคืน `is_penalty = false`; ถ้าเป็น date-to-date จะค้นหา sell orders สถานะ `waiting-allot` ของ account/product เดียวกัน รวมคำขอใหม่กับยอดเดิม และแปลง amount/unit แบบผสมด้วย mark-to-market ก่อนอ่าน portfolio aging กฎ penalty เป็นดังนี้:

- ไม่พบ aging record ให้ถือว่าเป็น penalty
- แต่ละ aging deadline คือ `AllottedNAVDate + HoldingPeriods` ปี; ถ้า effective date ไม่อยู่หลัง deadline ให้ถือว่าเป็น penalty
- ถ้ายอดคำขอครอบคลุม aging balance ทั้งหมดและ effective date อยู่หลัง deadline ของทุก aging ที่เกี่ยวข้อง จึงคืน `is_penalty = false`

กรณี product ไม่ใช่ date-to-date ระบบคืน `is_penalty = true` พร้อม `message_en` และ `message_th` จาก product penalty configuration; response contract มีเพียงผลเตือนและข้อความ ไม่ได้สร้างหรือเปลี่ยน order

ใน `onSellReviewOrderPressed`, mobile หยุด flow และแสดง `ErrorOccurredBottomSheet` เมื่อ request/error เกิดขึ้น, เดินต่อทันทีเมื่อ `is_penalty = false`, และแสดง localized warning bottom sheet เมื่อเป็น penalty ผู้ใช้กด Agree จึงตั้ง `hasAcceptedPenalty = true` แล้วเดินต่อ ส่วน Cancel ปิด warning และหยุด flow; เมื่อ create sell order สำเร็จ mobile ส่ง acknowledgement `accept_penalty` ไปกับคำขอสร้าง order

การตรวจนี้เป็น supporting preflight/read behavior และไม่เปลี่ยน cancellation predicate, order state หรือ payment state; backend create/cancellation ยังคงเป็น source of truth

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `order-service` | รับ cancellation request, ตรวจ predicate, เรียก external cancel, เปลี่ยน order/action/payment status และส่ง notification |
| `order-consumer` | รับ `CustomerSync` ที่มี account status ไม่ใช่ `active` และ trigger `order-service` system cancellation; ไม่ได้เป็น owner ของ sell cancellation policy |
| `FundConnext` | ยกเลิก external transaction เมื่อ order มี `ResponseTransactionID` |

## End-to-end sequence

### 1. Receive customer cancellation request

**Owner service: `order-service`**
**Executing service: `order-service`**

`CancelOrder` bind request, สร้าง audit context ตาม `BuyMFOrderSequence` หรือ `SellMFOrderSequence` และเรียก `CancelOrderByCustomer`

### 2. Evaluate sell cancellation predicate

**Owner service: `order-service`**
**Executing service: `order-service`**

ระบบโหลด order request และ payment แล้วเรียก `validateOrderIsCancelable`:

1. `WEARE_WEB` ถูกปฏิเสธ
2. ถ้า effective date เป็นอนาคต ให้ผ่านเมื่อ status อยู่ใน `AllowStatusCancelSell` โดยไม่บังคับ `isOverEndTime`
3. ถ้าไม่ใช่ future และ status เป็น `waiting-allot` ต้องมี transaction ID และยังไม่พ้น cutoff
4. status อื่นที่อยู่ใน allow-list ต้องยังไม่พ้น cutoff

เมื่อไม่ผ่าน current handler คืน response code ที่ source เลือก (`404` สำหรับ validation lookup path หรือ `60004` เมื่อ transaction cancellation ล้มด้วย invalid status); source ไม่ยืนยันข้อความ client ที่ใช้แสดงผล

### 3. Cancel the external transaction when present

**Owner service: `order-service`**
**Executing service: `FundConnext` ผ่าน `order-service`**

ใน `CancelOrderSell` ถ้า `ResponseTransactionID` ไม่ว่าง ระบบเรียก `FundConnext.CancelOrder` ด้วย order type `sell` และบันทึก request/response log ของ integration ถ้า call ล้มเหลว transaction cancellation ไม่เดินต่อ และ service map error ไปยัง cancel validation หรือ internal error ตาม error ที่เกิด

สำหรับ future effective date ที่ผ่าน predicate โดยไม่มี transaction ID จะไม่เรียก FundConnext และยังเดิน database cancellation ต่อได้ตาม current code

### 4. Commit order, action flow and payment cancellation

**Owner service: `order-service`**
**Executing service: `order-service`**

ใน database transaction ระบบ:

1. เปลี่ยน order ผ่าน `updateStatusAndCreateActionFlow` ด้วย `FlowCancel`
2. เปลี่ยน payment `AMCToSA` เป็น cancelled
3. เปลี่ยน payment `SAToCustomer` เป็น cancelled
4. ลบ fail-order request ถ้ามี

ถ้า transaction ล้มเหลว ระบบไม่ถือว่า cancellation สำเร็จ และคืน `ErrorInternal` (`500`) ตาม error mapping

### 5. Notify the customer

**Owner service: `order-service`**
**Executing service: `order-service`**

เมื่อ cancellation สำเร็จ `executeCancelAndNotify` ส่ง notification `AutoNoti8` พร้อม fund code และข้อความประเภท sell order แบบ asynchronous หลัง service คืน success

### 6. Cancel pending sell orders after account status change

**Owner service: `order-service` สำหรับ sell cancellation policy; `onboarding-service` เป็น owner ของ status event**

**Executing service: `order-consumer` เป็น `CustomerSync` trigger และ `order-service` เป็น cancellation executor**

เมื่อ `order-consumer` ได้รับ `CustomerSync` ที่มี MF account status `closed` หรือ `freeze` จะเรียก `/api/v1/customer/suspend/cancel-orders` แล้ว `order-service` ค้นหา pending sell orders ที่เข้า system-cancel predicate และเรียก `CancelOrderSell` ด้วย reason `CancelledBySystem`

MF `suspended` ไม่เข้า sell auto-cancel branch; ระบบยังคงอนุญาต sell order ตาม status gate แต่ `closed`/`freeze` จะพยายามยกเลิก pending sell order เป็นรายรายการ พร้อม order-cancellation/audit/notification ตาม dependency ที่ทำงานสำเร็จ

## Business rules

- การเปลี่ยนรอบนี้ทำให้ sell order ที่มี future effective date ยกเลิกได้ตาม status allow-list แม้ current time จะเลย product cutoff แล้ว
- กฎ future effective date ใช้เฉพาะ sell path; buy path ยังใช้ payment method, status, transaction และ cutoff ตาม `isBuyOrderCancelable`
- สำหรับ non-future `waiting-allot` ต้องมี `ResponseTransactionID` และต้องยังไม่พ้น cutoff
- `WEARE_WEB` ถูกปฏิเสธโดย generic customer cancellation path; หน้า frontend ที่ใช้ channel นี้ต้องใช้ cancellation flow เฉพาะของตัวเอง
- Presence ของ transaction ID ทำให้ order-service ต้องยกเลิก transaction ที่ `FundConnext` ก่อน commit local status/payment cancellation
- Status gate ของ MF sell อนุญาต `active` และ `suspended` แต่ปฏิเสธ `closed` และ `freeze` ด้วย `60002`; กฎนี้อยู่ที่ [Order State Machine](/shared-rules/order-state-machine/)
- System cancellation ของ MF sell เกิดเฉพาะ `closed`/`freeze`; `suspended` cancel เฉพาะ pending buy/switch ไม่ใช่ sell
- Holding-period penalty check เป็น warning ก่อน review เท่านั้น; ไม่พบ penalty ไม่ได้แปลว่า order create/cancel จะผ่าน validation อื่นทั้งหมด
- การตอบรับ penalty ถูกส่งเป็น `accept_penalty` ใน create request หลังผู้ใช้กด Agree; การกด Cancel หรือ preflight error ไม่สร้าง order

## State transitions

**Owner service: `order-service`**

| Current status | Condition | Next status |
| :--- | :--- | :--- |
| `order-request` | sell cancellation predicate ผ่าน | `cancelled` |
| `order-confirm` | sell cancellation predicate ผ่านและ payment mapping รองรับ | `cancelled` |
| `failed` | sell cancellation predicate ผ่าน | `cancelled` |
| `waiting-allot` | non-future มี transaction และยังไม่พ้น cutoff หรือ future effective date ตาม current rule | `cancelled` |
| pending sell order | `CustomerSync` non-active status เป็น `closed`/`freeze` และ system predicate ผ่าน | `cancelled` |

Action flow ใช้ `cancelled`; payment records ที่ service update คือ `AMCToSA` และ `SAToCustomer` เป็น cancelled

Holding-period preflight → ไม่มี state transition ของ order/payment; มีเพียง warning และ acknowledgement ใน client/create request

## Error and recovery behavior

**Owner service: `order-service`**

- `404` (`ErrorNotFound`): ไม่พบ order/payment หรือ cancellation predicate ไม่ผ่านใน customer lookup path
- `60004` (`ErrorValidateCancel`): local cancellation failed ด้วย invalid cancellation status
- `60007` (`ErrorValidateCancelWaitAllot`) ไม่ใช่ generic sell validation response ใน current `CancelOrderByCustomer` path; switch และ buy ATS มี path เฉพาะของตนเอง จึงไม่ map code นี้มารวมกับ sell
- `500` (`ErrorInternal`): context, database transaction หรือ integration failure ที่ไม่เข้า mapping อื่น
- FundConnext cancel failure ไม่ควร retry จากเอกสารนี้โดยอัตโนมัติ; source ยืนยันเพียงว่าการ local cancellation จะไม่ถือว่าสำเร็จเมื่อ external cancel คืน error
- System cancellation failure ถูกเก็บต่อรายการโดย `CustomerSuspendService`; source ไม่ยืนยัน rollback ของ sell order ที่ cancel สำเร็จก่อนหน้า

## Final outcomes

- Success: order status เป็น `cancelled`, action flow เป็น `cancelled`, sell-side payment records เป็น cancelled และส่ง `AutoNoti8`
- Validation failure: order และ payment ไม่เปลี่ยนจาก cancellation attempt
- External/infrastructure failure: source คืน error ตาม mapping; operational retry procedure ไม่ได้ยืนยันใน repositories ที่อยู่ใน scope
- `closed`/`freeze` account ที่ได้รับ `CustomerSync` อาจทำให้ pending sell order จบ `cancelled`; ถ้า event propagation หรือ cancellation dependency ล้ม ต้องตรวจ order state แยก

## Related shared rules

- [Trading](/business-flows/trading/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`order-service`:

- `routes/route.go`: `POST /api/v1/order/cancel`
- `handler/order_handler.go`: `CancelOrder`
- `pkg/order/service.go`: `CancelOrderByCustomer`, `CancelOrderSell`, `validateAndCancelOrderSellFundConnext`
- `pkg/order/order_helpers.go`: `validateOrderIsCancelable`, `isSellOrderCancelable`, `cancelOrderToFundconnext`
- `routes/route.go`: `POST /api/v1/order/check-holding-period` (P0299)
- `handler/order_handler.go`: `ValidatePlacedOrderPenalty`
- `handler/order_holding_period_dto.go`: holding-period request/response fields
- `pkg/order/check_holding_period.go`: holding-period configuration, aging calculation และ penalty decision
- `internal/constants/enum/order_enum.go`: sell cancellation allow-list and cancel status mappings
- `internal/constants/enum/response_enum.go`: response code mapping
- `order-service/pkg/customer/suspend_service.go`: status-specific system cancellation ของ MF sell

`order-consumer`:

- `order-consumer/pkg/customer-account/service.go`: `CustomerSync` non-active trigger

`xspring-mobile-app`:

- `lib/domains/fund_order/controller.dart`: sell review preflight, warning acknowledgement และ `accept_penalty`
- `lib/domains/fund_order/sell/service.dart`: check-holding-period request
- `lib/domains/fund_order/models/penalty_check_model.dart`: penalty request/response model

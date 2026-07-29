---
title: Crypto Deposit and Withdrawal
description: End-to-end flow ของการฝากและถอนคริปโต ตั้งแต่ Fireblocks webhook หรือคำขอจาก client จน ledger และ portfolio ถูกอัปเดต
capability: Fund Movement
services: [order-service, order-consumer, asset-consumer, asset-service]
integrations: [Fireblocks, blockchain, Kafka]
aliases: [crypto deposit, crypto withdrawal, Fireblocks webhook, withdrawal refund, withdrawal unlock, ฝากคริปโต, ถอนคริปโต, คืนยอดถอนคริปโต, ปลดล็อกยอดถอน]
status: active
lastUpdated: 2026-07-29
documentType: flow
---

## Purpose and scope

เอกสารนี้ครอบคลุม flow ฝากและถอน digital asset ที่ source ยืนยันได้ รวมการ hold, state transition, Fireblocks callback, retry และ refund/unlock ของ customer logical ledger จน `asset-consumer` apply รายการและ `asset-service` เปิดเผยยอดใหม่

## Trigger and preconditions

- Deposit เริ่มเมื่อ `order-service` รับ Fireblocks webhook ที่ผ่านการตรวจ signature และมี transaction data, supported asset และ customer wallet ที่ resolve ได้
- Deposit ที่ `Depositable = false`, internal-wallet transaction หรือ product ที่ถูก delist อาจถูก skip ตาม guard ใน backend
- Withdrawal เริ่มจาก client ส่งคำขอผ่าน order API (รวม mobile และ Web Portal/White Glove) พร้อม product, network, destination address/memo, amount และข้อมูลผู้รับเมื่อจำเป็น
- ก่อนสร้าง withdrawal ต้องผ่าน validation ของ `order-service`/`order-consumer` เช่น customer account, product/network config, balance และ withdrawal limit
- Withdrawal callback ต้องอ้าง `externalTxId` ที่ map กลับไปยัง order ปัจจุบันได้

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| Fireblocks / blockchain | สร้างและรายงานสถานะธุรกรรม on-chain ผ่าน webhook |
| `order-service` | Business owner ของ crypto order, request validation/creation, callback, state, refund และ logical ledger |
| `order-consumer` | Executor ของ asynchronous withdrawal request: validate ซ้ำ, hold balance และเรียก Fireblocks |
| `asset-consumer` | Executor ของ ledger event: apply logical ledger เข้า portfolio |
| `asset-service` | Owner ของ balance/portfolio read model หลัง ledger ถูก apply |
| Web Portal / mobile app | Supporting trigger, payload, client validation, cancel/retry action และ status ที่ผู้ใช้เห็น |

## End-to-end sequence

### Deposit

Owner และ executor ของ callback คือ `order-service`.

1. รับและ authenticate Fireblocks webhook แล้ว route ตาม `Confirming`, `Completed`, `Cancelling`, `Cancelled`, `Blocked`, `Failed` หรือ `Rejected`
2. Resolve supported asset และ customer wallet จาก vault, destination address, asset และ tag/memo; external wallet ที่หาไม่พบอาจสร้าง rejected deposit order ส่วน internal/delisted path ถูก skip
3. เมื่อ `Confirming` และเป็น event ที่ต้องสร้าง order ให้ตรวจ minimum deposit, สร้าง `order_crypto` และ action flow `created → confirming`; เพิ่ม customer `PENDING_DEPOSIT`
4. เมื่อ `Completed` ให้เปลี่ยน `confirming → sync-ledger`, ทำ logical ledger คู่ `PENDING_DEPOSIT decrease` + `AVAILABLE increase` และ physical external ledger ใน transaction เดียว จากนั้นเปลี่ยนเป็น `completed`
5. ส่ง logical ledger event ไป `asset-consumer` (executor) เพื่อ apply portfolio; `asset-service` เป็นจุดอ่าน balance/report
6. webhook completed ซ้ำหลัง order เป็น `completed` ถูก skip เพื่อไม่สร้าง double entry

### Withdrawal request and Fireblocks execution

Business owner คือ `order-service`; asynchronous executor คือ `order-consumer`.

1. Client เรียก config/network/address-book และส่ง request; `order-service` คำนวณ fee, net quantity, recipient data และสร้าง order `created → order-request` พร้อม publish request event
2. `order-consumer` consume event และ validate ซ้ำ; validation ไม่ผ่านจะเปลี่ยนเป็น `rejected` และแจ้งเตือน โดยยังไม่ hold balance
3. เมื่อผ่าน ให้สร้าง hold ใน transaction เดียว: customer `AVAILABLE decrease` + `PENDING_WITHDRAWAL increase`; publish logical ledger แล้วเปลี่ยน `order-confirm → processing`
4. `order-consumer` เรียก Fireblocks จาก XD vault ไปยัง destination address ด้วย net quantity; callback ต่อจากนี้ถูกประมวลผลโดย `order-service`
5. Fireblocks `Completed`: `processing → order-verifying → sync-ledger → completed`, สร้าง settlement ledger/fee ตาม order และ publish สถานะไป downstream ที่เกี่ยวข้อง

### Withdrawal failure, retry and cancellation

1. Fireblocks creation error ที่เป็น `SOURCE_BALANCE_ERROR` เปลี่ยน order เป็น `order-verifying` พร้อม retry action และยังไม่คืนยอด; ผู้ปฏิบัติงานต้องใช้ retry endpoint เพื่อส่ง transaction ใหม่
2. Creation error อื่นเปลี่ยนเป็น `rejected` และ refund/unlock ด้วย `PENDING_WITHDRAWAL decrease` + `AVAILABLE increase` ใน batch/transaction เดียว
3. Fireblocks callback ที่ `InsufficientFunds`, `InsufficientFundsForFee` หรือ `Timeout` ใช้ retry path: `order-verifying` + retry action, ไม่ refund จนกว่าจะเลือก retry หรือมี final failure path
4. Callback failure อื่น (`Rejected`, `Failed`, `Blocked`, `Cancelled`) ใช้ refund path: เปลี่ยนเป็น `rejected`, สร้าง ledger คู่เพื่อลด `PENDING_WITHDRAWAL` และเพิ่ม `AVAILABLE`, publish logical ledger และแจ้งเตือน
5. Cancel โดย customer/system ทำได้เฉพาะ order ที่ยังอยู่ `order-request`; เปลี่ยนเป็น `cancelled` และส่ง cancel event โดย backend path นี้ไม่อนุญาตเมื่อเริ่ม processing แล้ว
6. Worker `AutoCancelExpiredWithdrawCryptoOrders` เรียก cancel path สำหรับ order request ที่ค้างเกิน 24 ชั่วโมง

## Business rules

- Backend เป็น source of truth สำหรับ validation, state และ ledger; frontend มีหน้าที่แค่ trigger/payload/status presentation
- Deposit ที่ confirming ใช้ `PENDING_DEPOSIT`; ยอดที่ spendable เพิ่มเมื่อ completed เท่านั้น
- Withdrawal hold ต้องเกิดก่อนส่ง transaction ไป Fireblocks เพื่อกัน available balance ถูกใช้ซ้ำ
- Refund/unlock ไม่ใช่การเดา status จาก UI แต่เป็น ledger คู่ที่ decrease `PENDING_WITHDRAWAL` และ increase `AVAILABLE`
- Retryable Fireblocks substatus ไม่ refund ทันที เพราะ order ยังเปิดให้ retry
- การสร้าง logical ledger และการเปลี่ยน state ที่ source ระบุให้ทำใน database transaction; การ publish event หลังจากนั้นต้องตรวจ error แยกต่างหาก
- Internal wallet และ delisted-product guards อาจหยุดการสร้าง customer-facing ledger/XD event ตาม path ที่ source ระบุ

## State transitions

**Owner service: `order-service`**

**Executing service for async request: `order-consumer`**

```text
Deposit:
created → confirming → sync-ledger → completed
confirming → rejected                 (Fireblocks failure/refund)

Withdrawal:
created → order-request → order-confirm → processing
processing → order-verifying → sync-ledger → completed
order-request → cancelled              (customer/system cancel or >24h expiry)
order-request/processing → rejected    (validation or non-retryable failure)
processing → order-verifying           (retryable Fireblocks failure)
order-verifying → processing           (explicit retry)
```

## Error and recovery behavior

- Invalid webhook authentication, missing order mapping หรือ malformed external transaction ID ทำให้ callback ไม่สามารถดำเนินต่อ; ไม่ควรสร้าง ledger จาก callback ที่ resolve ไม่ได้
- Deposit wallet not found สำหรับ external transaction อาจถูกบันทึกเป็น rejected order; internal/delisted transaction ถูก skip ตาม guard
- Deposit Fireblocks failure เปลี่ยน `confirming → rejected` และ refund `PENDING_DEPOSIT` ไป external available ledger
- Withdrawal validation failure เกิดก่อน hold จึง reject โดยไม่ต้อง unlock
- Withdrawal retryable failure คงยอดไว้ใน `PENDING_WITHDRAWAL`; retry สำเร็จจึงเดินต่อ หรือ final failure จึง refund
- Withdrawal non-retryable failure และ Fireblocks refund path คืนยอดด้วย ledger คู่ พร้อม notification/adaptive card; error message/substatus ถูกเก็บเป็น reason แต่เอกสารนี้ไม่ map เป็น public error code ที่ source ไม่ได้กำหนด
- หาก publish Kafka/logical-ledger event ล้มเหลว ให้ถือเป็น operational failure ที่ต้องตรวจซ้ำจาก service/consumer; ไม่สรุปว่า portfolio สำเร็จจาก order status เพียงอย่างเดียว

## Final outcomes

- Deposit completed: customer pending deposit ถูกย้ายเป็น available และ portfolio ถูก apply หลัง `asset-consumer` ประมวลผล
- Deposit rejected/skipped: ไม่มี available balance เพิ่ม; rejected external deposit มี refund ledger ตาม path
- Withdrawal completed: transaction on-chain สำเร็จ, settlement ledger ถูกสร้าง และ order เป็น `completed`
- Withdrawal rejected/cancelled: order จบตาม path; กรณีที่มี hold แล้วจะมีการคืน `PENDING_WITHDRAWAL → AVAILABLE` ตาม refund path
- Withdrawal retryable: order ยังไม่ final และยอดยังถูก holdจนกว่าจะ retry หรือเข้าสู่ final failure

## Related shared rules and flows

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Security Rules](/shared-rules/security/)

## Code references

- `order-service/pkg/crypto/service.go` — `HandleDepositCryptoWebhook`, `HandleWithdrawCryptoWebhook`, retry/refund/cancel handlers, deposit and withdrawal ledger builders
- `order-consumer/pkg/digital-asset-order-request/withdraw.go` — async validation, hold ledger และ Fireblocks transaction creation
- `order-service/internal/constants/enum/order_crypto_enum.go` — order/action/status enums
- `web-portal/src/app/features/white-glove/services/withdraw-crypto.ts` — White Glove withdrawal request/cancel/status client
- `xspring-mobile-app/lib/domains/digital_portal/withdraw/service.dart` — mobile withdrawal API trigger
- `xspring-mobile-app/lib/domains/digital_portal/withdraw/withdraw_crypto/screen.dart` — user-visible cancellation boundary
- Tables: `order_crypto`, `order_action_flow`, `ledger_transactions`, `product_digital_asset_extension`

---
title: Order State Machine
description: สถานะ การเปลี่ยนสถานะ และข้อจำกัดของ Swap, Withdrawal และ Fund Order
status: active
lastUpdated: 2026-08-27
documentType: shared-rule
---

กฎกลางสำหรับควบคุม lifecycle ของคำสั่ง ป้องกันการข้ามขั้นตอนและการเปลี่ยนสถานะหลังจบรายการ

## Swap Order

Success path:

`draft` → `open` → `processing` → `filling` → `sync-ledger` → `filled`

Terminal states คือ `filled`, `cancelled` และ `rejected`

| Status | ความหมาย |
| :--- | :--- |
| `draft` | สร้างคำสั่งในระบบแล้ว แต่ยังไม่ส่งไปจับคู่ |
| `open` | รอจับคู่ใน Order Book |
| `processing` | เริ่มกระบวนการจับคู่ |
| `filling` | กำลังทยอยจับคู่ |
| `sync-ledger` | จับคู่เสร็จและกำลังปรับยอดบัญชี |
| `filled` | การแลกเปลี่ยนเสร็จสมบูรณ์ |

ดู Flow ที่ใช้ lifecycle นี้:

- [Swap Market Order](/business-flows/trading/swap-market-order/)
- [Swap Limit Order](/business-flows/trading/swap-limit-order/)
- [Big Lot](/business-flows/trading/big-lot/)

## Crypto Deposit

Success path เมื่อไม่บังคับ sender review:

`created` → `confirming` → `sync-ledger` → `completed`

เมื่อ `FEATURE_TOGGLE_DEPOSIT_CRYPTO_SENDER_REVIEW` เปิด:

`created` → `confirming` → `to-review` → `sync-ledger` → `completed`

| Status | ความหมาย | Customer view |
| :--- | :--- | :--- |
| `confirming` | Fireblocks กำลังยืนยันและยอดอยู่ `PENDING_DEPOSIT` | `processing` |
| `to-review` | Fireblocks completed แล้ว แต่รอ sender information | `waiting-confirm` |
| `sync-ledger` | กำลังย้าย `PENDING_DEPOSIT` ไป `AVAILABLE` | `processing` |
| `completed` | Ledger สำเร็จและยอดพร้อมใช้ | `completed` |

## Withdrawal

Crypto withdrawal success path:

`created` → `order-request` → `order-confirm` → `order-processing` → `sync-ledger` → `completed`

`order-verifying` ไม่ใช่ success step ปกติ แต่เป็น exception state เมื่อ Fireblocks failure ยัง retry ได้:

`order-processing` → `order-verifying` → `order-processing`

Terminal states คือ `completed`, `cancelled` และ `rejected`

| Status | ความหมาย | Customer view |
| :--- | :--- | :--- |
| `order-request` | สร้างคำขอแล้ว; White Glove รอ customer ยืนยันอีเมล ส่วน direct channel รอ consumer process | `email pending` |
| `order-confirm` | ยืนยันตัวตนสำเร็จและรอดำเนินการ | `processing` |
| `order-processing` | ส่งข้อมูลให้ Bank หรือ Fireblocks | `processing` |
| `order-verifying` | Fireblocks failure ที่ต้องให้ operator ตรวจ/retry | `order-verifying` |
| `sync-ledger` | Fireblocks completed และกำลัง settle ledger | `processing` |
| `completed` | เงินหรือสินทรัพย์ถึงปลายทางแล้ว | `completed` |

## Fund Order

Success path:

`created` → `order-request` → `order-confirm` → `order-processing` → `waiting-allot` → `completed`

| Transition | Trigger |
| :--- | :--- |
| `created` → `order-request` | ผู้ใช้ Submit Order |
| `order-request` → `order-confirm` | ยืนยันการชำระเงิน |
| `order-confirm` → `order-processing` | AM/SA อนุมัติ |
| `order-processing` → `waiting-allot` | ตรวจสอบการชำระเงินเรียบร้อย |
| `waiting-allot` → `completed` | จัดสรรสินทรัพย์สำเร็จ |

Mutual Fund Switching ใช้ specialized success mapping ที่ข้าม `order-processing`:

`created` → `order-request` → `order-confirm` → `waiting-allot` → `completed`

สำหรับ switch, `order-confirm → waiting-allot` เกิดหลัง `FundConnext.SwitchOrder` ตอบโดยไม่มี `ErrorCode`; `order-confirm → failed` เกิดเมื่อ response มี `ErrorCode` หรือ approval call ล้มเหลว และ customer cancellation ใช้ `waiting-allot → cancelled` เมื่อ switch-specific predicate ผ่าน การเปลี่ยน `waiting-allot → completed` ถูกยืนยันจาก enum mapping แต่ executor, callback และ ledger/portfolio effect ยังไม่ยืนยันจาก repositories ใน scope

ดูรายละเอียดที่ [Mutual Fund Switching](/business-flows/trading/mutual-fund-switching/) และ [Mutual Fund Sell Order Cancellation](/business-flows/trading/mutual-fund-sell-cancellation/)

## Customer account status gate

กฎนี้เป็น account-status gate ที่ `order-service` ใช้ก่อนสร้างคำสั่ง โดยอ่านสถานะที่ไม่ใช่ `active` ของ Mutual Fund product (`22`) หรือ Digital Asset/Offering product (`32`) ส่วน `order-consumer` เป็น executor ของ event path ที่ตรวจพบการเปลี่ยนสถานะและเรียก system cancellation

| Product / operation | `active` | `suspended` | `closed` / `freeze` | Backend response เมื่อไม่อนุญาต |
| :--- | :--- | :--- | :--- | :--- |
| Mutual Fund: buy / switch | อนุญาตตาม validation อื่น | ไม่อนุญาต | ไม่อนุญาต | HTTP `400`, `60002` (`ErrorCustomerSuspend`) |
| Mutual Fund: sell | อนุญาตตาม validation อื่น | อนุญาตตาม validation อื่น | ไม่อนุญาต | HTTP `400`, `60002` (`ErrorCustomerSuspend`) |
| Digital Asset: deposit / create ICO / swap buy | อนุญาตตาม validation อื่น | ไม่อนุญาต | ไม่อนุญาต | HTTP `400`, `60002`, message `customer is <status>.` |
| Digital Asset: withdrawal / swap sell | อนุญาตตาม validation อื่น | อนุญาตตาม validation อื่น | ไม่อนุญาต | HTTP `400`, `60002`, message `customer is <status>.` |

เมื่อ `onboarding-service` publish `CustomerSync` และ `order-consumer` พบ account status ที่ lower-case แล้วไม่ใช่ `active` จะเรียก `POST /api/v1/customer/suspend/cancel-orders` ของ `order-service` โดยการ cancel เป็นรายประเภทและเฉพาะ order ที่เข้า cancellation predicate:

| Account status | Mutual Fund | Digital Asset |
| :--- | :--- | :--- |
| `suspended` | pending buy และ switch | pending ICO, fiat deposit และ swap-limit BUY |
| `closed` / `freeze` | pending buy, switch และ sell | pending ICO, fiat deposit, fiat/crypto withdrawal และ swap-limit BUY/SELL |

`order-service` เป็น Business owner และ executor ของ status validation/cancellation; `order-consumer` เป็น executor ของ `CustomerSync` และ system-cancellation trigger ไม่ใช่ owner ของ order policy. การ cancel ที่ล้มเหลวบางรายการถูกรวบรวมและส่ง internal notification แบบ asynchronous; source ไม่ยืนยัน rollback ของรายการที่สำเร็จก่อนหน้า

### Unresolved implementation boundaries

- Repository lookup ใช้ `LIMIT 1` โดยไม่มี ordering เมื่อมีหลาย account ที่ product เดียวกันมีสถานะต่างกัน จึงยังไม่ยืนยัน precedence ของสถานะ
- `IsMutualFundNotAllowOrder` คืน error จาก lookup สำหรับ `sell` แต่ทิ้ง error สำหรับ order type อื่น และค่า status ว่างจะถูกประเมินเป็น not allowed สำหรับ buy/switch ตาม enum ปัจจุบัน ต้องยืนยันว่าเป็น intended behavior หรือ defect
- System-cancellation audit detail ยังบันทึก literal `customer_account_status: suspended` แม้ trigger status จะเป็น `closed` หรือ `freeze`

## ข้อจำกัดร่วม

1. ห้ามเปลี่ยนสถานะย้อนกลับ
2. Terminal state เป็นสถานะสุดท้ายและเปลี่ยนต่อไม่ได้
3. ตามกฎกลางในแหล่งข้อมูล `completed` หรือ `filled` เกิดได้เมื่อ `sync-ledger` สำเร็จแล้วเท่านั้น หาก Ledger ล้มเหลว คำสั่งต้องค้างไว้หรือเข้าสู่ retry

อย่างไรก็ตาม Fund Order success path ที่ระบุในแหล่งข้อมูลเดียวกันไม่มี `sync-ledger` จึงเป็นข้อไม่สอดคล้องที่ยังไม่ได้ข้อสรุป ต้องยืนยันจาก code หรือแหล่งธุรกิจของ Fund ก่อนนำกฎนี้ไปใช้กับ Fund Order และไม่ควรตีความจากเอกสารนี้ว่า Fund ถูกยกเว้น

## จุดอ้างอิงในโค้ด

- `internal/constants/enum/order_crypto_enum.go`
- `internal/constants/enum/order_enum.go`
- `mappingNextStatusFlowATSSuccess`
- `mappingNextActionFlowATSSuccess`
- `order-service/pkg/customer/suspend_service.go`
- `order-service/handler/digital_asset_suspension.go`
- `order-consumer/pkg/customer-account/service.go`

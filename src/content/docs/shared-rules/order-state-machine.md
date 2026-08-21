---
title: Order State Machine
description: สถานะ การเปลี่ยนสถานะ และข้อจำกัดของ Swap, Withdrawal และ Fund Order
status: active
lastUpdated: 2026-08-21
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

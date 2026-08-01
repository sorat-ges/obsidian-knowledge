---
title: Ledger and Money Flow
description: บทบาทบัญชี ประเภท Ledger และกฎความถูกต้องของการเคลื่อนไหวเงินและสินทรัพย์
status: active
lastUpdated: 2026-08-01
documentType: shared-rule
---

กฎกลางสำหรับบันทึกการเคลื่อนไหวของเงินและสินทรัพย์ให้ตรวจสอบย้อนกลับได้และรักษาสมดุลทางบัญชี

## บทบาทของบัญชี

| Account type | บทบาท |
| :--- | :--- |
| `customer_main` | ยอดเงินและสินทรัพย์ดิจิทัลของลูกค้า |
| `xd_fee` | รายได้ค่าธรรมเนียมของบริษัท |
| `external_fee` | ต้นทุนค่าธรรมเนียมที่จ่ายให้ภายนอก |
| `xd_main` | บัญชีกลางสำหรับบริหารสภาพคล่อง |

## Ledger types

- `AVAILABLE`: ยอดที่ใช้เทรดหรือถอนได้
- `HOLD_IN_ORDER`: ยอดที่ล็อกไว้สำหรับ Order
- `PENDING_DEPOSIT`: ยอดฝากที่ยืนยันบน chain แล้วแต่ยังไม่ spendable จนกว่าจะ completed
- `PENDING_WITHDRAWAL`: ยอดระหว่างถอน
- `ORDER_FEE` และ `WITHDRAWAL_FEE`: ค่าธรรมเนียมตามประเภทธุรกรรม

## ผลต่อ Portfolio ของคำสั่ง Swap Limit

| Logical movement | ผลต่อ Portfolio |
| :--- | :--- |
| `AVAILABLE / INCREASE` | เพิ่ม available balance และ total unit balance |
| `AVAILABLE / DECREASE` | ลดเฉพาะ available balance |
| `HOLD_IN_ORDER / INCREASE` | เพิ่มเฉพาะ pending-out balance |
| `HOLD_IN_ORDER / DECREASE` | ลด pending-out balance และลด total unit balance ขั้นสุดท้าย |

การล็อกสินทรัพย์ต้นทางใช้ `AVAILABLE / DECREASE` คู่กับ `HOLD_IN_ORDER / INCREASE` ส่วนการ settle หรือ refund ต้องสร้าง logical ledger ให้ตรงกับผลจริง

## กฎ Financial Integrity

- **No overdraw:** ตรวจ `AVAILABLE` ก่อนทำ `DECREASE`
- **Transaction matching:** รายการ Double Entry ต้องใช้ `TransactionId` UUID ชุดเดียวกัน
- สถานะสำเร็จของ Order ต้องรอให้ `sync-ledger` สำเร็จ
- Database write กับ Kafka publish ไม่ใช่ distributed transaction เดียวกัน จึงต้องมี monitoring/retry เมื่อสองฝั่งสำเร็จไม่พร้อมกัน

## Withdrawal money flow

1. ลด `AVAILABLE` และเพิ่ม `PENDING_WITHDRAWAL`
2. บันทึกรายได้เข้า `xd_fee` และต้นทุนเข้า `external_fee`
3. เมื่อธนาคารยืนยัน ให้ลด `PENDING_WITHDRAWAL`

สำหรับ crypto withdrawal:

- XSpring App/Trading Web hold ก่อนเรียก Fireblocks; White Glove hold ก่อนส่ง confirmation email และคงยอดไว้ระหว่างรอลูกค้ายืนยัน
- เมื่อ Fireblocks completed ให้ลด customer `PENDING_WITHDRAWAL` ตาม gross quantity, เพิ่ม external available ตาม net quantity และบันทึก XD withdrawal fee/network fee ตามสินทรัพย์ที่เกี่ยวข้อง
- Fireblocks final failure, validation failure หลัง White Glove hold หรือ cancellation ต้อง refund/unlock เป็นคู่ `PENDING_WITHDRAWAL / DECREASE` และ `AVAILABLE / INCREASE` ด้วย `TransactionId` เดียวกัน
- Failure ที่ retry ได้คงยอดไว้ใน `PENDING_WITHDRAWAL`; `order-verifying` ไม่ใช่ settlement step และจะกลับไป `order-processing` เมื่อ retry

## Crypto deposit money flow

1. เมื่อ Fireblocks ส่ง `CONFIRMING` + `TRANSACTION_CREATED` ให้ลด external `AVAILABLE` และเพิ่ม customer `PENDING_DEPOSIT`
2. ถ้า sender-review toggle ปิด เมื่อ `COMPLETED` ให้ลด `PENDING_DEPOSIT` และเพิ่ม `AVAILABLE` ด้วย `TransactionId` เดียวกัน
3. ถ้า toggle เปิด `COMPLETED` เปลี่ยน order เป็น `to-review` เท่านั้น; ยังไม่ย้ายยอดไป `AVAILABLE`
4. เมื่อ sender information ผ่าน validation ให้ทำ `to-review → sync-ledger → completed` และ ledger/physical entries ใน database transaction เดียวกัน แล้ว publish logical-ledger event หลัง commit
5. เมื่อ deposit ถูก reject หลังสร้าง pending แล้ว ให้ลด `PENDING_DEPOSIT` และบันทึก external available ledger ตาม refund path

## Flow ที่ใช้กฎนี้

- [Swap Market Order](/business-flows/trading/swap-market-order/)
- [Swap Limit Order](/business-flows/trading/swap-limit-order/)
- [Big Lot](/business-flows/trading/big-lot/)
- [Crypto Deposit and Withdrawal](/business-flows/fund-movement/crypto-deposit-and-withdrawal/)

## จุดอ้างอิงในโค้ด

- `pkg/order_fiat/service_ledger.go`
- `pkg/order_trade/service_ledger.go`
- `order-service/pkg/crypto/service.go`
- `order-service/pkg/crypto/service_confirm_deposit.go`
- `order-consumer/pkg/digital-asset-order-request/withdraw.go`
- `ledger_transaction_service` และ `CreateLogical`
- Logical Ledger Table

---
title: Ledger and Money Flow
description: บทบาทบัญชี ประเภท Ledger และกฎความถูกต้องของการเคลื่อนไหวเงินและสินทรัพย์
status: active
lastUpdated: 2026-07-28
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

สำหรับ crypto withdrawal ที่ Fireblocks ล้มเหลวแบบ final หรือสร้าง transaction ไม่สำเร็จหลัง hold ให้ทำ refund/unlock เป็นคู่ `PENDING_WITHDRAWAL / DECREASE` และ `AVAILABLE / INCREASE` ด้วย `TransactionId` เดียวกัน ส่วน failure ที่ retry ได้ยังคงยอดไว้ใน `PENDING_WITHDRAWAL` จนกว่าจะ retry หรือเข้าสู่ final failure

## Crypto deposit money flow

1. เมื่อ Fireblocks ส่ง `Confirming` ให้เพิ่ม `PENDING_DEPOSIT`
2. เมื่อ `Completed` ให้ลด `PENDING_DEPOSIT` และเพิ่ม `AVAILABLE` ด้วย `TransactionId` เดียวกัน
3. เมื่อ deposit ถูก reject หลังสร้าง pending แล้ว ให้ลด `PENDING_DEPOSIT` และบันทึก external available ledger ตาม refund path

## Flow ที่ใช้กฎนี้

- [Swap Market Order](/business-flows/trading/swap-market-order/)
- [Swap Limit Order](/business-flows/trading/swap-limit-order/)
- [Big Lot](/business-flows/trading/big-lot/)

## จุดอ้างอิงในโค้ด

- `pkg/order_fiat/service_ledger.go`
- `pkg/order_trade/service_ledger.go`
- `ledger_transaction_service` และ `CreateLogical`
- Logical Ledger Table

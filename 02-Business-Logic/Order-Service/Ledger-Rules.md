---
title: Ledger & Money Flow Business Rules
tags: [logic, ledger, accounting, finance]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: Ledger & Money Flow

## 🎯 วัตถุประสงค์
เพื่อบันทึกและควบคุมการเคลื่อนไหวของสินทรัพย์ (Assets) และเงินสด (Fiat) ภายในระบบให้มีความถูกต้องตามหลักการบัญชี และสามารถตรวจสอบย้อนกลับได้ (Audit Trail)

## 📜 ประเภทบัญชีและบทบาท (Account Roles)

| ประเภทบัญชี (Account Type) | บทบาทหน้าที่ |
| :--- | :--- |
| **`customer_main`** | เก็บยอดเงินและสินทรัพย์ดิจิทัลของลูกค้าแต่ละราย |
| **`xd_fee`** | เก็บรายได้จากค่าธรรมเนียม (Order Fee) ของบริษัท |
| **`external_fee`** | เก็บต้นทุนค่าธรรมเนียมที่จ่ายให้ภายนอก (Bank/Exchange Fee) |
| **`xd_main`** | บัญชีกลางสำหรับบริหารจัดการสภาพคล่องของบริษัท |

## ➗ ประเภทของยอดคงเหลือ (Ledger Types)
- **`AVAILABLE`**: ยอดเงินที่ลูกค้าสามารถใช้เทรดหรือถอนได้จริง
- **`HOLD_IN_ORDER`**: ยอดเงินที่ถูกล็อกไว้เมื่อมีการเปิด Order (ป้องกันการใช้เงินซ้ำ)
- **`PENDING_WITHDRAWAL`**: ยอดเงินที่อยู่ระหว่างกระบวนการถอนออกไปยังธนาคาร
- **`ORDER_FEE` / `WITHDRAWAL_FEE`**: บันทึกยอดค่าธรรมเนียมตามประเภทธุรกรรม

## 🔄 ทิศทางการไหลของเงิน (Money Flow Sequence)

### กรณีการถอนเงิน (Withdrawal)
1. **Hold Phase:** ลด `AVAILABLE` และเพิ่ม `PENDING_WITHDRAWAL` ของลูกค้าตามยอดที่สั่งถอน
2. **Fee Phase:**
   - บันทึกรายได้เข้า `xd_fee` (หักจากลูกค้า)
   - บันทึกต้นทุนเข้า `external_fee` (จ่ายให้ธนาคาร)
3. **Completion:** เมื่อธนาคารยืนยันผล ให้ลด `PENDING_WITHDRAWAL` ของลูกค้าออก

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `pkg/order_fiat/service_ledger.go`, `pkg/order_trade/service_ledger.go`
- **Ledger Service**: `ledger_transaction_service` (ใช้สำหรับ `CreateLogical` transaction)
- **Database**: ข้อมูลถูกจัดการผ่าน Logical Ledger Table

## 🤖 How to Verify (For AI Agent)
หากต้องการตรวจสอบทิศทางการลงบัญชี ให้รัน:
`grep -A 50 "CreateLogicalLedgerTransactionRequest" pkg/order_fiat/service_ledger.go`
ตรวจสอบฟิลด์ `Type` (`INCREASE`/`DECREASE`) และ `NetAmount` ว่ามีการใช้ `.Neg()` ในจุดที่ถูกต้องหรือไม่

## ⚠️ ข้อควรระวัง (Financial Integrity)
- **No Overdraw:** ระบบ Ledger ต้องตรวจสอบเสมอว่ายอด `AVAILABLE` เพียงพอก่อนจะทำ `DECREASE`
- **Transaction Matching:** ทุกรายการ Ledger ต้องมี `TransactionId` (UUID) ชุดเดียวกันสำหรับ Double Entry เพื่อให้ยอดดุลเสมอ

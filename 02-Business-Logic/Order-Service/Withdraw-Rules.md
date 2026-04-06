---
title: Fiat Withdrawal Business Rules
tags: [logic, withdraw, fiat, fee, security]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: Fiat Withdrawal (ถอนเงินบาท)

## 🎯 วัตถุประสงค์
จัดการกระบวนการถอนเงินบาทของผู้ใช้งาน ตั้งแต่การคำนวณค่าธรรมเนียม การตรวจสอบสิทธิ์ จนถึงการยืนยันรายการผ่าน OTP เพื่อความถูกต้องและปลอดภัยสูงสุด

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **Withdraw Fee** | ทุกรายการถอนเงินบาท | ต้องดึงค่าธรรมเนียมจากระบบ `transaction_fee` ตามเงื่อนไขของแต่ละธนาคาร |
| **Minimum Withdraw** | ทุกรายการ | ขั้นต่ำตามที่กำหนดใน Config (ตรวจสอบผ่าน `GetWithdrawFiatConfig`) |
| **Available Balance** | ก่อนสร้างคำสั่ง | ยอดเงินคงเหลือใน Wallet ต้องเพียงพอกับ `inputAmount` (รวมค่าธรรมเนียม) |
| **Account Ownership** | ทุกรายการ | ต้องถอนเข้าบัญชีธนาคารที่เป็นชื่อเดียวกับเจ้าของบัญชีเทรดเท่านั้น |
| **Security (OTP)** | ทุกรายการ | ต้องมีการยืนยันตัวตนผ่าน OTP (หรือ 2FA) ก่อนดำเนินการสร้างคำสั่ง |

## ➗ สูตรการคำนวณค่าธรรมเนียม (Calculation Formulas)

ระบบจะดึงข้อมูลจากตาราง `transaction_fee` (Company: "XD", Transaction: "withdraw_fiat") โดยแบ่งเป็น 2 ส่วน:

1. **Order Fee (`received_by_customer`):** คือ **รายได้ของบริษัท** ที่หักจากลูกค้า
2. **Bank Fee (`pay_to_bank`):** คือ **ต้นทุนค่าธรรมเนียมธนาคาร** (XAS จ่ายให้ธนาคาร)

### สูตรยอดเงินโอนสุทธิ (Transfer Logic)
- **สูตร:** `transferAmount = inputAmount - orderFeeAmount + bankFee`
- **ตัวอย่าง:** ลูกค้าถอน 1,000 บาท, หักค่าธรรมเนียม XAS 20 บาท, บวกค่าโอนธนาคาร 5 บาท -> ยอดโอนจริงไปธนาคาร = 985 บาท (เพื่อให้ลูกค้าได้รับเงินจริง 980 บาท ตามที่ระบุไว้)

## 🔄 ขั้นตอนการทำงาน (Logic Flow)

### 1. Request Stage (สร้างคำสั่ง)
1. ลูกค้าเลือกบัญชีธนาคารและระบุจำนวนเงิน (`inputAmount`)
2. ระบบตรวจสอบยอดเงินคงเหลือ (Available Balance)
3. ระบบเรียก `GetWithdrawFeeForBankAndTransferAmount` เพื่อหาค่าธรรมเนียม
4. แสดงสรุปรายการ (Amount, Fee, Total) ให้ลูกค้ายืนยัน

### 2. Verification Stage (ยืนยันตัวตน)
1. ส่งรหัส OTP ไปยังเบอร์โทรศัพท์ที่ลงทะเบียน
2. ระบบตรวจสอบ OTP Rate Limit (ป้องกันการขอรหัสซ้ำถี่เกินไป)
3. เมื่อ OTP ถูกต้อง ระบบจะเปลี่ยนสถานะคำสั่งจาก `DRAFT` เป็น `SUBMITTED`

### 3. Execution Stage (ส่งคำสั่ง)
1. ระบบส่งคำสั่งโอนเงินไปยัง Payment Gateway
2. ตัดยอดเงินจากบัญชีลูกค้า (Wallet) และบันทึกรายการบัญชี (Ledger)
3. เมื่อได้รับ Webhook ยืนยันผลจากธนาคาร ระบบจะอัปเดตสถานะเป็น `COMPLETED` หรือ `FAILED`

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `pkg/order_fiat/service.go`
- **Primary Function**: `GetWithdrawFeeForBankAndTransferAmount`, `GetTransactionFeeWithCondition`
- **Actions**: `WithdrawFiatActionReceivedByCustomer`, `WithdrawFiatActionPayToBank`

## 🤖 How to Verify (For AI Agent)
หากต้องการตรวจสอบสูตรคำนวณเงินโอนสุทธิ ให้รัน:
`grep -n "transferAmount = inputAmount.Sub(orderFeeAmount).Add(bankFee)" pkg/order_fiat/service.go`
และตรวจสอบฟังก์ชัน `GetTransactionFeeWithCondition` ว่ามีการ Match `action` และ `bank_code` หรือไม่

## ⚠️ ข้อควรระวัง (Edge Cases & Failure Handling)
- **Missing Fee Configuration:** หากไม่มีการตั้งค่า Fee ใน DB ระบบจะ Default เป็น **0 บาท** (ซึ่งบริษัทจะรับภาระต้นทุนแทนลูกค้า)
- **Database Error:** หาก `GetTransactionFees` ล้มเหลว ระบบจะคืน Error และบล็อกการถอนเงินทันที
- **Bank Specific Rates:** ตรวจสอบ `bank_code` ใน `condition` ของ Fee เสมอ เพราะแต่ละธนาคารอาจมีค่าธรรมเนียมไม่เท่ากัน

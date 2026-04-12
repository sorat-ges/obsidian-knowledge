---
title: Fireblocks Hook Business Rules (Deposit & Withdraw)
tags: [logic, crypto, fireblocks, webhook, deposit, withdraw]
status: active
last-updated: 2026-04-07
---

# ⚙️ Business Logic: Fireblocks Webhook Hooks (Crypto Deposit & Withdraw)

## 🎯 วัตถุประสงค์
จัดการการแจ้งเตือน (Webhook Notification) จาก Fireblocks สำหรับรายการฝาก (Deposit) และถอน (Withdraw) สินทรัพย์ดิจิทัล เพื่อให้ระบบสามารถอัปเดตยอดคงเหลือของลูกค้าและสถานะของออเดอร์ได้อย่างถูกต้องและปลอดภัย

---

## 📥 1. การฝากคริปโต (Crypto Deposit Hook)
กระบวนการรับสินทรัพย์จากภายนอกเข้าสู่ระบบผ่าน Fireblocks Vault

### 📜 กฎธุรกิจ (Business Rules)
| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **Depositable Flag** | ทุกรายการฝาก | ระบบต้องตรวจสอบ `Depositable` flag ใน `product_digital_asset_extension` เสมอ |
| **Delist Protection** | เมื่อ `Depositable = FALSE` | **(Critical)** ห้ามเพิ่มยอดเงินให้ลูกค้า ระบบต้องบันทึก Log และยุติการทำงานทันที (Skip balance processing) |
| **Balance Update** | เมื่อตรวจสอบผ่านทุกขั้นตอน | เพิ่มยอดสินทรัพย์ใน `customer_main` ledger (ประเภท `AVAILABLE`) |
| **Transaction Record** | ทุกรายการสำเร็จ | ต้องบันทึกรายการลงในตาราง `order_crypto` และ Ledger สำหรับ Audit Trail |

---

## 📤 2. การถอนคริปโต (Crypto Withdraw Hook)
กระบวนการยืนยันผลการโอนสินทรัพย์ออกจากระบบไปยัง Blockchain ปลายทาง

### 📜 กฎธุรกิจ (Business Rules)
| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **State Transition** | รายการสำเร็จ (Success) | เปลี่ยนสถานะตามลำดับ: `order-processing` ➔ `order-verifying` ➔ `sync-ledger` ➔ `completed` |
| **Idempotency** | ทุก Webhook ที่ได้รับ | ต้องตรวจสอบ `Idempotency Key` (เช่น TxID หรือ Hook ID) เพื่อป้องกันการประมวลผลซ้ำ (Double Entry) |
| **Ledger Completion** | เมื่อสถานะเป็น `completed` | ยืนยันการตัดยอดเงินออกจากบัญชี `PENDING_WITHDRAWAL` ของลูกค้าอย่างถาวร |
| **Failure Handling** | รายการล้มเหลว (Failed) | เปลี่ยนสถานะเป็น `cancelled` หรือ `rejected` และพิจารณาการคืนเงิน (Refund/Unlock) ตามสาเหตุ |

---

## 🔄 วงจรชีวิตของสถานะ (State Machine Logic)
ระบบจะอัปเดตสถานะออเดอร์ใน `order-service` ตามข้อมูลที่ได้รับจาก Fireblocks ดังนี้:

1. **`order-processing`**: ระบบส่งข้อมูลไปยัง Fireblocks และรอผลการยืนยันจาก Blockchain
2. **`order-verifying`**: ได้รับ Hook ยืนยันผลสำเร็จ ระบบกำลังตรวจสอบความถูกต้องภายใน
3. **`sync-ledger`**: ระบบกำลังลงบัญชี (Ledger) เพื่อบันทึกการเคลื่อนไหวของเงิน
4. **`completed`**: **(Terminal State)** รายการเสร็จสมบูรณ์ ยอดเงินถูกหัก/เพิ่มเรียบร้อย

---

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `pkg/crypto/service.go`
- **Main Function (Deposit)**: `HandleDepositCryptoWebhook`
- **Main Function (Withdraw)**: `HandleWithdrawCryptoWebhook` (หรือฟังก์ชันจัดการ Status Update)
- **Status Enums**: `internal/constants/enum/order_crypto_enum.go`
- **Database Tables**: `order_crypto`, `product_digital_asset_extension`, `ledger_transactions`

---

## 🤖 How to Verify (For AI Agent)
- **ตรวจสอบ Logic การ Delist**:
  `grep -n "if !product.Depositable" pkg/crypto/service.go`
- **ตรวจสอบการเปลี่ยนสถานะ Withdrawal**:
  `grep -A 20 "WithdrawOrderStatus" internal/constants/enum/order_crypto_enum.go`
- **ตรวจสอบการใช้ Idempotency**:
  `grep "IdempotencyKey" pkg/crypto/service.go`

---

## ⚠️ ข้อควรระวัง (Security & Failure Handling)
- **Double Spending**: ระบบต้องตรวจสอบสถานะปัจจุบันของออเดอร์ก่อนอัปเดตเสมอ เพื่อป้องกันการรับ Webhook ซ้ำในเวลาไล่เลี่ยกัน
- **Webhook Authentication**: ต้องตรวจสอบ Signature หรือ Token จาก Fireblocks เพื่อยืนยันว่าข้อมูลส่งมาจากแหล่งที่เชื่อถือได้จริง
- **Database Lock**: การอัปเดต Ledger ควรทำภายใน Database Transaction เดียวกันเพื่อป้องกันข้อมูลไม่สอดคล้อง (Data Inconsistency)

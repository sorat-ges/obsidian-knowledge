---
title: Internal Customer Transfer (White Glove)
tags: [logic, transfer, white-glove, internal]
status: active
last-updated: 2026-04-12
---

# ⚙️ Business Logic: Internal Customer Transfer (White Glove)

## 🎯 วัตถุประสงค์
จัดการการโอนสินทรัพย์ (Asset Transfer) ระหว่างบัญชีลูกค้าภายในระบบ (Internal Customer Account) โดยผ่านช่องทาง White Glove (Dealer/RM เป็นผู้ดำเนินการ) เพื่อให้มั่นใจในความถูกต้องของยอดเงินและต้นทุน (Average Cost)

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **Channel** | ทุกรายการ | ต้องดำเนินการผ่าน White Glove Handler (`CreateInternalCustomerTransfer`) |
| **Quantity** | ทุกรายการ | ต้องเป็นค่าบวก (`PositiveQuantity`) |
| **Standard Mode** | บัญชีปกติ | ต้องตรวจสอบ `AvailableUnitBalance` ใน Portfolio ว่าเพียงพอกับจำนวนที่ต้องการโอน |
| **Skip Mode** | บัญชีพิเศษ (Config) | หากอยู่ใน `SkipBalanceValidateCustomerAccountIDs` จะ**ข้ามการเช็คยอดเงิน** |
| **Price (Override)** | Skip Mode | **บังคับ (Mandatory)** ต้องระบุ `Price` เพื่อใช้เป็นต้นทุนเฉลี่ย (Average Cost) |
| **Average Cost** | Standard Mode | ใช้ค่าจาก `sourcePortfolio.AverageCost` หากไม่มีการส่ง Price Override มา |
| **Product** | ทุกรายการ | ต้องเป็น Product ที่ได้รับอนุญาต (Allowed Product) |

## 🔄 ขั้นตอนการทำงาน (Logic Flow)
1. **Validation**: ตรวจสอบจำนวน (Quantity), บัญชีต้นทาง/ปลายทาง และ Product
2. **Persistence**: สร้างรายการ `order_transfer` ในสถานะ `open`
3. **Settlement (Phase 1: Hold)**: ลด `AVAILABLE` และเพิ่ม `HOLD_IN_ORDER` ของบัญชีต้นทาง
4. **Settlement (Phase 2: Settle)**: ลด `HOLD_IN_ORDER` ของบัญชีต้นทาง และเพิ่ม `AVAILABLE` ให้บัญชีปลายทาง
5. **Finalize**: อัปเดตสถานะ `order_transfer` เป็น `completed`

## 🚦 สถานะและการเปลี่ยนผ่าน (Status Transitions)
- `open` -> `completed`: เมื่อขั้นตอน Settlement ทั้งหมดเสร็จสิ้น (Success)
- `open` -> `failed`: หากเกิดข้อผิดพลาดในขั้นตอน Settlement (Failure)

## 🛠️ อ้างอิงระบบ (Technical Context)
- **Domain/Service**: Order Service (`order_transfer` package)
- **Relevant Code Path**: `pkg/order_transfer/service.go`, `pkg/order_transfer/service_internal_ledger.go`
- **Method**: `InternalCustomerTransfer`
- **Tables**: `order_transfer`, `ledger_transactions`, `asset_portfolios`

## ⚠️ ข้อควรระวัง (Edge Cases)
- **Insufficient Balance**: หากยอดเงินไม่พอใน Standard Mode ระบบจะคืน Error `ErrInsufficientBalance`
- **Rollback**: หากขั้นตอน Phase 2 (Settle) ล้มเหลว ระบบจะทำการ Revert Hold ใน Phase 1 กลับมาที่ `AVAILABLE` ของต้นทาง
- **Price Format**: ใน Skip Mode หากส่ง Price มาใน Format ที่ไม่ถูกต้อง หรือน้อยกว่า/เท่ากับ 0 จะได้รับ Error `InvalidRequest`

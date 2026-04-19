---
title: Consumer Logical Ledger Processing Rules
tags: [logic, asset-consumer, ledger, portfolio, cost-calculation]
status: active
last-updated: 2026-04-12
---

# ⚙️ Business Logic: Consumer Logical Ledger Write to Business

## 🎯 วัตถุประสงค์
เพื่อประมวลผลข้อมูลบัญชีแยกประเภท (Logical Ledger Entries) และนำมาอัปเดตเป็นยอดถือครองสินทรัพย์จริง (Business Holdings) ในระบบ Portfolio ของลูกค้าให้มีความถูกต้องและเป็นปัจจุบัน

## 🔄 ภาพรวมกระบวนการ (Process Flow)
1. **Consume:** รับข้อมูล Ledger จาก Kafka Topic `customer_logical_entry`.
2. **Persistence:** บันทึกประวัติรายการลงในตาราง Audit Trail (`dw_order.logical_ledger_transaction`).
3. **Business State Update:** อัปเดตยอดคงเหลือและต้นทุนใน `xpg_asset.asset_portfolio` ภายใต้ Database Transaction เดียวกัน.
4. **Broadcast:** ส่งข้อความแจ้งการเปลี่ยนแปลง Portfolio ไปยัง Downstream Services.

## 📜 ตรรกะการจัดการยอดคงเหลือ (Balance Mapping Rules)

ระบบจะอัปเดต Field ใน Portfolio ตามการจับคู่ระหว่าง `LedgerType` และทิศทางของรายการ (`Type`):

| Ledger Type | Movement (Type) | ผลกระทบต่อ Asset Portfolio |
| :--- | :--- | :--- |
| **`AVAILABLE`** | **INCREASE** | เพิ่ม `available_unit_balance` และ `unit_balance` |
| **`AVAILABLE`** | **DECREASE** | ลด `available_unit_balance` |
| **`HOLD_IN_ORDER`** | **INCREASE** | เพิ่ม `pending_out_unit_balance` (ยอดที่ล็อกไว้เทรด/ถอน) |
| **`HOLD_IN_ORDER`** | **DECREASE** | ลด `pending_out_unit_balance` และ `unit_balance` (เมื่อรายการสำเร็จหรือถูกยกเลิก) |
| **`PENDING_DEPOSIT`** | **INC/DEC** | อัปเดต `pending_in_unit_balance` (รายการฝากที่รอ Confirm) |

## ➗ ตรรกะการคำนวณต้นทุน (Cost Calculation Logic)

### 1. สินทรัพย์ดิจิทัล (Crypto/Token)
ใช้หลักการ **Weighted Average Cost** ในการบันทึกต้นทุน:
- **เมื่อสินทรัพย์เพิ่มขึ้น:** 
  - `AverageCost = (TotalCostเดิม + ต้นทุนรายการใหม่) / UnitBalanceรวมใหม่`
  - `TotalCost = UnitBalanceรวมใหม่ * AverageCost` (ปัดเศษลง 18 ตำแหน่ง)
- **เมื่อสินทรัพย์ลดลง:**
  - `AverageCost` **คงเดิม**
  - `TotalCost` = `UnitBalanceที่เหลือ * AverageCost`

### 2. เงินสด (Fiat - THB)
- ต้นทุนจะถูก Hardcode เป็น **1.0** เสมอ เนื่องจากค่าของเงินบาทคงที่

### 3. การป้องกันข้อมูลค้าง (Zero Balance Protection)
- **(Critical)** หากยอด `unit_balance` เหลือ **0** หลังการประมวลผล ระบบต้องทำการ **Reset** ทั้ง `average_cost` และ `total_cost` ให้เป็น **0** ทันที เพื่อป้องกันเศษทศนิยมค้างสำหรับการคำนวณในอนาคต

## 🛠️ Technical Reference
- **Consumer Service**: `pkg/customer-logical-entry/service.go`
- **Main Logic Function**: `UpdateAssetPortfolio`, `updateAssetPortfolioFields`
- **Database Tables**: 
  - `dw_order.logical_ledger_transaction` (History)
  - `xpg_asset.asset_portfolio` (Business State)

## 🤖 How to Verify (For AI Agent)
ตรวจสอบการแมป Ledger ได้ที่ฟังก์ชัน `updateAssetPortfolioFields`:
`grep -n "case transaction.IncreaseAvailable():" pkg/customer-logical-entry/service.go`
ตรวจสอบการคำนวณต้นทุนเฉลี่ย:
`grep -n "func (svc customerLogicalEntryService) calculateAverageCost" pkg/customer-logical-entry/service.go`

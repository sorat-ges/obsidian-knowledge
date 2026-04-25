---
title: Consumer Logical Ledger Processing Rules
tags: [logic, asset-consumer, ledger, portfolio, cost-calculation]
status: active
last-updated: 2026-04-19
---

# ⚙️ Business Logic: Consumer Logical Ledger Write to Business

## 🎯 วัตถุประสงค์
เพื่อประมวลผลข้อมูลบัญชีแยกประเภท (Logical Ledger Entries) และนำมาอัปเดตเป็นยอดถือครองสินทรัพย์จริง (Business Holdings) ในระบบ Portfolio ของลูกค้าให้มีความถูกต้องและเป็นปัจจุบัน

## 📜 กฎธุรกิจ (Business Rules)

### 1. การจัดการยอดคงเหลือ (Balance Mapping)
| Ledger Type | Movement (Type) | ผลกระทบต่อ Asset Portfolio |
| :--- | :--- | :--- |
| **`AVAILABLE`** | **INCREASE** | เพิ่ม `available_unit_balance` และ `unit_balance` |
| **`AVAILABLE`** | **DECREASE** | ลด `available_unit_balance` |
| **`HOLD_IN_ORDER`** | **INCREASE** | เพิ่ม `pending_out_unit_balance` (ยอดที่ล็อกไว้เทรด/ถอน) |
| **`HOLD_IN_ORDER`** | **DECREASE** | ลด `pending_out_unit_balance` และ `unit_balance` (เมื่อรายการสำเร็จหรือถูกยกเลิก) |
| **`PENDING_DEPOSIT`** | **INC/DEC** | อัปเดต `pending_in_unit_balance` (รายการฝากที่รอ Confirm) |

### 2. การคำนวณต้นทุน (Cost Calculation Logic)
- **Weighted Average Cost**: `AverageCost = (TotalCostเดิม + ต้นทุนรายการใหม่) / UnitBalanceรวมใหม่`
- **Fiat (THB)**: ต้นทุนคงที่ที่ **1.0** เสมอ
- **Zero Balance Protection**: หาก `unit_balance` เป็น **0** ต้อง Reset `average_cost` และ `total_cost` เป็น **0** ทันที

## 🔄 ขั้นตอนการทำงาน (Logic Flow)
1. **Consume**: รับข้อมูลจาก Kafka Topic `customer_logical_entry`
2. **Persistence**: บันทึก Audit Trail ลงใน `dw_order.logical_ledger_transaction`
3. **Business State Update**: อัปเดต `xpg_asset.asset_portfolio` ภายใต้ DB Transaction เดียวกัน
4. **Broadcast**: ส่งข้อความแจ้งการเปลี่ยนแปลงไปยัง Downstream Services

## 🛠️ Technical Reference
- **Domain/Service**: Asset Consumer Service
- **Relevant Code Path**: `pkg/customer-logical-entry/service.go`
- **Database Tables**: 
  - `dw_order.logical_ledger_transaction` (History)
  - `xpg_asset.asset_portfolio` (Current State)

## 🤖 How to Verify
1. ตรวจสอบฟังก์ชันการแมป Ledger: `grep -n "case transaction.IncreaseAvailable():" pkg/customer-logical-entry/service.go`
2. ตรวจสอบการคำนวณต้นทุนเฉลี่ย: `grep -n "func (svc customerLogicalEntryService) calculateAverageCost" pkg/customer-logical-entry/service.go`
3. ยืนยัน Logic การ Reset ยอดเป็นศูนย์: `grep -n "Reset average_cost" pkg/customer-logical-entry/service.go`

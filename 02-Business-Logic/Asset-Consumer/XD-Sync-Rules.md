---
title: XD System Synchronization Business Rules
tags: [logic, asset-consumer, xd-sync, balance, cost]
status: active
last-updated: 2026-04-12
---

# ⚙️ Business Logic: XD System Synchronization

## 🎯 วัตถุประสงค์
เพื่อซิงโครไนซ์ข้อมูลยอดเงิน (Balance) และต้นทุน (Cost) จากระบบ XD (External Platform) มายังระบบ XAS เพื่อให้ข้อมูลในหน้าแอปพลิเคชันของลูกค้ามีความสอดคล้องกัน

## 📥 1. การซิงค์ยอดคงเหลือ (XD Balance Sync)
ประมวลผลผ่าน Topic `phoenix_dev_create_logical_entries`

### 📜 กฎการอัปเดต (Sync Rules)
| XD Ledger Type | ทิศทาง (Type) | ฟิลด์ใน XAS Portfolio |
| :--- | :--- | :--- |
| **`AVAILABLE`** | INC/DEC | อัปเดต `available_unit_balance` |
| **`PENDING_DEPOSIT`** | INC/DEC | อัปเดต `pending_in_unit_balance` |
| **`HOLD_IN_ORDER`** | INC/DEC | อัปเดต `pending_out_unit_balance` |
| **`PENDING_WITHDRAWAL`** | INC/DEC | อัปเดต `pending_out_unit_balance` |

- **สูตรคำนวณยอดรวม:** `UnitBalance = Available + PendingOut`
- **หมายเหตุ:** หากไม่พบบัญชี Portfolio ในระบบ XAS ขณะซิงค์ ระบบจะทำการ **Auto-Create** แถวใหม่ให้ทันทีโดยดึงข้อมูล Product จากระบบ Master Data

## 📊 2. การซิงค์ต้นทุนและกำไร/ขาดทุน (XD P/L Sync)
ประมวลผลผ่าน Topic `phoenix_dev_sync_profit_and_loss`

### 📜 กฎการอัปเดตต้นทุน
- ระบบจะรับค่า `average_cost` และ `total_cost` ตรงจากระบบ XD 
- **ความสำคัญ:** ค่าที่ได้จาก XD จะถือเป็น **Source of Truth** และจะเขียนทับ (Overwrite) ค่าเดิมใน XAS Portfolio ทันทีเพื่อให้การแสดงผลกำไร/ขาดทุนตรงกับระบบต้นทาง

## ⚠️ ข้อควรระวัง (Sync Constraints)
1. **Investment Account Mapping:** ระบบใช้ `InvestmentAccountCode` (เลขที่บัญชี XD) ในการหาบัญชีลูกค้าในระบบ XAS.
2. **Double Entry Logging:** ทุกข้อความที่ได้รับจาก XD จะถูกบันทึกสำเนาลงในตาราง `external_data.sync_balance_xd_real_time` เพื่อใช้ในการตรวจสอบกรณีเกิดปัญหา (Data Tracking).
3. **Data Integrity:** การอัปเดตยอดต้องใช้ฟังก์ชัน `PositiveValue()` เพื่อป้องกันยอดเงินติดลบในระดับฐานข้อมูลจากความผิดพลาดของลำดับ Message (Out-of-order messages).

## 🛠️ Technical Reference
- **Sync Services**: `pkg/xd-balance/service.go`, `pkg/xd-sync-profit-and-loss/service.go`
- **Database Tables**:
  - `xpg_asset.asset_portfolio`
  - `external_data.sync_balance_xd_real_time`

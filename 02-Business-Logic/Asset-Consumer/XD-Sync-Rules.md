---
title: XD System Synchronization Business Rules
tags: [logic, asset-consumer, xd-sync, balance, cost]
status: active
last-updated: 2026-04-19
---

# ⚙️ Business Logic: XD System Synchronization

## 🎯 วัตถุประสงค์
เพื่อซิงโครไนซ์ยอดเงิน (Balance) และต้นทุน (Cost) จากระบบภายนอก (XD) มายังระบบ XAS เพื่อให้ข้อมูลในแอปพลิเคชันลูกค้ามีความถูกต้องและสอดคล้องกัน

## 📜 กฎธุรกิจ (Business Rules)

### 1. การซิงค์ยอดคงเหลือ (Balance Sync)
| XD Ledger Type | ทิศทาง (Type) | ฟิลด์ใน XAS Portfolio |
| :--- | :--- | :--- |
| **`AVAILABLE`** | INC/DEC | `available_unit_balance` |
| **`PENDING_DEPOSIT`** | INC/DEC | `pending_in_unit_balance` |
| **`HOLD_IN_ORDER`** | INC/DEC | `pending_out_unit_balance` |

- **สูตรคำนวณ**: `UnitBalance = Available + PendingOut`
- **Auto-Create**: หากไม่พบบัญชี Portfolio ในระบบ XAS ระบบจะสร้างใหม่ให้อัตโนมัติ

### 2. การซิงค์ต้นทุน (Cost Sync)
- **Source of Truth**: ค่า `average_cost` และ `total_cost` จาก XD จะเขียนทับ (Overwrite) ค่าเดิมใน XAS ทันที

## ⚠️ ข้อควรระวัง (Sync Constraints)
- **Mapping**: ใช้ `InvestmentAccountCode` (เลขบัญชี XD) ในการระบุตัวตนลูกค้า
- **Tracking**: ทุกข้อความจะถูกสำเนาลงตาราง Audit Trail `external_data.sync_balance_xd_real_time`
- **Safety**: ต้องใช้ฟังก์ชัน `PositiveValue()` เพื่อป้องกันยอดเงินติดลบจากความผิดพลาดของลำดับข้อความ

## 🛠️ Technical Reference
- **Domain/Service**: Asset Consumer Sync (XD)
- **Sync Services**: `pkg/xd-balance/service.go`, `pkg/xd-sync-profit-and-loss/service.go`
- **Database Tables**:
  - `xpg_asset.asset_portfolio`
  - `external_data.sync_balance_xd_real_time`

## 🤖 How to Verify
1. ตรวจสอบข้อมูลในตาราง `sync_balance_xd_real_time` เทียบกับยอดใน `asset_portfolio`
2. ยืนยันการทำงานของ `PositiveValue()` โดยส่งข้อความ DECREASE ที่ทำให้ยอดติดลบ และตรวจสอบผลลัพธ์ใน DB
3. ตรวจสอบการเขียนทับต้นทุนเฉลี่ยเมื่อได้รับข้อมูลจาก Topic `phoenix_dev_sync_profit_and_loss`

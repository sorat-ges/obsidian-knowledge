---
title: Customer Account & Asset Reporting Rules
tags: [logic, asset, account, report, status]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: Customer Account & Asset Reporting

## 🎯 วัตถุประสงค์
จัดการสถานะบัญชีสินทรัพย์ของลูกค้า (Account Lifecycle) และกฎการสรุปข้อมูลเพื่อออกรายงาน (Reporting)

## 📜 สถานะบัญชีลูกค้า (Customer Account Status)

| สถานะ (Status) | กฎธุรกิจ (Business Rule) | ผลกระทบต่อสินทรัพย์ | Mapping (Code) |
| :--- | :--- | :--- | :--- |
| **`active`** | บัญชีปกติ สามารถเทรด ฝาก ถอนได้ | ไม่มีข้อจำกัด | `enum.AccountStatusActive` |
| **`suspended`** | ถูกระงับการทำรายการชั่วคราว (Locked) | ดูยอดเงินได้ แต่ **ถอนหรือเทรดไม่ได้** | `enum.AccountStatusSuspended` |
| **`inactive`** | บัญชีที่ไม่มีการเคลื่อนไหวนานเกินกำหนด | อาจถูกระงับการคำนวณ NAV รายวัน | - |
| **`closed`** | บัญชีที่ปิดถาวร | สินทรัพย์ต้องเป็น 0 ก่อนปิด | (Filtered Out) |

## 📊 กฎการออกรายงาน (Reporting & Statement Rules)

### 1. Monthly Statement (รายงานประจำเดือน)
- **Cut-off Date**: ทุกสิ้นเดือน (วันสุดท้ายของเดือน เวลา 23:59:59)
- **NAV Calculation**: ใช้ราคา NAV ล่าสุดของวันสิ้นเดือนในการสรุปมูลค่าพอร์ต
- **Movement Tracking**: ต้องแสดงรายการฝาก (Deposit), ถอน (Withdraw), และเทรด (Swap) ทั้งหมดที่เกิดขึ้นในเดือนนั้น

### 2. Portfolio Overview (ภาพรวมพอร์ต)
- **Consolidation**: ระบบต้องสามารถรวมยอดสินทรัพย์จากทุกบัญชี (Asset Group) ของลูกค้าคนเดียวกันมาแสดงผลรวมได้
- **Market Valuation**: สินทรัพย์ทุกตัวต้องมีราคากลาง (Mark-to-Market) แปลงเป็น **THB** เพื่อแสดงผลรวมมูลค่าสุทธิ

## 🛠️ Technical Reference (Internal)
- **Account Service**: `pkg/customer/service.go`
- **Reporting Service**: `pkg/report/monthly_service.go`
- **Database Table**: `dw_customer.customer_account`, `xpg_asset.report_monthly_statement_file`

## 🤖 How to Verify (For AI Agent)
ตรวจสอบ Enum สถานะบัญชีได้ที่:
`grep -rn "type AccountStatus string" internal/constants/enum/customer_account_enum.go`
และตรวจสอบสถานะการสร้างรายงานประจำเดือนได้ที่ `MonthlyReportStatus`

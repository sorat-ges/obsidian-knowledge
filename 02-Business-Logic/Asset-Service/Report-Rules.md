---
title: Customer Account & Asset Reporting Rules
tags: [logic, asset, account, report, status]
status: active
last-updated: 2026-04-19
---

# ⚙️ Business Logic: Customer Account & Asset Reporting

## 🎯 วัตถุประสงค์
จัดการสถานะบัญชีสินทรัพย์ของลูกค้า (Account Lifecycle) และกฎการสรุปข้อมูลเพื่อออกรายงาน (Reporting)

## 📜 กฎธุรกิจ (Business Rules)

### 1. สถานะบัญชีลูกค้า (Account Status)
| สถานะ (Status) | กฎธุรกิจ (Business Rule) | ผลกระทบต่อสินทรัพย์ |
| :--- | :--- | :--- |
| **`active`** | บัญชีปกติ | เทรด/ฝาก/ถอน ได้ปกติ |
| **`suspended`** | ระงับรายการชั่วคราว | **ถอนหรือเทรดไม่ได้** ดูยอดเงินได้เท่านั้น |
| **`inactive`** | ไม่มีการเคลื่อนไหวนาน | อาจระงับการคำนวณ NAV รายวัน |
| **`closed`** | ปิดบัญชีถาวร | สินทรัพย์ต้องเป็น 0 ก่อนปิด |

### 2. การออกรายงาน (Reporting Rules)
- **Monthly Statement**: ตัดยอดทุกสิ้นเดือน เวลา 23:59:59 ใช้ราคา NAV วันสิ้นเดือน
- **Portfolio Overview**: ต้องรวมยอดสินทรัพย์ทุกบัญชี (Asset Group) ของลูกค้าคนเดียวกันมาแสดงผลรวม
- **Mark-to-Market**: สินทรัพย์ทุกประเภทต้องแปลงเป็น **THB** เพื่อแสดงมูลค่าสุทธิรวม (Total Equity)

## 🛠️ Technical Reference
- **Domain/Service**: Customer Service, Report Service
- **Relevant Code Path**: `pkg/customer/service.go`, `pkg/report/monthly_service.go`
- **Database Tables**:
  - `dw_customer.customer_account`
  - `xpg_asset.report_monthly_statement_file`

## 🤖 How to Verify
1. ตรวจสอบ Enum สถานะ: `grep -rn "type AccountStatus string" internal/constants/enum/customer_account_enum.go`
2. ยืนยัน Logic การรวมพอร์ต: `grep -n "TotalEquity" pkg/asset/service.go`
3. ทดสอบการดึงราคา Mark-to-Market สำหรับรายงาน: `grep -n "calculateMarketValue" pkg/report/monthly_service.go`

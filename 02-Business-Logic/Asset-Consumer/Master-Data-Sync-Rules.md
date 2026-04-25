---
title: Customer & Product Master Data Sync Rules
tags: [logic, asset-consumer, master-data, customer, product]
status: active
last-updated: 2026-04-19
---

# ⚙️ Business Logic: Customer & Product Master Data Sync

## 🎯 วัตถุประสงค์
เพื่อให้ระบบ Asset-Consumer มีข้อมูลพื้นฐานของลูกค้า (Identification/Account) และรายละเอียดสินค้า (Product Specs) ที่ถูกต้องแม่นยำ เพื่อใช้เป็นข้อมูลอ้างอิงในการบันทึกยอดเงินและคำนวณมูลค่าพอร์ต

## 📜 กฎธุรกิจ (Business Rules)

### 1. ข้อมูลลูกค้า (Customer)
- **Identification**: บันทึกข้อมูลส่วนตัวลงใน `dw_customer.customer_identification`
- **Account Mapping**: บันทึกความสัมพันธ์บัญชีลงใน `dw_customer.customer_account`
- **Unitholder ID**: ซิงค์รหัสผู้ถือหน่วยลงทุนลงใน `dw_order.customer_account_unitholder`
- **Status Sync**: อัปเดตสถานะบัญชี (e.g., `active`, `suspended`) ทันทีเมื่อได้รับ Event

### 2. ข้อมูลสินค้าและราคา (Product & Price)
- **Product Definition**: บันทึก Symbol, Asset Group, Currency ลงใน `dw_product.product`
- **Mark-to-Market (MTM)**: รับราคาล่าสุด (NAV/Price) เพื่อประเมินมูลค่าพอร์ตและคำนวณต้นทุนกรณีไม่มีข้อมูลต้นทุนส่งมาใน Ledger

### 3. ข้อมูลดีลเลอร์ (Dealer)
- **Map Dealer**: เชื่อมโยง `DealerID` ภายนอก เข้ากับ `CustomerAccountID` ของ XSpring

## 🛠️ Technical Reference
- **Domain/Service**: Asset Consumer Sync Service
- **Sync Services**: 
  - `pkg/customer-account/service.go`
  - `pkg/product-mf/service.go`
- **Database Tables**:
  - `dw_customer.customer_identification`
  - `dw_customer.customer_account`
  - `dw_product.product`

## 🤖 How to Verify
1. ตรวจสอบสถานะการซิงค์ผ่าน Kafka Monitor สำหรับ Topic `customer-sync`
2. ยืนยันข้อมูลในตาราง `dw_product.product` หลังจากมีการอัปเดตราคาล่าสุด (MTM)
3. ตรวจสอบการ Mapping บัญชีในตาราง `dw_customer.customer_account`

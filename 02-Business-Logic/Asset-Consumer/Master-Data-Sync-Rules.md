---
title: Customer & Product Master Data Sync Rules
tags: [logic, asset-consumer, master-data, customer, product]
status: active
last-updated: 2026-04-12
---

# ⚙️ Business Logic: Customer & Product Master Data Sync

## 🎯 วัตถุประสงค์
เพื่อให้ระบบ Asset-Consumer มีข้อมูลพื้นฐานของลูกค้า (Identification/Account) และรายละเอียดสินค้า (Product Specs) ที่ถูกต้องแม่นยำ เพื่อใช้เป็นข้อมูลอ้างอิงในการบันทึกยอดเงินและคำนวณมูลค่าพอร์ต

## 👤 1. ข้อมูลลูกค้า (Customer Sync)
ประมวลผลผ่าน Topic `customer-sync` และ `account-unitholder-sync`

### 📜 กฎการบันทึก (Customer Rules)
- **Identification:** บันทึกข้อมูลส่วนตัวพื้นฐานลงใน `dw_customer.customer_identification`.
- **Account Mapping:** บันทึกความสัมพันธ์ระหว่างบัญชีซื้อขายและรหัสบริษัทลงใน `dw_customer.customer_account`.
- **Unitholder ID:** สำหรับบัญชี Mutual Fund หรือบัญชีที่มีตัวแทนจำหน่าย (AMC) ระบบจะซิงค์รหัสผู้ถือหน่วยลงทุน (Unitholder ID) ลงในตาราง `dw_order.customer_account_unitholder`.
- **Status Change:** หากได้รับ Event `update-customer-account-status` ระบบจะทำการอัปเดตสถานะบัญชีในตาราง Account ทันที (เช่น `active` -> `suspended`).

## 📦 2. ข้อมูลสินค้าและราคา (Product & Market Price Sync)
ประมวลผลผ่าน Topics เกี่ยวกับ `product-sync` และ `mark-to-market`

### 📜 กฎการจัดการสินค้า
- **Product Definition:** ซิงค์ข้อมูลสเปกสินค้า (Symbol, Asset Group, Currency) ลงในตาราง `dw_product.product`.
- **Mark-to-Market (MTM):** รับข้อมูลราคาล่าสุด (NAV/Price) จากระบบภายนอก (เช่น CMC สำหรับ Crypto หรือ KTB สำหรับ FX) เพื่อใช้ในการ:
  1. ประเมินมูลค่าพอร์ต (Portfolio Valuation).
  2. คำนวณต้นทุนเฉลี่ยกรณีไม่มีข้อมูลต้นทุนส่งมาใน Ledger.

## 🏢 3. ข้อมูลดีลเลอร์ (Dealer Mapping)
- **Map Dealer:** ระบบมีการซิงค์ข้อมูล `map_dealer` เพื่อเชื่อมโยง `DealerID` จากระบบ Ledger ภายนอก เข้ากับ `CustomerAccountID` ของ XSpring เพื่อให้สามารถบันทึกพอร์ตในฝั่ง Brokerage ได้ถูกต้อง.

## 🛠️ Technical Reference
- **Sync Services**: 
  - `pkg/customer-account/service.go`
  - `pkg/product-mf/service.go`
  - `pkg/product-digital-asset-mark-to-market/service.go`
- **Database Tables**:
  - `dw_customer.customer_identification`
  - `dw_customer.customer_account`
  - `dw_product.product`
  - `xpg_asset.map_dealer`

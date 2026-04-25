---
title: Order Offering (Subscription) Business Rules
tags: [logic, order-service, offering, subscription, validation]
status: active
last-updated: 2026-04-21
---

# ⚙️ Business Logic: Order Offering (Subscription) Validation

## 🎯 วัตถุประสงค์
เพื่อควบคุมความถูกต้องของยอดเงินและเงื่อนไขการสั่งซื้อ (Subscription) ของโครงการ Offering หรือ ICO โดยมีการตรวจสอบทั้งในระดับรายผลิตภัณฑ์ (Product) และระดับภาพรวมโครงการ (Project) เพื่อให้เป็นไปตามเงื่อนไขของหนังสือชี้ชวน

## 📜 กฎธุรกิจ (Business Rules)

### 1. การคำนวณมูลค่าออเดอร์ (Amount Calculation)
ระบบจะคำนวณมูลค่าจริงของแต่ละรายการออเดอร์ก่อนการตรวจสอบ:
- **สั่งซื้อเป็นยอดเงิน (Amount)**: ใช้ยอดเงินที่ระบุมาโดยตรง
- **สั่งซื้อเป็นหน่วย (Unit)**: คำนวณจาก `จำนวนหน่วย * ราคาเสนอขาย (Offering Price)`

### 2. การตรวจสอบระดับรายผลิตภัณฑ์ (Individual Product Validation)
ตรวจสอบยอดเงินของแต่ละรายการเทียบกับเงื่อนไขสินค้า (Product Level):
- **ยอดซื้อขั้นต่ำ (Minimum Buy)**: ต้องไม่ต่ำกว่าเกณฑ์ที่ผลิตภัณฑ์กำหนด
- **ยอดซื้อสูงสุด (Maximum Buy)**: ต้องไม่เกินขีดจำกัดสูงสุดของผลิตภัณฑ์ (หากมีการตั้งไว้)
- **ขั้นบันไดการสั่งซื้อ (Order Step)**: ยอดเงินต้องเพิ่มขึ้นเป็นจังหวะตามค่า Step ที่กำหนด (เช่น เพิ่มทีละ 500 บาท) โดยใช้การหารเอาเศษ (Modulo)

### 3. การตรวจสอบระดับโครงการ (Total Project Validation)
ตรวจสอบผลรวมของทุกรายการในคำสั่งซื้อเดียว (Project Level):
- **ยอดรวมสูงสุดของโครงการ (Total Maximum Buy)**: ผลรวมยอดเงินทุกรายการในหนึ่ง Request ต้องไม่เกินวงเงินรวมสูงสุดที่โครงการกำหนดไว้สำหรับประเภทนักลงทุนนั้นๆ
- **ห้ามยอดรวมเป็นศูนย์ (Zero Amount Check)**: ผลรวมยอดเงินทั้งหมดในคำสั่งซื้อต้องมากกว่า 0 เสมอ

## 🗂️ รายละเอียดฟิลด์และแหล่งข้อมูล (Field Mapping)

| ขั้นตอนการตรวจสอบ      | ชื่อฟิลด์ (Field Name)               | แหล่งที่มา (Table / Source)                |
| :--------------------- | :----------------------------------- | :----------------------------------------- |
| **ข้อมูลจากลูกค้า**    | `amount`, `unit`, `unit_type`        | `OrderOfferingCreateRequest`               |
| **ราคาขาย (NAV)**      | `offering_price`                     | `dw_product.product`                       |
| **เงื่อนไขรายสินค้า**  | `minimum_buy`, `maximum_buy`, `step` | `dw_product.product_transaction_condition` |
| **เงื่อนไขรวมโครงการ** | `maximum_buy` (Project Level)        | `dw_product.project_transaction_condition` |

## 🛠️ Technical Reference
- **Domain/Service**: Order Service (`order_offering` package)
- **Relevant Code Path**: `order-service/pkg/order_offering/service.go`
- **Primary Functions**:
  - `ValidateOrderDetail`: ฟังก์ชันหลักที่คุมการ Validation ทั้งหมด
  - `calculateOrderAmount`: คำนวณยอดเงินจาก Unit หรือ Amount
  - `validateSingleOrder`: ตรวจสอบเกณฑ์รายสินค้า (Min/Max/Step)
  - `validateTotalAmount`: ตรวจสอบยอดรวมระดับโครงการ

## 🤖 How to Verify
1. ตรวจสอบ Logic การคำนวณเงิน: `grep -n "func.*calculateOrderAmount" order-service/pkg/order_offering/service.go`
2. ตรวจสอบการเช็ค Min/Max รายรายการ: `grep -n "func.*validateAmountLimits" order-service/pkg/order_offering/service.go`
3. ตรวจสอบการเช็คยอดรวมโครงการ: `grep -n "func.*validateTotalAmount" order-service/pkg/order_offering/service.go`

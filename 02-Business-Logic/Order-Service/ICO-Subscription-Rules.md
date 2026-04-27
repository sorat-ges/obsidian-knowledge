---
title: ICO & Subscription Order Rules (Order Offering)
tags: [order-service, ico, subscription, validation, payment, lifecycle]
status: active
last-updated: 2026-04-25
---

# 📦 Business Logic: ICO & Subscription Order (Order Offering)

เอกสารนี้สรุปกฎธุรกิจ (Business Logic) และโครงสร้างระบบที่เกี่ยวข้องกับ **ICO** และ **Subscription Order** (ชื่อทางเทคนิค: **Order Offering**) ใน `order-service`

---

## 1. Order Validation (การตรวจสอบความถูกต้องของออเดอร์)
หัวใจหลักของการตรวจสอบอยู่ที่ `pkg/order_offering/service.go` ซึ่งประกอบด้วยขั้นตอนดังนี้:

### 1.1 การคำนวณยอดเงิน (Amount Calculation)
- **UnitType = "Amount"**: ใช้ยอดเงินที่ผู้ใช้ระบุโดยตรง
- **UnitType = "Unit"**: คำนวณจาก `Unit * ProductPrice (Offering Price)`

### 1.2 กฎการตรวจสอบ (Validation Rules)
| กฎการตรวจสอบ | คำอธิบาย | Error Code (Reference) |
| :--- | :--- | :--- |
| **Amount Limits** | ตรวจสอบยอดเงินต่อรายการว่าอยู่ระหว่าง `Minimum Buy` และ `Maximum Buy` ของสินค้านั้นๆ | `CodeTradingSwapAmountTooLow` |
| **Order Step** | ยอดเงินต้องหารด้วยค่า `Step` ลงตัว (เช่น ต้องเพิ่มทีละ 1,000 บาท) | `ErrOrderVerifiedFail` |
| **Total Amount Limit** | ตรวจสอบยอดรวมของทุกรายการในโปรเจกต์เดียวกันว่าไม่เกิน `Maximum Buy` ของโปรเจกต์ | `ErrOrderVerifiedFail` |
| **Payment Validation** | ตรวจสอบว่ายอดเงินที่ชำระ (Payment Amount) ต้องตรงกับยอดรวมของออเดอร์ | `ErrOrderVerifiedFail` |

---

## 2. Order Lifecycle (วงจรชีวิตของออเดอร์)
สถานะของ Subscription Order มีการเปลี่ยนแปลงตามขั้นตอนดังนี้ (อ้างอิงจาก `order_offering_enum.go`):

### 2.1 สถานะออเดอร์ (Subscription Order Status)
1.  **`created`**: ออเดอร์ถูกสร้างขึ้นในระบบ
2.  **`order-request`**: ส่งคำขอจองซื้อ (Placement)
3.  **`order-confirm`**: ลูกค้ายืนยันการจองซื้อและแนบหลักฐานชำระเงิน
4.  **`order-approve`**: เจ้าหน้าที่ตรวจสอบและอนุมัติออเดอร์
5.  **`allocation` / `allotted`**: อยู่ระหว่างการจัดสรร หรือ จัดสรรเรียบร้อยแล้ว
6.  **`completed`**: กระบวนการเสร็จสมบูรณ์
7.  **`cancelled` / `rejected`**: ออเดอร์ถูกยกเลิกโดยลูกค้า หรือ ถูกปฏิเสธโดยระบบ/เจ้าหน้าที่

### 2.2 สถานะการคืนเงิน (Refund Logic)
- **สถานะที่เข้าข่ายการคืนเงิน**: `rejected`, `prepare-reject`, `refunded`, `prepare-refund`, `allotted-refunding`

---

## 3. Payment Methods (ช่องทางการชำระเงิน)
อ้างอิงจาก `internal/constants/enum/payment_enum.go` ระบบรองรับช่องทางดังนี้:

- **ATS**: การหักบัญชีเงินฝากอัตโนมัติ
- **Bank Transfer**: การโอนเงินผ่านธนาคาร (Manual Upload Slip)
- **Bill Payment / QR**: การชำระผ่านระบบ Bill Payment หรือสแกน PromptPay
- **CHEQUE**: การชำระด้วยเช็ค (Cashier Cheque / Post Date Cheque)

---

## 4. Report & Documents (รายงานและเอกสาร)
ระบบจัดการเอกสารสำคัญผ่าน `pkg/report` เพื่อสนับสนุนกระบวนการซื้อขาย:

- **Bill Payment Form**: ใบแจ้งชำระเงิน (Pay-in Slide) สำหรับผู้ที่เลือกชำระผ่าน Bill Payment หรือ QR
- **Confirmation Note**: ใบยืนยันการจัดสรรและซื้อขายหลักทรัพย์ (ออกเมื่อสถานะเป็น `allotted` หรือ `completed`)
- **E-Tax Invoice**: ใบกำกับภาษีอิเล็กทรอนิกส์สำหรับการทำรายการ

---

## 🛠️ Technical Reference
- **Main Service**: `../order-service/pkg/order_offering/service.go`
- **Domain Models**: `../order-service/internal/domain/ico_project.go` และ `project_ico_extension.go`
- **Enums & States**: `../order-service/internal/constants/enum/order_offering_enum.go`
- **Error Constants**: `../order-service/internal/constants/error.go`

## ✅ How to Verify
1. ตรวจสอบฟังก์ชัน `ValidateOrderDetail` ใน `service.go` สำหรับ Logic การตรวจสอบ
2. ตรวจสอบ `SubscriptionOrderStatus` ใน `order_offering_enum.go` เพื่อยืนยัน Flow
3. ตรวจสอบการทำสถานะคืนเงินผ่านฟังก์ชัน `IsRefundStatus()` ใน Enums

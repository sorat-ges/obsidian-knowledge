---
title: Subscription and Eligibility
description: Flow จองซื้อ Offering หรือ ICO ที่รวม eligibility, validation, status lifecycle และการแก้ไข/ยกเลิกคำสั่งจาก web portal
capability: Offering
services: [order-service, web-portal]
aliases: [offering subscription, ICO subscription, order offering, eligibility, allocation, ICO order edit, ICO order cancellation, แก้ไขคำสั่ง ICO, ยกเลิกคำสั่ง ICO, จองซื้อ, ตรวจสิทธิ์จองซื้อ]
errorCodes: [CodeTradingSwapAmountTooLow, ErrOrderVerifiedFail, "400", "404", "500"]
status: active
lastUpdated: 2026-08-21
documentType: flow
---

## Purpose and scope

อธิบาย Order Offering หรือ ICO Subscription โดยรวมเงื่อนไขก่อนตรวจ, การคำนวณยอด, eligibility จากข้อกำหนดรายผลิตภัณฑ์/โครงการ, payment validation และความหมายของ subscription statuses ที่ source ยืนยัน

Source ยืนยัน business logic และ placement endpoint ใน `order-service`; `web-portal` เป็น supporting source สำหรับ permission, route และ user-visible edit/cancel action เท่านั้น ไม่ override backend validation หรือ state transition

## Trigger and preconditions

**Owner service: `order-service`**

- มี Order Offering request ที่ประกอบด้วยรายการ `amount` หรือ `unit` พร้อม `unit_type`
- ต้องอ่าน `offering_price` จาก `dw_product.product`
- ต้องมีเงื่อนไขสินค้า `minimum_buy`, optional `maximum_buy` และ `step` จาก `dw_product.product_transaction_condition`
- ต้องมี project-level `maximum_buy` สำหรับประเภทนักลงทุนจาก `dw_product.project_transaction_condition`
- ยอดรวมทุกรายการต้องมากกว่า `0`

คำว่า eligibility ใน Flow นี้หมายถึงการผ่านเงื่อนไขยอดซื้อของสินค้าและวงเงินโครงการตามประเภทนักลงทุนเท่าที่ source ยืนยัน ไม่รวม KYC, suitability, accreditation หรือ allocation policy ที่ source ไม่ได้ระบุ

## Participating services

| Service | Responsibility |
| :--- | :--- |
| `order-service` | คำนวณยอด, validate รายผลิตภัณฑ์/โครงการ/payment และดูแล Subscription Order lifecycle ตาม source |
| `web-portal` | เปิด edit/cancel action ตาม permission, status, channel และ payment method แล้วส่ง request ไปยัง backend BFF |

ช่องทาง ATS, Bank Transfer, Bill Payment/QR และ CHEQUE ถูกยืนยันว่าเป็น payment methods ที่รองรับ แต่ source ไม่ได้ระบุ service/integration owner หรือ execution sequence ของแต่ละช่องทาง

## End-to-end sequence

### 1. Load offering conditions and establish eligibility

**Owner service: `order-service`**

1. อ่าน `offering_price` ของแต่ละ product
2. อ่าน minimum, maximum และ step ระดับ product
3. อ่าน project maximum ตามประเภทนักลงทุน
4. ใช้เงื่อนไขเหล่านี้เป็นขอบเขต eligibility ของ request

Source ไม่ระบุกลไกเลือกประเภทนักลงทุนหรือ eligibility dimension อื่น จึงต้องตรวจ domain model/code ก่อนขยายกฎ

### 2. Calculate each order amount

**Owner service: `order-service`**

- `UnitType = Amount`: ใช้ amount ที่ผู้ใช้ระบุ
- `UnitType = Unit`: คำนวณ `unit × offering_price`

ระบบใช้ยอดที่คำนวณแล้วสำหรับ validation ขั้นต่อไป

### 3. Validate each product

**Owner service: `order-service`**

สำหรับแต่ละรายการ:

1. ยอดต้องไม่ต่ำกว่า `minimum_buy`
2. ยอดต้องไม่เกิน `maximum_buy` ถ้ามีการตั้งไว้
3. ยอดต้องหาร `step` ลงตัว

Amount limit อ้างอิง `CodeTradingSwapAmountTooLow`; step failure อ้างอิง `ErrOrderVerifiedFail` ตาม source

### 4. Validate project total and payment

**Owner service: `order-service`**

1. รวมยอดทุกรายการใน request เดียว
2. ยอดรวมต้องมากกว่า `0`
3. ยอดรวมต้องไม่เกิน project `maximum_buy` ของประเภทนักลงทุน
4. Payment amount ต้องตรงกับยอดรวมของออเดอร์

Project maximum และ payment mismatch อ้างอิง `ErrOrderVerifiedFail` ส่วน zero-total เป็น validation failure ที่ source ไม่ได้ยืนยัน error code

### 5. Record the subscription status

**Owner service: `order-service`**

Source แจกแจงสถานะช่วงสร้างและพิจารณาคำสั่งดังนี้:

- `created`: ออเดอร์ถูกสร้างในระบบ
- `order-request`: คำขอจองซื้อ
- `order-confirm`: ลูกค้ายืนยันและแนบหลักฐานชำระเงิน
- `order-approve`: เจ้าหน้าที่ตรวจและอนุมัติ

รายการนี้อธิบายความหมายของ status เท่านั้น Source ไม่ยืนยัน transition edge, command, endpoint หรือ actor ของทุกการเปลี่ยนสถานะ

### 6. Represent allocation and terminal outcomes

**Owner service: `order-service`**

- `allocation`: อยู่ระหว่างจัดสรร
- `allotted`: จัดสรรเรียบร้อย
- `completed`: กระบวนการเสร็จสมบูรณ์
- `cancelled`: ลูกค้ายกเลิก
- `rejected`: ระบบหรือเจ้าหน้าที่ปฏิเสธ

Source ระบุชื่อและความหมายเหล่านี้ แต่ไม่ยืนยันลำดับหรือ edge ระหว่าง `allocation`, `allotted`, `completed`, `cancelled` และ `rejected`

### 7. Produce final documents

**Owner confirmed only at package level: `order-service/pkg/report`**

- Bill Payment Form รองรับผู้เลือก Bill Payment หรือ QR
- Confirmation Note ออกเมื่อสถานะเป็น `allotted` หรือ `completed`
- E-Tax Invoice รองรับรายการ

Source ไม่ได้ระบุ timing, integration หรือ failure behavior ของการสร้างเอกสาร

### 8. Edit an ICO placement from web portal

**Owner service: `order-service`**
**Executing service: `web-portal` สำหรับ client trigger และ `order-service` สำหรับ validation/persistence**

`web-portal` ใช้ permission `subscription_order:detail:edit` และ `subscription_order:detail:cancel` เป็น client-side gate เท่านั้น แล้วส่ง edit request ผ่าน BFF ไปยัง:

- `PATCH /api/order-offering/placement/{orderRequestId}` ใน `web-portal`
- `PATCH /api/v1/order-offering/placement/web/{order_request_id}` ใน `order-service`

Current backend behavior:

1. `action` ต้องเป็น `update` หรือ `submit`
2. payment method ปัจจุบันต้องอยู่ใน editable set: `BANK_TRANSFER`, `BILL_PAYMENT` หรือ `CHEQUE`; `BILL_PAYMENT_CHEQUE` เป็น read-only สำหรับ edit
3. การเปลี่ยน metadata (`sa_code`, `order_date`, `payment_method`) ต้องเป็น status `order-request` หรือ `order-confirm`, channel `WEARE_WEB` และ payment method เดิม/ใหม่ต้องอยู่ใน editable set
4. `sa_code` ใหม่ต้องอยู่ใน project referral list ประเภท selling agent; ระบบ resolve และบันทึก `sa_name` ที่สัมพันธ์กัน
5. document-only update ไม่เปลี่ยน status และไม่เข้า metadata status/channel guard เมื่อ metadata ไม่ได้เปลี่ยน แต่การย้ายไฟล์เกิดก่อน database transaction เพราะ DMS ไม่ transactional
6. `update` คง status เดิม; `submit` บังคับ `order-request → order-confirm`, สร้าง action `confirmed` และส่ง `AutoNotiOfferingOrder7`

Frontend รอบนี้เปลี่ยนให้ Save ทำงานเมื่อมี change และไม่มีไฟล์กำลัง upload โดยไม่บังคับ payment-slip total match ในขั้น Save; ขั้น Submit ยังตรวจ payment amount, payment-slip total และ subscription form object key ก่อนส่ง

### 9. Cancel an ICO placement from web portal

**Owner service: `order-service`**
**Executing service: `web-portal` สำหรับ client trigger และ `order-service` สำหรับ cancellation transaction**

UI แสดง cancel action เมื่อมี `subscription_order:detail:cancel`, order status เป็น `order-request` และ channel เป็น `WEB`; สำหรับ `APP + BANK_TRANSFER` UI แสดงปุ่ม disabled เพื่อสะท้อนว่าการยกเลิกไม่ได้เปิดจากช่องทางนั้น ส่วน backend employee cancellation บังคับ channel `WEARE_WEB` จริง

Flow คือ:

1. UI เปิด cancel modal และส่ง reason ที่ trim แล้ว
2. BFF `POST /api/order-offering/placement/{orderRequestId}/cancel` ส่งต่อไป `POST /api/v1/order-offering/placement/web/{order_request_id}/cancel`
3. handler บังคับ reason ไม่ว่างและไม่เกิน 250 ตัวอักษร, order request ต้องมีอยู่, status ต้องเป็น `order-request` และ channel ต้องเป็น `WEARE_WEB`
4. ใน transaction ระบบเปลี่ยน `order-request → cancelled`, สร้าง action `cancelled` และเปลี่ยน payment `PayToSA` เป็น `cancelled`
5. Backend audit detail ใช้ cancellation reason ของ `WEARE_WEB`; frontend แสดง success หรือ error ตาม response

Validation errors ถูกส่งกลับเป็น HTTP `400`, missing order เป็น `404` และ unexpected service/database failure เป็น `500`; client permission หรือปุ่ม disabled ไม่ใช่ backend authorization substitute

### 10. Cancel pending ICO orders during suspension

**Owner service: ยังไม่ยืนยัน owner ของ suspension trigger จาก source ที่เปลี่ยนในรอบนี้**
**Executing service: `order-service` (`CustomerSuspendService` และ `orderOfferingService`)**

เมื่อ `CustomerSuspendService.CancelOrdersOnSuspend` พบ digital-asset suspension ระบบค้นหา ICO order ที่ status `order-request` และ payment method ในชุด `BANK_TRANSFER`, `BILL_PAYMENT_CHEQUE`, `BILL_PAYMENT`, `QR` และ `CHEQUE` แล้วเรียก `CancelOrderOfferingBySystem` ต่อรายการ

การเปลี่ยนแปลงรอบนี้คือเพิ่ม `CHEQUE` ใน query payment methods ทำให้ pending ICO order ที่จ่ายด้วย `CHEQUE` เข้า auto-cancel path ได้ด้วย ในแต่ละรายการระบบเปลี่ยน order เป็น `cancelled`, สร้าง action flow, เปลี่ยน payment เป็น `cancelled`, บันทึก audit detail `customer_account_status: suspended` และส่ง `AutoNotiOfferingOrder2` หลัง cancel สำเร็จ

## Business rules

- Unit order ต้องแปลงเป็น amount ด้วย offering price ก่อนตรวจ
- Product minimum/maximum/step ใช้กับแต่ละรายการ
- Project maximum ใช้กับผลรวมใน request และแยกตามประเภทนักลงทุน
- ยอดรวมเป็นศูนย์ไม่ได้
- Payment amount ต้องเท่ากับยอดรวมของออเดอร์
- Payment methods ที่ source ระบุคือ ATS, Bank Transfer, Bill Payment/QR และ CHEQUE
- สถานะที่เข้าข่าย refund ได้แก่ `rejected`, `prepare-reject`, `refunded`, `prepare-refund` และ `allotted-refunding`

## State transitions

**Owner service: `order-service`**

Source ยืนยันชุด status แต่ไม่ได้ยืนยัน transition graph:

| กลุ่มเพื่อการอ่าน | Status ที่ source ระบุ |
| :--- | :--- |
| สร้างและพิจารณาคำสั่ง | `created`, `order-request`, `order-confirm`, `order-approve` |
| Allocation/completion | `allocation`, `allotted`, `completed` |
| Cancellation/rejection | `cancelled`, `rejected` |
| Refund-related จาก `IsRefundStatus()` | `rejected`, `prepare-reject`, `refunded`, `prepare-refund`, `allotted-refunding` |

การจัดกลุ่มนี้ไม่ใช่ transition edge และไม่ยืนยัน ordering ระหว่าง `allocation`, `allotted` กับ `completed` หรือระหว่าง refund-related statuses ต้องตรวจ enum usage และ state handler ก่อนแก้ lifecycle

สำหรับ placement edit/cancel ที่ source ยืนยันเพิ่มเติม:

| Current status | Trigger | Next status |
| :--- | :--- | :--- |
| `order-request` | web `update` หรือ document update | `order-request` (คงเดิม) |
| `order-request` | web `submit` | `order-confirm` |
| `order-request` | employee cancel หรือ system cancel on suspension | `cancelled` |

Payment `PayToSA` ถูกเปลี่ยนเป็น `cancelled` ใน cancellation transaction

## Error and recovery behavior

**Owner service: `order-service`**

- ต่ำกว่า minimum หรือเกิน maximum: validation fail; source อ้างอิง `CodeTradingSwapAmountTooLow` สำหรับ amount limits
- ยอดไม่ลง step, project total เกิน maximum หรือ payment ไม่ตรง: validation fail; source อ้างอิง `ErrOrderVerifiedFail`
- Total เป็นศูนย์: validation fail แต่ source ไม่ได้ยืนยัน error code
- `cancelled` และ `rejected` เป็นผลลัพธ์ทางเลือกของ lifecycle
- Refund-related status บอกว่าออเดอร์เข้ากลุ่มคืนเงิน แต่ source ไม่ยืนยัน workflow, ledger, bank action หรือ retry จึงห้ามอนุมาน recovery sequence
- Edit metadata ผิด status/channel/payment method หรือ `sa_code` ไม่อยู่ใน project referral list: backend คืน client error และไม่ควรตีความ client permission เป็นหลักฐานว่า update ผ่าน
- Cancel reason ว่างหรือยาวเกิน 250 ตัวอักษร, order ไม่ใช่ `order-request` หรือ channel ไม่ใช่ `WEARE_WEB`: backend ปฏิเสธ cancellation
- Auto-cancel ระหว่าง suspension ถ้าค้น order หรือ cancel รายการใดล้มเหลว `CustomerSuspendService` เก็บ failure และส่ง error notification ตาม collector; source ไม่ยืนยัน rollback ของรายการที่ cancel สำเร็จไปแล้วก่อนหน้า

## Final outcomes

- `completed`: source อธิบายว่ากระบวนการเสร็จสมบูรณ์ แต่ไม่ได้ยืนยัน edge จาก `allocation` หรือ `allotted`
- `allotted`: จัดสรรแล้ว และอยู่ในเงื่อนไขออก Confirmation Note
- `cancelled`: ลูกค้ายกเลิก
- `rejected`: ระบบหรือเจ้าหน้าที่ปฏิเสธและอยู่ในกลุ่ม refund status
- `refunded` หรือ refund-related state อื่น: อยู่ในกระบวนการคืนเงินตาม enum; รายละเอียด execution ไม่ได้อยู่ใน source
- Validation fail: request ไม่ผ่านไปยัง lifecycle ขั้นถัดไปตาม business validation นี้
- Web placement `submit`: status เป็น `order-confirm` และมี action `confirmed`
- Web/system cancellation: status และ payment ที่เกี่ยวข้องเป็น `cancelled`

## Related shared rules

- [Offering](/business-flows/offering/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`order-service`:

- `pkg/order_offering/service.go`: `ValidateOrderDetail`, `calculateOrderAmount`, `validateSingleOrder`, `validateTotalAmount`
- `order-service/handler/order_offering_placement.go`: web edit/cancel handlers และ HTTP error mapping
- `order-service/pkg/orderofferingplacement/new_service.go`: edit transaction, metadata validation และ submit transition
- `order-service/pkg/order_offering/service_cancel.go`: employee/system cancel, payment selection และ cancellation transaction
- `order-service/pkg/customer/suspend_service.go`: suspension cancellation orchestration
- `web-portal/src/app/(order-flow)/ico-order-placement/order-edit-policy.ts`: client edit/cancel policy
- `web-portal/src/app/(order-flow)/ico-order-placement/[customerAccountId]/[orderRequestId]/edit/components/ico-order-placement-edit-form.tsx`: permission, save/submit/cancel UI behavior
- `internal/domain/ico_project.go`
- `internal/domain/project_ico_extension.go`
- `internal/constants/enum/order_offering_enum.go`
- `internal/constants/enum/payment_enum.go`
- `internal/constants/error.go`
- `pkg/report`

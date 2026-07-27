---
title: Subscription and Eligibility
description: Flow จองซื้อ Offering หรือ ICO ที่รวม eligibility, validation และสถานะ allocation, rejection, refund กับ completion
capability: Offering
services: [order-service]
aliases: [offering subscription, ICO subscription, order offering, eligibility, allocation, จองซื้อ, ตรวจสิทธิ์จองซื้อ]
errorCodes: [CodeTradingSwapAmountTooLow, ErrOrderVerifiedFail]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบาย Order Offering หรือ ICO Subscription โดยรวมเงื่อนไขก่อนตรวจ, การคำนวณยอด, eligibility จากข้อกำหนดรายผลิตภัณฑ์/โครงการ, payment validation และความหมายของ subscription statuses ที่ source ยืนยัน

Source ยืนยัน business logic ใน `order-service` แต่ไม่ได้ยืนยัน endpoint, actor ที่เปลี่ยนทุกสถานะ, persistence sequence หรือ integration ระหว่างบริการ จึงไม่ระบุ ownership นอกเหนือจากที่ยืนยันได้

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

## Error and recovery behavior

**Owner service: `order-service`**

- ต่ำกว่า minimum หรือเกิน maximum: validation fail; source อ้างอิง `CodeTradingSwapAmountTooLow` สำหรับ amount limits
- ยอดไม่ลง step, project total เกิน maximum หรือ payment ไม่ตรง: validation fail; source อ้างอิง `ErrOrderVerifiedFail`
- Total เป็นศูนย์: validation fail แต่ source ไม่ได้ยืนยัน error code
- `cancelled` และ `rejected` เป็นผลลัพธ์ทางเลือกของ lifecycle
- Refund-related status บอกว่าออเดอร์เข้ากลุ่มคืนเงิน แต่ source ไม่ยืนยัน workflow, ledger, bank action หรือ retry จึงห้ามอนุมาน recovery sequence

## Final outcomes

- `completed`: source อธิบายว่ากระบวนการเสร็จสมบูรณ์ แต่ไม่ได้ยืนยัน edge จาก `allocation` หรือ `allotted`
- `allotted`: จัดสรรแล้ว และอยู่ในเงื่อนไขออก Confirmation Note
- `cancelled`: ลูกค้ายกเลิก
- `rejected`: ระบบหรือเจ้าหน้าที่ปฏิเสธและอยู่ในกลุ่ม refund status
- `refunded` หรือ refund-related state อื่น: อยู่ในกระบวนการคืนเงินตาม enum; รายละเอียด execution ไม่ได้อยู่ใน source
- Validation fail: request ไม่ผ่านไปยัง lifecycle ขั้นถัดไปตาม business validation นี้

## Related shared rules and flows

- [Offering](/business-flows/offering/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`order-service`:

- `pkg/order_offering/service.go`: `ValidateOrderDetail`, `calculateOrderAmount`, `validateSingleOrder`, `validateTotalAmount`
- `internal/domain/ico_project.go`
- `internal/domain/project_ico_extension.go`
- `internal/constants/enum/order_offering_enum.go`
- `internal/constants/enum/payment_enum.go`
- `internal/constants/error.go`
- `pkg/report`

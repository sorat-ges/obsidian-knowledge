---
title: Fiat Withdrawal
description: Flow ถอนเงินบาทตั้งแต่ตรวจคำขอ คำนวณค่าธรรมเนียม ยืนยันตัวตน ส่งธนาคาร จนยอดพอร์ตอัปเดต
capability: Fund Movement
services: [order-service, payment-gateway, asset-service, asset-consumer]
integrations: [bank]
aliases: [fiat withdrawal, withdraw fiat, withdraw THB, ถอนเงิน, ถอนเงินบาท]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบายการถอนเงินบาทจากบัญชีลูกค้าไปยังบัญชีธนาคาร ตั้งแต่ตรวจสิทธิ์และยอดเงิน คำนวณค่าธรรมเนียม ยืนยัน OTP/2FA ส่งคำสั่ง จน ledger ถูก apply และ balance/report แสดงผลลัพธ์

## Trigger and preconditions

**Owner service: `order-service`**

- ลูกค้าเลือกบัญชีธนาคารและระบุ `inputAmount`
- บัญชีธนาคารต้องเป็นชื่อเดียวกับเจ้าของบัญชีเทรด
- จำนวนถอนต้องไม่ต่ำกว่าค่าใน `GetWithdrawFiatConfig`
- Available balance ต้องครอบคลุม `inputAmount`; fee เป็นส่วนที่หักออกจากจำนวนนี้ ไม่ได้นำไปบวกเป็นยอดที่ต้องมีก้อนใหม่
- ต้องยืนยันตัวตนผ่าน OTP หรือ 2FA ก่อนสร้างคำสั่งที่จะดำเนินการจริง

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `order-service` | Business owner: validate, คำนวณ fee, orchestrate คำสั่ง, สร้าง logical ledger และประมวลผลผลลัพธ์จากธนาคาร |
| `asset-service` | เปิดเผย available balance ก่อนทำรายการ และ balance/report หลัง settlement |
| `payment-gateway` | Execution service: รับคำสั่งจาก `order-service`, เชื่อมต่อธนาคาร และส่งผล transaction กลับตามความรับผิดชอบใน service map |
| Bank | External integration ที่โอนเงินจริงและยืนยันผล |
| `asset-consumer` | Apply logical ledger เข้า portfolio และอัปเดต balance/cost materialization |

## End-to-end sequence

### 1. Validate request and read available balance

**Owner service: `order-service`**

**Balance read owner: `asset-service`**

1. ตรวจจำนวนขั้นต่ำ บัญชีธนาคาร และความเป็นเจ้าของบัญชี
2. อ่าน available balance จาก portfolio
3. ปฏิเสธคำขอเมื่อยอดไม่ครอบคลุม `inputAmount`; Order Fee และ Bank Fee คำนวณจากและหักภายในจำนวนนี้

### 2. Calculate withdrawal fees

**Owner service: `order-service`**

อ่าน `transaction_fee` ด้วย company `XD`, transaction `withdraw_fiat` และเงื่อนไข `bank_code`:

- `received_by_customer` คือ Order Fee ที่เป็นรายได้บริษัท
- `pay_to_bank` คือ Bank Fee ที่บริษัทจ่ายให้ธนาคาร
- `transferAmount = inputAmount - orderFeeAmount + bankFee`

ตัวอย่างจาก source: available balance ต้องครอบคลุม `inputAmount` 1,000 บาท ไม่ใช่ 1,000 บาทบวก fee จากนั้น `1,000 - 20 + 5 = 985` บาทถูกส่งไปธนาคาร และหลังธนาคารหัก Bank Fee 5 บาท ลูกค้าได้รับ 980 บาท

### 3. Confirm identity and submit

**Owner service: `order-service`**

1. แสดง Amount, Fee และ Total ให้ลูกค้ายืนยัน
2. ส่ง OTP ไปยังเบอร์ที่ลงทะเบียนและบังคับ OTP rate limit
3. เมื่อ OTP ถูกต้อง เปลี่ยนสถานะจาก `DRAFT` เป็น `SUBMITTED`

### 4. Execute bank transfer

**Orchestration owner: `order-service`**

**Executing service: `payment-gateway`**

`order-service` ส่งคำสั่งที่ยืนยันแล้วให้ `payment-gateway`; `payment-gateway` ดำเนินการเชื่อมต่อธนาคารและส่ง transaction result กลับตามขอบเขตใน [Service Map](/system-context/service-map/)

### 5. Write and apply ledger

**Logical-ledger owner: `order-service`**

`order-service` สร้าง movement สำหรับ hold, fee และ completion ตาม [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/) โดยไม่จำลองรายละเอียด ledger ซ้ำในหน้านี้

**Ledger application and cost-update owner: `asset-consumer`**

`asset-consumer` นำ logical ledger ไป materialize ใน portfolio ตาม [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)

### 6. Process bank result and expose outcome

**Orchestration owner: `order-service`**

เมื่อได้รับ transaction result ผ่าน `payment-gateway` ระบบอัปเดตคำสั่งเป็น `COMPLETED` หรือ `FAILED`

**Balance/report owner: `asset-service`**

หลัง ledger ถูก apply แล้ว `asset-service` เปิดเผยยอดและรายงานที่สะท้อนผลของรายการ

## Business rules

- Fee ต้องเลือกตาม `bank_code`; แต่ละธนาคารอาจใช้อัตราไม่เท่ากัน
- Available balance ต้องครอบคลุม `inputAmount`; Order Fee และ Bank Fee เป็นองค์ประกอบที่หัก/คำนวณภายในจำนวนนี้
- ถ้าไม่พบ fee configuration ให้ใช้ 0 บาท ซึ่งทำให้บริษัทรับภาระต้นทุน
- ถ้าอ่าน fee จากฐานข้อมูลล้มเหลว ให้บล็อกการถอนและคืน error
- Available balance ต้องเพียงพอก่อนสร้างคำสั่ง

## State transitions

**Owner service: `order-service`**

source ของ Fiat ยืนยันลำดับย่อ `DRAFT → SUBMITTED → COMPLETED | FAILED` ขณะที่ state machine กลางอธิบาย withdrawal lifecycle ที่ละเอียดกว่า ห้ามตีความสองชุดนี้ว่าเท่ากันโดยอัตโนมัติ ดู [Order State Machine](/shared-rules/order-state-machine/) และยืนยัน enum/path ของ Fiat เมื่อต้องแก้ state transition

## Error and recovery behavior

**Owner service: `order-service`**

- ยอดไม่ครอบคลุม `inputAmount`, บัญชีไม่ตรงเจ้าของ, จำนวนต่ำกว่าขั้นต่ำ หรือ OTP ไม่ผ่าน: ไม่ submit ไป `payment-gateway`
- fee query ล้มเหลว: บล็อก flow ทันที
- ไม่พบ fee configuration: ใช้ fee 0 ตาม behavior ที่ source ระบุ ไม่ใช่ error
- source ไม่ระบุกลไก retry/refund หลังธนาคารตอบ `FAILED`; ต้องตรวจ code และ runtime path ก่อนเปลี่ยน recovery behavior

## Final outcomes

- สำเร็จ: ธนาคารยืนยัน, logical ledger ถูก apply, คำสั่งจบ `COMPLETED` และ balance/report อัปเดต
- ล้มเหลวก่อน submit: ไม่มีคำสั่งโอนถูกส่ง
- ธนาคารปฏิเสธหรือล้มเหลว: คำสั่งจบ `FAILED`; รายละเอียดการคืนยอดต้องยืนยันจาก implementation

## Related shared rules and flows

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Security Rules](/shared-rules/security/)

## Code references

- `pkg/order_fiat/service.go`
- `GetWithdrawFeeForBankAndTransferAmount`
- `GetTransactionFeeWithCondition`
- Actions: `WithdrawFiatActionReceivedByCustomer`, `WithdrawFiatActionPayToBank`

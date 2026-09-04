---
title: Fiat Withdrawal
description: Flow ถอนเงินบาทตั้งแต่ตรวจคำขอ คำนวณค่าธรรมเนียม ยืนยันตัวตน ส่งธนาคาร จนยอดพอร์ตอัปเดต
capability: Fund Movement
services: [order-service, order-consumer, payment-gateway, asset-service, asset-consumer]
integrations: [bank]
aliases: [fiat withdrawal, withdraw fiat, withdraw THB, suspended account bank account, cancel fiat withdrawal on account freeze, digital asset suspended withdrawal, ถอนเงิน, ถอนเงินบาท, ยกเลิกถอนเงินบาทเมื่อบัญชี freeze]
errorCodes: ["60002"]
status: active
lastUpdated: 2026-09-04
documentType: flow
---

## Purpose and scope

อธิบายการถอนเงินบาทจากบัญชีลูกค้าไปยังบัญชีธนาคาร ตั้งแต่ตรวจสิทธิ์และยอดเงิน คำนวณค่าธรรมเนียม ยืนยัน OTP/2FA ส่งคำสั่ง จน ledger ถูก apply และ balance/report แสดงผลลัพธ์

## Trigger and preconditions

**Owner service: `order-service`**

- ลูกค้าเลือกบัญชีธนาคารและระบุ `inputAmount`
- Digital Asset account status ต้องอนุญาต operation `withdraw`: `active` และ `suspended` ทำได้ ส่วน `closed` และ `freeze` ถูก block ด้วย `60002` (`ErrorCustomerSuspend`)
- ใน White Glove Digital Trading, bank-account read สำหรับ product Digital Asset และ account type `REDEMPTION` ใช้ customer-account status `active` หรือ `suspended`; suspended account จึงยังอ่าน/เลือกบัญชีธนาคารสำหรับ withdrawal ได้ การ read eligibility นี้ไม่ขยายสิทธิ์ไปยัง `closed` หรือ `freeze`
- บัญชีธนาคารต้องเป็นชื่อเดียวกับเจ้าของบัญชีเทรด
- จำนวนถอนต้องไม่ต่ำกว่าค่าใน `GetWithdrawFiatConfig`
- Available balance ต้องครอบคลุม `inputAmount`; fee เป็นส่วนที่หักออกจากจำนวนนี้ ไม่ได้นำไปบวกเป็นยอดที่ต้องมีก้อนใหม่
- ต้องยืนยันตัวตนผ่าน OTP หรือ 2FA ก่อนสร้างคำสั่งที่จะดำเนินการจริง

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `order-service` | Business owner: validate, คำนวณ fee, orchestrate คำสั่ง, สร้าง logical ledger และประมวลผลผลลัพธ์จากธนาคาร |
| `order-consumer` | รับ `CustomerSync` และ trigger status-specific cancellation endpoint เมื่อ account ไม่ใช่ `active` |
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

### Digital Asset withdrawal bank-account read

**Owner and executing service: `order-service`**

สำหรับ White Glove Digital Trading, `GetBankAccountsForDigitalTrading` อ่าน investment bank accounts ผ่าน customer account โดยกรอง product `DigitalAsset`, bank-account type `REDEMPTION` และ customer-account status เป็น `active` หรือ `suspended` ดังนั้น suspended account ยังมี read path สำหรับบัญชีธนาคารที่จะใช้ถอนเงินได้ ขณะที่ operation status gate และ pending-order cancellation ยังคงใช้กฎแยกตาม operation

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

### 7. Cancel pending withdrawal after account status change

**Owner service: `order-service` สำหรับ status policy และ fiat-withdrawal cancellation**

**Executing service: `order-consumer` เป็น `CustomerSync` trigger; `order-service` เลือกและยกเลิก pending withdrawal**

เมื่อ `order-consumer` ได้รับ `CustomerSync` ที่มี Digital Asset account status ไม่ใช่ `active` จะเรียก `POST /api/v1/customer/suspend/cancel-orders`:

- `suspended`: ไม่เข้า branch ยกเลิก pending fiat withdrawal และ operation `withdraw` ยังผ่าน status gate ได้
- `closed` หรือ `freeze`: `order-service` โหลด pending fiat withdrawal แล้วเรียก `CancelWithdrawFiatBySystem` สำหรับแต่ละรายการ
- หากการเลือกหรือยกเลิกบางรายการล้มเหลว ระบบเก็บ failure เพื่อ internal notification; เอกสารนี้ไม่ยืนยัน rollback ของรายการที่สำเร็จไปแล้ว

## Business rules

- Fee ต้องเลือกตาม `bank_code`; แต่ละธนาคารอาจใช้อัตราไม่เท่ากัน
- Available balance ต้องครอบคลุม `inputAmount`; Order Fee และ Bank Fee เป็นองค์ประกอบที่หัก/คำนวณภายในจำนวนนี้
- ถ้าไม่พบ fee configuration ให้ใช้ 0 บาท ซึ่งทำให้บริษัทรับภาระต้นทุน
- ถ้าอ่าน fee จากฐานข้อมูลล้มเหลว ให้บล็อกการถอนและคืน error
- Available balance ต้องเพียงพอก่อนสร้างคำสั่ง
- Status gate เป็น operation-specific: `suspended` ยังถอนเงินได้ แต่ `closed`/`freeze` ไม่ให้สร้างหรือยืนยัน operation ที่ handler ตรวจ
- White Glove Digital Trading bank-account read ยอมรับ customer-account status `active`/`suspended` สำหรับ `REDEMPTION` + Digital Asset; เป็น read rule ไม่ใช่การอนุญาต operation อื่น
- Pending fiat withdrawal ถูก system-cancel เมื่อ account status เป็น `closed` หรือ `freeze`

## State transitions

**Owner service: `order-service`**

source ของ Fiat ยืนยันลำดับย่อ `DRAFT → SUBMITTED → COMPLETED | FAILED` ขณะที่ state machine กลางอธิบาย withdrawal lifecycle ที่ละเอียดกว่า ห้ามตีความสองชุดนี้ว่าเท่ากันโดยอัตโนมัติ ดู [Order State Machine](/shared-rules/order-state-machine/) และยืนยัน enum/path ของ Fiat เมื่อต้องแก้ state transition

เมื่อ status เปลี่ยนเป็น `closed`/`freeze`, pending withdrawal จะเข้า system-cancellation path ตามผลการเลือกของ `order-service`; สถานะสุดท้ายของคำสั่ง Fiat ต้องยืนยันกับ implementation ของ withdrawal path

## Error and recovery behavior

**Owner service: `order-service`**

- ยอดไม่ครอบคลุม `inputAmount`, บัญชีไม่ตรงเจ้าของ, จำนวนต่ำกว่าขั้นต่ำ หรือ OTP ไม่ผ่าน: ไม่ submit ไป `payment-gateway`
- Digital Asset status ที่ไม่อนุญาตใช้ HTTP `400`, code `60002` (`ErrorCustomerSuspend`); current handler ใช้ข้อความ `customer is <status>.`
- fee query ล้มเหลว: บล็อก flow ทันที
- ไม่พบ fee configuration: ใช้ fee 0 ตาม behavior ที่ source ระบุ ไม่ใช่ error
- source ไม่ระบุกลไก retry/refund หลังธนาคารตอบ `FAILED`; ต้องตรวจ code และ runtime path ก่อนเปลี่ยน recovery behavior

## Final outcomes

- สำเร็จ: ธนาคารยืนยัน, logical ledger ถูก apply, คำสั่งจบ `COMPLETED` และ balance/report อัปเดต
- ล้มเหลวก่อน submit: ไม่มีคำสั่งโอนถูกส่ง
- ธนาคารปฏิเสธหรือล้มเหลว: คำสั่งจบ `FAILED`; รายละเอียดการคืนยอดต้องยืนยันจาก implementation
- `closed`/`freeze`: pending fiat withdrawal เข้า system-cancellation path และไม่ควรส่งต่อเป็นการโอนใหม่; ผล refund/unlock ของ payment execution ต้องยืนยันจาก implementation ที่อยู่นอก source repositories รอบนี้

## Related shared rules and flows

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Security Rules](/shared-rules/security/)

## Code references

- `pkg/order_fiat/service.go`
- `pkg/customer/suspend_service.go` — เลือกและยกเลิก pending fiat withdrawal เมื่อ `closed` หรือ `freeze`
- `pkg/customer/service.go`: `GetInvestmentBankAccountsByCustomerAccount` สำหรับ Digital Asset `REDEMPTION` bank-account read
- `storages/postgres/customerrepository/customer_investment_bank_account_repository.go`: customer-account status predicate `active`/`suspended`
- `order-consumer/pkg/customer-account/service.go` — trigger `/api/v1/customer/suspend/cancel-orders` จาก `CustomerSync`
- `GetWithdrawFeeForBankAndTransferAmount`
- `GetTransactionFeeWithCondition`
- Actions: `WithdrawFiatActionReceivedByCustomer`, `WithdrawFiatActionPayToBank`

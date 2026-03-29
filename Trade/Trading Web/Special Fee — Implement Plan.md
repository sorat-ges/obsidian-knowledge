# Special Fee — Implement Plan (Withdraw Fiat)

## Background

เมื่อ user ถอนเงินบาท > 2,000,000 THB ไปยังธนาคารที่ไม่ใช่ SCB ค่าธรรมเนียมจะเป็น **70 THB**
User สามารถกดปุ่ม **"Request Special Fee"** เพื่อขอลดค่าธรรมเนียม ซึ่งต้องผ่านกระบวนการ approve ก่อน

---

## New Order Status

ต้องเพิ่ม status ใหม่ระหว่าง `draft` → `order-request`:

| Order Status | Action | Created By | Updated By |
|-------------|--------|-----------|-----------|
| Draft | Submitted | RM | RM |
| **Waiting Fee Approve** *(ใหม่)* | **Fee Approved** *(ใหม่)* | RM | Approver |
| Order Request | Confirmed | RM | Customer |
| Order Confirm | Approved | Customer | TLM |
| Order Approve | Withdraw Requested | TLM | System |
| Order Processing | Proceed | System | System |
| Sync Ledger | Synced | System | System |
| Completed | - | System | System |

---

## Full Flow

```
[trading-web] Customer เห็น fee = 70 THB (> 2M, non-SCB)
กดปุ่ม "Request Special Fee"
    ↓
[order-service] สร้าง order
  - status: waiting-fee-approve
  - is_special_fee: true
  - special_fee_amount: 0.00 (pending approval)
    ↓
[order-service] Produce Kafka: request_special_fee_withdraw_fiat
    ↓
[order-consumer] Consume → trigger Email 1
    ↓
[Email 1] ส่งไปยัง Approver (RM/COO)
  "แจ้งเตือนเพื่ออนุมัติค่าธรรมเนียมพิเศษ"
  มีปุ่ม [อนุมัติ] [ไม่อนุมัติ]
    ↓
[Approver คลิก อนุมัติ]
→ POST /api/withdraw-fiat/approve-special-fee?token=xxx
    ↓
[order-service] อัปเดต status: waiting-fee-approve → order-request
    ↓
[Email 2] ส่งไปยัง Customer
  "ยืนยันคำขออนุมัติการต่อ - ขอ Special Fee"
    ↓
[Customer ยืนยัน]
→ order-request → order-confirm
    ↓
[TLM] Manage Payment ใน web-portal
  - เลือก Payment Method (Bank Transfer / BAHTNET)
  - เลือก Bank (SCB / KKP) → auto-fill account info
  - เลือก Payment Approver (ต้องเลือก 2 ใน 3)
    ↓
[Email 3.1/3.2] แจ้ง RM เมื่อดำเนินการต่อ
[Email 4.1/4.2] แจ้งภายใน เมื่อรายการสำเร็จ
[Email 5] แจ้ง Customer รายการสำเร็จ
    ↓
order-confirm → order-approve → order-processing → completed
```

---

## Email Templates

| Email | ถึง | เนื้อหา | หมายเหตุ |
|-------|-----|--------|---------|
| Email 1 | Approver | อนุมัติค่าธรรมเนียมพิเศษ (มีปุ่ม อนุมัติ/ไม่อนุมัติ) | มีอยู่แล้ว + ปรับ Template |
| Email 2 | Customer | ยืนยันคำขอดำเนินการต่อ - ขอ Special Fee | มีอยู่แล้ว + ปรับ Template |
| Email 3.1 | RM | แจ้งเตือนดำเนินการต่อ - ไม่ขอ Special Fee | ใหม่ |
| Email 3.2 | RM | แจ้งเตือนดำเนินการต่อ - ขอ Special Fee | ใหม่ |
| Email 4.1 | TLM / RM / COO / Compliance / Risk / Accounting | แจ้งเตือนภายใน เมื่อรายการสำเร็จ - ขอ Special Fee | ใหม่ |
| Email 4.2 | TLM / RM / COO / Compliance / Risk / Accounting | แจ้งเตือนภายใน เมื่อรายการสำเร็จ - ไม่ขอ Special Fee | ใหม่ |
| Email 5 | Customer | แจ้งลูกค้ารายการสำเร็จ | มีอยู่แล้ว + ปรับ Template |

---

## Implementation Tasks

### 1. order-service

#### 1.1 DB Migration
- เพิ่ม column ใน `fiat_withdraw_order`:
  - `is_special_fee` BOOLEAN DEFAULT FALSE
  - `special_fee_amount` DECIMAL (ค่า fee ที่ approved = 0.00)
  - `special_fee_reason` TEXT (เหตุผลขอลด)
  - `special_fee_status` ENUM: `pending`, `approved`, `rejected`
- เพิ่ม status `waiting-fee-approve` ใน enum

**File:** `internal/constants/enum/order_fiat_enum.go`
```go
// เพิ่ม
WithdrawFiatOrderStatusWaitingFeeApprove = "waiting-fee-approve"
```

#### 1.2 New API Endpoints

**`POST /api/v1/withdraw-fiat/special-fee/request`**
- Request: `{ orderId, reason }`
- Action: สร้าง confirmation token (24h expiry) → ส่ง Email 1 ไปยัง Approvers
- Status transition: `draft` → `waiting-fee-approve`

**`POST /api/v1/withdraw-fiat/special-fee/approve`**
- Request: `{ token, action: "approved" | "rejected" }`
- Action: validate token → อัปเดต status
  - approved: `waiting-fee-approve` → `order-request` + set `special_fee_amount = 0`
  - rejected: `waiting-fee-approve` → `rejected`
- Trigger: Email 2 (ถ้า approved) หรือแจ้ง RM (ถ้า rejected)

#### 1.3 New Kafka Produce Events

**File:** `internal/constants/enum/produce_enum.go`
```go
RequestSpecialFeeWithdrawFiat  = "request_special_fee_withdraw_fiat"
ApproveSpecialFeeWithdrawFiat  = "approve_special_fee_withdraw_fiat"
```

**File:** `pkg/produce/service.go`
- เพิ่ม `ProduceSpecialFeeRequested()`
- เพิ่ม `ProduceSpecialFeeApproved()`

#### 1.4 Fee Calculation Update

**File:** `pkg/order_fiat/service.go:3566` — `GetWithdrawFeeForBankAndTransferAmount`

ปัจจุบัน `received_by_customer` ไม่ส่ง `bankCode` และ `amount` → ต้องแก้ให้ส่งทั้งสองค่า เพื่อรองรับ tiered fee (≤2M = 20 THB, >2M non-SCB = 70 THB)

```go
// แก้จาก
feeValueAmountReceived, err := s.GetTransactionFeeWithCondition(ctx, "received_by_customer", "")

// เป็น
feeValueAmountReceived, err := s.GetTransactionFeeWithCondition(
    ctx,
    "received_by_customer",
    customerBankAccountBankCode,
    inputAmount,
)
```

#### 1.5 DB Migration: transaction_fee records ใหม่

```
// ≤ 2,000,000 THB ทุกธนาคาร → 20 THB
condition: [{ action: "received_by_customer" }, { amount: "<=2000000" }]
fee_value: 20

// > 2,000,000 THB, SCB → 20 THB
condition: [{ action: "received_by_customer" }, { amount: ">2000000" }, { bank_code: "014" }]
fee_value: 20

// > 2,000,000 THB, non-SCB → 70 THB
condition: [{ action: "received_by_customer" }, { amount: ">2000000" }, { bank_code: "!= 014" }]
fee_value: 70
```

---

### 2. order-consumer

#### 2.1 New Consumer Topics

**File:** `internal/config/config.go`
```go
TopicSpecialFeeWithdrawFiat string `env:"KAFKA_TOPIC_SPECIAL_FEE_WITHDRAW_FIAT"`
GroupIDSpecialFeeWithdrawFiat string `env:"KAFKA_GROUP_SPECIAL_FEE_WITHDRAW_FIAT"`
```

#### 2.2 New Consumer Handler

**`cmd/special-fee-withdraw-fiat/main.go`**
- Subscribe ไปยัง `TopicSpecialFeeWithdrawFiat`
- เรียก `specialFeeService.HandleSpecialFeeEvent()`

**`pkg/special-fee-withdraw-fiat/service.go`**
- Event `request_special_fee_withdraw_fiat` → ส่ง Email 1 ไปยัง Approvers
- Event `approve_special_fee_withdraw_fiat` → ส่ง Email 3.1/3.2 ไปยัง RM

#### 2.3 Email Payloads

เพิ่ม template IDs ใน config สำหรับ Email 3.1, 3.2, 4.1, 4.2

---

### 3. web-portal

#### 3.1 New Order Status Display

**`src/` (withdraw fiat detail page)**
- เพิ่ม status label: `waiting-fee-approve` → แสดงเป็น "Waiting Approve"
- แสดงใน Order History table

#### 3.2 Manage Payment Modal (TLM)

**ใน Withdraw Fiat Detail → Payment Method section**

```
Payment Method
  ○ Bank Transfer
  ○ BAHTNET

Bank (dropdown)
  ○ SCB  → auto-fill: 0713020975 / บริษัท เอ็กซ์สปริง ดิจิทัล จำกัด เพื่อลูกค้า
  ○ KKP  → auto-fill: 1000044304 / บริษัท เอ็กซ์สปริง ดิจิทัล จำกัด เพื่อลูกค้า

Payment Approver (multi-select, ต้องเลือก 2 ใน 3)
  □ Watchararrus Tungsomboon
  □ Tanasak Krishnasreni
  □ Varangkana Artkarasatapon

[Save] ← enable เมื่อเลือก ≥ 2 Approvers
```

**Validation:**
- ต้องเลือก Payment Method
- ต้องเลือก Bank
- ต้องเลือก Approver อย่างน้อย 2 คน

**API เรียก:**
- `POST /api/v1/withdraw-fiat/manage-payment`
- Body: `{ orderId, paymentMethod, bankCode, approverIds[] }`

#### 3.3 Email 1 Approval Page

หน้าที่ render จาก link ในอีเมล:
- แสดงรายละเอียด order (ชื่อลูกค้า, จำนวนเงิน, ธนาคาร)
- แสดง fee: 0.00 THB + เหตุผล
- ปุ่ม [อนุมัติ] → เรียก `POST /special-fee/approve?token=xxx&action=approved`
- ปุ่ม [ไม่อนุมัติ] → เรียก `POST /special-fee/approve?token=xxx&action=rejected`

---

## XD Bank Account Info (Static Config)

| ธนาคาร | เลขบัญชี | ชื่อบัญชี |
|--------|---------|---------|
| SCB | 0713020975 | บริษัท เอ็กซ์สปริง ดิจิทัล จำกัด เพื่อลูกค้า |
| KKP | 1000044304 | บริษัท เอ็กซ์สปริง ดิจิทัล จำกัด เพื่อลูกค้า |

---

## Payment Approvers (Static Config)

ต้องเลือก **อย่างน้อย 2 ใน 3**:

1. Watchararrus Tungsomboon
2. Tanasak Krishnasreni
3. Varangkana Artkarasatapon

---

## Summary Checklist

### order-service
- [ ] DB migration: เพิ่ม columns `is_special_fee`, `special_fee_amount`, `special_fee_reason`, `special_fee_status`
- [ ] DB migration: เพิ่ม status `waiting-fee-approve`
- [ ] DB migration: เพิ่ม `transaction_fee` records ใหม่ (tiered fee)
- [ ] เพิ่ม API: `POST /withdraw-fiat/special-fee/request`
- [ ] เพิ่ม API: `POST /withdraw-fiat/special-fee/approve`
- [ ] เพิ่ม API: `POST /withdraw-fiat/manage-payment`
- [ ] แก้ `GetWithdrawFeeForBankAndTransferAmount` ส่ง bankCode + amount
- [ ] แก้ `GetTransactionFeeWithCondition` รับ amount parameter
- [ ] เพิ่ม Kafka produce events: `request_special_fee_withdraw_fiat`, `approve_special_fee_withdraw_fiat`
- [ ] เพิ่ม Email 1 sending (to Approvers)
- [ ] เพิ่ม Email 2 sending (to Customer หลัง fee approved)

### order-consumer
- [ ] เพิ่ม consumer topic + group สำหรับ special fee
- [ ] เพิ่ม handler: `HandleSpecialFeeEvent`
- [ ] Email 3.1/3.2 ไปยัง RM
- [ ] Email 4.1/4.2 ไปยัง Internal team
- [ ] Email 5 ไปยัง Customer (สำเร็จ)

### web-portal
- [ ] เพิ่ม status display: `waiting-fee-approve` → "Waiting Approve"
- [ ] Manage Payment modal: Payment Method, Bank auto-fill, Payment Approver
- [ ] Email 1 approval/reject page (token-based)

### Email Templates (Sendgrid)
- [ ] Email 1: อนุมัติค่าธรรมเนียมพิเศษ (ปรับ template เดิม)
- [ ] Email 2: ยืนยันคำขอ - Special Fee (ปรับ template เดิม)
- [ ] Email 3.1: แจ้ง RM - ไม่ขอ Special Fee (ใหม่)
- [ ] Email 3.2: แจ้ง RM - ขอ Special Fee (ใหม่)
- [ ] Email 4.1: แจ้งภายใน - ขอ Special Fee (ใหม่)
- [ ] Email 4.2: แจ้งภายใน - ไม่ขอ Special Fee (ใหม่)
- [ ] Email 5: แจ้ง Customer สำเร็จ (ปรับ template เดิม)

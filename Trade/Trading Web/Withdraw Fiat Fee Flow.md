# Withdraw Fiat Fee Flow — Order Service

## Overview

ระบบค่า fee การถอนเงินบาทใน order-service ใช้ **2-tier fee system**:
- **Customer Fee** (`received_by_customer`) — ค่าธรรมเนียมที่เรียกเก็บจาก user
- **Bank Fee** (`pay_to_bank`) — ค่าธรรมเนียมที่ XD จ่ายให้ธนาคารปลายทาง

Fee ทั้งหมดเก็บใน **database** (ตาราง `transaction_fee`) และรองรับ condition matching แบบ JSON

---

## Fee Flow Diagram

```
Handler: RequestWithdrawFiat (handler/order_fiat.go:1880)
    ↓
Service: CreateFiatWithdrawOrder (pkg/order_fiat/service.go:2233)
    ↓
[1] getFiatWithdrawPrerequisites
    → ดึง customer bank account (รวม BankCode ปลายทาง)

[2] GetWithdrawFeeForBankAndTransferAmount (service.go:3566)
    ├─ GetTransactionFeeWithCondition(action="received_by_customer", bankCode="")
    │   → Query DB: transaction_fee table
    │   → Condition match via IsMatch()
    │   → ได้ orderFeeAmount (ค่าที่เรียกเก็บจาก user)
    │
    └─ GetTransactionFeeWithCondition(action="pay_to_bank", bankCode=customerBankCode)
        → Query DB: transaction_fee table
        → Condition match: bank_code == "014" (SCB) หรือ != "014" (non-SCB)
        → ได้ bankFee (ค่าที่ XD จ่ายธนาคาร)

[3] buildFiatWithdrawOrder
    → FeeAmount = orderFeeAmount

[4] processTransactionOrderRequestFiatWithdraw
    → INSERT fiat_withdraw_order:  fee_amount = orderFeeAmount
    → INSERT fiat_withdraw_payment:
         amount = inputAmount - orderFeeAmount + bankFee
         fee    = bankFee
```

---

## Fee Calculation Formula

```
Transfer Amount = Withdrawal Amount - Customer Fee + Bank Fee
```

### ตัวอย่าง (ปัจจุบัน)

| ปลายทาง | ถอน | Customer Fee | Bank Fee | โอนจริง |
|---------|-----|-------------|---------|--------|
| SCB (014) | 1,000 | 20 | 15 | 995 |
| non-SCB | 1,000 | 20 | 20 | 1,000 |

---

## Fee Config in Database

**Table:** `transaction_fee`

| Field | ความหมาย |
|-------|----------|
| `company_code` | `"XD"` |
| `transaction_type` | `"withdraw_fiat"` |
| `fee_type` | `"fee"` |
| `condition` | JSON array ของ conditions |
| `fee_value` | ค่า fee (decimal) |
| `fee_unit` | `"bath"` |
| `start_date` / `end_date` | ช่วงเวลาที่ fee มีผล |
| `priority` | ลำดับการ match (น้อย = สูงกว่า) |

### Condition Structure

```json
[
  { "param_name": "action",    "operator": "equal",     "value": "pay_to_bank" },
  { "param_name": "bank_code", "operator": "equal",     "value": "014" }
]
```

### Operators ที่รองรับ

| Operator | ความหมาย |
|----------|----------|
| `equal` | ค่าเท่ากัน |
| `not_equal` | ค่าไม่เท่ากัน |
| `more_than_equal` | มากกว่าหรือเท่ากับ |
| `less_than_equal` | น้อยกว่าหรือเท่ากับ |

### Fee Records ปัจจุบัน

| action | bank_code condition | fee |
|--------|-------------------|-----|
| `received_by_customer` | (ไม่มี) | 20 THB |
| `pay_to_bank` | == `"014"` (SCB) | 15 THB |
| `pay_to_bank` | != `"014"` (non-SCB) | 20 THB |

---

## Key Files

| ไฟล์ | หน้าที่ |
|-----|--------|
| `handler/order_fiat.go:1880` | Handler รับ request withdraw |
| `pkg/order_fiat/service.go:3566` | `GetWithdrawFeeForBankAndTransferAmount` |
| `pkg/order_fiat/service.go:3584` | `GetTransactionFeeWithCondition` |
| `internal/domain/transaction_fee.go` | Domain model + `IsMatch()` |
| `internal/constants/enum/order_fiat_enum.go` | `received_by_customer`, `pay_to_bank` |
| `storages/postgres/salerepository/transaction_fee_repository.go` | Query fee จาก DB |

---

## การเปลี่ยนแปลงค่า Fee ใหม่ (มีผล 3 มิถุนายน 2568)

### Fee Structure ใหม่

| จำนวนถอน | ปลายทาง SCB | ปลายทาง อื่น |
|---------|------------|------------|
| 0 – 2,000,000 บาท | 20 THB | 20 THB |
| > 2,000,000 บาท | 20 THB | 70 THB |

---

## สิ่งที่ต้องทำเพื่อรองรับ Fee ใหม่

### 1. เพิ่ม Fee Records ใน Database

ต้องเพิ่ม fee records สำหรับ `received_by_customer` ที่มี condition ทั้ง **amount** และ **bank_code**:

```json
// Record 1: <= 2,000,000 ทุกธนาคาร → 20 THB
{
  "action": "received_by_customer",
  "amount": "<= 2000000"
}
fee_value = 20

// Record 2: > 2,000,000, SCB → 20 THB
{
  "action": "received_by_customer",
  "amount": "> 2000000",
  "bank_code": "014"
}
fee_value = 20

// Record 3: > 2,000,000, non-SCB → 70 THB
{
  "action": "received_by_customer",
  "amount": "> 2000000",
  "bank_code": != "014"
}
fee_value = 70
```

### 2. แก้โค้ด `GetWithdrawFeeForBankAndTransferAmount` (service.go:3566)

ปัจจุบัน call `received_by_customer` โดยไม่ส่ง `bankCode` และ `amount`:

```go
// ปัจจุบัน
feeValueAmountReceived, err := s.GetTransactionFeeWithCondition(
    ctx,
    "received_by_customer",
    "",  // ← ไม่มี bankCode
)
```

ต้องแก้ให้ส่ง `bankCode` และ `amount` เข้าไปด้วย:

```go
// ใหม่
feeValueAmountReceived, err := s.GetTransactionFeeWithCondition(
    ctx,
    "received_by_customer",
    customerBankAccountBankCode,  // ← ส่ง bankCode
    inputAmount,                  // ← ส่ง amount
)
```

### 3. แก้ `GetTransactionFeeWithCondition` (service.go:3584)

เพิ่ม parameter `amount` เข้า `conditionMap` เพื่อให้ `IsMatch()` เช็คได้:

```go
conditionMap := map[string]any{
    "action": actionCondition,
}
if bankCodeCondition != "" {
    conditionMap["bank_code"] = bankCodeCondition
}
if !amount.IsZero() {
    conditionMap["amount"] = amount  // ← เพิ่ม
}
```

### 4. ตรวจสอบ `IsMatch()` (internal/domain/transaction_fee.go)

`IsMatch()` รองรับ `more_than_equal` และ `less_than_equal` อยู่แล้ว ต้องเช็คว่า `amount` เป็น param_name ที่รองรับการเปรียบเทียบตัวเลขได้ถูกต้อง (decimal comparison)

### 5. GetWithdrawFiatConfig (service.go:1969)

endpoint ที่ return fee config ให้ frontend แสดงผล ต้องอัปเดตให้ return fee ตามช่วง amount และ bank ด้วย หรือ return ทั้ง 2 tier

---

## Summary สิ่งที่ต้องทำ

| # | งาน | ไฟล์ |
|---|-----|------|
| 1 | เพิ่ม migration: fee records ใหม่ใน `transaction_fee` | DB migration |
| 2 | แก้ `GetWithdrawFeeForBankAndTransferAmount` ส่ง `bankCode` + `amount` | `pkg/order_fiat/service.go:3566` |
| 3 | แก้ `GetTransactionFeeWithCondition` รับ `amount` parameter | `pkg/order_fiat/service.go:3584` |
| 4 | ตรวจสอบ `IsMatch()` รองรับ decimal amount comparison | `internal/domain/transaction_fee.go` |
| 5 | อัปเดต `GetWithdrawFiatConfig` return fee config แบบ tiered | `pkg/order_fiat/service.go:1969` |
| 6 | เพิ่ม/อัปเดต unit tests | `pkg/order_fiat/service_split_test.go` |

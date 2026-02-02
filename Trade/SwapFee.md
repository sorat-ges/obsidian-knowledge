# OrderFee - ที่มาและการคำนวณรายละเอียด

## ภาพรวม

OrderFee คือค่าธรรมเนียมที่คำนวณจาก **Fee Rate** ที่ดึงมาจาก Database คูณกับจำนวนเงินที่แลกเปลี่ยน

มี 2 Flow หลักในการคำนวณ OrderFee:
1. **GetSwapRoutes Flow** - ตอนสร้าง Order และแสดงเส้นทางให้เลือก
2. **OrderTradeWebhook Flow** - ตอน Order ถูก Match แล้ว

---

# ส่วนที่ 1: ที่มาของ Fee Rate

## 1.1 Database Table: transaction_fee

OrderFee เริ่มต้นจากการดึงข้อมูล Fee Rate จาก Database:

**Repository:** `transactionFeeRepository.GetTransactionFeeTx()`

```sql
-- Query ที่ใช้ดึงข้อมูล
SELECT *
FROM transaction_fee
WHERE company_code = 'XD'
  AND transaction_type = 'swap'
  AND fee_type IN ('FEE', 'ADDITIONAL_FEE')
  AND is_deleted = false
  AND start_date <= NOW()
  AND (end_date IS NULL OR end_date >= NOW())
ORDER BY priority ASC;
```

## 1.2 โครงสร้าง transaction_fee

| Column | Type | Description |
|--------|------|-------------|
| `id` | string | Primary Key |
| `company_code` | string | รหัสบริษัท (เช่น 'XD') |
| `transaction_type` | string | ประเภทธุรกรรม (เช่น 'swap') |
| `fee_type` | string | 'FEE' หรือ 'ADDITIONAL_FEE' |
| `priority` | int | ลำดับความสำคัญ (น้อย = สำคัญ) |
| `condition` | JSON | เงื่อนไขการใช้ Fee |
| `fee_value` | decimal | ค่า Fee เช่น 0.15 (แปลว่า 0.15%) |
| `fee_unit` | string | หน่วยของ Fee (เช่น 'percent') |
| `start_date` | timestamp | วันที่เริ่มใช้ |
| `end_date` | timestamp | วันที่สิ้นสุด |
| `name` | string | ชื่อ Fee |
| `is_include_additional_fee` | boolean | รวม Additional Fee หรือไม่ |
| `is_campaign` | boolean | เป็นโปรโมชั่นหรือไม่ |

## 1.3 Condition Structure

```json
{
  "condition": [
    {
      "param_name": "customer_tier",
      "operator": "equal",
      "value": "1"
    },
    {
      "param_name": "route",
      "operator": "equal",
      "value": "Bitkub"
    },
    {
      "param_name": "onboarding_day",
      "operator": "less_than_equal",
      "value": "7"
    }
  ]
}
```

### ประเภท Condition ที่รองรับ

| param_name | operator | value | Description |
|------------|----------|-------|-------------|
| `customer_tier` | equal | 1, 2, 3, 4 | ระดับลูกค้า |
| `route` | equal | "Bitkub", "dealer", etc. | ช่องทางแลกเปลี่ยน |
| `onboarding_day` | less_than_equal | 7, 30, etc. | จำนวนวันหลังเปิดบัญชี |
| `onboarding_date` | more_than_equal | "2025-10-01" | วันที่เปิดบัญชี |

---

# ส่วนที่ 2: GetPossibleFeeRate Function

## 2.1 การทำงาน

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 17-87)

```
┌─────────────────────────────────────────────────────────────────┐
│                    GetPossibleFeeRate                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. getProductAndCustomerAccAndTxnFee                            │
│     ├── Get Product by ID                                       │
│     ├── Get Customer Account by ID                              │
│     └── Get Transaction Fee (FEE type) from DB                  │
│                                                                  │
│  2. getPossibleFeeRate                                           │
│     └── กรอง Fee ที่ Match กับเงื่อนไข:                            │
│         ├── customer_tier match                                  │
│         ├── route match                                          │
│         ├── onboarding_day match                                 │
│         └── onboarding_date match                                │
│                                                                  │
│  3. Get Additional Fee (ADDITIONAL_FEE type)                     │
│     └── กรอง Fee ที่ Match กับ symbol + route                      │
│                                                                  │
│  4. validateSelectedFee                                          │
│     └── เลือก Fee ที่เหมาะสมที่สุดตาม FeeRateType                 │
│         (MIN_FEE_RATE หรือ MAX_FEE_RATE)                        │
│                                                                  │
│  5. Return []ResponseGetPossibleFeeRate                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 2.2 Response Structure

```go
type ResponseGetPossibleFeeRate struct {
    TransactionType        enum.OrderType
    FeeType                string  // "FEE" หรือ "ADDITIONAL_FEE"
    Name                   string  // ชื่อ Fee
    FeeValue               decimal.Decimal // ค่า Fee เช่น 0.15
    FeeUnit                string  // "percent"
    IsIncludeAdditionalFee bool    // รวม Additional Fee หรือไม่
}
```

## 2.3 ตัวอย่างผลลัพธ์

```
Request:
┌─────────────────────────────────────────────────────────────────┐
│ CustomerAccountId: xxx                                          │
│ TransactionType:   swap                                         │
│ RouteName:         "Bitkub"                                     │
│ ProductId:         yyy                                          │
│ FeeRateType:       MIN_FEE_RATE                                 │
└─────────────────────────────────────────────────────────────────┘

Response:
┌─────────────────────────────────────────────────────────────────┐
│ [                                                               │
│   {                                                             │
│     "fee_type": "FEE",                                          │
│     "name": "Tier 2 Fee",                                       │
│     "fee_value": 0.10,                                          │
│     "fee_unit": "percent",                                      │
│     "is_include_additional_fee": false                          │
│   },                                                            │
│   {                                                             │
│     "fee_type": "ADDITIONAL_FEE",                               │
│     "name": "Bitkub Route Fee",                                 │
│     "fee_value": 0.02,                                          │
│     "fee_unit": "percent",                                      │
│     "is_include_additional_fee": false                          │
│   }                                                             │
│ ]                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

# ส่วนที่ 3: CalculateTotalFeeRate Function

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 390-398)

```go
func (s *orderTradeService) CalculateTotalFeeRate(feeRate []ResponseGetPossibleFeeRate) decimal.Decimal {
    sum := decimal.Zero
    for _, fee := range feeRate {
        sum = sum.Add(fee.FeeValue)
    }
    return sum
}
```

## 3.1 การคำนวณ

```
totalSwapFee = sum(feeRate[].FeeValue)

ตัวอย่าง:
┌─────────────────────────────────────────────────────────────────┐
│ Input:                                                          │
│   [                                                             │
│     { fee_value: 0.10 },  // Base Fee                          │
│     { fee_value: 0.02 }   // Additional Fee                    │
│   ]                                                             │
│                                                                 │
│ Output:                                                         │
│   totalSwapFee = 0.10 + 0.02 = 0.12%                           │
└─────────────────────────────────────────────────────────────────┘
```

---

# ส่วนที่ 4: Flow ที่ 1 - GetSwapRoutes

## 4.1 ภาพรวม

ใช้ตอนแสดงเส้นทางแลกเปลี่ยนให้ผู้ใช้เลือกก่อนสร้าง Order

## 4.2 BUY Order

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1266)

```go
feeAmount := s.CalculateFeeAmountForBuy(amount, totalSwapFee)
```

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 416-422)

```go
func (s *orderTradeService) CalculateFeeAmountForBuy(
	placedQuantity decimal.Decimal,
	totalFeePercent decimal.Decimal,
) decimal.Decimal {
	fee := placedQuantity.Mul(totalFeePercent.Div(decimal.NewFromFloat(100).Add(totalFeePercent)))
	return fee.RoundDown(2)
}
```

### สูตร BUY

```
┌─────────────────────────────────────────────────────────────────┐
│ fee = placedQuantity × (feePercent / 100) / (1 + feePercent/100) │
│ fee = RoundDown(fee, 2)                                          │
└─────────────────────────────────────────────────────────────────┘
```

### ตัวอย่าง BUY

```
Input:
- placedQuantity (amount) = 10,000 THB
- totalSwapFee = 0.12%

คำนวณ:
fee = 10,000 × (0.12 / 100) / (1 + 0.12/100)
    = 10,000 × 0.0012 / 1.0012
    = 12 / 1.0012
    = 11.9856...
    = RoundDown(11.9856, 2)
    = 11.98 THB

TransactionFeeAmount = 11.98 THB
```

## 4.3 SELL Order

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1350)

```go
feeAmount := s.CalculateFeeAmountForSell(route.MatchedBookAmount(), totalSwapFee)
```

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 400-406)

```go
func (s *orderTradeService) CalculateFeeAmountForSell(
	matchedBookAmount decimal.Decimal,
	feePercent decimal.Decimal,
) decimal.Decimal {
	fee := decimal.RoundNumberDecimal(matchedBookAmount, 2).Mul(feePercent.Div(decimal.NewFromFloat(100)))
	return fee.RoundDown(2)
}
```

### สูตร SELL

```
┌─────────────────────────────────────────────────────────────────┐
│ fee = Round(matchedBookAmount, 2) × (feePercent / 100)            │
│ fee = RoundDown(fee, 2)                                          │
└─────────────────────────────────────────────────────────────────┘
```

### ตัวอย่าง SELL

```
Input:
- matchedBookAmount = 9,950.00 THB (จาก Remarketer)
- totalSwapFee = 0.12%

คำนวณ:
fee = Round(9,950, 2) × (0.12 / 100)
    = 9,950.00 × 0.0012
    = 11.94
    = RoundDown(11.94, 2)
    = 11.94 THB

TransactionFeeAmount = 11.94 THB
```

---

# ส่วนที่ 5: Flow ที่ 2 - OrderTradeWebhook

## 5.1 ภาพรวม

ใช้ตอน Order ถูก Match แล้ว และต้องบันทึกลง Database

**ไฟล์:** `pkg/order_trade/webhook_service.go`

```
┌─────────────────────────────────────────────────────────────────┐
│                  insertOrderTransactionAndExchange               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. GetPossibleFeeRate (ดึง Fee Rate จาก DB)                    │
│  2. CalculateTotalFeeRate (รวม Fee Rate)                        │
│  3. mapRemarketerWebhookFilledDataToFilledSwap                  │
│     └── สร้าง FilledSwap พร้อม SwapFee                          │
│  4. filledSwap.OrderFee() ← คำนวณ OrderFee จริง              │
│  5. filledSwap.Vat() ← คำนวณ VAT                              │
│  6. บันทึกลง OrderTradeTransaction                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 5.2 FilledSwap.OrderFee()

**ไฟล์:** `internal/domain/filled_swap.go` (บรรทัด 149-163)

```go
func (f FilledSwap) OrderFee() *decimal.Decimal {
    if f.RemarketerWebhookData.OrderSide == string(enum.ORDER_CRYPTO_SWAP_SELL) {
        receivedQuantity := f.ReceivedQuantity()
        return utils.ToPointer(
            decimal.RoundDownDecimal(
                receivedQuantity.Mul(f.SwapFee.Div(decimal.NewFromFloat(100))), 2
            )
        )
    } else { // BUY
        executedQuantity := f.ExecutedQuantity()
        return utils.ToPointer(
            decimal.RoundDownDecimal(
                executedQuantity.Mul(f.SwapFee.Div(decimal.NewFromFloat(100))), 2
            )
        )
    }
}
```

## 5.3 ReceivedQuantity() สำหรับ SELL

**ไฟล์:** `internal/domain/filled_swap.go` (บรรทัด 133-147)

```go
func (f FilledSwap) ReceivedQuantity() *decimal.Decimal {
    receivedQuantity, err := f.ReceivedQuantityRemarketer()
    if err != nil {
        return nil
    }
    if f.RemarketerWebhookData.OrderSide == string(enum.ORDER_CRYPTO_SWAP_SELL) {
        exchangeFee, err := f.ExchangeFee()
        if err != nil {
            return nil
        }
        // บวก Exchange Fee กลับเข้าไป!
        receivedQuantityWithExchangeFee := utils.ToNilUnPointer(receivedQuantity).Add(utils.ToNilUnPointer(exchangeFee))
        return utils.ToPointer(decimal.RoundNumberDecimal(receivedQuantityWithExchangeFee, 2))
    }
    return receivedQuantity
}
```

**หมายเหตุ:** สำหรับ SELL, system บวก Exchange Fee กลับเข้าไปก่อนคำนวณ Order Fee

### สูตร SELL (Webhook)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. receivedQuantityFromWebhook = 199.50 THB                     │
│ 2. exchangeFee = 0.50 THB                                        │
│ 3. adjustedReceived = 199.50 + 0.50 = 200.00 THB                │
│ 4. orderFee = 200.00 × (swapFee / 100)                           │
│ 5. orderFee = RoundDown(orderFee, 2)                             │
└─────────────────────────────────────────────────────────────────┘
```

### สูตร BUY (Webhook)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. executedQuantity = 10,000.00 THB                              │
│ 2. orderFee = 10,000 × (swapFee / 100)                           │
│ 3. orderFee = RoundDown(orderFee, 2)                             │
└─────────────────────────────────────────────────────────────────┘
```

## 5.4 ตัวอย่าง Webhook SELL

```
Input from Webhook:
{
  "order_side": "SELL",
  "executed_quantity": "0.00010000",
  "received_quantity": "199.50",
  "exchange_fee": "0.50"
}

SwapFee from GetPossibleFeeRate = 0.12%

คำนวณ:
1. adjustedReceived = 199.50 + 0.50 = 200.00 THB
2. orderFee = 200.00 × (0.12 / 100)
            = 200.00 × 0.0012
            = 0.24
            = RoundDown(0.24, 2)
            = 0.24 THB

OrderFee = 0.24 THB
```

## 5.5 ตัวอย่าง Webhook BUY

```
Input from Webhook:
{
  "order_side": "BUY",
  "executed_quantity": "10000.00",
  "received_quantity": "0.00492500"
}

SwapFee from GetPossibleFeeRate = 0.12%

คำนวณ:
1. executedQuantity = 10,000.00 THB
2. orderFee = 10,000 × (0.12 / 100)
            = 10,000 × 0.0012
            = 12.00
            = RoundDown(12.00, 2)
            = 12.00 THB

OrderFee = 12.00 THB
```

---

# ส่วนที่ 6: VAT Calculation

**ไฟล์:** `internal/domain/filled_swap.go` (บรรทัด 166-171)

```go
func (f FilledSwap) Vat() *decimal.Decimal {
    if f.OrderFee() == nil {
        return nil
    }
    return utils.ToPointer(
        decimal.RoundNumberDecimal(
            utils.ToNilUnPointer(f.OrderFee()).Mul(decimal.NewFromInt(7)).Div(decimal.NewFromInt(107)),
            2
        )
    )
}
```

## สูตร VAT

```
┌─────────────────────────────────────────────────────────────────┐
│ vat = orderFee × 7 / 107                                         │
│ vat = Round(vat, 2)                                              │
└─────────────────────────────────────────────────────────────────┘
```

**หมายเหตุ:** นี่คือสูตร VAT แบบรวมภาษี (Included)

### ตัวอย่าง VAT

```
OrderFee = 11.98 THB

vat = 11.98 × 7 / 107
    = 83.86 / 107
    = 0.7837...
    = Round(0.7837, 2)
    = 0.78 THB

VAT = 0.78 THB
```

---

# ส่วนที่ 7: สรุปสูตรทั้งหมด

## 7.1 GetSwapRoutes Flow

| ด้าน | สูตร OrderFee |
|------|---------------|
| **BUY** | `amount × (feeRate/100) / (1 + feeRate/100)` |
| **SELL** | `matchedBookAmount × (feeRate/100)` |

## 7.2 OrderTradeWebhook Flow

| ด้าน | สูตร OrderFee |
|------|---------------|
| **BUY** | `executedQuantity × (swapFee/100)` |
| **SELL** | `(receivedQty + exchangeFee) × (swapFee/100)` |

## 7.3 VAT (เหมือนกันทุก Flow)

```
VAT = OrderFee × 7 / 107
```

---

# ส่วนที่ 8: Flow Diagram ฉบับสมบูรณ์

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Request                               │
│                  (Create Swap Order)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GetSwapRoutes                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. GetPossibleFeeRate                                    │   │
│  │    └── Query transaction_fee table                       │   │
│  │                                                              │
│  │ 2. CalculateTotalFeeRate                                 │   │
│  │    └── sum(all fee_value)                                │   │
│  │                                                              │
│  │ 3. CalculateFeeAmountForBuy/Sell                          │   │
│  │    └── amount × feeRate / 100                            │   │
│  │                                                              │
│  │ 4. Return Routes with TransactionFeeAmount               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   User Select Route & Confirm                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Create Swap Order                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 OrderTradeWebhook (Matched)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. GetPossibleFeeRate (ใหม่)                              │   │
│  │    └── Query transaction_fee table                       │   │
│  │                                                              │
│  │ 2. CalculateTotalFeeRate                                 │   │
│  │    └── totalSwapFee = sum(all fee_value)                  │   │
│  │                                                              │
│  │ 3. Create FilledSwap(totalSwapFee)                        │   │
│  │                                                              │
│  │ 4. filledSwap.OrderFee()                                  │   │
│  │    BUY:  executedQty × (swapFee/100)                     │   │
│  │    SELL: (receivedQty + exchangeFee) × (swapFee/100)      │   │
│  │                                                              │
│  │ 5. filledSwap.Vat()                                      │   │
│  │    vat = orderFee × 7 / 107                              │   │
│  │                                                              │
│  │ 6. Save to OrderTradeTransaction                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

# ส่วนที่ 9: ข้อมูลตัวอย่างใน Database

## 9.1 ตัวอย่าง transaction_fee rows

```sql
-- Base Fee (Default)
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, name, is_include_additional_fee
) VALUES (
    'base-fee-001', 'XD', 'swap', 'FEE', 100, '[]',
    0.15, 'percent', '2024-07-01 00:00:00', 'Base Fee', false
);

-- Customer Tier 1 Fee
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, name
) VALUES (
    'tier1-fee-001', 'XD', 'swap', 'FEE', 100,
    '[{"param_name": "customer_tier", "operator": "equal", "value": "1"}]',
    0.12, 'percent', '2024-07-01 00:00:00', 'Tier 1 Fee'
);

-- Tier 2
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, name
) VALUES (
    'tier2-fee-001', 'XD', 'swap', 'FEE', 100,
    '[{"param_name": "customer_tier", "operator": "equal", "value": "2"}]',
    0.10, 'percent', '2024-07-01 00:00:00', 'Tier 2 Fee'
);

-- Tier 3
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, name
) VALUES (
    'tier3-fee-001', 'XD', 'swap', 'FEE', 100,
    '[{"param_name": "customer_tier", "operator": "equal", "value": "3"}]',
    0.08, 'percent', '2024-07-01 00:00:00', 'Tier 3 Fee'
);

-- Tier 4
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, name
) VALUES (
    'tier4-fee-001', 'XD', 'swap', 'FEE', 100,
    '[{"param_name": "customer_tier", "operator": "equal", "value": "4"}]',
    0.05, 'percent', '2024-07-01 00:00:00', 'Tier 4 Fee'
);

-- Bitkub Additional Fee
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, name, is_include_additional_fee
) VALUES (
    'bitkub-add-001', 'XD', 'swap', 'ADDITIONAL_FEE', 1,
    '[{"param_name": "route", "operator": "equal", "value": "Bitkub"}]',
    0.02, 'percent', '2025-07-07 00:00:00', 'Bitkub Route Fee', false
);

-- Dealer Fee (Sirihub 2) - Include Additional
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, name, is_include_additional_fee
) VALUES (
    'dealer-fee-001', 'XD', 'swap', 'FEE', 1,
    '[{"param_name": "route", "operator": "equal", "value": "dealer"}]',
    0.15, 'percent', '2025-12-01 00:00:00', 'Dealer Fee', true
);

-- Onboarding Day Promotion (7 days)
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, end_date, name, is_campaign
) VALUES (
    'onboard-7d-001', 'XD', 'swap', 'FEE', 50,
    '[{"param_name": "onboarding_day", "operator": "less_than_equal", "value": 7}]',
    0.13, 'percent', '2025-10-08 00:00:00', NULL, 'New User 7 Days', true
);

-- Onboarding Date Range Promotion
INSERT INTO transaction_fee (
    id, company_code, transaction_type, fee_type, priority, condition,
    fee_value, fee_unit, start_date, end_date, name, is_campaign
) VALUES (
    'onboard-date-001', 'XD', 'swap', 'FEE', 50,
    '[{"param_name": "onboarding_date", "operator": "more_than_equal", "value": "2025-10-01"}]',
    0.11, 'percent', '2025-10-01 00:00:00', '2025-10-31 23:59:59', 'October Promo', true
);
```

## 9.2 ตัวอย่างการ Match Fee

```
ลูกค้า: Tier 2, เปิดบัญชี 30 วันแล้ว, Route = Bitkub

GetPossibleFeeRate Match:
┌────────────────┬──────────┬─────────┬───────────┬─────────────┐
│ Name           │ Priority │ Match?  │ FeeValue  │ IncludeAdd? │
├────────────────┼──────────┼─────────┼───────────┼─────────────┤
│ Base Fee       │ 100      │ ✓       │ 0.15      │ false       │
│ Tier 2 Fee     │ 100      │ ✓       │ 0.10      │ false       │ ← เลือก (MIN)
│ Tier 1 Fee     │ 100      │ ✗       │ 0.12      │ false       │
│ Tier 3 Fee     │ 100      │ ✗       │ 0.08      │ false       │
│ Tier 4 Fee     │ 100      │ ✗       │ 0.05      │ false       │
│ Bitkub Add     │ 1        │ ✓       │ 0.02      │ false       │
│ Dealer Fee     │ 1        │ ✗       │ 0.15      │ true        │
│ 7 Days Promo   │ 50       │ ✗       │ 0.13      │ false       │
│ October Promo  │ 50       │ ✗       │ 0.11      │ false       │
└────────────────┴──────────┴─────────┴───────────┴─────────────┘

ผลลัพธ์ (MIN_FEE_RATE):
┌────────────────┬───────────┐
│ Selected Fee   │ FeeValue  │
├────────────────┼───────────┤
│ Tier 2 Fee     │ 0.10      │
│ Bitkub Add     │ 0.02      │
├────────────────┼───────────┤
│ Total Fee Rate │ 0.12%     │
└────────────────┴───────────┘
```

---

# ส่วนที่ 10: คำถามที่พบบ่อย

## Q1: ทำไม GetSwapRoutes กับ Webhook คำนวณต่างกัน?

**A:**
- **GetSwapRoutes**: คำนวณแบบประมาณการ เพื่อแสดงผลให้ลูกค้าดู
- **Webhook**: คำนวณค่าจริงที่ Match ได้ จาก Remarketer

## Q2: ทำไม SELL ต้องบวก Exchange Fee กลับ?

**A:** เพราะ Webhook ส่ง `received_quantity` ที่หัก Exchange Fee ออกแล้ว
- แต่เราต้องคำนวณ OrderFee จากจำนวนเต็ม
- จึงต้องบวก Exchange Fee กลับเข้าไปก่อนคำนวณ

## Q3: VAT คำนวณยังไง?

**A:** ใช้สูตรรวมภาษี
```
VAT = OrderFee × 7 / 107
(ไม่ใช่ OrderFee × 7%)
```

## Q4: Fee Rate มีกี่ประเภท?

**A:** 2 ประเภทหลัก:
1. **FEE** - Base Fee
2. **ADDITIONAL_FEE** - Additional Fee (บน Base)

---

# สรุป

| หัวข้อ | คำอธิบาย |
|--------|----------|
| **ที่มาของ Fee Rate** | Database Table `transaction_fee` |
| **การคำนวณ Total Fee** | sum(all matched fee_value) |
| **OrderFee BUY** | `executedQty × (feeRate / 100)` |
| **OrderFee SELL** | `(receivedQty + exchangeFee) × (feeRate / 100)` |
| **VAT** | `orderFee × 7 / 107` |
| **NetAmount BUY** | `(amount - fee) / rate` |
| **NetAmount SELL** | `matchedBookAmount - fee` |

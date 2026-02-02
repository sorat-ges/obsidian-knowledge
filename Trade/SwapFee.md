# รายละเอียดการคำนวณ Fee (Fee Calculation Details)

## สารบัญ

1. [ภาพรวม](#ภาพรวม)
2. [GetPossibleFeeRate - การค้นหาอัตรา Fee](#getpossiblefeerate)
3. [CalculateTotalFeeRate - การรวมอัตรา Fee](#calculatetotalfeerate)
4. [FilledSwap - การคำนวณ Fee ราย Transaction](#filledswap)
5. [สูตรการคำนวณ](#สูตรการคำนวณ)
6. [ตัวอย่างการคำนวณ](#ตัวอย่างการคำนวณ)

---

## ภาพรวม

การคำนวณ Fee ใน OrderTradeWebhook มีขั้นตอนหลักดังนี้:

```
1. GetPossibleFeeRate → หา Fee Rate ที่ใช้ได้
2. CalculateTotalFeeRate → รวม Fee Rate ทั้งหมด
3. FilledSwap.OrderFee() → คำนวณ OrderFee
4. FilledSwap.Vat() → คำนวณ VAT
5. FilledSwap.NetReceivedQuantity() → คำนวณจำนวนสุทธิ
```

---

## GetPossibleFeeRate

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 17-87)

### Input Parameters

```go
type RequestGetPossibleFeeRate struct {
    CustomerAccountId  uuid.UUID
    TransactionType    enum.OrderType  // เช่น "swap"
    RouteName          *string         // เช่น "bitcoin", "xspring"
    ProductId          uuid.UUID
    FeeRateType        enum.FeeRateType // MIN_FEE_RATE หรือ MAX_FEE_RATE
}
```

### Process Flow

```
1. getProductAndCustomerAccAndTxnFee
   │
   ├── Get Product by ID
   ├── Get Customer Account by ID
   └── Get Transaction Fee (FEE_TYPE_FEE)
       │
       ▼
2. getPossibleFeeRate (กรอง Fee ที่ Match เงื่อนไข)
   │
   ├── Check StartDate (ต้องไม่เกินเวลาปัจจุบัน)
   ├── Check Customer Tier Match
   ├── Check Route Match
   ├── Check Onboarding Day Match
   └── Check Onboarding Date Match
       │
       ▼
3. Get Additional Fee (FEE_TYPE_ADDITIONAL_FEE)
   │
   ├── Get Company Transaction Fee
   ├── Validate Additional Fee (Match Symbol + Route)
   └── Select by MIN/MAX Type
       │
       ▼
4. validateSelectedFee (เลือก Fee ที่เหมาะสมที่สุด)
   │
   ├── Calculate Fee Value (รวม Additional Fee ถ้าจำเป็น)
   ├── Select by FeeRateType (MIN/MAX)
   ├── Compare Priority (ตัวเลขน้อย = สำคัญกว่า)
   └── Compare StartDate (ใหม่กว่า = ชนะ)
       │
       ▼
5. Return []ResponseGetPossibleFeeRate
```

### Response Structure

```go
type ResponseGetPossibleFeeRate struct {
    TransactionType        enum.OrderType
    FeeType                string  // "FEE" หรือ "ADDITIONAL_FEE"
    Name                   string  // ชื่อ Fee
    FeeValue               decimal.Decimal // ค่า Fee เช่น 0.10 (หมายถึง 0.10%)
    FeeUnit                string  // หน่วยของ Fee
    IsIncludeAdditionalFee bool    // รวม Additional Fee หรือไม่
}
```

---

## CalculateTotalFeeRate

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 390-398)

### Code

```go
func (s *orderTradeService) CalculateTotalFeeRate(feeRate []ResponseGetPossibleFeeRate) decimal.Decimal {
    sum := decimal.Zero
    for _, fee := range feeRate {
        sum = sum.Add(fee.FeeValue)
    }
    return sum
}
```

### คำอธิบาย

รวมค่า Fee ทั้งหมดจากทุก Fee Component

### ตัวอย่าง

```
Fee Rate Result:
┌──────────────────────────────────────┐
│ Base Fee         = 0.10%            │
│ Additional Fee   = 0.05%            │
│ Special Fee      = 0.00%            │
├──────────────────────────────────────┤
│ Total Fee Rate   = 0.15%            │
└──────────────────────────────────────┘
```

---

## FilledSwap - การคำนวณ Fee ราย Transaction

**ไฟล์:** `internal/domain/filled_swap.go`

### โครงสร้าง

```go
type FilledSwap struct {
    RemarketerWebhookData RemarketerWebhookMessageRequestData
    SwapFee               decimal.Decimal  // Total Fee Rate จาก CalculateTotalFeeRate
}
```

---

### 1. OrderFee() - คำนวณค่าธรรมเนียม

**ไฟล์:** `internal/domain/filled_swap.go` (บรรทัด 149-164)

#### สำหรับ SELL Order

```go
receivedQuantity := f.ReceivedQuantity()  // จำนวนที่ได้รับ (หลังหัก Exchange Fee)
orderFee = receivedQuantity × (SwapFee / 100)
orderFee = RoundDown(orderFee, 2)
```

**ตัวอย่าง SELL:**
```
Received Quantity = 9,950.00 THB
Swap Fee Rate = 0.15%
Order Fee = 9,950 × (0.15 / 100)
Order Fee = 9,950 × 0.0015
Order Fee = 14.925
Order Fee (RoundDown) = 14.92 THB
```

#### สำหรับ BUY Order

```go
executedQuantity := f.ExecutedQuantity()  // จำนวนที่ใช้ซื้อ
orderFee = executedQuantity × (SwapFee / 100)
orderFee = RoundDown(orderFee, 2)
```

**ตัวอย่าง BUY:**
```
Executed Quantity = 10,000.00 THB
Swap Fee Rate = 0.15%
Order Fee = 10,000 × (0.15 / 100)
Order Fee = 10,000 × 0.0015
Order Fee = 15.00
Order Fee (RoundDown) = 15.00 THB
```

---

### 2. Vat() - คำนวณภาษีมูลค่าเพิ่ม

**ไฟล์:** `internal/domain/filled_swap.go` (บรรทัด 166-171)

```go
vat = orderFee × 7 / 107
vat = Round(vat, 2)
```

**สูตร VAT แบบรวมภาษี (Included)**

**ตัวอย่าง:**
```
Order Fee = 14.92 THB
VAT = 14.92 × 7 / 107
VAT = 104.44 / 107
VAT = 0.976...
VAT (Round) = 0.98 THB
```

**ตัวอย่าง 2:**
```
Order Fee = 15.00 THB
VAT = 15 × 7 / 107
VAT = 105 / 107
VAT = 0.981...
VAT (Round) = 0.98 THB
```

---

### 3. NetReceivedQuantity() - คำนวณจำนวนสุทธิ

**ไฟล์:** `internal/domain/filled_swap.go` (บรรทัด 173-182)

#### สำหรับ SELL Order

```go
netReceivedQuantity = receivedQuantity - orderFee
```

**ตัวอย่าง:**
```
Received Quantity = 9,950.00 THB
Order Fee = 14.92 THB
Net Received Quantity = 9,950 - 14.92 = 9,935.08 THB
```

#### สำหรับ BUY Order

```go
netReceivedQuantity = receivedQuantity  // ใช้ค่าเดิม, Fee หักจาก Executed Quantity แล้ว
```

---

### 4. ReceivedQuantity() - จำนวนที่ได้รับ

**ไฟล์:** `internal/domain/filled_swap.go` (บรรทัด 133-147)

#### สำหรับ SELL Order

```go
receivedQuantity = RoundNumberDecimal(webhookReceived + exchangeFee, 2)
```

**หมายเหตุ:** สำหรับ SELL, system บวก Exchange Fee กลับเข้าไป เพื่อให้ได้รับจำนวนเต็มก่อนคำนวณ Order Fee

**ตัวอย่าง:**
```
Webhook Received = 9,949.50 THB
Exchange Fee = 0.50 THB
Received Quantity = Round(9,949.50 + 0.50, 2)
                  = Round(9,950.00, 2)
                  = 9,950.00 THB
```

#### สำหรับ BUY Order

```go
receivedQuantity = webhookReceived  // ใช้ค่าจาก webhook ตรง ๆ
```

---

## สูตรการคำนวณ

### SELL Order Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    SELL ORDER FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│ 1. Executed Quantity = จำนวนที่ขาย (จาก Webhook)             │
│ 2. Exchange Fee = ค่า Fee จาก Exchange (จาก Webhook)          │
│ 3. Received Quantity = Executed - Exchange Fee                  │
│ 4. Adjusted Received = Received + Exchange Fee                  │
│    (บวก Exchange Fee กลับเพื่อคำนวณ Order Fee)              │
│ 5. Order Fee = Adjusted Received × (FeeRate / 100)             │
│ 6. VAT = Order Fee × 7 / 107                                   │
│ 7. Net Received = Adjusted Received - Order Fee                │
└─────────────────────────────────────────────────────────────────┘
```

### BUY Order Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     BUY ORDER FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│ 1. Executed Quantity = จำนวนที่ซื้อ (จาก Webhook)             │
│ 2. Order Fee = Executed × (FeeRate / 100)                       │
│ 3. VAT = Order Fee × 7 / 107                                   │
│ 4. Net Received = Received (จาก Webhook)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## ตัวอย่างการคำนวณ

### Example 1: SELL Order - ขาย BTC รับ THB

```
Input Data:
─────────────────────────────────────────
Order Side          : SELL
Executed Quantity   : 0.10000000 BTC
Executed Price      : 2,000,000 THB/BTC
Received Quantity   : 199.50 THB (จาก Exchange)
Exchange Fee        : 0.50 THB
Fee Rate            : 0.15%

Calculation:
─────────────────────────────────────────
1. Adjusted Received = 199.50 + 0.50
                       = 200.00 THB

2. Order Fee = 200.00 × (0.15 / 100)
             = 200.00 × 0.0015
             = 0.30
             = RoundDown(0.30, 2)
             = 0.30 THB

3. VAT = 0.30 × 7 / 107
       = 2.10 / 107
       = 0.0196...
       = Round(0.0196, 2)
       = 0.02 THB

4. Net Received = 200.00 - 0.30
                 = 199.70 THB

Output:
─────────────────────────────────────────
Order Fee            : 0.30 THB
VAT                  : 0.02 THB
Net Received Quantity: 199.70 THB
```

---

### Example 2: BUY Order - ซื้อ BTC ด้วย THB

```
Input Data:
─────────────────────────────────────────
Order Side          : BUY
Executed Quantity   : 10,000.00 THB
Received Quantity   : 0.00492500 BTC (จาก Exchange)
Executed Price      : 2,030,000 THB/BTC
Fee Rate            : 0.15%

Calculation:
─────────────────────────────────────────
1. Order Fee = 10,000.00 × (0.15 / 100)
             = 10,000.00 × 0.0015
             = 15.00
             = RoundDown(15.00, 2)
             = 15.00 THB

2. VAT = 15.00 × 7 / 107
       = 105.00 / 107
       = 0.9813...
       = Round(0.9813, 2)
       = 0.98 THB

3. Net Received = 0.00492500 BTC (ใช้ค่าจาก Webhook ตรง ๆ)

Output:
─────────────────────────────────────────
Order Fee            : 15.00 THB
VAT                  : 0.98 THB
Net Received Quantity: 0.00492500 BTC
```

---

### Example 3: SELL Order - กรณีมีหลาย Fee Components

```
Input Data:
─────────────────────────────────────────
Order Side          : SELL
Executed Quantity   : 50,000.00 THB
Exchange Fee        : 25.00 THB
Received Quantity   : 49,975.00 THB

Fee Components (จาก GetPossibleFeeRate):
─────────────────────────────────────────
Base Fee           : 0.10% (Customer Tier: General)
Additional Fee     : 0.05% (Route: Bitcoin)
Special Fee        : 0.00% (ไม่ Match Condition)
─────────────────────────────────────────
Total Fee Rate     : 0.15%

Calculation:
─────────────────────────────────────────
1. Adjusted Received = 49,975 + 25 = 50,000.00 THB

2. Order Fee = 50,000 × 0.0015 = 75.00 THB

3. VAT = 75 × 7 / 107 = 4.9065... = 4.91 THB

4. Net Received = 50,000 - 75 = 49,925.00 THB

Output:
─────────────────────────────────────────
Order Fee            : 75.00 THB
VAT                  : 4.91 THB
Net Received Quantity: 49,925.00 THB
Total Deduction      : 79.91 THB
Effective Fee Rate   : 0.1598% (79.91 / 50,000)
```

---

### Example 4: Comparison MIN vs MAX Fee Rate

```
Scenario: มี 2 Fee Rates ให้เลือก
─────────────────────────────────────────
Fee Rate A:
  - Base Fee: 0.10%
  - Additional: 0.05%
  - Total: 0.15%
  - Priority: 1

Fee Rate B:
  - Base Fee: 0.20%
  - Additional: 0.00%
  - Total: 0.20%
  - Priority: 2

ถ้า FeeRateType = MIN_FEE_RATE:
  เลือก Fee Rate A (0.15% < 0.20%)

ถ้า FeeRateType = MAX_FEE_RATE:
  เลือก Fee Rate B (0.20% > 0.15%)
```

---

## ฟังก์ชันช่วยเหลืออื่น ๆ

### CalculateFeeAmountForSell

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 400-406)

```go
fee = Round(matchedBookAmount, 2) × (feePercent / 100)
fee = RoundDown(fee, 2)
```

ใช้สำหรับคำนวณ Fee สำหรับ Sell Order แบบ Direct

### CalculateNetAmountForSell

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 408-414)

```go
roundedMatched = matchedBookAmount.Round(2)
netAmount = roundedMatched - feeAmount
```

### CalculateFeeAmountForBuy

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 416-422)

```go
fee = placedQuantity × (feePercent / 100) / (1 + feePercent / 100)
fee = RoundDown(fee, 2)
```

ใช้สำหรับคำนวณ Fee สำหรับ Buy Order แบบ Direct (ไม่ใช่ใน Webhook)

### CalculateNetAmountForBuy

**ไฟล์:** `pkg/order_trade/service_fee_rate.go` (บรรทัด 424-430)

```go
netAmount = (placedQuantity - feeAmount) / rate
```

ใช้สำหรับคำนวณจำนวนสุทธิสำหรับ Buy Order

---

## สรุป

| ฟิลด์ | SELL Order | BUY Order |
|--------|-----------|-----------|
| **OrderFee** | AdjustedReceived × (FeeRate / 100) | ExecutedQty × (FeeRate / 100) |
| **VAT** | OrderFee × 7 / 107 | OrderFee × 7 / 107 |
| **NetReceived** | AdjustedReceived - OrderFee | ReceivedQty (จาก Webhook) |
| **AdjustedReceived** | WebhookReceived + ExchangeFee | - |

**Key Points:**
1. SELL: บวก Exchange Fee กลับเข้าไปก่อนคำนวณ Order Fee
2. BUY: ใช้ Executed Quantity คำนวณ Order Fee โดยตรง
3. VAT: คำนวณแบบรวมภาษี (7% ของ 107% = 6.54% ของ OrderFee)
4. RoundDown สำหรับ Order Fee, Round ปกติสำหรับ VAT

# คำอธิบายระบบคำนวณ Fee (OrderTradeWebhook)

## ภาพรวม

เอกสารนี้อธิบายการทำงานของระบบคำนวณค่าธรรมเนียม (Fee) ใน `OrderTradeWebhook` ของ order-service

---

## โฟลว์สรุปการคำนวณ Fee

```
Webhook (ภายนอก)
      │
      ├── ExchangeFee  → ค่าธรรมเนียมจาก Exchange (บันทึกตามที่ได้รับ)
      │
      ▼
GetPossibleFeeRate (ค้นหาอัตราค่าธรรมเนียม)
      │
      ├── ดู Customer Tier
      ├── ดู Route/Exchange
      ├── ดู Product
      ├── ดู Onboarding Day/Date
      │
      ▼
CalculateTotalFeeRate (รวมอัตราค่าธรรมเนียมทั้งหมด)
      │
      ▼
คำนวณ OrderFee + Vat
      │
      ▼
บันทึกลง OrderTradeTransaction
```

---

## รายละเอียดแต่ละส่วน

### 1. Handler Layer
**ไฟล์:** `handler/order_trade_handler.go` (บรรทัด 557-619)

`OrderTradeWebhook` เป็น HTTP endpoint ที่:
1. รับ `[]ProcessRemarketerWebhookMessageRequest` (มีฟิลด์ `ExchangeFee`)
2. ส่งต่อให้ `orderTradeSvc.ProcessRemarketerWebhook()`
3. บันทึก log

**ไม่มีการคำนวณ fee ที่ handler layer**

---

### 2. Service Layer
**ไฟล์:** `pkg/order_trade/webhook_service.go` และ `service_fee_rate.go`

#### 2.1 GetPossibleFeeRate (บรรทัด 17-87)

ฟังก์ชันนี้ค้นหาอัตราค่าธรรมเนียมที่เป็นไปได้:

```go
request := RequestGetPossibleFeeRate{
    CustomerAccountId: orderTrade.CustomerAccountID(),
    TransactionType:   enum.Swap,
    RouteName:         utils.ToPointer(input.Exchange),
    ProductId:         orderTrade.ProductID(),
    FeeRateType:       enum.MIN_FEE_RATE,  // หรือ MAX_FEE_RATE
}
```

**เงื่อนไขในการค้นหา Fee Rate:**
- **Customer Tier** → ระดับลูกค้า (เช่น General, VIP)
- **Route/Exchange** → ช่องทางซื้อขาย (เช่น Bitcoin, XSpring)
- **Product** → สินทรัพย์ที่ซื้อขาย
- **Onboarding Day** → วันที่เปิดบัญชี (สำหรับโปรโมชั่น)
- **Onboarding Date** → วันที่เปิดบัญชีเฉพาะ

#### 2.2 CalculateTotalFeeRate (บรรทัด 390-398)

```go
func (s *orderTradeService) CalculateTotalFeeRate(feeRate []ResponseGetPossibleFeeRate) decimal.Decimal {
    sum := decimal.Zero
    for _, fee := range feeRate {
        sum = sum.Add(fee.FeeValue)
    }
    return sum
}
```

**รวมค่า Fee ทั้งหมด** เช่น:
- Base Fee = 0.10%
- Additional Fee = 0.05%
- **Total Fee Rate = 0.15%**

#### 2.3 CalculateFeeAmountForSell (บรรทัด 400-406)

สำหรับ **Sell Order**:

```go
fee = Round(matchedBookAmount × feePercent / 100)
```

**ตัวอย่าง:**
- ขาย 10,000 THB
- Fee Rate = 0.15%
- **Fee = 10,000 × 0.15 / 100 = 15 THB**

#### 2.4 CalculateFeeAmountForBuy (บรรทัด 416-422)

สำหรับ **Buy Order**:

```go
fee = placedQuantity × (feePercent / 100) / (1 + feePercent / 100)
```

**ตัวอย่าง:**
- ซื้อ 10,000 THB
- Fee Rate = 0.15%
- **Fee = 10,000 × 0.0015 / 1.0015 ≈ 14.98 THB**

---

## ประเภทของ Fee ในระบบ

| ประเภท | คำอธิบาย |
|--------|----------|
| **FEE_TYPE_FEE** | ค่าธรรมเนียมหลัก (Base Fee) |
| **FEE_TYPE_ADDITIONAL_FEE** | ค่าธรรมเนียมเพิ่มเติม (Additional Fee) |

### IsIncludeAdditionalFee

- **true** → Fee นี้รวม Additional Fee แล้ว
- **false** → ต้องบวก Additional Fee เพิ่ม

---

## ฟิลด์ที่เกี่ยวข้องกับ Fee

### ใน Webhook Request (`order_trade_dto.go`)

| ฟิลด์ | ประเภท | คำอธิบาย |
|--------|--------|----------|
| `ExchangeFee` | `*string` | ค่าธรรมเนียมจาก Exchange (ภายนอก) |
| `Exchanges[].ExchangeFee` | `*string` | ค่าธรรมเนียมแต่ละ Exchange |

### ใน OrderTradeTransaction

| ฟิลด์ | ที่มา | คำอธิบาย |
|--------|-------|----------|
| `OrderFee` | คำนวณ | ค่าธรรมเนียมที่คำนวณจาก Fee Rate |
| `Vat` | คำนวณ | ภาษีมูลค่าเพิ่ม (7% ของ OrderFee) |
| `NetReceivedQuantity` | คำนวณ | จำนวนสุทธิที่ได้รับ (หัก Fee แล้ว) |
| `OrderFeeRate` | คำนวณ | อัตราค่าธรรมเนียมรวม (%) |
| `MatchedFee` | Webhook | ค่าธรรมเนียมจาก Exchange |
| `FeeDetail` | JSON | รายละเอียด Fee ทั้งหมด (เก็บเป็น JSON) |

---

## ตัวอย่างการคำนวณ

### สถานการณ์: ซื้อ BTC ด้วย THB

```
1. User สั่งซื้อ:
   - จำนวน: 10,000 THB
   - Customer Tier: General
   - Route: Bitcoin

2. GetPossibleFeeRate:
   - Base Fee: 0.10% (สำหรับ General)
   - Additional Fee: 0.05% (สำหรับ Bitcoin Route)
   - Total Fee Rate: 0.15%

3. คำนวณ Fee (Buy):
   - Fee = 10,000 × 0.0015 / 1.0015
   - Fee ≈ 14.98 THB

4. คำนวณ VAT:
   - VAT = 14.98 × 7% = 1.05 THB

5. Net Received:
   - Net = 10,000 - 14.98 - 1.05 = 9,983.97 THB
   - แลกเป็น BTC ตาม Rate ณ ขณะนั้น

6. Exchange Fee (จาก Webhook):
   - ค่า Fee ที่ Exchange ตัดจริง (เช่น 0.001 BTC)
```

---

## เงื่อนไขพิเศษ (Special Conditions)

### Onboarding Day Promotion

```go
checkOnboardingDay(tf, customerAccount.OpenDate())
```

ตรวจสอบว่าเปิดบัญชีมากี่วัน และตรงกับโปรโมชั่นหรือไม่

**ตัวอย่าง:**
- ฟรี Fee 7 วันแรกหลังเปิดบัญชี
- ลด Fee 50% สำหรับ 30 วันแรก

### Onboarding Date Promotion

```go
checkOnboardingDate(tf, customerAccount.OpenDate())
```

ตรวจสอบว่าเปิดบัญชีวันที่ตรงกับโปรโมชั่นหรือไม่

**ตัวอย่าง:**
- ฟรี Fee สำหรับผู้เปิดบัญชีระหว่าง 1-15 มกราคม

---

## Fee Rate Selection

### MIN_FEE_RATE vs MAX_FEE_RATE

```go
switch request.FeeRateType {
case enum.MIN_FEE_RATE:
    // เลือก Fee ที่ต่ำสุด
    if calculatedFeeValue.LessThan(*selectedCalculatedFee) {
        selectedFeeRate = pfr
    }
case enum.MAX_FEE_RATE:
    // เลือก Fee ที่สูงสุด
    if calculatedFeeValue.GreaterThan(*selectedCalculatedFee) {
        selectedFeeRate = pfr
    }
}
```

### Priority และ StartDate

ถ้า Fee เท่ากัน:
1. เลือกตาม **Priority** (ตัวเลขน้อย = สำคัญกว่า)
2. ถ้า Priority เท่ากัน → เลือกตาม **StartDate** (ใหม่กว่า)

---

## สรุปสิ่งสำคัญ

1. **2 แหล่งของ Fee:**
   - `ExchangeFee` → มาจาก webhook ภายนอก
   - `OrderFee`/`Vat` → คำนวณจาก Fee Rate ในระบบ

2. **Fee Rate Lookup** พิจารณา:
   - ระดับลูกค้า (Customer Tier)
   - ช่องทาง (Route/Exchange)
   - สินทรัพย์ (Product)
   - วันเปิดบัญชี (Onboarding)

3. **Total Fee Rate** = ผลรวมของทุก Fee Component

4. **Buy vs Sell:**
   - Buy: Fee = จำนวน × rate / (1 + rate)
   - Sell: Fee = จำนวน × rate / 100

5. **Fee Detail** เก็บเป็น JSON เพื่อ Audit trail

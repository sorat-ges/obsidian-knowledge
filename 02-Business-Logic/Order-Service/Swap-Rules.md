---
title: Swap Business Rules & Fee Calculation
tags: [logic, swap, fee, trading]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: Swap Rules & Fee Calculation

## 🎯 วัตถุประสงค์
จัดการกฎการแลกเปลี่ยนสินทรัพย์ (Swap) การคำนวณค่าธรรมเนียม (Fee) และภาษี (VAT) ทั้งในขั้นตอนการเช็คราคา (Inquiry) และการบันทึกผล (Webhook)

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **Limit Order** | สินทรัพย์ = `SIRIHUB2` | **ห้ามทำ Limit Order** (รองรับเฉพาะ Market Order) |
| **Fee Rate Selection** | Route = `dealer` | ใช้ `MIN_FEE_RATE` (เลือกเรทต่ำสุดจาก DB) |
| **Fee Rate Selection** | Route = `exchange` (Bitkub, etc.) | ใช้ `MAX_FEE_RATE` (เลือกเรทสูงสุดเพื่อ Protect ลูกค้า) |
| **Minimum Amount** | ด้าน BUY | ขั้นต่ำตาม Config (เช่น 50 THB) |
| **Minimum Amount** | ด้าน SELL | ขั้นต่ำ = `Config / Market Price` (ปัดขึ้นตาม Decimal Digit) |
| **Best Route** | ทุกกรณี | เลือก Route ที่ `HasOrder=true` และ `FullMatched` เป็นอันดับ 1 |

## ➗ สูตรการคำนวณ (Calculation Formulas)

### 1. การคำนวณ Fee (OrderFee)
| Flow | ด้าน (Side) | สูตร (Formula) |
| :--- | :--- | :--- |
| **Inquiry (Routes)** | BUY | `Amount * (FeeRate/100) / (1 + FeeRate/100)` |
| **Inquiry (Routes)** | SELL | `MatchedAmount * (FeeRate/100)` |
| **Webhook (Real)** | BUY | `ExecutedQty * (FeeRate/100)` |
| **Webhook (Real)** | SELL | `(ReceivedQty + ExchangeFee) * (FeeRate/100)` |

*หมายเหตุ: ทุกการคำนวณ Fee ให้ใช้ `RoundDown(result, 2)`*

### 2. การคำนวณ VAT
- **สูตร:** `VAT = OrderFee * 7 / 107` (สูตรภาษีรวมในตัว / Included VAT)
- **การปัดเศษ:** `Round(result, 2)`

### 3. จำนวนสุทธิ (Net Amount)
- **BUY:** `(Amount - OrderFee) / MarketPrice`
- **SELL:** `MatchedAmount - OrderFee`

## 🔄 ขั้นตอนการทำงาน (Logic Flow)

### GetSwapRoutes (Inquiry)
1. ตรวจสอบจำนวนขั้นต่ำ (Minimum Amount)
2. ดึง Route จาก Remarketer Service
3. ค้นหา Fee Rate จาก Database (`transaction_fee` table)
4. คำนวณ Fee และ Net Amount ของแต่ละ Route
5. จัดลำดับ (Sort) โดยเอา Best Route ขึ้นก่อน แล้วตามด้วย Net Amount (มากไปน้อย)

### OrderTradeWebhook (Execution)
1. รับข้อมูลผลการ Match จาก Webhook
2. **สำคัญ (SELL):** ต้องบวก `ExchangeFee` กลับเข้าไปใน `ReceivedQty` ก่อนคำนวณ OrderFee
3. คำนวณ OrderFee และ VAT จริง
4. บันทึกรายละเอียดลง `order_trade_transaction` (รวม JSON `fee_detail`)
5. ส่งข้อมูลไปที่ Ledger Service เพื่อปรับ Balance

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `pkg/order_trade/service_fee_rate.go`
- **Logic Functions**: `CalculateFeeAmountForBuy`, `CalculateFeeAmountForSell`, `CalculateNetAmountForBuy`
- **Error Codes**:
  - `90001`: Insufficient Asset (ลูกค้ามีสินทรัพย์ไม่พอ)
  - `90004`: Amount Too Low (จำนวนน้อยกว่าขั้นต่ำ)

## 🤖 How to Verify (For AI Agent)
หากต้องการตรวจสอบว่ากฎการคำนวณยัง Valid อยู่หรือไม่ ให้รันคำสั่ง:
`grep -n "func (s *orderTradeService) CalculateFeeAmountForBuy" pkg/order_trade/service_fee_rate.go`
และตรวจสอบสูตร `Mul(feePercent.Div(decimal.NewFromFloat(100).Add(feePercent)))` ว่าตรงตามที่จดไว้หรือไม่

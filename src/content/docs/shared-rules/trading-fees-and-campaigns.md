---
title: Trading Fees and Campaigns
description: กฎการเลือก Fee, Campaign, Additional Fee และสูตรค่าธรรมเนียมสำหรับ Trading
status: active
lastUpdated: 2026-07-27
documentType: shared-rule
---

กฎกลางสำหรับการเลือกอัตราค่าธรรมเนียมและการคำนวณ Fee ของ Trading Flow

## การเลือก Fee และ Campaign

รายการที่จะนำมาพิจารณาต้องมี `status = active`, `is_deleted = false` และวันที่ปัจจุบันต้องอยู่ระหว่าง `StartDate` กับ `EndDate` โดยเทียบแบบ Date-only ในเขตเวลา Bangkok

ระบบเรียงรายการที่ผ่านการกรองแล้วและเลือก **รายการแรกที่เงื่อนไขตรง** ตามลำดับ:

1. `Priority` จากน้อยไปมาก
2. `FeeValue` จากน้อยไปมาก เมื่อ Priority เท่ากัน
3. `SyncedAt` จากเก่าไปใหม่ เมื่อสองค่าแรกเท่ากัน

ดังนั้น Priority 1 ชนะ Priority 100 แม้ Fee สูงกว่า แต่ถ้า Priority เท่ากัน ระบบเลือก Fee ที่ต่ำกว่า

## Additional Fee

- ถ้า Main Fee มี `is_include_additional_fee = false` ให้เลือก Additional Fee ด้วยกฎเรียงลำดับเดียวกัน แล้วคำนวณ `FinalFee = MainFee + AdditionalFee`
- ถ้า Main Fee มี `is_include_additional_fee = true` ให้ใช้ `FinalFee = MainFee`
- หากไม่พบ Fee ที่ตรงเงื่อนไข ระบบคืนข้อผิดพลาด `no fee rate available`

## สูตร Order Fee ของ Swap

| ขั้นตอน | Side | สูตร |
| :--- | :--- | :--- |
| Inquiry | BUY | `Amount * (FeeRate / 100) / (1 + FeeRate / 100)` |
| Inquiry | SELL | `MatchedAmount * (FeeRate / 100)` |
| Webhook | BUY | `ExecutedQty * (FeeRate / 100)` |
| Webhook | SELL | `(ReceivedQty + ExchangeFee) * (FeeRate / 100)` |

Order Fee ทุกสูตรใช้ `RoundDown(result, 2)` ส่วน VAT ใช้สูตร `OrderFee * 7 / 107` และ `Round(result, 2)`

Net Amount:

- BUY: `(Amount - OrderFee) / MarketPrice`
- SELL: `MatchedAmount - OrderFee`

Route แบบ `dealer` ใช้ `MIN_FEE_RATE`; route แบบ `exchange` ใช้ `MAX_FEE_RATE`

## สูตรของ Big Lot

1. `MatchedAmount = Amount * Price`
2. `FeeAmount = MatchedAmount * (FeeRate / 100)` และปัดลง 2 ตำแหน่ง
3. BUY ใช้ `TotalAmount = MatchedAmount + FeeAmount`
4. SELL ใช้ `TotalAmount = MatchedAmount - FeeAmount`

## Flow ที่ใช้กฎนี้

- [Swap Market Order](/business-flows/trading/swap-market-order/)
- [Swap Limit Order](/business-flows/trading/swap-limit-order/)
- [Big Lot](/business-flows/trading/big-lot/)
- [Routing](/business-flows/trading/routing/)

## จุดอ้างอิงในโค้ด

- `pkg/order_trade/service_fee_rate.go`
- `getPossibleFeeRate`
- `selectAdditionalFee`
- `CalculateFeeAmountForBuy`
- `CalculateFeeAmountForSell`
- `CalculateNetAmountForBuy`


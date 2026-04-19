---
title: FX Management & Hedge Business Rules
tags: [logic, order-service, order-consumer, hedge, fx-management, usd]
status: active
last-updated: 2026-04-12
---

# ⚙️ Business Logic: FX Management & Hedging

## 🎯 วัตถุประสงค์
เพื่อจัดการความเสี่ยงจากอัตราแลกเปลี่ยน (FX Exposure) ที่เกิดขึ้นจากการซื้อขายสินทรัพย์ดิจิทัลผ่านคู่เหรียญที่อ้างอิงสกุลเงินต่างประเทศ (เช่น USD) โดยระบบจะทำการคำนวณยอดคงค้าง (Outstanding Balance) และทำรายการป้องกันความเสี่ยง (Hedge) กับธนาคารโดยอัตโนมัติเมื่อถึงเกณฑ์ที่กำหนด

## 🔄 ภาพรวมกระบวนการ (Process Flow)

1. **Trigger (Order-Service):** เมื่อเกิดรายการเทรดที่ใช้คู่เหรียญ USD และ Flag `FEATURE_PRODUCE_FX_MOVEMENT_HEDGE_TRANSACTION` เปิดอยู่ ระบบจะส่ง Message ไปยัง Kafka Topic `order-hedge-transaction`.
2. **Proxy (Order-Consumer):** คอนซูเมอร์รับ Message และเรียก API `/api/v1/fx-management/movement` ของ Order-Service เพื่อประมวลผลต่อแบบ Asynchronous.
3. **Movement Recording:** ระบบบันทึกการเคลื่อนไหวของเงิน (Movement) ลงในตาราง `fx_movement_auto_hedge` เพื่อปรับปรุงยอด `OsBalance` (Outstanding Balance) และ `AverageCost`.
4. **Hedge Decision:** ระบบตรวจสอบว่ายอด `OsBalance` (แบบ Absolute) เกินเกณฑ์ (Threshold) ที่ตั้งไว้ใน Config หรือไม่.
5. **Execution (Auto Hedge):** หากเกินเกณฑ์ ระบบจะส่งคำสั่งซื้อ/ขาย FX ไปยัง Bank Gateway (เช่น KTB) เพื่อลดความเสี่ยงทันที.

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ                       | เงื่อนไข (Condition)    | กฎ (Rule) / ผลลัพธ์ (Result)                           |
| :--------------------------- | :---------------------- | :----------------------------------------------------- |
| **Activation**               | Order Side = BUY        | `direction = OUT` (จ่าย USD ออก), `OsBalance` ลดลง     |
| **Activation**               | Order Side = SELL       | `direction = IN` (รับ USD เข้า), `OsBalance` เพิ่มขึ้น |
| **Auto Hedge Threshold**     | Customer Activity       | ตรวจสอบกับ `FxMovementAutoHedgeThreshold`              |
| **Schedule Hedge Threshold** | Scheduled Task          | ตรวจสอบกับ `FxMovementScheduleHedgeThreshold`          |
| **Hedge Direction**          | `OsBalance` < 0 (Short) | ระบบจะทำรายการ **BUY** เพื่อปิด Position               |
| **Hedge Direction**          | `OsBalance` > 0 (Long)  | ระบบจะทำรายการ **SELL** เพื่อปิด Position              |

## ➗ การคำนวณที่เกี่ยวข้อง (Calculation Logic)

### 1. การปรับปรุงยอดคงค้าง (OsBalance Update)
- **BUY:** `NewOsBalance = OldOsBalance - ExecutedAmount`
- **SELL:** `NewOsBalance = OldOsBalance + ExecutedAmount`

### 2. ต้นทุนเฉลี่ย (Average Cost)
- ใช้หลักการ **Weighted Average Cost** เมื่อยอดถือครองเพิ่มขึ้น (Position ขยายใหญ่ขึ้นในทิศทางเดิม)
- หากยอดถือครองลดลง ต้นทุนเฉลี่ยจะคงเดิมจนกว่าจะมีการเปลี่ยนทิศทาง (Flip Side)

## 🛠️ Technical Reference
- **Producer (Order-Service):** `pkg/order_trade/webhook_service.go`
- **Consumer (Order-Consumer):** `pkg/hedge-transaction/service.go`
- **Business Logic (Order-Service):** `pkg/hedge/service.go`
- **API Endpoint:** `POST /api/v1/fx-management/movement`
- **Database Table:** `fx_movement_auto_hedge`, `order_fx_transaction`

## 🤖 How to Verify (For AI Agent)
ตรวจสอบการตัดสินใจทำ Hedge ได้ที่:
`grep -n "if latestMovement.OsBalance.Abs().LessThan(hedgeThreshold)" pkg/hedge/service.go`
ตรวจสอบการคำนวณทิศทางการ Hedge:
`grep -A 5 "if latestMovement.OsBalance.IsNegative()" pkg/hedge/service.go`

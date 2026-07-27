---
title: Post-Trade FX Hedging
description: Flow หลังการซื้อขายสำหรับบันทึก USD exposure และทำ Auto Hedge เมื่อเกิน threshold
capability: Trading
services: [order-service, order-consumer]
integrations: [kafka, bank-gateway, KTB]
aliases: [hedge, hedging, fx management, auto hedge, ป้องกันความเสี่ยงค่าเงิน]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

จัดการ FX exposure จากรายการซื้อขายคู่ USD โดยบันทึก Outstanding Balance (`OsBalance`) และสั่ง Hedge กับ Bank Gateway เมื่อยอดเกิน threshold

## Trigger and preconditions

**Owner service: `order-service`**

Flow เริ่มเมื่อเกิด trade ที่ใช้คู่ USD และเปิด feature flag `FEATURE_PRODUCE_FX_MOVEMENT_HEDGE_TRANSACTION` จากนั้น `order-service` ส่ง message ไป Kafka topic `order-hedge-transaction`

## Forward hedge movement

**Owner service: `order-consumer`**

Consume message แล้วเรียก `POST /api/v1/fx-management/movement` ของ `order-service` แบบ asynchronous

## Record FX movement

**Owner service: `order-service`**

บันทึก movement ใน `fx_movement_auto_hedge` และปรับ `OsBalance` กับ `AverageCost`

| Trade side | Direction | Balance update |
| :--- | :--- | :--- |
| BUY | `OUT` | `NewOsBalance = OldOsBalance - ExecutedAmount` |
| SELL | `IN` | `NewOsBalance = OldOsBalance + ExecutedAmount` |

Weighted Average Cost ใช้เมื่อ position ขยายในทิศทางเดิม หาก position ลดลง Average Cost คงเดิมจนเกิดการ flip side

## Evaluate threshold

**Owner service: `order-service`**

- Customer activity เทียบกับ `FxMovementAutoHedgeThreshold`
- Scheduled task เทียบกับ `FxMovementScheduleHedgeThreshold`
- ตัดสินใจจากค่าสัมบูรณ์ของ `OsBalance`

ถ้ายอดยังไม่ถึง threshold ให้จบหลังบันทึก movement โดยไม่ส่งคำสั่ง Hedge

## Execute hedge

**Owner service: `order-service`**

เมื่อเกิน threshold ให้ส่งคำสั่งไป Bank Gateway เช่น KTB:

- `OsBalance < 0` (Short): ส่ง BUY เพื่อปิด position
- `OsBalance > 0` (Long): ส่ง SELL เพื่อปิด position

## Final outcomes

**Owner service: `order-service`**

- ต่ำกว่า threshold: เก็บ movement และ Outstanding Balance สำหรับการประเมินครั้งถัดไป
- เกิน threshold: บันทึกการตัดสินใจและส่งคำสั่ง BUY/SELL ที่ลด exposure
- ประวัติ movement อยู่ใน `fx_movement_auto_hedge`; ธุรกรรม FX อยู่ใน `order_fx_transaction`

## Error and recovery boundary

**Owner service: `order-service`**

การส่งผ่าน Kafka และการเรียก movement API เป็น asynchronous เอกสารต้นทางไม่ได้กำหนด retry หรือ error state จึงต้องวินิจฉัยจาก message delivery, endpoint response และข้อมูล movement โดยไม่สมมติ recovery behavior เพิ่มเติม

## Code references

- Producer: `pkg/order_trade/webhook_service.go`
- Consumer: `pkg/hedge-transaction/service.go`
- Business logic: `pkg/hedge/service.go`
- Endpoint: `POST /api/v1/fx-management/movement`


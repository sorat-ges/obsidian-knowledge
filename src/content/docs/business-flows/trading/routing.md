---
title: Trading Route Selection
description: Flow การค้นหา คำนวณ จัดอันดับ และเลือก route ที่ดีที่สุดสำหรับ Swap
capability: Trading
services: [order-service]
integrations: [remarketer]
aliases: [routing, best route, mixed route, เส้นทางซื้อขาย, เลือกตลาด]
errorCodes: ["90006"]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

Flow นี้อธิบาย route selection ตั้งแต่รับข้อมูล inquiry จนคืน route ที่ลูกค้าหรือ Dealer มองเห็น โดยพิจารณาราคา Fee, liquidity, Full Match และบทบาทผู้ใช้

## Inputs

**Owner service: `order-service`**

- Side และ Amount ของ Swap
- route candidates จาก Remarketer
- Fee Rate ที่ตรงกับ User, Route และ Symbol
- `HasOrder`, Match Result และ Net Amount
- บทบาท Customer หรือ Dealer

## Request eligible routes

**Owner service: `order-service`**

เรียก Remarketer เพื่อดึง route ที่เป็นไปได้ ถ้าไม่มี route ใช้งานได้ ให้คืน `90006`

## Calculate route values

**Owner service: `order-service`**

คำนวณ Fee และ Net Amount ทุก route:

- BUY: `(Amount - OrderFee) / Rate`
- SELL: `MatchedAmount - OrderFee`

รายละเอียด Fee อยู่ที่ [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)

## Score and rank candidates

**Owner service: `order-service`**

1. เรียง `NetAmount` จากมากไปน้อย
2. ถ้ามี `mixed` route ให้ย้ายขึ้นอันดับแรก
3. ถ้าไม่มี `mixed` ให้หา route แรกที่ `HasOrder=true` และ Full Match แล้วย้ายขึ้นอันดับแรกพร้อมตั้ง `IsBestRoute`
4. ใน Dealer Trading ที่มี `mixed` ให้ mark `IsBestRoute` กับ route อื่นที่ไม่ใช่ mixed เพื่อเป็นตัวเลือกสำรอง

## Apply visibility

**Owner service: `order-service`**

- Customer เห็น route อันดับแรกเพียงหนึ่งรายการ
- Dealer เห็น route ที่เป็นไปได้ทั้งหมด

## Selection failure

**Owner service: `order-service`**

หากไม่มี candidate ที่ใช้งานได้ ให้จบด้วย `90006: No Available Route` และไม่ส่งคำสั่งไป execute

## Output

**Owner service: `order-service`**

คืนรายการ route ที่เรียงแล้วพร้อม Best Route ตามบทบาทผู้ใช้ เพื่อให้ [Swap Market Order](/business-flows/trading/swap-market-order/) ใช้ต่อ ขณะที่ [Swap Limit Order](/business-flows/trading/swap-limit-order/) บันทึก `route=null` และให้ Remarketer ตัดสิน route ภายหลัง

## Code references

- `pkg/order_trade/service.go`
- `finalizeSwapRoutes`


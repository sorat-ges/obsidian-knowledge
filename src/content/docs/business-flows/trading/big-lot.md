---
title: Big Lot
description: Flow การซื้อขายสินทรัพย์ล็อตใหญ่ผ่าน White Glove และ Dealer route
capability: Trading
services: [order-service]
aliases: [big lot, biglot, bulk order, white glove, ซื้อขายล็อตใหญ่]
errorCodes: ["80002", "80005"]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

Big Lot รองรับการซื้อขายสินทรัพย์ดิจิทัลขนาดใหญ่ผ่าน White Glove โดย Dealer ดำเนินการแทนลูกค้า เพื่อลดผลกระทบต่อราคาตลาด

![Big Lot flow](/assets/FlowBiglot.png)

## Trigger and input

**Owner service: `order-service`**

คำสั่งต้องมาจาก channel `WEARE_WEB_BIG_LOT`, ระบุ volume size เป็น `bulk` และใช้ flow ของ Big Lot

## Validate Big Lot eligibility

**Owner service: `order-service`**

- บังคับ route เป็น `dealer`
- ข้าม minimum amount check
- ข้าม maintenance check
- ห้ามปัดเศษ order quantity

กฎ bypass เหล่านี้ใช้เฉพาะ Big Lot ไม่ควรนำไปใช้กับ Swap ปกติ

## Calculate trade result and fee

**Owner service: `order-service`**

1. `MatchedAmount = Amount * Price`
2. `FeeAmount = MatchedAmount * (FeeRate / 100)` แล้วปัดลง 2 ตำแหน่ง
3. BUY: `TotalAmount = MatchedAmount + FeeAmount`
4. SELL: `TotalAmount = MatchedAmount - FeeAmount`

รายละเอียดการเลือก Fee อยู่ที่ [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)

## Execute through Dealer route

**Owner service: `order-service`**

ส่งคำสั่งผ่าน route `dealer` เท่านั้น โดยคง quantity ที่ไม่ปัดเศษไว้ตลอดการประมวลผล เอกสารต้นทางไม่ได้ระบุ service อื่นใน execution path จึงถือ `order-service` เป็น owner ของ flow ที่ยืนยันได้

## Error behavior

**Owner service: `order-service`**

- `80002`: สินทรัพย์ไม่เพียงพอ
- `80005`: จำนวนต่ำกว่าขั้นต่ำ เอกสารต้นทางระบุรหัสนี้ไว้พร้อมกับกฎที่บอกว่า Big Lot ข้าม minimum check ซึ่งยังไม่สอดคล้องกัน หากพบรหัสนี้ใน Big Lot ให้ตรวจ execution path และยืนยันกับ code/configuration ก่อนสรุปสาเหตุ

## Final outcomes

**Owner service: `order-service`**

ผลลัพธ์ประกอบด้วย Matched Amount, Fee Amount และ Total Amount ตาม side โดยคำสั่งใช้ Dealer route และ quantity เดิมที่ไม่ปัดเศษ

## Code references

- `handler/white_glove_handler.go`
- `pkg/order_trade/service.go`
- Volume size flag `bulk`

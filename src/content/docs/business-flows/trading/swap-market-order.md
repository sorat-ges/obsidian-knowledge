---
title: Swap Market Order
description: Flow การซื้อขาย Swap แบบ Market ตั้งแต่รับคำสั่งจนปรับยอดสินทรัพย์และ Hedge
capability: Trading
services: [order-service, asset-service, asset-consumer]
integrations: [remarketer]
aliases: [swap, market order, ซื้อขายทันที, แลกสินทรัพย์]
errorCodes: ["90001", "90004", "90006"]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบาย Swap แบบ Market ตั้งแต่ตรวจคำสั่งและ route, คำนวณค่าธรรมเนียม, รับผลการจับคู่, บันทึก ledger, ปรับ portfolio และส่งต่อ FX exposure เมื่อเข้าเงื่อนไข Hedge

## Trigger and preconditions

- Client ขอซื้อหรือขายคู่สินทรัพย์แบบ Market
- จำนวน BUY ต้องไม่ต่ำกว่า Config; จำนวน SELL ขั้นต่ำเท่ากับ `Config / Market Price` และปัดขึ้นตาม decimal digit
- ลูกค้าต้องมีสินทรัพย์ต้นทางเพียงพอ มิฉะนั้นคืน `90001`
- ระบบต้องหา route ที่ใช้งานได้ มิฉะนั้นคืน `90006`

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `order-service` | ตรวจคำสั่ง เลือก route คำนวณ fee รับ execution result สร้าง ledger และเริ่ม Hedge |
| Remarketer | คืน route ที่เป็นไปได้และผลการจับคู่ |
| `asset-consumer` | นำ logical ledger ไปปรับ portfolio |
| `asset-service` | เปิดเผย balance/report ที่อัปเดตแล้ว |

## Validate request

**Owner service: `order-service`**

ตรวจจำนวนขั้นต่ำ คู่สินทรัพย์ เงื่อนไขผลิตภัณฑ์ และ available balance ของสินทรัพย์ต้นทาง กฎเดิมระบุว่า `SIRIHUB2` รองรับ Market Order และไม่รองรับ Limit Order แต่ production path ที่ตรวจเมื่อ 2026-06-14 ยังไม่พบเงื่อนไขห้าม Limit โดยตรง จึงต้องยืนยันกับ configuration ก่อนใช้ข้อจำกัดนั้นตัดสินผล

## Select route and calculate fees

**Owner service: `order-service`**

1. ขอ route จาก Remarketer
2. หา Fee Rate จาก `transaction_fee`
3. คำนวณ Fee และ Net Amount ของแต่ละ route
4. เรียง Net Amount จากมากไปน้อย
5. ให้ความสำคัญกับ `mixed` route; หากไม่มี ให้เลือก route แรกที่ `HasOrder=true` และ Full Match
6. Customer เห็นเพียง route อันดับแรก ส่วน Dealer เห็นทุก route

รายละเอียดสูตรและลำดับ Fee อยู่ที่ [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/) และหลักเลือก route อยู่ที่ [Routing](/business-flows/trading/routing/)

## Submit and execute order

**Owner service: `order-service`**

ส่งคำสั่งผ่าน route ที่เลือกและรอผลการ Match จาก Remarketer ยอด execute จริงต้องยึด execution result ไม่ใช่ค่าประมาณใน inquiry

## Record ledger

**Owner service: `order-service`**

เมื่อได้รับผล Match ระบบคำนวณ Order Fee และ VAT จริง บันทึก `order_trade_transaction` พร้อม `fee_detail` แล้วสร้าง logical ledger สำหรับผลการซื้อขาย รายละเอียดบัญชีและข้อกำหนด Double Entry อยู่ที่ [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)

## Apply portfolio balance

**Owner service: `asset-consumer`**

Consume logical ledger และปรับ available/total balance ตาม movement เมื่อการ apply สำเร็จ `asset-service` จึงเปิดเผย balance และ report ที่อัปเดตแล้ว

## Hedge exposure

**Owner service: `order-service`**

ถ้ารายการใช้คู่ USD และเปิด `FEATURE_PRODUCE_FX_MOVEMENT_HEDGE_TRANSACTION` ระบบส่งรายการไปยัง post-trade [Hedging](/business-flows/trading/hedging/) เพื่อบันทึก movement และตัดสินใจจาก threshold

## State transitions

**Owner service: `order-service`**

เส้นทางสำเร็จใช้ `draft` → `open` → `processing` → `filling` → `sync-ledger` → `filled` โดย `filled`, `cancelled` และ `rejected` เป็น terminal state ดูข้อจำกัดทั้งหมดที่ [Order State Machine](/shared-rules/order-state-machine/)

## Error and recovery behavior

**Owner service: `order-service`**

- `90001`: available asset ไม่พอ
- `90004`: จำนวนต่ำกว่าขั้นต่ำ
- `90006`: ไม่มี route ที่ใช้งานได้
- SELL webhook ต้องบวก `ExchangeFee` กลับเข้า `ReceivedQty` ก่อนคำนวณ Order Fee
- หาก ledger ล้มเหลว ห้ามเปลี่ยนเป็น `filled`; คำสั่งต้องค้างหรือ retry ที่ `sync-ledger`

## Final outcomes

**Owner service: `order-service`**

- สำเร็จ: execution ถูกบันทึก ledger ถูก apply และ balance/report สะท้อนผลแล้ว
- ปฏิเสธหรือยกเลิก: order จบด้วย terminal state ที่สอดคล้อง โดยไม่ข้าม state
- คู่ USD ที่เข้าเงื่อนไข: มี FX movement สำหรับ Hedge ต่อ

## Related shared rules

- [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Error Code Registry](/shared-rules/error-codes/)


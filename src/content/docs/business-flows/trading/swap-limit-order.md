---
title: Swap Limit Order
description: Flow คำสั่ง Swap Limit ตั้งแต่สร้าง order, Remarketer webhook, ledger และ portfolio balance
capability: Trading
services: [order-service, order-consumer, asset-service, asset-consumer]
integrations: [remarketer]
aliases: [swap limit, limit order, ตั้งราคารอซื้อขาย, คำสั่งลิมิต]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบาย Swap แบบ `limit` ตั้งแต่รับคำสั่ง ล็อกยอด ส่งไป Remarketer รับ webhook, settle ledger และแสดง portfolio ที่อัปเดตแล้ว การสร้างคำสั่งสำเร็จยังไม่ใช่การซื้อขายสำเร็จ เพราะสินทรัพย์ต้นทางจะถูกล็อกจนกว่าจะ Match, Reject หรือ Cancel

## Trigger and preconditions

- Client ส่ง `order_type = limit` พร้อม `price`
- `order-service` บันทึก `route = null`; client ไม่ต้องเลือก route
- ตรวจ side, maintenance, minimum, pair, product, document และ available balance
- Limit Order ไม่ตรวจ route หรือ current order book จาก Remarketer ใน `CanSwap`
- Remarketer เป็นผู้ตัดสินใจเวลาและช่องทางการจับคู่

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `order-service` | Business owner: validate, สร้าง order, รับ webhook, คำนวณ fill/fee/refund และ settlement ledger |
| `order-consumer` | Worker: ตรวจ balance ซ้ำ ล็อกยอด และ submit ไป Remarketer |
| Remarketer | เก็บคำสั่งรอ Match และ callback สถานะกับผลการจับคู่ |
| `asset-consumer` | Apply logical ledger เข้า `asset_portfolio` |
| `asset-service` | เปิดเผย balance/report หลัง portfolio อัปเดต |

## Create and validate order

**Owner service: `order-service`**

1. รับ `POST /api/v1/order-trade/swap` พร้อม `order_type=limit` และ `price`
2. ตรวจเงื่อนไขและ available balance
3. สร้าง `order_trade` จาก `draft` เป็น `open` โดย `route=null`
4. ส่ง `create-order-swap` event

Production path ที่ตรวจเมื่อ 2026-06-14 ยังไม่พบเงื่อนไขห้าม `SIRIHUB2` ทำ Limit Order โดยตรง แม้กฎเดิมระบุไว้ จึงต้องยืนยัน configuration หรือ service อื่นก่อนบังคับใช้ข้อจำกัดนี้

## Reserve source balance

**Owner service: `order-service`**

**Executing service: `order-consumer`**

`order-service` เป็น business owner ของขั้นตอนนี้ ส่วน `order-consumer` execute แบบ asynchronous: อ่าน order, ตรวจ balance ซ้ำ แล้วสร้าง `AVAILABLE / DECREASE` คู่กับ `HOLD_IN_ORDER / INCREASE`

- BUY ล็อก Quote/fiat ซึ่งปกติคือ THB
- SELL ล็อก Crypto ที่ลูกค้าต้องการขาย
- เมื่อ `asset-consumer` apply รายการ ยอด available ลดลงและ pending-out เพิ่มขึ้น แต่ total holding ยังไม่ลดจนเกิด Match

## Submit to Remarketer

**Owner service: `order-service`**

**Executing service: `order-consumer`**

`order-service` เป็น business owner ของการ submit ส่วน `order-consumer` ส่ง `client_order_id`, symbol/pair/side, quantity, `route=null`, limit `price`, `order_type=limit` และ callback URL ไป Remarketer จากนั้นบันทึก `remarketer_order_id` และเปลี่ยน `open` เป็น `processing`

ถ้าส่งไม่สำเร็จหลังล็อกยอด worker จะ Reject order และสร้าง ledger ย้อนกลับจาก `HOLD_IN_ORDER` ไป `AVAILABLE`

## Process Remarketer webhook

**Owner service: `order-service`**

| Webhook status | Current behavior |
| :--- | :--- |
| `filling` | `processing` → `filling` และยังไม่คืนยอด |
| `filled` พร้อม `remaining_quantity > 0` | บันทึกและ settle เฉพาะ fill นี้ แล้วรอ fill ถัดไป |
| final `filled` | settle ผลสำเร็จ คืนยอดล็อกที่ไม่ได้ใช้ และปิดคำสั่ง |
| `rejected` ก่อนมี fill | คืนยอดทั้งหมดและจบเป็น `rejected` |
| `rejected` หลัง partial fill | รักษา fill เดิม คืนเฉพาะยอดที่เหลือ และจบเป็น `filled` |

เอกสารต้นทางยืนยันการยกเลิกจาก `open` และการยกเลิกจาก `processing` เมื่อ Remarketer ยกเลิกสำเร็จ แต่ไม่ได้ยืนยันวิธีตัดสิน race ระหว่าง cancel กับ webhook จึงไม่กำหนด behavior เพิ่มเติมในหน้านี้

## Write logical ledger

**Owner service: `order-service`**

BUY ลด fiat ใน `HOLD_IN_ORDER`, เพิ่ม crypto ใน `AVAILABLE` และสร้างรายการ XD main/XD fee ที่เกี่ยวข้อง ส่วน SELL ลด crypto ใน Hold และเพิ่ม fiat สุทธิหลัง Fee

ยอดคืนเมื่อจบคำสั่ง:

| Side | Returned quantity |
| :--- | :--- |
| SELL | `order_quantity - sum(executed_quantity)` |
| BUY | `order_quantity - (sum(executed_quantity) + sum(order_fee))` |

หาก Returned Quantity เป็นศูนย์ จะไม่สร้าง refund ledger

## Apply ledger to portfolio

**Owner service: `asset-consumer`**

Apply logical-ledger batch ภายใน database transaction เดียว: บันทึก audit, สร้าง portfolio หากยังไม่มี, ปรับ balance, คำนวณต้นทุน crypto เมื่อยอดเพิ่ม และ reset average/total cost เมื่อถือครองหมด ดู materialization flow ที่ [Ledger Event Processing](/business-flows/asset-management/ledger-processing/) และกฎบัญชีต้นทางที่ [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)

## Expose updated balance/report

**Owner service: `asset-service`**

หลัง `asset-consumer` apply สำเร็จ `asset-service` เปิดเผย balance และ report ที่รวมผลของ fill และ refund แล้ว

## State transitions

**Owner service: `order-service`**

```text
draft → open → processing → filling → sync-ledger → filled
                     └──────────────→ rejected (ยังไม่มี fill)
open/processing ────────────────────→ cancelled (ตามเงื่อนไขที่ยืนยันแล้ว)
```

Partial fill คงอยู่ที่ `filling`; final fill หรือ rejected หลัง partial fill จึง settle ยอดที่เหลือ ดูกฎ terminal state ที่ [Order State Machine](/shared-rules/order-state-machine/)

## Error and recovery behavior

**Owner service: `order-service`**

- ตรวจ balance สองครั้ง: ก่อนสร้าง order และก่อนล็อกยอด เพื่อรองรับยอดที่เปลี่ยนระหว่าง asynchronous steps
- ใช้ยอด execute จาก webhook ไม่ใช้ estimate ตอนสร้างคำสั่ง
- Partial fill สร้าง ledger ตามแต่ละ fill; final callback เท่านั้นที่คืนส่วนไม่ execute
- Database write กับ Kafka publish ไม่ใช่ distributed transaction เดียวกัน จึงต้อง monitor/retry กรณีสำเร็จเพียงฝั่งเดียว

## Final outcomes

**Owner service: `order-service`**

- Full fill: settle ทั้งหมด คืนยอดส่วนเกินถ้ามี และจบ `filled`
- Partial fill แล้วรอต่อ: settle เฉพาะส่วนที่ Match และคงยอดที่เหลือใน Hold
- Reject ก่อน fill: คืน Hold ทั้งหมดและจบ `rejected`
- Reject หลัง partial fill: เก็บผลสำเร็จ คืนส่วนที่เหลือ และจบ `filled`

## Related shared rules

- [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)

## Code references

- API handler: `order-service/handler/order_trade_handler.go:CreateSwapOrder`
- Validation: `order-service/pkg/order_trade/service.go:CanSwap`
- Order and event creation: `order-service/pkg/order_trade/swap_service.go:MakeSwapOrderRequest`
- Limit route resolution: `order-service/pkg/order_trade/swap_service.go:resolveRouteByOrderType`
- Hold and submit worker: `order-consumer/pkg/digital-asset-order-request/swap.go:processCreateSwapOrder`
- Remarketer request: `order-consumer/pkg/remarketer/new_remarketer.go:Trade`
- Webhook: `order-service/handler/order_trade_handler.go:OrderTradeWebhook`
- Fill and refund: `order-service/pkg/order_trade/webhook_service.go` และ `service_ledger.go`
- Portfolio update: `asset-consumer/pkg/customer-logical-entry/service.go:UpdateAssetPortfolio`

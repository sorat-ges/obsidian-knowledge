---
title: Trading Route Selection
description: Flow การขอ คำนวณ จัดอันดับ แสดงผล และตรวจ route ซ้ำสำหรับ Swap Market
capability: Trading
services: [order-service]
integrations: [Remarketer]
aliases: [routing, swap routing, best route, mixed route, route inquiry, route revalidation, เส้นทางซื้อขาย, เลือกตลาด, เส้นทางที่ดีที่สุด]
errorCodes: ["90000", "90002", "90003", "90004", "90006"]
status: active
lastUpdated: 2026-07-29
documentType: flow
---

## Purpose and scope

อธิบาย decision flow ที่ `order-service` ใช้ค้นหา คำนวณ จัดอันดับ และจำกัดการมองเห็น route สำหรับ Swap Market รวมถึงการตรวจ route ที่ client เลือกซ้ำก่อนสร้าง order

Flow นี้ไม่ใช่ execution engine และไม่รับประกันราคา: Remarketer เป็นผู้ให้ market candidates ส่วน execution จริงเกิดภายหลังใน [Swap Market Order](/business-flows/trading/swap-market-order/)

## Trigger and preconditions

- Retail client เรียก `POST /api/v1/order-trade/routes/inquiry` หรือ `POST /api/v1/trading/order-trade/routes/inquiry`
- White Glove เรียก route inquiry ของตนและส่ง customer context; สิทธิ์ `WHITE_GLOVE_TRADING_DEALER_EXECUTE` เป็นตัวกำหนด `IsDealerTrading`
- ใน `web-portal` White Glove เรียก `/api/white-glove/{identificationId}/order-trade/inquiry` และ proxy ไป `POST /api/v1/white-glove/{identificationId}/order-trade/routes/inquiry`
- Request ต้องมี `unit`, `swap_pair` และ `side`
- คู่สินทรัพย์ต้องไม่อยู่ใน maintenance และจำนวนต้องผ่าน minimum จึงจะขอ Remarketer routes
- ระบบต้องหา customer account, product, fee configuration และ liquidity display configuration ได้

## Participating services

| Service / integration | Role | Responsibility |
| :--- | :--- | :--- |
| `order-service` | Business owner and executor | ตรวจ request, ขอ candidates, คำนวณ fee/net amount, จัดอันดับ, จำกัด visibility และ revalidate route |
| Remarketer | Market data and execution integration | คืน rate, liquidity, matched amount, `HasOrder` และ match result ของแต่ละ route |
| Mobile App / Trading Web | Supporting client | เริ่ม inquiry, refresh quote, เลือก route ที่ backend คืนและส่ง route กลับตอน create |
| `web-portal` White Glove | Supporting client | แสดง candidates หลาย route, Exchange Fee และส่ง customer/Dealer context ผ่าน `identificationId` |

## End-to-end sequence

### 1. Validate inquiry and minimum amount

**Owner and executing service: `order-service`**

1. ตรวจ maintenance ตาม `swap_pair`
2. โหลด minimum amount สำหรับ Swap และ side
3. ถ้า `unit < minimum_amount` คืน `routes: []` พร้อม `minimum_amount` และ `minimum_amount_display` โดยไม่เรียก Remarketer

### 2. Request market candidates

**Owner and executing service: `order-service`**

`order-service` เรียก Remarketer ด้วย base currency, quote currency, side, unit และ client type:

- Retail endpoints ใช้ `retail`
- White Glove ที่มี Dealer Execute permission ใช้ `dealer`

ถ้า Remarketer คืน candidate ว่าง ระบบตอบ `no sources available`; Trading Web และ White Glove map เป็น `90006`

### 3. Calculate each candidate

**Owner and executing service: `order-service`**

สำหรับทุก candidate ที่มี effective rate มากกว่า 0 ระบบ:

1. เลือก transaction fee ตาม customer, route, product และ transaction type
2. สำหรับ White Glove รวม exchange fee เมื่อ `IncludeExchangeFee=true`
3. คำนวณ transaction fee, exchange fee และ net amount
4. เก็บ `Rate`, `Liquidity`, `HasOrder`, `MatchResult`, estimated placing/receive amount และ display values

สูตรหลัก:

- BUY: `NetAmount = (Amount - TransactionFee - ExchangeFee) / Rate`
- SELL: `NetAmount = MatchedBookAmount - TransactionFee - ExchangeFee`

ถ้า White Glove ส่ง `rate > 0` backend ใช้ rate นั้นเป็น effective rate สำหรับ calculation แทน route rate; สำหรับ SELL ยังแทน `MatchedBookAmount` ด้วย `unit × rate`

รายละเอียดการเลือก fee อยู่ที่ [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)

### 4. Rank and choose the leading route

**Owner and executing service: `order-service`**

1. เรียง candidates ด้วย `NetAmount` จากมากไปน้อย
2. หา `mixed` candidate ตัวแรกที่ `HasOrder=true` และ Full Match; candidate นี้ชนะ route อื่นแม้หลังเรียง net amount แล้วจะไม่ได้อยู่ลำดับแรก
3. ถ้าไม่มี valid `mixed` ให้เลือก candidate ตัวแรกตามลำดับ net amount ที่ `HasOrder=true` และ Full Match
4. ย้าย candidate ที่เลือกมาไว้ลำดับแรก

ดังนั้น “best route” หมายถึง valid `mixed` ก่อน แล้วจึงใช้ net amount สูงสุดในกลุ่ม valid non-mixed ไม่ใช่เลือก rate สูงสุดหรือต่ำสุดโดยตรง

### 5. Apply channel visibility

**Owner and executing service: `order-service`**

- Retail: ตั้ง `IsBestRoute=true` ให้ candidate ที่เลือกและคืนเพียงหนึ่ง route
- Dealer: คืน routes ทั้งหมดหลังเรียงและย้าย candidate ที่เลือกขึ้นหน้า แต่ production path ไม่ตั้ง `IsBestRoute=true` ให้ Dealer route
- ถ้าไม่มี candidate ใด Full Match/มี order: Retail ยังได้ candidate แรกหลัง sort หนึ่งรายการ ส่วน Dealer ได้ทั้งหมด โดยไม่มี best-route marker

Client ต้องตรวจ `HasOrder` และ `MatchResult`; การมี route ใน response ไม่ได้แปลว่า route พร้อม execute เสมอ

### 6. Refresh and select on the client

**Backend owner: `order-service`**

**Executing client: Mobile App, Trading Web หรือ `web-portal` White Glove**

- Trading Web ใช้ route ที่ `isBestRoute=true` หรือ fallback เป็นรายการแรก และ refresh เมื่อ countdown หมด
- Mobile App ให้ valid `mixed` มาก่อน, พยายามคง route ที่ผู้ใช้เลือกไว้ถ้ายัง available, จากนั้นจึงใช้ best route; auto refresh สามารถกลับไปเลือก best route
- `web-portal` White Glove เริ่มจาก route แรก, คง route เดิมเมื่อชื่อยังอยู่ใน inquiry response และให้ RM เลือกผ่าน route selection; เมื่อมี Dealer Execute permission จะแสดง `exchange_fee_amount`
- Clients ส่ง `route`, `price`, estimated receive และ fee จาก quote กลับมาใน create request; White Glove เพิ่ม `exchange_fee_rate` และ `exchange_fee_amount`

### 7. Revalidate the selected route at submit time

**Owner and executing service: `order-service`**

ก่อนสร้าง Market order backend ขอ Remarketer routes ใหม่ด้วย amount, side และ client type แล้วหา route ชื่อเดียวกับที่ client ส่ง:

1. ถ้าไม่พบชื่อ route: `no route for <route>`
2. ถ้าไม่ใช่ `mixed` และ liquidity เป็น 0: `insufficient liquidity`
3. ถ้าไม่ Full Match หรือ `HasOrder=false`: `insufficient order book`
4. ถ้าผ่าน: อนุญาตให้สร้าง order

ขั้นนี้ตรวจ availability เท่านั้น ไม่ได้คืน quote ใหม่และไม่ได้ overwrite `price`, estimated receive หรือ fee ใน create payload

## Business rules

- Route ranking ใช้ net amount หลัง fee ไม่ใช่ rate อย่างเดียว
- Valid `mixed` มี priority สูงกว่า valid single route โดยไม่คำนึงถึง net-amount rank
- `mixed` ข้าม liquidity-zero check ตอน submit แต่ไม่ข้าม Full Match และ `HasOrder`
- Retail visibility ถูกลดเหลือหนึ่ง routeที่ backend; Dealer visibility ได้หลาย routeแต่ไม่มี `IsBestRoute` marker
- Minimum failure คืน response สำเร็จที่มี route ว่าง ไม่ใช่ `90006`
- `90006` หมายถึง Remarketer ไม่มี source candidates ใน Trading/White Glove handler ไม่ได้ครอบคลุมทุกกรณีที่ candidate ใช้งานไม่ได้
- Inquiry quote และ create validation แยกเวลากัน Route จึงเปลี่ยนสภาพได้ระหว่าง preview กับ submit

## State transitions

Flow นี้ไม่มี persisted order state ของตนเอง ลำดับ decision state ที่ยืนยันได้คือ:

```text
inquiry received
→ minimum checked
→ candidates received
→ fee/net amount calculated
→ candidates ranked and filtered
→ routes returned
→ selected route revalidated at create
```

เมื่อ revalidation ผ่าน จึงเข้าสู่ `draft → open` ของ [Swap Market Order](/business-flows/trading/swap-market-order/)

## Error and recovery behavior

| Code / condition | Where it occurs | Recovery |
| :--- | :--- | :--- |
| `90000` | maintenance validation | หยุด inquiry/submit และ refresh maintenance state |
| `90004` | create validation พบ amount ต่ำกว่าขั้นต่ำ | ใช้ minimum จาก inquiry แล้วขอ route ใหม่ |
| `90006` | Trading/White Glove inquiry ได้ `no sources available` | แสดง no available route และ retry inquiry |
| `90002` | create-time route recheck พบ no order หรือ partial/unmatched book | refresh inquiry ก่อน submit ใหม่ |
| `90003` | create-time route recheck พบ liquidity เป็น 0 | refresh inquiry หรือรอ liquidity |
| `no fee rate available` | ไม่มี fee configuration ที่ตรง candidate | candidate calculation ล้มเหลว; ต้องแก้ fee configuration ไม่ใช่บังคับเลือก route |
| `no route for <route>` | route หายไประหว่าง quote กับ submit | ขอ quote ใหม่; handler ปัจจุบันคืน generic Bad Request สำหรับกรณีนี้ |

Frontend ควร treat quote หมดอายุหรือ create failure เป็นเหตุให้ refresh route ไม่ควร submit ซ้ำด้วย payload เดิมโดยอัตโนมัติ

## Final outcomes

- Retail inquiry สำเร็จ: ได้ route เดียว พร้อม quote/fee/net amount และ best marker เมื่อมี valid route
- Dealer inquiry สำเร็จ: ได้ candidates ทั้งหมดที่คำนวณได้ โดย valid route ที่เลือกถูกย้ายขึ้นหน้า
- Minimum ไม่ผ่าน: ได้ routes ว่างพร้อมค่าขั้นต่ำ
- ไม่มี source หรือคำนวณ route ไม่ได้: inquiry ล้มเหลวและไม่มี order ถูกสร้าง
- Create-time revalidation ผ่าน: selected route ถูก persist และ flow ส่งต่อไป asynchronous execution

## Related shared rules

- [Swap Market Order](/business-flows/trading/swap-market-order/)
- [Swap Limit Order](/business-flows/trading/swap-limit-order/)
- [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

- `order-service/handler/order_trade_handler.go`
- `order-service/handler/trading_handler.go`
- `order-service/handler/white_glove_handler.go`
- `order-service/pkg/order_trade/service.go`
- `order-service/pkg/order_trade/swap_service.go`
- `xspring-mobile-app/lib/domains/digital_portal/swap/controller.dart`
- `xspring-mobile-app/lib/domains/digital_portal/swap/service.dart`
- `trading-web/src/features/trade/hooks/swap/use-swap.ts`
- `web-portal/src/app/features/white-glove/hooks/useTrading.ts`
- `web-portal/src/app/features/white-glove/services/order.ts`
- `web-portal/src/app/features/white-glove/components/swap/route-selection/index.tsx`
- `web-portal/src/app/features/white-glove/components/swap/swap-preview-modal/index.tsx`
- `web-portal/src/app/api/white-glove/[identificationId]/order-trade/inquiry/route.ts`
- `web-portal/src/app/api/white-glove/[identificationId]/order-trade/swap/route.ts`

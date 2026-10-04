---
title: Swap Market Order
description: Flow การซื้อขาย Swap แบบ Market ตั้งแต่ขอราคา เลือก route ที่จับคู่เต็ม สร้างคำสั่ง ส่ง Remarketer จน ledger และ portfolio สะท้อนผล
capability: Trading
services: [order-service, order-consumer, asset-service, asset-consumer, xspring-mobile-app, trading-web, web-portal]
integrations: [Remarketer, kafka]
aliases: [swap, market order, market swap, instant swap, best route, quote currency, USD swap, multi-currency swap, digital asset account freeze, suspended swap sell, suspended swap buy warning, partial order book, partial match, partial execution warning, insufficient order book, ซื้อขายทันที, แลกสินทรัพย์, คำสั่งมาร์เก็ต, สกุลเงินอ้างอิง, Swap USD, Swap หลายสกุล, Swap เมื่อระงับบัญชี, order book จับคู่บางส่วน, ส่งคำสั่งเมื่อจับคู่บางส่วน, คำเตือน execute บางส่วน, สมุดคำสั่งไม่พอ]
errorCodes: ["60002", "90000", "90001", "90002", "90003", "90004", "90006", "90010"]
status: active
lastUpdated: 2026-10-04
documentType: flow
---

## Purpose and scope

อธิบาย Swap แบบ Market ตั้งแต่ Mobile App, Trading Web หรือ White Glove ใน `web-portal` ขอ route, แสดงราคาประมาณ, ส่งคำสั่ง, hold สินทรัพย์ต้นทาง, ส่งคำสั่งไป Remarketer, รับผลการจับคู่, สร้าง logical ledger และ materialize portfolio รวมถึงการส่ง FX exposure เมื่อเข้าเงื่อนไข Hedge

Market inquiry เป็น quote สำหรับใช้สร้างคำสั่ง ไม่ใช่ execution guarantee ยอดที่สำเร็จจริงต้องยึด webhook และ execution result จาก Remarketer

## Trigger and preconditions

**Owner service: `order-service`**

- ผู้ใช้หรือ RM เลือก BUY หรือ SELL คู่สินทรัพย์และกรอก `from_unit` ใน Mobile App, Trading Web หรือ White Glove ใน `web-portal`
- Digital Asset account status ต้องอนุญาต side: `active` อนุญาต BUY/SELL, `suspended` อนุญาตเฉพาะ SELL (`swap_sell`), `closed`/`freeze` ไม่อนุญาตทั้งสอง side
- Client เรียก route inquiry ด้วย `unit`, `swap_pair` และ `side`; backend ตรวจ maintenance และจำนวนขั้นต่ำก่อนคำนวณ route
- จำนวน BUY ขั้นต่ำมาจาก digital asset transaction config; จำนวน SELL ขั้นต่ำแปลงจาก config ด้วย market price และปัดตาม decimal digit
- ก่อนสร้างคำสั่ง backend ตรวจ investor class, คู่สินทรัพย์, product/on-shelf, เอกสารอ้างอิงที่เกี่ยวข้อง, available balance และ route ที่เลือกอีกครั้ง
- Flow นี้ต้องมี route สำหรับ Market; Limit Order ใช้กฎต่างออกไปที่ [Swap Limit Order](/business-flows/trading/swap-limit-order/)

### Mobile suspended-account warning

**Owner service: `order-service`**

**Executing client: `xspring-mobile-app` สำหรับ warning และ pre-action feedback เท่านั้น**

Mobile อ่าน Digital Asset account status ระหว่างเตรียม Swap และแสดง `AccountSuspended` dialog เมื่อ account เป็น `suspended` และ side เป็น BUY รวมถึงเมื่อผู้ใช้เปลี่ยนกลับไป BUY; input ยังแสดงข้อความ `Buy order unavailable.` สำหรับ suspended BUY การแจ้งเตือนนี้เป็น client behavior ส่วน backend ยังคงเป็นผู้ตัดสินว่า suspended SELL ผ่านได้ และ suspended BUY/closed/freeze ถูก block

## Participating services

| Service / integration | Role | Responsibility |
| :--- | :--- | :--- |
| `order-service` | Business owner | ตรวจ eligibility และ route, สร้าง order, รับ webhook, คำนวณผลจริงและสร้าง ledger |
| `order-consumer` | Executing service | Consume create-order event, ตรวจ balance ซ้ำ, hold สินทรัพย์และส่ง Trade ไป Remarketer |
| Remarketer | External executor | คืน route candidates, รับคำสั่ง Trade และส่ง execution callback |
| Kafka | Async transport | ส่ง create-order, logical ledger และ hedge events |
| `asset-consumer` | Executing service | Consume logical ledger และ materialize portfolio |
| `asset-service` | Portfolio owner | เปิดเผย balance และ report จาก portfolio state |
| `web-portal` White Glove | Supporting client and Dealer UI | เรียก White Glove proxy ด้วย `identificationId`, แสดงหลาย route/exchange fee และส่ง payload ของ Dealer กลับตอน create |

## End-to-end sequence

### 1. Request and display a market quote

**Owner service: `order-service`**

**Executing client: Mobile App, Trading Web หรือ `web-portal` White Glove**

1. Client ส่ง `unit`, `swap_pair` และ `side` ไป route inquiry
2. `order-service` ตรวจ maintenance และ minimum amount แล้วขอ candidates จาก Remarketer ด้วย client type `retail`
3. Backend เลือก fee ของแต่ละ route, คำนวณ fee/net amount, จัดอันดับ และคืน route เดียวให้ retail client
4. Client ใช้ `isBestRoute` หรือรายการแรกเป็น route ปัจจุบัน แสดง rate, estimated receive และ fee; <mark class="changed-feature" data-updated-on="2026-10-03">White Glove route response ยังมี `quote_currency` และ `rate_thb`</mark>
5. Trading Web refresh quote เมื่อ countdown หมด; Mobile App refresh และพยายามคง route เดิมถ้ายัง available โดยให้ `mixed` route มาก่อน; `web-portal` refresh ตาม timer และคง route เดิมด้วยชื่อ route ถ้ายังอยู่ใน response

<mark class="changed-feature" data-updated-on="2026-10-04">Mobile App ถือ route ที่ไม่มี order หรือมี `MatchResult=no` ว่า unavailable; route ที่มี order และ partial match ไม่ถูก block ด้วย order-book check และเมื่อเป็น best route จะแสดง partial-execution warning ในหน้า Market และ confirmation โดยยังต้องผ่าน validation อื่น</mark>

<mark class="changed-feature" data-updated-on="2026-10-03">White Glove order-book `GET /api/v1/white-glove/products/{symbol}/order-book` รับ `quote_currency` เป็น `THB` หรือ `USD`; ถ้าไม่ส่งจะใช้ `THB` และ currency อื่นคืน HTTP `400`. Backend ใช้ currency นี้อ่าน bids/asks; Dealer order book ต้องมี `customer_account_id` และ `route` ด้วย เงื่อนไขนี้ยืนยันเฉพาะ order-book read contract ไม่ได้เปลี่ยน quote pair ที่ route inquiry ใช้สร้าง Swap</mark>

รายละเอียดการจัดอันดับอยู่ที่ [Trading Route Selection](/business-flows/trading/routing/)

### 2. Submit the selected quote

**Owner service: `order-service`**

**Executing client: Mobile App, Trading Web หรือ `web-portal` White Glove**

Client ส่งค่าจาก quote กลับมาใน create request; White Glove จะส่ง `exchange_fee_rate` และ `exchange_fee_amount` เพิ่มเมื่อผู้ใช้มี `WHITE_GLOVE_TRADING_DEALER_EXECUTE`:

```text
from_symbol, from_unit, to_symbol, route, side,
price, order_type=market, estimate_received_quantity,
fee_amount, fee_rate,
exchange_fee_rate, exchange_fee_amount (Dealer/White Glove เท่านั้น)
```

<mark class="changed-feature" data-updated-on="2026-10-04">Backend re-query Remarketer แล้วตรวจ route ชื่อเดียวกันอีกครั้ง: route ที่ไม่ใช่ `mixed` ต้องมี liquidity มากกว่า 0; route ต้องมี `HasOrder=true` และ Full หรือ Partial Match; no match ถูกปฏิเสธด้วย `insufficient order book`. การตรวจนี้อยู่ใน non-bulk Market path; Limit และ bulk trade ออกจาก `CanSwap` ก่อนถึงการตรวจ route นี้</mark>

production path ปัจจุบันไม่ได้แทนที่ `price`, `estimate_received_quantity`, `fee_amount` หรือ `fee_rate` ด้วยค่าที่คำนวณใหม่จาก re-query ค่าที่ client ส่งจึงถูก persist ลง order หลัง validation

### 3. Create the order and publish async work

**Owner service: `order-service`**

ภายใน database transaction ระบบ:

1. ตรวจ available balance ของสินทรัพย์ต้นทางอีกครั้ง
2. สร้าง `order_trade` และ action flow ที่ `draft`
3. เปลี่ยนเป็น `open`
4. บันทึก route, price, estimated quantity และ fee จาก create request

หลัง transaction สำเร็จ `order-service` publish create-order event ไป Kafka การเขียน order และการ publish event ไม่ได้อยู่ใน atomic transaction เดียวกัน

### 4. Hold the source asset and submit to Remarketer

**Owner service: `order-service`**

**Executing service: `order-consumer`**

`order-consumer`:

1. โหลด order ที่ `open` และตรวจ available balance ซ้ำ
2. ถ้า balance ไม่พอ เปลี่ยนเป็น `rejected`
3. ถ้าพอ สร้าง movement `AVAILABLE → HOLD_IN_ORDER` และ publish logical ledger
4. เรียก Remarketer Trade ด้วย route, price, order type และ quantity ที่ persist ใน order
5. เมื่อ Remarketer รับคำสั่ง เปลี่ยนสถานะเป็น `processing`
6. ถ้าเรียก Remarketer ล้มเหลว เปลี่ยนเป็น `rejected` และสร้าง movement คืน `HOLD_IN_ORDER → AVAILABLE`

สำหรับ BUY ปริมาณที่ส่ง Remarketer หัก order fee ก่อน และอาจหัก exchange fee เพิ่มสำหรับ Dealer tier ตาม route configuration

### 5. Process execution callbacks and ledger

**Owner and executing service: `order-service`**

เมื่อ Remarketer ส่ง callback:

1. บันทึก matched exchange และ trade transaction
2. คำนวณ fee/VAT จาก execution result; SELL ต้องบวก `ExchangeFee` กลับเข้า `ReceivedQty` ก่อนคำนวณ order fee
3. เมื่อยังมีปริมาณคงเหลือ ให้คง flow สำหรับ partial fill
4. เมื่อจับคู่ครบ เปลี่ยนเป็น `sync-ledger` และสร้าง logical ledger สำหรับตัด hold/เพิ่มสินทรัพย์ที่ได้รับ
5. เปลี่ยนเป็น `filled` เมื่อขั้น ledger ของ order สำเร็จ

<mark class="changed-feature" data-updated-on="2026-10-03">หลัง insert trade transaction, `order-service` เขียน quantity point สำหรับ 24-hour display volume เฉพาะเมื่อ lookup customer account สำเร็จและ account ไม่ใช่ Dealer tier; account missing/lookup error จะข้าม point ส่วน time-series write error ถูก log และไม่ทำให้ callback ล้มเหลว</mark>

รายละเอียด movement และ double-entry contract อยู่ที่ [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)

### 6. Materialize portfolio and expose the result

**Portfolio owner: `asset-service`**

**Executing service: `asset-consumer`**

`asset-consumer` consume logical ledger, persist audit และอัปเดต `asset_portfolio`; จากนั้น `asset-service` จึงเปิดเผย available/total balance และ report ที่อัปเดต ดู [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)

### 7. Produce hedge exposure when applicable

**Owner and executing service: `order-service`**

<mark class="changed-feature" data-updated-on="2026-10-03">ถ้าเปิด `FEATURE_PRODUCE_FX_MOVEMENT_HEDGE_TRANSACTION`, มี exchange transaction และ quote currency ของ customer ไม่ใช่ `USD` โดย exchange แรกเป็น USD pair ระบบ publish hedge transaction ให้ post-trade [Hedging](/business-flows/trading/hedging/) ทำงานต่อ</mark>

## Business rules

- Market route ต้องมีชื่อตรงกับ route ที่ Remarketer คืนใน create-time recheck
- route ปกติต้องมี liquidity มากกว่า 0; `mixed` route ข้ามเฉพาะ liquidity-zero check แต่ยังต้อง `HasOrder=true`
- <mark class="changed-feature" data-updated-on="2026-10-04">Standard non-bulk Market Swap ผ่าน route recheck เมื่อ route name ตรงกัน, liquidity ผ่าน (ยกเว้น mixed), `HasOrder=true` และ Full หรือ Partial Match; no match ถูกปฏิเสธ</mark>
- <mark class="changed-feature" data-updated-on="2026-10-03">Limit และ bulk trade ออกจาก `CanSwap` ก่อน validation route นี้; อย่านำกฎ Market route recheck ไปใช้กับสอง path ดังกล่าว</mark>
- <mark class="changed-feature" data-updated-on="2026-10-04">Mobile App มอง route ที่ไม่มี order หรือ `MatchResult=no` เป็น unavailable; Partial Match ที่มี order ใช้งานได้และแสดง partial-execution warning</mark>
- Client quote เป็นค่าประมาณและอาจเปลี่ยนก่อน submit; create-time recheck ยืนยัน availability แต่ไม่ re-price payload
- Available balance ถูกตรวจทั้งก่อนสร้าง order และก่อน hold โดย `order-consumer`
- <mark class="changed-feature" data-updated-on="2026-10-03">24-hour display-volume point ไม่ถูกเขียนสำหรับ Dealer account; account lookup/write failure ถูก log/ข้ามโดยไม่ย้อน trade fill</mark>
- Market order ไม่มี customer-cancel path; cancel predicate ฝั่ง backendอนุญาตเฉพาะ `order_type=limit`
- Account status gate เป็น backend rule: `suspended` ยังสร้าง Market SELL ได้ แต่สร้าง BUY ไม่ได้; `closed`/`freeze` ถูก block ด้วย HTTP `400`, `60002` (`ErrorCustomerSuspend`)
- Mobile suspended-BUY dialog และ `Buy order unavailable.` เป็น supporting warning ไม่ใช่ execution result หรือ backend authorization
- Fee inquiry และ fee จาก execution ใช้คนละจังหวะ ยอดสุดท้ายต้องยึด execution transaction ดู [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)

## State transitions

**Owner service: `order-service`**

Success path:

```text
draft → open → processing → filling → sync-ledger → filled
```

- ถ้า consumer พบ balance ไม่พอ หรือส่ง Remarketer ไม่สำเร็จ: `open → rejected`
- Partial execution อาจวนอยู่ใน `filling` ก่อน `sync-ledger`
- `filled` และ `rejected` เป็น terminal state ของ Market flow; Market ไม่มี customer-driven `cancelled`

ดูข้อจำกัดรวมที่ [Order State Machine](/shared-rules/order-state-machine/)

## Error and recovery behavior

| Code / condition | Confirmed behavior | Recovery visible to client/operator |
| :--- | :--- | :--- |
| `90000` | คู่สินทรัพย์อยู่ใน maintenance | Client refresh maintenance state และไม่ submit |
| `90001` | available asset ไม่พอตอนสร้าง order | เพิ่มยอดหรือลดจำนวนแล้วส่งใหม่ |
| `90002` | <mark class="changed-feature" data-updated-on="2026-10-04">หลังผ่าน liquidity check แล้ว selected route ไม่มี order หรือ `MatchResult=no` ตอน submit</mark> | <mark class="changed-feature" data-updated-on="2026-10-04">Refresh route inquiry ก่อนส่งใหม่; Full และ Partial Match ส่งได้เมื่อ route มี order</mark> |
| `90003` | route ปกติมี liquidity เป็นศูนย์ตอน submit | Refresh route inquiry หรือรอ liquidity |
| `90004` | จำนวนต่ำกว่าขั้นต่ำ | ใช้ `minimum_amount` จาก inquiry ปรับจำนวน |
| `90006` | Trading/White Glove inquiry ไม่ได้ route candidates จาก Remarketer | Client แสดง no available route และ retry inquiry |
| `90010` | เอกสารอ้างอิงหมดอายุ | ผู้ใช้ต้องผ่าน document acceptance flow ก่อน |
| `60002` | Digital Asset account status ไม่อนุญาต side ที่ขอ; message ใช้ `customer is <status>.` | เปลี่ยน operation เป็น side ที่ status อนุญาตหรือแก้สถานะ account ตาม business process |
| Publish create-order event ล้มเหลว | order อาจถูก commit ที่ `open` แล้ว แต่ API คืน error เพราะ publish เกิดหลัง DB transaction | ต้องตรวจ order/event operationally; ห้ามสร้างคำสั่งซ้ำโดยเดาจาก HTTP response อย่างเดียว |
| Consumer ส่ง Remarketer ล้มเหลว | order ถูก reject และ hold ถูกคืนด้วย logical ledger | รอ portfolio apply แล้วจึงส่งคำสั่งใหม่ |
| Ledger processing ล้มเหลว | ห้ามข้ามเป็นผลสำเร็จปลายทางโดยไม่มี ledger ที่สอดคล้อง | retry/ตรวจที่ `sync-ledger` ตาม operational policy |

Trading Web map code ที่รู้จักไป error modal และ refetch products หลัง create สำเร็จ; Mobile App map maintenance/no-route และ validation message ตาม response ที่ได้รับ; `web-portal` White Glove แปลง `90006` เป็น routes ว่าง, แสดง maintenance modal, แสดง Exchange Fee สำหรับ Dealer และเปิด order-confirm modal เมื่อ create สำเร็จ

## Final outcomes

- สำเร็จ: Remarketer execution ถูกบันทึก, logical ledger ถูก apply, order เป็น `filled` และ portfolio/report สะท้อนยอดใหม่
- ปฏิเสธก่อนส่งหรือส่ง Remarketer ไม่สำเร็จ: order เป็น `rejected` และไม่มี source asset ค้างใน hold เมื่อ ledger คืนยอด apply สำเร็จ
- คู่ USD ที่เข้าเงื่อนไข: มี hedge transaction สำหรับ post-trade flow
- Response create สำเร็จยืนยันว่า order ถูกสร้างและ queued แล้ว ไม่ได้ยืนยันว่า execution หรือ portfolio update สำเร็จ
- `suspended` + SELL ผ่าน status gate ได้ แต่ไม่ได้เปลี่ยนเป็น system-cancel branch เพราะ cancellation orchestration ที่เพิ่มในรอบนี้เลือกเฉพาะ Limit Order

## Related shared rules

- [Trading Route Selection](/business-flows/trading/routing/)
- [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

- `order-service/handler/order_trade_handler.go`
- `order-service/handler/trading_handler.go`
- `order-service/handler/order_trade_dto.go`
- `order-service/pkg/order_trade/swap_service.go`
- `order-service/pkg/order_trade/webhook_service.go`
- `order-service/pkg/order_trade/service.go`: `checkRoute` full/partial-match, order และ liquidity recheck
- `order-service/internal/constants/enum/order_trade_enum.go`: `IsMatched()` รับ Full และ Partial Match
- `order-service/internal/domain/ledger_fx_rate.go`: quote-currency rule for USD `rate_symbol_pair`
- `order-consumer/pkg/digital-asset-order-request/swap.go`
- `asset-consumer/pkg/customer-logical-entry/service.go`
- `xspring-mobile-app/lib/domains/digital_portal/swap/controller.dart`
- `xspring-mobile-app/lib/domains/digital_portal/swap/models/swap_route.dart`: no-match/no-order unavailable predicate; Partial Match with order remains available
- `xspring-mobile-app/lib/domains/digital_portal/swap/widgets/swap_market.dart`: insufficient-order-book text and submit gating context
- `xspring-mobile-app/lib/domains/digital_portal/swap/service.dart`
- `trading-web/src/features/trade/hooks/swap/use-swap.ts`
- `web-portal/src/app/features/white-glove/hooks/useTrading.ts`
- `web-portal/src/app/features/white-glove/services/order.ts`
- `web-portal/src/app/features/white-glove/utils/swap-currency.ts`: เลือก quote currency จาก `available_symbol_pairs` และ fallback `THB`
- `web-portal/src/app/features/white-glove/hooks/useOrderBook.ts`: ส่ง `quoteCurrency` และ `route` ไปยัง order-book service พร้อม route guard
- `web-portal/src/app/api/white-glove/order-book/[symbol]/route.ts`: proxy `quote_currency` ไปยัง `order-service`
- `web-portal/src/app/features/white-glove/components/swap/swap-preview-modal/index.tsx`
- `web-portal/src/app/api/white-glove/[identificationId]/order-trade/inquiry/route.ts`
- `web-portal/src/app/api/white-glove/[identificationId]/order-trade/swap/route.ts`

`xspring-mobile-app` supporting reference:

- `lib/domains/digital_portal/swap/controller.dart`: suspended-account warning on initial BUY and side change
- `lib/domains/digital_portal/swap/widgets/swap_from_to_input.dart`: `Buy order unavailable.` warning
- `lib/domains/digital_portal/swap/widgets/swap_error_dialog.dart`: account-suspended dialog

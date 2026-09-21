---
title: White Glove Dealer USD Swap Pair Support Implementation Plan
tags: [implementation, active, dealer, white-glove, swap, usd, coinbase]
status: active
last-updated: 2026-09-21
---

# White Glove Dealer USD Swap Pair Support

## Goal

Dealer สามารถซื้อขายสินทรัพย์ดิจิทัลด้วย quote currency ที่ Exchange ปลายทางรองรับ เช่น `*-THB` บน Bitkub และ `*-USD` บน Coinbase และสามารถติดตาม Portfolio และ Order ผ่านระบบ Back Office (White Glove) ได้ตั้งแต่ Estimate จน Settlement เสร็จสมบูรณ์

ระบบต้องรักษาหน่วยของเงินให้ถูกต้องตลอด flow โดยสำหรับคำสั่ง `*-USD` แบบ direct pair:

- Customer settlement currency เป็น USD
- Exchange quote currency เป็น USD
- Effective FX rate เป็น `1`
- ไม่มีการแปลงจำนวนเงิน THB ↔ USD
- ไม่มี FX hedge เนื่องจากไม่มี FX exposure

## References

- Miro: [XM-18509 - Dealer รองรับการ trade คู่สกุลเงิน USD](https://miro.com/app/board/uXjVG9cYQOk=/?moveToWidget=3458764683601197805&cot=14)
- Coinbase Convert (`USDC-USD`): XM-18789 — แยกออกจาก scope ของเอกสารนี้

## Scope

### In Scope

- White Glove Portfolio รองรับ balance และ valuation ของ USD
- White Glove Swap รองรับ direct USD-quoted pairs ที่ถูกเปิดใช้งานใน strategy ของ Exchange
- Market และ Limit order หาก White Glove เปิดให้เลือก order type ดังกล่าวอยู่แล้ว
- Route, estimate, orderbook, place order, status inquiry, settlement, ledger และ order display
- แสดง Exchange และ Exchange fee ตามรายละเอียดใน Miro
- แสดง THB-equivalent market value ของ USD ใน Portfolio โดยใช้ FX mark-to-market
- Filter USD ออกจาก Deposit และ Withdraw
- Filter Dealer orders ออกจาก Recent Trades ของ Retail ทุก channel
- แก้ liquidity sync ให้รวม strategy ของ Retail และ Dealer
- Coinbase adaptor ต้อง reject เมื่อจำเป็นต้องใช้ FX แต่ `fxRate` เป็น nil หรือ `0`

### Out of Scope

- Coinbase Convert API สำหรับ `USDC-USD` — ดำเนินการใน XM-18789
- การเทรด pair ที่ Exchange ไม่มี direct orderbook หรือไม่มี active dealer strategy
- การเพิ่มช่องทางฝากหรือถอน USD ให้ลูกค้า

> หาก `USDC-USD` ไม่มี direct spot orderbook/active strategy ใน release นี้ ระบบต้องไม่เสนอ route และต้องตอบ No Available Sourced Exchange ไม่ใช่ fallback ไป Convert API

---

## Domain Rules และ Invariants

### 1. Pair และ Route ต้องตรงกัน

ทุกจุดที่ค้นหา route, market rate, orderbook หรือ validate order ต้องใช้ key อย่างน้อย:

```text
base_symbol + quote_symbol + source_exchange
```

และต้องรักษา invariant:

```text
requested quote currency
  == selected dealer strategy quote currency
  == selected exchange pair quote currency
  == customer settlement currency
```

ห้ามเลือก strategy จาก `base_symbol` เพียงอย่างเดียว เพราะเมื่อมีทั้ง `BTC-THB` และ `BTC-USD` อาจ route ไปผิด pair ได้

### 2. FX Semantics

| Customer pair | Exchange pair | พฤติกรรมที่ถูกต้อง |
|---|---|---|
| `BTC-USD` | `BTC-USD` | Direct USD; `FxRate = OriginalFxRate = 1`; ไม่ convert และไม่ hedge |
| `BTC-THB` | `BTC-USD` | ต้องใช้ FX ที่ valid เพื่อแปลงหน่วย; nil/0 ต้อง reject ก่อนส่ง Exchange; hedge ตาม flow เดิม |
| `BTC-THB` | `BTC-THB` | Direct THB; ไม่ใช้ USD FX |

ห้ามใช้ fallback ที่เมื่อ `fxRate = 0` แล้วข้ามการหาร/คูณ เพราะจะทำให้ยอด THB ถูกส่งไป Exchange ในฐานะ USD

### 3. Liquidity 100%

“แสดง Liquidity ตามจริง 100%” หมายถึงไม่ลด liquidity ด้วย buffer

- หาก config ปัจจุบันคือ `LiquidityDecreasePercent` ต้องตั้งค่าเป็น `0`
- ห้ามตั้ง `LiquidityDecreasePercent = 100` เพราะจะทำให้ effective liquidity เป็นศูนย์
- หากต้องการ config ที่อ่านตรงตามความหมาย ให้เพิ่ม `LiquidityDisplayPercent = 100`

ค่าที่ใช้บน Estimate และค่าที่ validate ก่อน Place Order ต้องมาจากหน่วยเดียวกันและ snapshot/route เดียวกัน

### 4. Average Cost ของ Fiat

กำหนด `avg_cost = 1` เฉพาะ transaction/ledger leg ที่ product เป็น fiat (`THB` หรือ `USD`)

- ห้ามตั้ง average cost ของ base digital asset เช่น BTC/ETH เป็น `1`
- Digital-asset leg ต้องใช้ portfolio average-cost calculation เดิม
- ต้องระบุใน implementation ว่า field/table ใดเป็น fiat leg และมี test แยก Buy/Sell

### 5. Dealer Order Identity

ให้สร้างและ persist ค่า immutable เช่น `client_type = DEALER` หรือ `order_origin = WHITE_GLOVE_DEALER` ตั้งแต่ Order Creation และส่งต่อผ่าน Kafka/Remarketer/Webhook

ห้ามใช้ customer tier ปัจจุบันเพียงอย่างเดียวในการระบุว่าเป็น Dealer order เพราะ tier อาจเปลี่ยนภายหลังและทำให้ Historical/Recent Trades เปลี่ยนความหมาย

---

## Acceptance Criteria

| # | Acceptance Criteria | Owner หลัก |
|---|---|---|
| AC 1 | Overview แสดง THB และ USD Portfolio แยก currency พร้อม Available, In-order และ Total ที่ถูกต้อง | `web-portal`, `order-service` |
| AC 2 | USD แสดง 2 decimal สำหรับ fiat amount; crypto quantity และ price ใช้ product/exchange precision ไม่ hardcode 2 decimal ทั้งหมด | `web-portal`, `order-service` |
| AC 3 | THB-equivalent Market Value ของ USD คำนวณด้วย USD balance × USD NAV × FX mark-to-market และแสดงเวลาของ valuation/FX snapshot | `order-service`, `web-portal` |
| AC 4 | White Glove Swap รองรับ direct USD pairs ตั้งแต่ Pair Selection, Route, Estimate, Confirm, Place Order, Status, Settlement และ Display | ทุก component ที่เกี่ยวข้อง |
| AC 5 | Route/market rate/order validation filter ด้วย `base_symbol`, `quote_symbol` และ selected exchange; ห้ามปะปน THB/USD strategy | `remarketer-core-service` |
| AC 6 | Dealer ต้องเลือก sourced route ก่อน Confirm และ Orderbook ต้องแสดงจาก Exchange ของ route ที่เลือก | `web-portal`, `order-service`, `remarketer-core-service` |
| AC 7 | Orderbook cache/request key รวม base, quote และ exchange; เมื่อเปลี่ยน pair หรือ exchange ห้ามแสดง cache เดิม | `web-portal`, `order-service` |
| AC 8 | หน้า Estimate, Success, Open Orders, Order History/Detail และ Trading แสดง base/quote, Exchange, Exchange fee, fee currency และ settlement currency ถูกต้องตาม Miro | `web-portal`, `order-service` |
| AC 9 | ตาราง Order ใน Dealer flow เปลี่ยนคอลัมน์ `Size` เป็น `Exchange` ตาม Miro และใช้รูปแบบเดียวกันทุกหน้าที่เกี่ยวข้อง | `web-portal` |
| AC 10 | Liquidity แสดงตามจริง 100% โดยไม่มี liquidity decrease และรองรับหน่วย USD | `remarketer-core-service` |
| AC 11 | Direct USD order ใช้ `FxRate = OriginalFxRate = 1` ในทุก status และไม่คูณ/หาร executed data ด้วย FX | `remarketer-core-service`, `coinbase-adaptor` |
| AC 12 | หาก flow ต้องใช้ FX conversion และ FX เป็น nil/0 ให้ reject ก่อน division หรือ Exchange API call | `coinbase-adaptor` |
| AC 13 | Direct USD order ไม่สร้าง FX hedge; THB order ที่ route ไป USD exchange ยังคง hedge ตาม flow เดิม | `order-service` |
| AC 14 | Fiat ledger transaction ของ THB/USD มี `avg_cost = 1`; digital-asset transaction คง average cost ที่คำนวณจาก Portfolio | `order-service` |
| AC 15 | USD ไม่ปรากฏใน Deposit/Withdraw UI และ API ต้อง reject หากมีการเรียกโดยตรง | `web-portal`, `order-service` |
| AC 16 | เมื่อไม่มี active strategy/Exchange ที่รองรับ pair ให้ตอบ stable error code สำหรับ No Available Sourced Exchange | `order-service`, `remarketer-core-service` |
| AC 17 | Dealer orders ไม่ปรากฏใน Recent Trades ของ Retail ทั้ง BOF, MOB และ WEB โดยอ้างอิง immutable order origin | `order-service` |
| AC 18 | Coinbase liquidity subscription/sync รวม active strategies จาก Retail และ Dealer พร้อม deduplicate symbol | `coinbase-adaptor` |
| AC 19 | Dealer ไม่มี business-level minimum swap ตาม Miro แต่ยังต้อง validate exchange minimum notional, quantity increment และ price increment | `order-service`, `remarketer-core-service`, adaptor |
| AC 20 | `USDC-USD` Convert ไม่ถูกเรียกใน release นี้; หากไม่มี direct source ให้เข้า AC 16 | ทุก component ที่เกี่ยวข้อง |

---

## Error Contract

Frontend ต้องตัดสินใจจาก stable error code และทำ localization ที่ UI ไม่ควรผูก logic กับ display string เพียงอย่างเดียว

| สถานการณ์ | Error ที่แนะนำ | Display |
|---|---|---|
| ไม่มี active source/strategy สำหรับ pair | `NO_AVAILABLE_SOURCED_EXCHANGE` | No Available Sourced Exchange |
| Source รองรับ pair แต่ liquidity ไม่พอ | `INSUFFICIENT_LIQUIDITY` | Insufficient Liquidity |
| Exchange/Remarketer ใช้งานไม่ได้ชั่วคราว | `SOURCE_TEMPORARILY_UNAVAILABLE` | Source Temporarily Unavailable |
| FX ที่จำเป็นเป็น nil หรือ 0 | `INVALID_FX_RATE` | Unable to retrieve a valid FX rate |
| Balance ไม่พอ | `INSUFFICIENT_BALANCE` | Insufficient Balance |

Place Order ต้อง revalidate pair, selected route, source status และ liquidity อีกครั้ง ห้ามเชื่อ Estimate เก่าจาก UI โดยไม่มี expiry/re-inquiry

---

## End-to-End Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Dealer as Dealer (White Glove)
    participant UI as web-portal
    participant OS as order-service
    participant OC as order-consumer
    participant RC as remarketer-core-service
    participant CA as coinbase-adaptor
    participant CB as Coinbase Spot API
    participant RI as remarketer-inquiry-service

    Dealer->>UI: Select BTC-USD
    UI->>OS: Get routes(base=BTC, quote=USD)
    OS->>RC: Match active dealer strategy(BTC, USD)
    RC-->>OS: Coinbase route, liquidity in USD, effective FX=1
    OS-->>UI: Routes + stable route ID/expiry

    Dealer->>UI: Select Coinbase route
    UI->>OS: Get orderbook(BTC, USD, Coinbase)
    OS->>RC: Get sourced orderbook(BTC, USD, Coinbase)
    RC-->>UI: Coinbase bids/asks in USD

    Dealer->>UI: Confirm order
    UI->>OS: Place order(pair, route ID, order type, side, quantity)
    OS->>OS: Revalidate pair/route/liquidity and persist DEALER origin
    OS->>OC: create_swap
    OC->>OC: Hold customer USD or digital asset
    OC->>RC: Place direct USD order
    RC->>CA: produce_order with quote=USD, FX=1
    CA->>CA: Validate direct USD; no THB conversion
    CA->>CB: Place Spot order

    CB-->>CA: Processing/Partial/Filled/Cancelled/Rejected
    CA->>RI: Status event; FX=1; raw USD values
    RI->>OS: Remarketer webhook
    OS->>OS: Idempotent settlement/unhold/refund
    OS->>OS: Set fiat-leg avg cost=1; suppress FX hedge
    OS-->>UI: Update Open Orders/History/Portfolio
```

---

## Component Breakdown

### 1. `web-portal`

- เปลี่ยน White Glove state จาก THB implicit default เป็น explicit `baseCurrency`, `quoteCurrency`, `selectedExchange` และ `routeId`
- ลบ hardcoded `${symbol}-thb`, `THB` labels และ currency suffix ใน Swap/Open Orders/History/Detail/Trading
- Orderbook query key ต้องประกอบด้วย `[base, quote, exchange]`
- Clear/refetch Estimate และ Orderbook เมื่อ pair หรือ selected exchange เปลี่ยน
- เพิ่ม Exchange และ Exchange fee ตาม Miro พร้อม currency ของ fee
- เปลี่ยนคอลัมน์ `Size` เป็น `Exchange` ใน Dealer order tables ที่เกี่ยวข้อง
- แสดง USD icon และ fiat amount 2 decimals; ใช้ metadata สำหรับ crypto/price precision
- Portfolio ต้องรองรับหลาย fiat balances ไม่ใช่ `fiat_balance` ค่าเดียว
- ซ่อน USD จาก Deposit/Withdraw และไม่แสดง action button บน USD Portfolio

### 2. Master Data และ Migration

- เพิ่ม/ตรวจสอบ USD product ด้วย schema จริงของ `dw_product.product`
- ตั้ง `decimal_digit = 2`, `tradable = true`, `depositable = false`, `withdrawable = false`
- เปิดเฉพาะ direct trade pairs ที่มี Exchange support และ active dealer strategy
- ใช้ columns จริงของ dealer strategy เช่น `base_symbol`, `quote_symbol`, `source_id`
- เพิ่ม sale/product-on-shelf configuration และ USD portfolio/logical ledger สำหรับ Dealer ที่มีสิทธิ์
- จัดทำ idempotent migration และ rollback plan; ไม่ใช้ SQL ตัวอย่างที่อ้าง column ซึ่งไม่มีใน schema

### 3. `order-service`

- ปรับ Product/Portfolio DTO ให้คืน balances และ market values แยก currency
- คำนวณ USD market value และ THB equivalent ตามสูตรที่ระบุใน Miro
- Deposit/Withdraw filter ต้อง enforce ฝั่ง service/API ด้วย
- White Glove route และ orderbook request รับ base, quote และ exchange อย่างชัดเจน
- ห้ามอ่าน Redis key contract ซ้ำใน order-service หาก Remarketer มี API owner ของ sourced orderbook
- Persist `client_type/order_origin` และ selected route/source บน order
- ปรับ response DTO ให้มีอย่างน้อย `base_currency`, `quote_currency`, `settlement_currency`, `fee_currency`, `exchange_fee_currency`, `exchange`, `exchange_pair`
- Set `avg_cost = 1` เฉพาะ fiat ledger transaction
- Suppress hedge เฉพาะ direct customer USD → exchange USD flow
- Recent Trades filter ด้วย immutable order origin และต้องคงเงื่อนไข time window/sort/limit เดิม

### 4. `order-consumer`

- ใช้ quote product จาก order ไม่ derive เป็น THB
- Hold/consume/unhold/refund ledger ให้ตรง currency สำหรับ Buy/Sell และ Partial Fill
- Forward immutable dealer origin, base, quote, route และ source ไป Remarketer
- ป้องกัน duplicate consumption และ negative available balance สำหรับ concurrent orders

### 5. `remarketer-core-service`

- Dealer strategy repository และ service APIs ต้อง filter ด้วย base + quote และ source เมื่อเลือก route แล้ว
- Market rate และ order validation ต้องใช้ strategy เดียวกับ Estimate
- Direct USD ใช้ effective FX `1`; THB-to-Coinbase flow ใช้ FX conversion เดิม
- Orderbook ต้องแยกตาม exchange และ pair; ห้ามรวม liquidity/orderbook ของคนละ quote currency
- Liquidity display และ pre-trade validation ใช้หน่วยเดียวกัน
- กำหนด `LiquidityDecreasePercent = 0` สำหรับ actual 100% liquidity หรือสร้าง config ที่มี semantic ชัดเจน

### 6. `remarketer-coinbase-adaptor-service`

#### Place Order และ FX Guard

- Direct USD: set `FxRate = OriginalFxRate = 1` และไม่ fetch/divide ด้วย KTB FX
- THB customer pair routed to Coinbase: fetch FX และ reject `INVALID_FX_RATE` เมื่อ nil/0 ก่อน conversion/API call
- Apply guard ให้ครบ Market, Limit และ V2 paths
- ห้าม helper เปลี่ยน quote currency เป็น USD หลังจากข้าม conversion เนื่องจาก FX เป็น 0

#### Inquiry/Status Event

- Apply USD semantics ให้ครบ Processing, Partial Fill, Filled, Cancelled และ Rejected
- ครอบคลุมทั้ง status-event builder paths ไม่ใช่เฉพาะ `buildFillStatusEvent`
- Preserve raw Coinbase USD price, received quantity, executed quantity และ exchange fee
- Set fee currency/exchange fee currency ให้ชัดเจน

#### Liquidity Sync Bug Fix (15/09/26)

- Union active mappings จาก Retail `source_strategy_mapping` และ Dealer `source_strategy_mapping_dealer`
- Filter เฉพาะ Coinbase และ active strategy
- Deduplicate base/quote currencies ที่ต้อง subscribe/sync
- รองรับ dealer-only symbol, retail-only symbol และ symbol ที่ซ้ำกัน
- ระบุ operational behavior เมื่อ strategy เปลี่ยน: refresh runtime/reconnect หรือ restart requirement

### 7. `remarketer-inquiry-service`

- Remaining/minimum amount calculation ต้อง pair-aware ห้ามแปลงทุก source value เป็น THB โดยอัตโนมัติ
- Direct USD order ต้อง compare minimum/remaining amount ใน USD
- Dealer ไม่มี business minimum ตาม Miro แต่ exchange-level minimum และ increments ยังคงต้อง validate
- ส่งต่อ immutable client type และ currency fields โดยไม่ derive ใหม่จาก customer tier

### 8. `dealer-core-service`

- ตรวจสอบ call graph ว่ามีหน้าที่ใน White Glove route/orderbook/order display หรือไม่
- หากไม่มี code/config change ให้ถอดออกจาก implementation scope แทนการระบุ owner แบบกว้าง ๆ

---

## Portfolio Display Rules จาก Miro

| รายการ | Rule |
|---|---|
| USD stored balance | เก็บและแสดงยอด USD ตามจริง ไม่แปลงเป็น THB ใน ledger |
| Fiat display precision | USD 2 decimal positions |
| USD Market Value | `unit_balance × USD NAV` |
| THB-equivalent Market Value | `unit_balance × USD NAV × USD/THB FX NAV` |
| Visibility | แสดง asset เมื่อ unit > 0 ตาม rule เดิม; ต้องตกลงเพิ่มเติมว่าจะให้ zero-balance USD แสดงหรือไม่ |
| Deposit/Withdraw | ไม่แสดง action และ API ไม่อนุญาต |

ค่า THB equivalent เป็นข้อมูล display/valuation เท่านั้น ห้ามนำไปใช้เป็น settlement amount ของ direct USD order

---

## Verification Plan

### Automated Test Matrix

| Dimension | Cases ขั้นต่ำ |
|---|---|
| Pair | direct `BTC-USD`, `ETH-USD`; existing `BTC-THB`; unsupported pair; `USDC-USD` without direct source |
| Side | Buy, Sell |
| Order type | Market, Limit (เมื่อเปิดใน White Glove) |
| Status | Processing, Partial Fill, Filled, Cancelled, Rejected, Timeout |
| Source | Bitkub THB, Coinbase USD, inactive source, maintenance, empty/stale orderbook |
| FX | direct USD = 1; THB→Coinbase valid rate; nil/0 rate reject; direct USD no hedge |
| Balance | sufficient, insufficient, concurrent orders, partial-fill refund, no negative balance |
| Webhook | duplicate event, out-of-order event, retry/idempotency |
| UI | Estimate, Success, Open Orders, History, Detail, Trading, Portfolio, Deposit, Withdraw |

### Component Tests ที่ต้องมี

#### `web-portal`

- เปลี่ยน `BTC-THB/Bitkub` → `BTC-USD/Coinbase` แล้ว Estimate/Orderbook ไม่ใช้ cache เดิม
- ทุกหน้าตาม AC 8 แสดง quote/exchange/fees ถูกต้อง
- USD ไม่ปรากฏใน Deposit/Withdraw
- Portfolio แสดง USD และ THB-equivalent โดยไม่เปลี่ยน settlement balance

#### `order-service` และ `order-consumer`

- Fiat leg avg cost เป็น 1 แต่ BTC/ETH leg ไม่เป็น 1
- Hold/unhold/refund USD ถูกต้องสำหรับ Buy/Sell และ Partial Fill
- Direct USD ไม่ produce hedge; THB-via-USD ยัง produce ตามเงื่อนไขเดิม
- Recent Trades ของ BOF/MOB/WEB ไม่คืน Dealer order
- USD Deposit/Withdraw direct API call ถูก reject

#### `remarketer-core-service`

- Route/market rate/order validation ไม่ปะปน `BTC-THB` และ `BTC-USD`
- Selected exchange orderbook ใช้ pair/source ถูกต้อง
- Direct USD price และ liquidity ไม่คูณ FX
- Actual liquidity 100% เมื่อ decrease config เป็น 0

#### `remarketer-coinbase-adaptor-service`

- Market/Limit/V2 direct USD ไม่หารด้วย FX
- Market/Limit/V2 THB conversion reject เมื่อ FX nil/0
- Processing/Partial/Filled/Cancelled/Rejected events ของ direct USD มี FX=1 และ raw USD values
- Liquidity sync รวม Retail + Dealer, deduplicate และรองรับ dealer-only symbol

#### `remarketer-inquiry-service`

- USD remaining/minimum comparison ไม่ถูกแปลงเป็น THB
- Dealer business minimum ถูก bypass แต่ exchange constraints ยังคง enforce

### Manual End-to-End Checklist

1. Overview แสดง THB และ USD balances, Available, In-order, Market Value และ THB equivalent ถูกต้อง
2. Deposit/Withdraw ไม่มี USD และ direct API request ถูกปฏิเสธ
3. เลือก USD pair แล้วเห็นเฉพาะ active dealer routes ที่ quote เป็น USD
4. เลือก Coinbase แล้ว Orderbook เป็น Coinbase `*-USD`; เปลี่ยน Exchange/pair แล้วข้อมูล refresh
5. Estimate แสดงราคา, liquidity, fee และ exchange fee ใน currency ที่ถูกต้อง
6. Place Buy และ Sell ทั้ง Market/Limit; ตรวจ Exchange payload ว่าใช้ยอด USD จริง
7. ตรวจ Open Orders, Success, History/Detail และ Trading เทียบกับ field mapping ใน Miro
8. ตรวจ Filled/Partial/Cancel/Reject ว่า ledger, hold, refund และ average cost ถูกต้อง
9. ยืนยันว่า direct USD ไม่มี hedge event
10. ยืนยันว่า Retail Recent Trades ทั้ง BOF/MOB/WEB ไม่แสดง Dealer fills
11. ปิด strategy หรือเลือก unsupported pair แล้วได้ `NO_AVAILABLE_SOURCED_EXCHANGE`
12. จำลอง FX=0 ใน THB→Coinbase flow แล้วถูก reject ก่อนเรียก Coinbase

---

## Open Decisions ก่อน Development Sign-off

1. รายชื่อ direct USD pairs ที่ Exchange และ Compliance อนุมัติใน release นี้คืออะไรบ้าง
2. Limit Order อยู่ใน scope ของ release นี้หรือไม่; หากไม่อยู่ต้องปิด UI และ API อย่างชัดเจน
3. USD balance จะ provision ให้ Dealer เดิมผ่าน migration หรือ lazy creation
4. เมื่อ Deposit/Withdraw USD ถูกปิด USD จะเข้า/ออก customer account ผ่าน Internal Transfer/Treasury flow ใด
5. Portfolio จะแสดง USD row เมื่อ balance เป็นศูนย์หรือเฉพาะ `unit > 0`
6. Dealer fills ต้องถูกกรองออกจาก Retail candle/ticker/volume ด้วยหรือเฉพาะ Recent Trades
7. Quote/route expiry และ orderbook staleness threshold ใช้ค่าเท่าใด
8. Exchange fee ที่แสดงมาจาก estimate หรือ first transaction ตาม note ใน Miro และต้อง update หลัง final fill อย่างไร

รายการ Open Decisions ต้องปิดก่อน Final Grooming เพื่อไม่ให้แต่ละ service ตีความ currency และ order identity ต่างกัน

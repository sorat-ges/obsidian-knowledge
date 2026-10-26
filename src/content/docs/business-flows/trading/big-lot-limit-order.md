---
title: Big Lot Limit Order
description: Requirement และพฤติกรรมจากโค้ดของ Big Lot Limit Order ระหว่าง RM กับ Dealer ตั้งแต่ราคาและจำนวน DA, fee/hold, routing, extapi, exact matching, Order Book และ Order Detail
capability: Trading
services: [order-service, order-consumer, dealer-matching-service, web-portal]
integrations: [Remarketer, Kafka, PostgreSQL, Redis]
aliases: [XM-17566, big lot limit, biglot limit order, RM limit order, exact match, full match, Relationship Manager, Placed By, Request Rate, dealer extapi, place-bid, place-ask, FIFO, บิ๊กล็อตลิมิต, ตั้งราคาบิ๊กล็อต, จับคู่ RM Dealer, refinement big lot]
status: active
lastUpdated: 2026-10-25
documentType: flow
---

## Purpose and scope

<mark class="changed-feature" data-updated-on="2026-10-25">Big Lot Limit Order ตาม XM-17566 ให้ RM ตั้งราคาและจำนวน Digital Asset (DA) แล้วรอ Full Exact Match กับ Dealer ได้ ไม่ว่าฝ่ายใดจะวางก่อน</mark>

**สถานะของข้อมูล:** หน้านี้เป็นบันทึก requirement และผลตรวจ source code วันที่ 25 ตุลาคม 2026 โดยแยกพฤติกรรมปัจจุบันกับผลลัพธ์ที่ต้องการออกจากกัน Requirement ใหม่ยังไม่ได้ implement หรือทดสอบ runtime ในการตรวจครั้งนี้ `status: active` หมายถึงเอกสารใช้อ้างอิงได้ ไม่ได้หมายความว่า feature เปิดใช้งานแล้ว

อ่าน [Big Lot](/business-flows/trading/big-lot/) สำหรับ flow ที่ใช้อยู่ และ [Swap Limit Order](/business-flows/trading/swap-limit-order/) สำหรับ Limit ปกติซึ่งมีกฎ routing/partial fill ต่างจาก requirement นี้ แผนงาน refinement ฉบับเต็มอยู่ใน repository ที่ `03-Implementation/Active/big-lot-limit-order-refinement.md` ตามกติกาที่แยก implementation plan ออกจากเว็บไซต์

แหล่ง requirement: [Miro — XM-17566](https://miro.com/app/board/uXjVILbgHJU=/?moveToWidget=3458764685180694360&cot=14), [Figma — RM Big Lot](https://www.figma.com/design/zJrcjbA0BDk19HjOAQxb1n/BOF_104_RM_BigLot?node-id=10524-81558), [Figma — Dealer Big Lot](https://www.figma.com/design/G25IC4anVkRLwcXqoThlAx/BOF_105_DealerBigLot?node-id=11553-80045)

## Trigger and preconditions

**Owner service: `order-service` สำหรับคำสั่งลูกค้า; `dealer-core-service` สำหรับคำสั่งจากหน้าจอ Dealer**

- RM/Dealer เลือก Buy หรือ Sell ของคู่สินทรัพย์เดียวกัน และระบุราคา/จำนวน DA
- Big Lot ใช้ `volume_size = bulk`; ฝั่ง White Glove ใช้ channel `WEARE_WEB_BIG_LOT`
- คำสั่งลูกค้ายังต้องผ่านสิทธิ์, account status ตาม side, investor class, product eligibility, เอกสาร และ available balance
- ไม่มีคู่ใน book ต้องไม่ทำให้คำสั่ง Big Lot Limit ใหม่ถูกปฏิเสธเพราะ `No Exact Match Available`
- Max ของ Buy ต้องอ้าง THB ที่จ่ายจริงรวม fee; Max ของ Sell อ้าง DA ที่มีอยู่
- ราคาใส่ได้จำนวนเต็ม 9 หลัก + ทศนิยม 8 หลัก; จำนวน DA ใส่ได้จำนวนเต็ม 9 หลัก + ทศนิยมตาม config ต้องกำหนดขอบเขตมูลค่ารวมให้สอดคล้องกับ DB/decimal ด้วย

## Participating services

| Service | Role |
| :--- | :--- |
| `web-portal` | ฟอร์มราคา/จำนวน, Preview/Copy, Order Book และ Detail ของ RM/Dealer |
| `order-service` | เจ้าของ customer order, eligibility, calculate fee, persistence, webhook และ customer settlement |
| `order-consumer` | Executing service; recheck balance, hold source asset, ส่ง Remarketer และบันทึก response ID |
| `remarketer-core-service` | รับคำสั่งและตัดสิน routing/Limit strategy |
| `remarketer-dealer-adaptor-service` | Executing service; รับ `order.dealer`, เรียก Dealer HTTP API และ inquiry/cancel |
| `dealer-extapi-service` | รับ service-account API `/place-bid`, `/place-ask`, ตรวจ balance และส่ง `order.create` |
| `dealer-core-service` | รับคำสั่งจาก employee UI ผ่าน `/dealer-exchange/place`, แสดง book/history/detail |
| `dealer-exchange-service` | Executing service; บันทึก Dealer order, reserve settlement และส่ง `orderbook.update` |
| `dealer-matching-service` | เจ้าของการจับคู่ใน Dealer book; match, trade transaction และ ledger movement event |
| `remarketer-dealer-orderbook` | Executing service; เก็บ Big Lot book snapshot ใน Redis |
| `remarketer-inquiry-service` | Executing service; รวมผล execution และ callback กลับ customer order |

## End-to-end sequence

### 1. RM กรอกคำสั่งและคำนวณราคา

**Owner service: `order-service`; Executing service: `web-portal` และ `order-service`**

โค้ดปัจจุบันใน `web-portal` ยังเลือก ask/bid ที่จำนวนตรงกับ input แล้วนำราคาจาก book มาคำนวณ Buy เลือกราคาต่ำสุด ส่วน Sell เลือกราคาสูงสุด ถ้าไม่มีคู่ form schema แจ้ง `No Exact Match Available` และ submit ยังกำหนด `orderType: 'market'` ตายตัว

Requirement ใหม่คือ RM กรอกราคาเอง และ calculate fee ได้จากราคา/จำนวนที่กรอกแม้ book ว่าง การเปลี่ยนราคา จำนวน หรือสินทรัพย์ต้องทำให้ผล Preview สอดคล้องกับค่าล่าสุด ทั้งข้อความที่แสดงและ Copy Order ต้องเป็น Limit

### 2. สร้าง customer order และ hold ยอด

**Owner service: `order-service`; Executing service: `order-service` และ `order-consumer`**

`POST /api/v1/white-glove/{identification_id}/order-trade/swap` ตรวจ `CanSwap` แล้วสร้าง `order_trade`, `order_trade_info` และ action flow ใน transaction เปลี่ยน Draft → Open จากนั้นส่ง `create_swap` โดยใช้ OrderRequestID ไป consumer การตอบรับ API สำเร็จยังไม่หมายความว่า match หรือ hold เสร็จแล้ว

`order-consumer.processCreateSwapOrder` อ่าน order, ตรวจยอดซ้ำ, ย้าย source asset จาก AVAILABLE ไป HOLD_IN_ORDER, ส่งคำสั่งไป Remarketer แล้วบันทึก RemarketerOrderID เป็น ResponseTransactionID พร้อมสถานะ Processing

กำหนด `P` เป็นราคาต่อ DA, `U` เป็นจำนวน DA, `V=P×U`, `F=roundDown(V×feeRate/100,2)`:

| ค่า | Buy | Sell |
| :--- | :--- | :--- |
| `from_unit` และ OrderQuantity | `V+F` THB | `U` DA |
| ยอด hold | `V+F` THB | `U` DA |
| quantity ไป remarketer | `V` THB หลังหัก fee; Dealer-tier อาจมี exchange fee เพิ่มตาม route/config | `U` DA |
| estimate received | `U` DA | `V−F` THB |

ตัวอย่าง `P=2,000,000`, `U=0.05`, `F=100`: Buy hold 100,100 THB และส่ง 100,000 THB ไป remarketer ขณะที่ Sell ส่ง 0.05 DA จึงห้ามเทียบ quantity ดิบของ Buy กับ Sell ว่าเท่ากันเพื่อสรุป Exact Match

### 3. Routing ไป Dealer และ API ภายนอก

**Owner service: `remarketer-core-service`; Executing service: `order-service`, `order-consumer`, `remarketer-core-service`, `remarketer-dealer-adaptor-service` และ `dealer-extapi-service`**

เส้นทางสำหรับคำสั่งที่ route ไป Dealer คือ:

```text
order-consumer → remarketer-core-service → Kafka order.dealer
→ remarketer-dealer-adaptor-service
→ dealer-extapi-service POST /api/v1/order-trade/place-bid หรือ /place-ask
→ Kafka order.create → dealer-exchange-service
```

ผู้ใช้ระบุ nonprod base URL เป็น `https://dealerx-extapi-nonprod.xspringas.com` ไม่ได้เรียก deployment นี้ในการตรวจ source

Extapi รับ Limit ได้อยู่แล้ว โดยตรวจ quantity > 0, Limit price > 0 และตรวจ balance ก่อน publish ไม่มีเงื่อนไขว่าต้องพบคู่ใน book Price/Quantity ใน HTTP DTO เป็น string และ service ใช้ decimal

ช่องว่างปัจจุบันที่ทำให้เปลี่ยน frontend เป็น Limit อย่างเดียวยังไม่พอ:

- `order-service.resolveRouteByOrderType` คืน nil สำหรับ Limit เมื่อ IsDealerTrading=false
- `remarketer-core-service.placeOrderByType` ปฏิเสธ Limit ที่ระบุ route=dealer
- เมื่อ route=nil จะขึ้นกับ `IS_NEW_LIMIT_ORDER` และ strategy; generic Limit path รองรับราคา crossing/แบ่งจำนวน ซึ่งไม่ใช่กฎ Big Lot Exact Match

### 4. คำสั่งจากหน้าจอ Dealer และการบรรจบกันของ flow

**Owner service: `dealer-core-service`; Executing service: `web-portal`, `dealer-core-service` และ `dealer-exchange-service`**

```text
Dealer UI → dealer-core-service POST /api/v1/dealer-exchange/place
→ Kafka order.create → dealer-exchange-service บันทึก dealerx.order_trade
→ Kafka orderbook.update → dealer-matching-service
```

Native Dealer ส่ง Limit + bulk อยู่แล้ว เส้นทาง RM ผ่าน extapi กับ Native Dealer ผ่าน core มารวมที่ `dealer-exchange-service` ซึ่งเปลี่ยน event key เป็นคู่ base-quote ก่อนส่งเข้า matching

### 5. Identity และชนิดคู่ค้า

**Owner service: `dealer-extapi-service` และ `dealer-core-service` สำหรับ identity; `dealer-matching-service` สำหรับกฎจับคู่; Executing service: extapi/core/exchange/matching**

Extapi ใช้ JWT service-account ClientID ไปค้น `dealer.ref_id` แล้วใช้ `dealer.id` เป็น DealerID สำหรับตรวจยอดและ order event ส่วน CreatedBy/CreatedByName เป็น ClientID ของ service account ไม่ใช่ชื่อลูกค้า RM Native Dealer ใช้ employee subject หา DealerID อีกเส้นหนึ่ง

ดังนั้นการมี DealerID หรือมี DealerID คนละค่าไม่ใช่หลักฐานว่าเป็น Client ↔ Dealer ต้องแยกประเภทคู่ค้าจาก ID ที่ใช้ settlement และห้ามใช้ข้อความ Placed By เป็นเงื่อนไขธุรกิจ

Consumer ส่ง `client_type` ตาม customer tier ผ่าน remarketer-core ไป adaptor แล้ว แต่ HTTP payload ของ adaptor, extapi request/input, order.create event และ matching model ที่ตรวจยังไม่มี field นี้ ความหมายของ account tier, order origin และประเภทคู่ค้าต้องตกลงก่อนใช้ field เดิมซ้ำ

### 6. Matching และ Order Book

**Owner service: `dealer-matching-service`; Executing service: matching, dealer-exchange, remarketer-dealer-orderbook, remarketer-core และ dealer-core**

พฤติกรรมในโค้ดปัจจุบัน:

| Incoming | ผลจาก Matching |
| :--- | :--- |
| Limit | ลง Order Book โดยยังไม่ลอง match |
| Market/Mixed | เข้า matching; ถ้าไม่พบคู่ finalize เป็น Rejected |
| Bulk Buy query | หา ask ที่ `price×unit` เท่ากับเงิน โดยยังไม่กรอง requested price และชนิดคู่ค้า |
| Bulk Sell query | หา bid ที่ unit เท่ากับจำนวน DA โดยยังไม่กรอง requested price และชนิดคู่ค้า |

Requirement สำหรับ Big Lot Limit คือ pair เดียวกัน, Buy/Sell ตรงข้าม, ราคาเท่ากัน, จำนวน DA เท่ากัน, Client ↔ Dealer และยังพร้อม match เท่านั้น ถ้ามีหลายคู่ให้เลือกคำสั่งที่สร้างก่อนหลังกรองเงื่อนไขครบ ไม่ใช้ better price, partial fill หรือรวมหลาย lot

| ผู้วางก่อน | ผู้วางทีหลัง | ผลเมื่อ P/U ตรงกัน |
| :--- | :--- | :--- |
| RM Buy | Dealer Sell | Full Match |
| RM Sell | Dealer Buy | Full Match |
| Dealer Buy | RM Sell | Full Match |
| Dealer Sell | RM Buy | Full Match |

ถ้าไม่มีคู่ที่เข้าเงื่อนไข คำสั่งใหม่ต้องค้าง Open และปรากฏใน book ทั้งสองฝั่ง

RM อ่าน book ผ่าน order-service → remarketer-core → Redis snapshot ส่วน Dealer อ่านผ่าน dealer-core จาก DB โดยตรงและ endpoint ที่ UI ใช้เป็น GetAll ปัจจุบัน จึงต้องกำหนดขอบเขต Big Lot/normal book และตรวจความสอดคล้องของสอง read paths

Query book ปัจจุบัน join dealer เพื่อแสดง dealer_name ส่วน RM table ยังมี Asset/Price/Amount ต้องแสดง Placed By ของ RM เป็น Relationship Manager โดยไม่เผยข้อมูลลูกค้า `useOrderBookBigLot` ที่ตรวจไม่มี refetchInterval/subscription จึงยังต้องยืนยันการเห็นคำสั่งของอีกฝ่ายขณะเปิดหน้าไว้

### 7. ผลกลับและ Order Detail

**Owner service: `order-service` สำหรับ customer order และ `dealer-core-service` สำหรับ Dealer detail; Executing service: adaptor, remarketer-inquiry, order-service และ web-portal**

Adaptor inquiry อ่านผล execution จาก extapi; remarketer-inquiry รวม trade/exchange transaction แล้ว callback ไป `POST /api/v1/order-trade/webhook` ของ order-service

- Filling callback ใช้ ResponseTransactionID หา order และเปลี่ยน Processing → Filling
- Filled callback บันทึก trade/exchange result, เดิน ledger และ complete เมื่อไม่เหลือ; มี terminal-order guard ใน filled handler
- RM backend มี RequestRateDisplay จากราคาที่ตั้งอยู่แล้ว และ UI แสดงเมื่อ isSwapLimit
- ราคาเฉลี่ยที่ match กับ Request Rate เป็นคนละค่า จึงไม่ควรใช้แทนกัน
- Dealer detail มี Limit Buy/Sell, Big Lot, Filled%, Open/Completed/Cancelled และ Cancel อยู่แล้ว Filled%=executedQuantity/quantity; Open Buy estimate=quantity/price และ Open Sell=quantity×price

## Business rules

| เรื่อง | Requirement หรือข้อเท็จจริง |
| :--- | :--- |
| Exact Match | P และ U เท่ากันเต็มรายการ ทั้งสองทิศทาง |
| Counterparty | Client ↔ Dealer เท่านั้น ไม่จับ Client ↔ Client หรือ Dealer ↔ Dealer แม้คนละบัญชี |
| FIFO | เก่าสุดในกลุ่มที่เข้าเงื่อนไขครบ; แหล่ง timestamp และกรณีเวลาเท่ากันยังต้องตกลง |
| No match | รับคำสั่งและค้าง Open; ไม่ใช้ no-match rejection ของ Market กับ Big Lot Limit |
| Balance | customer hold และ balance ของ dealer ที่ผูก service account เป็นคนละชั้น ต้องถูกต้องทั้งสองชั้น |
| Precision | รักษา P/U ตลอด contract; float64/JavaScript Number อาจเสียทศนิยมในขอบเขต 9+8 |
| DB | migration ของ dealerx ใช้ numeric(34,18); ราคา/unit แต่ละค่ารองรับ 9+8 แต่ผลคูณอาจเกินจำนวนเต็ม 16 หลักของ quantity |

ตัวอย่าง predicate เดิมที่ไม่พอ: Buy ราคา 100 จำนวน 10 มีมูลค่า 1,000 แต่ ask ราคา 200 จำนวน 5 ก็มีมูลค่า 1,000 เช่นกัน; Sell ราคา 100 จำนวน 10 ต้องไม่ match bid ราคา 110 จำนวน 10 ตามกฎ Exact Match นี้

## State transitions

| ช่วง | ปัจจุบัน/ผลที่ต้องการ |
| :--- | :--- |
| customer order รับเข้า | Draft → Open หลัง persist; ยังเป็น asynchronous |
| consumer ส่งสำเร็จ | Processing พร้อม ResponseTransactionID |
| backend execution ยอมรับ | Filling ตาม callback; customer-facing status อาจยังเป็น Open |
| Big Lot Limit ไม่มีคู่ | Requirement: คง Open พร้อม book entry |
| Full Match | Requirement: ทั้งสอง order จบ execution เต็มจำนวน; customer callback settle และแสดง Completed |
| Cancel | เอารายการที่ยังไม่ execute ออกจาก book แล้ว release ยอดตาม lifecycle |
| Reject | ใช้กับ validation/downstream failure; ไม่ใช้เพียงเพราะไม่มี exact counterpart |

## Error and recovery behavior

- Customer balance ไม่พอใน API/consumer ต้องไม่ส่งคำสั่งเกินยอด; hold แล้ว placement ล้มต้องคืนยอด
- Adaptor ปัจจุบันตั้ง ExpireAt ให้ Limit โดย fallback 3 วินาทีเมื่อ config ว่างหรือ parse ไม่ได้ แล้ว inquiry cancel/reject เมื่อหมดเวลา ไม่ใช่ข้อยืนยันว่า deployment จริงใช้ 3 วินาที อายุ Big Lot รอคู่ต้องแยกจาก execution timeout นี้
- Extapi สร้าง UUID ใหม่ต่อ HTTP request; dealer-exchange กัน event ซ้ำด้วย UUID จึงยังไม่ครอบคลุม HTTP retry ที่ใช้ client_order_id เดิมแต่ได้ UUID ใหม่
- Matching อ่าน candidate ก่อน transaction และ GetByID ที่ตรวจไม่มี row lock ขณะที่ Kafka key เป็นคู่เงินช่วย serialize ตาม partition ต้องยืนยันทั้ง concurrency, replay/rebalance และ cancel ชน match
- Immediate Match อาจทำให้ callback มาถึงก่อน consumer บันทึก ResponseTransactionID ต้องมีการตรวจ recovery/retry สำหรับลำดับนี้
- อาการเหล่านี้เป็นประเด็นที่พบจาก static trace ยังไม่ได้ยืนยันการเกิดปัญหาใน runtime

## Final outcomes

Requirement ใหม่ถือว่าสำเร็จเมื่อวาง Limit ได้ทั้งมี/ไม่มีคู่, Full Match ได้ครบสี่ flow, ห้ามจับคู่ฝั่งเดียวกัน, FIFO ถูก, book ทั้งสองฝั่งสอดคล้อง และสถานะ/ledger/detail สะท้อนผลเดียวกัน

ผลตรวจปัจจุบัน: มี source เชื่อม flow หลักครบและ extapi รองรับ Limit อยู่แล้ว แต่ frontend ยังส่ง Market, routing และ matching ยังไม่ตรง requirement, ประเภทคู่ค้ายังไม่ถึง matching และ expiry ยังเป็น execution timeout ข้อมูลที่ยังต้องยืนยันคือ runtime flags, migration ที่ใช้จริง, นิยามประเภทคู่ค้า, อายุคำสั่ง, FIFO timestamp และการรักษาจำนวน DA แบบ exact

## Related shared rules

- [Big Lot](/business-flows/trading/big-lot/)
- [Swap Limit Order](/business-flows/trading/swap-limit-order/)
- [Routing](/business-flows/trading/routing/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)
- [Concurrency and Idempotency](/shared-rules/concurrency-idempotency-payment-systems/)

## Code references

Path อ้างอิงเป็น repo-relative เพื่อเปิดหาใน checkout ของแต่ละโปรเจกต์:

| Repository | Path และจุดตรวจ |
| :--- | :--- |
| web-portal | `src/app/features/white-glove/hooks/big-lot/use-big-lot-form.ts` — schema และเลือกคู่จาก book; `components/big-lot/big-lot-form.tsx` ใน feature เดียวกัน — Market payload; `components/big-lot/preview-biglot-order-modal.tsx` — Preview/Copy |
| web-portal | `src/app/(dealer-flow)/dealer/order-placement/container.tsx` — native Dealer Limit+bulk; `src/app/features/dealer-order-placement/hooks/useOrderDetail.ts` — Detail calculation |
| order-service | `handler/order_trade_dto.go` — float64 input; `handler/white_glove_dto.go` — decimal calculate DTO/route; `pkg/order_trade/service.go` — CanSwap/BigLotSwapCalculate; `pkg/order_trade/swap_service.go` — persistence/route resolver |
| order-consumer | `pkg/digital-asset-order-request/swap.go` — hold/place/client type; `ledger.go` ใน package เดียวกัน — hold OrderQuantity; `internal/domain/order_trade.go` — PlaceBuyQuantity |
| remarketer-core-service | `pkg/order/service.go` — placeOrderByType/ProcessLimit; `pkg/order/service_limit.go` — Limit strategy |
| remarketer-dealer-adaptor-service | `pkg/dealer/service.go` — HTTP mapping; `pkg/dealer/model.go` — payload; `pkg/placeorder/service.go` — ExpireAt; `pkg/inquiry-status/service.go` — cancel expired Limit |
| dealer-extapi-service | `routes/route.go` — place-bid/place-ask; `handler/order_dto.go` — input strings; `pkg/order/service.go` — PlaceBid/PlaceAsk/newOrderCreate/getDealerInfo; `internal/model/order_event.go` — order.create |
| dealer-core-service | `pkg/order/service.go` — PlaceOrderByDealer; `pkg/orderbook/service.go` — DB book read |
| dealer-exchange-service | `pkg/order/service.go` — handlerPlaceOrder, persistence, reserve และ pair-key event |
| dealer-matching-service | `pkg/matching/service.go` — Matching/placeOrderbook/finalize; `storage/postgres/orderbookasksrepository/orderbook_asks_repository.go` และ `storage/postgres/orderbookbidsrepository/orderbook_bids_repository.go` — Bulk predicates |
| remarketer-dealer-orderbook | `pkg/orderbook/service.go` — Big Lot Redis snapshot |
| remarketer-inquiry-service | `pkg/consume_order_status/service.go` — ProcessLimit/ProcessLimitV2; `pkg/order/service.go` และ `pkg/callback/service.go` — customer callback |
| order-service | `pkg/order_trade/webhook_service.go` และ `pkg/order_trade/order_trade_detail.go` — callback/ledger/RequestRateDisplay |
| platform/platform-migration-script | `remarketer_db/schema_dealerx/000004_s251112_v0_dealerx_create_table_order_trade.up.sql` และ `000008_s251119_v0_dealerx_create_table_orderbook_bids.up.sql` ใน directory เดียวกัน — numeric(34,18) และ composite index |

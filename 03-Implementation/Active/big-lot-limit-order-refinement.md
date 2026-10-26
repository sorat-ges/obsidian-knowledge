---
title: Big Lot Limit Order — Code Refinement
tags: [implementation, refinement, XM-17566, big-lot, limit-order, remarketer]
status: active
last-updated: 2026-10-25
lastUpdated: 2026-10-25
documentType: implementation-plan
---

หน้าอ่านบนเว็บไซต์: [Big Lot Limit Order](../../src/content/docs/business-flows/trading/big-lot-limit-order.md) — route `/business-flows/trading/big-lot-limit-order/`

เอกสารนี้เป็น refinement จาก source code และ requirement ยังไม่ได้ implement feature หรือยืนยัน runtime ผลตรวจและแผนงานเก็บไว้นอก published source ตาม Maintaining Documentation

# Big Lot Limit Order — refinement จากโค้ด

ตรวจวันที่ 25 ตุลาคม 2026 จาก working copy ของ order-service, order-consumer, remarketer (รวม dealer-extapi-service ที่ผู้ใช้ระบุเพิ่ม), web-portal และ platform/platform-migration-script

เป็น static code trace: ยังไม่ได้แก้ production code, รันระบบ, ยิง API หรือรัน test suite ข้อสรุปเรื่อง deployment/config ระบุแยกจากพฤติกรรมที่อ่านได้จากโค้ด

## 1. Flow ที่ตามได้

RM:

1. web-portal: BigLotForm → PreviewBigLotOrderModal → useBigLotOrder → BFF white-glove swap
2. order-service: CreateWhiteGloveOrderSwap → CanSwap → MakeSwapOrderRequest → createOrderRequest
3. บันทึก order_trade, action flow, order_trade_info; เปลี่ยน Draft → Open; publish create_swap โดยส่ง OrderRequestID
4. order-consumer: Consume → processCreateSwapOrder → ตรวจ balance → hold ยอด → placeOrderToRemarketer → บันทึก RemarketerOrderID และ Processing
5. remarketer-core-service: PlaceOrder → prepare → placeOrderByType
6. เมื่อ route ไป dealer: order.dealer → remarketer-dealer-adaptor-service → dealer-extapi-service: HTTP /api/v1/order-trade/place-bid หรือ place-ask; ผู้ใช้ยืนยัน nonprod base URL เป็น https://dealerx-extapi-nonprod.xspringas.com (ยังไม่ได้เรียก deployment นี้)
7. dealer-extapi-service ตรวจ request/balance → map service-account ClientID เป็น DealerID → publish order.create ไป TopicDealerOrderPlace → dealer-exchange-service บันทึก dealerx.order_trade → publish orderbook.update
8. dealer-matching-service รับ orderbook.update ผ่าน Kafka และเรียก Matching; จุดนี้เป็นจุดที่ flow RM และ native Dealer มาบรรจบกัน
9. ผลจาก Dealer ถูก inquiry โดย adaptor → remarketer-inquiry-service → callback /api/v1/order-trade/webhook ของ order-service → transaction/ledger/status → Order Detail

Dealer จากหน้าจอ:

1. web-portal dealer container ส่ง Limit + bulk ผ่าน BFF
2. dealer-core-service: POST /api/v1/dealer-exchange/place → PlaceOrder → PlaceOrderByDealer → ตรวจ balance → publish create order
3. dealer-exchange-service: handlerPlaceOrder → บันทึก order_trade → publish orderbook.update โดย key เป็น base-quote
4. dealer-matching-service: Matching → ลง book หรือ match ตาม order_type

หลักฐาน: RM submit — `web-portal/src/app/features/white-glove/components/big-lot/big-lot-form.tsx:61`, Dealer submit — `web-portal/src/app/(dealer-flow`/dealer/order-placement/container.tsx:108), Dealer create — `remarketer/dealer-core-service/pkg/order/service.go:65`, Extapi routes — `remarketer/dealer-extapi-service/routes/route.go:59`, Extapi publish — `remarketer/dealer-extapi-service/pkg/order/service.go:188`, Dealer persist/publish — `remarketer/dealer-exchange-service/pkg/order/service.go:118`

## 2. RM ปัจจุบันเป็น Market และพึ่ง Order Book เพื่อสร้างราคา

ข้อเท็จจริง:

- BigLotForm ส่ง orderType: 'market' ตายตัว
- useBigLotForm ยังไม่มี field ราคาที่ผู้ใช้กรอกใน BigLotFormValues
- Buy: เลือก ask ที่ symbol/จำนวนตรงกัน แล้วเลือกราคาต่ำสุด
- Sell: เลือก bid ที่ symbol/จำนวนตรงกัน แล้วเลือกราคาสูงสุด
- จากนั้นจึงใช้ราคาใน book เรียก calculateFee
- ถ้าไม่พบรายการ: matchOrderBook=false; form schema เพิ่ม No Exact Match Available

งานที่ต้องทำ:

- เพิ่มราคา Limit ที่ผู้ใช้กำหนด พร้อม validation 9 หลัก + 8 ทศนิยม
- คำนวณ fee/ยอดจ่าย/ยอดรับจาก symbol + ราคา + จำนวนที่ผู้ใช้กรอก แม้ book ว่าง
- เอาเงื่อนไขว่าต้องพบคู่ใน book ออกจากการอนุญาต submit
- ส่ง Limit ผ่าน Preview/Confirm จริง และแก้ Copy Order ทั้งภาษาไทย/อังกฤษ
- เปลี่ยน debounce/dependency ให้คำนวณใหม่ทั้งเมื่อราคาและจำนวนเปลี่ยน ป้องกันใช้ผลคำนวณเก่าหลังเปลี่ยนค่า
- ยังคงตรวจ balance, product eligibility และสิทธิ์การวางคำสั่ง

หลักฐาน: Form/schema — `web-portal/src/app/features/white-glove/hooks/big-lot/use-big-lot-form.ts:43`, เลือกคู่เพื่อคำนวณ — `web-portal/src/app/features/white-glove/hooks/big-lot/use-big-lot-form.ts:260`, Preview payload — `web-portal/src/app/features/white-glove/components/big-lot/preview-biglot-order-modal.tsx:80`

## 3. หน่วย Amount, fee และยอด hold

กำหนด P=ราคาต่อ DA, U=จำนวน DA, V=P×U, F=fee

BigLotSwapCalculate ปัจจุบัน:

- fee = roundDown(V × feeRate / 100, 2)
- Buy: fiatAmount=V+F, unitAmount=U
- Sell: fiatAmount=V−F, unitAmount=U

Preview ส่ง:

| Field | Buy | Sell |
|---|---|---|
| from_symbol | THB | DA |
| from_unit | V+F | U |
| to_symbol | DA | THB |
| estimate_received_quantity | U | V−F |
| price | P | P |

order-service บันทึก OrderQuantity จาก FromUnit และกรณี bulk ไม่ round OrderQuantity ตาม decimal ของสินทรัพย์ต้นทาง

order-consumer hold OrderQuantity ทั้งจำนวนในสินทรัพย์ต้นทาง แล้ว Buy ผ่าน PlaceBuyQuantity: bulk คืน OrderQuantity−FeeAmount; อาจหัก ExchangeFee เพิ่มสำหรับ customer tier Dealer ตาม route/config ส่วน Sell ส่ง OrderQuantity ตรง

ผล: matching input.Quantity เป็นเงินสำหรับ Buy และจำนวน DA สำหรับ Sell ห้ามเทียบ input.Quantity ของสองฝั่งตรงๆ ว่าเท่ากัน

ข้อเสนอเพื่อ refinement: กำหนดค่าหลักของ Exact Match ให้ชัดเป็น P และ U; ตรวจว่าจะแยกเก็บ/ส่ง requested base quantity หรือคำนวณคืนจากเงินอย่างไร โดยเฉพาะทศนิยมและ fee อย่าเปลี่ยน OrderQuantity ให้เป็น DA ทุกฝั่งโดยตรง เพราะจะกระทบ hold, settlement และ filled %

ตัวอย่างเพื่อออกแบบ test: P=2,000,000; U=0.05; V=100,000; F=100 → Buy from_unit=100,100; hold=100,100 THB; ส่งไป remarketer=100,000 THB; ฝั่ง Sell ส่ง 0.05 DA

หลักฐาน: Calculation — `order-service/pkg/order_trade/service.go:2167`, Persist — `order-service/pkg/order_trade/swap_service.go:218`, Hold — `order-consumer/pkg/digital-asset-order-request/ledger.go:15`, Buy quantity — `order-consumer/internal/domain/order_trade.go:339`, Consumer dispatch — `order-consumer/pkg/digital-asset-order-request/swap.go:202`

## 4. การวาง Limit ของ RM ยังติดเรื่อง routing

- Calculate response คืน route=dealer
- resolveRouteByOrderType ของ order-service คืน nil เมื่อ order_type=limit และ IsDealerTrading=false
- IsDealerTrading มาจาก permission WHITE_GLOVE_TRADING_DEALER_EXECUTE ของผู้ส่งคำสั่ง
- remarketer-core-service placeOrderByType ปฏิเสธ Limit เมื่อ route=dealer
- ถ้า route=nil: เมื่อ IS_NEW_LIMIT_ORDER เปิด จะเลือก best route จาก strategy; เมื่อปิดจะ save Limit ไว้ตาม legacy flow
- legacy ProcessLimit ใช้ generic order book/ราคา crossing และแบ่งจำนวนได้ จึงไม่เท่ากับกฎ Big Lot Exact Match

ต้องมีเส้นทาง bulk+limit ไป book/matching ของ Big Lot โดยเฉพาะ และคง normal Limit/Market เดิมไว้ ต้องทดสอบทั้งกรณี route ถูกระบุและไม่ระบุ รวม flag ที่ใช้จริง

หลักฐาน: Calculate route — `order-service/handler/white_glove_dto.go:578`, Route resolver — `order-service/pkg/order_trade/swap_service.go:354`, Core dispatch — `remarketer/remarketer-core-service/pkg/order/service.go:412`, Limit route selection — `remarketer/remarketer-core-service/pkg/order/service_limit.go:44`

## 5. client_type หายที่ HTTP ไป Dealer

- order-consumer แยก dealer/retail จาก customer tier ไม่ใช่ role RM ของผู้ใช้ UI
- ส่ง client_type ผ่าน remarketer-core และ Kafka ไป adaptor
- adaptor เก็บ client_type ใน status/inquiry events แต่ PlaceOrderRequest/PlaceOrderPayload ที่ส่ง HTTP ไป Dealer ไม่มี field นี้
- dealer-exchange order model และ dealer-matching OrderbookInput/OrderTrade ที่ตรวจไม่มี client_type
- matching และ ledger ปัจจุบันอ้าง DealerID ของทั้งสองฝั่ง
- ตรวจ dealer-extapi-service เพิ่มแล้ว: PlaceOrderRequest, PlaceBidAskInput และ OrderCreateData ไม่มี client_type เช่นกัน จึงยืนยันช่องว่าง contract ข้าม HTTP/event ได้ครบ
- extapi ใช้ JWT claims.ClientID → dealer.ref_id → dealer.id สำหรับ CheckBalance และ event.DealerId; CreatedBy/CreatedByName ตั้งเป็น ClientID ของ service account ไม่ใช่ชื่อลูกค้า RM
- native Dealer เข้าทาง dealer-core ซึ่ง map employee subject เป็น dealer อีกเส้นหนึ่ง จึงไม่สามารถใช้เพียงการมี DealerID หรือ DealerID ต่างกัน เป็นกฎ Client ↔ Dealer ได้

ต้องกำหนดชนิดคู่ค้า Client/Dealer ที่เชื่อถือได้จาก server แล้วส่ง/เก็บครบถึง matching และ order book ห้ามใช้ชื่อ Placed By เป็นเงื่อนไขธุรกิจ และไม่ควรแก้ด้วยการลบ DealerID ของ Client เพราะ CheckBalance/reserve/settlement ปัจจุบันยังอาศัย ID นี้ ต้องตกลงว่าประเภทคู่ค้าอิง account tier, origin ของ order หรือ metadata ที่ผ่านการตรวจจากผู้เรียก; client_type เดิมมีไว้แยก routing/fee ด้วย จึงต้องยืนยันความหมายก่อนใช้ซ้ำ

หลักฐาน: Client type mapping — `order-consumer/pkg/digital-asset-order-request/swap.go:271`, Adaptor HTTP mapping — `remarketer/remarketer-dealer-adaptor-service/pkg/dealer/service.go:63`, HTTP DTO — `remarketer/remarketer-dealer-adaptor-service/pkg/dealer/model.go:23`, Extapi input — `remarketer/dealer-extapi-service/handler/order_dto.go:9`, Extapi identity — `remarketer/dealer-extapi-service/pkg/order/service.go:246`, Matching DTO — `remarketer/dealer-matching-service/pkg/matching/input.go:8`

รายละเอียด extapi เพิ่มเติม:

- รองรับ order_type=limit อยู่แล้ว; handler ตรวจ quantity > 0 และ Limit ต้อง price > 0; service ตรวจ Limit price > 0 ซ้ำ จึงไม่ต้องสร้าง endpoint Limit ใหม่
- Price/Quantity ของ HTTP request ใช้ string และใน service เป็น shopspring decimal จึงรักษาค่าทศนิยมได้เมื่อมาถึงชั้นนี้แล้ว แต่ค่าที่สูญหายจาก frontend/DTO ต้นทางเรียกคืนไม่ได้
- extapi ไม่ lookup Order Book เพื่อบังคับว่าต้องมีคู่ก่อนรับคำสั่ง; ตรวจ balance แล้ว publish event
- CheckBalance ใช้บัญชี dealer ที่ผูก service account ซึ่งเป็นคนละชั้นกับ hold เงินลูกค้าใน order-consumer ต้องทดสอบทั้งสองฝั่ง

## 6. Matching ต้องเปลี่ยน lifecycle

Matching ปัจจุบัน:

- limit → placeOrderbook เท่านั้น ไม่มีการลอง match
- market/mixed → matchOrderbook
- match ไม่ได้ → finalizeBuyOrder/finalizeSellOrder เปลี่ยนเป็น REJECTED
- placeOrderbook Buy แปลงเงินเป็น DA ด้วย Quantity.Div(Price); Sell ใช้ Quantity ตรง

ดังนั้นการเปลี่ยน RM เป็น limit อย่างเดียวทำให้ทั้ง RM และ Dealer ลง book โดยไม่เกิดการจับคู่จาก branch นี้

สำหรับ bulk+limit ต้อง:

1. ค้นหาคู่ต่าง Buy/Sell, pair เดียวกัน, ราคาเท่ากัน, จำนวน DA เท่ากัน, ต่าง Client/Dealer, สถานะพร้อม match
2. เลือกคำสั่งเก่าสุดในกลุ่มที่เข้าเงื่อนไขทั้งหมด
3. มีคู่ → Full Match ครั้งเดียว; อัปเดต maker/taker และนำรายการที่ match ออกจาก book
4. ไม่มีคู่ → คง Open และเพิ่มคำสั่งใหม่ใน book
5. ไม่รวมหลายรายการ ไม่ partial ไม่ใช้ better price

ห้ามเปลี่ยน no-match ของ Market ทั้งระบบเป็น Open โดยไม่มีเงื่อนไข bulk+limit

หลักฐาน: Dispatch — `remarketer/dealer-matching-service/pkg/matching/service.go:137`, Insert book — `remarketer/dealer-matching-service/pkg/matching/service.go:273`, No match Buy — `remarketer/dealer-matching-service/pkg/matching/service.go:767`, No match Sell — `remarketer/dealer-matching-service/pkg/matching/service.go:842`

## 7. Query Big Lot ปัจจุบันยังไม่ใช่ Exact Match

| ฝั่ง incoming | เงื่อนไขเดิม |
|---|---|
| Buy | pair ตรง, ask.price×ask.unit = incoming เงิน, bulk, เรียงราคาแล้วเวลา, Limit(1) |
| Sell | pair ตรง, bid.unit = incoming จำนวน DA, bulk, เรียงราคาแล้วเวลา, Limit(1) |

ทั้งสอง query ยังไม่กรอง requested price และชนิดคู่ค้า

ตัวอย่าง Buy: order ต้องการราคา 100 จำนวน 10 → เงิน 1,000; ask ราคา 200 จำนวน 5 ก็ผ่าน predicate มูลค่ารวมเดิม ทั้งที่ไม่ใช่ exact price/amount

ตัวอย่าง Sell: ต้องการราคา 100 จำนวน 10; bid ราคา 110 จำนวน 10 ผ่าน predicate จำนวนเดิม ทั้งที่ AC ไม่ให้ใช้ better price

ต้องกรองเงื่อนไขทั้งหมดก่อน Limit(1) มิฉะนั้นรายการเก่าสุดที่เป็นฝั่งเดียวกันอาจบังคู่ที่ถูกต้องซึ่งอยู่ถัดไป

หลักฐาน: Ask query — `remarketer/dealer-matching-service/storage/postgres/orderbookasksrepository/orderbook_asks_repository.go:66`, Bid query — `remarketer/dealer-matching-service/storage/postgres/orderbookbidsrepository/orderbook_bids_repository.go:62`

## 8. Limit ผ่าน adaptor มี timeout สั้น

- produceOrderInquiryEvent สร้าง ExpireAt จาก getLimitOrderExpireSecond
- fallback เมื่อ config ว่าง/parse ไม่ได้คือ 3 วินาที
- handleExpiredLimitOrder ตรวจ order_type=limit แล้ว cancel หลัง expiry และ produce rejected/order expired

เป็นพฤติกรรมตาม code path นี้ ไม่ใช่ข้อยืนยันว่า production ใช้ค่า 3 วินาทีจริง

ต้องแยกอายุ Big Lot ที่ต้องรอคู่จาก Limit ที่ใช้ยิง execution ไป exchange และตรวจ inquiry event model เพื่อให้มีข้อมูลระบุ bulk เพียงพอ ห้ามแก้ timeout global โดยไม่พิจารณาคำสั่งชนิดเดิม

หลักฐาน: Fallback — `remarketer/remarketer-dealer-adaptor-service/pkg/placeorder/service.go:139`, ExpireAt — `remarketer/remarketer-dealer-adaptor-service/pkg/placeorder/service.go:163`, Cancel expired — `remarketer/remarketer-dealer-adaptor-service/pkg/inquiry-status/service.go:109`

## 9. Order Book และ Placed By

RM อ่านผ่าน order-service → remarketer-core → Redis BIGLOT#ORDERBOOK#... ซึ่งมาจาก matching → remarketer-dealer-orderbook

Dealer UI อ่าน BFF /dealer/order-placement/orderbook → dealer-core /dealer-exchange/orderbook ซึ่งอ่าน DB โดยตรง และปัจจุบันเป็น GetAll ไม่ใช่ GetOrderbookBiglot

จึงเป็นคนละ read path ต้องกำหนดขอบเขตว่าความเหมือนหมายถึงรายการ Big Lot ในส่วนใด รวมการ filter Retail และระยะเวลาที่ข้อมูลควรอัปเดต

- query book ใช้ INNER JOIN dealer และแสดง dealer_name
- matching output, Redis model, API และ frontend มี field dealer สำหรับชื่อ แต่ไม่มีชนิดผู้วางที่ใช้แยก RM
- RM table ปัจจุบันมี Asset/Price/Amount ยังไม่ render Placed By แม้ transform มี dealer
- RM useOrderBookBigLot ที่ตรวจไม่มี refetchInterval/subscription; ต้องตรวจ refresh behavior ระหว่างอีกฝ่ายวางคำสั่งขณะหน้าจอเปิดอยู่

ต้องอัปเดตการแสดง Relationship Manager โดยอิงประเภทคู่ค้า ไม่เผยชื่อหรือข้อมูลลูกค้า และรักษารายการแต่ละ lot ไม่ aggregate จนจับคู่จำนวนผิด

หลักฐาน: RM table — `web-portal/src/app/features/white-glove/components/big-lot/orderbook-big-lot-table.tsx:27`, RM query — `web-portal/src/app/features/white-glove/hooks/big-lot/use-orderbook-big-lot.ts:5`, Dealer BFF — `web-portal/src/app/api/dealer/order-placement/orderbook/route.ts:4`, Dealer book — `remarketer/dealer-core-service/pkg/orderbook/service.go:107`

## 10. Order Detail มีของเดิมใช้ได้มาก

RM:

- API มี RequestRateDisplay จาก order.Price อยู่แล้ว
- UI SwapOrderHistoryDetail มีเงื่อนไข isSwapLimit เพื่อแสดง Request Rate อยู่แล้ว
- backend แยก Rate/RateDisplay จากราคา match กับ RequestRateDisplay จากราคาตั้งไว้แล้ว
- ไม่จำเป็นต้องเพิ่ม field Request Rate ใหม่ทันที ต้องตรวจ layout/format ตาม Figma และ Big Lot condition

Dealer:

- มี Limit Order, Limit Buy/Sell, Big Lot, status, Filled%, Cancel และ computeOrderDetail อยู่แล้ว
- Filled% คำนวณ executedQuantity/quantity
- Open Buy ยอดคาดว่าจะรับ=quantity/price; Open Sell=quantity×price; หลังไม่ใช่ Open ใช้ receivedQuantity
- ควรจำกัด design change ตาม Big Lot หากไม่ได้ขอเปลี่ยน Retail

ผลกลับ RM:

- order-consumer บันทึก ResponseTransactionID หลัง HTTP ไป remarketer สำเร็จ
- webhook lookup ด้วย ResponseTransactionID; filling ทำ Processing → Filling; filled ทำ transaction/ledger/complete และ ignore order ที่ terminal แล้ว
- เมื่อเพิ่ม immediate matching ต้องทดสอบ callback มาถึงก่อน consumer บันทึก ResponseTransactionID และกำหนด retry/recovery

หลักฐาน: RM output — `order-service/pkg/order_trade/order_trade_detail.go:242`, RM UI — `web-portal/src/app/features/white-glove/components/swap/swap-order-history-detail/index.tsx:174`, Dealer calculation — `web-portal/src/app/features/dealer-order-placement/hooks/useOrderDetail.ts:11`, Webhook — `order-service/pkg/order_trade/webhook_service.go:33`

## 11. Precision และความปลอดภัยต่อการจับคู่ซ้ำ

Precision:

- Create swap DTO ใช้ float64 และ frontend ใช้ Number/parseFloat หลายจุด แม้ calculate DTO ใช้ decimal
- 9 หลัก + 8 decimals อาจเกิน precision ของ float64/JavaScript Number เช่น 999999999.12345678 ถูกแทนเป็น 999999999.1234568
- ต้องคงค่าราคา/จำนวนแบบ decimal string หรือ representation ที่รักษาความแม่นยำตลอด contract
- พบ migration ใน platform/platform-migration-script แล้ว: dealerx.order_trade และ orderbook ใช้ numeric(34,18) รองรับจำนวนเต็ม 16 หลักและทศนิยม 18 หลัก; price/unit แต่ละค่ารองรับขอบเขต 9+8 ได้ แต่ผลคูณราคา×จำนวนที่ต่างมีจำนวนเต็ม 9 หลักอาจเกินจำนวนเต็ม 16 หลักของ quantity ต้องกำหนดขอบเขต notional และตรวจความจุของ decimal library ด้วย
- book มี composite index (base_symbol, quote_symbol, price, unit, created_at) อยู่แล้ว ไม่ควรเสนอสร้าง index ชุดเดียวกันซ้ำ ต้องตรวจ query plan หลังเพิ่ม filter ชนิดคู่ค้า; ใน migration book ที่ตรวจมี PK(id) แต่ยังไม่พบ unique(order_trade_id)
- ยังไม่ได้เทียบ migration history นี้กับ schema ใน environment จริง

Concurrency/replay:

- matching อ่าน candidate และ incoming order ก่อนเริ่ม transaction; GetByID ที่ตรวจไม่มี row lock
- producer ส่ง key เป็นคู่เงิน และ consumer เรียก handler ตามลำดับใน loop จึงมีการ serialize ระดับ Kafka partition อยู่แล้ว ต้องรักษาคุณสมบัตินี้
- อย่างไรก็ตาม transaction เพียงอย่างเดียวไม่ยืนยันว่าทน replay/rebalance/retry: placeOrderbook สร้าง book ID ใหม่ และ processCreateSwapOrder ยังไม่เห็น guard สถานะก่อน hold/send ใน method นี้
- extapi newOrderCreate สร้าง UUID ใหม่ทุกครั้ง และยังไม่เห็น lookup client_order_id ก่อน publish; dealer-exchange dedup ด้วย event.id ดังนั้น replay event UUID เดิมกับ HTTP retry client_order_id เดิมเป็นคนละกรณี ต้องเพิ่มกรณีทดสอบ HTTP timeout หลัง broker รับ event แล้วด้วย
- ต้องออกแบบ/ตรวจ idempotency ของ incoming order, book insert, match, ledger event และ cancel ร่วมกัน รวมทั้งห้ามสอง Limit เข้าพร้อมกันแล้วต่างฝ่ายต่างลง book โดยไม่ match
- ข้อเหล่านี้เป็นความเสี่ยงจาก static trace ยังไม่ได้พิสูจน์ว่าเกิดซ้ำจริงใน runtime

หลักฐาน: Float DTO — `order-service/handler/order_trade_dto.go:102`, Match transaction boundary — `remarketer/dealer-matching-service/pkg/matching/service.go:409`, Pair key — `remarketer/dealer-exchange-service/pkg/order/service.go:263`, Consumer create — `order-consumer/pkg/digital-asset-order-request/swap.go:28`, Order schema — `platform/platform-migration-script/remarketer_db/schema_dealerx/000004_s251112_v0_dealerx_create_table_order_trade.up.sql:9`, Book schema/index — `platform/platform-migration-script/remarketer_db/schema_dealerx/000008_s251119_v0_dealerx_create_table_orderbook_bids.up.sql:5`

## 12. งานที่แนะนำให้แตกหลังปิด contract

| งาน | โปรเจกต์/ขอบเขต | ผลที่ต้องยืนยัน |
|---|---|---|
| A: ปิด API/ข้อมูล | order-service, consumer, core, adaptor, dealer-extapi, dealer-exchange | ราคา/DA amount, ประเภทคู่ค้า, route, expiry, ID mapping ไปครบ |
| B: RM Limit entry | web-portal white-glove | กรอกราคาเอง, คำนวณเมื่อ book ว่าง, Limit payload, Preview/Copy, balance/Max |
| C: Backend placement | order-service, order-consumer, remarketer-core | bulk+limit ไป book ที่ถูกต้อง; hold/fee ไม่ผิด; normal Limit ไม่เปลี่ยน |
| D: Dealer API/adaptor | remarketer-dealer-adaptor, dealer-extapi | ขยาย request/input/event ให้ส่งประเภทคู่ค้า, รักษา DealerID ของ settlement, ไม่ expire Big Lot แบบ execution timeout, HTTP retry ไม่สร้างซ้ำ |
| E: Exact matching | dealer-exchange, dealer-matching, schema ที่จำเป็น | Full Match P/U ต่างคู่ค้า FIFO; no match ค้าง Open; atomic/replay-safe |
| F: Shared book | matching, dealer-orderbook, core, order-service, dealer-core, web-portal | RM/Dealer เห็น Big Lot ตรงกัน; Placed By ถูก; match/cancel เอาออก |
| G: Detail/status/settlement | web-portal, inquiry, order-service และ ledger ตามผลกระทบจริง | Request Rate, 0/100% filled, Open/Completed/Cancelled, ledger reconcile |

งาน frontend ไม่ได้จำเป็นต้องเขียน Detail ใหม่ทั้งหมด เพราะมี logic เดิมหลายส่วน ขณะที่ matching และ contract ข้าม service เป็นงานหลักที่ต้องประเมินแยก

## 13. Test matrix ที่ต้องเพิ่ม/ปรับ

- RM Buy ก่อน Dealer Sell; RM Sell ก่อน Dealer Buy; Dealer Buy ก่อน RM Sell; Dealer Sell ก่อน RM Buy
- คู่ถูกต้อง match ทันที; ไม่มีคู่ลง book และค้างเกิน execution timeout เดิมได้
- ราคาเท่า/จำนวนเท่าเท่านั้น; ราคา better ไม่ match; มูลค่ารวมเท่าแต่ P/U ต่างไม่ match
- จำนวนมาก/น้อยกว่าไม่ partial และไม่รวมหลาย lot
- Client-Client และ Dealer-Dealer ไม่ match แม้เป็นคนละบัญชี
- candidate แรกเป็นประเภทคู่ค้าที่ห้าม แต่ candidate ถัดไปใช้ได้ → ต้องเลือกตัวที่ใช้ได้
- หลาย exact candidates เลือกเก่าสุด และมีลำดับแน่นอนเมื่อ timestamp เท่ากัน
- Buy fee/hold และ Sell amount/receive ถูกต้อง; ทศนิยมเต็มขอบเขต; balance ไม่พอ
- event ซ้ำ, callback ซ้ำ, callback เร็ว, restart/rebalance, cancel ชน match
- RM/Dealer book สอดคล้อง; Open/Completed/Cancelled detail แสดงค่าถูก
- regression normal Market, normal Limit, mixed route และ Retail order book

Unit tests ต้อง run ตาม make test ของ Go project; mocks อัปเดตผ่าน make mock เท่านั้น ส่วน web-portal ใช้ pnpm lint/pnpm test ตามกฎโปรเจกต์

## 14. ข้อมูลที่ยังต้องยืนยันก่อนออกแบบ implementation สุดท้าย

1. ตัวรับ HTTP พบและอ่านแล้วคือ dealer-extapi-service ตาม path ที่ผู้ใช้ระบุ ไม่ต้องหา repo นี้เพิ่ม; nonprod base URL ผู้ใช้ให้คือ https://dealerx-extapi-nonprod.xspringas.com ยังไม่ได้ทดสอบ network/deployment
2. ค่าที่ใช้จริงของ IS_NEW_LIMIT_ORDER และ DEALER_ORDER_LIMIT_SET_EXPIRE โดยไม่ต้องส่ง credentials
3. ยืนยันว่า schema ใน environment จริงตรงกับ migration ที่พบใน platform/platform-migration-script; ฝั่ง source model และ migration dealerx ที่ตรวจยังไม่พบ client_type จึงต้องประเมินการเพิ่ม field/contract สำหรับชนิดคู่ค้า
4. ตกลงอายุคำสั่ง, นิยาม FIFO time, การคำนวณจำนวน DA ที่ใช้ Exact Match, scope Retail และแหล่งกำหนด Client/Dealer ที่เชื่อถือได้โดยแยกจาก DealerID ของ settlement

ขณะนี้มี source ที่เชื่อมเส้นทางหลักครบทั้ง RM และ native Dealer แล้ว: extapi/core → order.create → dealer-exchange → orderbook.update → dealer-matching ส่วน frontend อยู่ใน ../web-portal และอ่านได้แล้ว ความถูกต้องใน environment จริงต้องตรวจ config/topic/schema และ runtime อีกขั้น

หลักฐาน: Matching entrypoint — `remarketer/dealer-matching-service/cmd/main.go:97`, Dealer HTTP constants — `remarketer/remarketer-dealer-adaptor-service/pkg/dealer/constant.go:3`, Extapi routes — `remarketer/dealer-extapi-service/routes/route.go:59`, Consumer order.create — `remarketer/dealer-exchange-service/cmd/worker/main.go:130`

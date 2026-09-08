---
title: Big Lot
description: Flow ซื้อขายสินทรัพย์ล็อตใหญ่ผ่าน White Glove ตั้งแต่เลือก order book, คำนวณ fee, สร้าง order, hold balance, ส่ง Remarketer และ settle ledger
capability: Trading
services: [order-service, order-consumer, web-portal]
aliases: [big lot, biglot, bulk order, white glove, customer status, customer_status, dealer route, WEARE_WEB_BIG_LOT, white glove trading account context, big lot account freeze, suspended big lot sell, ซื้อขายล็อตใหญ่, คำสั่งบิ๊กล็อต, สถานะลูกค้า, Big Lot เมื่อระงับบัญชี]
integrations: [Remarketer, kafka]
errorCodes: ["60002", "80002", "80006"]
status: active
lastUpdated: 2026-09-08
documentType: flow
---

## Purpose and scope

Big Lot เป็น White Glove swap ที่เจ้าหน้าที่ RM หรือ Dealer ดำเนินการแทนลูกค้า โดยเลือก quantity ที่ตรงกับ Big Lot order book, คำนวณค่าธรรมเนียมด้วย `volume_size = bulk`, สร้าง order ใน `order-service` แล้วให้ `order-consumer` hold balance และส่งคำสั่งไป Remarketer แบบ asynchronous ก่อน `order-service` รับ webhook เพื่อบันทึกผลและ settle ledger

![Big Lot flow](/assets/FlowBiglot.png)

## Trigger and preconditions

**Owner service: `order-service`**

- Endpoint White Glove ใช้ employee authentication และ API-key permission แยกตาม action
- การสร้าง order ต้องมี permission `white_glove:trading:rm_execute` หรือ `white_glove:trading:dealer_execute`
- Digital Asset account status ต้องอนุญาต side: `active` อนุญาต BUY/SELL, `suspended` อนุญาตเฉพาะ SELL (`swap_sell`), `closed`/`freeze` ไม่อนุญาตทั้งสอง side; status failure ใช้ `60002`
- Side ต้องเป็น `buy` หรือ `sell`
- Customer ต้องมี investor class ที่ถูกต้อง, คู่สินทรัพย์ต้อง swap ได้, เอกสารที่เกี่ยวข้องต้องไม่หมดอายุ และ product ทั้งสองฝั่งต้อง tradable/on-shelf สำหรับ channel `WEARE_WEB_BIG_LOT`
- Request ที่มี `volume_size = bulk` ถูกจัดเป็น Big Lot และ Backend ตั้ง channel เป็น `WEARE_WEB_BIG_LOT`
- Big Lot product list เลือกเฉพาะ Digital Asset ที่อยู่ใน sale channel นี้, ผ่าน investor-class filter และมี trade pair กับ THB
- White Glove customer picker ใช้ `order-service` query customer/account ที่ตัด identification status `onboarding`, `rejected`, `closed` และตัดเฉพาะ digital-asset account status `closed`; status อื่นอาจอยู่ในรายการก่อน create path ตรวจ side-specific account gate

## Participating services

| Service/Integration | Role |
| :--- | :--- |
| `order-service` | Business owner; expose product/order-book/calculate/create APIs, validate eligibility, persist order, publish event, process Remarketer webhook และ settle ledger |
| `order-consumer` | Executing service ของ asynchronous create; recheck balance, move asset to `HOLD_IN_ORDER`, place order to Remarketer และเปลี่ยน order เป็น `processing` หรือ `rejected` |
| Remarketer | ให้ Big Lot order book, รับคำสั่ง trade และส่ง callback สถานะ/ผลการ match |
| kafka | ส่ง `CreateOrderSwap` จาก `order-service` ไป `order-consumer` และส่ง logical-ledger movement ไป downstream |

`order-consumer` เป็น executor ของ async step ไม่ใช่ Business owner

## End-to-end sequence

### White Glove customer and account context

**Owner and executing service: `order-service`**

`GET /api/v1/white-glove/customers` ใช้สำหรับเลือก customer ก่อนเข้า product หรือ order flow โดย query ปัจจุบันตัด identification ที่เป็น `onboarding`, `rejected` หรือ `closed` และต้องมี Digital Asset account ที่ status ไม่ใช่ `closed`

`web-portal` แสดง `customer_status` จาก response เดียวกันเป็น Customer Status badge; ถ้าค่าไม่มีจะ map เป็น `-` การแสดงผลนี้เป็น supporting UI และไม่เพิ่ม/ลด customer eligibility หรือแทน status gate ของ `order-service`

หลังเลือก customer แล้ว `GET /api/v1/white-glove/{identification_id}/customer/accounts` เป็นคนละ read path สำหรับ trading context: `order-service` อ่าน Digital Asset accounts โดยไม่มี status predicate, เลือก dealer-tier account ที่ผูกกับ IC license เมื่อเข้าเงื่อนไข หรือเลือก account แรกเมื่อเป็น retail/operator path แล้วคืน `account_id`, `account_no`, `product`, `name`, `status` และ `require_knowledge_digital` การไม่มี status predicate หมายความว่า response นี้อาจสะท้อนสถานะที่ create path จะ block ได้ จึงไม่ใช่ trading eligibility decision

`require_knowledge_digital` จะเป็น `true` เมื่อ identification status เป็น `active` และ digital knowledge test ยังไม่ถูกยอมรับ ส่วน `web-portal` ใช้ `status` และ flag นี้คำนวณ action gate ต่อ

การที่ customer ผ่าน picker ไม่ได้แปลว่า BUY/SELL ผ่านเสมอ; product list และ create endpoint ยังตรวจ account status ตาม side โดย `active` รองรับทั้งสอง side, `suspended` รองรับ SELL เท่านั้น และ `closed`/`freeze` ถูก block

ใน `web-portal` hook กลางคำนวณ action gate ดังนี้: `deposit` และ `swapBuy` block เมื่อ suspended หรือเมื่อ knowledge/freeze gate ทำงาน; `withdraw`, `swapSell`, `bigLot` และ `transfer` block เมื่อ knowledge/freeze gate ทำงาน สำหรับหน้า Big Lot จึง block จาก `requireKnowledgeDigital` หรือ freeze เท่านั้น และ suspended อย่างเดียวอาจยังผ่าน client gate ก่อนให้ backend ตรวจ side-specific rule อีกครั้ง การ gate ทั้งหมดเป็น client behavior และไม่แทนการตรวจ account status/permission/eligibility ใน `order-service`

### 1. Load eligible products

**Owner service: `order-service`**

**Executing service: `order-service`**

`GET /api/v1/white-glove/:identification_id/products/big-lot`:

1. โหลด investor class ของ customer
2. หา sale products ของ `WEARE_WEB_BIG_LOT`
3. filter product on shelf ด้วย asset group Digital Asset, `is_tradable`, order type `swap` และ investor class
4. หา trade pair กับ active THB product
5. คืน product พร้อม available unit balance ที่ปัดลงตาม decimal configuration ของสินทรัพย์

ถ้าไม่มี sale channel ระบบคืนรายการว่าง ไม่สร้าง fallback จาก channel อื่น

### 2. Load Big Lot order book

**Owner service: `order-service`**

**Executing service: `order-service`**

`GET /api/v1/white-glove/orderbook/biglot` เรียก Remarketer `/api/v1/orderbook/biglot` ด้วย quote currency `THB`, เติม product name/icon/decimal แล้วรวม bids และ asks จากทุกสินทรัพย์ โดยเรียงรายการล่าสุดก่อน

Backend ไม่ filter order book ตาม customer; product eligibility ถูกตรวจแยกใน product-list/create path

### 3. Client selects an exact order-book quantity

**Owner service: `order-service`**

**Executing service: `web-portal`**

Committed frontend path ปัจจุบันรับเฉพาะ quantity ที่เท่ากับ order-book item:

- BUY: เลือก ask ที่ quantity ตรงและราคาต่ำสุด
- SELL: เลือก bid ที่ quantity ตรงและราคาสูงสุด
- ตรวจ THB balance สำหรับ BUY และ crypto balance สำหรับ SELL
- ถ้าไม่มี exact match จะแสดง `No Exact Match Available` และไม่เปิด preview

เงื่อนไขนี้เป็น client validation; Backend create path ไม่ทำ exact-match validation ซ้ำสำหรับ `bulk`

### 4. Calculate fee and preview

**Owner service: `order-service`**

**Executing service: `order-service`**

`POST /api/v1/white-glove/big-lot/swap/calculate` รับ `customer_account_id`, side, amount, price และ symbol จากนั้น:

1. โหลด product จาก symbol
2. เลือก fee ด้วย transaction type `swap`, route `dealer`, product, customer account และ `volume_size = bulk`
3. `MatchedAmount = Amount × Price`
4. `FeeAmount = floor(MatchedAmount × FeeRate / 100, 2 ตำแหน่ง)`
5. BUY: `FiatAmount = MatchedAmount + FeeAmount`
6. SELL: `FiatAmount = MatchedAmount - FeeAmount`
7. Response คืน route เป็น `dealer`

Display fiat amount ใช้การปัดขึ้น 2 ตำแหน่งแยกจาก raw `FiatAmount`

### 5. Submit Big Lot order

**Owner service: `order-service`**

**Executing service: `order-service`**

Frontend ส่งผล preview ต่อไปยัง `POST /api/v1/white-glove/:identification_id/order-trade/swap` พร้อม:

- symbols, side, price และ source amount
- estimated received quantity
- `fee_rate` และ `fee_amount`
- `route = dealer`
- `volume_size = bulk`

Backend ตรวจ permission, account status, side และ business eligibility แล้ว:

1. ข้าม maintenance validation สำหรับ `bulk`
2. ข้าม minimum-amount rejection
3. ข้าม Remarketer route/orderbook/liquidity pre-validation
4. ตรวจ available balance อีกครั้ง
5. สร้าง `order_trade`, action flow และ `order_trade_info` ใน transaction
6. เปลี่ยน order `draft` → `open`
7. เก็บ `OrderQuantity = FromUnit` โดยไม่ปัดตาม product decimal
8. publish Kafka event `CreateOrderSwap` โดยใช้ customer account code เป็น key

Create endpoint ไม่เรียก calculate endpoint ซ้ำและ persist price, fee, estimate และ route จาก request จึงต้องถือค่าจาก client เป็น contract input ที่ Backend production path ปัจจุบันยังไม่ recompute

### 6. Hold balance and place order asynchronously

**Owner service: `order-service`**

**Executing service: `order-consumer`**

เมื่อ `order-consumer` รับ `CreateOrderSwap`:

1. โหลด order และ recheck available balance
2. ย้ายสินทรัพย์ต้นทางจาก `AVAILABLE` ไป `HOLD_IN_ORDER`
3. publish logical-ledger transaction
4. ส่ง trade ไป Remarketer พร้อม side, placed quantity, route, callback URL, price, order type, `volume_size` และ client type
5. เมื่อ Remarketer รับคำสั่งสำเร็จ เปลี่ยน order `open` → `processing` และเก็บ Remarketer order ID

BUY placed quantity หัก fee ตาม order data; dealer-tier account อาจหัก exchange fee เพิ่มเมื่อ route/config เข้าเงื่อนไข

### 7. Process Remarketer callback and settle

**Owner service: `order-service`**

**Executing service: `order-service`**

Remarketer เรียก `POST /api/v1/order-trade/webhook`:

- `filling`: เปลี่ยน action/status ไปช่วงกำลัง match
- partial fill: บันทึก transaction/exchange, settle เฉพาะส่วนที่ match และคง remaining order
- `filled`: บันทึก transaction/exchange, คำนวณ aggregate fee/quantity, สร้าง executed/refund ledger, publish logical movements และเปลี่ยนผ่าน `sync-ledger` ไป `filled`
- `rejected`: เปลี่ยน order เป็น rejected และคืน hold balance ตาม path ที่เกี่ยวข้อง

Webhook เป็นจุดยืนยันผล trade จริง; preview/create response ไม่ใช่ final trade outcome

## Business rules

- `volume_size = bulk` เป็นตัวกำหนด Big Lot channel และ bypass rules
- Big Lot ยังบังคับ investor class, swap pair, product-on-shelf และ document-expiry validation
- White Glove customer picker เป็น read/selection policy ที่ตัด identification `onboarding`, `rejected`, `closed` และ Digital Asset account `closed`; trading-detail account endpoint เป็น all-status read ที่คืน status/knowledge context และห้ามขยายเป็น trading eligibility โดยไม่ผ่าน create-path validation
- White Glove customer list แสดง `customer_status` เป็น supporting badge และไม่เปลี่ยน selection/creation eligibility ของ Backend
- Big Lot client gate ของ `web-portal` ที่ block Digital Knowledge required หรือ freeze เป็น supporting UX rule; backend `order-service` ยังเป็น source of truth สำหรับการสร้าง order
- Valid bulk path ข้าม minimum check จึงไม่ควรคืน `80005`
- Valid bulk path ข้าม `checkRoute` จึงไม่ควรคืน `80003` หรือ `80004` จาก pre-create route validation
- Calculate ใช้ route `dealer` เพื่อเลือก fee และ response ก็คืน `dealer`
- Create API ไม่ force route เอง; route ถูกส่งจาก client แล้ว persist ลง order
- Dealer permission และ RM permission ต่างสร้าง White Glove order ได้; `IsDealerTrading` เป็นจริงเฉพาะผู้มี dealer-execute permission
- Big Lot order quantity ไม่ถูกปัดตอน persist
- `suspended` อนุญาตเฉพาะ Big Lot SELL; Big Lot BUY และทั้งสอง side เมื่อ `closed`/`freeze` ถูก block ด้วย `60002` จาก backend status validator
- Backend create ไม่ทำ exact order-book match หรือ recompute fee/price; exact match และการส่งค่าจาก calculate เป็น client-orchestrated behavior
- การ publish Kafka เกิดหลัง database transaction จึงไม่ใช่ atomic operation เดียวกัน

## State transitions

**Owner service: `order-service`**

| State | Owner/executor | Trigger |
| :--- | :--- | :--- |
| `draft` | `order-service` | สร้าง order row |
| `open` | `order-service` | transaction สร้าง order สำเร็จ |
| `processing` | Owner: `order-service`; executor: `order-consumer` | hold balance และ Remarketer รับคำสั่ง |
| `filling` | `order-service` | Remarketer callback เริ่ม/ทยอย match |
| `sync-ledger` | `order-service` | เตรียม executed/refund ledger |
| `filled` | `order-service` | ledger processing ของ final fill สำเร็จ |
| `rejected` | `order-consumer` หรือ `order-service` ตาม failure point | balance ไม่พอ, Remarketer placement ล้มเหลว หรือ callback reject |

Terminal outcomes ที่ยืนยันคือ `filled`, `rejected` และ cancellation outcomes ของ shared Swap lifecycle

## Error and recovery behavior

- Authentication/permission ไม่ผ่าน: HTTP 401
- Request/body/side/ID ไม่ถูกต้อง: HTTP 400
- `80006`: investor class ไม่มีหรือไม่ถูกต้อง
- `60002`: Digital Asset account status ไม่อนุญาต side ที่ขอ; message เป็น `customer is <status>.`
- Pair, product-on-shelf หรือ document expiry ไม่ผ่าน: HTTP 400 พร้อม service message; Big Lot handler ไม่มี business code แยกสำหรับทุกกรณี
- `80002`: synchronous balance check ใน create พบ available asset ไม่พอ
- Consumer recheck พบ balance ไม่พอ: order ถูกเปลี่ยนเป็น `rejected` ด้วย reason `insufficient asset`; create API อาจตอบสำเร็จไปแล้วเพราะเป็น async step
- Hold สำเร็จแต่ Remarketer placement ล้มเหลว: consumer reject order และย้าย hold กลับ available
- Kafka publish ล้มหลัง order transaction: create API คืน error แต่ order อาจคงอยู่ที่ `open`; ต้องตรวจ order row และ event retry/monitoring ก่อน retry จาก client
- Calculate หา product/fee ไม่ได้: HTTP 500
- Order-book/Remarketer read ล้ม: HTTP 500
- `80003`, `80004`, `80005` มี mapping ใน White Glove handler แต่ valid `bulk` path return ก่อน route/minimum validation จึงไม่ใช่ expected Big Lot errors

## Final outcomes

- Successful create คืน order UUID ขณะที่ execution ยังเป็น asynchronous
- `order-consumer` ล็อก source balance และส่งคำสั่งไป Remarketer
- Final fill ทำให้ order เป็น `filled`, บันทึก trade/exchange detail และ settle executed/refunded ledger
- Failure ก่อน Remarketer acceptance จบที่ `rejected` และคืน hold balance เมื่อ hold เกิดขึ้นแล้ว
- Order detail แสดง size `big-lot` เมื่อ persisted `volume_size = bulk`
- `suspended` + SELL ผ่าน account-status gate ได้; status gate นี้เป็น backend rule และไม่ใช่ client-only restriction

## Related shared rules

- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)
- [Permissions and Access Control](/shared-rules/permissions/)
- [Error Code Registry](/shared-rules/error-codes/)
- [Third-Party Integrations Profile](/system-context/integrations/)

## Code references

`order-service`:

- `routes/route.go`: White Glove routes และ API-key permissions
- `handler/white_glove_handler.go`: product/order-book/calculate/create handlers และ error mapping
- `handler/white_glove_dto.go`: `WhiteGloveTradingCustomerAccountResponse`
- `handler/order_trade_dto.go`: create payload mapping และ Big Lot display size
- `pkg/crypto_product/service.go`: product eligibility และ balance response
- `pkg/customer/service.go`: White Glove customer/account selection และ account detail lookup
- `pkg/white_glove/service.go`: trading customer-account selection และ `require_knowledge_digital` calculation
- `storages/postgres/customerrepository/customer_account_repository.go`: not-closed customer/account predicates
- `pkg/order_trade/orderbook.go`: Remarketer Big Lot order-book transformation
- `pkg/order_trade/service.go`: `CanSwap` bulk bypass และ `BigLotSwapCalculate`
- `pkg/order_trade/swap_service.go`: order persistence, quantity rule และ Kafka publication
- `pkg/order_trade/webhook_service.go`: callback, transaction, ledger และ final state
- `pkg/produce/service.go`: `CreateOrderSwap` Kafka event

`order-consumer`:

- `pkg/digital-asset-order-request/service.go`: consume/dispatch `CreateOrderSwap`
- `pkg/digital-asset-order-request/swap.go`: balance recheck, hold ledger, Remarketer placement, processing/reject

`web-portal` supporting reference:

- `src/app/api/white-glove/[identificationId]/customer/accounts/route.ts`: BFF สำหรับ trading customer-account context
- `src/app/features/white-glove/hooks/useOrderCustomerAccount.ts`: status/knowledge/freeze action mapping
- `src/app/(digital-asset-order-flow)/white-glove/container.tsx`: White Glove customer-list container
- `src/app/features/white-glove/components/white-glove-list-table/index.tsx`: Customer Status badge
- `src/app/features/white-glove/types/white-glove-order-list.ts`: `customer_status` response mapping
- `src/app/(digital-asset-order-flow)/white-glove/[customerId]/big-lot/container.tsx`: Big Lot client gate
- `src/app/features/white-glove/hooks/big-lot/use-big-lot-form.ts`
- `src/app/features/white-glove/services/big-lot/orderbook/big-lot.ts`
- `src/app/features/white-glove/components/big-lot/preview-biglot-order-modal.tsx`

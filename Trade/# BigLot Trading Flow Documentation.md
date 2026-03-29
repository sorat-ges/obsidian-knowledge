

## 1. Overview

  

BigLot คือระบบซื้อขาย crypto แบบล็อตใหญ่ (bulk) ผ่านช่องทาง **White Glove** โดยมี Dealer/RM เป็นผู้ดำเนินการ และใช้ **Remarketer Service** เป็น counterparty ในการจับคู่คำสั่ง

  

### Key Identifiers

  

| Key | Value | Description |

|-----|-------|-------------|

| Channel | `WEARE_WEB_BIG_LOT` | ระบุว่าเป็น BigLot order |

| VolumeSize | `bulk` | ขนาด order |

| Route | `dealer` | เส้นทางการ trade |

| Display | `big-lot` | ชื่อแสดงผลบน UI |

  

### ผู้เกี่ยวข้อง

  

- **RM (Relationship Manager)** — ผู้สร้างคำสั่งซื้อขายให้ลูกค้า

- **Dealer** — ผู้อนุมัติและดำเนินการ trade

- **Remarketer Service** — ระบบภายนอกที่ให้ order book และรับ execute คำสั่ง

- **Platform (order-service)** — ตัวกลางจัดการ order, คำนวณ fee, บันทึกข้อมูล

  

---

  

## 2. API Endpoints

  

### 2.1 GET Order Book

  

```

GET /api/v1/white-glove/orderbook/biglot

```

  

**Handler:** `GetOrderBookBigLot` (`handler/white_glove_handler.go`)

  

**Auth:** Bearer token (Portal Claims)

  

**Response:**

```json

{

"code": "200",

"data": {

"bids": [

{

"symbol": "BTC",

"symbol_name": "Bitcoin",

"symbol_pair": "BTC-THB",

"icon": "https://cdn.example.com/btc.png",

"price": 2500000.50,

"price_display": "2,500,000.50",

"unit": 10.5,

"unit_display": "10.50",

"dealer": "Dealer ABC",

"created_at": "2026-03-15T10:30:00Z"

}

],

"asks": [...]

}

}

```

  

**Flow:**

1. เรียก Remarketer Service `POST /api/v1/orderbook/biglot` พร้อม payload `{symbol_pair: "BTC-THB"}`

2. ดึง product info (icon, name, decimal format) จาก DB

3. Format ราคาและจำนวนให้มี comma และ decimal ที่ถูกต้อง

4. Sort bids/asks ตาม createdAt (ล่าสุดก่อน)

  

---

  

### 2.2 GET Products

  

```

GET /api/v1/white-glove/{identification_id}/products/big-lot?symbol=BTC

```

  

**Handler:** `GetWhiteGloveBigLotProductsCrypto` (`handler/white_glove_handler.go`)

  

**Auth:** Bearer token (Portal Claims)

  

**Query Params:**

- `symbol` (optional) — กรองตาม crypto symbol

  

**Response:**

```json

{

"code": "200",

"data": {

"total": 2,

"total_page": 1,

"products": [

{

"product_id": "uuid",

"icon": "https://cdn.example.com/btc.png",

"symbol": "BTC",

"product_name": "Bitcoin",

"available_unit_balance": {

"value": 10.5,

"display": "10.50"

}

}

]

}

}

```

  

---

  

### 2.3 POST Calculate Swap

  

```

POST /api/v1/white-glove/big-lot/swap/calculate

```

  

**Handler:** `WhiteGloveBigLotSwapCalculate` (`handler/white_glove_handler.go`)

  

**Auth:** Bearer token (Portal Claims)

  

**Request:**

```json

{

"customer_account_id": "550e8400-e29b-41d4-a716-446655440000",

"order_side": "buy",

"amount": "0.5",

"price": "2500000",

"symbol": "BTC"

}

```

  

**Response:**

```json

{

"code": "200",

"data": {

"fiat_amount": "1250000.50",

"display_fiat_amount": "1,250,000.50",

"unit_amount": "0.5",

"display_unit_amount": "0.50",

"rate_amount": "2500000",

"display_rate_amount": "2,500,000.00",

"fee_amount": "6250.25",

"display_fee_amount": "6,250.25",

"fee_rate": "0.5",

"display_fee_rate": "0.50",

"route": "dealer"

}

}

```

  

**Error Responses:**

- `400` — Invalid input

- `401` — Invalid claims

- `500` — ดึง product หรือ fee rate ไม่ได้

  

---

  

### 2.4 POST Create Order (Swap)

  

```

POST /api/v1/white-glove/{identification_id}/order-trade/swap

```

  

**Handler:** `CreateWhiteGloveOrderSwap` (`handler/white_glove_handler.go`)

  

**Auth:** Bearer token + Permission (`WHITE_GLOVE_TRADING_RM_EXECUTE` หรือ `WHITE_GLOVE_TRADING_DEALER_EXECUTE`)

  

**Request (BigLot):**

```json

{

"from_symbol": "BTC",

"to_symbol": "THB",

"from_unit": "0.5",

"price": "2500000",

"estimate_received_quantity": "1250000",

"order_type": "market",

"side": "buy",

"volume_size": "bulk",

"route": "dealer",

"fee_rate": "0.5",

"fee_amount": "6250.25"

}

```

  

> **สำคัญ:** `volume_size: "bulk"` คือสิ่งที่ทำให้ระบบรู้ว่าเป็น BigLot order

  

**Response:**

```json

{

"code": "200",

"message": "success",

"data": {

"order_id": "550e8400-e29b-41d4-a716-446655440000"

}

}

```

  

---

  

## 3. Flow Diagrams

  

### 3.1 BigLot Swap Calculation Flow

  

```

Client

│

▼

WhiteGloveBigLotSwapCalculate (Handler)

├── Validate claims

├── Parse request (amount, price, symbol, side)

│

▼

BigLotSwapCalculate (Service) ── pkg/order_trade/service.go

├── Get product by symbol

├── Get fee rate:

│ ├── Filter: route="dealer", volumeSize="bulk"

│ ├── Fetch transaction fees matching filter

│ └── Return fee rate %

│

├── Calculate:

│ ├── unitAmount = input.amount

│ ├── matchedBookAmount = amount × price

│ ├── feeAmount = matchedBookAmount × feeRate / 100 (ปัดลง 2 ตำแหน่ง)

│ │

│ ├── ถ้า BUY: fiatAmount = matchedBookAmount + feeAmount

│ └── ถ้า SELL: fiatAmount = matchedBookAmount - feeAmount

│

▼

Response (fiat, unit, rate, fee details)

```

  

### 3.2 BigLot Order Creation Flow

  

```

Client (with volume_size="bulk")

│

▼

CreateWhiteGloveOrderSwap (Handler)

├── Validate claims & permissions

│ └── ต้องมี WHITE_GLOVE_TRADING_RM_EXECUTE

│ หรือ WHITE_GLOVE_TRADING_DEALER_EXECUTE

├── ตรวจ volume_size == "bulk"

├── Set channel = "WEARE_WEB_BIG_LOT"

├── *** ข้าม maintenance check *** (BigLot ไม่ต้องเช็ค)

│

▼

executeSwapOrder

│

├── CanSwap()

│ ├── ข้ามเช็ค minimum amount (BigLot ไม่บังคับ)

│ ├── Validate swap pair availability

│ └── ข้าม route validation (BigLot return OK ทันที)

│

├── MakeSwapOrderRequest()

│ ├── ดึงข้อมูล customer

│ ├── ดึง digital asset account

│ ├── ดึง from/to products

│ ├── *** เช็ค asset balance >= from_unit ***

│ ├── Generate order running number

│ │

│ ├── ══ Begin Transaction ══

│ │ ├── Insert OrderTrade (status: DRAFT)

│ │ │ - Channel: "WEARE_WEB_BIG_LOT"

│ │ │ - VolumeSize: "bulk"

│ │ │ - OrderQuantity: ไม่ปัดเศษ (ใช้ค่าตรง)

│ │ │

│ │ ├── Insert OrderActionFlow (DRAFT → SUBMITTED)

│ │ ├── Update OrderTrade (status: OPEN)

│ │ ├── Insert OrderActionFlow (OPEN)

│ │ └── Insert OrderTradeInfo

│ │ ══ End Transaction ══

│ │

│ └── Produce CreateOrderRequest message (Kafka)

│

▼

Response { order_id: "uuid" }

```

  

### 3.3 Order Book Fetch Flow

  

```

Client

│

▼

GetOrderBookBigLot (Handler)

│

▼

GetOrderBookBigLot (Service) ── pkg/order_trade/orderbook.go

├── Call Remarketer Service

│ POST {RemarketerURL}/api/v1/orderbook/biglot

│ Headers: Authorization: Bearer {token}

│ Body: { "symbol_pair": "BTC-THB" }

│

├── Collect unique symbols จาก response

├── Query products by symbols (icon, name, decimal)

├── Format price/unit display

├── Sort bids/asks by createdAt DESC

│

▼

Response { bids: [...], asks: [...] }

```

  

---

  

## 4. Fee Calculation

  

### Logic (`pkg/order_trade/service_fee_rate.go`)

  

**BigLot Fee Parameters:**

```go

FeeFilterCondition{

RouteName: "dealer",

VolumeSize: "bulk",

Symbol: product.Symbol,

CustomerTier: customerAccount.Tier,

}

```

  

**ขั้นตอน:**

1. Build filter จาก condition ข้างบน

2. Query transaction fees (Company: "XD", TransactionType: "swap", FeeType: "main")

3. Match fee ตาม filter (route, volumeSize, symbol, tier, date range)

4. ตรวจว่า main fee รวม additional fee หรือไม่

5. ถ้าไม่รวม → query additional fee แยก แล้วรวมกัน

6. Return fee rate %

  

### สูตรคำนวณ

  

```

matchedBookAmount = amount × price

feeAmount = matchedBookAmount × feeRate / 100 (ปัดลง 2 ตำแหน่ง)

  

BUY order: fiatAmount = matchedBookAmount + feeAmount (ลูกค้าจ่ายเพิ่ม)

SELL order: fiatAmount = matchedBookAmount - feeAmount (หักจากยอดที่ได้)

```

  

**ตัวอย่าง:**

- ซื้อ BTC 0.5 หน่วย ราคา 2,500,000 THB/BTC, fee rate 0.5%

- matchedBookAmount = 0.5 × 2,500,000 = 1,250,000 THB

- feeAmount = 1,250,000 × 0.5 / 100 = 6,250 THB

- fiatAmount (BUY) = 1,250,000 + 6,250 = **1,256,250 THB**

  

---

  

## 5. BigLot vs Regular Swap

  

| Feature | Regular Swap | BigLot |

|---------|-------------|--------|

| Channel | `WEARE_WEB` | `WEARE_WEB_BIG_LOT` |

| VolumeSize | null | `bulk` |

| Route | `mixed` / `exchange` | `dealer` |

| Minimum Amount | บังคับ | **ข้าม** |

| Route Validation | เช็คเข้มงวด | **ข้าม** |

| Maintenance Check | เช็คตาม symbol pair | **ข้าม** |

| Order Quantity | ปัดเศษตาม decimal | **ไม่ปัดเศษ** (ใช้ค่าตรง) |

| Counterparty | หลาย exchange | Dealer เดียว (Remarketer) |

| ราคา | ระบบคำนวณ | มาจาก order book |

  

---

  

## 6. Authorization & Permissions

  

### Authentication

- ทุก endpoint ต้องส่ง `Authorization: Bearer {token}` header

- Middleware แปลง token เป็น **PortalClaims** (Subject, Name, Issuer)

  

### Permission (เฉพาะ Create Order)

ต้องมี permission อย่างใดอย่างหนึ่ง:

- `WHITE_GLOVE_TRADING_RM_EXECUTE` — สำหรับ RM

- `WHITE_GLOVE_TRADING_DEALER_EXECUTE` — สำหรับ Dealer

  

### Remarketer Auth

- ใช้ token จาก **CredentialCentric Service**

- ส่ง `Authorization: Bearer {token}` ไปยัง Remarketer

  

---

  

## 7. Error Codes

  

| Code | Constant | Description |

|------|----------|-------------|

| 80001 | `CodeWhiteGloveSwapMaintenance` | ระบบอยู่ระหว่างปิดปรับปรุง |

| 80002 | `CodeWhiteGloveSwapInsufficientAsset` | ลูกค้ามี crypto ไม่พอ |

| 80003 | `CodeWhiteGloveSwapInsufficientOrderBook` | ไม่มี order book ที่ match |

| 80004 | `CodeWhiteGloveSwapInsufficientLiquidity` | สภาพคล่องไม่เพียงพอ |

| 80005 | `CodeWhiteGloveSwapAmountTooLow` | จำนวนต่ำกว่าขั้นต่ำ (ไม่ใช้กับ BigLot) |

  

---

  

## 8. Order Status Lifecycle

  

```

DRAFT ──→ OPEN ──→ MATCHED / CANCELLED / COMPLETED

│ │

│ └── Kafka: ProduceCreateOrderRequest

│ └── Remarketer รับ order ไป execute

│

└── สร้าง OrderActionFlow (DRAFT + SUBMITTED)

└── สร้าง OrderActionFlow (OPEN)

```

  

**Status Flow:**

1. **DRAFT** — สร้าง order ใน DB (เริ่มต้น)

2. **OPEN** — order พร้อมจับคู่ (update ใน transaction เดียวกัน)

3. **MATCHED** — Remarketer จับคู่สำเร็จ (callback)

4. **COMPLETED** — settlement เสร็จสมบูรณ์

5. **CANCELLED** — ยกเลิก

  

---

  

## 9. Remarketer Service Integration

  

### Order Book

```

POST {RemarketerURL}/api/v1/orderbook/biglot

Authorization: Bearer {credential_centric_token}

  

Request:

{

"symbol_pair": "BTC-THB",

"symbol": "BTC" // optional

}

  

Response:

{

"code": "200",

"data": [{

"symbol": "BTC",

"symbol_pair": "BTC-THB",

"bids": [{ "price": "2500000", "unit": "10", "dealer": "ABC", "created_at": "..." }],

"asks": [{ "price": "2510000", "unit": "5", "dealer": "XYZ", "created_at": "..." }]

}]

}

```

  

### Trade Execution

```go

Trade(request TradeRequest) → OrderTradeRemarketer

  

TradeRequest {

ClientOrderId string // Order ID จาก platform

Symbol string // "BTC"

SymbolPair string // "BTC-THB"

Side string // "buy" / "sell"

Quantity decimal.Decimal // จำนวน crypto

Route string // "dealer"

CallbackUrl string // Webhook สำหรับ update status

Price decimal.Decimal // ราคาที่ตกลง

OrderType string // "market" / "limit"

}

```

  

---

  

## 10. Database Schema (Key Fields)

  

### OrderTrade

| Field | Type | BigLot Value |

|-------|------|-------------|

| order_id | string | auto-generated |

| channel | string | `WEARE_WEB_BIG_LOT` |

| volume_size | string | `bulk` |

| route | string | `dealer` |

| order_method | string | `swap` |

| order_side | string | `buy` / `sell` |

| order_quantity | decimal | ไม่ปัดเศษ |

| price | decimal | จาก order book |

| fee_rate | decimal | % จาก fee config |

| fee_amount | decimal | คำนวณจาก formula |

| fee_currency | string | `THB` |

| status | string | `draft` → `open` |

| created_by | string | RM/Dealer user ID |

  

### OrderActionFlow

| Field | Description |

|-------|-------------|

| order_trade_id | FK ไป OrderTrade |

| from_status | status ก่อนหน้า |

| to_status | status ใหม่ |

| action | เช่น `SUBMITTED` |

| created_at | timestamp |

  

### OrderTradeInfo

| Field | Description |

|-------|-------------|

| order_trade_id | FK ไป OrderTrade |

| metadata | ข้อมูลเพิ่มเติมของ order |

  

---

  

## 11. Audit Logging

  

ทุก BigLot swap จะบันทึก audit log:

- **Application:** `WEARE_WEB`

- **Sequence:** `swap`

- **Action:** `submit_request`

- **Result:** `success` / `fail`

- **OrderID:** Trade ID ที่สร้าง

  

---

  

## 12. Key File Locations

  

| Component | File |

|-----------|------|

| Handler (endpoints) | `handler/white_glove_handler.go` |

| Handler DTOs | `handler/white_glove_dto.go` |

| Withdraw Crypto | `handler/white_glove_withdraw_crypto_handler.go` |

| Service (BigLotSwapCalculate) | `pkg/order_trade/service.go` |

| Service (CanSwap) | `pkg/order_trade/service.go` |

| Service (MakeSwapOrderRequest) | `pkg/order_trade/swap_service.go` |

| Service (GetOrderBookBigLot) | `pkg/order_trade/orderbook.go` |

| Fee Rate Logic | `pkg/order_trade/service_fee_rate.go` |

| Input/Output structs | `pkg/order_trade/input.go`, `output.go` |

| Remarketer Integration | `third_party/remarketer/new_remarketer.go` |

| Domain Models | `internal/domain/order_book.go` |

| Enums/Constants | `internal/constants/enum/order_enum.go` |

| Error Codes | `internal/constants/error.go` |

| Route Registration | `routes/route.go` |

  

---

  

## 13. Complete User Flow (End-to-End)

  

```

1. RM/Dealer เปิดหน้า BigLot Trading

│

▼

2. GET /orderbook/biglot

→ ดึงราคา bid/ask จาก Remarketer

→ แสดง order book ให้เลือก

│

▼

3. GET /{id}/products/big-lot

→ ดึง products ที่ลูกค้ามี พร้อมยอดคงเหลือ

│

▼

4. RM/Dealer เลือก crypto, ใส่จำนวน, เลือกราคาจาก order book

│

▼

5. POST /big-lot/swap/calculate

→ คำนวณ fiat amount, fee, rate

→ แสดงสรุปให้ review

│

▼

6. RM/Dealer กดยืนยัน

│

▼

7. POST /{id}/order-trade/swap (volume_size: "bulk")

→ CanSwap: validate pair

→ MakeSwapOrderRequest:

- เช็คยอดคงเหลือ

- สร้าง order (DRAFT → OPEN)

- ส่ง message ไป Kafka

│

▼

8. Remarketer รับ order จาก Kafka

→ จับคู่กับ Dealer

→ Execute trade

→ Callback update status

│

▼

9. Order status: OPEN → MATCHED → COMPLETED

```
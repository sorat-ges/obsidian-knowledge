# GetSwapRoutes - คำอธิบายรายละเอียด

## ภาพรวม

`GetSwapRoutes` เป็นฟังก์ชันสำหรับค้นหาเส้นทางการแลกเปลี่ยน (Swap Routes) ที่ดีที่สุดสำหรับผู้ใช้ โดยจะคืนค่าเส้นทางทั้งหมดที่ใช้ได้ พร้อมคำนวณ Fee และจำนวนที่จะได้รับสุทธิ (Net Amount)

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1088-1152)

**สถาปัตยกรรม:**

```text
                 GetSwapRoutes Architecture
        ╔═══════════════════════════════════════════════════╗
        ║                                                   ║
        ║            HTTP REQUEST                           ║
        ║     POST /api/v1/order-trade/routes/inquiry       ║
        ║                                                   ║
        ║     { pair: "BTC-THB", unit: "50000",             ║
        ║       side: "BUY", id: "xxx" }                    ║
        ╚═══════════════════════════════════════════════════╝
                          │
                          ▼
        ╔═══════════════════════════════════════════════════╗
        ║          Handler Layer                            ║
        ║    order_trade_handler.go:687-805                 ║
        ╟───────────────────────────────────────────────────╢
        ║  • Parse Request                                  ║
        ║  • Validate Input                                 ║
        ║  • Call Service Layer                             ║
        ║  • Format Response                                ║
        ╚═══════════════════════════════════════════════════╝
                          │
                          ▼
        ╔═══════════════════════════════════════════════════╗
        ║          Service Layer                            ║
        ║      service.go:1088-1152                         ║
        ╟───────────────────────────────────────────────────╢
        ║  1. getMinimumAmountForSwap (1168-1212)           ║
        ║  2. newRemarketerService.GetRoutes                ║
        ║  3. GetSwapBuyRoute / GetSwapSellRoute            ║
        ║  4. Sort by NetAmount (DESC)                      ║
        ║  5. SortBestRoute (1153-1166)                     ║
        ╚═══════════════════════════════════════════════════╝
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
    ┌─────────┐    ┌───────────┐    ┌──────────────┐
    │Remarketer│    │Credential │   │ Other        │
    │Service   │    │Centric    │   │ Services     │
    │          │    │           │   │              │
    │•GetRoutes│    │•GetToken  │   │ •Product     │
    │•Trade    │    │           │   │ •Customer    │
    │•GetRate  │    │           │   │ •FeeConfig   │
    │•Cancel  │    │           │    │•MarkToMarket │
    └─────────┘    └───────────┘    └──────────────┘
        │                 │                 │
        └─────────────────┴─────────────────┘
                          │
                          ▼
        ╔═══════════════════════════════════════════════════╗
        ║           HTTP RESPONSE                         ║
        ╟─────────────────────────────────────────────────╢
        ║  {                                             ║
        ║    "routes": [                                 ║
        ║      { name: "dealer", netAmount: "0.025...", ║
        ║        isBestRoute: true },                    ║
        ║      { name: "bitkub", netAmount: "0.024...", ║
        ║        isBestRoute: false }                    ║
        ║    ],                                          ║
        ║    "minimumAmount": "50"                        ║
        ║  }                                             ║
        ╚═══════════════════════════════════════════════════╝
```

---

## External Service Integration

### Remarketer Service

**ไฟล์:** `third_party/remarketer/new_remarketer.go`

Remarketer Service เป็น external service ที่ให้ข้อมูลเส้นทางการแลกเปลี่ยน (routes) และดำเนินการ trade จริง

#### GetRoutes API

ดึงเส้นทางการแลกเปลี่ยนที่เป็นไปได้ทั้งหมด

**Endpoint:** `POST /api/v1/routes`

**Request:**
```json
{
  "symbol": "BTC",
  "symbol_pair": "THB",
  "side": "BUY",
  "quantity": "10000"
}
```

**Response:**
```json
{
  "code": "200",
  "message": "success",
  "data": [
    {
      "route": "dealer",
      "rate_thb": "2000000.00",
      "matched_book_amount": "100000.00",
      "liquidity": "50",
      "liquidity_unit": "THB",
      "has_order": true,
      "match_result": "full"
    }
  ]
}
```

#### Trade API

สร้างคำสั่งซื้อขายผ่าน route ที่เลือก

**Endpoint:** `POST /api/v1/order-trade`

**Request:**
```json
{
  "client_order_id": "uuid",
  "symbol": "BTC",
  "symbol_pair": "THB",
  "side": "BUY",
  "quantity": "0.05",
  "route": "dealer",
  "callback_url": "https://callback-url",
  "price": "2000000",
  "order_type": "market"
}
```

#### GetMarketRate API

ดึงอัตราตลาดปัจจุบัน

**Endpoint:** `POST /api/v1/market-rate`

#### CancelSwapOrder API

ยกเลิกคำสั่งซื้อขาย

**Endpoint:** `DELETE /api/v1/order-trade/{remarketer_order_id}`

### Credential Centric Service

ใช้สำหรับขอ Access Token ในการเรียก Remarketer Service

```go
authData, err := s.credentialCentricSvc.GetAccessToken()
// ใช้ authData.AccessToken ใน Authorization header
```

---

## Input/Output Structure

### Input: SwapRouteInput

```go
type SwapRouteInput struct {
    Pair             string                    // คู่สกุลเงิน เช่น "BTC-THB"
    Unit             decimal.Decimal           // จำนวนเงินที่ต้องการแลกเปลี่ยน
    Side             enum.OrderCryptoSwapSide  // ด้านของคำสั่ง: BUY หรือ SELL
    IdentificationId uuid.UUID                 // รหัสผู้ใช้
}
```

### Output: SwapRoutesOutput

```go
type SwapRoutesOutput struct {
    Routes               []SwapRoute  // รายการเส้นทางทั้งหมด
    MinimumAmount        decimal.Decimal // จำนวนขั้นต่ำที่แลกเปลี่ยนได้
    MinimumAmountDisplay string          // จำนวนขั้นต่ำ (รูปแบบแสดงผล)
}
```

### SwapRoute (เส้นทางแต่ละเส้น)

```go
type SwapRoute struct {
    Name                         string          // ชื่อเส้นทาง เช่น "Bitkub", "dealer"
    ExchangeName                 string          // ชื่อ Exchange
    Symbol                       string          // สัญลักษณ์สกุลเงิน
    Rate                         decimal.Decimal // อัตราแลกเปลี่ยน
    Liquidity                    decimal.Decimal // สภาพคล่องตัว
    TransactionFeeRatePercentage decimal.Decimal // อัตรา Fee (%)
    TransactionFeeAmount         decimal.Decimal // จำนวน Fee
    NetAmount                    decimal.Decimal // จำนวนสุทธิที่จะได้รับ
    NetAmountDisplay             string          // จำนวนสุทธิ (รูปแบบแสดงผล)
    IsBestRoute                  bool            // เป็นเส้นทางที่ดีที่สุดหรือไม่
    HasOrder                     bool            // มี Order อยู่หรือไม่
    MatchResult                  enum.RouteMatchResult // ผลการ Match
}
```

### RouteData (จาก Remarketer Service)

**ไฟล์:** `internal/domain/route.go` (บรรทัด 10-18)

```go
type RouteData struct {
    Route             string                // ชื่อ route: "dealer", "bitkub", "mixed"
    RateTHB           string                // อัตราใน THB (string ที่มาจาก API)
    MatchedBookAmount string                // จำนวนที่ match จาก order book
    Liquidity         string                // สภาพคล่อง (string ที่มาจาก API)
    LiquidityUnit     string                // หน่วยของ liquidity
    HasOrder          bool                  // มี order อยู่ในระบบหรือไม่
    MatchResult       enum.RouteMatchResult // "full", "partial", "no"
}
```

**Domain Wrapper Methods:**

```go
type Route struct {
    Data RouteData
}

// Methods หลัก:
func (r Route) Name() string                    // คืนค่า Route
func (r Route) ExchangeName() string            // แปลงเป็นชื่อ Exchange
func (r Route) RateTHB() decimal.Decimal        // แปลง string → decimal, round(8)
func (r Route) MatchedBookAmount() decimal.Decimal // แปลง string → decimal
func (r Route) Liquidity() decimal.Decimal      // แปลง string → decimal
func (r Route) LiquidityUnit() string           // คืนค่าหน่วย liquidity
func (r Route) HasOrder() bool                  // คืนค่า HasOrder
func (r Route) MatchResult() RouteMatchResult   // คืนค่า MatchResult
func (r Route) IsMixedRoute() bool              // เช็คว่าเป็น "mixed" route หรือไม่
func (r Route) LiquidityDisplayValue(displayRateMax *decimal.Decimal) decimal.Decimal
    // คำนวณ liquidity แสดงผล โดยคูณกับ displayRateMax (ถ้ามี)
```

### RouteMatchResult Enum

**ไฟล์:** `internal/constants/enum/order_trade_enum.go` (บรรทัด 3-18)

```go
type RouteMatchResult string

const (
    RouteMatchResultFull    RouteMatchResult = "full"     // Match ครบจำนวน
    RouteMatchResultPartial RouteMatchResult = "partial"  // Match บางส่วน
    RouteMatchResultNo      RouteMatchResult = "no"       // ไม่ match เลย
)

func (r RouteMatchResult) IsFullMatched() bool {
    return r == RouteMatchResultFull
}
```

**ตาราง Match Result:**

| Match Result | ความหมาย | IsFullMatched() | ใช้ได้ใน Best Route |
|--------------|-----------|-----------------|---------------------|
| `full` | Match ครบจำนวนที่ต้องการ | `true` | ✅ ใช่ |
| `partial` | Match ได้บางส่วน | `false` | ❌ ไม่ใช่ |
| `no` | ไม่มี liquidity ให้ match | `false` | ❌ ไม่ใช่ |

---

## โฟลว์การทำงาน

```
┌─────────────────────────────────────────────────────────────────┐
│                      GetSwapRoutes                              │
│                  (service.go: 1088-1152)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. getMinimumAmountForSwap (1168-1212)                         │
│     ├── ตรวจสอบจำนวนขั้นต่ำ                                  │
│     └── ถ้า Input < Minimum → คืนค่า Routes ว่าง              │
│                                                                  │
│  2. newRemarketerService.GetRoutes                              │
│     ├── ดึงเส้นทางที่เป็นไปได้ทั้งหมด                       │
│     └── ถ้าไม่มีเส้นทาง → error "no sources available"       │
│                                                                  │
│  3. วนลูปแต่ละ RemarketerRoute                                │
│     ├── ตรวจสอบ Rate > 0                                       │
│     ├── BUY: GetSwapBuyRouteWithNewRemarketer (1214-1303)       │
│     └── SELL: GetSwapSellRouteWithNewRemarketer (1305-1383)     │
│                                                                  │
│  4. Sort Routes by NetAmount (มาก → น้อย) (1143-1145)          │
│                                                                  │
│  5. SortBestRoute (1153-1166)                                   │
│     └── ยก Best Route ขึ้นมาอยู่อันดับแรก                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## รายละเอียดแต่ละขั้นตอน

### Step 1: getMinimumAmountForSwap (บรรทัด 1168-1212)

ตรวจสอบจำนวนขั้นต่ำที่แลกเปลี่ยนได้

```
┌─────────────────────────────────────────────────────────────────┐
│                 getMinimumAmountForSwap                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BUY Side:                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Minimum = digitalAssetTransactionConfig.Amount          │   │
│  │          (ค่าคงที่จาก Config เช่น 50 THB)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  SELL Side:                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Get Product โดย Symbol                               │   │
│  │ 2. Get Last Trade Price                                 │   │
│  │ 3. Get Decimal Digit                                    │   │
│  │ 4. Min = ConfigAmount / MarketPrice                     │   │
│  │ 5. RoundUp ตาม Decimal Digit                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**ตัวอย่าง:**
```
BUY: ขั้นต่ำ = 50 THB (จาก Config)

SELL (ขาย BTC):
- Config Amount = 50 THB
- Market Price = 2,000,000 THB/BTC
- Min Amount = 50 / 2,000,000 = 0.000025 BTC
- RoundUp (8 digits) = 0.00003000 BTC
```

#### getLastTradePrice Function (บรรทัด 1384-1395)

ใช้สำหรับคำนวณราคาตลาดปัจจุบันของสินทรัพย์ดิจิทัล

**ไฟล์:** `pkg/order_trade/service.go`

```go
func (s *orderTradeService) getLastTradePrice(productID uuid.UUID) (decimal.Decimal, error) {
    // 1. ดึง Digital Asset Mark to Market
    daMarkToMarket, err := s.digitalAssetMarkToMarketRepo.GetByProductID(productID)

    // 2. ดึง FX Mark to Market
    fxMarkToMarket, err := s.fxMarkToMarketRepo.GetByCurrency(nil, daMarkToMarket.Currency())

    // 3. คำนวณ Market Price = DA NavPU × FX NavPU
    return daMarkToMarket.NavPU().Mul(fxMarkToMarket.NavPU()), nil
}
```

**สูตรคำนวณ Market Price:**
```
Market Price = DigitalAsset.NavPU × FX.NavPU
```

**ตัวอย่าง:**
```
DigitalAsset NavPU (BTC/USD) = 65,000 USD
FX NavPU (USD/THB) = 35 THB/USD

Market Price = 65,000 × 35 = 2,275,000 THB/BTC
```

---

### Step 2: newRemarketerService.GetRoutes

ดึงเส้นทางที่เป็นไปได้ทั้งหมดจาก Remarketer Service

```
Input:
- BaseCurrency: "BTC"
- QuoteCurrency: "THB"
- Side: BUY
- Unit: 10,000

Output: []RemarketerRoute
- Route 1: Bitkub (Rate = 2,000,000, Liquidity = 1,000,000)
- Route 2: Coinbase (Rate = 2,005,000, Liquidity = 500,000)
- Route 3: dealer (Rate = 1,995,000, Liquidity = 5,000,000)
```

---

### Step 3: GetSwapBuyRouteWithNewRemarketer (บรรทัด 1214-1303)

สำหรับ **BUY Order**

```go
// 1. ดึงข้อมูลลูกค้าและบัญชี
customerAccountId := GetWalletAccount(accounts)

// 2. ดึงข้อมูล Product
product := GetBySymbol(baseCurrency) // BTC

// 3. กำหนด Fee Rate Type
feeRateType := MAX_FEE_RATE
if route.Name == "dealer" {
    feeRateType = MIN_FEE_RATE  // Dealer ใช้ MIN
}

// 4. ค้นหา Fee Rate
feeResult := GetPossibleFeeRate(request)
totalSwapFee := CalculateTotalFeeRate(feeResult)

// 5. คำนวณ Fee และ Net Amount
feeAmount := CalculateFeeAmountForBuy(amount, totalSwapFee)
netAmount := CalculateNetAmountForBuy(amount, feeAmount, rate)
```

#### สูตรคำนวณ BUY

```
Fee Amount = amount × (feeRate / 100) / (1 + feeRate / 100)
Fee Amount = RoundDown(Fee Amount, 2)

Net Amount = (amount - feeAmount) / rate
```

**ตัวอย่าง:**
```
amount = 10,000 THB
rate = 2,000,000 THB/BTC
feeRate = 0.15%

Fee = 10,000 × 0.0015 / 1.0015
    = 15 / 1.0015
    = 14.9775...
    = RoundDown(14.9775, 2)
    = 14.97 THB

Net Amount = (10,000 - 14.97) / 2,000,000
           = 9,985.03 / 2,000,000
           = 0.004992515 BTC
```

---

### Step 4: GetSwapSellRouteWithNewRemarketer (บรรทัด 1305-1383)

สำหรับ **SELL Order**

```go
// 1-3. เหมือน BUY (ดึงข้อมูลลูกค้า, Product, Fee)

// 4. คำนวณ Fee และ Net Amount
feeAmount := CalculateFeeAmountForSell(matchedBookAmount, totalSwapFee)
netAmount := CalculateNetAmountForSell(matchedBookAmount, feeAmount)
```

#### สูตรคำนวณ SELL

```
Fee Amount = Round(matchedBookAmount, 2) × (feeRate / 100)
Fee Amount = RoundDown(Fee Amount, 2)

Net Amount = Round(matchedBookAmount, 2) - feeAmount
```

**ตัวอย่าง:**
```
matchedBookAmount = 9,950.00 THB
feeRate = 0.15%

Fee = 9,950 × 0.0015
    = 14.925
    = RoundDown(14.925, 2)
    = 14.92 THB

Net Amount = 9,950 - 14.92
           = 9,935.08 THB
```

---

### Step 5: Sort Routes (บรรทัด 1143-1145)

เรียงลำดับเส้นทางตาม NetAmount จากมากไปน้อย

```go
slices.SortFunc(routes, func(a SwapRoute, b SwapRoute) int {
    return b.NetAmount.Compare(a.NetAmount)
})
```

**เหตุผล:** เส้นทางที่ให้ NetAmount สูงสุด = ดีที่สุดสำหรับลูกค้า

**การเปรียบเทียบ:**
```
a.NetAmount.Compare(b.NetAmount)
  → 1:  a > b  (a ดีกว่า)
  → 0:  a = b  (เท่ากัน)
  → -1: a < b  (b ดีกว่า)

return b.Compare(a) → เรียงจากมากไปน้อย (DESC)
```

---

### Step 6: SortBestRoute (บรรทัด 1153-1166)

ยกเส้นทางที่ดีที่สุดขึ้นมาเป็นอันดับแรก

```go
func SortBestRoute(routes []SwapRoute) []SwapRoute {
    for i, route := range routes {
        if route.HasOrder && route.MatchResult.IsFullMatched() {
            route.IsBestRoute = true
            // ยก route นี้ขึ้นมาอันดับแรก
            sorted = append([]SwapRoute{route}, sorted...)
            break
        }
    }
    return sorted
}
```

**เงื่อนไข Best Route:**
- `HasOrder == true` (มี Order อยู่)
- `MatchResult.IsFullMatched() == true` (Match ครบจำนวน)

---

## Fee Rate Type Selection

```go
feeRateType := enum.MAX_FEE_RATE

if strings.ToLower(route.Name()) == constants.ROUTE_DEALER_EXCHANGE {
    feeRateType = enum.MIN_FEE_RATE  // Dealer ใช้ MIN
}
```

| Route | Fee Rate Type | เหตุผล |
|-------|--------------|----------|
| Bitkub | MAX | เลือก Fee สูงสุด (protect customer) |
| Coinbase | MAX | เลือก Fee สูงสุด |
| dealer | MIN | Dealer ให้ Fee ต่ำสุด (best price) |

### Fee Rate Selection Logic (ละเอียด)

**ไฟล์:** `pkg/order_trade/service_fee_rate.go`

#### GetPossibleFeeRate Function (บรรทัด 17-87)

```go
func (s *orderTradeService) GetPossibleFeeRate(
    request RequestGetPossibleFeeRate,
) ([]ResponseGetPossibleFeeRate, error)
```

**Input Parameters:**
```go
type RequestGetPossibleFeeRate struct {
    CustomerAccountId uuid.UUID              // ID ของบัญชีลูกค้า
    TransactionType   enum.OrderType         // ประเภท transaction (Swap)
    RouteName         *string                // ชื่อ route
    ProductId         uuid.UUID              // ID ของสินทรัพย์
    FeeRateType       enum.FeeRateType       // MIN_FEE_RATE หรือ MAX_FEE_RATE
}
```

**Flow การเลือก Fee Rate:**

```
┌─────────────────────────────────────────────────────────────────┐
│                   GetPossibleFeeRate Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. getProductAndCustomerAccAndTxnFee                           │
│     ├── Get Product โดย ProductId                              │
│     ├── Get Customer Account โดย AccountId                     │
│     └── Get Transaction Fee (FEE_TYPE_FEE)                      │
│                                                                  │
│  2. getPossibleFeeRate                                           │
│     ├── กรอง Fee ที่ match กับ customer_tier                  │
│     ├── กรอง Fee ที่ match กับ route                          │
│     ├── กรอง Fee ที่ match กับ onboarding_day                │
│     └── กรอง Fee ที่ match กับ onboarding_date               │
│                                                                  │
│  3. Get Additional Fee (FEE_TYPE_ADDITIONAL_FEE)                │
│     ├── ดึง additional fee list                                │
│     └── หา additional fee ที่ match กับ symbol/route          │
│                                                                  │
│  4. validateSelectedFee                                          │
│     ├── MIN_FEE_RATE: เลือก fee ต่ำสุด                       │
│     └── MAX_FEE_RATE: เลือก fee สูงสุด                       │
│                                                                  │
│  5. Return []ResponseGetPossibleFeeRate                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Fee Condition Matching

Fee แต่ละตัวมี `Condition` ที่ใช้ในการ matching:

```go
type ConditionFee struct {
    ParamName string      // "customer_tier", "route", "onboarding_day", "onboarding_date", "symbol"
    Operator  string      // "=", "!=", ">", ">=", "<", "<=", "in"
    Value     interface{} // ค่าที่เปรียบเทียบ
}
```

**Condition Types:**

| ParamName | ความหมาย | ตัวอย่าง Value |
|-----------|-----------|-----------------|
| `customer_tier` | ระดับลูกค้า | "basic", "silver", "gold", "platinum" |
| `route` | ชื่อ route | "dealer", "bitkub", "coinsbit" |
| `symbol` | สัญลักษณ์สกุลเงิน | "BTC", "ETH", "USDT" |
| `onboarding_day` | จำนวนวันหลังเปิดบัญชี | 0, 1, 2, ... (เช็นช่วงเวลา) |
| `onboarding_date` | วันที่เปิดบัญชี | "2024-01-15" |

#### Fee Selection by FeeRateType

**MAX_FEE_RATE (บรรทัด 156-186):**
```go
func setSelectedFeeForMaxType(...):
    - เลือก fee ที่มีค่ามากที่สุด
    - ถ้าเท่ากัน: เลือกตาม Priority (น้อยกว่า = ดีกว่า)
    - ถ้า Priority เท่ากัน: เลือกตาม StartDate (ใหม่กว่า = ดีกว่า)
```

**MIN_FEE_RATE (บรรทัด 188-218):**
```go
func setSelectedFeeForMinType(...):
    - เลือก fee ที่มีค่าน้อยที่สุด
    - ถ้าเท่ากัน: เลือกตาม Priority (น้อยกว่า = ดีกว่า)
    - ถ้า Priority เท่ากัน: เลือกตาม StartDate (ใหม่กว่า = ดีกว่า)
```

#### Additional Fee

Fee ประเภท `FEE_TYPE_ADDITIONAL_FEE` จะถูกเพิ่มเข้าไปใน base fee:

```go
// ถ้า base fee ไม่ได้ include additional fee แล้ว
if !isIncludeAdditionalFee && hasMatchedAdditionalFee {
    calculatedFeeValue = baseFeeValue + additionalFeeValue
}
```

#### CalculateTotalFeeRate Function (บรรทัด 390-398)

```go
func (s *orderTradeService) CalculateTotalFeeRate(
    feeRate []ResponseGetPossibleFeeRate,
) decimal.Decimal {
    sum := decimal.Zero
    for _, fee := range feeRate {
        sum = sum.Add(fee.FeeValue)
    }
    return sum
}
```

รวม fee ทั้งหมด (base fee + additional fee) ให้เป็น fee rate รวม

```go
feeRateType := enum.MAX_FEE_RATE

if strings.ToLower(route.Name()) == constants.ROUTE_DEALER_EXCHANGE {
    feeRateType = enum.MIN_FEE_RATE  // Dealer ใช้ MIN
}
```

| Route | Fee Rate Type | เหตุผล |
|-------|--------------|----------|
| Bitkub | MAX | เลือก Fee สูงสุด (protect customer) |
| Coinbase | MAX | เลือก Fee สูงสุด |
| dealer | MIN | Dealer ให้ Fee ต่ำสุด (best price) |

---

## ตัวอย่างการทำงาน

### Example 1: BUY BTC with THB

```
Input:
- Pair: "BTC-THB"
- Unit: 50,000 THB
- Side: BUY
- IdentificationId: xxx

Process:
┌─────────────────────────────────────────────────────────────────┐
│ 1. Check Minimum Amount                                         │
│    Minimum = 50 THB ✓ (50,000 > 50)                             │
├─────────────────────────────────────────────────────────────────┤
│ 2. Get Routes from Remarketer                                   │
│    - Bitkub: Rate 2,000,000, Liquidity 1,000,000                │
│    - dealer: Rate 1,995,000, Liquidity 5,000,000                │
├─────────────────────────────────────────────────────────────────┤
│ 3. Calculate each Route                                         │
│                                                                  │
│    Bitkub Route:                                                 │
│    - Fee Rate (MAX): 0.15%                                      │
│    - Fee = 50,000 × 0.0015 / 1.0015 = 74.89 THB                 │
│    - Net Amount = (50,000 - 74.89) / 2,000,000                   │
│                  = 0.02496255 BTC                               │
│                                                                  │
│    dealer Route:                                                 │
│    - Fee Rate (MIN): 0.10%                                      │
│    - Fee = 50,000 × 0.0010 / 1.0010 = 49.95 THB                 │
│    - Net Amount = (50,000 - 49.95) / 1,995,000                   │
│                  = 0.02506203 BTC                               │
├─────────────────────────────────────────────────────────────────┤
│ 4. Sort by NetAmount (DESC)                                     │
│    1. dealer: 0.02506203 BTC ← Best                            │
│    2. Bitkub: 0.02496255 BTC                                    │
└─────────────────────────────────────────────────────────────────┘

Output:
{
  "routes": [
    {
      "name": "dealer",
      "exchangeName": "Dealer Exchange",
      "rate": 1995000,
      "netAmount": 0.02506203,
      "netAmountDisplay": "0.02506203 BTC",
      "transactionFeeRatePercentage": 0.10,
      "transactionFeeAmount": 49.95,
      "isBestRoute": true,
      "hasOrder": true,
      "matchResult": "FULL_MATCHED"
    },
    {
      "name": "Bitkub",
      "exchangeName": "Bitkub",
      "rate": 2000000,
      "netAmount": 0.02496255,
      "netAmountDisplay": "0.02496255 BTC",
      "transactionFeeRatePercentage": 0.15,
      "transactionFeeAmount": 74.89,
      "isBestRoute": false,
      "hasOrder": true,
      "matchResult": "FULL_MATCHED"
    }
  ],
  "minimumAmount": 50,
  "minimumAmountDisplay": "50.00 THB"
}
```

---

### Example 2: SELL BTC for THB

```
Input:
- Pair: "BTC-THB"
- Unit: 0.05 BTC
- Side: SELL
- IdentificationId: xxx

Process:
┌─────────────────────────────────────────────────────────────────┐
│ 1. Get Remarketer Routes                                        │
│    - dealer: Matched 100,000 THB                               │
│    - Bitkub: Matched 99,500 THB                                │
├─────────────────────────────────────────────────────────────────┤
│ 2. Calculate SELL Fee & Net Amount                              │
│                                                                  │
│    dealer Route:                                                 │
│    - Matched: 100,000 THB                                       │
│    - Fee Rate (MIN): 0.10%                                      │
│    - Fee = 100,000 × 0.0010 = 100.00 THB                       │
│    - Net Amount = 100,000 - 100 = 99,900.00 THB                │
│                                                                  │
│    Bitkub Route:                                                 │
│    - Matched: 99,500 THB                                        │
│    - Fee Rate (MAX): 0.15%                                      │
│    - Fee = 99,500 × 0.0015 = 149.25 THB                        │
│    - Net Amount = 99,500 - 149.25 = 99,350.75 THB              │
├─────────────────────────────────────────────────────────────────┤
│ 3. Sort by NetAmount (DESC)                                     │
│    1. dealer: 99,900.00 THB ← Best                             │
│    2. Bitkub: 99,350.75 THB                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

### Example 3: จำนวนน้อยกว่าขั้นต่ำ

```
Input:
- Pair: "BTC-THB"
- Unit: 30 THB
- Side: BUY

Output:
{
  "routes": [],
  "minimumAmount": 50,
  "minimumAmountDisplay": "50.00 THB"
}
```

---

## Liquidity Config

ระบบใช้ `GetDigitalAssetLiquidityMaxConfigBySymbol` เพื่อตรวจสอบสภาพคล่องตัว:

```go
liquidityConfig, err := s.saleRepository.GetDigitalAssetLiquidityMaxConfigBySymbol(symbol)
```

- **BUY**: ใช้ Quote Currency (THB)
- **SELL**: ใช้ Base Currency (BTC)

Liquidity ใช้แสดงปริมาณที่ Exchange รองรับ

---

## Error Handling

### Error Messages จาก GetSwapRoutes

| Error Message | เหตุผล | Source |
|---------------|---------|--------|
| `fail to get minimum amount for swap` | ไม่สามารถดึง Config ขั้นต่ำได้ | service.go:1093 |
| `no sources available` | ไม่มีเส้นทางให้แลกเปลี่ยน | service.go:1116 |
| `fail to get swap routes` | Remarketer Service มีปัญหา | service.go:1112 |
| `no rate available` | Rate = 0 หรือไม่มี Rate | service.go:1132 |

### Error Messages จาก GetSwapBuyRouteWithNewRemarketer

| Error Message | เหตุผล | Source |
|---------------|---------|--------|
| `getSwapCustomerInformation` | ไม่สามารถดึงข้อมูลลูกค้า | service.go:1224 |
| `GetWalletAccount` | ไม่พบ wallet account | service.go:1229 |
| `GetBySymbol` | ไม่พบสินทรัพย์ | service.go:1234 |
| `GetPossibleFeeRate` | ไม่สามารถคำนวณ fee rate | service.go:1253 |
| `no fee rate available` | ไม่มี Fee Rate ให้ใช้ | service.go:1257 |
| `fail to get digital asset liquidity max config` | ไม่สามารถดึง Liquidity Config | service.go:1269 |
| `fail to get product digital asset extension` | ไม่สามารถดึง decimal digit config | service.go:1274 |

### Error Messages จาก GetSwapSellRouteWithNewRemarketer

| Error Message | เหตุผล | Source |
|---------------|---------|--------|
| เหมือน BUY route | - | service.go:1315-1358 |

### Error Messages จาก getMinimumAmountForSwap

| Error Message | เหตุผล | Source |
|---------------|---------|--------|
| `failed to get minimum amount for swap` | ไม่สามารถดึง DigitalAssetTransactionConfig | service.go:1174 |
| `failed to get product by symbol` | ไม่พบสินทรัพย์ | service.go:1190 |
| `failed to get last trade price for product` | ไม่สามารถดึงราคาล่าสุด | service.go:1195 |
| `failed to get product digital asset extension` | ไม่สามารถดึง decimal digit | service.go:1200 |

### Error Messages จาก Remarketer Service

| Error Message | เหตุผล | Source |
|---------------|---------|--------|
| `fail to get routes while parse url` | URL ไม่ถูกต้อง | new_remarketer.go:82 |
| `fail to get routes while marshal payload` | Payload ไม่สามารถแปลงเป็น JSON | new_remarketer.go:93 |
| `fail to get routes: response status` | API ตอบกลับด้วย status ไม่ใช่ 200 | new_remarketer.go:107 |
| `fail to get routes while unmarshal response` | Response ไม่สามารถแปลงเป็น struct | new_remarketer.go:113 |
| `fail to get routes: no sources available` | ไม่มี route ให้เลือก | - |

### Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Error Handling Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Minimum Amount Check                                         │
│     └── ถ้า Input < Minimum → คืนค่า Routes ว่าง (ไม่ error) │
│                                                                  │
│  2. Get Routes                                                   │
│     └── ถ้า len(routes) == 0 → error "no sources available"    │
│                                                                  │
│  3. Loop Each Route                                              │
│     ├── ถ้า Rate <= 0 → continue (ข้าม route นี้)            │
│     └── ถ้า error = ErrNoRateAvailable → continue              │
│                                                                  │
│  4. Fee Rate Calculation                                         │
│     └── ถ้า len(feeRate) == 0 → error "no fee rate available" │
│                                                                  │
│  5. Liquidity Config                                             │
│     └── Log error แต่คืน error กลับไป                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Handler Layer

**ไฟล์:** `handler/order_trade_handler.go` (บรรทัด 687-805)

### HTTP Endpoint

```
POST /api/v1/order-trade/routes/inquiry
```

### Request Format

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Body:**
```json
{
  "pair": "BTC-THB",
  "unit": "50000",
  "side": "BUY",
  "identification_id": "uuid-of-customer"
}
```

### Response Format

**Success (200 OK):**
```json
{
  "code": "200",
  "message": "success",
  "data": {
    "routes": [
      {
        "name": "dealer",
        "exchange_name": "Dealer Exchange",
        "symbol": "BTC",
        "rate": "1995000",
        "liquidity": "5000000",
        "transaction_fee_rate_percentage": "0.10",
        "transaction_fee_amount": "49.95",
        "net_amount": "0.02506203",
        "net_amount_display": "0.02506203 BTC",
        "is_best_route": true,
        "has_order": true,
        "match_result": "full"
      },
      {
        "name": "bitkub",
        "exchange_name": "Bitkub",
        "symbol": "BTC",
        "rate": "2000000",
        "liquidity": "1000000",
        "transaction_fee_rate_percentage": "0.15",
        "transaction_fee_amount": "74.89",
        "net_amount": "0.02496255",
        "net_amount_display": "0.02496255 BTC",
        "is_best_route": false,
        "has_order": true,
        "match_result": "full"
      }
    ],
    "minimum_amount": "50",
    "minimum_amount_display": "50.00 THB"
  }
}
```

**Amount Below Minimum (200 OK):**
```json
{
  "code": "200",
  "message": "success",
  "data": {
    "routes": [],
    "minimum_amount": "50",
    "minimum_amount_display": "50.00 THB"
  }
}
```

**Error Examples:**

```json
// 400 Bad Request - Invalid pair format
{
  "code": "400",
  "message": "invalid pair format"
}

// 500 Internal Server Error - No sources available
{
  "code": "500",
  "message": "no sources available"
}

// 500 Internal Server Error - Fee rate not available
{
  "code": "500",
  "message": "no fee rate available"
}
```

---

## สรุป

### หลักการทำงานหลัก

1. **GetSwapRoutes** คืนค่าเส้นทางแลกเปลี่ยนทั้งหมดเรียงตาม NetAmount
2. **Dealer Route** ใช้ `MIN_FEE_RATE` (Fee ต่ำสุด)
3. **Exchange Routes** (Bitkub, Coinbase) ใช้ `MAX_FEE_RATE` (Fee สูงสุด)
4. **Best Route** = เส้นทางที่มี `HasOrder = true` และ `FullMatched`
5. **BUY**: Fee คิดจากจำนวนที่ซื้อ / (1 + FeeRate)
6. **SELL**: Fee คิดจากจำนวนที่ขาย × FeeRate

### Quick Reference

| หัวข้อ | ค่า/ตำแหน่ง |
|--------|--------------|
| Main Function | `GetSwapRoutes()` (service.go:1088-1152) |
| HTTP Endpoint | `POST /api/v1/order-trade/routes/inquiry` |
| Handler | `order_trade_handler.go:687-805` |
| Remarketer Service | `third_party/remarketer/new_remarketer.go` |
| Fee Rate Logic | `service_fee_rate.go:17-509` |

### BUY vs SELL Comparison

| ด้าน | Fee Calculation | Net Amount Calculation | Minimum From |
|------|-----------------|------------------------|--------------|
| **BUY** | `amount × fee% / (1 + fee%)` | `(amount - fee) / rate` | Config THB amount |
| **SELL** | `Round(matched, 2) × fee%` | `Round(matched, 2) - fee` | Config / MarketPrice |

### Route Priority

```
Best Route Priority:
1. HasOrder = true และ MatchResult = full → เป็น Best Route
2. เรียงตาม NetAmount (มาก → น้อย)
```

### Fee Rate Types

| Fee Rate Type | ใช้กับ | เหตุผล |
|--------------|---------|---------|
| `MIN_FEE_RATE` | dealer | ให้ราคาดีที่สุดแก่ลูกค้า |
| `MAX_FEE_RATE` | bitkub, coinsbit, etc | Protection สำหรับลูกค้า |

### Route Match Results

| Match Result | ความหมาย | IsFullMatched() |
|--------------|-----------|-----------------|
| `full` | Match ครบทั้งหมด | ✅ true |
| `partial` | Match ได้บางส่วน | ❌ false |
| `no` | ไม่มี liquidity | ❌ false |

### Key Formulas

**BUY Fee:**
```
FeeAmount = amount × (feeRate / 100) / (1 + feeRate / 100)
FeeAmount = RoundDown(FeeAmount, 2)

NetAmount = (amount - FeeAmount) / rate
```

**SELL Fee:**
```
Matched = Round(MatchedBookAmount, 2)
FeeAmount = Matched × (feeRate / 100)
FeeAmount = RoundDown(FeeAmount, 2)

NetAmount = Matched - FeeAmount
```

**Market Price:**
```
MarketPrice = DA.NavPU × FX.NavPU
```

### Dependencies

| Service | ใช้สำหรับ |
|---------|-----------|
| Remarketer Service | ดึง routes, ทำ trade, ยกเลิก order |
| Credential Centric | ขอ Access Token |
| Product Service | ดึงข้อมูลสินทรัพย์ |
| Customer Service | ดึงข้อมูลลูกค้า |
| Transaction Fee Repo | ดึง fee configuration |
| Digital Asset Mark to Market | ดึงราคาสินทรัพย์ |
| FX Mark to Market | ดึงอัตราแลกเปลี่ยน |
| Liquidity Config | ดึงขีดจำกัดสภาพคล่อง |

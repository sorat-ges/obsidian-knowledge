# GetSwapRoutes - คำอธิบายรายละเอียด

## ภาพรวม

`GetSwapRoutes` เป็นฟังก์ชันสำหรับค้นหาเส้นทางการแลกเปลี่ยน (Swap Routes) ที่ดีที่สุดสำหรับผู้ใช้ โดยจะคืนค่าเส้นทางทั้งหมดที่ใช้ได้ พร้อมคำนวณ Fee และจำนวนที่จะได้รับสุทธิ (Net Amount)

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1077-1141)

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

---

## โฟลว์การทำงาน

```
┌─────────────────────────────────────────────────────────────────┐
│                      GetSwapRoutes                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. getMinimumAmountForSwap                                     │
│     ├── ตรวจสอบจำนวนขั้นต่ำ                                  │
│     └── ถ้า Input < Minimum → คืนค่า Routes ว่าง              │
│                                                                  │
│  2. newRemarketerService.GetRoutes                              │
│     ├── ดึงเส้นทางที่เป็นไปได้ทั้งหมด                       │
│     └── ถ้าไม่มีเส้นทาง → error "no sources available"       │
│                                                                  │
│  3. วนลูปแต่ละ RemarketerRoute                                │
│     ├── ตรวจสอบ Rate > 0                                       │
│     ├── BUY: GetSwapBuyRouteWithNewRemarketer                   │
│     └── SELL: GetSwapSellRouteWithNewRemarketer                 │
│                                                                  │
│  4. Sort Routes by NetAmount (มาก → น้อย)                     │
│                                                                  │
│  5. SortBestRoute                                               │
│     └── ยก Best Route ขึ้นมาอยู่อันดับแรก                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## รายละเอียดแต่ละขั้นตอน

### Step 1: getMinimumAmountForSwap (บรรทัด 1157-1201)

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

### Step 3: GetSwapBuyRouteWithNewRemarketer (บรรทัด 1203-1292)

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

### Step 4: GetSwapSellRouteWithNewRemarketer (บรรทัด 1294-1369)

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

### Step 5: Sort Routes (บรรทัด 1132-1134)

เรียงลำดับเส้นทางตาม NetAmount จากมากไปน้อย

```go
slices.SortFunc(routes, func(a SwapRoute, b SwapRoute) int {
    return b.NetAmount.Compare(a.NetAmount)
})
```

**เหตุผล:** เส้นทางที่ให้ NetAmount สูงสุด = ดีที่สุดสำหรับลูกค้า

---

### Step 6: SortBestRoute (บรรทัด 1142-1155)

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

| Error | เหตุผล |
|-------|---------|
| `fail to get minimum amount for swap` | ไม่สามารถดึง Config ขั้นต่ำได้ |
| `no sources available` | ไม่มีเส้นทางให้แลกเปลี่ยน |
| `no rate available` | Rate = 0 หรือไม่มี Rate |
| `no fee rate available` | ไม่มี Fee Rate ให้ใช้ |
| `fail to get digital asset liquidity max config` | ไม่สามารถดึง Liquidity Config |

---

## สรุป

1. **GetSwapRoutes** คืนค่าเส้นทางแลกเปลี่ยนทั้งหมดเรียงตาม NetAmount
2. **Dealer Route** ใช้ `MIN_FEE_RATE` (Fee ต่ำสุด)
3. **Exchange Routes** (Bitkub, Coinbase) ใช้ `MAX_FEE_RATE` (Fee สูงสุด)
4. **Best Route** = เส้นทางที่มี `HasOrder = true` และ `FullMatched`
5. **BUY**: Fee คิดจากจำนวนที่ซื้อ / (1 + FeeRate)
6. **SELL**: Fee คิดจากจำนวนที่ขาย × FeeRate

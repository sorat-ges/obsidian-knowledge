---
title: Best Route Logic
tags: [trading, architecture, swap]
status: active
created: 2026-02-01
last-updated: 2026-02-12
---

# Best Route Logic

**Navigation**: [[Home]] | Trade

## ภาพรวม

Best Route คือเส้นทางการแลกเปลี่ยนที่ดีที่สุดสำหรับลูกค้า ถูกคัดเลือกโดยระบบจากเส้นทางทั้งหมดที่มี

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1132-1155)

---

## โฟลว์สรุป

```
┌─────────────────────────────────────────────────────────────────┐
│                      GetSwapRoutes                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. คำนวณ NetAmount ของทุก Route                               │
│     ├── BUY: (amount - fee) / rate                             │
│     └── SELL: matchedBookAmount - fee                           │
│                                                                  │
│  2. Sort Routes by NetAmount (DESC)                            │
│     └── มากสุด → น้อยสุด                                      │
│                                                                  │
│  3. SortBestRoute                                              │
│     └── ตั้งค่า IsBestRoute = true สำหรับ Route แรกที่ Match    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Sort by NetAmount (DESC)

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1132-1134)

```go
slices.SortFunc(routes, func(a SwapRoute, b SwapRoute) int {
    return b.NetAmount.Compare(a.NetAmount)
})
```

### ผลลัพธ์:

```
ก่อน Sort:
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ Bitkub   │ 0.02480 BTC │ true         │ FULL_MATCHED│
│ dealer   │ 0.02506 BTC │ true         │ FULL_MATCHED│
│ Coinbase │ 0.02490 BTC │ true         │ PARTIAL     │
└──────────┴─────────────┴──────────────┴─────────────┘

หลัง Sort (DESC by NetAmount):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ FULL_MATCHED│ ← อันดับ 1
│ Coinbase │ 0.02490 BTC │ true         │ PARTIAL     │ ← อันดับ 2
│ Bitkub   │ 0.02480 BTC │ true         │ FULL_MATCHED│ ← อันดับ 3
└──────────┴─────────────┴──────────────┴─────────────┘
```

---

## Step 2: SortBestRoute (เลือก Best Route)

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1142-1155)

```go
func SortBestRoute(routes []SwapRoute) []SwapRoute {
    var sorted []SwapRoute
    for i, route := range routes {
        // เงื่อนไข Best Route
        if route.HasOrder && route.MatchResult.IsFullMatched() {
            route.IsBestRoute = true
            sorted = append([]SwapRoute{route}, sorted...)
            sorted = append(sorted, routes[i+1:]...)
            break  // ← หยุดเมื่อเจอตัวแรก
        } else {
            sorted = append(sorted, route)
        }
    }
    return sorted
}
```

### เงื่อนไข Best Route:

| เงื่อนไข | คำอธิบาย |
|----------|----------|
| `HasOrder == true` | มี Order ค้างอยู่ในระบบ |
| `MatchResult.IsFullMatched() == true` | Match ได้จำนวนเต็มที่ต้องการ |

---

## ตัวอย่างการทำงาน

### Case 1: Best Route 1 ตัว (ปกติ)

```
หลัง Sort by NetAmount (DESC):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ FULL ✓      │ ← เจอแล้ว
│ Bitkub   │ 0.02500 BTC │ true         │ FULL ✓      │
│ Coinbase │ 0.02480 BTC │ true         │ PARTIAL ✗   │
└──────────┴─────────────┴──────────────┴─────────────┘

ผลลัพธ์:
┌──────────┬─────────────┬──────────────┐
│ Route    │ IsBestRoute │ หมายเหตุ        │
├──────────┼─────────────┼──────────────┤
│ dealer   │ true        │ ✓ Best Route │
│ Bitkub   │ false       │              │
│ Coinbase │ false       │              │
└──────────┴─────────────┴──────────────┘
```

---

### Case 2: Best Route ที่ NetAmount ไม่สูงสุด

```
หลัง Sort by NetAmount (DESC):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ false        │ FULL ✓      │ ✗ ไม่มี Order
│ Bitkub   │ 0.02500 BTC │ true         │ FULL ✓      │ ← เจอ!
│ Coinbase │ 0.02480 BTC │ true         │ PARTIAL ✗   │
└──────────┴─────────────┴──────────────┴─────────────┘

ผลลัพธ์:
┌──────────┬─────────────┬──────────────┐
│ Route    │ IsBestRoute │ หมายเหตุ        │
├──────────┼─────────────┼──────────────┤
│ dealer   │ false       │ ไม่มี Order   │
│ Bitkub   │ true        │ ✓ Best Route │
│ Coinbase │ false       │              │
└──────────┴─────────────┴──────────────┘
```

**หมายเหตุ:** Bitkub กลายเป็น Best Route แม้ NetAmount จะน้อยกว่า dealer
เพราะ dealer ไม่มี Order (`HasOrder = false`)

---

### Case 3: ไม่มี Best Route (ทุก Route ไม่ Match)

```
หลัง Sort by NetAmount (DESC):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ PARTIAL ✗   │
│ Bitkub   │ 0.02500 BTC │ true         │ PARTIAL ✗   │
│ Coinbase │ 0.02480 BTC │ false        │ PARTIAL ✗   │
└──────────┴─────────────┴──────────────┴─────────────┘

ผลลัพธ์:
┌──────────┬─────────────┐
│ Route    │ IsBestRoute │
├──────────┼─────────────┤
│ dealer   │ false       │
│ Bitkub   │ false       │
│ Coinbase │ false       │
└──────────┴─────────────┘

ไม่มี Best Route เลย (ทุกตัว IsBestRoute = false)
```

---

### Case 4: Full Matched หลายตัว (ปัญหาในปัจจุบัน)

```
หลัง Sort by NetAmount (DESC):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ FULL ✓      │ ← เจอ!
│ Bitkub   │ 0.02500 BTC │ true         │ FULL ✓      │ ✗ ถูกข้าม
│ Coinbase │ 0.02480 BTC │ true         │ PARTIAL ✗   │
└──────────┴─────────────┴──────────────┴─────────────┘

ผลลัพธ์:
┌──────────┬─────────────┬──────────────┐
│ Route    │ IsBestRoute │ หมายเหตุ        │
├──────────┼─────────────┼──────────────┤
│ dealer   │ true        │ ✓ Best #1    │
│ Bitkub   │ false       │ ✗ ถูกข้าม   │
│ Coinbase │ false       │              │
└──────────┴─────────────┴──────────────┘
```

**ปัญหา:** Bitkub ที่ Match เต็มจำนวนก็ไม่ได้เป็น Best Route
เพราะ function ใช้ `break` หลังจากเจอตัวแรก

---

## ข้อจำกัดในปัจจุบัน

### 1. Best Route ได้เพียง 1 ตัวเสมอ

เนื่องจากมี `break` ใน loop:

```go
if route.HasOrder && route.MatchResult.IsFullMatched() {
    route.IsBestRoute = true
    // ...
    break  // ← ออกทันทีเมื่อเจอตัวแรก
}
```

### 2. Route ที่ Full Matched แต่ NetAmount น้อยกว่า จะไม่ถูกเลือก

ถ้า Route อันดับ 1 ไม่ Full Matched:
- Route อันดับ 2 ที่ Full Matched จะถูกเลือก
- แม้ Route อื่นจะ NetAmount สูงกว่า

---

## ถ้าต้องการรองรับหลาย Best Routes

### วิธีที่ 1: ตัด break ออก

```go
func SortBestRoute(routes []SwapRoute) []SwapRoute {
    sorted := make([]SwapRoute, 0, len(routes))

    for _, route := range routes {
        // ทำเครื่องหมายทุก Route ที่ Full Matched
        if route.HasOrder && route.MatchResult.IsFullMatched() {
            route.IsBestRoute = true
        }
        sorted = append(sorted, route)
    }
    return sorted
}
```

### ผลลัพธ์:

```
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ FULL ✓      │
│ Bitkub   │ 0.02500 BTC │ true         │ FULL ✓      │
│ Coinbase │ 0.02480 BTC │ true         │ PARTIAL ✗   │
└──────────┴─────────────┴──────────────┴─────────────┘

↓ ผลลัพธ์

┌──────────┬─────────────┐
│ Route    │ IsBestRoute │
├──────────┼─────────────┤
│ dealer   │ true        │ ← Best #1
│ Bitkub   │ true        │ ← Best #2
│ Coinbase │ false       │
└──────────┴─────────────┘
```

---

### วิธีที่ 2: Group Best Routes ขึ้นมาก่อน

```go
func SortBestRoute(routes []SwapRoute) []SwapRoute {
    var bestRoutes []SwapRoute
    var otherRoutes []SwapRoute

    // แยก Best Routes กับ Other Routes
    for _, route := range routes {
        if route.HasOrder && route.MatchResult.IsFullMatched() {
            route.IsBestRoute = true
            bestRoutes = append(bestRoutes, route)
        } else {
            otherRoutes = append(otherRoutes, route)
        }
    }

    // ความต่อ: Best Routes + Other Routes
    sorted := append(bestRoutes, otherRoutes...)
    return sorted
}
```

---

## MatchResult Types

```go
type RouteMatchResult string

const (
    FULL_MATCHED RouteMatchResult = "FULL_MATCHED"
    PARTIAL     RouteMatchResult = "PARTIAL"
    NO_MATCH    RouteMatchResult = "NO_MATCH"
)
```

| Type | คำอธิบาย | เป็น Best Route ได้ไหม |
|------|----------|---------------------|
| `FULL_MATCHED` | Match ครบจำนวนที่ต้องการ | ✓ ได้ |
| `PARTIAL` | Match ได้บางส่วน | ✗ ไม่ได้ |
| `NO_MATCH` | ไม่ Match เลย | ✗ ไม่ได้ |

---

## HasOrder คืออะไร?

`HasOrder` มาจาก Remarketer Route:

```go
type Route interface {
    HasOrder() bool
    // ...
}
```

- `true` = มี Order ค้างอยู่ใน Exchange / มีสินค้าให้แลกเปลี่ยน
- `false` = ไม่มี Order / ไม่มีสินค้า

---

## สรุป Flow แบบเต็ม

```
┌─────────────────────────────────────────────────────────────────┐
│                        GetSwapRoutes                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  คำนวณ NetAmount ของทุก Route                                    │
│  - BUY: (amount - fee) / rate                                    │
│  - SELL: matchedBookAmount - fee                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sort Routes by NetAmount (DESC)                                 │
│  มากสุด ← เรียงลำดับ → น้อยสุด                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SortBestRoute                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ วนลูป Route ทีละตัว:                                       │   │
│  │   if HasOrder && FullMatched:                             │   │
│  │       IsBestRoute = true                                  │   │
│  │       break ← หยุดทันที                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Output: Routes ทั้งหมดพร้อม IsBestRoute                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Takeaways

1. **Sort by NetAmount DESC** เสมอ - Route ที่ให้คุ้มกว่า (NetAmount มาก) มาก่อน
2. **Best Route ได้เพียง 1 ตัว** - เนื่องจากมี `break`
3. **เงื่อนไข Best Route:** `HasOrder = true` AND `FullMatched`
4. **Route ที่ NetAmount สูงสุด ไม่จำเป็น Best Route** - ต้อง Full Matched ด้วย

## Related

- [[Trade/SwapRoute|GetSwapRoutes]] - Route inquiry flow (calls SortBestRoute)
- [[Trade/SwapFee|Swap Fee]] - OrderFee calculation
- [[Trade/Fee-IO|Fee I/O]] - `GetPossibleFeeRate` input/output reference

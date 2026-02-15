---
title: Best Route Logic V2
tags: [trading, architecture, swap, best-route]
status: active
created: 2026-02-12
last-updated: 2026-02-12
---

# Best Route Logic V2

**Navigation**: [[Home]] | Trade | [[Trade/BestRoute|V1 Documentation]]

> **Note:** เอกสารนี้อัปเดตจาก V1 เพื่อให้ตรงกับโค้ดปัจจุบันใน `pkg/order_trade/service.go`
>
> **ความแตกต่างหลัก:**
> - เปลี่ยนจาก `SortBestRoute()` เป็น `finalizeSwapRoutes()`
> - เพิ่มการจัดการ Mixed Route
> - เพิ่ม `IsDealerTrading` flag สำหรับ trim routes

---

## ภาพรวม

Best Route คือเส้นทางการแลกเปลี่ยนที่ดีที่สุดสำหรับลูกค้า ถูกคัดเลือกโดยระบบจากเส้นทางทั้งหมดที่มี

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1195-1265)

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
│  2. finalizeSwapRoutes                                          │
│     ├── 2.1 Sort Routes by NetAmount (DESC)                    │
│     ├── 2.2 Find Mixed Route index (ถ้ามี)                     │
│     ├── 2.3 Find Best Route index (ถ้ามี)                     │
│     └── 2.4 Mark & Move Best Route to front                    │
│                                                                  │
│  3. trimRoutesByDealerPermission                                │
│     └── Dealer: คืนทุก routes | Customer: คืนเฉพาะ route แรก   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Sort by NetAmount (DESC)

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1200-1203)

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
│ Bitkub   │ 0.02480 BTC │ true         │ full        │
│ dealer   │ 0.02506 BTC │ true         │ full        │
│ mixed    │ 0.02500 BTC │ true         │ full        │
│ Coinbase │ 0.02490 BTC │ true         │ partial     │
└──────────┴─────────────┴──────────────┴─────────────┘

หลัง Sort (DESC by NetAmount):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ full        │ ← อันดับ 1
│ mixed    │ 0.02500 BTC │ true         │ full        │ ← อันดับ 2
│ Coinbase │ 0.02490 BTC │ true         │ partial     │ ← อันดับ 3
│ Bitkub   │ 0.02480 BTC │ true         │ full        │ ← อันดับ 4
└──────────┴─────────────┴──────────────┴─────────────┘
```

---

## Step 2: finalizeSwapRoutes (ฟังก์ชันหลัก)

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1195-1232)

```go
func finalizeSwapRoutes(routes []SwapRoute, isDealerTrading bool) []SwapRoute {
    if len(routes) == 0 {
        return routes
    }

    // 1. Sort routes by NetAmount (descending - highest value first)
    slices.SortFunc(routes, func(a SwapRoute, b SwapRoute) int {
        return b.NetAmount.Compare(a.NetAmount)
    })

    // 2. Find Mixed Route and Best Route indices
    mixedIndex := -1
    bestIndex := -1
    for i, route := range routes {
        if mixedIndex == -1 && strings.EqualFold(route.Name, "mixed") &&
           route.HasOrder && route.MatchResult.IsFullMatched() {
            mixedIndex = i
        }
        if bestIndex == -1 && route.HasOrder && route.MatchResult.IsFullMatched() {
            bestIndex = i
        }
        if mixedIndex >= 0 && bestIndex >= 0 {
            break
        }
    }

    // 3. Handle Mixed Route (ถ้ามี)
    if mixedIndex >= 0 {
        if isDealerTrading {
            markBestRouteExcludingMixed(routes)
        }
        return trimRoutesByDealerPermission(
            moveRouteToFront(routes, mixedIndex), isDealerTrading,
        )
    }

    // 4. Handle Best Route (ถ้ามี แต่ไม่มี Mixed)
    if bestIndex >= 0 {
        routes[bestIndex].IsBestRoute = true
        return trimRoutesByDealerPermission(
            moveRouteToFront(routes, bestIndex), isDealerTrading,
        )
    }

    // 5. ไม่มี Best Route
    return trimRoutesByDealerPermission(routes, isDealerTrading)
}
```

---

### 2.1 การหา Mixed Route และ Best Route

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1205-1217)

```go
mixedIndex := -1
bestIndex := -1
for i, route := range routes {
    // หา Mixed Route (ชื่อ "mixed", hasOrder, full matched)
    if mixedIndex == -1 && strings.EqualFold(route.Name, "mixed") &&
       route.HasOrder && route.MatchResult.IsFullMatched() {
        mixedIndex = i
    }
    // หา Best Route (ตัวแรกที่ hasOrder, full matched)
    if bestIndex == -1 && route.HasOrder && route.MatchResult.IsFullMatched() {
        bestIndex = i
    }
    if mixedIndex >= 0 && bestIndex >= 0 {
        break
    }
}
```

### 2.2 markBestRouteExcludingMixed (สำหรับ Dealer Trading)

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1255-1265)

```go
func markBestRouteExcludingMixed(routes []SwapRoute) {
    for i := range routes {
        if strings.EqualFold(routes[i].Name, "mixed") {
            continue  // ข้าม mixed route
        }
        if routes[i].HasOrder && routes[i].MatchResult.IsFullMatched() {
            routes[i].IsBestRoute = true
            return  // หยุดที่ตัวแรกที่เจอ (ไม่ใช่ mixed)
        }
    }
}
```

> **ใช้เมื่อ:** มี Mixed Route และ `IsDealerTrading = true`
>
> **วัตถุประสงค์:** Mark route ที่ดีที่สุดที่ **ไม่ใช่ mixed**

### 2.3 moveRouteToFront

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1234-1243)

```go
func moveRouteToFront(routes []SwapRoute, index int) []SwapRoute {
    if index <= 0 || index >= len(routes) {
        return routes
    }
    sortedRoutes := make([]SwapRoute, 0, len(routes))
    sortedRoutes = append(sortedRoutes, routes[index])     // Route ที่เลือก
    sortedRoutes = append(sortedRoutes, routes[:index]...)  // Routes ก่อนหน้า
    sortedRoutes = append(sortedRoutes, routes[index+1:]...) // Routes หลัง
    return sortedRoutes
}
```

### 2.4 trimRoutesByDealerPermission

**ไฟล์:** `pkg/order_trade/service.go` (บรรทัด 1245-1253)

```go
func trimRoutesByDealerPermission(routes []SwapRoute, isDealerTrading bool) []SwapRoute {
    if isDealerTrading {
        return routes  // Dealer เห็นทุก routes
    }
    if len(routes) > 1 {
        return routes[:1]  // Customer เห็นเฉพาะ route แรก
    }
    return routes
}
```

| ผู้ใช้     | เห็นกี่ routes | คำอธิบาย |
|-----------|----------------|----------|
| Dealer    | ทุก routes      | เพื่อเลือก route แทนลูกค้า |
| Customer  | 1 route         | เฉพาะ route แรกที่ถูกเลือกให้ |

---

## MatchResult Types (อัปเดต V2)

**ไฟล์:** `internal/constants/enum/order_trade_enum.go` (บรรทัด 3-9)

```go
type RouteMatchResult string

const (
    RouteMatchResultFull    RouteMatchResult = "full"      // ← V2: เปลี่ยนจาก "FULL_MATCHED"
    RouteMatchResultPartial RouteMatchResult = "partial"   // ← V2: เปลี่ยนจาก "PARTIAL"
    RouteMatchResultNo      RouteMatchResult = "no"        // ← V2: เปลี่ยนจาก "NO_MATCH"
)

func (r RouteMatchResult) IsFullMatched() bool {
    return r == RouteMatchResultFull
}
```

| Type (V2) | Type (V1) | คำอธิบาย | เป็น Best Route ได้ไหม |
|-----------|-----------|----------|---------------------|
| `full` | `FULL_MATCHED` | Match ครบจำนวนที่ต้องการ | ✓ ได้ |
| `partial` | `PARTIAL` | Match ได้บางส่วน | ✗ ไม่ได้ |
| `no` | `NO_MATCH` | ไม่ Match เลย | ✗ ไม่ได้ |

---

## ตัวอย่างการทำงาน

### Case 1: มี Mixed Route (เป็น Best)

```
หลัง Sort by NetAmount (DESC):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ full        │ ← bestIndex=0
│ mixed    │ 0.02500 BTC │ true         │ full        │ ← mixedIndex=1
│ Coinbase │ 0.02490 BTC │ true         │ partial     │
│ Bitkub   │ 0.02480 BTC │ true         │ full        │
└──────────┴─────────────┴──────────────┴─────────────┘

ผลลัพธ์ (IsDealerTrading = false):
┌──────────┬─────────────┬──────────────┐
│ Route    │ IsBestRoute │ หมายเหตุ        │
├──────────┼─────────────┼──────────────┤
│ mixed    │ false       │ ← ถูกย้ายมาแรกสุด │
└──────────┴─────────────┴──────────────┘
(สำหรับ customer เห็นแค่ 1 route)

ผลลัพธ์ (IsDealerTrading = true):
┌──────────┬─────────────┬──────────────┐
│ Route    │ IsBestRoute │ หมายเหตุ        │
├──────────┼─────────────┼──────────────┤
│ mixed    │ false       │ ← อยู่แรกสุด    │
│ dealer   │ true        │ ← markBestRouteExcludingMixed │
│ Coinbase │ false       │              │
│ Bitkub   │ false       │              │
└──────────┴─────────────┴──────────────┘
```

### Case 2: ไม่มี Mixed Route

```
หลัง Sort by NetAmount (DESC):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ full        │ ← bestIndex=0
│ Bitkub   │ 0.02500 BTC │ true         │ full        │
│ Coinbase │ 0.02490 BTC │ true         │ partial     │
└──────────┴─────────────┴──────────────┴─────────────┘

ผลลัพธ์:
┌──────────┬─────────────┬──────────────┐
│ Route    │ IsBestRoute │ หมายเหตุ        │
├──────────┼─────────────┼──────────────┤
│ dealer   │ true        │ ← Best Route (ย้ายมาแรกสุด) │
│ Bitkub   │ false       │              │
│ Coinbase │ false       │              │
└──────────┴─────────────┴──────────────┘
```

### Case 3: Route แรกไม่ Full Matched

```
หลัง Sort by NetAmount (DESC):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ partial     │ ✗
│ Bitkub   │ 0.02500 BTC │ true         │ full        │ ← bestIndex=1 ✓
│ Coinbase │ 0.02480 BTC │ false        │ full        │ ✗ (ไม่มี Order)
└──────────┴─────────────┴──────────────┴─────────────┘

ผลลัพธ์:
┌──────────┬─────────────┬──────────────┐
│ Route    │ IsBestRoute │ หมายเหตุ        │
├──────────┼─────────────┼──────────────┤
│ Bitkub   │ true        │ ← Best Route (ย้ายมาแรกสุด) │
│ dealer   │ false       │ NetAmount สูงกว่าแต่ไม่ Full Matched │
│ Coinbase │ false       │ ไม่มี Order   │
└──────────┴─────────────┴──────────────┘
```

### Case 4: ไม่มี Best Route (ทุก Route ไม่ Match)

```
หลัง Sort by NetAmount (DESC):
┌──────────┬─────────────┬──────────────┬─────────────┐
│ Route    │ NetAmount   │ HasOrder     │ MatchResult │
├──────────┼─────────────┼──────────────┼─────────────┤
│ dealer   │ 0.02506 BTC │ true         │ partial     │ ✗
│ Bitkub   │ 0.02500 BTC │ true         │ partial     │ ✗
│ Coinbase │ 0.02480 BTC │ false        │ partial     │ ✗
└──────────┴─────────────┴──────────────┴─────────────┘

ผลลัพธ์:
┌──────────┬─────────────┐
│ Route    │ IsBestRoute │
├──────────┼─────────────┤
│ dealer   │ false       │
│ Bitkub   │ false       │
│ Coinbase │ false       │
└──────────┴─────────────┘

mixedIndex = -1, bestIndex = -1
→ ไม่มี Best Route เลย (ทุกตัว IsBestRoute = false)
```

---

## สรุปความแตกต่าง V1 vs V2

| ด้าน | V1 (Doc เดิม) | V2 (Code ปัจจุบัน) |
|------|----------------|-------------------|
| ฟังก์ชันหลัก | `SortBestRoute()` | `finalizeSwapRoutes()` |
| Mixed Route | ไม่รองรับ | รองรับ (พิเศษ) |
| Dealer Trading | ไม่มี flag | มี `IsDealerTrading` |
| Trim Routes | ไม่ทำ | Customer เห็นแค่ 1 route |
| Best Route | เลือกตัวแรก + break | เหมือนกัน (ถ้าไม่มี mixed) |
| RouteMatchResult | `FULL_MATCHED` | `full` |
| | `PARTIAL` | `partial` |
| | `NO_MATCH` | `no` |

---

## Key Takeaways (V2)

1. **Sort by NetAmount DESC** เสมอ - Route ที่ให้คุ้มกว่า (NetAmount มาก) มาก่อน
2. **Mixed Route มีความสำคัญพิเศษ** - ถ้ามี mixed จะถูกย้ายไปหน้าสุดเสมอ
3. **Dealer vs Customer**:
   - Dealer เห็นทุก routes
   - Customer เห็นแค่ route แรกที่ถูกเลือก
4. **เงื่อนไข Best Route:** `HasOrder = true` AND `MatchResult.IsFullMatched()`
5. **Best Route ได้เพียง 1 ตัว** (ยกเว้น mixed + dealer trading อาจมี 2 ตัว)

---

## Related

- [[Trade/SwapRoute|GetSwapRoutes]] - Route inquiry flow
- [[Trade/BestRoute|Best Route V1]] - เอกสารเวอร์ชันเดิม
- [[Trade/SwapFee|Swap Fee]] - OrderFee calculation

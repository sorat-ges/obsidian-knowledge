---
title: Management Fee & Spread
tags: [finance, trading, fees, spread]
status: active
created: 2026-02-01
last-updated: 2026-02-01
---

# Management Fee & Spread

**Navigation**: [[Home]] | Trade

## Overview

ค่าธรรมเนียมการจัดการ (Management Fee) และสเปรด (Spread) เป็นต้นทุนสำคัญในการซื้อขายหลักทรัพย์

## Management Fee (ค่าธรรมเนียมการจัดการ)

### คืออะไร?

ค่าธรรมเนียมที่เก็บจากลูกค้าเพื่อแลกกับบริการจัดการพอร์ตการลงทุน

### ประเภท

| ประเภท | คำอธิบาย | ตัวอย่าง |
|--------|-----------|----------|
| **Front-end Fee** | ค่าธรรมเนียมเมื่อซื้อ | 2-5% ของวงเงินลงทุน |
| **Back-end Fee** | ค่าธรรมเนียมเมื่อขาย | 1-3% ของมูลค่าขาย |
| **Annual Management Fee** | ค่าธรรมเนียมรายปี | 0.5-2% ต่อปี |
| **Performance Fee** | ค่าธรรมเนียมตามผลงาน | 10-20% ของผลกำไร |

### การคำนวณ

```
Annual Fee = Assets Under Management × Fee Rate
Example: 1,000,000 × 1.5% = 15,000 บาท/ปี
```

## Spread (สเปรด)

### คืออะไร?

สเปรด คือ ความต่างระหว่างราคาซื้อ (Bid) และราคาขาย (Ask) ที่เกิดจากการเพิ่มค่าธรรมเนียมลงในอัตราแลกเปลี่ยน (FX Rate)

### โครงสร้าง Spread บน FX Rate

```
        ┌─────────────────────────────────────┐
        │              Spread                 │
        │     (ค่าธรรมเนียมที่เก็บจากลูกค้า)     │
        └─────────────────────────────────────┘
   ↑                                    ↑
Bid Price                           Ask Price
(ราคาที่ระบบซื้อ)                    (ราคาที่ระบบขาย)
   │                                    │
   └────────────┬───────────────────────┘
                │
           Mid Rate
        (ราคากลางตลาด)
```

### สูตรการคำนวณ FX Rate พร้อม Spread

```
Ask Rate (ราคาขายให้ลูกค้า) = FX + round(FX × X%) + Y สตางค์
Bid Rate (ราคาซื้อจากลูกค้า) = FX - round(FX × X%) - Y สตางค์

where:
FX = Mid Rate (ราคากลางตลาด)
X% = เปอร์เซ็นต์สเปรด
Y = จำนวนสตางค์คงที่
round = ปัดเศษทศนิยม 2 ตำแหน่ง
```

### ตัวอย่างการคำนวณ (USD/THB)

**กรณีที่ 1: ใช้เปอร์เซ็นต์ + สตางค์**

| รายการ | ค่า |
|---------|-----|
| **FX (Mid Rate)** | 33.50 บาท/USD |
| **X (Spread %)** | 0.25% |
| **Y (สตางค์)** | 0.25 สตางค์ |
| **round(FX × X%)** | round(33.50 × 0.0025) = round(0.08375) = **0.08** |
| **Ask Rate** | 33.50 + 0.08 + 0.25 = **33.83** บาท/USD |
| **Bid Rate** | 33.50 - 0.08 - 0.25 = **33.17** บาท/USD |

**กรณีที่ 2: ใช้เฉพาะเปอร์เซ็นต์ (Y = 0)**

| รายการ | ค่า |
|---------|-----|
| **FX (Mid Rate)** | 33.50 บาท/USD |
| **X (Spread %)** | 0.30% |
| **Y (สตางค์)** | 0 |
| **round(FX × X%)** | round(33.50 × 0.003) = round(0.1005) = **0.10** |
| **Ask Rate** | 33.50 + 0.10 = **33.60** บาท/USD |
| **Bid Rate** | 33.50 - 0.10 = **33.40** บาท/USD |

### หน่วยของ Spread

| หน่วย | คำอธิบาย | ตัวอย่าง |
|-------|----------|----------|
| **X% (เปอร์เซ็นต์)** | คำนวณจากสัดส่วนของ FX Rate | 0.10%, 0.25%, 0.30% |
| **Y สตางค์** | บวกเพิ่มเป็นจำนวนสตางค์คงที่ | 0.10, 0.25, 0.50 สตางค์ |
| **รวม** | X% + Y (ใช้ร่วมกันได้) | 0.25% + 0.25 สตางค์ |

### การคำนวณ Spread Cost จากการแลกเปลี่ยนเงินตรา

```
กรณีลูกค้าซื้อ USD:
Ask Rate = FX + round(FX × X%) + Y
Spread Cost = (Ask Rate - FX) × USD Amount

ตัวอย่าง:
แลกเปลี่ยน 10,000 USD
FX (Mid Rate) = 33.50
X = 0.25%
Y = 0.25 สตางค์
round(FX × X%) = round(0.08375) = 0.08
Ask Rate = 33.50 + 0.08 + 0.25 = 33.83

ลูกค้าจ่าย: 33.83 × 10,000 = 338,300 บาท
ราคากลาง: 33.50 × 10,000 = 335,000 บาท
─────────────────────────────────
Spread Cost: 3,300 บาท
```

## สูตรคำนวณต้นทุนรวม

```
Total Cost = Management Fee + Spread Cost + Other Fees

Spread Cost (FX) = Spread Rate × Foreign Currency Amount
Spread Cost (Stock) = (Ask Price - Bid Price) × Quantity
```

## Related

- [[Trade/SwapFee|Swap Fee]] - OrderFee calculation
- [[Trade/Fee-Campaign-System|Fee Campaign System]] - Campaign-based fee management

## References

- [Figma Architecture Board](https://www.figma.com/board/2zrIDLt7IyWgnumVwxVhAA/Architecture?node-id=15024-39493&t=el9TZfd9S5IBo0QV-4)

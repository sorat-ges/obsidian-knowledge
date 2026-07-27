---
title: Ledger Event Processing
description: Flow ที่ asset-consumer รับ logical ledger แล้ว materialize balance และต้นทุนใน asset portfolio
capability: Asset Management
services: [asset-consumer, asset-service]
integrations: [kafka]
aliases: [ledger processing, logical ledger consumer, customer logical entry, ประมวลผลบัญชี, อัปเดตพอร์ต]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบายขั้นที่ `asset-consumer` รับ logical ledger จาก business flow ต่าง ๆ แล้วเปลี่ยนเป็น current portfolio state พร้อม audit trail และ cost calculation หน้านี้ไม่กำหนดว่าธุรกรรมต้นทางควรสร้าง ledger อะไร; กฎบัญชีและการสร้าง movement อยู่ที่ flow ต้นทางและ [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)

## Trigger and preconditions

**Owner service: `asset-consumer`**

- Trigger คือข้อความจาก Kafka topic `customer_logical_entry`
- ข้อความต้องมี ledger type, movement direction, account/product และจำนวนที่ใช้ materialize
- master data ที่ใช้ระบุ account/product ต้อง sync แล้ว

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| Upstream business services | สร้าง logical ledger ตามผลของ Trading หรือ Fund Movement |
| Kafka | ส่ง `customer_logical_entry` ให้ consumer |
| `asset-consumer` | Persist audit, apply balance movement, calculate cost และ broadcast การเปลี่ยนแปลง |
| `asset-service` | อ่าน `asset_portfolio` และเปิดเผย balance/report ที่อัปเดต |

## End-to-end sequence

### 1. Consume logical ledger

**Owner service: `asset-consumer`**

รับ event จาก `customer_logical_entry` และเตรียม account/product portfolio ที่เกี่ยวข้อง

### 2. Persist audit trail

**Owner service: `asset-consumer`**

บันทึก logical ledger ลง `dw_order.logical_ledger_transaction`

### 3. Materialize portfolio and cost

**Ledger application and cost-update owner: `asset-consumer`**

อัปเดต `xpg_asset.asset_portfolio` ภายใน database transaction เดียวกับ persistence:

| Ledger type | Movement | ผลต่อ `asset_portfolio` |
| :--- | :--- | :--- |
| `AVAILABLE` | `INCREASE` | เพิ่ม `available_unit_balance` และ `unit_balance` |
| `AVAILABLE` | `DECREASE` | ลด `available_unit_balance` |
| `HOLD_IN_ORDER` | `INCREASE` | เพิ่ม `pending_out_unit_balance` |
| `HOLD_IN_ORDER` | `DECREASE` | ลด `pending_out_unit_balance` และ `unit_balance` เมื่อรายการสำเร็จหรือถูกยกเลิก |
| `PENDING_DEPOSIT` | `INC` / `DEC` | อัปเดต `pending_in_unit_balance` |

- Weighted average: `AverageCost = (TotalCostเดิม + ต้นทุนรายการใหม่) / UnitBalanceรวมใหม่`
- THB ใช้ cost 1.0
- เมื่อ `unit_balance = 0` reset `average_cost` และ `total_cost` เป็น 0

[Ledger and Money Flow](/shared-rules/ledger-and-money-flow/) อธิบายบทบาทบัญชีและกฎการสร้าง movement ที่ business flow ต้นทางต้องรักษา ไม่ใช่ source ของ materialization matrix ในหน้านี้

### 4. Broadcast and expose current state

**Broadcast owner: `asset-consumer`**

ส่งข้อความแจ้ง downstream หลัง update สำเร็จ

**Balance/report owner: `asset-service`**

อ่าน current state จาก portfolio และเปิดเผยผ่าน balance/report flow

## Business rules

- Audit ledger กับ portfolio update ต้องอยู่ใน database transaction เดียวกัน
- Cost ของ THB คงที่ 1.0
- Cost ของสินทรัพย์อื่นใช้ `AverageCost = (TotalCostเดิม + ต้นทุนรายการใหม่) / UnitBalanceรวมใหม่` เมื่อเพิ่ม unit
- การถือครองเป็นศูนย์ต้องล้าง average/total cost
- หน้านี้ consume movement เท่านั้น ไม่เปลี่ยน business outcome ของ order ต้นทาง

## State transitions

**Owner service: `asset-consumer`**

flow นี้ไม่มี order state machine ของตนเอง ลำดับ materialization ที่ยืนยันได้คือ:

```text
event received → audit persisted + portfolio updated → downstream broadcast
```

order ต้นทางเป็นเจ้าของการเปลี่ยนสถานะ เช่น `sync-ledger → completed` หรือ `filled`

## Error and recovery behavior

**Owner service: `asset-consumer`**

- ถ้า audit persistence หรือ portfolio update ล้มเหลว transaction ต้องไม่ทิ้ง partial materialization
- source ไม่ระบุนโยบาย Kafka retry, dead-letter หรือ idempotency จึงต้องตรวจ code และ runtime configuration ก่อนเปลี่ยน recovery
- downstream ควรอ่านยอดใหม่หลัง transaction สำเร็จ ไม่ใช่ระหว่าง apply

## Final outcomes

- สำเร็จ: audit และ portfolio สอดคล้องกัน cost ถูกคำนวณ และ downstream ได้รับการแจ้ง
- ล้มเหลว: ไม่มี partial portfolio update จาก transaction ชุดนั้น

## Related shared rules and flows

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Swap Market Order](/business-flows/trading/swap-market-order/)
- [Swap Limit Order](/business-flows/trading/swap-limit-order/)
- [Fiat Withdrawal](/business-flows/fund-movement/fiat-withdrawal/)
- [Crypto Deposit and Withdrawal](/business-flows/fund-movement/crypto-deposit-and-withdrawal/)
- [Internal Customer Transfer](/business-flows/fund-movement/internal-transfer/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)

## Code references

- `pkg/customer-logical-entry/service.go`
- `dw_order.logical_ledger_transaction`
- `xpg_asset.asset_portfolio`

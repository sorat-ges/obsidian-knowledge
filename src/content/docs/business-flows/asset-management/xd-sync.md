---
title: XD Balance and Cost Sync
description: Flow ซิงค์ยอดและต้นทุนจาก XD เข้า XAS portfolio พร้อม audit และป้องกันยอดติดลบ
capability: Asset Management
services: [asset-consumer, asset-service]
integrations: [XD, kafka]
aliases: [XD sync, balance sync, cost sync, profit and loss sync, ซิงค์ยอด XD, ซิงค์ต้นทุน]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบายการซิงค์ balance และ cost จาก XD เข้า XAS เพื่อให้ portfolio ที่ลูกค้าเห็นสอดคล้องกับระบบภายนอก พร้อมเก็บ audit ของข้อความที่ได้รับ

## Trigger and preconditions

**Owner service: `asset-consumer`**

- Trigger คือ XD balance message หรือ profit-and-loss/cost message
- ต้อง map ลูกค้าด้วย `InvestmentAccountCode`
- product/account ที่เกี่ยวข้องต้องมีข้อมูล master พร้อมใช้งาน

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| XD | Source ของ balance, average cost และ total cost |
| Kafka | ส่ง balance/cost sync messages |
| `asset-consumer` | Audit message, map account, auto-create portfolio และ apply balance/cost |
| `asset-service` | เปิดเผย portfolio หลัง sync |

## End-to-end sequence

### 1. Receive and identify portfolio

**Owner service: `asset-consumer`**

รับข้อความจาก XD และใช้ `InvestmentAccountCode` หา customer portfolio หากไม่มี portfolio ให้สร้างใหม่

### 2. Persist sync audit

**Owner service: `asset-consumer`**

สำเนาข้อความ balance ลง `external_data.sync_balance_xd_real_time`

### 3. Apply balance

**Ledger application owner: `asset-consumer`**

- `AVAILABLE` ปรับ `available_unit_balance`
- `PENDING_DEPOSIT` ปรับ `pending_in_unit_balance`
- `HOLD_IN_ORDER` ปรับ `pending_out_unit_balance`
- คำนวณ `UnitBalance = Available + PendingOut`
- ใช้ `PositiveValue()` ป้องกันผลลัพธ์ติดลบเมื่อ message order ผิด

### 4. Apply cost

**Cost-update owner: `asset-consumer`**

ค่า `average_cost` และ `total_cost` จาก XD overwrite ค่าเดิมใน XAS ทันที

### 5. Expose synchronized portfolio

**Balance/report owner: `asset-service`**

อ่าน portfolio ที่อัปเดตแล้วและคืนให้ client/report flow

## Business rules

- XD เป็น source of truth ของ cost ใน flow นี้
- Cost sync ใช้ overwrite ไม่ใช่ weighted-average merge
- balance ทุกประเภทต้องผ่าน `PositiveValue()`
- ถ้าไม่พบ portfolio ให้ auto-create
- การ map ลูกค้าใช้ `InvestmentAccountCode`

## State transitions

**Owner service: `asset-consumer`**

flow ไม่มี order state; แต่ละข้อความผ่าน:

```text
received → audited → portfolio created/found → balance or cost applied
```

## Error and recovery behavior

**Owner service: `asset-consumer`**

- ถ้า message order ทำให้ค่าติดลบ `PositiveValue()` ต้องป้องกัน negative portfolio
- ถ้า `InvestmentAccountCode` map ไม่ได้ source ไม่ระบุ fallback
- source ไม่ระบุ ordering, retry หรือ deduplication policy จึงต้องตรวจ Kafka/runtime configuration ก่อนเปลี่ยน recovery

## Final outcomes

- Balance message: portfolio balance สะท้อน AVAILABLE/PENDING/HOLD ล่าสุดโดยไม่ติดลบ
- Cost message: XAS average/total cost ตรงกับค่าจาก XD
- Client/report: อ่านค่าที่ sync แล้วผ่าน `asset-service`

## Related shared rules and flows

- [Customer and Product Master-Data Sync](/business-flows/asset-management/master-data-sync/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)

## Code references

- `pkg/xd-balance/service.go`
- `pkg/xd-sync-profit-and-loss/service.go`
- `xpg_asset.asset_portfolio`
- `external_data.sync_balance_xd_real_time`
- Topic reference: `phoenix_dev_sync_profit_and_loss`

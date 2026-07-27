---
title: Internal Customer Transfer
description: Flow โอนสินทรัพย์ระหว่างบัญชีลูกค้าภายในระบบผ่าน White Glove พร้อมรักษายอดและต้นทุนเฉลี่ย
capability: Fund Movement
services: [order-service, asset-service, asset-consumer]
aliases: [internal transfer, customer transfer, white glove transfer, โอนภายใน, โอนระหว่างบัญชีลูกค้า]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบายการโอนสินทรัพย์ระหว่างบัญชีลูกค้าภายในระบบผ่าน Dealer/RM ตั้งแต่ validate, hold, settle, apply ledger และอัปเดต average cost จนคำสั่งจบ

## Trigger and preconditions

**Owner service: `order-service`**

- Trigger ผ่าน White Glove handler `CreateInternalCustomerTransfer`
- Quantity ต้องเป็นค่าบวก
- ต้องระบุบัญชีต้นทาง บัญชีปลายทาง และ product ที่อนุญาต
- Standard Mode ต้องมี available balance เพียงพอ
- Skip Mode ใช้ได้เฉพาะ account ID ใน `SkipBalanceValidateCustomerAccountIDs` และต้องส่ง Price ที่มากกว่า 0

## Participating services

| Service | Responsibility |
| :--- | :--- |
| `order-service` | Business owner: validate, สร้าง `order_transfer`, orchestrate hold/settle, เลือก average cost และสร้าง logical ledger |
| `asset-service` | เปิดเผย source portfolio/available balance สำหรับ validation และยอดหลังจบรายการ |
| `asset-consumer` | Apply ledger ทั้งสองฝั่งและ materialize balance/average cost ใน portfolio |

## End-to-end sequence

### 1. Validate request and source portfolio

**Request owner: `order-service`**

**Portfolio read owner: `asset-service`**

1. ตรวจ Quantity, source/destination account และ allowed product
2. Standard Mode ตรวจ `AvailableUnitBalance` ให้เพียงพอ
3. Skip Mode ข้าม balance validation แต่บังคับ Price override ที่ถูกต้อง
4. เลือกต้นทุน: ใช้ Price override เมื่อส่งมา มิฉะนั้นใช้ `sourcePortfolio.AverageCost` ใน Standard Mode

### 2. Create transfer and hold source balance

**Owner service: `order-service`**

1. สร้าง `order_transfer` สถานะ `open`
2. สร้าง logical ledger ลด `AVAILABLE` และเพิ่ม `HOLD_IN_ORDER` ของบัญชีต้นทาง

### 3. Settle source and destination

**Logical-ledger owner: `order-service`**

สร้าง logical ledger ลด `HOLD_IN_ORDER` ของต้นทางและเพิ่ม `AVAILABLE` ของปลายทาง พร้อมต้นทุนที่เลือกไว้

**Ledger application and cost-update owner: `asset-consumer`**

Apply movement เข้า source/destination portfolio และอัปเดต average cost ตาม [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)

### 4. Finalize and expose balances

**Order owner: `order-service`**

เมื่อ settlement สำเร็จ เปลี่ยน `order_transfer` เป็น `completed`

**Balance/report owner: `asset-service`**

เปิดเผย balance และ cost ที่ materialize แล้วของทั้งสองบัญชี

## Business rules

- Standard Mode ปฏิเสธเมื่อ available balance ไม่พอ
- Skip Mode เป็นข้อยกเว้นเฉพาะ account ที่ config ไว้ ไม่ใช่ behavior ปกติ
- Skip Mode ต้องมี Price มากกว่า 0
- Standard Mode ใช้ average cost ของ source portfolio เมื่อไม่มี override
- Hold และ settle ต้องรักษา movement สองฝั่งให้สอดคล้องตาม [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)

## State transitions

**Owner service: `order-service`**

```text
open → completed
open → failed
```

## Error and recovery behavior

**Owner service: `order-service`**

- Standard Mode ยอดไม่พอ: `ErrInsufficientBalance`
- Skip Mode ไม่มี Price, format ไม่ถูกต้อง หรือ Price น้อยกว่าหรือเท่ากับ 0: `InvalidRequest`
- ถ้า Phase 2 Settle ล้มเหลว ให้ revert Hold จาก `HOLD_IN_ORDER` กลับ `AVAILABLE` ของต้นทาง และจบตาม failure path

## Final outcomes

- สำเร็จ: ต้นทางลดสินทรัพย์ ปลายทางเพิ่มสินทรัพย์ด้วย cost ที่เลือก และ order จบ `completed`
- Validation ไม่ผ่าน: ไม่สร้าง settlement
- Settle ล้มเหลว: revert Hold และ order จบ `failed`

## Related shared rules and flows

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)

## Code references

- `pkg/order_transfer/service.go`
- `pkg/order_transfer/service_internal_ledger.go`
- `InternalCustomerTransfer`
- Tables: `order_transfer`, `ledger_transactions`, `asset_portfolios`

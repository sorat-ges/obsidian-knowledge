---
title: Crypto Deposit and Withdrawal
description: Flow ประมวลผล Fireblocks webhook สำหรับฝากและถอนคริปโตจน ledger และ portfolio อัปเดต
capability: Fund Movement
services: [order-service, asset-consumer, asset-service]
integrations: [fireblocks, blockchain]
aliases: [crypto deposit, crypto withdrawal, Fireblocks hook, ฝากคริปโต, ถอนคริปโต]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบายขอบเขตที่ยืนยันได้ตั้งแต่ `order-service` รับ Fireblocks webhook สำหรับฝากหรือถอนคริปโต ไปจน logical ledger ถูก apply และ portfolio แสดงผล เอกสารต้นทางไม่ได้อธิบายขั้นสร้างคำขอถอนหรือการส่งรายการไป Fireblocks จึงไม่กำหนด behavior ส่วนนั้นเพิ่ม

## Trigger and preconditions

**Callback owner: `order-service`**

- Trigger คือ Fireblocks webhook สำหรับ Deposit หรือ Withdrawal
- ต้องตรวจสอบ signature หรือ token ว่ามาจาก Fireblocks
- ต้องตรวจ idempotency key เช่น TxID หรือ Hook ID ก่อนประมวลผล
- Deposit ต้องมีข้อมูล product เพื่ออ่าน `Depositable`
- Withdrawal ต้องมี order ปัจจุบันที่ใช้ตรวจ state ก่อนอัปเดต

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| Fireblocks / blockchain | ส่งสถานะธุรกรรมฝากหรือถอนผ่าน webhook |
| `order-service` | Business owner ของ callback, validation, order state, transaction record และ logical ledger |
| `asset-consumer` | Apply ledger เข้า portfolio ภายใน transaction และอัปเดต cost materialization |
| `asset-service` | เปิดเผย balance/report หลัง portfolio อัปเดต |

## End-to-end sequence

### Deposit callback

**Callback and orchestration owner: `order-service`**

1. รับและ authenticate Fireblocks webhook
2. ป้องกันการประมวลผลซ้ำด้วย idempotency key
3. อ่าน `Depositable` จาก `product_digital_asset_extension`
4. ถ้า `Depositable = false` ให้ log และหยุดโดยไม่เพิ่มยอดลูกค้า
5. ถ้าผ่าน ให้บันทึก `order_crypto` และสร้าง ledger เพิ่ม `AVAILABLE` ใน `customer_main`

### Withdrawal callback

**Callback and orchestration owner: `order-service`**

1. รับและ authenticate Fireblocks webhook
2. ตรวจ idempotency และสถานะ order ปัจจุบัน
3. เมื่อสำเร็จ เปลี่ยนผ่าน `order-processing → order-verifying → sync-ledger → completed`
4. สร้าง ledger เพื่อยืนยันการลด `PENDING_WITHDRAWAL`
5. เมื่อ Fireblocks รายงานล้มเหลว เปลี่ยนเป็น `cancelled` หรือ `rejected` ตามสาเหตุ และพิจารณา refund/unlock ตาม path ที่รองรับ

### Apply ledger and expose balance

**Ledger application and cost-update owner: `asset-consumer`**

Apply logical ledger เข้า portfolio โดยใช้ transaction เดียวตาม [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)

**Balance/report owner: `asset-service`**

หลัง apply สำเร็จ `asset-service` เปิดเผยยอดฝากที่เพิ่มขึ้นหรือยอดถอนที่ settle แล้ว

## Business rules

- `Depositable = false` เป็น hard stop สำหรับ Deposit แม้ Fireblocks ส่งธุรกรรมเข้ามาแล้ว
- ทุก callback ต้อง idempotent เพื่อป้องกัน double entry
- ต้องตรวจ order state ปัจจุบันก่อนเปลี่ยน state
- `completed` ของ Withdrawal เกิดหลัง `sync-ledger`
- การเขียน order/ledger ที่ต้องสอดคล้องกันควรอยู่ใน database transaction ตามขอบเขตที่ source ระบุ

## State transitions

**Owner service: `order-service`**

```text
Withdrawal success:
order-processing → order-verifying → sync-ledger → completed

Withdrawal failure:
order-processing → cancelled | rejected
```

Deposit source ไม่ได้กำหนด order state sequence; ผลที่ยืนยันได้คือ skip เมื่อห้ามฝาก หรือบันทึกรายการและเพิ่ม available ledger เมื่ออนุญาต

## Error and recovery behavior

**Owner service: `order-service`**

- webhook ซ้ำ: idempotency ต้องป้องกัน double entry
- signature/token ไม่ผ่าน: ห้ามประมวลผล callback
- product ไม่อนุญาตให้ฝาก: log และ skip balance processing
- Withdrawal ล้มเหลว: ใช้ `cancelled` หรือ `rejected`; source ไม่ระบุ mapping ของแต่ละสาเหตุหรือขั้น refund/unlock แบบตายตัว จึงต้องยืนยัน implementation ก่อนแก้

## Final outcomes

- Deposit accepted: มี `order_crypto`, audit ledger และ available asset เพิ่มหลัง `asset-consumer` apply
- Deposit blocked: ไม่มีการเพิ่มยอดลูกค้า
- Withdrawal succeeded: `PENDING_WITHDRAWAL` ถูก settle และ order จบ `completed`
- Withdrawal failed: order จบ `cancelled` หรือ `rejected` ตาม path ที่ยืนยันจาก implementation

## Related shared rules and flows

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Security Rules](/shared-rules/security/)

## Code references

- `pkg/crypto/service.go`
- `HandleDepositCryptoWebhook`
- `HandleWithdrawCryptoWebhook`
- `internal/constants/enum/order_crypto_enum.go`
- Tables: `order_crypto`, `product_digital_asset_extension`, `ledger_transactions`

---
title: Internal Customer Transfer
description: Flow โอนสินทรัพย์ระหว่างบัญชีลูกค้าภายในระบบผ่าน White Glove พร้อมรักษายอดและต้นทุนเฉลี่ย
capability: Fund Movement
services: [order-service, asset-service, asset-consumer, web-portal]
aliases: [internal transfer, customer transfer, white glove transfer, transfer pair not allowed, order transfer audit, transfer audit log, OrderTransferAsset, transfer_failed, xspring_customer_code, order_transfer_configuration, transfer account selection, dealer transfer accounts, treasury transfer accounts, active transfer pair filter, โอนภายใน, โอนระหว่างบัญชีลูกค้า, audit การโอน, คู่บัญชีโอนไม่ได้รับอนุญาต]
errorCodes: ["400", "401", "500"]
status: active
lastUpdated: 2026-09-20
documentType: flow
---

## Purpose and scope

อธิบายการโอนสินทรัพย์ระหว่างบัญชีลูกค้าภายในระบบผ่าน Dealer/RM ตั้งแต่ validate, hold, settle, apply ledger และอัปเดต average cost จนคำสั่งจบ

## Trigger and preconditions

**Owner service: `order-service`**

- Trigger ผ่าน White Glove handler `CreateInternalCustomerTransfer`
- Quantity ต้องเป็นค่าบวก
- ต้องระบุบัญชีต้นทาง บัญชีปลายทาง และ product ที่อนุญาต
- source identification และ destination identification ต้องมี active, non-deleted row ใน `order_transfer_configuration`; pair ที่ไม่ configure รวมถึง pair เดียวกันจะถูกปฏิเสธ
- Standard Mode ต้องมี available balance เพียงพอ
- Skip Mode ใช้ได้เฉพาะ account ID ใน `SkipBalanceValidateCustomerAccountIDs` และต้องส่ง Price ที่มากกว่า 0

## Participating services

| Service | Responsibility |
| :--- | :--- |
| `order-service` | Business owner: validate, สร้าง `order_transfer`, orchestrate hold/settle, เลือก average cost และสร้าง logical ledger |
| `asset-service` | เปิดเผย source portfolio/available balance สำหรับ validation และยอดหลังจบรายการ |
| `asset-consumer` | Apply ledger ทั้งสองฝั่งและ materialize balance/average cost ใน portfolio |
| `web-portal` | Supporting UI/BFF; ส่งคำขอและแสดง pair-not-allowed modal แต่ไม่ตัดสินสิทธิ์ของ pair |

## End-to-end sequence

### 1. Select eligible transfer accounts

**Owner and executing service: `order-service`**

**Supporting client: `web-portal`**

ก่อน create path จะเปิดตัวเลือกบัญชีตาม feature ที่ใช้:

- `GET /api/v1/white-glove/transfer/accounts` (P0291, feature `dealer_transfer`) คืน dealer accounts และ brokerage account; dealer accounts ไม่ถูกกรองด้วย transfer-pair configuration แต่บัญชี treasury ที่แสดงเป็น destination ถูกจำกัดด้วย active/non-deleted pair จาก brokerage identification ไปยัง treasury identification
- `GET /api/v1/treasury/internal-transfer/accounts` (P0302, feature `treasury_transfer`) resolve treasury source ที่ configure ไว้, อ่าน active configuration rows จาก source ไปยัง destination, โหลด dealer customer accounts แล้วกรองเหลือเฉพาะ destination identification ที่อนุญาต พร้อมตัด treasury source account ออกจากผลลัพธ์
- ถ้าไม่พบ treasury source, configuration หรือ destination ที่อนุญาต endpoint treasury คืนรายการว่าง; การ prefilter ใน read path นี้ไม่แทนการตรวจ pair ซ้ำใน create path

`web-portal` ใช้ผลลัพธ์นี้เพื่อแสดง account selector เท่านั้น ส่วน `order-service` ยังคงเป็น owner ของ eligibility และ validation

### 2. Validate request and source portfolio

**Request owner: `order-service`**

**Portfolio read owner: `asset-service`**

1. ตรวจ Quantity, source/destination account และ allowed product
2. resolve destination account แล้วตรวจ source/destination identification pair กับ active, non-deleted `order_transfer_configuration`
3. Standard Mode ตรวจ `AvailableUnitBalance` ให้เพียงพอ
4. Skip Mode ข้าม balance validation แต่บังคับ Price override ที่ถูกต้อง
5. เลือกต้นทุน: ใช้ Price override เมื่อส่งมา มิฉะนั้นใช้ `sourcePortfolio.AverageCost` ใน Standard Mode

### 3. Create transfer and hold source balance

**Owner service: `order-service`**

1. สร้าง `order_transfer` สถานะ `open`
2. สร้าง logical ledger ลด `AVAILABLE` และเพิ่ม `HOLD_IN_ORDER` ของบัญชีต้นทาง

### 4. Settle source and destination

**Logical-ledger owner: `order-service`**

สร้าง logical ledger ลด `HOLD_IN_ORDER` ของต้นทางและเพิ่ม `AVAILABLE` ของปลายทาง พร้อมต้นทุนที่เลือกไว้

**Ledger application and cost-update owner: `asset-consumer`**

Apply movement เข้า source/destination portfolio และอัปเดต average cost ตาม [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)

### 5. Finalize and expose balances

**Order owner: `order-service`**

เมื่อ settlement สำเร็จ เปลี่ยน `order_transfer` เป็น `completed`

**Balance/report owner: `asset-service`**

เปิดเผย balance และ cost ที่ materialize แล้วของทั้งสองบัญชี

### 6. Record transfer audit trail

**Owner service: `order-service`**

**Executing service: `order-service`**

`CreateInternalTransfer` และ `CreateDealerOrderTransfer` เตรียม audit request แล้วบันทึกผ่าน `auditLogSvc` ใน handler ก่อนคืนผลลัพธ์ให้ client การบันทึกนี้เป็น side effect สำหรับ trace request ไม่ใช่ ledger movement หรือ state transition ของ `order_transfer`

- ถ้า bind body, parse UUID หรือ validation ของ handler ไม่ผ่าน ระบบบันทึก audit หนึ่งรายการเป็น `WEARE_WEB` / `OrderTransferAsset` / `Confirm` / `fail` โดยใช้ `Detail = transfer_failed` และบังคับ `customer_code` เป็นค่าว่าง
- หลัง service resolve account แล้ว `orderTransferService` หา `xspring_customer_code` จาก source และ destination identification แล้วคืนเฉพาะ code ที่ไม่ซ้ำใน `AuditCustomerCodes`; internal transfer จึงอาจได้สองรายการ ส่วน dealer transfer ที่ใช้ customer account เดียวกันได้หนึ่งรายการ
- สำเร็จ: บันทึก audit หนึ่งรายการต่อ code ด้วย `Result = success` และ detail `order_id: <order id>`; ไม่สำเร็จหลัง resolve code: บันทึกหนึ่งรายการต่อ code ด้วย `Result = fail` และ detail `transfer_failed`
- การ lookup customer code ที่ล้มเหลวถูก log แล้วแทนด้วย code ว่าง โดยไม่ยกเลิก transfer; หากการบันทึก audit เองล้มเหลว handler จะ log error และไม่เปลี่ยนผลลัพธ์ของ transfer/API

## Business rules

- Standard Mode ปฏิเสธเมื่อ available balance ไม่พอ
- Skip Mode เป็นข้อยกเว้นเฉพาะ account ที่ config ไว้ ไม่ใช่ behavior ปกติ
- Skip Mode ต้องมี Price มากกว่า 0
- ทุก source/destination identification pair ต้องมี configuration ที่ active และ `is_delete = false`; account ที่ resolve ได้ไม่ได้แปลว่า transfer pair นั้นอนุญาต
- Dealer account selector ไม่กรอง dealer accounts ด้วย pair configuration แต่ treasury destination ใน dealer-transfer path ต้องผ่าน active pair จาก brokerage ไป treasury
- Treasury-transfer selector ใช้เฉพาะ destination identification ที่มี active configuration จาก configured treasury source และไม่คืน source treasury account เอง
- Read-path account filtering เป็นเพียง precondition ของ selector; create endpoint ต้อง revalidate pair และ product ทุกครั้ง
- Standard Mode ใช้ average cost ของ source portfolio เมื่อไม่มี override
- Hold และ settle ต้องรักษา movement สองฝั่งให้สอดคล้องตาม [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- Audit customer code ใช้ค่าจาก identification ที่ service resolve ได้ ไม่ใช่ค่าจาก request body และตัดค่าซ้ำก่อนสร้าง audit record
- Audit code lookup และ audit persistence เป็น best-effort side effect; ความล้มเหลวของสองขั้นตอนนี้ไม่เปลี่ยน validation, ledger หรือผล API ของ transfer

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
- Pair ไม่อยู่ใน `order_transfer_configuration`: HTTP 400 และ message `transfer between these identifications is not allowed`; owner/executor คือ `order-service`
- `web-portal` จับคู่ message นี้เพื่อเปิด error modal, ปิด preview และ reset asset/account/form เป็นค่าเริ่มต้นเมื่อผู้ใช้ dismiss; UI recovery นี้ไม่เปลี่ยน backend validation
- ถ้า Phase 2 Settle ล้มเหลว ให้ revert Hold จาก `HOLD_IN_ORDER` กลับ `AVAILABLE` ของต้นทาง และจบตาม failure path
- Handler validation หรือ service/settlement error ยังคืน error ของ transfer ตามเดิม พร้อม audit `transfer_failed`; ถ้า account code ถูก resolve แล้ว audit failure จะผูกกับ code ที่ resolve ได้ทีละรายการ
- Audit save error ไม่ถูกส่งกลับ client และไม่ทำให้ transfer ถูกจัดเป็น failure เพิ่มเติม; มีเพียง log สำหรับตรวจสอบภายหลัง

## Final outcomes

- สำเร็จ: ต้นทางลดสินทรัพย์ ปลายทางเพิ่มสินทรัพย์ด้วย cost ที่เลือก และ order จบ `completed`
- Validation ไม่ผ่าน: ไม่สร้าง settlement
- Settle ล้มเหลว: revert Hold และ order จบ `failed`
- ทุก create attempt มี audit outcome อย่างน้อยหนึ่งรายการเมื่อ handler เดินถึงจุดสร้าง audit; audit success/failure ไม่ใช่ตัวแทนของ `order_transfer` state หรือ asset ledger

## Related shared rules and flows

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)

## Code references

- `pkg/order_transfer/service.go`
- `routes/route.go`: `GET /api/v1/white-glove/transfer/accounts` (P0291) และ `GET /api/v1/treasury/internal-transfer/accounts` (P0302)
- `handler/white_glove_handler.go`: dealer-transfer account selector
- `handler/treasury_handler.go`: treasury-transfer account selector และ pair error mapping
- `handler/treasury_handler.go`: `CreateInternalTransfer` และการสร้าง audit outcome ตาม `AuditCustomerCodes`
- `handler/white_glove_dealer_transfer_handler.go`: `CreateDealerOrderTransfer` และการสร้าง audit outcome ตาม `AuditCustomerCodes`
- `handler/white_glove_order_transfer_audit.go`: `OrderTransferAsset`, `transfer_failed`, `order_id` detail และ best-effort audit persistence
- `pkg/order_transfer/service.go`: `GetDealerAccounts`, treasury destination filtering และ configured source resolution
- `pkg/order_transfer/audit.go`: resolve distinct `xspring_customer_code` จาก source/destination account
- `pkg/order_transfer/service_io.go`: `CreateOrderTransferOutput.AuditCustomerCodes`
- `pkg/order_transfer/errors.go`: `ErrTransferPairNotAllowed` และ HTTP 400 client-error classification
- `storages/postgres/ordercryptorepository/order_transfer_configuration_repository.go`: active/non-deleted pair lookup
- `handler/treasury_handler.go`: map pair validation error เป็น HTTP 400
- `pkg/order_transfer/service_internal_ledger.go`
- `InternalCustomerTransfer`
- Tables: `order_transfer`, `ledger_transactions`, `asset_portfolios`

`web-portal` supporting reference:

- `src/app/features/internal-transfer/services/internal-transfer-service.ts`: parse backend error message
- `src/app/features/internal-transfer/hooks/useInternalTransferPage.ts`: pair-not-allowed modal และ form reset
- `src/app/features/internal-transfer/utils/is-transfer-pair-not-allowed-error.ts`: exact error classification

---
title: Power of Attorney Customer Selection
description: Flow ค้นและตรวจข้อมูล customer account สำหรับ Power of Attorney โดยตัด closed account จาก customer-info read path
capability: Customer
services: [onboarding-service, web-portal]
errorCodes: ["400", "401", "500"]
aliases: [power of attorney, POA customer, POA customer selection, POA customer info, power-of-attorney, ลูกค้า POA, เลือกลูกค้า POA, ข้อมูลลูกค้า POA]
status: active
lastUpdated: 2026-08-28
documentType: flow
---

## Purpose and scope

อธิบาย read flow ที่ employee ใช้ค้น digital-asset customer account และโหลด customer info ก่อนทำรายการ Power of Attorney โดยเน้น current account-status filter และ error behavior ของ customer-info endpoint

เอกสารนี้ไม่ยืนยัน document acceptance, consent หรือการสร้าง PDF ทั้งหมด เพราะ source change รอบนี้ยืนยันเฉพาะ customer selection และ customer-info read path

## Trigger and preconditions

**Owner service: `onboarding-service`**

- Employee ต้องผ่าน employee auth และ API-key authorization ของ POA route
- Customer list ใช้ search, page และ per-page ได้
- Customer info ต้องใช้ `customer_account_id` ที่ parse เป็น UUID
- Account ต้องเป็น product `DigitalAsset`; customer identification ต้องไม่ถูก soft-delete

## Participating services

| Service | Role |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor ของ customer list query และ customer-info eligibility/read response |
| `web-portal` | Supporting client ที่แสดง account status และเรียก customer-info BFF |

## End-to-end sequence

### 1. Search eligible POA customers

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`GET /api/v1/power-of-attorney/customers` ค้นจากชื่อ, account code หรือ mobile แล้วคืนเฉพาะ customer account ที่:

- product เป็น `DigitalAsset`
- account status เป็น `active`
- identification ไม่ถูก soft-delete

Current response ไม่ได้ select account `status` field แม้ web-portal table จะเตรียม column `Account Status` และ model รองรับ `status`

### 2. Load customer info for selected account

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`GET /api/v1/power-of-attorney/customer-info/{id}` ใช้ account ID แล้ว query customer identification/profile/contact โดย:

- identification ต้อง `is_deleted = false`
- account ต้อง product `DigitalAsset`
- account status ต้องไม่ใช่ `closed`
- profile และ contact ต้อง join ได้

Response คืน identification, customer code, account code, ชื่อ, email และ investor class

### 3. Continue POA user journey

**Owner service: downstream POA operation**

**Executing service: `web-portal` และ POA handlers ที่เกี่ยวข้อง**

เมื่อ customer info สำเร็จ web-portal ใช้ข้อมูลเป็น context ของ POA screen ต่อไป; document upload/consent/acceptance เป็นคนละ step และไม่ถูกขยายความจาก diff รอบนี้

## Business rules

- Customer list จำกัดไว้ที่ active DigitalAsset account
- Customer-info read path ยอมรับ account status ทุกค่าที่ไม่ใช่ `closed` หาก join ข้อมูลที่จำเป็นสำเร็จ
- การตัด `closed` ใน customer-info query ไม่ได้ทำให้ customer list รองรับ suspended/freeze เพราะ list query ยังเลือก active เท่านั้น
- Backend เป็น owner ของ account eligibility; frontend status column ไม่ override query result

## State transitions

**Owner service: `onboarding-service`**

Flow นี้เป็น read/selection flow และไม่เปลี่ยน customer account status หรือ POA acceptance state

## Error and recovery behavior

- Invalid account UUID: HTTP `400` (`invalid request`)
- ไม่มีข้อมูล customer info หรือ account เป็น `closed`: service คืน `ErrPOACustomerInfoNotFound`; handler ปัจจุบันส่ง HTTP `200` พร้อม code `400` และ message `customer info not found`
- Database/join failureอื่น: handler ส่ง HTTP `500`
- Invalid auth ของ customer list: HTTP `401`
- Source ไม่ยืนยัน retry หรือ fallback เมื่อ customer list/info query ล้มเหลว

## Final outcomes

- Employee เห็นเฉพาะ active DigitalAsset account ใน POA customer list
- Selected account ที่ไม่ใช่ `closed` และมี customer joins ครบสามารถคืน customer info ได้ แม้ list ปัจจุบันจะไม่ expose non-active status
- POA document/acceptance step ได้ customer context จาก read response

## Related shared rules

- [Customer Onboarding and KYC](/business-flows/customer/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`onboarding-service`:

- `routes/routes.go`: POA employee customer routes
- `handler/poa_handler.go`: list and customer-info handlers
- `pkg/customer/customer-repo/customer-repository.go`: `buildPowerOfAttorneyCustomerQuery`
- `pkg/poa/customer_info_repository.go`: non-closed account/customer-info query

`web-portal`:

- `src/app/features/power-of-attorney/hooks/use-poa-customer-list.ts`: list contract including `status`
- `src/app/features/power-of-attorney/components/poa-customer-list-table.tsx`: Account Status column
- `src/app/features/power-of-attorney/hooks/use-poa-customer-info.ts`: customer-info request

---
title: Yield Payment Setup
description: Employee Flow เตรียมงวดผลตอบแทนจากไฟล์ XLSX, คำนวณ yield, version setup และเก็บแผนใน OBS
capability: Offering
services: [product-service]
integrations: [Huawei OBS]
aliases: [yield payment setup, yield payment plan, yield calculation, payment period, ตั้งค่าผลตอบแทน, งวดจ่ายผลตอบแทน, ไฟล์แผนการจ่าย]
errorCodes: ["400001", "400004", "400005", "400006", "500001", "500002", "500003"]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบาย Flow ฝั่ง employee สำหรับเลือก Offering project/product, ดาวน์โหลด template, upload แผนงวดจ่าย, preview การคำนวณ และสร้าง active yield-payment setup แบบ versioned ใน `product-service`

Flow นี้เป็นการตั้งค่าแผนและคำนวณผลตอบแทน ไม่ยืนยันการจ่ายเงินจริง, ledger, withholding tax execution หรือ Payment backend behavior

## Trigger and preconditions

**Owner service: `product-service`**

- ทุก endpoint ใต้ `/api/v1/yield-payment-setups` ใช้ employee-authenticated middleware
- Create ใหม่ต้องมี project/product UUID, calculation parameters, `file_name` และ `uploaded_file`
- Edit ส่ง source setup ID; file ใหม่เป็น optional และถ้าไม่ส่งจะ reuse file/periods เดิม
- Uploaded file ต้องมี MIME type ของ XLSX และ header/template ตามค่าที่ service กำหนด
- Project/product data ต้องมีอยู่ใน master tables; product listเลือกเฉพาะ status `ACTIVE`

## Participating services

| Service / integration | Role |
| :--- | :--- |
| `product-service` | Business owner และ executor ของ lookup, validation, calculation, versioning และ persistence |
| Huawei OBS | เก็บไฟล์ yield payment plan ที่ upload |

Supporting frontend repository `web-portal` มี uncommitted changes จึงไม่ได้ใช้ยืนยัน form behavior หรือ client-side validation ในรอบนี้

## End-to-end sequence

### 1. Load setup choices and template

**Owner service: `product-service`**

**Executing service: `product-service`**

- `GET /project` คืน project ที่ยังไม่มี active yield-payment setup
- `GET /product?project_id=...` คืน active products ของ project พร้อม token offering size, face value และจำนวน offering token ที่คำนวณจาก `token_offering_size / face_value_per_unit`
- `GET /template` คืน configured template URL
- `GET /` คืนเฉพาะ latest active setup ต่อ product พร้อม pagination/search ตาม project name

### 2. Parse the plan source

**Owner service: `product-service`**

**Executing service: `product-service`**

สำหรับ preview `POST /calculate`, source ของงวดใช้ลำดับ:

1. `uploaded_file` ถ้ามี
2. periods ของ `yield_payment_setup_id` ถ้าไม่มีไฟล์
3. internal rows ที่ create path ส่งหลัง parse file

ไฟล์ต้องเป็น XLSX และมีคอลัมน์งวด, start/end date, period days, announcement date, cut-off date และ payment due date ตาม template

### 3. Validate calculation inputs

**Owner service: `product-service`**

**Executing service: `product-service`**

ต้องมี face value, yield rate, day-per-year, token offering size, rounding method/decimal places ของ return-per-unit และ per-investor; `day_per_year > 0`, decimal places ต้องไม่ติดลบ และ method ต้องเป็น `NO_ROUND`, `ROUND`, `ROUND_UP` หรือ `ROUND_DOWN`

### 4. Calculate each payment period

**Owner service: `product-service`**

**Executing service: `product-service`**

ต่อหนึ่งงวด:

```text
yield_per_token =
  face_value_per_unit × (yield_rate / 100) × period_days / day_per_year

yield_per_period =
  token_offering_size × yield_per_token
```

ระบบ round `yield_per_token` ด้วย return-per-unit rule ก่อนคูณ และ round `yield_per_period` ด้วย per-investor rule หลังคูณ `NO_ROUND` ใช้ `RoundFloor` ที่ 10 decimal places โดยไม่ใช้ decimal places จาก request

### 5. Resolve and store the plan file

**Owner service: `product-service`**

**Executing service: `product-service`**

Create ใหม่ต้อง upload file ไป Huawei OBS ภายใต้ object key ที่ประกอบด้วย project code, UTC date, base file name และ Unix timestamp

Edit ตรวจว่า source setup อยู่ project เดียวกับ request ถ้ามีไฟล์ใหม่จะ validate/upload ใหม่; ถ้าไม่มีจะ reuse object key, file metadata และ periods จาก source setup

### 6. Create a new active version

**Owner service: `product-service`**

**Executing service: `product-service`**

ใน database transaction ระบบ lock setup rows ของ product:

1. หา active version ปัจจุบัน
2. ถ้ามี ให้เปลี่ยน active rows ของ product เป็น `is_active = false`
3. สร้าง setup ใหม่เป็น version เดิม + 1 และ `is_active = true` หรือ version 1 เมื่อยังไม่มี active setup
4. สร้าง file record
5. สร้าง calculated period records

Response แสดง old/new IDs และ versions เฉพาะเมื่อมี previous active version

### 7. Read the active setup

**Owner service: `product-service`**

**Executing service: `product-service`**

List คืน latest active ต่อ product; detail endpoint คืน project, product, calculation/rounding parameters, version, file metadata และ periods เรียง `period_no`

## Business rules

- Uploaded file มี precedence เหนือ stored setup ID ใน calculate endpoint
- Create ใหม่ไม่มีไฟล์ไม่ได้; edit ไม่มีไฟล์ได้เมื่อ source setup มี file/periods
- Edit source ID ต้องอยู่ project เดียวกับ request
- Product selection ใช้เฉพาะ active products
- Project option ถูกตัดออกเมื่อ project นั้นมี active setup อย่างน้อยหนึ่งรายการ
- มี active setup ได้หนึ่ง version ต่อ product หลัง transaction สำเร็จ
- ค่าจำนวนเงินใช้ decimal type; `project_offering_token` ถูก round เป็นจำนวนเต็มตอน persist
- Tax และ final-payoff rounding ถูกเก็บเป็น configuration แต่ calculation preview ปัจจุบันคำนวณเฉพาะ yield per token/period

## State transitions

**Owner service: `product-service`**

| Trigger | Previous setup | New setup |
| :--- | :--- | :--- |
| First create | ไม่มี active | version 1, `is_active = true` |
| Create/edit เมื่อมี active | active version N → `is_active = false` | version N+1, `is_active = true` |
| Calculate preview | ไม่เปลี่ยน state | ไม่ persist setup |

## Error and recovery behavior

- `400001` — `Invalid File Template`
- `400004` — `File required`
- `400005` — `Invalid File Format`
- `400006` — `Invalid Data Format`
- Invalid UUID/project mismatch ใช้ code `400` และ message `INVALID_REQUEST`
- List/project/template dependency failure ใช้ business response codes `500001`, `500002`, `500003`
- Unauthorized claim: HTTP 401
- OBS upload เกิดก่อน database transaction; ถ้า persistence ล้มหลัง upload source ไม่ยืนยัน cleanup ของ object ที่ upload แล้ว
- Database transaction rollback setup/file/period changes เมื่อ persistence step ใดล้ม

## Final outcomes

- Preview สำเร็จ: caller ได้ periods พร้อม yield per token/period โดยยังไม่แก้ active setup
- Create/edit สำเร็จ: product มี active setup version ใหม่, file metadata และ calculated periods
- Previous active version ถูก deactivate แต่ยังอ่านได้ด้วย ID
- File plan ถูกเก็บใน Huawei OBS; database เก็บ object key และ metadata

## Related shared rules

- [Offering](/business-flows/offering/)
- [Subscription and Eligibility](/business-flows/offering/subscription-and-eligibility/)
- [Permissions and Access Control](/shared-rules/permissions/)
- [Error Code Registry](/shared-rules/error-codes/)
- [Third-Party Integrations Profile](/system-context/integrations/)

## Code references

`product-service`:

- `routes/route.go`: `RegisterRouteYieldPaymentSetup`
- `handler/yield_payment_setup_handler.go`
- `handler/yield_payment_setup_dto.go`
- `pkg/yieldpaymentsetup/service.go`
- `internal/storages/postgres/yieldpaymentsetuprepository/yield_payment_setup.go`
- `internal/constants/yield_payment_setup.go`
- `third_party/obs/service.go`

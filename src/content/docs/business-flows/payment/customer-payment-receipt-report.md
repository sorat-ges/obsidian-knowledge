---
title: Customer Payment Receipt Report
description: Flow เลือก offering project และช่วงวันที่เพื่อดูตัวอย่างหรือดาวน์โหลดรายงาน customer payment receipt เป็น Excel
capability: Payment
services: [order-service, web-portal]
aliases: [customer payment receipt report, payment receipt report, customer payment report, payment receipt xlsx, customer payment receipt, รายงาน customer payment receipt, รายงานใบเสร็จรับเงินลูกค้า, รายงานการรับชำระเงิน]
errorCodes: ["400", "401", "500"]
status: active
lastUpdated: 2026-09-20
documentType: flow
---

## Purpose and scope

อธิบาย Flow ของพนักงานที่เลือก offering project และ order-date range เพื่อ preview หรือดาวน์โหลด customer payment receipt report เป็นไฟล์ Excel ตั้งแต่ client validation จน `order-service` สร้างผลลัพธ์รายงาน

หน้านี้ครอบคลุมเฉพาะการอ่านข้อมูล order offering และการจัดรูปแบบรายงาน ไม่ยืนยัน payment settlement, Payment Request/Transaction, ledger หรือ callback ซึ่งเป็นคนละ Flow และต้องใช้ Payment backend ที่อยู่นอก source list นี้ในการยืนยัน

## Trigger and preconditions

**Owner service: `order-service`**

**Executing service: `web-portal` สำหรับ client/BFF trigger และ `order-service` สำหรับ query/report generation**

- ผู้ใช้ต้องเข้า route `/cust-payment-receipt-report` และผ่าน permission ของหน้า `CUST_PAY_RECEIPT_REPORT_EDIT`
- `web-portal` บังคับเลือก project, `date_from` และ `date_to`; วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด และ date picker ไม่อนุญาตวันที่หลังวันนี้
- Preview ใช้ `report_type=customer_payment_receipt_report`, `project_id`, `date_from`, `date_to` และ `page`
- Download ใช้ `report_type`, `project_id`, `date_from` และ `date_to` ผ่าน POST body
- Backend ต้องได้ `PortalClaims`; project/date parameters ถูก bind เป็น UUID/time ก่อนเรียก report service

## Participating services

| Service | Responsibility |
| :--- | :--- |
| `web-portal` | แสดง form, ตรวจ project/date, เรียก BFF preview/download และแปลง download response เป็น browser file |
| `order-service` | Business owner และ executing service ของ report API, query order offering transaction, สร้าง preview model และ Excel |
| `order-service/pkg/order_offering` | อ่าน offering order request, order detail และ payment detail แล้วประกอบ transaction rows สำหรับรายงาน |

ไม่มี external integration หรือ Payment execution service ที่ source รอบนี้ยืนยันได้จาก report path นี้

## End-to-end sequence

### 1. Select project and date range

**Owner service: `order-service`**

**Executing service: `web-portal`**

`web-portal` โหลด project ที่ใช้สร้างรายงาน, ให้ผู้ใช้เลือก project และช่วงวันที่ แล้วหยุดการ submit เมื่อ field ไม่ครบหรือ `from > to` การตรวจนี้เป็น client precondition เท่านั้น ไม่แทนการตรวจ auth หรือ query behavior ของ `order-service`

### 2. Preview report data

**Owner service: `order-service`**

**Executing service: `web-portal` BFF และ `order-service` report handler**

1. Client เรียก `/api/report/customer_payment_receipt_report/preview` พร้อม `project_id`, `date_from`, `date_to` และ `page`
2. BFF proxy ไป `GET /api/v1/report/preview/{report_type}`
3. `order-service` เรียก `GetDataOrderOfferingTransaction` โดยปรับ `date_to` ให้ครอบคลุมวันสุดท้ายใน query และใช้ Asia/Bangkok เป็นขอบเขตวัน
4. Repository query เรียง offering orders ตาม `order_date` แล้ว `id`; เมื่อ `page > 0` จำกัด 10 order requests ต่อหน้า
5. Service โหลด order details และ payment details, group รายการตาม `OrderID`, สร้าง preview row และสร้าง header ของ product symbols ที่ไม่ซ้ำจากข้อมูลที่อ่านได้
6. Client แสดง preview และเปลี่ยน page เพื่อ query หน้าถัดไป

### 3. Generate and download Excel report

**Owner service: `order-service`**

**Executing service: `web-portal` BFF และ `order-service` report service**

1. Client ส่ง `POST /api/report/customer_payment_receipt_report/download` พร้อม report type, project และ date range
2. BFF ส่งต่อไป `POST /api/v1/report/payment-receipt/generate`
3. Download path เรียก report query โดยไม่ส่ง `Page` ทำให้ repository ไม่ใส่ `LIMIT/OFFSET` และอ่านรายการตาม filter ทั้งชุด
4. `GenerateReportCustomerPaymentReceiptData` ใช้ header product symbol เป็นลำดับคอลัมน์ แล้ว map แต่ละ row ด้วย `ProductSymbol` แทนการอาศัยตำแหน่งใน array; product ที่ไม่มีใน row นั้นเว้น cell ว่าง
5. จำนวนคอลัมน์ token/value และตำแหน่ง money total formula คำนวณตามจำนวน product ใน header จริง ไม่ใช้จำนวนคงที่
6. `order-service` คืนไฟล์ `.xlsx` พร้อม filename รูปแบบ `<project>_Payment_<DDMMYYYY>.xlsx`; BFF ส่ง blob ให้ browser ดาวน์โหลด

## Business rules

- Header เป็น source ของลำดับ product columns; row data ที่สลับลำดับไม่ทำให้ token/value ไปอยู่ใต้ product ผิดตัว
- Product symbol ที่ไม่มีใน row ไม่ถูกเลื่อนค่าของ product อื่นมาแทน และ cell ของ token/value ถูกเว้นว่าง
- Report download ใช้ข้อมูลทั้งช่วงที่ query ได้ ส่วน preview ใช้ pagination 10 order requests เมื่อส่ง `page > 0`
- `date_to` เป็น inclusive ตามวันใน timezone `Asia/Bangkok` ก่อน query backend
- การแก้ไขนี้เปลี่ยนรูปแบบ/ความถูกต้องของ report output เท่านั้น ไม่เปลี่ยน order status, payment state, ledger หรือ balance

## State transitions

**Owner service: `order-service`**

```text
filter valid → preview response available
filter valid → Excel report generated → browser download
```

ไม่มี persisted business state transition ของ payment หรือ order จากการ preview/download นี้

## Error and recovery behavior

**Owner service: `order-service`**

- Claims ไม่ใช่ `PortalClaims`: HTTP `401`; BFF ส่ง status กลับ client
- Bind/query/body ไม่ผ่าน: HTTP `400`; client ต้องแก้ project/date/report parameters ก่อน submit ใหม่
- Query order offering, detail, payment หรือ Excel generation ล้มเหลว: HTTP `500`; preview BFF คืน error response และ download BFF คืน failure response โดยไม่มีไฟล์ที่ใช้ได้
- `web-portal` ไม่ทำการ retry หรือแก้ข้อมูล report เมื่อ upstream error; ผู้ใช้ต้อง submit/ดาวน์โหลดใหม่หลังแก้สาเหตุ

## Final outcomes

- Preview สำเร็จ: ผู้ใช้เห็น rows, product token/value columns และ pagination ตามข้อมูลที่ query ได้
- Download สำเร็จ: ได้ Excel ที่ product token/value จัดตรงกับ header และ total formula ครอบคลุมจำนวน product จริง
- Preview/download ล้มเหลว: ไม่มีการเปลี่ยน payment/order state; มีเพียง request failure ที่ client แสดงผ่าน query state

## Related shared rules

- [Payment](/business-flows/payment/)
- [Payment Request and Bank Transfer](/business-flows/payment/payment-request-and-transfer/)
- [Subscription and Eligibility](/business-flows/offering/subscription-and-eligibility/)

## Code references

`order-service`:

- `routes/route.go`: report preview และ `/api/v1/report/payment-receipt/generate` route
- `handler/report_handler.go`: `PreviewReportWithType` และ `GeneratePaymentReceipt`
- `handler/report_dto.go`: `ReportPreviewTypeRequest` และ `GeneratePaymentReceiptRequest`
- `pkg/report/cust_payment_received_service.go`: report query orchestration และ filename
- `pkg/report/helper.go`: group order offering transaction และสร้าง header product symbols
- `pkg/report/generate-payment-receipt.go`: Excel layout, symbol-based token/value mapping และ dynamic total formulas
- `pkg/order_offering/service.go`: date range normalization และประกอบ order/detail/payment data
- `storages/postgres/orderofferingrepository/order_request_repository.go`: project/date filter, ordering และ preview pagination

`web-portal`:

- `src/app/(report)/cust-payment-receipt-report/hooks/useCustPaymentReceipt.ts`: client validation, preview pagination และ download payload
- `src/app/api/report/[reportType]/preview/route.ts`: preview BFF
- `src/app/api/report/[reportType]/download/route.ts`: download BFF และ Excel blob response

## Unresolved scope

- Source list ไม่มี Payment backend repository สำหรับยืนยัน upstream payment capture, settlement, ledger หรือ transaction status; อย่าใช้รายงานนี้เป็นหลักฐานแทน Payment Flow
- Report query อ่าน payment detail ที่อยู่ใน `order-service`/offering repository แต่ ownership และ contract ของ upstream payment data ยังต้องยืนยันกับเจ้าของ Payment system

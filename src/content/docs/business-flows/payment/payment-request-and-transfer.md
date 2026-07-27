---
title: Payment Request and Bank Transfer
description: Flow รับและตรวจคำขอ Payment ก่อนส่ง IMBANK ไปยัง SCB adapter จนได้ transaction success หรือ failed
capability: Payment
services: [payment-gateway, payment-core-service, payment-adaptor-service-scb]
integrations: [SCB, kafka]
aliases: [payment request, bank transfer, payment gateway, ชำระเงิน, โอนธนาคาร, SCB adapter, IMBANK]
errorCodes: [pmg998]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบายตั้งแต่ระบบต้นทางสร้าง Payment Request ผ่าน `payment-core-service`, core ตรวจและบันทึกรายการ, publish initial event จน SCB adapter worker เรียก Bank Transfer API และ publish transaction result ไม่ครอบคลุมการสร้าง summary และ callback ซึ่งอยู่ใน [Payment Inquiry and Callback](/business-flows/payment/payment-inquiry-and-callback/)

## Trigger and preconditions

**Owner service: `payment-core-service`**

- ระบบต้นทางเรียก `POST /api/v1/payment` พร้อม Bearer authentication
- Claims ต้องแปลงเป็น `PortalClaims` ได้
- Request ต้องมี `request_id`, `payment_method`, `payment_channel`, `payment_type`, `bank_gateway`, `merchant_account_code`, `callback_url` และ `detail`
- `amount` ต้องมากกว่า `0`
- `payment_type` ต้องเป็น `TRANSFER_IN` หรือ `TRANSFER_OUT`
- Handler ปัจจุบันรับเฉพาะ `payment_method = IMBANK` และ `payment_channel = IMBANK`
- ถ้าต้องการเข้า SCB adapter, `bank_gateway` ต้องเป็น `scb` ตัวเล็ก

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `payment-gateway` | Umbrella service label สำหรับค้นหา capability นี้; execution ownership อยู่ที่ service เฉพาะในแต่ละขั้น |
| `payment-core-service` | ตรวจ auth/request, ป้องกัน `request_id` ซ้ำ, บันทึก Payment Request และ publish initial event |
| `payment-adaptor-service-scb` worker | กรอง SCB/IMBANK event, เตรียมคำสั่ง, เรียก SCB และ publish transaction result |
| SCB Bank Transfer API | ออก access token แล้วรับ Initiate และ Confirm |
| Kafka | ส่ง Payment Request event และ Payment Transaction event ระหว่างเจ้าของแต่ละช่วง |

## End-to-end sequence

### 1. Validate the payment request

**Owner service: `payment-core-service`**

1. Handler ตรวจ `PortalClaims` และอ่าน `client_id`
2. Bind JSON เป็น Payment Request
3. ตรวจ required fields, amount, payment type, method และ channel
4. Service ปฏิเสธ `request_id` ที่มีอยู่แล้ว
5. ถ้าไม่ส่ง `currency` ให้ใช้ `THB`

Validation error ตอบ `400 pmg998`; claims ผิดชนิดตอบ `401` ก่อนอ่าน body ส่วน service error เช่น duplicate, insert หรือ publish ล้มเหลวตอบ `500 pmg998`

### 2. Persist and publish the initial event

**Owner service: `payment-core-service`**

1. บันทึก Payment Request ด้วยสถานะ `INITIAL`
2. Publish ไป `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST` ด้วย event `payment.initial.<bank_gateway>`
3. API ตอบ `200 OK` พร้อม `payment_request_id` และ status เมื่อการสร้างสำเร็จ

สำหรับ SCB, event ต้องเป็น `payment.initial.scb`; casing อื่นจะไม่ผ่าน filter ของ adapter worker

### 3. Consume and prepare the SCB transfer

**Owner service: `payment-adaptor-service-scb` worker**

1. Consume `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST`
2. Process เฉพาะ `message_event = payment.initial.scb` และ `data.payment_method = IMBANK`
3. Copy request ไป `payment_adaptor.payment_request`
4. หา merchant account จาก `merchant_account_code`; config ต้องมี `customer_ref_num_prefix`
5. สร้าง `external_id` จาก prefix, timestamp และเลขสุ่ม 7 หลัก
6. Parse `detail` เพื่ออ่านบัญชีปลายทาง, bank code และ fee; `fee_amount1` default เป็น `0`

### 4. Execute the bank transfer

**Owner service: `payment-adaptor-service-scb` worker**

เรียก SCB ตามลำดับ:

```text
Access Token → Initiate → Confirm
```

Payer มาจาก merchant account, payee มาจาก `detail.bank_account_no` และ `detail.bank_code`; amount/currency มาจาก Payment Request

### 5. Persist and publish the transaction result

**Owner service: `payment-adaptor-service-scb` worker**

1. บันทึก Payment Transaction พร้อม bank response/payload
2. Confirm สำเร็จสร้าง status `SUCCESS` และ event `payment.success`
3. SCB API ล้มเหลวหรือไม่มีผล Confirm สร้าง status `FAILED` และ event `payment.failed`
4. Publish ไป `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION` เพื่อให้ inquiry worker ทำงานต่อ

## Business rules

- Handler แม้มี enum อื่นใน codebase แต่ปัจจุบันรับเฉพาะ `IMBANK` สำหรับ method และ channel
- `request_id` ห้ามซ้ำ
- `currency` default เป็น `THB`
- SCB routing เป็น case-sensitive: `bank_gateway = scb`
- Adapter process เฉพาะ contract `payment.initial.scb` กับ `IMBANK`
- Merchant account และ `customer_ref_num_prefix` ต้องมีเพื่อสร้างคำสั่ง SCB
- Business failure ใน adapter ถูกเปลี่ยนเป็น `payment.failed` แทนการ retry request message เดิม

## State transitions

**Initial-state owner: `payment-core-service`**

```text
request accepted → INITIAL
```

**Transaction-result owner: `payment-adaptor-service-scb` worker**

```text
SCB Confirm succeeds → SUCCESS
SCB API fails or Confirm has no result → FAILED
```

เอกสารต้นทางไม่ได้กำหนดว่า status ของ Payment Request ถูกเปลี่ยนจาก `INITIAL` เป็น transaction status โดยตรง จึงต้องแยก request status และ transaction result ออกจากกันเมื่อแก้ implementation

## Error and recovery behavior

- Claims ผิดชนิด: ตอบ `401` และไม่อ่าน body
- Request ไม่ผ่าน validation: ตอบ `400 pmg998`, ไม่ insert และไม่ publish
- Duplicate/insert/publish error ที่ core: ตอบ `500 pmg998`
- Event หรือ method ไม่ผ่าน adapter filter: log warning, return nil และ commit message; ไม่มี retry
- ไม่พบ merchant config หรือ SCB Access Token/Initiate/Confirm ล้มเหลว: publish `payment.failed`
- Adapter commit message เมื่อ handler ไม่ return error; source ระบุให้ business failure เดินต่อด้วย failed event

## Final outcomes

- สำเร็จ: มี Payment Request สถานะ `INITIAL`, SCB transaction สถานะ `SUCCESS` และ `payment.success` ถูก publish
- ปฏิเสธที่ core: ไม่มี Payment Request/event downstream สำหรับ validation failure
- ถูก ignore ที่ adapter: request event ถูก commit แต่ไม่มี SCB transfer หรือ transaction result
- ล้มเหลวระหว่าง adapter/SCB: มี `payment.failed` ให้ inquiry worker สรุปและ callback ต่อ

## Related shared rules and flows

- [Payment Inquiry and Callback](/business-flows/payment/payment-inquiry-and-callback/)
- [Payment](/business-flows/payment/)
- [Service Map](/system-context/service-map/)
- [Integrations](/system-context/integrations/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`payment-core-service`:

- `handler/payment-handler.go`: `CreatePayment`, `ValidatePaymentRequest`
- `pkg/payment/service.go`
- `pkg/payment/model.go`
- `internal/constants/enum/payment_type_enum.go`
- `internal/constants/application.go`

`payment-adaptor-service-scb`:

- `cmd/worker/main.go`
- `internal/delivery/messaging/payment-request.go`
- `internal/service/scb/banktransfer/service.go`
- `internal/service/scb/processfail/service.go`
- `internal/gateway/messaging/payment-transaction-producer.go`

---
title: Payment Inquiry and Callback
description: Flow รวม Payment Request และ Transaction เป็น summary ก่อนส่ง callback ผลลัพธ์กลับระบบต้นทาง
capability: Payment
services: [payment-gateway, payment-inquiry-service]
integrations: [kafka, callback API]
aliases: [payment inquiry, payment summary, payment callback, สถานะการชำระเงิน, callback ผลธุรกรรม]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบาย `payment-inquiry-service` worker ตั้งแต่ consume Payment Request/Transaction event, upsert `payment_inquiry.payment_summary`, สร้างผลลัพธ์ และ callback กลับ `request_callback_url` รวมทั้ง behavior เมื่อ event มาผิดลำดับหรือ callback ล้มเหลว

## Trigger and preconditions

**Owner service: `payment-inquiry-service` worker**

Worker รัน consumer สามชุด:

- Payment Request จาก `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST`
- Payment Transaction จาก `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION`
- FX Transaction จาก `KAFKA_TOPIC_PAYMENT_GATEWAY_FX_TRANSACTION`

Callback ปกติต้องเป็น transaction event ที่ไม่ได้ถูกจัดเป็น inquiry และ summary ต้องมี `request_callback_url`

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `payment-gateway` | Umbrella service label สำหรับค้นหา capability นี้; ไม่ใช้แทน execution owner |
| `payment-inquiry-service` worker | Consume event, upsert summary, build response, ขอ service token, callback และบันทึกผล |
| Kafka | ส่ง request, transaction และ FX transaction events |
| Source System Callback Endpoint | รับผล normal payment transaction พร้อม Bearer token |

## End-to-end sequence

### 1. Consume request and transaction events

**Owner service: `payment-inquiry-service` worker**

- Request consumer unmarshal `PaymentRequest` แล้ว upsert request fields กับ callback URL ลง `payment_inquiry.payment_summary`
- Transaction consumer unmarshal `PaymentTransaction` แล้ว process โดยไม่มี whitelist ชื่อ event
- FX consumer ส่ง event เข้า `ConsumerFXTransactionService` และบันทึกใน FX repository แยกต่างหาก

### 2. Build the inquiry summary

**Owner service: `payment-inquiry-service` worker**

1. Request event ตั้ง `app_status` ตาม request status เช่น `INITIAL`
2. Transaction event upsert transaction fields และตั้ง `app_status` เช่น `SUCCESS` หรือ `FAILED`
3. สำหรับ normal transaction, ค้น summary ด้วย `payment_request_id`; ถ้าไม่พบ fallback ไป `transaction_id`
4. ถ้ามี request เดิม สร้าง PMG response จาก summary; ถ้าไม่มี request เดิมแต่มี transaction payload ใช้ payload นั้นเป็นผลลัพธ์

ข้อมูลผลลัพธ์ที่ source ระบุรวม `request_id`, `merchant_account_code`, bank account, request amount, amount, currency, bank transaction id, status, transaction datetime และ `payment_request_id`

### 3. Decide whether to callback

**Owner service: `payment-inquiry-service` worker**

- ถ้า `message_event` มีคำว่า `inquiry` ให้ตั้ง `isInquiry = true`, upsert summary แต่ไม่ callback
- ถ้าเป็น normal transaction และ summary มี `request_callback_url` จึงเดินต่อ
- ถ้าไม่มี callback URL ให้จบ handler โดยไม่ error

### 4. Invoke the source-system callback

**Owner service: `payment-inquiry-service` worker**

1. ขอ service token
2. ส่ง `POST` ไป `request_callback_url`
3. แนบ `Authorization: Bearer <token>`
4. ถือว่า callback สำเร็จเมื่อ HTTP status เป็น `200`

### 5. Record callback delivery

**Owner service: `payment-inquiry-service` worker**

- HTTP 200: update `callback_send_success = true`
- Callback error หรือ HTTP status อื่น: update `callback_send_success = false` และเก็บ `callback_error_msg`
- Handler return error เมื่อ callback fail ทำให้ consumer ไม่ commit message และ Kafka สามารถส่งซ้ำตาม consumer behavior

## Business rules

- Transaction consumer ไม่มี filter ว่าต้องเป็น `payment.success` หรือ `payment.failed`; unmarshal เป็น `PaymentTransaction` ได้ก็ process
- คำว่า `inquiry` ใน `message_event` เป็นตัวตัดสินว่าไม่ callback
- Callback เกิดเฉพาะ normal transaction ที่มี `request_callback_url`
- Request summary ควรมาก่อน transaction เพื่อให้ callback URL อยู่ใน row เดียวกัน
- Callback สำเร็จต้องได้ HTTP `200` ไม่ใช่เพียงส่ง request ได้

## State transitions

**Owner service: `payment-inquiry-service` worker**

```text
Payment Request consumed     → app_status = request status (เช่น INITIAL)
Payment Transaction consumed → app_status = transaction status (เช่น SUCCESS หรือ FAILED)
Callback HTTP 200            → callback_send_success = true
Callback error/non-200       → callback_send_success = false + callback_error_msg
```

FX transaction ถูกเก็บใน repository แยก; source ไม่ได้ผูก FX state เข้ากับ `payment_summary` lifecycle นี้

## Error and recovery behavior

- Transaction event ที่ unmarshal ได้จะถูก process แม้ชื่อ event ไม่ใช่ success/failed
- Inquiry event: ไม่ callback โดยตั้งใจ
- ไม่มี callback URL: ไม่ callbackและ handler จบโดยไม่ error
- Callback fail/non-200: เก็บ failure, return error และไม่ commit เพื่อ retry
- Transaction มาก่อน request อาจสร้าง transaction-only row; หาก event ไม่มี callback URL จะไม่ callback
- Source ไม่ยืนยันว่าการมาถึงทีหลังของ request จะ trigger callback ย้อนหลัง จึงต้องตรวจ implementation/runtime ก่อนพึ่ง behavior นี้

## Final outcomes

- Request-only: summary มีข้อมูลคำขอและสถานะเริ่มต้น
- Normal transaction สำเร็จในการส่ง callback: summary มี transaction result และ `callback_send_success = true`
- Callback ล้มเหลว: เก็บ error และ message ยังไม่ถูก commit เพื่อ retry
- Inquiry transaction: summary อัปเดตแต่ไม่มี callback
- ไม่มี callback URL: summary อัปเดตและจบโดยไม่มี callback

## Related shared rules and flows

- [Payment Request and Bank Transfer](/business-flows/payment/payment-request-and-transfer/)
- [Payment](/business-flows/payment/)
- [Service Map](/system-context/service-map/)
- [Integrations](/system-context/integrations/)

## Code references

`payment-inquiry-service`:

- `cmd/worker/main.go`
- `kafka/messaging/consumer.go`
- `kafka/messaging/payment-request.go`
- `kafka/messaging/payment-transaction.go`
- `kafka/messaging/fx-transaction.go`
- `pkg/consumerrequest/service.go`
- `pkg/consumertransaction/service.go`
- `pkg/consumerfxtransaction/service.go`
- `storages/postgres/db/payment_summary_repository/payment_summary_repository.go`
- `third_party/callback/service.go`

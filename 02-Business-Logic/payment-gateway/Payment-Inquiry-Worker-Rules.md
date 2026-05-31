---
title: Payment Inquiry Worker Rules
tags: [payment-gateway, payment-inquiry, kafka, callback, summary]
status: active
last-updated: 2026-05-03
---

# 🔎 Business Logic: Payment Inquiry Worker

เอกสารนี้สรุปกฎธุรกิจของ `payment-inquiry-service/cmd/worker` ซึ่งเป็น Worker ที่รวบรวม Payment Request, Payment Transaction และ FX Transaction จาก Kafka เพื่อสร้าง Payment Summary และส่ง callback ผลธุรกรรมกลับไปยังระบบต้นทาง

---

## 🎯 วัตถุประสงค์
เก็บสถานะรวมของ Payment Gateway ไว้ใน `payment_inquiry.payment_summary` และแจ้งผลธุรกรรมกลับไปยัง `callback_url` ของ Payment Request เมื่อได้รับ Payment Transaction Event จาก adaptor service

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **Worker Consumers** | Worker เริ่มทำงาน | รัน consumer พร้อมกัน 3 ตัว: Payment Request, Payment Transaction, FX Transaction |
| **Request Summary** | Consume topic `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST` | Upsert ข้อมูล request ลง `payment_inquiry.payment_summary` |
| **Transaction Summary** | Consume topic `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION` | Upsert ข้อมูล transaction ลง `payment_inquiry.payment_summary` |
| **FX Transaction Summary** | Consume topic `KAFKA_TOPIC_PAYMENT_GATEWAY_FX_TRANSACTION` | บันทึก FX transaction แยกใน repository ของ FX |
| **Transaction Event Handling** | ทุก Payment Transaction Event | ไม่มี filter ชื่อ event; unmarshal ได้แล้วส่งเข้า service ทันที |
| **Inquiry Event Flag** | `message_event` มีคำว่า `inquiry` | ตั้ง `isInquiry = true` และไม่ส่ง callback |
| **Normal Transaction Callback** | `isInquiry = false` และ summary มี `request_callback_url` | สร้าง PMG response แล้ว POST callback กลับระบบต้นทาง |
| **Callback Auth** | ก่อน POST callback | ขอ service token แล้วส่งเป็น `Authorization: Bearer <token>` |
| **Callback Success Tracking** | Callback สำเร็จ HTTP 200 | update `callback_send_success = true` |
| **Callback Failure Tracking** | Callback error หรือ HTTP status ไม่ใช่ 200 | update `callback_send_success = false` และเก็บ `callback_error_msg` |
| **Offset Commit** | Handler return nil | Consumer commit Kafka message |
| **Retry Behavior** | Handler return error | Consumer ไม่ commit message เพื่อให้ retry ตาม Kafka consumer behavior |

## 🔄 ขั้นตอนการทำงาน (Logic Flow)

### 1. Payment Request Consumer
1. Subscribe `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST` ด้วย group `KAFKA_GROUP_TOPIC_PAYMENT_GATEWAY_REQUEST`
2. Unmarshal event เป็น `PaymentRequest`
3. Upsert request fields ลง `payment_inquiry.payment_summary`
4. ตั้ง `app_status` ตาม request status เช่น `INITIAL`

### 2. Payment Transaction Consumer
1. Subscribe `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION` ด้วย group `KAFKA_GROUP_TOPIC_PAYMENT_GATEWAY_TRANSACTION`
2. Unmarshal event เป็น `PaymentTransaction`
3. ตรวจ `message_event` ว่ามีคำว่า `inquiry` หรือไม่ เพื่อกำหนด `isInquiry`
4. Upsert transaction fields ลง `payment_inquiry.payment_summary`
5. ตั้ง `app_status` ตาม transaction status เช่น `SUCCESS` หรือ `FAILED`
6. ถ้า `isInquiry = false` จะหา summary จาก `payment_request_id`; ถ้าไม่พบจะ fallback ไปหาโดย `transaction_id`
7. ถ้าเจอ `request_callback_url` จะสร้าง response แล้ว POST callback กลับระบบต้นทาง
8. บันทึกผลการส่ง callback ลง `callback_send_success` และ `callback_error_msg`

### 3. FX Transaction Consumer
1. Subscribe `KAFKA_TOPIC_PAYMENT_GATEWAY_FX_TRANSACTION` ด้วย group `KAFKA_GROUP_TOPIC_PAYMENT_GATEWAY_FX_TRANSACTION`
2. ส่ง event เข้า `ConsumerFXTransactionService`
3. บันทึกข้อมูล FX transaction ลง repository ที่เกี่ยวข้อง

## 📥 Consumed Topics

| Consumer | Topic Config | Group Config | หน้าที่ |
| :--- | :--- | :--- | :--- |
| Payment Request | `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST` | `KAFKA_GROUP_TOPIC_PAYMENT_GATEWAY_REQUEST` | เก็บ request summary และ callback URL |
| Payment Transaction | `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION` | `KAFKA_GROUP_TOPIC_PAYMENT_GATEWAY_TRANSACTION` | เก็บผลธุรกรรมและ callback |
| FX Transaction | `KAFKA_TOPIC_PAYMENT_GATEWAY_FX_TRANSACTION` | `KAFKA_GROUP_TOPIC_PAYMENT_GATEWAY_FX_TRANSACTION` | เก็บ FX transaction |

## 📤 Callback Response

สำหรับ normal payment transaction (`isInquiry = false`) ระบบจะ callback ไปที่ `request_callback_url`

| กรณี                                                 | Payload ที่ส่ง                                                                     |
| :--------------------------------------------------- | :--------------------------------------------------------------------------------- |
| มี Payment Request เดิม                              | PMG response จาก `PmgResponseService.GetResponse()` และ `data` จาก payment summary |
| ไม่พบ Payment Request เดิม แต่มี transaction payload | ส่ง `transaction_payload` กลับตรงๆ                                                 |

ข้อมูลสำคัญใน `data` ของ normal response ได้แก่ `request_id`, `merchant_account_code`, bank account, `request_amount`, `amount`, `currency`, `bank_transaction_id`, `status`, `transaction_datetime`, และ `payment_request_id`

## 🛠️ Technical Reference

- **Codebase Root**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-inquiry-service`
- **Worker Entrypoint**: `cmd/worker/main.go`
- **Kafka Consumer Loop**: `kafka/messaging/consumer.go`
- **Request Consumer**: `kafka/messaging/payment-request.go`, `pkg/consumerrequest/service.go`
- **Transaction Consumer**: `kafka/messaging/payment-transaction.go`, `pkg/consumertransaction/service.go`
- **FX Consumer**: `kafka/messaging/fx-transaction.go`, `pkg/consumerfxtransaction/service.go`
- **Summary Repository**: `storages/postgres/db/payment_summary_repository/payment_summary_repository.go`
- **Callback Client**: `third_party/callback/service.go`

## 🤖 How to Verify

ให้รันคำสั่งจาก `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-inquiry-service`

ตรวจสอบ worker consumers ทั้ง 3 ตัว:
`grep -n "RunPaymentRequestConsumer\\|RunPaymentTransactionConsumer\\|RunFXTransactionConsumer" cmd/worker/main.go`

ตรวจสอบ topic และ group ของ transaction consumer:
`grep -n "TopicPaymentGatewayTransaction\\|GroupIDPaymentGatewayTransaction" cmd/worker/main.go internal/config/config.go`

ตรวจสอบ payment transaction consume และ `isInquiry` rule:
`grep -n "strings.Contains.*inquiry\\|ConsumePaymentTransaction" kafka/messaging/payment-transaction.go pkg/consumertransaction/service.go`

ตรวจสอบ upsert summary และ callback tracking:
`grep -n "UpSertPaymentTransaction\\|UpdateSendCallback\\|GetByPaymentRequestId\\|GetByTransactionId" pkg/consumertransaction/service.go storages/postgres/db/payment_summary_repository/payment_summary_repository.go`

ตรวจสอบ callback HTTP behavior:
`grep -n "CallbackPaymentConfirm\\|StatusCode != 200\\|HeaderAuthorization" third_party/callback/service.go`

## ⚠️ ข้อควรระวัง (Edge Cases & Failure Handling)

- **No Event Filter:** Payment Transaction consumer ไม่บังคับว่า event ต้องเป็น `payment.success` หรือ `payment.failed`; ถ้า message unmarshal เป็น `PaymentTransaction` ได้ จะถูก process
- **Inquiry Event Does Not Callback:** ถ้า `message_event` มีคำว่า `inquiry` จะ upsert summary แต่ไม่ callback
- **Callback URL Missing:** ถ้า summary ไม่มี `request_callback_url` จะไม่ส่ง callback และ handler จบแบบไม่ error
- **Callback Failure Retries Message:** ถ้า callback fail แล้ว `ConsumePaymentTransaction` return error, consumer loop จะไม่ commit message
- **Request/Transaction Arrival Order:** กรณีปกติควร consume request ก่อน transaction เพื่อให้ callback URL อยู่ใน summary; ถ้า transaction มาก่อน request อาจเกิด transaction-only row และไม่ callback หากไม่มี `callback_url` ใน transaction event

---
title: Payment Gateway End-to-End Flow
tags: [payment-gateway, flow, kafka, scb, callback]
status: active
last-updated: 2026-05-03
---

# 🔁 Business Logic: Payment Gateway End-to-End Flow

เอกสารนี้สรุป flow การทำงานรวมของ Payment Gateway ตั้งแต่การรับคำขอ payment, ส่งต่อไปยัง adaptor, รับผลธุรกรรม, จนถึง callback กลับระบบต้นทาง

---

## 🎯 วัตถุประสงค์
อธิบายภาพรวมของ payment flow เพื่อให้เข้าใจว่าแต่ละ service รับผิดชอบอะไร ส่ง event อะไร และเงื่อนไขใดที่ทำให้รายการเดินต่อหรือถูก ignore/reject

## 🔄 End-to-End Flow

```text
Source System
  |
  | POST /api/v1/payment
  v
payment-core-service
  |
  | validate + insert payment_request
  | produce: payment.initial.<bank_gateway>
  v
Kafka: payment_request topic
  |
  | consume เฉพาะ payment.initial.scb + IMBANK
  v
payment-adaptor-service-scb-worker
  |
  | insert adaptor request
  | call SCB: Access Token -> Initiate -> Confirm
  | insert payment_transaction
  | produce: payment.success / payment.failed
  v
Kafka: payment_transaction topic
  |
  | consume transaction result
  v
payment-inquiry-service-worker
  |
  | upsert payment_summary
  | callback result to request_callback_url
  v
Source System Callback Endpoint
```

## 📜 กฎธุรกิจหลัก (Business Rules)

| ลำดับ | Service | หน้าที่ | ผลลัพธ์ |
| :--- | :--- | :--- | :--- |
| 1 | `payment-core-service` | รับ `POST /api/v1/payment`, ตรวจ auth และ validate request | บันทึก payment request และ produce `payment.initial.<bank_gateway>` |
| 2 | `payment-adaptor-service-scb-worker` | consume request ของ SCB/IMBANK และยิง SCB Bank Transfer API | produce `payment.success` หรือ `payment.failed` |
| 3 | `payment-inquiry-service-worker` | consume request/transaction events เพื่อรวมสถานะ | upsert `payment_inquiry.payment_summary` |
| 4 | `payment-inquiry-service-worker` | callback ผลธุรกรรมกลับระบบต้นทาง | update `callback_send_success` หรือ `callback_error_msg` |

## ✅ Routing Conditions

| จุดตรวจ | เงื่อนไขที่ต้องผ่าน | ถ้าไม่ผ่าน |
| :--- | :--- | :--- |
| Core validation | `payment_method = IMBANK` และ `payment_channel = IMBANK` | API ตอบ `400 pmg998`, ไม่ insert และไม่ produce |
| Core event routing | `bank_gateway = scb` | ถ้าเป็นค่าอื่น event จะไม่เข้า SCB worker |
| SCB worker filter | `message_event = payment.initial.scb` | worker ignore และ commit message |
| SCB worker filter | `data.payment_method = IMBANK` | worker ignore และ commit message |
| Inquiry callback | transaction event ไม่ใช่ inquiry event และมี `request_callback_url` | ถ้าไม่มี callback URL จะไม่ callback |

## 📥 Topics และ Events

| Topic | Producer | Consumer | Event |
| :--- | :--- | :--- | :--- |
| `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST` | `payment-core-service` | `payment-adaptor-service-scb-worker`, `payment-inquiry-service-worker` | `payment.initial.<bank_gateway>` |
| `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION` | `payment-adaptor-service-scb-worker` | `payment-inquiry-service-worker` | `payment.success`, `payment.failed` |
| `KAFKA_TOPIC_PAYMENT_GATEWAY_FX_TRANSACTION` | FX-related producer | `payment-inquiry-service-worker` | FX transaction events |

## 🧩 Service Responsibilities

### 1. payment-core-service
- รับ request จากระบบต้นทาง
- validate required fields, amount, payment type, method และ channel
- reject ทันทีถ้า `payment_method` หรือ `payment_channel` ไม่ใช่ `IMBANK`
- ตรวจ duplicate `request_id`
- default `currency = THB` ถ้าไม่ส่งมา
- บันทึก request ด้วย status `INITIAL`
- produce event `payment.initial.<bank_gateway>`

### 2. payment-adaptor-service-scb-worker
- consume payment request topic
- process เฉพาะ `payment.initial.scb` และ `IMBANK`
- copy request ลง DB ฝั่ง adaptor
- หา merchant account/config จาก `merchant_account_code`
- generate `external_id`
- สร้าง SCB Bank Transfer request จาก payer merchant account และ payee ใน `detail`
- call SCB API ตามลำดับ `Access Token -> Initiate -> Confirm`
- บันทึก transaction result
- produce `payment.success` หรือ `payment.failed`

### 3. payment-inquiry-service-worker
- consume payment request topic เพื่อสร้าง/อัปเดต summary ฝั่ง inquiry
- consume payment transaction topic เพื่อเติมผลธุรกรรม
- update `app_status` ตาม transaction status
- ถ้าเป็น normal transaction และมี callback URL จะขอ service token แล้ว callback กลับระบบต้นทาง
- บันทึกผล callback ลง `callback_send_success` และ `callback_error_msg`

## ⚠️ จุดเสี่ยงที่ต้องระวัง

- `bank_gateway` เป็น case-sensitive สำหรับ SCB flow: ต้องเป็น `scb` เพื่อให้ event เป็น `payment.initial.scb`
- ถ้า core produce `payment.initial.SCB` หรือ event อื่น SCB worker จะ ignore และ commit message
- SCB worker ไม่มี retry สำหรับ ignored message เพราะ handler return nil แล้ว commit
- Inquiry worker ไม่ filter event name ของ transaction; ถ้า unmarshal เป็น `PaymentTransaction` ได้จะ process
- ถ้า callback fail ใน inquiry worker handler จะ return error และไม่ commit message เพื่อ retry

## 🛠️ Technical Reference

- **Core Handler**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-core-service/handler/payment-handler.go`
- **Core Service**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-core-service/pkg/payment/service.go`
- **SCB Worker**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb/cmd/worker/main.go`
- **SCB Consumer**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb/internal/delivery/messaging/payment-request.go`
- **SCB Bank Transfer Service**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb/internal/service/scb/banktransfer/service.go`
- **Inquiry Worker**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-inquiry-service/cmd/worker/main.go`
- **Inquiry Transaction Consumer**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-inquiry-service/kafka/messaging/payment-transaction.go`
- **Inquiry Transaction Service**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-inquiry-service/pkg/consumertransaction/service.go`

## 🤖 How to Verify

ตรวจสอบ core produce event:
`grep -n "KAFKA_EVENT_INITIAL\\|producePaymentRequest" /Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-core-service/pkg/payment/service.go`

ตรวจสอบ SCB worker filter:
`grep -n "PaymentInitialScb\\|METHOD_IMBANK" /Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb/internal/delivery/messaging/payment-request.go /Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb/internal/model/payment-request-model.go`

ตรวจสอบ SCB produce transaction:
`grep -n "PaymentTransactionToEvent\\|payment\\." /Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb/internal/service/scb/banktransfer/service.go /Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb/internal/service/scb/processfail/service.go`

ตรวจสอบ inquiry consume/callback:
`grep -n "RunPaymentTransactionConsumer\\|CallbackPaymentConfirm\\|UpdateSendCallback" /Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-inquiry-service/cmd/worker/main.go /Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-inquiry-service/pkg/consumertransaction/service.go`

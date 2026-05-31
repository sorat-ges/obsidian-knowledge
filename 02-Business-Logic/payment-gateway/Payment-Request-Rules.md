---
title: Payment Gateway Request Rules
tags: [payment-gateway, payment, validation, imbank, kafka]
status: active
last-updated: 2026-05-03
---

# 💳 Business Logic: Payment Gateway Request

เอกสารนี้สรุปกฎธุรกิจของการสร้างคำขอชำระเงินผ่าน `payment-core-service` โดยอ้างอิงจาก `handler/payment-handler.go` และผลลัพธ์สำคัญใน `pkg/payment/service.go`

---

## 🎯 วัตถุประสงค์
รับคำขอสร้าง Payment จากระบบต้นทาง ตรวจสอบสิทธิ์และข้อมูลบังคับ ก่อนบันทึกรายการ Payment Request และส่ง Event ให้ระบบ Gateway/Bank ดำเนินการต่อ

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **Authentication** | ทุกคำขอ `POST /api/v1/payment` | ต้องมี `PortalClaims`; ถ้าแปลง Claims ไม่ได้ ระบบตอบ `401 Unauthorized` |
| **Request Body** | Body ว่างหรือ Bind JSON ไม่สำเร็จ | ระบบตอบ `400 Bad Request` พร้อมรหัส `pmg998` |
| **Required Fields** | ก่อนเรียก Service | ต้องมี `request_id`, `payment_method`, `payment_channel`, `payment_type`, `bank_gateway`, `merchant_account_code`, `callback_url`, และ `detail` |
| **Amount Validation** | ทุกคำขอ | `amount` ต้องมากกว่า `0` |
| **Payment Type** | ทุกคำขอ | อนุญาตเฉพาะ `TRANSFER_IN` หรือ `TRANSFER_OUT` |
| **Payment Method** | ทุกคำขอจาก Handler ปัจจุบัน | อนุญาตเฉพาะ `IMBANK` เท่านั้น |
| **Payment Channel** | ทุกคำขอจาก Handler ปัจจุบัน | อนุญาตเฉพาะ `IMBANK` เท่านั้น |
| **Duplicate Request** | `request_id` ซ้ำในระบบ | Service ปฏิเสธด้วย Error `payment duplicate request_id` |
| **Initial Status** | เมื่อบันทึก Payment Request สำเร็จ | สถานะเริ่มต้นต้องเป็น `INITIAL` |
| **Default Currency** | ไม่ส่ง `currency` มาในคำขอ | ระบบกำหนดค่าเริ่มต้นเป็น `THB` |
| **Event Publishing** | หลังบันทึก Payment Request สำเร็จ | ระบบส่ง Kafka Event ด้วยชื่อ `payment.initial.<bank_gateway>` |
| **SCB Routing** | ต้องการส่งต่อให้ SCB adaptor worker | `bank_gateway` ต้องเป็น `scb` เพื่อให้ event เป็น `payment.initial.scb` |

## 🔄 ขั้นตอนการทำงาน (Logic Flow)

1. Client เรียก `POST /api/v1/payment` พร้อม Bearer Auth
2. Handler ตรวจสอบ `PortalClaims` เพื่อดึง `client_id`
3. Handler Bind JSON เข้า `PaymentRequest`
4. Handler ตรวจสอบ Required Fields, Amount, Payment Type, Payment Method, และ Payment Channel
5. Service ตรวจสอบว่า `request_id` ยังไม่ซ้ำ
6. Service บันทึก Payment Request พร้อม `client_id`, `INITIAL` status, และ `THB` default currency หากไม่ได้ส่ง currency มา
7. Service ส่ง Event `payment.initial.<bank_gateway>` ให้ระบบ downstream
8. API ตอบ `200 OK` พร้อม `payment_request_id` และ `status`

## ✅ Validation Matrix

| Field                   | Required | Rule                                                                    |
| :---------------------- | :------: | :---------------------------------------------------------------------- |
| `request_id`            |   Yes    | ต้องไม่เป็นค่าว่าง และห้ามซ้ำ                                           |
| `payment_method`        |   Yes    | ต้องเป็น `IMBANK`                                                       |
| `payment_channel`       |   Yes    | ต้องเป็น `IMBANK`                                                       |
| `payment_type`          |   Yes    | ต้องเป็น `TRANSFER_IN` หรือ `TRANSFER_OUT`                              |
| `bank_gateway`          |   Yes    | ใช้กำหนดปลายทาง Event `payment.initial.<bank_gateway>`                  |
| `merchant_account_code` |   Yes    | ต้องไม่เป็นค่าว่าง                                                      |
| `amount`                |   Yes    | ต้องมากกว่า `0`                                                         |
| `callback_url`          |   Yes    | ต้องไม่เป็นค่าว่าง                                                      |
| `detail`                |   Yes    | ต้องไม่เป็น `nil`; เป็น JSON object/raw payload สำหรับรายละเอียดธุรกรรม |
| `currency`              |    No    | ถ้าไม่ส่งมา ระบบใช้ `THB`                                               |

## 🛠️ Technical Reference

- **Codebase Root**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-core-service`
- **Handler**: `handler/payment-handler.go`
- **Primary Function**: `CreatePayment`, `ValidatePaymentRequest`
- **Service**: `pkg/payment/service.go`
- **Request Model**: `pkg/payment/model.go`
- **Enums**: `internal/constants/enum/payment_type_enum.go`, `payment_method_enum.go`, `payment_channel_enum.go`, `payment_status_enum.go`
- **Downstream Consumer**: `../payment-adaptor-service-scb/cmd/worker/main.go`

## 🤖 How to Verify

ให้รันคำสั่งจาก `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-core-service`

ตรวจสอบกฎ Required Fields และ Validation หลัก:
`grep -n "func ValidatePaymentRequest" handler/payment-handler.go`

ตรวจสอบว่า Handler รับเฉพาะ `IMBANK` สำหรับ Method และ Channel:
`grep -n "IsIMBANK" handler/payment-handler.go`

ตรวจสอบชนิด Payment Type ที่อนุญาต:
`grep -n "TRANSFER_IN\\|TRANSFER_OUT" internal/constants/enum/payment_type_enum.go`

ตรวจสอบ Duplicate Request, Initial Status, Default Currency และ Event Name:
`grep -n "IsExistRequestId\\|INITIAL\\|DEFAULT_CURRENCY\\|KAFKA_EVENT_INITIAL" pkg/payment/service.go internal/constants/application.go`

## ⚠️ ข้อควรระวัง (Edge Cases & Failure Handling)

- **Claims ผิดชนิด:** ระบบตอบ `401` ทันทีและไม่อ่าน Body
- **Validation Error:** ระบบตอบ `400` พร้อม `pmg998` และข้อความ `Payment Gateway Error - <reason>`
- **Service Error:** เช่น `request_id` ซ้ำ, Insert DB ล้มเหลว, หรือ Produce Event ล้มเหลว ระบบตอบ `500` พร้อม `pmg998`
- **Enum Naming:** แม้ Enum จะมี `QR`, `THQR`, และ `BOT` ในโค้ด แต่ Handler ปัจจุบันยอมรับเฉพาะ `IMBANK` สำหรับ `payment_method` และ `payment_channel`
- **Bank Gateway Case:** SCB adaptor worker ตรวจ `message_event = payment.initial.scb` แบบ case-sensitive; ถ้า core produce เป็น `payment.initial.SCB` จะถูก worker ignore

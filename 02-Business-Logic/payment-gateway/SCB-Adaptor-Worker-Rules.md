---
title: SCB Adaptor Worker Rules
tags: [payment-gateway, scb-adaptor, kafka, imbank, bank-transfer]
status: active
last-updated: 2026-05-03
---

# 🏦 Business Logic: SCB Adaptor Worker

เอกสารนี้สรุปกฎธุรกิจของ `payment-adaptor-service-scb/cmd/worker` ซึ่งเป็น Worker ที่ consume Payment Request จาก Kafka แล้วส่งคำสั่ง Bank Transfer ไปยัง SCB

---

## 🎯 วัตถุประสงค์
รับ Payment Request ที่ถูกสร้างจาก `payment-core-service` เฉพาะรายการของ SCB/IMBANK แล้วแปลงเป็นคำสั่งโอนเงินผ่าน SCB Bank Transfer API จากนั้นบันทึกผลธุรกรรมและส่ง Payment Transaction Event กลับเข้า Kafka

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ                       | เงื่อนไข (Condition)                       | กฎ (Rule) / ผลลัพธ์ (Result)                                                                                               |
| :--------------------------- | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **Consumer Topic**           | Worker เริ่มทำงาน                          | Subscribe Kafka topic จาก `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST`                                                            |
| **Consumer Group**           | Worker เริ่มทำงาน                          | ใช้ group จาก `KAFKA_GROUP_TOPIC_PAYMENT_GATEWAY_REQUEST`                                                                  |
| **Event Filtering**          | ทุก message ที่ consume ได้                | Process เฉพาะ `message_event = payment.initial.scb`                                                                        |
| **Payment Method Filtering** | ทุก message ที่ consume ได้                | Process เฉพาะ `payment_method = IMBANK`                                                                                    |
| **Ignored Message**          | Event ไม่ใช่ SCB หรือ Method ไม่ใช่ IMBANK | Worker log warning แล้ว ignore message                                                                                     |
| **Payment Request Mirror**   | Event ผ่านเงื่อนไข                         | บันทึกข้อมูล Payment Request ลง `payment_adaptor.payment_request`                                                          |
| **Merchant Account**         | ก่อนยิง SCB API                            | ต้องพบ `merchant_account_code` ใน `payment_adaptor.merchant_account` และ config ต้องมี `customer_ref_num_prefix`           |
| **External ID**              | ก่อนยิง SCB API                            | สร้าง `external_id` จาก `customer_ref_num_prefix + yyyyMMddHHmmss + random 7 digits` แล้ว update กลับไปที่ Payment Request |
| **SCB API Flow**             | เมื่อเตรียม request สำเร็จ                 | เรียก SCB ตามลำดับ: Access Token -> Initiate -> Confirm                                                                    |
| **Payment Detail**           | ก่อนสร้างคำขอ Initiate                     | `detail` ต้อง parse เป็นข้อมูลบัญชีปลายทางและ fee ได้                                                                      |
| **Fee Default**              | `fee_amount1` ไม่ถูกส่งมา                  | ตั้งค่า `fee_amount1 = 0`                                                                                                  |
| **Transaction Result**       | SCB Confirm สำเร็จ                         | บันทึก Payment Transaction เป็น `SUCCESS`                                                                                  |
| **Transaction Result**       | SCB API ไม่สำเร็จหรือไม่มีผล Confirm       | บันทึก/produce Payment Transaction เป็น `FAILED`                                                                           |
| **Transaction Event**        | หลังประมวลผลเสร็จ                          | Produce ไปที่ `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION` ด้วย event `payment.success` หรือ `payment.failed`                 |
| **Downstream Consumer**      | หลัง produce transaction event             | `payment-inquiry-service` worker consume ต่อเพื่อ upsert summary และ callback                                              |
| **Offset Commit**            | Handler ไม่ return error                   | Consumer commit Kafka message หลัง handler ทำงานจบ                                                                         |

## 🔄 ขั้นตอนการทำงาน (Logic Flow)

1. Worker สร้าง Kafka consumer และ subscribe topic `KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST`
2. Worker อ่าน message แล้ว unmarshal เป็น Payment Request Event
3. ถ้า `message_event != payment.initial.scb` หรือ `payment_method != IMBANK` จะ ignore
4. ถ้าผ่านเงื่อนไข จะเรียก `BankTransferService.CreatePayment`
5. Service copy Payment Request ลง DB ฝั่ง adaptor
6. Service หา Merchant Account จาก `merchant_account_code`
7. Service อ่าน Bank Transfer config จาก `merchant_account.config_json`
8. Service สร้าง `external_id` และ update กลับไปที่ Payment Request
9. Service สร้าง SCB Bank Transfer Initiate Request โดยใช้:
   - Payer: บัญชีจาก Merchant Account
   - Payee: บัญชีจาก `detail.bank_account_no` และ `detail.bank_code`
   - Amount/Currency: จาก Payment Request
   - Fee: จาก `detail.fee_amount1` ถึง `detail.fee_amount5`
10. Service เรียก SCB API ตามลำดับ Access Token, Initiate, Confirm
11. Service บันทึก Payment Transaction พร้อม bank response/payload
12. Service produce Payment Transaction Event ไปยัง Kafka topic `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION`

## ✅ Consume Contract

Worker นี้จะประมวลผลเฉพาะ message ที่มี contract ดังนี้:

| Field | Required Value / Rule |
| :--- | :--- |
| `message_event` | ต้องเป็น `payment.initial.scb` |
| `data.payment_method` | ต้องเป็น `IMBANK` |
| `data.merchant_account_code` | ต้อง map กับ merchant account ของ SCB adaptor ได้ |
| `data.detail.bank_account_no` | เลขบัญชีปลายทาง |
| `data.detail.bank_code` | Bank code ปลายทาง |
| `data.detail.fee_amount1` | ถ้าไม่ส่งมา default เป็น `0` |
| `data.amount` | ยอดเงินโอน |
| `data.currency` | สกุลเงินที่ส่งให้ SCB |

## 📤 Produced Transaction Event

เมื่อประมวลผลเสร็จ Worker จะส่ง event ไปยัง `KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION`

| สถานะ | Event | Data สำคัญ |
| :--- | :--- | :--- |
| Success | `payment.success` | `payment_request_id`, `request_id`, `external_id`, bank account, amount, bank transaction id, bank response |
| Failed | `payment.failed` | `payment_request_id`, payload/error, bank response code/message หากมี |

## 🛠️ Technical Reference

- **Codebase Root**: `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb`
- **Worker Entrypoint**: `cmd/worker/main.go`
- **Consumer Handler**: `internal/delivery/messaging/payment-request.go`
- **Bank Transfer Service**: `internal/service/scb/banktransfer/service.go`
- **Failure Producer**: `internal/service/scb/processfail/service.go`
- **Kafka Producer**: `internal/gateway/messaging/payment-transaction-producer.go`
- **Models**: `internal/model/payment-request-model.go`, `internal/model/payment-confirmation-event.go`
- **Downstream Consumer**: `../payment-inquiry-service/cmd/worker/main.go`

## 🤖 How to Verify

ให้รันคำสั่งจาก `/Users/soratgessakorn/Work/Projects/xas/payment-gateway/payment-adaptor-service-scb`

ตรวจสอบว่า Worker consume topic payment request:
`grep -n "ConsumerTopic.*TopicPaymentGatewayRequest" cmd/worker/main.go`

ตรวจสอบ event/method filtering:
`grep -n "PaymentInitialScb\\|METHOD_IMBANK" internal/delivery/messaging/payment-request.go internal/model/payment-request-model.go`

ตรวจสอบ topic request/transaction และ consumer group:
`grep -n "KAFKA_TOPIC_PAYMENT_GATEWAY_REQUEST\\|KAFKA_TOPIC_PAYMENT_GATEWAY_TRANSACTION\\|KAFKA_GROUP_TOPIC_PAYMENT_GATEWAY_REQUEST" Makefile`

ตรวจสอบ SCB API flow:
`grep -n "CallApiGetAccessToken\\|CallApiInitiate\\|CallApiConfirm" internal/service/scb/banktransfer/service.go`

ตรวจสอบ event ที่ produce หลังประมวลผล:
`grep -n "PaymentTransactionToEvent\\|payment\\." internal/service/scb/banktransfer/service.go internal/service/scb/processfail/service.go`

## ⚠️ ข้อควรระวัง (Edge Cases & Failure Handling)

- **Case Sensitive Event:** Consumer รอ `payment.initial.scb` ตัวเล็ก แต่ `payment-core-service` สร้าง event จาก `payment.initial.<bank_gateway>` ตามค่าที่ส่งมา ดังนั้น `bank_gateway` ต้องเป็น `scb` เพื่อให้ worker นี้ประมวลผล
- **Ignored Message Still Returns nil:** Message ที่ไม่เข้าเงื่อนไขถูก ignore และ handler return nil ทำให้ consumer commit message ได้
- **Merchant Config Missing:** ถ้าไม่พบ merchant account หรือไม่มี `customer_ref_num_prefix` จะถือว่า process fail และ produce `payment.failed`
- **SCB API Failure:** ถ้า Access Token, Initiate, หรือ Confirm ไม่สำเร็จ จะ produce `payment.failed` พร้อม payload/error ที่ระบบมี
- **No Retry in Handler:** โค้ด consumer commit เมื่อ handler ไม่ return error; failure ทางธุรกิจถูกแปลงเป็น `payment.failed` event แทนการ retry message เดิม

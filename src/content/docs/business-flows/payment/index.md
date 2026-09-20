---
title: Payment
description: จุดเริ่มต้นสำหรับ Flow รับคำขอชำระเงิน โอนผ่านธนาคาร สรุปผล callback และรายงาน customer payment receipt
capability: Payment
services: [payment-gateway, payment-core-service, payment-adaptor-service-scb, payment-inquiry-service, order-service, web-portal]
integrations: [SCB, kafka]
aliases: [payment, payment gateway, bank transfer, customer payment receipt report, payment receipt report, ชำระเงิน, โอนธนาคาร, รายงานใบเสร็จรับเงินลูกค้า, IMBANK]
status: active
lastUpdated: 2026-09-20
documentType: flow
---

เลือก Flow ตามช่วงของรายการที่กำลังพัฒนาหรือวินิจฉัย:

| Flow | Trigger | Participating services |
| :--- | :--- | :--- |
| [Payment Request and Bank Transfer](/business-flows/payment/payment-request-and-transfer/) | ระบบต้นทางเรียก `POST /api/v1/payment` เพื่อสร้างรายการ `IMBANK` | `payment-gateway` (umbrella), `payment-core-service`, `payment-adaptor-service-scb` |
| [Payment Inquiry and Callback](/business-flows/payment/payment-inquiry-and-callback/) | inquiry worker consume Payment Request หรือ Payment Transaction event | `payment-gateway` (umbrella), `payment-inquiry-service` |
| [Customer Payment Receipt Report](/business-flows/payment/customer-payment-receipt-report/) | พนักงานเลือก offering project และช่วงวันที่เพื่อ preview/download รายงาน Excel | `order-service`, `web-portal` |

Payment Request และ Payment Inquiry ต่อกันผ่าน Kafka: core publish request, SCB adapter publish transaction result และ inquiry worker รวมสถานะก่อน callback กลับระบบต้นทาง โดยชื่อ adapter/worker ใช้ระบุ ownership ภายใน Flow ไม่ได้แยกเป็นโครงสร้าง navigation ส่วน Customer Payment Receipt Report เป็น read/report path แยกจาก settlement และ callback

## Context ที่เกี่ยวข้อง

- [Service Map](/system-context/service-map/)
- [Integrations](/system-context/integrations/)
- [Error Code Registry](/shared-rules/error-codes/)

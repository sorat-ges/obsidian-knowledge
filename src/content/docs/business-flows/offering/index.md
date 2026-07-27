---
title: Offering
description: จุดเริ่มต้นสำหรับ Flow จองซื้อ Offering หรือ ICO ที่ครอบคลุม eligibility, validation และสถานะผลลัพธ์
capability: Offering
services: [order-service]
aliases: [offering, ICO, subscription, order offering, จองซื้อ, จองซื้อไอซีโอ]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

Flow หลัก:

- [Subscription and Eligibility](/business-flows/offering/subscription-and-eligibility/) — รวม preconditions, การคำนวณยอด, เงื่อนไขรายผลิตภัณฑ์และโครงการ, payment validation, status ที่รู้จัก, rejection/refund และเอกสารปลายทาง

## Participating services

- `order-service` — เจ้าของ validation และ lifecycle ที่เอกสารต้นทางยืนยัน

เอกสารต้นทางที่ใช้ใน migration นี้ไม่ได้ยืนยัน service อื่นใน end-to-end path จึงไม่ใส่ ownership เพิ่มจากการคาดเดา

## กฎที่เกี่ยวข้อง

- [Order State Machine](/shared-rules/order-state-machine/)
- [Error Code Registry](/shared-rules/error-codes/)

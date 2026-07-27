---
title: Offering
description: จุดเริ่มต้นสำหรับ Flow จองซื้อ Offering/ICO และการตั้งค่า yield payment
capability: Offering
services: [order-service, product-service]
aliases: [offering, ICO, subscription, order offering, yield payment setup, จองซื้อ, จองซื้อไอซีโอ, ตั้งค่าผลตอบแทน]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

Flow หลัก:

- [Subscription and Eligibility](/business-flows/offering/subscription-and-eligibility/) — รวม preconditions, การคำนวณยอด, เงื่อนไขรายผลิตภัณฑ์และโครงการ, payment validation, status ที่รู้จัก, rejection/refund และเอกสารปลายทาง
- [Yield Payment Setup](/business-flows/offering/yield-payment-setup/) — เลือก project/product, validate XLSX, preview yield calculation และสร้าง active setup แบบ versioned

## Participating services

- `order-service` — เจ้าของ validation และ lifecycle ที่เอกสารต้นทางยืนยัน
- `product-service` — เจ้าของการตั้งค่า, คำนวณ, version และเก็บ yield payment plan

เอกสารต้นทางที่ใช้ใน migration นี้ไม่ได้ยืนยัน service อื่นใน end-to-end path จึงไม่ใส่ ownership เพิ่มจากการคาดเดา

## กฎที่เกี่ยวข้อง

- [Order State Machine](/shared-rules/order-state-machine/)
- [Error Code Registry](/shared-rules/error-codes/)

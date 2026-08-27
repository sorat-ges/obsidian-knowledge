---
title: Service Map
description: แผนที่ความรับผิดชอบของ service ตาม Business Flow และงาน integration
status: active
lastUpdated: 2026-08-27
documentType: system-context
---

ใช้หน้านี้เพื่อค้นหา Service ที่รับผิดชอบแต่ละส่วนของ Business Flow โดย Service เป็นข้อมูลประกอบของ Flow ไม่ใช่โครงสร้างหลักของเอกสาร

| Service | ความรับผิดชอบ |
| :--- | :--- |
| `order-service` | Order validation, trading orchestration, withdrawal และ internal transfer |
| `order-consumer` | Consume customer/order events, sync customer account data และ trigger status-specific system cancellation ใน `order-service` |
| `asset-service` | Portfolio balances และ reports |
| `asset-consumer` | Ledger application, XD sync และ master-data sync |
| `onboarding-service` | Customer onboarding, suitability, re-KYC, KYC expiry, account suspension และ status transition เป็น `freeze` สำหรับ auto-rejected existing/re-KYC customer |
| `product-service` | Product master และ Yield Payment Setup สำหรับ Offering |
| `payment-gateway` | Payment requests, bank adapters, inquiry และ callbacks |

รายละเอียด Partner ภายนอกดูที่ [Third-Party Integrations Profile](/system-context/integrations/)

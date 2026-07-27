---
title: Service Map
description: แผนที่ความรับผิดชอบของ service ตาม Business Flow และงาน integration
status: active
lastUpdated: 2026-07-27
documentType: system-context
---

ใช้หน้านี้เพื่อค้นหา Service ที่รับผิดชอบแต่ละส่วนของ Business Flow โดย Service เป็นข้อมูลประกอบของ Flow ไม่ใช่โครงสร้างหลักของเอกสาร

| Service | ความรับผิดชอบ |
| :--- | :--- |
| `order-service` | Order validation, trading orchestration, withdrawal และ internal transfer |
| `asset-service` | Portfolio balances และ reports |
| `asset-consumer` | Ledger application, XD sync และ master-data sync |
| `payment-gateway` | Payment requests, bank adapters, inquiry และ callbacks |

รายละเอียด Partner ภายนอกดูที่ [Third-Party Integrations Profile](/system-context/integrations/)

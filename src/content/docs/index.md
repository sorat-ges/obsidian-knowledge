---
title: Gus Knowledge
description: ค้นหา Business Flow แบบ end-to-end สำหรับนักพัฒนา
status: active
lastUpdated: 2026-07-27
documentType: developer-guide
---

เริ่มจาก **Flow ที่กำลังพัฒนา** ไม่ใช่ชื่อ Service แต่ละหน้าอธิบายเหตุการณ์ตั้งแต่เริ่มจนจบ พร้อมระบุ Service ที่รับผิดชอบในแต่ละช่วง

## Business Flow

| Capability | ใช้เมื่อ |
| :--- | :--- |
| [Trading](/business-flows/trading/) | Swap Market/Limit, Big Lot, Routing และ Hedging |
| [Fund Movement](/business-flows/fund-movement/) | ถอนเงินบาท ฝาก/ถอนคริปโต และ Internal Transfer |
| [Asset Management](/business-flows/asset-management/) | Ledger processing, Portfolio/Reporting, XD และ Master Data Sync |
| [Payment](/business-flows/payment/) | Payment Request, Bank Transfer, Inquiry และ Callback |
| [Offering](/business-flows/offering/) | Subscription และ Eligibility |

## ตัวอย่างคำค้น

- ค้น `ถอนเงิน` → [Fund Movement / Fiat Withdrawal](/business-flows/fund-movement/fiat-withdrawal/)
- ค้น `remarketer` → [Trading / Swap Market Order](/business-flows/trading/swap-market-order/) และ [Swap Limit Order](/business-flows/trading/swap-limit-order/)
- ค้น `IMBANK` → [Payment / Payment Request and Transfer](/business-flows/payment/payment-request-and-transfer/)

ค้นได้ทั้งชื่อ Flow ภาษาไทย/อังกฤษ, Service, Integration และ Error Code

## แหล่งอ้างอิงประกอบ

- [Shared Rules](/shared-rules/glossary/) — คำศัพท์ Error Code สิทธิ์ Security, Fee, State และ Ledger
- [System Context](/system-context/service-map/) — แผนที่ Service, Integration และ Infrastructure
- [System Design Fundamentals Learning Sessions](/learning-sessions/system-design-fundamentals-learning-sessions/) — session เรียนรู้ Invariant, Concurrency, Idempotency, Kafka และ Outbox
- [Reading Business Flows](/developer-guides/reading-business-flows/) — วิธีอ่าน Owner และลำดับของ Flow
- [Maintaining Documentation](/developer-guides/maintaining-docs/) — วิธีเพิ่มและตรวจเอกสาร
- [Logging and Code Quality](/developer-guides/logging-and-quality/) — มาตรฐาน log และ quality checks
- [Order Service Development Standards](/developer-guides/order-service-standards/) — กติกา layer, Go และการทดสอบ

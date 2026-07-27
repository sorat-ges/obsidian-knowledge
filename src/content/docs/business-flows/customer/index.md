---
title: Customer Onboarding and KYC
description: จุดเริ่มต้นสำหรับ Flow onboarding, suitability, re-KYC, KYC expiry และ account suspension
capability: Customer
services: [onboarding-service]
aliases: [customer onboarding, suitability, re-KYC, KYC expiry, เปิดบัญชี, แบบประเมินความเสี่ยง, ทบทวน KYC]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

Flow หลัก:

- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/) — ติดตามขั้น onboarding, คำนวณ suitability สำหรับ Traditional/Digital และยืนยันเพื่อเดิน registration ต่อ
- [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/) — คำนวณวันหมดอายุจากบัตรประชาชน, CDD และ suitability ก่อนระงับลูกค้าและบัญชีที่ครบเงื่อนไข

## Participating services

- `onboarding-service` — Business owner และ executor ของ Flow ที่ source ยืนยันใน capability นี้

Frontend repositories ที่เกี่ยวข้องมี uncommitted changes ในรอบ sync นี้ จึงไม่ได้ใช้ยืนยัน client trigger, route หรือข้อความที่ผู้ใช้เห็น

## กฎที่เกี่ยวข้อง

- [Permissions and Access Control](/shared-rules/permissions/)
- [Error Code Registry](/shared-rules/error-codes/)
- [Service Map](/system-context/service-map/)

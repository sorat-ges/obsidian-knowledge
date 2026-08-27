---
title: Customer Onboarding and KYC
description: จุดเริ่มต้นสำหรับ Flow onboarding, suitability, KYC review retake, re-KYC, KYC expiry, account suspension และ account freeze
capability: Customer
services: [onboarding-service, order-consumer, order-service, asset-consumer, web-portal]
aliases: [customer onboarding, suitability, KYC retake, retake-re-kyc, re-KYC, KYC expiry, account suspension, account freeze, cancel orders on freeze, onboarding reminder, reminder email, เปิดบัญชี, ถ่ายบัตรใหม่, แบบประเมินความเสี่ยง, ทบทวน KYC, อีเมลเตือนเปิดบัญชี, ระงับบัญชี, Freeze บัญชี]
status: active
lastUpdated: 2026-08-27
documentType: flow
---

Flow หลัก:

- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/) — ติดตามขั้น onboarding, คำนวณ suitability สำหรับ Traditional/Digital และยืนยันเพื่อเดิน registration ต่อ
- [Onboarding Reminder Email](/business-flows/customer/onboarding-reminder-email/) — ส่งอีเมลเตือน draft onboarding และแจ้ง IT เมื่อส่งรายใดล้มเหลว
- [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/) — เจ้าหน้าที่ส่ง application กลับให้ลูกค้าถ่ายบัตรใหม่, เทียบข้อมูล DOPA และส่งกลับเข้า review
- [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/) — คำนวณวันหมดอายุจากบัตรประชาชน, CDD และ suitability ก่อนระงับลูกค้า รวมถึง rejection ที่ทำให้ existing/re-KYC account เป็น `freeze`

## Participating services

- `onboarding-service` — Business owner และ executor ของ KYC status transition และ rejection path
- `order-consumer` — รับ `CustomerSync` และ trigger downstream cancellation เมื่อ account status ไม่ใช่ `active`
- `order-service` — owner/executor ของ order status gate และ status-specific cancellation
- `asset-consumer` — sync สถานะ customer/account ไปยัง asset read model
- `web-portal` — supporting client ที่ map identification `freeze` เป็น label

Frontend repositories ที่เกี่ยวข้องมี uncommitted changes ในรอบ sync นี้ จึงไม่ได้ใช้ยืนยัน client trigger, route หรือข้อความที่ผู้ใช้เห็น

## กฎที่เกี่ยวข้อง

- [Permissions and Access Control](/shared-rules/permissions/)
- [Error Code Registry](/shared-rules/error-codes/)
- [Service Map](/system-context/service-map/)

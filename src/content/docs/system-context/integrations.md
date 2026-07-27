---
title: Third-Party Integrations Profile
description: บทบาทและกฎการเชื่อมต่อกับ Partner ภายนอกที่ใช้ใน Business Flow
tags: [architecture, integration, external, sdk]
status: active
lastUpdated: 2026-04-19
documentType: system-context
---

## 🎯 วัตถุประสงค์
รวบรวมข้อมูลและกฎการเชื่อมต่อกับบริการภายนอก (Third-Party Services) เพื่อให้ระบบ `order-service` และ `asset-service` ทำงานร่วมกับ Partners ได้อย่างถูกต้อง

## 📜 กฎธุรกิจ (Integration Rules)

| Partner | Role | Core Responsibility |
| :--- | :--- | :--- |
| **Remarketer** | Trading & Liquidity | Smart Order Routing (SOR) และการ Execute คำสั่งเทรด |
| **Fireblocks** | Asset Custody | ดูแล Vault, ตรวจสอบ Blockchain Transaction และ Withdrawal |
| **Payment Gateway** | Fiat Transfer | จัดการการถอนเงินบาท (SCB/KBank) และแจ้งสถานะ |
| **Thai Bulk** | OTP Service | ส่งรหัส OTP ผ่าน SMS/Email เพื่อยืนยันตัวตน |
| **Credential Centric** | Identity & KYC | ยืนยันตัวตนและข้อมูลโปรไฟล์ลูกค้า |

## 🛠️ Technical Reference
- ✅ **Webhook Timeout**: ต้องจัดการ Retry เมื่อไม่ได้รับ Response ภายในกำหนด
- ✅ **Idempotency Key**: ต้องใช้เพื่อป้องกันการทำรายการซ้ำ (Double Entry)
- ✅ **Circuit Breaker**: ต้องหยุดระบบ Trading ทันทีหาก Remarketer ล่ม

## วิธีตรวจสอบ
1. ทดสอบ Webhook Callback และตรวจสอบ Logs ของ Idempotency Key
2. จำลองสถานะ Partner ล่ม (e.g., Timeout) และยืนยันผลลัพธ์ของ Circuit Breaker
3. ตรวจสอบการส่ง OTP และยืนยันสถานะความสำเร็จจาก Partner Logs

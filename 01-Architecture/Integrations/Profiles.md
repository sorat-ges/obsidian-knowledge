---
title: Third-Party Integrations Profile
tags: [architecture, integration, external, sdk]
status: active
last-updated: 2026-04-06
---

# 🔌 Third-Party Integrations Profile

สรุปข้อมูลการเชื่อมต่อกับบริการภายนอก (External Partners) ที่ระบบ `order-service` และ `asset-service` ใช้งาน

## 🪙 Trading & Liquidity
### 1. Remarketer Service
- **บทบาท**: ศูนย์กลางการกระจายคำสั่งซื้อขาย (Smart Order Routing)
- **การเชื่อมต่อ**: REST API / Kafka
- **หน้าที่หลัก**: 
  - ให้ข้อมูล Swap Routes ในขั้นตอน Inquiry
  - รับคำสั่งเทรด (Execute) และแจ้งผลกลับผ่าน Webhook

### 2. Digital Asset Custody (Fireblocks)
- **บทบาท**: ผู้ดูแลรักษาความปลอดภัยของสินทรัพย์ดิจิทัล (Vault)
- **หน้าที่หลัก**: 
  - ตรวจสอบสถานะ Transaction บน Blockchain
  - แจ้งผลการถอนคริปโต (Withdrawal) ผ่าน Webhook

## 💸 Payment & Banking
### 1. Payment Gateway (SCB / KBank)
- **บทบาท**: ช่องทางการโอนเงินบาท (Fiat Transfer)
- **หน้าที่หลัก**: 
  - จัดการการถอนเงิน (Withdrawal)
  - แจ้งสถานะการโอนสำเร็จ/ล้มเหลวกลับมายังระบบ

### 2. Thai Bulk (OTP Service)
- **บทบาท**: ผู้ให้บริการส่งรหัสผ่านใช้ครั้งเดียว (One-Time Password)
- **การเชื่อมต่อ**: REST API
- **หน้าที่หลัก**: ส่งรหัส OTP ไปยัง SMS/Email ของลูกค้าเพื่อยืนยันตัวตน

## 🆔 Identity & Compliance
### 1. Credential Centric
- **บทบาท**: ระบบจัดการข้อมูลโปรไฟล์ลูกค้าและ KYC
- **หน้าที่หลัก**: ยืนยันตัวตนและสิทธิ์ของลูกค้าก่อนทำรายการ

---

## ⚠️ retry & Failure Policy (นโยบายการจัดการความล้มเหลว)
- **Webhook Timeout**: หากระบบรับ Webhook ไม่ได้ภายในเวลาที่กำหนด ต้องมีระบบ Retry (Idempotency Key สำคัญมาก)
- **Circuit Breaker**: หากระบบ Remarketer ล่ม ระบบเทรดแบบ Market ต้องปิดตัวลงทันทีเพื่อความปลอดภัยของลูกค้า

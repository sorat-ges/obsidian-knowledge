---
title: Infrastructure Migration (Nginx to Kong)
description: กฎและรายการตรวจสอบสำหรับย้าย Ingress Controller จาก Nginx ไป Kong
tags: [infrastructure, migration, kong, nginx]
status: active
lastUpdated: 2026-04-19
documentType: system-context
---

## 🎯 วัตถุประสงค์
เพื่อย้ายระบบ Ingress Controller จาก Nginx ไปยัง Kong Ingress เพื่อรองรับฟีเจอร์ API Gateway ระดับสูง เช่น Rate Limiting และ Plugin-based Authentication

## 📜 กฎธุรกิจ (Migration Rules)
- ✅ ต้องทำการ Backup Database ทั้งหมดก่อนเริ่มกระบวนการย้าย
- ✅ การเปลี่ยน Routing จาก Nginx เป็น Kong ต้องไม่ทำให้ Downtime เกินเวลาที่กำหนด
- ✅ ตรวจสอบ SSL/TLS Certificate ให้พร้อมใช้งานบน Kong Ingress

## 🛠️ Technical Reference
- **Current Stack**: Nginx Ingress Controller
- **Target Stack**: Kong Ingress Controller (DB-less mode)
- **Relevant Files**: [Kubernetes Ingress with Kong](/system-context/infrastructure/kong-ingress/)

## วิธีตรวจสอบ
1. ตรวจสอบสถานะ Pod ของ Kong: `kubectl get pods -n kong`
2. ทดสอบเรียก API ผ่าน Ingress ใหม่และตรวจสอบ HTTP Header `Via: kong`
3. ยืนยันว่า Plugin ที่ติดตั้ง (เช่น Rate Limit) ทำงานถูกต้อง

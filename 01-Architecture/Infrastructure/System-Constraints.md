---
title: System Infrastructure & Constraints
tags: [infrastructure, constraints, rate-limit, k8s, kong]
status: active
last-updated: 2026-04-06
---

# 🏗️ System Infrastructure & Constraints

ข้อมูลข้อจำกัดทางเทคนิคและการตั้งค่า Infrastructure ที่สำคัญของระบบ

## 🚪 API Gateway (Kong)
- **Role**: หน้าด่านสำหรับการตรวจสอบสิทธิ์ (Auth) และจำกัดปริมาณคำขอ (Rate Limit)
- **Key Constraints**:
  - **Rate Limiting**: มีการตั้งค่าตาม IP Address หรือ API Key (ปกติอยู่ที่ 10-20 Requests Per Second สำหรับ Public API)
  - **Payload Size**: จำกัดขนาด Request Body (เช่น ไม่เกิน 10MB) สำหรับการอัปโหลดไฟล์/เอกสาร

## 📦 Container Orchestration (K8s)
- **Resources**: แต่ละ Service ถูกจำกัด CPU และ Memory (AI ควรรู้เพื่อไม่ให้เขียนโค้ดที่กินทรัพยากรสูงเกินไปในหนึ่ง Request)
- **Timeouts**: 
  - **Read Timeout**: 30-60 วินาที (หากประมวลผลนานกว่านี้ Gateway จะตัดการเชื่อมต่อ)
  - **Keep-Alive**: รองรับการทำ Connection Pooling เพื่อลด Latency

## 💾 Database & Storage
- **PostgreSQL**: 
  - ใช้ **GORM** เป็น ORM หลัก
  - จำกัดจำนวน Connection ต่อ Service Instance (Connection Pool)
- **Redis**: 
  - ใช้สำหรับการทำ Caching, OTP Cooldown และ Lock กลไก Distributed Lock
  - **Data Retention**: ข้อมูลใน Redis ส่วนใหญ่จะมี TTL (Time To Live) กำกับเสมอ

---

## 🚦 Maintenance Mode (โหมดปิดปรับปรุง)
ระบบสามารถเข้าสู่ Maintenance Mode ได้ 3 ระดับ:
1. **Global Maintenance**: ปิดทุกฟีเจอร์ผ่าน Kong/Ingress
2. **Feature Maintenance**: ปิดเฉพาะบางฟีเจอร์ (เช่น ปิดเฉพาะการถอนเงิน) ผ่านระบบ Config
3. **Pair Maintenance**: ปิดเฉพาะคู่เหรียญนั้นๆ (เช่น ปิดเทรดเฉพาะ BTC-THB) ในตาราง `maintenance`

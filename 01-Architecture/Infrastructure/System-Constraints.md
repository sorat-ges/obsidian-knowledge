---
title: System Infrastructure & Constraints
tags: [infrastructure, constraints, rate-limit, k8s, kong]
status: active
last-updated: 2026-04-19
---

# 🏗️ System Infrastructure & Constraints

## 🎯 วัตถุประสงค์
รวบรวมข้อจำกัดทางเทคนิคและสถาปัตยกรรมพื้นฐาน เพื่อให้นักพัฒนาออกแบบ Logic และ Implement โค้ดที่สอดคล้องกับทรัพยากรของระบบ

## 📜 กฎธุรกิจ (Business Constraints)

| Component | Constraint | Rule |
| :--- | :--- | :--- |
| **API Gateway** | Rate Limiting | 10-20 Requests/Second ต่อ IP สำหรับ Public API |
| **K8s Service** | Timeouts | Read Timeout ไม่เกิน 30-60 วินาที |
| **Payload Size** | Request Body | ห้ามเกิน 10MB ต่อ Request |
| **Database** | Connection | จำกัดการเชื่อมต่อผ่าน GORM Connection Pool |

### Maintenance Mode Levels
1. **Global Maintenance**: ปิดทุกฟีเจอร์ผ่าน Kong/Ingress
2. **Feature Maintenance**: ปิดเฉพาะฟีเจอร์ที่ระบุผ่าน Config
3. **Pair Maintenance**: ปิดเฉพาะคู่เทรดผ่านตาราง `maintenance`

## 🛠️ Technical Reference
- **Tech Stack**: PostgreSQL (GORM), Redis (Caching/Locking), Kubernetes (K8s)
- **Ingress Controller**: Kong (DB-less mode)
- **Logic File**: `02-Business-Logic/Shared/Security-Rules.md`

## 🤖 How to Verify
1. ทดสอบส่ง Request เกิน Rate Limit เพื่อยืนยัน HTTP 429
2. ตรวจสอบการทำงานของ GORM Connection Pool ใน Log เมื่อมี High Traffic
3. ทดสอบเปิด/ปิด Maintenance Mode และยืนยันผลลัพธ์ผ่าน API

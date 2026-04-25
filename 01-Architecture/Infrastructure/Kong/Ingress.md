---
title: Kubernetes Ingress with Kong
tags: [kubernetes, kong, architecture]
status: active
last-updated: 2026-04-19
---

# 🚪 Kubernetes Ingress with Kong

## 🎯 วัตถุประสงค์
อธิบายโครงสร้างและการตั้งค่า Kong Ingress Controller สำหรับจัดการการเข้าถึง API ภายนอกเข้าสู่ Cluster

## 📜 กฎธุรกิจ (Infrastructure Rules)
- ✅ **Path-Based Routing**: แยก Traffic ตาม Path (e.g., `/api` -> Service A)
- ✅ **TLS/SSL Termination**: จัดการใบรับรองที่ระดับ Ingress ผ่าน K8s Secrets
- ✅ **Annotations**: ใช้สำหรับการปรับแต่งฟีเจอร์ระดับสูง (e.g., `konghq.com/plugins`)
- ✅ **DB-less Mode**: ใช้หน่วยความจำในตัวแทนการใช้ Database แยก เพื่อความรวดเร็วและจัดการง่าย

## 🛠️ Technical Reference
- **Ingress Controller**: Kong Ingress Controller
- **Ingress Class**: `kong` หรือ `kong-customer` (ระบุผ่าน `ingressClassName`)
- **Key Annotations**:
  - `konghq.com/strip-path: "true"`: ตัด Path Prefix ก่อนส่งให้ Backend
  - `konghq.com/plugins`: ระบุชื่อ Plugin ที่ต้องการใช้งาน (เช่น Rate Limit, Auth)

### Resource Configuration
- **Memory Limit**: 512Mi
- **CPU Limit**: 300m
- **NGINX Workers**: จำกัดเหลือ 1 เพื่อประหยัด Memory

## 🤖 How to Verify
1. ตรวจสอบ Ingress Resource: `kubectl get ingress`
2. ทดสอบ Routing: `curl -I https://myapp.example.com/api`
3. ยืนยัน Annotations: `kubectl describe ingress <name>`

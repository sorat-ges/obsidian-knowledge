---
title: Kong Rate Limiting
description: กฎและตัวอย่างการตั้งค่า Kong Rate Limiting Plugin สำหรับ Public API
tags: [config, kubernetes, kong, ratelimit]
status: active
lastUpdated: 2026-04-19
documentType: system-context
---

## 🎯 วัตถุประสงค์
อธิบายวิธีการตั้งค่าและใช้งาน Rate Limiting Plugin ผ่าน Kong Ingress เพื่อป้องกันการโจมตีแบบ DoS และจำกัดปริมาณคำขอ API

![Rate-limit flow](/assets/RateLimit.png)

## 📜 กฎธุรกิจ (Rate Limiting Rules)

| Parameter | Value | Rule |
| :--- | :--- | :--- |
| `limit_by` | `ip` | จำกัดตามหมายเลข IP (มาตรฐานสำหรับ Public API) |
| `policy` | `local` | เก็บ Counter ในหน่วยความจำของ Pod (แนะนำสำหรับ Dev) |
| `policy` | `redis` | เก็บ Counter ใน Redis (แนะนำสำหรับ Production หลาย Pod) |

- ✅ การเปิดใช้งานต้องทำผ่าน `KongPlugin` resource
- ✅ การนำไปใช้ต้องระบุผ่าน Annotation `konghq.com/plugins` ใน Ingress

## 🛠️ Technical Reference
- **Plugin Type**: `rate-limiting`
- **Configuration (Example 5 req/min)**:
  ```yaml
  config:
    minute: 5
    limit_by: ip
    policy: local
  ```

## วิธีตรวจสอบ
1. ส่งคำขอ API เกินค่าที่กำหนด (e.g., มากกว่า 5 ครั้งต่อนาที)
2. ยืนยันว่าระบบตอบกลับด้วย HTTP Status `429 Too Many Requests`
3. ตรวจสอบ Response Headers ว่ามีข้อมูล `X-RateLimit-Limit` และ `X-RateLimit-Remaining`

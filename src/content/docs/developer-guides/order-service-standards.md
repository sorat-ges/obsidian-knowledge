---
title: Order Service Development Standards
description: ขอบเขตแต่ละ layer มาตรฐาน Go การบันทึก log การทดสอบ และคำสั่งตรวจสอบ order-service
status: active
lastUpdated: 2026-07-27
documentType: developer-guide
---

## ความรับผิดชอบของแต่ละ Layer

| Layer | ความรับผิดชอบ |
| :--- | :--- |
| Handler | รับและแปลง request/response แล้วเรียก Service; ห้ามใส่ Business Logic |
| Service | เป็นเจ้าของ Business Logic ใช้ dependency ผ่าน interface และห้าม import type จาก Handler |
| Repository | จัดการ Database หรือ Cache เท่านั้น; ห้ามใส่ Business Rule |

ส่ง `context.Context` จาก Handler ผ่าน Service ไป Repository เพื่อรักษา cancellation และ trace context ตลอด call chain

## มาตรฐาน Go

- ใช้ `ID` ในชื่อ Go แบบ PascalCase เช่น `OrderID`
- ใช้ snake_case ใน JSON tag เช่น `json:"order_id"`
- ห่อ error พร้อมบริบทด้วย `fmt.Errorf("context: %w", err)` เพื่อให้ caller ตรวจ root cause ได้
- หลีกเลี่ยงการเปลี่ยน error เป็นข้อความก่อนถึง boundary ที่รับผิดชอบตอบกลับหรือบันทึก log

## Context-aware Logging

ใช้ `logs.*WithContext(ctx, ...)` เพื่อให้ correlation ID ติดไปกับ log อย่าสร้าง `context.Background()` หรือ `context.TODO()` กลาง Service/Repository และอย่าบันทึก error เดิมซ้ำทุก layer

รายละเอียด schema, level และ trace propagation ดู [Logging and Code Quality](/developer-guides/logging-and-quality/)

## การทดสอบ

- วาง unit test คู่กับไฟล์หลัก เช่น `service.go` และ `service_test.go`
- ใช้ table-driven tests สำหรับหลาย input, branch และ expected error
- mock เฉพาะ external dependency ผ่าน interface และ assert ผลลัพธ์ที่ผู้เรียกเห็น
- ครอบคลุม success, validation failure, dependency failure และ boundary case ที่เกี่ยวข้อง

## การตรวจสอบก่อนส่งงาน

```bash
golangci-lint run ./...
go test ./...
```

ตรวจ Swagger annotations ใน Handler ให้ตรงกับ request, response, status และ error ที่ implementation ส่งจริง


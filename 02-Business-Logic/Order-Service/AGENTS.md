---
title: Order Service Developer Guide
tags: [guide, order-service, conventions, architecture]
status: active
last-updated: 2026-04-19
---

# 🛠️ Order Service Developer Guide

## 🎯 วัตถุประสงค์
กำหนดมาตรฐานการพัฒนา (Development Standards) สถาปัตยกรรม และแนวทางการเขียนโค้ดสำหรับระบบ `order-service` เพื่อให้มีความเป็นระเบียบและง่ายต่อการบำรุงรักษา

## 📜 กฎการพัฒนา (Development Rules)

### 1. Architecture Layers
- **Handler**: ห้ามมี Business Logic ให้เรียก Service เท่านั้น
- **Service**: ห้าม Import Handler types และเน้น Interface-based dependency
- **Repository**: จัดการเฉพาะ DB/Cache ห้ามมี Business rules

### 2. Coding Standards
- **Naming**: `ID` (PascalCase), `json:"order_id"` (snake_case)
- **Error**: ใช้ `fmt.Errorf("context: %w", err)` สำหรับ Error Wrapping
- **Logging**: ต้องใช้ `logs.*WithContext(ctx, ...)` เสมอ

### 3. Testing
- ต้องมี Unit Test คู่กับไฟล์หลัก (e.g., `service_test.go`)
- ใช้ **Table-driven tests** และ Mock external dependencies

## 🛠️ Technical Reference
- **Language**: Go 1.23
- **Framework**: Gin
- **ORM**: GORM (PostgreSQL)
- **Cache**: Redis

## 🤖 How to Verify
1. รัน Linter: `golangci-lint run ./...`
2. รัน Tests: `go test ./...`
3. ตรวจสอบ Swagger: ตรวจสอบ Annotations ใน Handler ว่าครบถ้วนหรือไม่

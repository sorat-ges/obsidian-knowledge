---
title: Kong Debugging Commands
description: คำสั่งตรวจสอบ Pod, logs, events และสถานะ Kong plugins
tags: [kubernetes, kong, config]
status: active
lastUpdated: 2026-04-19
documentType: system-context
---

## 🎯 วัตถุประสงค์
รวบรวมคำสั่งพื้นฐานในการตรวจสอบและแก้ไขปัญหาเมื่อ Kong Ingress Controller ทำงานผิดพลาด

## 📜 กฎธุรกิจ (Inspection Rules)
- ✅ ต้องตรวจสอบ Pod Status เสมอเมื่อ Config มีการเปลี่ยนแปลง
- ✅ การตรวจสอบ Logs ต้องแยกดูระหว่าง Container `proxy` (Nginx) และ `ingress-controller` (Sync Logic)
- ✅ ตรวจสอบ Plugin ทั้งระดับ Local (Namespace) และ Global (Cluster)

## 🛠️ Technical Reference

### 1. Pod Health & Events
- `kubectl get pods -n kong` - ตรวจสอบสถานะภาพรวม
- `kubectl describe pod <name> -n kong` - ดูสาเหตุเมื่อ Pod ค้าง (Events)

### 2. Logs Analysis
- `kubectl logs -f <name> -n kong -c proxy` - ดู Log ของตัว Proxy (NGINX)
- `kubectl logs -f <name> -n kong -c ingress-controller` - ดู Log ของ Controller (K8s Sync)

### 3. Plugin Status
- `kubectl get kongplugins -A` - ดู Plugin แยกตาม Namespace
- `kubectl get kongclusterplugins` - ดู Plugin ระดับ Global Cluster

## วิธีตรวจสอบ
1. ยืนยันว่า Pod ขึ้นสถานะ `READY 2/2`
2. ตรวจสอบว่า `RESTARTS` ของ Pod ไม่เพิ่มขึ้นวนลูป
3. ทดสอบเรียกใช้คำสั่ง `describe` และยืนยันว่าไม่มี Error ในส่วน `Events`

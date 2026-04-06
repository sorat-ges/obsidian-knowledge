---
title: Documentation Guide 2.0
tags: [meta, guide]
status: active
last-updated: 2026-04-06
---

# 📚 Gus Knowledge 2.0: Documentation Guide

คู่มือฉบับนี้ใช้สำหรับรักษามาตรฐานความรู้ใน Gus Knowledge ให้มีความชัดเจน ค้นหาง่าย และประหยัด Token สำหรับ AI Agent

## 💡 Quick Rules (AI-Ready Standards)
1. ✅ **Atomic Knowledge** - แยก 1 ไฟล์ต่อ 1 เรื่อง (เช่น 1 ไฟล์ต่อ 1 Business Rule)
2. ✅ **Structure Over Text** - ใช้ตาราง (Tables) และหัวข้อ (Bullets) แทนการเขียนบรรยายยาวๆ
3. ✅ **Add Frontmatter** - ต้องมีหัวไฟล์ (title, tags, status, last-updated) เสมอ
4. ✅ **Reference Code** - อ้างอิง Path ของ Code ที่เกี่ยวข้อง (เช่น `pkg/order/service.go`)
5. ✅ **No Fluff** - ตัดคำเกริ่นนำหรือคำอธิบายที่ไม่จำเป็นออก เน้น "กฎ" และ "ผลลัพธ์"

## 📂 โครงสร้างโฟลเดอร์ (New Structure)
- `01-Architecture/` - ภาพรวมระบบ, K8s, Kong, Ingress
- `02-Business-Logic/` - **(หัวใจหลัก)** กฎธุรกิจ, Flow การทำงาน, State Machine
- `03-Implementation/` - แผนการพัฒนา (Active = งานปัจจุบัน, Archive = งานที่เสร็จแล้ว)
- `04-API-Reference/` - รายละเอียด Endpoint (Request/Response)
- `05-Guides/` - คู่มือการทำงานต่างๆ (Onboarding, Deployment)
- `Assets/` - รูปภาพและ Diagram ทั้งหมด

## 🛠️ Templates ที่แนะนำ
ใช้ Template จาก `.obsidian/templates/` เพื่อความรวดเร็ว:
- `logic-template.md` - สำหรับเขียนกฎธุรกิจ (ใหม่)
- `architecture-template.md` - สำหรับภาพรวมระบบ
- `api-template.md` - สำหรับ Endpoint
- `guide-template.md` - สำหรับขั้นตอนการทำงาน (How-to)

## ✍️ แนวทางการเขียนเพื่อประหยัด Token
AI Agent จะใช้ `grep_search` และ `read_file` ดังนั้น:
- **Header**: ใช้ `#` เพียงอันเดียวสำหรับชื่อไฟล์ และ `##` สำหรับหัวข้อหลัก
- **Tables**: ใช้ตารางสำหรับ logic ที่มีเงื่อนไข (Conditional Logic)
- **Code Snippets**: ใส่เฉพาะส่วนที่สำคัญ (Core Logic) ไม่ต้องใส่ทั้งไฟล์

## 🔄 การบำรุงรักษา
- เมื่อ Implement แผนงานเสร็จ: ให้สรุป Logic ที่เกิดขึ้นใหม่ย้ายไปไว้ใน `02-Business-Logic/`
- เมื่อกฎเปลี่ยน: ให้แก้ที่ `02-Business-Logic/` ทันที และอัปเดต `last-updated`

---
title: AI Prompt: Knowledge Maintenance
tags: [guides]
status: active
last-updated: 2026-05-31
---

# 🧹 AI Prompt: Knowledge Maintenance

ใช้ชุดคำสั่งนี้เมื่อต้องการตรวจสอบว่ากฎธุรกิจ (Business Logic) ใน Gus Knowledge ยังตรงกับโค้ดล่าสุดในโปรเจกต์หรือไม่ (ควรทำทุกครั้งหลังจบ Sprint)

---

## 📋 ขั้นตอนการสั่งงาน (Instructions)

ให้คัดลอกข้อความด้านล่างนี้ไปวางเพื่อเริ่มการบำรุงรักษา:

> **Objective:** ตรวจสอบความถูกต้อง (Synchronize) ของไฟล์กฎธุรกิจ **[ระบุชื่อไฟล์ เช่น Swap-Rules.md]** กับโค้ดล่าสุดใน `order-service`
>
> **Rules for AI Agent:**
> 1. **Initial Audit:**
>    - อ่านไฟล์ Markdown ที่ระบุ และไปที่หัวข้อ `🤖 How to Verify`
>    - รันคำสั่งตรวจสอบ (Grep/Read) ตามที่ระบุไว้ในไฟล์นั้นๆ
>
> 2. **Mismatch Detection:**
>    - หากพบว่า **สูตรคำนวณ, เงื่อนไข (If-Else), หรือค่าคงที่ (Constants)** ในโค้ดเปลี่ยนไปจากที่จดไว้ ให้ระบุจุดที่ต่างออกมาให้ชัดเจน
>
> 3. **Update Documentation:**
>    - ทำการแก้ไขไฟล์ Markdown ให้ตรงตามโค้ดจริง (Surgical Update)
>    - ห้ามเปลี่ยนโครงสร้างไฟล์ (คงตารางและหัวข้อเดิมไว้)
>    - อัปเดตวันที่ในฟิลด์ `last-updated` ที่หัวไฟล์ (Frontmatter) เป็นวันที่ปัจจุบัน
>
> 4. **Confirmation:**
>    - สรุปสั้นๆ ว่ามีจุดไหนที่เปลี่ยนไปบ้าง หรือยืนยันว่า "กฎยังคงถูกต้อง 100%"

---

## 💡 กลยุทธ์การรักษาความสะอาด (Maintenance Strategy)

- **One File at a Time:** สั่งให้ตรวจสอบทีละไฟล์เพื่อประหยัด Token และความแม่นยำ
- **Post-PR Check:** ใช้ Prompt นี้ทันทีหลังจากมีการ Merge PR ที่สำคัญเกี่ยวกับ Business Logic
- **Full Audit:** หากต้องการตรวจสอบทั้งระบบ ให้สั่ง: *"ช่วยไล่ตรวจสอบไฟล์ทั้งหมดใน 02-Business-Logic/Shared/ โดยใช้ขั้นตอนใน AI-Maintenance-Prompt"*

---

## ⚠️ สิ่งที่ห้ามทำ (Anti-Patterns)
- ห้ามลบหัวข้อ `Technical Reference` หรือ `How to Verify` เด็ดขาด
- ห้ามเพิ่ม Implementation Noise (รายละเอียดการเขียนโค้ด) กลับเข้าไปในไฟล์กฎธุรกิจ

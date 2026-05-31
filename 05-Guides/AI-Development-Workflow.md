---
title: AI-Assisted Development Workflow
tags: [guide, workflow, prompt, copy-paste]
status: active
last-updated: 2026-04-06
---

# 🚀 AI-Assisted Development Workflow

ใช้คู่มือนี้ในการทำงานร่วมกับ AI Agent เพื่อให้การแก้ไขโค้ดมีความแม่นยำตามกฎธุรกิจและประหยัด Token สูงสุด

---

## 🟢 Step 1: เริ่มต้นและตรวจสอบกฎ (Context Loading)
**เป้าหมาย:** สั่งงาน AI และบังคับให้อ่านกฎที่เกี่ยวข้องก่อนเริ่ม
> **Prompt:**
> "I want to **[ระบุสิ่งที่ต้องการทำ เช่น แก้ไขสูตรคำนวณ Swap Fee]**.
> 1. Read `@00-Home.md` to identify which Business Rules apply.
> 2. Read `@02-Business-Logic/Order-Service/AGENTS.md` for coding standards.
> List the key business rules and coding constraints I should be aware of before we start."

---

## 🔍 Step 2: ค้นหาตำแหน่งโค้ด (Investigation)
**เป้าหมาย:** ให้ AI หาไฟล์และฟังก์ชันที่เกี่ยวข้องโดยไม่ต้องอ่านทั้งโฟลเดอร์
> **Prompt:**
> "Follow the instructions in `@05-Guides/AI-Investigation-Prompt.md` to map this requirement to the actual code. Tell me the file paths and line numbers of the logic we need to change."

---

## 💻 Step 3: ลงมือแก้ไขโค้ด (Implementation)
**เป้าหมาย:** แก้ไขโค้ดแบบ Surgical Edit และทำ Unit Test
> **Prompt:**
> "Follow the instructions in `@05-Guides/AI-Implementation-Prompt.md` to implement the changes.
> - Use the exact formulas from the relevant Business Rule file found in Step 1.
> - Ensure you add/update unit tests to verify the logic.
> - Use `replace` for surgical edits to keep the code clean."

---

## 🧹 Step 4: อัปเดตเอกสารให้ตรงกับโค้ด (Sync Docs)
**เป้าหมาย:** ป้องกันข้อมูลใน Gus Knowledge ล้าสมัย (Knowledge Rot)
> **Prompt:**
> "The code has changed. Follow `@05-Guides/AI-Maintenance-Prompt.md` to update the relevant Business Rule files in Gus Knowledge. Update the `last-updated` date in the file header."

---

## 💡 Pro Tips
- **Combine Step 1 & 2:** หากงานไม่ซับซ้อน สามารถรวมขั้นตอนได้โดยสั่ง:
  *"Read @00-Home.md. I want to [TASK]. Use @05-Guides/AI-Investigation-Prompt.md to find the code and suggest a plan."*
- **Surgical Logic:** เน้นย้ำให้ AI สนใจเฉพาะกฎใน `02-Business-Logic/` เพื่อไม่ให้มันเขียนโค้ดตามความเข้าใจของตัวเอง (Hallucination)

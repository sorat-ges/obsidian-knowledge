---
title: Required Skills & Role-Based Competencies
tags: [guide, skills, onboarding, career]
status: active
last-updated: 2026-04-19
---

# 🎯 ทักษะที่จำเป็นสำหรับโปรเจกต์ (Required Skills)

เพื่อให้การพัฒนาและบำรุงรักษา Gus Knowledge และ `order-service` เป็นไปอย่างมีประสิทธิภาพ ทีมงานควรมีทักษะครอบคลุมด้านต่างๆ ดังนี้:

---

## 🏗️ 1. ทักษะวิศวกรรมซอฟต์แวร์ (Core Engineering)
*   **Golang (Expert):** เข้าใจการเขียนโค้ดที่สะอาด (Clean Code), การจัดการ Concurrency, และ N-Tier Architecture (Domain, Service, Repository)
*   **Database & SQL:** เชี่ยวชาญ PostgreSQL, GORM, การออกแบบ Schema และการทำ Database Migration
*   **API Design:** เข้าใจหลักการ RESTful API และการจัดการ Error Codes ที่เป็นมาตรฐาน
*   **Security First:** เข้าใจเรื่อง Rate Limiting, OTP, และการป้องกันช่องโหว่พื้นฐาน

## 💰 2. ความรู้ด้านธุรกิจและฟินเทค (Domain Expertise)
*   **Ledger & Accounting Logic:** เข้าใจระบบบัญชีแยกประเภท (Double Entry), การจัดการยอดเงินลูกค้า (Available vs Hold)
*   **Crypto Operations:** เข้าใจกระบวนการฝาก/ถอนคริปโต, การจัดการ Webhooks (เช่น Fireblocks), และสถานะของ Transaction
*   **State Machine:** เข้าใจวงจรชีวิตของออเดอร์ (Order Lifecycle) และการเปลี่ยนสถานะที่ถูกต้อง (State Transition)

## 🤖 3. การวิศวกรรมความรู้ (Knowledge Engineering)
*   **AI-Ready Documentation:** ทักษะการเขียน Markdown ที่กระชับและมีโครงสร้างเพื่อให้ AI Agent อ่านและประมวลผลได้แม่นยำ
*   **Systems Analysis:** ความสามารถในการ "แกะโค้ด" (Reverse Engineering) เพื่อสรุปออกมาเป็นกฎธุรกิจ (Business Logic)
*   **Context Management:** รู้วิธีการแบ่งข้อมูล (Atomic Docs) เพื่อประหยัด Token และเพิ่มความแม่นยำให้กับ AI

## 🚀 4. การทำงานร่วมกับ AI (AI Collaboration)
*   **Prompt Engineering:** ทักษะการใช้ชุดคำสั่ง (Prompts) ในการสั่งงาน AI เพื่อตรวจสอบหรือแก้ไขโค้ด (เช่น การใช้ AI-Investigation/Implementation Prompts)
*   **AI Tooling:** เข้าใจการใช้เครื่องมืออย่าง MCP (Model Context Protocol) และ AI-Agent ต่างๆ เพื่อเพิ่มความเร็วในการทำงาน

---

## 💡 การประเมินตนเอง (Self-Assessment)
| ระดับความเชี่ยวชาญ | คำอธิบาย |
| :--- | :--- |
| **Junior** | สามารถใช้ AI-Prompt เพื่อดึงความรู้จากเอกสารได้ |
| **Senior** | สามารถสรุป Business Logic จากโค้ดใหม่ลงใน Gus Knowledge ได้ |
| **Architect** | สามารถออกแบบโครงสร้างความรู้และวางแผน Workflow สำหรับ AI ได้ |

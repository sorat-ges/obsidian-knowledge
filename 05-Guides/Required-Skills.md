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

## 🤖 3. การวิศวกรรมความรู้และทักษะด้าน AI (AI & Knowledge Engineering)
*   **AI-Ready Content Structuring:** ทักษะการเขียน Markdown ที่มีโครงสร้างชัดเจน (High Signal) เพื่อให้ AI Agent เข้าใจลำดับความสำคัญของข้อมูลได้ทันทีโดยไม่สับสน
*   **Context Window Management:** เข้าใจข้อจำกัดของ Context Window และรู้วิธีการแบ่งเอกสารเป็นส่วนย่อย (Atomic Docs) เพื่อให้ AI ทำงานได้แม่นยำและประหยัด Token
*   **Token Optimization:** รู้วิธีการเขียนข้อมูลที่ตัด "Filler words" ออก แต่ยังคง "Semantic meaning" ไว้ครบถ้วน เพื่อลดค่าใช้จ่ายและเพิ่มความเร็วของ AI
*   **Grounding & Verification:** ทักษะการใช้ AI ในการตรวจสอบความถูกต้องระหว่าง "เอกสาร" และ "โค้ดจริง" (Cross-referencing) เพื่อป้องกันปัญหา Documentation Rot
*   **Sub-agent Orchestration:** เข้าใจความต่างของ AI Agent แต่ละประเภท (เช่น `codebase_investigator` vs `generalist`) และรู้วิธีมอบหมายงาน (Delegation) ให้ถูกตัว
*   **Standardized Prompting:** เชี่ยวชาญการใช้และปรับปรุงชุดคำสั่งมาตรฐาน (`05-Guides/*.md`) เพื่อควบคุมผลลัพธ์ (Output) ของ AI ให้มีคุณภาพระดับ Production-ready

## 🚀 4. การทำงานร่วมกับ AI (AI Collaboration Workflow)
*   **Research-Strategy-Execution Loop:** เข้าใจขั้นตอนการทำงานร่วมกับ AI ตั้งแต่การสำรวจ (Research), วางแผน (Strategy) ไปจนถึงการลงมือทำ (Execution)
*   **Surgical Updates:** ทักษะการสั่งให้ AI แก้ไขโค้ดแบบ "ผ่าตัดเฉพาะจุด" เพื่อลดความเสี่ยงในการเกิด Side Effects ต่อระบบใหญ่
*   **AI Maintenance Awareness:** มีนิสัยในการอัปเดต Gus Knowledge ทุกครั้งที่มีการเปลี่ยนแปลง Logic เพื่อให้ AI "มีความรู้" ที่ทันสมัยอยู่เสมอ

---

## 💡 การประเมินตนเอง (Self-Assessment)
| ระดับความเชี่ยวชาญ | คำอธิบาย |
| :--- | :--- |
| **Junior** | สามารถใช้ AI-Prompt เพื่อดึงความรู้จากเอกสารได้ |
| **Senior** | สามารถสรุป Business Logic จากโค้ดใหม่ลงใน Gus Knowledge ได้ |
| **Architect** | สามารถออกแบบโครงสร้างความรู้และวางแผน Workflow สำหรับ AI ได้ |

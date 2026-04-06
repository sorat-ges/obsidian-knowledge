---
title: Gus Knowledge 2.0 - Central Index
tags: [home, index, hub]
status: active
last-updated: 2026-04-06
---

# 🏠 Gus Knowledge (AI-Ready Knowledge Base)

ยินดีต้อนรับสู่แหล่งรวม Business Logic และคู่มือระบบ Gus Knowledge เวอร์ชัน 2.0 ออกแบบมาเพื่อความแม่นยำและประหยัด Token สำหรับ AI Agent

---

## 🧭 กฎธุรกิจส่วนกลาง (Shared Logic)
*กฎมาตรฐานที่ใช้ร่วมกันทุก Service ภายในโปรเจกต์*

- [**Error Code Registry**](./02-Business-Logic/Shared/Error-Codes.md): สารานุกรมสำหรับการวินิจฉัยปัญหา (Diagnostic Guide)
- [**Permission Rules**](./02-Business-Logic/Shared/Permission-Rules.md): สิทธิ์การใช้งาน (ACL), บทบาท RM/Dealer และ Middleware
- [**Security Rules**](./02-Business-Logic/Shared/Security-Rules.md): การควบคุม OTP, Rate Limit และ Redis Cooldown

---

## 📦 กฎเฉพาะบริการ (Domain Specific Logic)

### [Order-Service](./02-Business-Logic/Order-Service/)
- [**Order-Service Rules (AGENTS)**](./02-Business-Logic/Order-Service/AGENTS.md): กฎเหล็กในการเขียนโค้ดสำหรับโปรเจกต์ Order-Service
- [**Swap Rules**](./02-Business-Logic/Order-Service/Swap-Rules.md): การเทรด Swap, สูตรคำนวณค่าธรรมเนียม และภาษี (VAT)
- [**Routing Rules**](./02-Business-Logic/Order-Service/Routing-Rules.md): กฎการคัดเลือกเส้นทางเทรดที่ดีที่สุด (Best Route)
- [**BigLot Rules**](./02-Business-Logic/Order-Service/BigLot-Rules.md): กฎเฉพาะสำหรับการเทรดล็อตใหญ่ (Bulk Order)
- [**Fee & Campaign Rules**](./02-Business-Logic/Order-Service/Fee-Campaign-Rules.md): ลำดับความสำคัญของค่าธรรมเนียม (Priority)
- [**Withdraw Rules**](./02-Business-Logic/Order-Service/Withdraw-Rules.md): กฎการถอนเงินบาทและค่าธรรมเนียมโอน
- [**Ledger Rules**](./02-Business-Logic/Order-Service/Ledger-Rules.md): การหมุนเวียนของเงิน (Money Flow) และประเภทบัญชี
- [**State Machine Rules**](./02-Business-Logic/Order-Service/State-Rules.md): วงจรชีวิตของออเดอร์ (Lifecycle) และสถานะต่างๆ

---

## 🛠️ เครื่องมือสำหรับ AI Agent (AI Toolbox)
- [**AI Investigation Prompt**](./05-Guides/AI-Investigation-Prompt.md): สำหรับให้ AI ศึกษาโค้ดแล้วสรุปความรู้
- [**AI Implementation Prompt**](./05-Guides/AI-Implementation-Prompt.md): สำหรับให้ AI ลงมือแก้ไขโค้ดตามกฎธุรกิจ
- [**AI Maintenance Prompt**](./05-Guides/AI-Maintenance-Prompt.md): สำหรับตรวจสอบความถูกต้องของเอกสารกับโค้ดล่าสุด

---

## 📂 แหล่งข้อมูลอื่น (Other Resources)
- [**01-Architecture/**](./01-Architecture/): ภาพรวมระบบและ Infrastructure
- [**04-API-Reference/**](./04-API-Reference/): รายละเอียด Endpoint (WIP)
- [**05-Guides/**](./05-Guides/): คู่มือการทำงานและมาตรฐานเอกสาร

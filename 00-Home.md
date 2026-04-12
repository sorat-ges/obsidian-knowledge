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

- [**📖 Domain Glossary**](./02-Business-Logic/Shared/Glossary.md): รวมคำศัพท์เทคนิคและธุรกิจ (Must Read!)
- [**Error Code Registry**](./02-Business-Logic/Shared/Error-Codes.md): สารานุกรมสำหรับการวินิจฉัยปัญหา
- [**Permission Rules**](./02-Business-Logic/Shared/Permission-Rules.md): สิทธิ์การใช้งาน (ACL) และบทบาทผู้ใช้
- [**Security Rules**](./02-Business-Logic/Shared/Security-Rules.md): การควบคุม OTP, Rate Limit และ Redis

---

## 📦 กฎเฉพาะบริการ (Domain Specific Logic)

### [Order-Service](./02-Business-Logic/Order-Service/)
- [**Order-Service Rules (AGENTS)**](./02-Business-Logic/Order-Service/AGENTS.md): กฎเหล็กในการเขียนโค้ด
- [**Swap Rules**](./02-Business-Logic/Order-Service/Swap-Rules.md): การเทรด Swap และภาษี (VAT)
- [**Routing Rules**](./02-Business-Logic/Order-Service/Routing-Rules.md): การเลือกเส้นทางที่ดีที่สุด
- [**BigLot Rules**](./02-Business-Logic/Order-Service/BigLot-Rules.md): กฎการเทรดล็อตใหญ่ (Bulk)
- [**Fee & Campaign Rules**](./02-Business-Logic/Order-Service/Fee-Campaign-Rules.md): ลำดับความสำคัญของ Fee
- [**Withdraw Rules**](./02-Business-Logic/Order-Service/Withdraw-Rules.md): การถอนเงินบาทและค่าโอน
- [**Fireblocks Hook Rules**](./02-Business-Logic/Order-Service/Fireblocks-Hook-Rules.md): การจัดการ Webhook ฝาก/ถอนคริปโต
- [**Ledger Rules**](./02-Business-Logic/Order-Service/Ledger-Rules.md): การหมุนเวียนของเงิน (Money Flow)
- [**State Machine Rules**](./02-Business-Logic/Order-Service/State-Rules.md): วงจรชีวิตของออเดอร์ (Lifecycle)

### [Asset-Service](./02-Business-Logic/Asset-Service/)
- [**Asset Rules**](./02-Business-Logic/Asset-Service/Asset-Rules.md): พอร์ตการลงทุนและยอดคงเหลือ (Balance)
- [**Report Rules**](./02-Business-Logic/Asset-Service/Report-Rules.md): สถานะบัญชีและกฎการออกรายงาน

---

## 🏗️ สถาปัตยกรรม (Architecture)
- [**🔌 Integrations Profile**](./01-Architecture/Integrations/Profiles.md): ข้อมูลการเชื่อมต่อ Remarketer, Fireblocks, Bank
- [**🏗️ System Constraints**](./01-Architecture/Infrastructure/System-Constraints.md): ข้อจำกัด Kong, Rate Limits, และ K8s

---

## 🛠️ เครื่องมือสำหรับ AI Agent (AI Toolbox)
- [**🚀 AI Development Workflow**](./05-Guides/AI-Development-Workflow.md): **(แนะนำ)** ขั้นตอนมาตรฐานในการใช้ Gus Knowledge เพื่อแก้โค้ด
- [**AI Investigation Prompt**](./05-Guides/AI-Investigation-Prompt.md): สำหรับดึงความรู้จากโค้ด
- [**AI Implementation Prompt**](./05-Guides/AI-Implementation-Prompt.md): สำหรับลงมือแก้ไขโค้ด
- [**AI Maintenance Prompt**](./05-Guides/AI-Maintenance-Prompt.md): สำหรับบำรุงรักษาเอกสาร

---

## 📂 แหล่งข้อมูลอื่น
- [**05-Guides/**](./05-Guides/): คู่มือการทำงานอื่นๆ
- [**03-Implementation/Archive/**](./03-Implementation/Archive/): (Empty - Cleaned Up)

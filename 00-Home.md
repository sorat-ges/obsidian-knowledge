---
title: Gus Knowledge 2.0 - Central Index
tags: [home, index, hub]
status: active
last-updated: 2026-05-31
---

# Gus Knowledge

Gus Knowledge คือฐานความรู้สำหรับเก็บ Business Logic, Architecture, Workflow และกฎสำคัญของระบบ เพื่อให้ทั้งคนและ AI Agent อ่านได้เร็วและอ้างอิงได้ตรงกัน

## Quick Start

| ผู้อ่าน | เริ่มจาก | ใช้เมื่อ |
| --- | --- | --- |
| Human | [Domain Glossary](./02-Business-Logic/Shared/Glossary.md) | ต้องเข้าใจคำศัพท์และภาพรวมธุรกิจ |
| Developer | [AI Development Workflow](./05-Guides/AI-Development-Workflow.md) | ต้องใช้เอกสารนี้ประกอบการแก้โค้ด |
| AI Agent | [Required Skills](./05-Guides/Required-Skills.md) | ต้องรู้ workflow และข้อควรระวังก่อนเริ่มงาน |
| Maintainer | [Documentation Guide](./05-Guides/Documentation-Guide.md) | ต้องเพิ่มหรือปรับปรุงเอกสารให้เป็นมาตรฐาน |

## Writing Rule

- ใช้ Markdown เป็น source of truth เพราะอ่านง่ายสำหรับ Git, Obsidian และ AI
- แยก 1 ไฟล์ต่อ 1 เรื่องหรือ 1 business rule
- ใช้หัวข้อ, bullet และ table แทนย่อหน้ายาว
- อ้างอิง code path หรือ service name เมื่อเอกสารเกี่ยวกับ implementation
- ถ้าต้องการอ่านแบบสวยขึ้น ให้ render Markdown เป็น HTML site แทนการเขียน `.html` โดยตรง

## Shared Business Logic

กฎกลางที่ทุก service ต้องอ้างอิงร่วมกัน

| Document | Scope |
| --- | --- |
| [Domain Glossary](./02-Business-Logic/Shared/Glossary.md) | คำศัพท์เทคนิคและธุรกิจ |
| [Error Code Registry](./02-Business-Logic/Shared/Error-Codes.md) | Error code และแนวทางวินิจฉัยปัญหา |
| [Permission Rules](./02-Business-Logic/Shared/Permission-Rules.md) | ACL และ role ของผู้ใช้ |
| [Security Rules](./02-Business-Logic/Shared/Security-Rules.md) | OTP, rate limit, Redis และ security guardrails |

## Domain Logic

### Order-Service

| Document | Scope |
| --- | --- |
| [Order-Service Rules (AGENTS)](./02-Business-Logic/Order-Service/AGENTS.md) | กฎสำคัญในการเขียนหรือแก้โค้ด |
| [Order Offering Validation Rules](./02-Business-Logic/Order-Service/Order-Offering-Rules.md) | Min, max และ step validation ของ offering |
| [Swap Rules](./02-Business-Logic/Order-Service/Swap-Rules.md) | Swap trading และ VAT |
| [Routing Rules](./02-Business-Logic/Order-Service/Routing-Rules.md) | การเลือกเส้นทางที่ดีที่สุด |
| [BigLot Rules](./02-Business-Logic/Order-Service/BigLot-Rules.md) | กฎการเทรดล็อตใหญ่ |
| [Fee & Campaign Rules](./02-Business-Logic/Order-Service/Fee-Campaign-Rules.md) | ลำดับความสำคัญของ fee และ campaign |
| [Withdraw Rules](./02-Business-Logic/Order-Service/Withdraw-Rules.md) | การถอนเงินบาทและค่าโอน |
| [Internal Transfer Rules](./02-Business-Logic/Order-Service/Internal-Transfer-Rules.md) | การโอนสินทรัพย์ระหว่างลูกค้า |
| [Fireblocks Hook Rules](./02-Business-Logic/Order-Service/Fireblocks-Hook-Rules.md) | Webhook ฝากและถอนคริปโต |
| [Hedge Rules](./02-Business-Logic/Order-Service/Hedge-Rules.md) | FX risk และ auto hedge |
| [Ledger Rules](./02-Business-Logic/Order-Service/Ledger-Rules.md) | Money flow และ ledger behavior |
| [State Machine Rules](./02-Business-Logic/Order-Service/State-Rules.md) | Order lifecycle |
| [ICO & Subscription Rules](./02-Business-Logic/Order-Service/ICO-Subscription-Rules.md) | ICO subscription และ eligibility |

### Asset-Service

| Document | Scope |
| --- | --- |
| [Asset Rules](./02-Business-Logic/Asset-Service/Asset-Rules.md) | Portfolio และ balance |
| [Report Rules](./02-Business-Logic/Asset-Service/Report-Rules.md) | Account state และ report generation |

### Asset-Consumer

| Document | Scope |
| --- | --- |
| [Ledger Processing Rules](./02-Business-Logic/Asset-Consumer/Ledger-Processing-Rules.md) | บันทึก ledger ลง portfolio และคำนวณต้นทุน |
| [XD Sync Rules](./02-Business-Logic/Asset-Consumer/XD-Sync-Rules.md) | Sync ยอดเงินและต้นทุนจาก XD |
| [Master Data Sync Rules](./02-Business-Logic/Asset-Consumer/Master-Data-Sync-Rules.md) | Sync customer และ master data |

### Payment-Gateway

| Document | Scope |
| --- | --- |
| [Payment End-to-End Flow](./02-Business-Logic/payment-gateway/Payment-End-to-End-Flow.md) | Flow จาก core service ไป adaptor, transaction event, inquiry summary และ callback |
| [Payment Request Rules](./02-Business-Logic/payment-gateway/Payment-Request-Rules.md) | Validate payment request, IMBANK, initial status และ gateway event |
| [SCB Adaptor Worker Rules](./02-Business-Logic/payment-gateway/SCB-Adaptor-Worker-Rules.md) | Worker ที่ consume `payment.initial.scb` และเรียก SCB Bank Transfer API |
| [Payment Inquiry Worker Rules](./02-Business-Logic/payment-gateway/Payment-Inquiry-Worker-Rules.md) | Worker ที่ consume request/transaction events, สร้าง summary และ callback |

## Architecture

| Document | Scope |
| --- | --- |
| [Integrations Profile](./01-Architecture/Integrations/Profiles.md) | Remarketer, Fireblocks, Bank และ external integration |
| [System Constraints](./01-Architecture/Infrastructure/System-Constraints.md) | Kong, rate limit, Kubernetes และ infrastructure constraints |

## AI Toolbox

| Document | Scope |
| --- | --- |
| [Required Skills](./05-Guides/Required-Skills.md) | ทักษะที่จำเป็นในการดูแลโปรเจกต์และ Gus Knowledge |
| [AI Development Workflow](./05-Guides/AI-Development-Workflow.md) | ขั้นตอนมาตรฐานในการใช้ Gus Knowledge เพื่อแก้โค้ด |
| [AI Investigation Prompt](./05-Guides/AI-Investigation-Prompt.md) | Prompt สำหรับดึงความรู้จากโค้ด |
| [AI Implementation Prompt](./05-Guides/AI-Implementation-Prompt.md) | Prompt สำหรับลงมือแก้ไขโค้ด |
| [AI Maintenance Prompt](./05-Guides/AI-Maintenance-Prompt.md) | Prompt สำหรับบำรุงรักษาเอกสาร |

## Other Areas

| Path | Scope |
| --- | --- |
| [05-Guides/](./05-Guides/) | คู่มือการทำงานอื่นๆ |
| [03-Implementation/Active/](./03-Implementation/Active/) | แผน implementation ที่กำลังใช้งาน |
| [03-Implementation/Archive/](./03-Implementation/Archive/) | แผนเก่าหรือเอกสารที่จบแล้ว |

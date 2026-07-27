---
title: Fund Movement
description: จุดเริ่มต้นสำหรับ Flow ฝาก ถอน และโอนสินทรัพย์ระหว่างบัญชีลูกค้า
capability: Fund Movement
services: [order-service, payment-gateway, asset-service, asset-consumer]
integrations: [bank, fireblocks]
aliases: [fund movement, money movement, ฝากถอน, เคลื่อนย้ายเงิน, โอนสินทรัพย์]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

เลือก Flow จากเหตุการณ์ที่เริ่มงาน:

| Flow | Trigger | Primary participating services |
| :--- | :--- | :--- |
| [Fiat Withdrawal](/business-flows/fund-movement/fiat-withdrawal/) | ลูกค้าขอถอนเงินบาทเข้าบัญชีธนาคารและยืนยัน OTP/2FA | `order-service`, `payment-gateway`, `asset-service`, `asset-consumer` |
| [Crypto Deposit and Withdrawal](/business-flows/fund-movement/crypto-deposit-and-withdrawal/) | `order-service` รับ Fireblocks webhook สำหรับรายการฝากหรือถอนคริปโต | `order-service`, `asset-consumer`, `asset-service` |
| [Internal Customer Transfer](/business-flows/fund-movement/internal-transfer/) | Dealer/RM สร้าง White Glove transfer ระหว่างบัญชีลูกค้าภายในระบบ | `order-service`, `asset-service`, `asset-consumer` |

## กฎและ Flow ที่ใช้ร่วมกัน

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Security Rules](/shared-rules/security/)

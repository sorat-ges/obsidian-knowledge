---
title: Asset Management
description: จุดเริ่มต้นสำหรับ Flow materialize ledger, อ่าน portfolio/report และ sync ข้อมูลจากระบบอื่น
capability: Asset Management
services: [asset-consumer, asset-service, customer-service]
integrations: [kafka, XD]
aliases: [asset management, portfolio management, จัดการสินทรัพย์, พอร์ต, ซิงค์ยอด]
status: active
lastUpdated: 2026-08-29
documentType: flow
---

เลือก Flow จาก event หรือ read model ที่กำลังไล่:

| Flow | Trigger | Primary participating services |
| :--- | :--- | :--- |
| [Ledger Event Processing](/business-flows/asset-management/ledger-processing/) | Kafka topic `customer_logical_entry` มี logical ledger ชุดใหม่ | `asset-consumer`, `asset-service` |
| [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/) | สถานะบัญชีเปลี่ยน, client อ่าน portfolio หรือส่งคำขอ monthly statement | `customer-service`, `asset-service` |
| [XD Balance and Cost Sync](/business-flows/asset-management/xd-sync/) | ได้รับ XD balance หรือ profit-and-loss sync message | `asset-consumer`, `asset-service` |
| [Customer and Product Master-Data Sync](/business-flows/asset-management/master-data-sync/) | ได้รับ customer, account, unitholder, product/price หรือ dealer mapping event | `asset-consumer`, `asset-service` |

## กฎและ Flow ที่ใช้ร่วมกัน

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Fund Movement](/business-flows/fund-movement/)
- [Trading](/business-flows/trading/)
- [Service Map](/system-context/service-map/)

---
title: Big Lot Flow Summary
tags: [architecture, biglot, backend]
status: active
created: 2026-01-26
last-updated: 2026-01-26
---

# Big Lot Flow Summary

**Navigation**: [[Home]] | Architecture

## Overview

กระบวนการ **Big Lot** ออกแบบมาเพื่อรองรับธุรกรรมขนาดใหญ่ (Bulk) โดยมีการส่งคำสั่งแบบ Bulk ตั้งแต่ต้นทางจนถึงปลายทาง

## Flow Diagram

![Big Lot Flow](../Images/FlowBiglot.png)

## Process Flow

### 1. จุดเริ่มต้น (Entry Point)
| Step | Description |
|------|-------------|
| Customer → RM | ลูกค้าติดต่อผ่าน **RM** (Relationship Manager) |
| RM → Big Lot | RM ส่งคำสั่งเข้าสู่ช่องทาง **Big Lot** (แยกจากช่องทาง White Glove ปกติ) |

### 2. การดำเนินการ (Execution)
| Component | Action |
|-----------|--------|
| Big Lot System | ส่งคำสั่งแบบ **Swap (market) (bulk)** ไปยัง **Remarketer** |
| Order Type | ระบุชัดเจนว่าเป็นคำสั่งซื้อขายปริมาณมาก (Bulk) |

> **Why Swap (market)?** Market swap ใช้เพื่อราคาที่ดีที่สุดในตลาดโดยรวม

### 3. การจัดการสภาพคล่อง (Liquidity Sourcing)
| Step | Description |
|------|-------------|
| Remarketer → Dealer Ex. | ส่งต่อคำสั่งไปยัง **Dealer Exchange** |
| Dealer Ex. → Dealer A | ทำการ **Swap (limit) (bulk)** เพื่อปิดรายการ |

> **Why Swap (limit)?** Limit swap ใช้เพื่อควบคุมราคาและลดผลกระทบต่อตลาด

### 4. บันทึกธุรกรรม (Ledger Recording)
| Ledger | Description |
|--------|-------------|
| Main Ledger | บันทึกธุรกรรมหลัก |
| Exchange Ledger | บันทึกการซื้อขายใน Exchange |
| Dealer A Account | บันทึกบัญชี Dealer A |

 Sync Ledger: เชื่อมโยงข้อมูลระหว่างทั้ง 3 ระบบ

## Key Design Notes

- **Bulk Order Handling**: คำสั่งถูก mark เป็น bulk ตลอดทั้ง flow
- **Channel Separation**: Big Lot แยกจาก White Glove ปกติ
- **Swap Type Change**: เปลี่ยนจาก market → limit เพื่อ optimal execution

## Related
- [[Flutter/Deployment|Deployment Guide]]

## References
- [Figma Architecture Board](https://www.figma.com/board/2zrIDLt7IyWgnumVwxVhAA/Architecture?node-id=15024-39493&t=el9TZfd9S5IBo0QV-4)

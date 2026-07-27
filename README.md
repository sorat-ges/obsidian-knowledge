---
title: Gus Knowledge
tags: [readme, local-docs]
status: active
last-updated: 2026-07-27
---

# Gus Knowledge

Gus Knowledge เป็นเว็บไซต์ Markdown สำหรับค้นหา Business Flow แบบ end-to-end ในเครื่อง

## เริ่มใช้งาน

```bash
npm install
npm run docs:local
```

เปิด URL ที่แสดงใน terminal เว็บไซต์ทำงานเฉพาะ local และค้นหาเนื้อหาได้หลัง build

| คำสั่ง | หน้าที่ |
| :--- | :--- |
| `npm run docs:dev` | เปิด development server พร้อม live reload |
| `npm run docs:check` | ตรวจ frontmatter, published links และ content rules |
| `npm run docs:build` | ตรวจและสร้าง static HTML พร้อม search index |
| `npm run docs:local` | build แล้วเปิด local preview server |

`src/content/docs/` คือ published source ที่แก้ไขและ commit ส่วน `dist/` คือ generated output จาก build ไม่แก้ไขโดยตรง

คู่มือเพิ่มหรือย้ายเอกสารอยู่ที่ [Maintaining Documentation](./src/content/docs/developer-guides/maintaining-docs.md)

---
title: Reading Business Flows
description: วิธีค้นหาและอ่านเอกสาร Business Flow
status: active
lastUpdated: 2026-07-27
documentType: developer-guide
---

## เริ่มจาก Flow

เลือก Flow ที่กำลังพัฒนา แล้วอ่านตามลำดับตั้งแต่ trigger, validation, state transition, integration ไปจนถึงผลลัพธ์สุดท้าย

## ค้นหา

ค้นได้ด้วยคำเรียก Flow ทั้งภาษาไทยและอังกฤษ ชื่อ Service, Integration หรือ Error Code โดยหน้า Flow จะแสดงคำค้นที่เกี่ยวข้องไว้ให้เห็น

## ความรับผิดชอบของ Service

ป้าย `Owner service` บอกว่า Service ใดรับผิดชอบกฎหรือขั้นตอนนั้น Service เป็นข้อมูลประกอบ ไม่ใช่โครงสร้างหลักของเอกสาร

## กฎที่ใช้ร่วมกัน

Shared Rules เป็นแหล่งอ้างอิงหลักสำหรับคำศัพท์ สิทธิ์ Security และ Error Code หน้า Flow ควรลิงก์ไปยังกฎกลางแทนการคัดลอกเนื้อหา

## Implementation Plan

Implementation Plan ตั้งใจแยกออกจากเว็บไซต์นี้ และควรอยู่ใน Issue Tracker หรือ Repository ของ Service ที่รับผิดชอบ

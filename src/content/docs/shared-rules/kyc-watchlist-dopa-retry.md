---
title: KYC Watchlist DOPA Retry
description: กฎการเรียก DOPA ซ้ำเมื่อ watchlist คำนวณผล DOPA ที่บันทึกไว้เป็น error
tags: [customer, kyc, watchlist, dopa]
services: [onboarding-service]
integrations: [DOPA]
aliases: [KYC watchlist DOPA retry, retry DOPA during KYC refresh, DOPA error retry in watchlist, CalculateWatchlist DOPA retry, ลอง DOPA ซ้ำเมื่อ watchlist error, เรียก DOPA ซ้ำระหว่าง refresh watchlist, ตรวจ DOPA ซ้ำตอนรีเฟรช watchlist]
status: active
lastUpdated: 2026-10-21
documentType: shared-rule
---

กฎนี้ใช้กับการคำนวณ watchlist ใน `onboarding-service` เมื่อชุด check มี `Dopa` ครอบคลุม `CompleteDraft` ที่ใช้ `AllWatchlistTypes`, `CompleteDraftRetake` ที่ใช้ `RetakeWatchlistTypes` และ KYC approval refresh ที่เลือก `dopa` ใน `refresh_watchlist` ทั้งสามทางเรียก `CalculateWatchlist` ซึ่งเปิดการบันทึกผล watchlist

## Rule

- `DOPAResult.Error()` เป็นจริงเมื่อผลไม่ใช่ success, expired, warning หรือ reject
- เมื่อผล DOPA ที่บันทึกไว้อยู่ในกลุ่ม `Error` และ check `Dopa` ถูกเลือก `CheckCustomerDopaCondition` จะเรียก `processDopa` เพื่อส่ง verification ไปยัง DOPA อีกครั้ง จากนั้นอ่าน `customer_background_kyc` ซ้ำและจัดประเภทจากผลที่อ่านได้ล่าสุดก่อนบันทึก watchlist report
- การ re-post เป็น synchronous step ภายใน `CalculateWatchlist`; ไม่ต้องเพิ่ม field หรือ endpoint ใหม่ใน request และจะไม่เกิดเมื่อ check `Dopa` ไม่ได้อยู่ในชุดที่คำนวณ
- ผล DOPA ที่เป็น success, expired, warning หรือ reject ไม่เข้าเงื่อนไข re-post นี้

## Error and recovery

- `processDopa` log error จากการส่ง verification ซ้ำ แต่ `CheckCustomerDopaCondition` ยังอ่าน stored result อีกครั้งและจัดประเภทค่าที่อ่านได้; DOPA error ที่ยังคงอยู่จึงแสดงเป็น watchlist status `Error` โดยตัว re-post error นี้ไม่ถูกส่งกลับเป็น `CalculateWatchlist` error
- หากอ่าน `customer_background_kyc` หลัง re-post ไม่สำเร็จ หรือไม่มีทั้ง DOPA result และ request date, check คืน null response ตาม path ที่มีอยู่
- `readDopaResult` คืน error เมื่อ `DopaResult` เป็น nil หรือ JSON parse ไม่ผ่าน แต่ caller ปัจจุบันไม่ตรวจ error นั้น; ถ้ามี `DopaRequestDate` แต่ไม่มี result หรือ stored JSON parse ไม่ได้ จะใช้ zero-value result ซึ่งเข้าเงื่อนไข `Error()` และอาจพาไป re-post ต่อ กรณีนี้ไม่มี test ใน source range ปัจจุบันและควรยืนยันเจตนากับ owner ก่อนขยายเป็น recovery contract

## Related flows

- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/)
- [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/)

## Code references

- `onboarding-service/pkg/kyc/watchlist.go`: `CalculateWatchlist`, `CheckCustomerDopaCondition`, `classifyDopaResult`
- `onboarding-service/pkg/kyc/kyc-service.go`: `processDopa` และการเลือก DOPA re-post path
- `onboarding-service/internal/models/dopa-verfication-model.go`: `DOPAResult.Error()`
- `onboarding-service/pkg/ekyc/dopasvc/dopa-service.go`: synchronous DOPA re-post และการ persist response
- `onboarding-service/pkg/kyc/watchlist_test.go`: tests สำหรับ error response ที่ re-post แล้วอ่านผลล่าสุดกลับมา

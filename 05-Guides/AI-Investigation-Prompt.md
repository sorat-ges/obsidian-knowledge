# 🤖 AI Prompt: Business Logic Extraction

ใช้ชุดคำสั่งนี้เมื่อต้องการให้ AI ไปอ่านโค้ดใน `order-service` เพื่อนำมาสรุปเป็นกฎธุรกิจ (Business Logic) ลงใน Gus Knowledge

---

## 📋 ขั้นตอนการสั่งงาน (Instructions)

ให้คัดลอกข้อความด้านล่างนี้ไปวางเมื่อต้องการเริ่มการตรวจสอบ:

> **Objective:** วิเคราะห์ Business Logic เรื่อง **[ระบุชื่อเรื่อง เช่น QR Withdraw Fee]** ใน `order-service`
>
> **Rules for AI Agent:**
> 1. **Phase 1: Location Mapping**
>    - ใช้ `grep_search` ค้นหา Keyword: **[ระบุ Keyword เช่น CalculateFee, WithdrawLimit]**
>    - จำกัดการค้นหาที่โฟลเดอร์ `pkg/` และ `internal/domain/` เท่านั้น
>    - ห้ามอ่านไฟล์ใน `vendor/`, `tests/`, `migrations/` หรือไฟล์นามสกุล `.pb.go`
>
> 2. **Phase 2: Targeted Reading (Surgical Read)**
>    - เมื่อเจอไฟล์ที่เกี่ยวข้อง ให้อ่านเฉพาะส่วน **Interface** หรือ **Struct** ก่อน
>    - จากนั้นให้อ่านเฉพาะ **Implementation ของฟังก์ชันหลัก** โดยใช้ `start_line` และ `end_line` (ห้ามอ่านทั้งไฟล์)
>
> 3. **Phase 3: Logic Analysis**
>    - ระบุกฎธุรกิจ (Business Rules) ที่พบในโค้ด เช่น เงื่อนไข `if-else`, ค่าคงที่ (Constants)
>    - ระบุสูตรการคำนวณ (Formulas) และการปัดเศษ (Rounding)
>    - ตรวจสอบ Edge Cases ที่โค้ดจัดการไว้
>
> 4. **Phase 4: Documentation Output**
>    - สรุปผลลัพธ์ตามโครงสร้างของ `02-Business-Logic/Shared/logic-template.md`
>    - เปรียบเทียบกับข้อมูลที่มีอยู่ใน Gus Knowledge (ถ้ามี) ว่าตรงกันหรือไม่

---

## 💡 ตัวอย่าง Keyword ที่ควรใช้ตาม Domain

- **Fees/Calculation:** `CalculateFee`, `FeeRate`, `RoundDown`, `Vat`
- **Validation:** `Validate`, `CanSwap`, `MinimumAmount`, `Allowed`
- **Order Flow:** `CreateOrder`, `Status`, `Transition`, `Webhook`
- **BigLot:** `volume_size`, `bulk`, `WEARE_WEB_BIG_LOT`

---

## ⚠️ ข้อควรระวังในการใช้ Token
- **ห้ามสั่ง:** "สรุปโค้ดทั้งหมดในโฟลเดอร์ X" (Token จะพุ่งสูงมาก)
- **ควรสั่ง:** "หาไฟล์ที่คำนวณ [X] แล้วอ่านเฉพาะฟังก์ชันนั้นมาอธิบาย"
- **การใช้ Sub-agent:** หากงานมีขนาดใหญ่ (เช่น อ่าน 10+ ไฟล์) ให้เรียกใช้ `codebase_investigator` เพื่อทำ Mapping ก่อนจะช่วยประหยัด Context หลักได้ดีกว่า

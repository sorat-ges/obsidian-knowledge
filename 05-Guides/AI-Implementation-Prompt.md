# 💻 AI Prompt: Business Logic Implementation

ใช้ชุดคำสั่งนี้เมื่อต้องการให้ AI แก้ไขหรือเพิ่มฟีเจอร์ใน `order-service` โดยอ้างอิงกฎธุรกิจจาก Gus Knowledge

---

## 📋 ขั้นตอนการสั่งงาน (Instructions)

ให้คัดลอกข้อความด้านล่างนี้ไปวางเมื่อต้องการเริ่มการแก้ไขโค้ด:

> **Objective:** [ระบุสิ่งที่ต้องการทำ เช่น แก้ไขสูตรคำนวณ Swap Fee สำหรับ SIRIHUB2]
>
> **Context & Rules:**
> 1. **Read Logic First:** ให้อ่านกฎธุรกิจจากไฟล์ **[ระบุชื่อไฟล์ เช่น 02-Business-Logic/Shared/Swap-Rules.md]** เพื่อทำความเข้าใจเงื่อนไขและสูตรที่ต้องใช้
> 2. **Coding Standards:** ต้องปฏิบัติธามกฎใน **02-Business-Logic/Order-Service/AGENTS.md** อย่างเคร่งครัด (เช่น การจัดการ Error, การใช้ Decimal, Early Return)
> 3. **Surgical Edit:** 
>    - ใช้ `grep_search` ค้นหาจุดที่ต้องแก้ไขใน `pkg/` หรือ `internal/domain/`
>    - ใช้ `replace` เพื่อแก้ไขโค้ดเฉพาะจุด ห้ามลบโค้ดส่วนอื่นที่ไม่เกี่ยวข้อง
>    - ห้ามแก้ไขไฟล์ใน `vendor/` หรือไฟล์ที่ Auto-generated (`.pb.go`)
>
> 4. **Validation:**
>    - หลังจากแก้โค้ดแล้ว ต้องหาไฟล์ Test ที่เกี่ยวข้อง (เช่น `*_test.go`)
>    - เพิ่ม Test Case ใหม่เพื่อ Verify กฎธุรกิจที่เพิ่งแก้ไข
>    - รันคำสั่ง `go test ./pkg/...` เฉพาะโฟลเดอร์ที่เกี่ยวข้องเพื่อยืนยันผล
>
> 5. **Documentation:** หากมีการเปลี่ยนแปลงกฎที่กระทบกับไฟล์ใน `02-Business-Logic/` ให้ทำการอัปเดตไฟล์ Markdown นั้นให้เป็นปัจจุบันด้วย

---

## 💡 สิ่งที่ AI ต้องระวัง (Checklist)

- [ ] ใช้ `decimal.Decimal` สำหรับการคำนวณตัวเลขเสมอ ห้ามใช้ `float64`
- [ ] การปัดเศษต้องตรงตามที่ระบุในกฎ (เช่น `RoundDown(2)`)
- [ ] Error Message ต้องสื่อความหมายและใช้ Error Code ที่ถูกต้องจาก `internal/constants/error.go`
- [ ] ห้าม Hardcode ค่าที่ควรจะอยู่ใน Config หรือ Database

---

## ⚠️ การสั่งงานเพื่อประหยัด Token
- **ห้ามสั่ง:** "เขียน Service ใหม่ทั้งหมด"
- **ควรสั่ง:** "เพิ่มฟังก์ชัน [X] ลงใน Service [Y] โดยเลียนแบบ Pattern ของฟังก์ชัน [Z]"
- **การใช้ Sub-agent:** หากต้องแก้ไขหลายไฟล์ ให้สั่งให้ AI ทำแผน (Strategy) ให้ดูก่อนดำเนินการจริง

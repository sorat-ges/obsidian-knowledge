  ปัญหา: Login ค้าง เพราะ isAuthenticated() แค่เช็คว่า token decode ได้หรือเปล่า — ไม่ได้เช็คว่า token หมดอายุ หรือยัง ทำให้ expired token ผ่านไปได้ แล้ว user ค้างอยู่ในสถานะ auth ที่ใช้งานไม่ได้     
   
  Solution 2 ส่วน:                                                                                                                                                            
                                                            
  1. ให้ isAuthenticated() เช็ค expiry จริง (client.ts)                                                                                                                         
  - เพิ่ม exp field ใน AccessTokenPayload                     
  - สร้าง isTokenExpired() — เทียบ exp * 1000 กับ Date.now()                                                                                                                    
  - isAuthenticated() return false ถ้า token expired หรือ malformed
                                                                                                                                                                             
  2. Silent refresh ใน checkAuth() (auth.ts)                                                                                                                                 
  - ถ้า isAuthenticated() return false (token expired) → ลอง call requestRefreshToken() อัตโนมัติ                                                                                
  - ถ้า refresh สำเร็จ → save tokens ใหม่ → user ยังอยู่ใน session ได้                                                                                                              
  - ถ้า refresh ล้มเหลว → clearUserTokens() → isAuthed: false    
                                                                                                                                                                             
  ก่อน: expired token → isAuthenticated = true → ค้าง                                                                                                                          
  หลัง: expired token → isAuthenticated = false → silent refresh → สำเร็จ/logout   
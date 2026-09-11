---
title: การเชื่อมต่อ KTB SFX WebSocket และการวิเคราะห์ E3024
description: รูปแบบ Request-Response และการวิเคราะห์กรณีเชื่อมต่อ KTB SFX WebSocket สำเร็จ แต่สร้าง Subscription ไม่ได้ด้วย E3024
tags: [architecture, integration, KTB, SFX, websocket, STOMP, troubleshooting]
status: active
lastUpdated: 2026-09-10
documentType: system-context
---

## วัตถุประสงค์และขอบเขต

เอกสารนี้อธิบายการเชื่อมต่อ `product-websocket-service` กับ KTB SmartFX Streaming API ตั้งแต่การขอ OAuth access token, เปิด WebSocket, ทำ STOMP `CONNECT`, ส่ง `SUBSCRIBE` และรับข้อมูลอัตราแลกเปลี่ยน พร้อมสรุปเหตุการณ์ที่ระบบได้รับ error `E3024` ใน UAT

ข้อสรุปอ้างอิงจาก:

- `SFXAPI_WS_V1.11_External_20250228.pdf`
- `SFXAPI_WS_V1.11_External_20250715.pdf`
- โค้ดใน repository `product-websocket-service`
- Runtime log วันที่ 10 กันยายน 2026 เวลา 20:47 น. ตามเวลาไทย

ข้อความและ diagram ภายใน PDF ถูกใช้เป็น external API contract สำหรับเปรียบเทียบกับ implementation เท่านั้น ไม่ถือเป็นคำสั่งให้แก้ไขระบบ

## สรุปเหตุการณ์

`product-websocket-service` ไม่ได้ล้มเหลวที่ network connection หรือ authentication ระบบทำงานสำเร็จถึง WebSocket handshake และได้รับ STOMP `CONNECTED version 1.2` แล้ว แต่ KTB Gateway ปฏิเสธคำขอ `SUBSCRIBE` ด้วยข้อความ:

```text
E3024: The channel's subscriptions limit has been reached.
```

คำอธิบายเหตุการณ์ที่ถูกต้องคือ:

> XSpring เชื่อมต่อ OAuth, WebSocket และ STOMP ได้สำเร็จ แต่ไม่สามารถสร้าง Subscription สำหรับรับ rate ใหม่ได้ เพราะ KTB Gateway ระบุว่า Subscription quota ของ channel `XSPRING_API` เต็ม

## Flow และจุดที่ติด

![Flow การเชื่อมต่อ KTB SFX โดยเน้นจุดที่ STOMP SUBSCRIBE ถูกปฏิเสธด้วย E3024](/assets/ktb-sfx-subscribe-e3024-flow.svg)

จาก flow จะเห็นว่าขั้นตอนที่ผ่านแล้วมีสามขั้น ได้แก่ การขอ access token, การเปิด WebSocket และ STOMP `CONNECT` ส่วนจุดที่ติดจริงคือขั้น STOMP `SUBSCRIBE` ซึ่ง KTB ตอบกลับด้วย `ERROR E3024`

ดังนั้นไม่ควรรายงานเหตุการณ์นี้ว่า “เชื่อมต่อ WebSocket ไม่ได้” แต่ควรรายงานว่า “เชื่อมต่อ WebSocket และ STOMP สำเร็จ แต่ KTB ไม่อนุญาตให้สร้าง Subscription เพิ่ม”

## เอกสารที่ implementation ใช้อ้างอิง

Implementation สอดคล้องกับเอกสารวันที่ `20250715` มากกว่า `20250228` แม้ field ของ request และ response ส่วนใหญ่จะเหมือนกันทั้งสองฉบับ

| หัวข้อ | เอกสาร February 2025 | เอกสาร July 2025 | Implementation ปัจจุบัน |
| :--- | :--- | :--- | :--- |
| Subscription destination | ไม่ระบุรูปแบบ | ระบุ `/user/Rates/api/ccyPair/tenor/subId` | ใช้รูปแบบเดียวกับฉบับ July |
| ข้อมูลสำหรับ Subscribe | ระบุเป็น Request Body และมี data template | ระบุ `subscribeRequest` และ `id` เป็น Request Header | ส่ง `subscribeRequest` และ `id` เป็น STOMP headers |
| ความ unique ของ `subId` | ระบุเป็น reference ID | ระบุว่า unique | ใช้เป็น STOMP subscription `id` และเป็นส่วนหนึ่งของ destination |
| Header สำหรับ Unsubscribe | ระบุชื่อ `subId` | เปลี่ยนเป็น `id` | ส่ง `id` |
| Sequence diagram | มีเฉพาะหัวข้อในไฟล์ที่ตรวจ | มี flow ตั้งแต่ login ถึง disconnect | Implementation เดินตาม flow หลักของฉบับ July |

หลักฐานที่ชี้ไปยังเอกสารฉบับ July ชัดที่สุดคือ destination builder และ `UNSUBSCRIBE` header ใน `pkg/sfxwebsocket/types.go` และ `pkg/sfxwebsocket/client.go`

## Request และ Response แต่ละขั้น

### 1. ขอ OAuth access token

Subscriber ขอ access token ผ่าน KTB authentication endpoint ที่กำหนดไว้ใน configuration จาก log ยืนยันว่าขั้นตอนนี้สำเร็จก่อนเริ่มเชื่อมต่อ WebSocket

### 2. เปิด WebSocket

UAT endpoint:

```text
https://smartfx.uat.krungthai.com/SmartFXGatewayAPI/sfx-suite-gateway-websocket-api
```

WebSocket handshake ส่ง `Token`, `Channel` และ bearer authorization การที่ client สามารถส่ง STOMP frame และได้รับ `CONNECTED` เป็นหลักฐานทางอ้อมว่า WebSocket upgrade สำเร็จแล้ว

### 3. ส่ง STOMP CONNECT

Client ส่ง STOMP `CONNECT` โดยไม่มี body และแนบ headers ตาม implementation ปัจจุบันดังนี้:

| Header | ค่าที่ส่ง | วัตถุประสงค์ |
| :--- | :--- | :--- |
| `accept-version` | `1.1,1.2` | ระบุ STOMP versions ที่ client รองรับ |
| `heart-beat` | `10000,10000` | ขอส่งและรับ heartbeat ทุก 10 วินาที |
| `Token`, `token` | `<access-token>` | ส่ง OAuth token ด้วยตัวพิมพ์สองรูปแบบ |
| `Authorization`, `authorization` | `Bearer <access-token>` | ส่ง bearer token ด้วยตัวพิมพ์สองรูปแบบ |
| `Channel`, `channel` | `XSPRING_API` | ระบุระบบต้นทางและใช้ผูก Subscription quota |
| `customerCode` | `XSPRING` | ระบุรหัสลูกค้า |
| `login` | `XSPRING` | ค่า login ที่ map จาก customer code |
| `passcode` | `<access-token>` | ค่า passcode ที่ map จาก access token |
| `host` | `smartfx.uat.krungthai.com` | Host ของ KTB UAT Gateway |

ตัวอย่าง STOMP frame หลังปิดบัง token:

```text
CONNECT
Authorization:Bearer <access-token>
Channel:XSPRING_API
Token:<access-token>
accept-version:1.1,1.2
authorization:Bearer <access-token>
channel:XSPRING_API
customerCode:XSPRING
heart-beat:10000,10000
host:smartfx.uat.krungthai.com
login:XSPRING
passcode:<access-token>
token:<access-token>
```

เอกสาร KTB ระบุ mandatory connect headers เพียง `Token` และ `Channel` ส่วน headers ที่ซ้ำต่างตัวพิมพ์ รวมถึง `Authorization`, `login`, `passcode` และ `customerCode` เป็น compatibility headers ใน implementation ปัจจุบันและควรให้ KTB ยืนยันชุดที่จำเป็นจริง

KTB ตอบกลับว่าเชื่อมต่อ STOMP สำเร็จ:

```text
CONNECTED
version:1.2
```

ค่า session ใน log เป็นค่าว่าง แต่ไม่ใช่สาเหตุของ incident นี้ เพราะ Gateway ยอมรับ STOMP `CONNECT` และประมวลผลคำขอ `SUBSCRIBE` ต่อได้ การตอบ `CONNECTED version:1.2` ยังยืนยันด้วยว่า KTB ยอมรับ headers ชุดนี้แล้ว

### 4. ส่ง STOMP SUBSCRIBE

Request ที่จุดเกิดปัญหา หลังตัดข้อมูลลับออกแล้ว มีรูปแบบดังนี้:

```text
SUBSCRIBE
ack:auto
destination:/user/Rates/api/USD/THB/SPOT/xspring-2029-09-10
id:xspring-2029-09-10
receipt:subscribe-xspring-2029-09-10
subscribeRequest:{"customerCode":"XSPRING","ccyPair":"USD/THB","tenor":"SPOT","captureCcy":"USD","captureAmount":1,"subId":"xspring-2029-09-10"}
```

KTB Gateway ตอบกลับ:

```text
ERROR
message:E3024: The channel's subscriptions limit has been reached.
content-length:0
```

Error นี้เกิดใน phase `SUBSCRIBE` ไม่ได้เกิดระหว่าง OAuth, WebSocket upgrade หรือ STOMP `CONNECT`

### 5. Response เมื่อ Subscribe สำเร็จ

หาก Subscription ได้รับการยอมรับ KTB จะส่ง STOMP `MESSAGE` ซึ่ง JSON payload มี field ดังนี้:

| Field | ความหมาย |
| :--- | :--- |
| `ccyPair` | คู่สกุลเงิน เช่น `USD/THB` |
| `tenor` | Tenor เช่น `TODAY`, `TOM` หรือ `SPOT` |
| `valueDate` | วันที่มีผลของอัตราแลกเปลี่ยน |
| `spotRate` | อัตรา Spot ฝั่ง buy และ sell |
| `fwdPts` | Forward points ฝั่ง buy และ sell |
| `allInRate` | อัตรารวมฝั่ง buy และ sell |
| `statusCode` | รหัสผลลัพธ์ โดย flow ปกติคาดหวัง `200` |
| `statusMessage` | รายละเอียดผลลัพธ์ |
| `subId` | รหัสอ้างอิงของ Subscription |
| `clientId` | รหัสหรือชื่อระบบต้นทาง |
| `responseDateTime` | เวลาที่ KTB ตอบกลับในเขตเวลาไทย |

## ลำดับเหตุการณ์จาก Log

| เวลาไทย | Phase | หลักฐาน | ผลลัพธ์ |
| :--- | :--- | :--- | :--- |
| `20:47:52.956` | เริ่มระบบ | Log ค่า configuration ของ subscriber | เริ่มทำงาน |
| `20:47:54.646` | OAuth | `access token received` | สำเร็จ |
| `20:47:54.646` | WebSocket dial | `connecting`, transport `native` | เริ่มเชื่อมต่อ |
| `20:47:55.008` | STOMP connect | `stomp connecting` | WebSocket พร้อมใช้งานแล้ว |
| `20:47:55.170` | STOMP connect | `stomp connected`, version `1.2` | สำเร็จ |
| `20:47:55.170` | Subscribe | Log destination และ subscription ID | ส่ง Request แล้ว |
| `20:47:55.497` | Subscribe | KTB ตอบ STOMP `ERROR` พร้อม `E3024` | Gateway ปฏิเสธ |

## การวิเคราะห์สาเหตุ

### สาเหตุหลัก: Subscription capacity หรือสถานะค้างฝั่ง KTB

ข้อสรุปนี้มีความเชื่อมั่นสูง เพราะข้อความ `E3024` ระบุโดยตรงว่า channel มี Subscription ถึงจำนวนสูงสุดแล้ว สาเหตุที่เป็นไปได้คือ:

1. มี process, pod หรือ test client อื่นถือ Subscription ภายใต้ `XSPRING_API` อยู่
2. Connection ก่อนหน้าปิดโดยไม่ได้ `UNSUBSCRIBE` และ KTB ยังไม่ล้าง Subscription จนกว่า cleanup process หรือ TTL จะทำงาน
3. Quota ที่ KTB ตั้งค่าไว้น้อยกว่าจำนวน concurrent subscriptions ที่ XSpring ต้องใช้
4. Credential หรือ channel ที่ได้รับถูกผูกกับ shared quota ซึ่งมี client อื่นใช้งานร่วมกัน

### ประเด็นเรื่องรูปแบบ Payload ที่ต้องยืนยัน

เอกสาร July ระบุ `subscribeRequest` และ `id` เป็น subscribe headers ตอนเริ่มตรวจ committed baseline ส่ง JSON ใน header `subscribeRequest` โดยไม่มี STOMP body ขณะที่ working tree มีการเปลี่ยนแปลงที่ยังไม่ commit ให้ส่ง JSON ชุดเดียวกันซ้ำใน STOMP body

การเพิ่ม body ยังไม่มีหลักฐานว่าแก้ `E3024` ได้ เพราะ error ที่พบเป็น error ด้าน quota และเกิดก่อนการเปลี่ยนแปลงนี้ ต้องให้ KTB ยืนยันก่อนว่า JSON ควรอยู่เฉพาะ header หรือส่งซ้ำใน body ด้วย

## ความเสี่ยงฝั่ง Client

### Retry ทุกหนึ่งวินาทีหลัง Subscribe ไม่สำเร็จ

`Client.Run` reset reconnect delay เมื่อ transport และ STOMP connection สำเร็จ เนื่องจาก `E3024` เกิดหลังเชื่อมต่อสำเร็จ แต่ละรอบจึงมีโอกาสกลับไป retry ที่หนึ่งวินาที แทนที่จะเพิ่มระยะรอตาม exponential backoff

พฤติกรรมนี้ไม่ใช่สาเหตุของ `E3024` ครั้งแรก แต่ทำให้มีการเปิด connection และส่ง Subscription ซ้ำจำนวนมาก ระหว่างตรวจสอบควรหยุด subscriber หรือกำหนด `SFX_RECONNECT=false` ชั่วคราว

### ส่ง Mock rate หลังได้รับ Error จริงจาก KTB

Client ปัจจุบันเรียก temporary mock-rate path เมื่อ STOMP `CONNECT` หรือ `SUBSCRIBE` ล้มเหลว ข้อมูลจำลองอาจถูกส่งต่อไปยัง FX persistence และ Kafka ทำให้ outage ถูกซ่อนหรือเกิดข้อมูลราคาจำลองปะปนกับข้อมูลจริง

ต้องนำ behavior นี้ออกหรือแยกออกจาก production flow อย่างชัดเจนก่อนใช้งานจริง เพราะไม่ใช่ส่วนหนึ่งของ KTB SFX contract

## คำถามที่ต้องยืนยันกับ KTB

1. UAT กำหนด Subscription limit ของ `XSPRING_API` ไว้เท่าไร?
2. Limit นับตาม channel, customer code, OAuth client, token, WebSocket session หรือ destination?
3. เวลา `2026-09-10 20:47:55 BKK` มี active หรือ stale subscriptions รายการใดถูกนับอยู่บ้าง?
4. KTB สามารถ clear หรือ reset stale subscriptions ของ UAT channel ได้หรือไม่?
5. เมื่อ socket ปิดแบบ abrupt close KTB ใช้เวลาเท่าไรในการล้าง Subscription และมี TTL เท่าไร?
6. `subId` ต้อง unique ภายในขอบเขตใด และสามารถนำ ID เดิมกลับมาใช้เมื่อไร?
7. `subscribeRequest` ต้องส่งเฉพาะ STOMP header หรือส่งใน STOMP body ด้วย?
8. KTB รองรับ standard headers `ack:auto` และ `receipt` หรือไม่?
9. KTB สามารถส่ง Gateway log ของ request นี้ได้หรือไม่ ในกรณีที่ `CONNECTED` response ไม่มี session identifier?

## ข้อความสำหรับส่งให้ KTB

```text
วันที่ 10 กันยายน 2026 เวลา 20:47:55 น. ตามเวลาไทย ระบบ XSpring
ขอ OAuth token สำเร็จ เปิด WebSocket สำเร็จ และได้รับ STOMP CONNECTED version 1.2
จาก SmartFX UAT Gateway

เมื่อส่ง STOMP SUBSCRIBE สำหรับ channel XSPRING_API, customerCode XSPRING
และ destination /user/Rates/api/USD/THB/SPOT/xspring-2029-09-10
Gateway ตอบกลับดังนี้:

E3024: The channel's subscriptions limit has been reached.

รบกวนตรวจสอบ configured limit และ active/stale subscriptions ของ channel นี้
พร้อมยืนยันขอบเขตการนับ quota, cleanup TTL และรูปแบบที่ถูกต้องของ
subscribeRequest ว่าต้องอยู่เฉพาะ STOMP header หรืออยู่ใน frame body ด้วย
```

## สิ่งที่ควรทำทันที

1. หยุดการ retry ระหว่างที่ KTB ตรวจสอบ channel หรือกำหนด `SFX_RECONNECT=false` ชั่วคราว
2. ตรวจสอบว่าไม่มี local process, Kubernetes pod หรือ test client อื่นใช้ channel เดียวกัน
3. ขอให้ KTB แสดงรายการและล้าง stale subscriptions ใน UAT
4. หลัง KTB ยืนยันว่ามี quota ว่าง ให้ทดสอบใหม่เพียงหนึ่ง connection ด้วย `subId` ที่ไม่ซ้ำ
5. เก็บ frame `CONNECTED`, `SUBSCRIBE`, `ERROR` และ socket close ให้ครบ โดยห้ามบันทึก access token ลง log
6. ยืนยันรูปแบบ STOMP body กับ KTB ก่อนเก็บการเปลี่ยนแปลงที่ส่ง payload ซ้ำ
7. นำ temporary mock-rate fallback ออกหรือแยกให้ปลอดภัยก่อนใช้งาน production

## Technical Reference (ข้อมูลอ้างอิงทางเทคนิค)

Repository: `product-websocket-service`

- จุดเริ่มต้นของ subscriber: `cmd/subscribe/main.go`
- วงจร WebSocket และ STOMP: `pkg/sfxwebsocket/client.go`
- การ encode STOMP frame และอ่าน error: `pkg/sfxwebsocket/stomp.go`
- การจัดการ transport: `pkg/sfxwebsocket/transport.go`
- Destination และ rate models: `pkg/sfxwebsocket/types.go`
- Contract tests: `pkg/sfxwebsocket/sfxwebsocket_test.go`

## How to Verify (วิธีตรวจสอบ)

ตรวจสอบการสร้าง header, destination, payload และการอ่าน STOMP error ด้วยคำสั่ง:

```bash
go test ./pkg/sfxwebsocket -run 'Test(ConnectHeaders|HandshakeHeaders|Destination|SubscribeRequestJSON|SubscribeHeaderJSONHasNoNewlines|HandleSubscribeFrame|KTBErrorLogAttrs|ReconnectLogMsg)$' -count=1 -v
```

ผลลัพธ์ที่คาดหวังคือทุก test ผ่าน ชุดทดสอบนี้ยืนยันเฉพาะ frame ที่ client สร้างและการอ่าน error ไม่สามารถยืนยันว่า KTB มี Subscription quota ว่าง

สำหรับการตรวจสอบ UAT ให้เปิดเพียงหนึ่ง connection หลัง KTB ยืนยันว่า quota ถูกล้างแล้ว การทดสอบจะถือว่าสำเร็จเมื่อได้รับ STOMP `RECEIPT` ที่ตรงกันหรือได้รับ rate `MESSAGE` แรก การได้รับ `CONNECTED` อย่างเดียวยังไม่เพียงพอที่จะสรุปว่า streaming ใช้งานได้

## เอกสารที่เกี่ยวข้อง

- [ข้อมูลระบบเชื่อมต่อภายนอก](/system-context/integrations/)
- [การป้องกันความเสี่ยง FX หลังการซื้อขาย](/business-flows/trading/hedging/)

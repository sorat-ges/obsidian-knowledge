นี่คือรวมชุดคำสั่งสำหรับ **"X-Ray ดูไส้ใน Kong"** แบบครบทุกมุมครับ แนะนำให้ไล่เช็คตามลำดับนี้เพื่อหาสาเหตุที่ Pod ใหม่มันค้างครับ

### 1. ดูภาพรวม (Status & Health)

เช็คว่ามี Pod ไหนตาย หรือกำลัง Restart วนลูปหรือไม่

```bash
kubectl get pods -n kong -o wide

```

* **ดูตรงไหน:** ดูช่อง `READY` (ต้องเป็น 2/2) และ `RESTARTS` (ถ้าเยอะแสดงว่า Config ผิดจน Crash)

---

### 2. ดูสาเหตุการตาย (Events - สำคัญมากสำหรับ Pod ที่ค้าง)

ถ้า Pod ค้างอยู่ที่ `0/2` หรือ `CrashLoopBackOff` คำสั่งนี้จะบอกว่า **"Kubernetes บ่นว่าอะไร"** (เช่น Readiness Probe failed, Mount volume ไม่ได้)

```bash
# แทนที่ชื่อ pod ด้วยตัวใหม่ที่กำลังค้าง (ตัวที่ age น้อยๆ)
kubectl describe pod kong-ingress-customer-kong-xxxxxx -n kong

```

* **ดูตรงไหน:** เลื่อนลงไปล่างสุด ตรงหัวข้อ **`Events:`**

---

### 3. ดู Logs (หัวใจสำคัญ)

Kong 1 Pod จะมี 2 Container ข้างใน ต้องดูแยกกันครับ

**แบบ A: ดู Log ของตัว Proxy (NGINX)**
อันนี้จะบอกว่า **"ทำไม Start ไม่ขึ้น"** หรือ **"Config ผิดตรงไหน"**

```bash
kubectl logs -f kong-ingress-customer-kong-xxxxxx -n kong -c proxy

```

**แบบ B: ดู Log ของ Controller (ตัวคุยกับ K8s)**
อันนี้จะบอกว่า **"Sync Config จาก Kubernetes สำเร็จไหม"** หรือ **"เจอ Plugin ผีหลอกหรือเปล่า"**

```bash
kubectl logs -f kong-ingress-customer-kong-xxxxxx -n kong -c ingress-controller

```

---

### 4. เช็คของที่ฝังอยู่ใน Kong (Plugins)

เช็คว่าตอนนี้ทั้ง Cluster มี Plugin อะไรตกค้างอยู่บ้าง

**ดู KongPlugin (Local - แยกตาม Namespace)**

```bash
kubectl get kongplugins -A

```

**ดู KongClusterPlugin (Global)**

```bash
kubectl get kongclusterplugins

```

---

### 5. เช็ค Ingress ทั้งหมดที่ใช้ Kong นี้

เผื่อมี Ingress ตัวอื่น (ที่ไม่ใช่ `order-service`) แอบใช้ Plugin ผิดๆ แล้วทำ Kong ล่มทั้งระบบ

```bash
kubectl get ingress -A

```

**แนะนำ:** ตอนนี้ให้เริ่มจาก **ข้อ 2 (Describe)** และ **ข้อ 3 (Logs -c proxy)** กับ Pod ตัวใหม่ที่ค้างอยู่ครับ จะเจอคำตอบแน่นอน
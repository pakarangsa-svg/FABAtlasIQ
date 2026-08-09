# Product Development KPI Tracker — FabFood Group

Web app สำหรับติดตาม KPI การพัฒนาสินค้าใหม่ (NPD) ของ 7 แบรนด์
เป็น **ไฟล์เดียวจบ** (`index.html`) — HTML + CSS + JavaScript รวมอยู่ในไฟล์เดียว ไม่ต้องติดตั้งอะไร ไม่ต้องใช้ server ไม่ต้องต่อเน็ต

## วิธีใช้งาน

เปิดไฟล์ `index.html` ด้วยเบราว์เซอร์ (Chrome / Edge / Safari) ได้เลย — ดับเบิลคลิกที่ไฟล์ก็พอ

## ฟีเจอร์

- **Dashboard** — KPI รวมทุกแบรนด์: จำนวนโปรเจกต์, Launched, Completed, Avg Achievement, On-Time rate + Brand Scorecard
- **Brands** — เจาะรายแบรนด์ พร้อม Milestone Checklist ของแต่ละโปรเจกต์ (ติ๊กได้ทันที ระบุหน่วยงานรับผิดชอบทุกขั้น)
- **Timeline** — Gantt chart ช่วงเปิดตัวทั้งปี กรองแยกแบรนด์ได้ พร้อมสรุปย่อต่อแบรนด์
- **Projects** — ตารางรวมทุกโปรเจกต์ ค้นหา/กรองได้
- **เพิ่ม / แก้ไข / ลบโปรเจกต์** — ปุ่ม New Project และ Edit ในการ์ด
- **รูปเมนู** — แนบรูปได้ไม่จำกัดต่อโปรเจกต์ (ปุ่ม Add images ในหน้า Edit) แสดง thumbnail บนการ์ด คลิกเพื่อดูเต็มจอ เลื่อนซ้าย-ขวาได้ · รูปถูกย่ออัตโนมัติ (ยาวสุด 1000px, JPEG) เพื่อให้ไฟล์ Export ไม่ใหญ่ และรูปถูกเก็บไปกับ JSON ตอน Export/Import ด้วย
- **เลือกปี** — dropdown มุมขวาบน
- **Dark mode** — ปุ่มพระจันทร์
- **Export / Import JSON** — ข้อมูลอยู่ในหน้าเว็บเท่านั้น (ไม่มี database) กด Export เก็บเป็นไฟล์ .json แล้ว Import กลับมาเมื่อเปิดใหม่

> สำคัญ: ข้อมูลที่แก้จะหายเมื่อปิด/รีเฟรชหน้า — กด **Export** เก็บไฟล์ JSON ไว้เสมอ แล้วใช้ **Import** โหลดกลับ

## การปรับแต่ง (แก้ในไฟล์ index.html)

| สิ่งที่แก้ | ตำแหน่งในโค้ด |
|---|---|
| รายชื่อแบรนด์ + สี | ค่าคงที่ `BRANDS` |
| สถานะโปรเจกต์ | ค่าคงที่ `STATUSES` |
| Milestone เริ่มต้น + หน่วยงาน | ค่าคงที่ `DEFAULT_MILESTONES` |
| ตัวเลือกหน่วยงานใน dropdown | `<datalist id="deptList">` |
| ข้อมูลตัวอย่าง | ตัวแปร `projects` |

## เผยแพร่ให้ทีมใช้ (ทางเลือก)

- แชร์ไฟล์ `index.html` ผ่าน Google Drive / LINE / อีเมล — ผู้รับเปิดได้ทันที
- หรือ host ฟรี: ลากไฟล์ขึ้น [Netlify Drop](https://app.netlify.com/drop) หรือใช้ GitHub Pages ก็ได้ URL ให้ทีมเปิดใช้ร่วมกัน

# 🍽️ RD Food Chain — Food Cost Management

ระบบจัดการต้นทุนอาหาร (Food Cost) สำหรับเชนร้านอาหารหลายแบรนด์ — **ไฟล์เดียวจบ**
เปิดใช้งานได้ทันทีโดยไม่ต้องติดตั้งอะไร ข้อมูลถูกบันทึกในเบราว์เซอร์ (`localStorage`)

![status](https://img.shields.io/badge/status-active-success) ![type](https://img.shields.io/badge/stack-single--file%20HTML-blue) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

## ✨ คุณสมบัติ

6 โมดูลหลัก (เมนูด้านซ้าย):

| โมดูล | หน้าที่ |
|------|---------|
| 🏠 **Home** | Dashboard — ภาพรวมเมนู, Food Cost เฉลี่ย, เมนูเกินเป้า, สรุปรายแบรนด์ |
| 📊 **Food Cost** | คำนวณ % ต้นทุนต่อเมนู (ราคาขาย → ต้นทุน → Food Cost % → กำไรขั้นต้น) |
| 📋 **BOM** | รายการสูตรกลาง / Batch (Bill of Materials) + ต้นทุนต่อหน่วย |
| 🧪 **Set BOM** | สร้าง / แก้ไขสูตร เพิ่มส่วนผสม (วัตถุดิบ หรือ BOM ซ้อนกันได้) คำนวณสด |
| 🗂️ **Project** | จัดกลุ่มเมนูตามโครงการพัฒนาสินค้า + สถานะ + เป้าต้นทุน |
| 🥩 **Cost RM** | ราคาวัตถุดิบ + Yield % → ต้นทุนสุทธิที่ใช้คำนวณจริง |

รองรับ **8 แบรนด์**: Santa Fe Happy Steak · SantaFe Easy · Jae Dang · Jae Dang Jumnua (KT) · Yamachan · Uchidaya · Top Secret Ramen · Top Secret Cafe

### ไฮไลต์
- **Cost roll-up อัตโนมัติ**: Raw Material → BOM → เมนู (BOM ซ้อน BOM ได้ พร้อมกันลูปวน)
- **Yield %** ทั้งวัตถุดิบและสูตร (ชดเชยส่วนที่ตัดแต่ง / เคี่ยวลด)
- **สีเตือน Food Cost**: 🟢 ถึงเป้า · 🟠 เกินไม่เกิน 5% · 🔴 เกิน 5%
- บันทึก `localStorage` อัตโนมัติ + **Export / Import JSON** สำรองข้อมูล
- ไม่มี dependency, ไม่ต้อง build, ทำงานออฟไลน์

## 🚀 วิธีใช้งาน

### วิธีที่ 1 — เปิดไฟล์ตรงๆ (ง่ายสุด)
ดับเบิลคลิกที่ `index.html` เปิดในเบราว์เซอร์ได้เลย

### วิธีที่ 2 — รันผ่าน local server
```bash
# Python
python -m http.server 5510

# หรือ Node
npx serve -l 5510
```
แล้วเปิด http://localhost:5510

## 🧮 สูตรการคำนวณ

```
ต้นทุน/หน่วย วัตถุดิบ   = ราคาซื้อ ÷ ปริมาณที่ได้
ต้นทุนสุทธิ (effective) = ต้นทุน/หน่วย ÷ Yield%
ต้นทุน/หน่วย ของ BOM    = ต้นทุนทั้ง Batch ÷ (ผลผลิต × Yield%)
Food Cost %             = ต้นทุนวัตถุดิบรวม ÷ ราคาขาย × 100
กำไรขั้นต้น (GP)        = ราคาขาย − ต้นทุนวัตถุดิบรวม
```

## 🗂️ โครงสร้าง

```
rd-food-chain/
└── index.html   # ทั้งแอป (HTML + CSS + JS ในไฟล์เดียว)
```

## 📄 License

MIT

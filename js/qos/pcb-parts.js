// The controller board's parts: what each one is (from the board and Controller_v7.ino) and how far it
// lifts in an exploded view. Shared by qOS robot3d and the CAD bench on the main page.
export const PARTS = {
  board: { t: 'Controller PCB', k: 'board', d: { th: 'บอร์ดรีโมตที่คิวออกแบบใน EasyEDA ขนาด 172.7 × 84.7 มม. โมเดลนี้มาจากไฟล์ส่งออก 3 มิติจริงของบอร์ด ลากเพื่อหมุน คลิกชิ้นส่วนเพื่อดูว่าเฟิร์มแวร์ใช้มันทำอะไร', en: 'The controller board Q laid out in EasyEDA, 172.7 × 84.7 mm. This model is the real 3D export of that board. Drag to orbit, click a part to see what the firmware does with it.' } },
  xbee: { t: 'XBee Series 2', k: 'radio', d: { th: 'วิทยุ 2.4 GHz ต่อกับ Serial1 ที่ 115200 ในโหมด API ทุกคำสั่งขับห่อเป็นเฟรม 25 ไบต์ ส่งไปที่ที่อยู่ 64 บิตของหุ่น', en: "The 2.4 GHz radio on Serial1 at 115200 in API mode. Every drive frame is wrapped in a 25-byte API frame addressed to the robot's 64-bit address." } },
  tog_l: { t: 'TOG_L · expo', pin: 'A6', k: 'toggle', d: { th: 'เปิด = จอยใช้กราฟ expo ปลายนุ่ม คุมช้า ๆ ได้ละเอียด', en: 'Up: the sticks use an expo curve, soft near centre for fine control.' } },
  tog_r: { t: 'TOG_R · safety', pin: 'A7', k: 'toggle', d: { th: 'อ่านได้ LOW = โหมดปลอดภัย ทุกแกนและปุ่มในเฟรมเป็นศูนย์ หุ่นหยุด', en: 'Reads LOW: safety. Every axis and button in the frame goes to zero and the robot stops.' } },
  l1: { t: 'L1 · channel hop', pin: 'A4', k: 'button', d: { th: 'หาช่องที่ว่างถัดไป ส่งเฟรม HOP (0xFE) ให้หุ่นสามครั้ง แล้วเปลี่ยนช่อง XBee ตาม', en: 'Finds the next clean channel, sends the robot a HOP frame (0xFE) three times, then retunes the XBee.' } },
  r1: { t: 'R1 · speed mode', pin: 'A5', k: 'button', d: { th: 'สลับความเร็ว FULL (100%) กับ MED (30%)', en: 'Switches speed between FULL (100%) and MED (30%).' } },
  up: { t: '↑ UP', pin: '3', k: 'button', bit: 'BTN bit 2 · held', d: { th: 'กดค้างไว้ บิตจะติดตลอดที่กด', en: 'Held: the bit is set while pressed.' } },
  down: { t: '↓ DOWN · ARM', pin: '4', k: 'button', bit: 'BTN bit 3 · latching', d: { th: 'กดหนึ่งครั้งสลับกลไกแขน (ARM)', en: 'One press toggles the ARM mechanism.' } },
  left: { t: '← LEFT · HAND', pin: '2', k: 'button', bit: 'BTN bit 4 · latching', d: { th: 'กดหนึ่งครั้งสลับกลไกมือ (HAND)', en: 'One press toggles the HAND mechanism.' } },
  right: { t: '→ RIGHT · WRIST', pin: '5', k: 'button', bit: 'BTN bit 5 · latching', d: { th: 'กดหนึ่งครั้งสลับข้อมือ (WRIST)', en: 'One press toggles the WRIST.' } },
  tri: { t: '△ TRI · GRIP', pin: '7', k: 'button', bit: 'BTN bit 1 · latching', d: { th: 'กดหนึ่งครั้งสลับตัวจับ (GRIP)', en: 'One press toggles the GRIP.' } },
  sq: { t: '□ SQ · STR', pin: '6', k: 'button', bit: 'BTN bit 6 · latching', d: { th: 'กดหนึ่งครั้งสลับ STR', en: 'One press toggles STR.' } },
  cir: { t: '○ CIR', pin: '8', k: 'button', bit: 'BTN bit 0 · held', d: { th: 'กดค้างไว้ บิตจะติดตลอดที่กด', en: 'Held: the bit is set while pressed.' } },
  cross: { t: '✕ CROSS', pin: '9', k: 'button', bit: 'AUX bit 0 · held', d: { th: 'กดค้างไว้ ตั้งบิต 0 ของไบต์ AUX', en: 'Held: sets bit 0 of the AUX byte.' } },
  reset: { t: 'MODE', pin: '22 (A8)', k: 'button', d: { th: 'วนช่วงเกม MARTIAL ×1.00 → FOREST ×0.80 → ARENA ×0.60 ซึ่งจำกัดความเร็วสูงสุด (เฉพาะตอนไม่อยู่โหมดปลอดภัย)', en: 'Cycles the game phase MARTIAL ×1.00 → FOREST ×0.80 → ARENA ×0.60, which caps top speed (only when safety is off).' } },
  reg: { t: 'Voltage regulator', k: 'power', d: { th: 'ตัวควบคุมแรงดันแบบ SOIC-8 จ่ายไฟให้บอร์ดจากแบตเตอรี่', en: 'The SOIC-8 regulator that powers the board from the battery.' } },
  jst: { t: 'JST connector', k: 'connector', d: { th: 'คอนเนกเตอร์ JST บนบอร์ด', en: "The board's JST connector." } },
  passives: { t: 'SMD passives', k: 'passive', d: { th: 'ตัวต้านทานและตัวเก็บประจุขนาด 0603 รอบวงจรไฟ', en: '0603 resistors and capacitors around the power section.' } },
  teensy: { t: 'Teensy 4.0', k: 'mcu · not in the CAD', d: { th: 'i.MX RT1062 @ 600 MHz เสียบบนก้างปลา จึงไม่อยู่ในไฟล์ CAD เส้นประนี้เป็นตำแหน่งโดยประมาณ อ่านอินพุต 15 ตัว และแกนอนาล็อก 4 แกนจากจอยที่ต่อสายออกไปนอกบอร์ด', en: "i.MX RT1062 @ 600 MHz. It plugs into headers, so it isn't in the CAD export: the dashed outline is an approximate stand-in. It reads 15 inputs and 4 analog axes from the off-board sticks." } },
};
export const LIFT = { board: 0, xbee: 36, tog_l: 26, tog_r: 26, reg: 12, passives: 8, jst: 18, reset: 16 };   // explode, mm

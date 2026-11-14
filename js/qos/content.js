// Everything qOS says about Q. Facts are the same ones the main page states; edit here to change
// what `cat`, `about`, `music`, `games` and `projects` print. Each text has a Thai and an English side.

export const T = (o, lang) => (typeof o === 'string' ? o : o[lang] || o.en);

export const ABOUT = {
  th: `# about.md

อภิภัทร สันทัสนะโชค เรียกว่า "คิว" ก็ได้
นักศึกษาปี 3 วิศวกรรมระบบสมองกลฝังตัว มหาวิทยาลัยบูรพา

ผมชอบงานที่ฮาร์ดแวร์กับซอฟต์แวร์ต้องทำงานร่วมกัน
และชอบเห็นสิ่งที่ผมสร้างถูกเอาไปใช้จริง

- เขียนซอฟต์แวร์ทั้งหมดของหุ่น ABU Robocon 2026 และรีโมตของมัน
- ไปแข่ง TMIRC ที่ไต้หวันในนามประเทศไทย
- พัฒนา MIONEX แขนเทียมที่มีคนใส่ใช้งานจริง 6 คน
- 1 ใน 9 คนจาก 540 คนของ ELP4 ที่ได้ไป SKKU เกาหลี

เครื่องมือ: Teensy 4.x, ESP32, STM32, Arduino · C, C++, Python, JS · ROS 2`,
  en: `# about.md

Apipath Santasnachok. Call me Q.
Third-year Embedded Systems Engineering student, Burapha University.

I'm happiest where hardware meets software,
and when what I build gets used.

- Wrote all the software for an ABU Robocon 2026 robot and its controller
- Raced for Thailand at TMIRC in Taiwan
- Building MIONEX, a prosthetic arm six people already wear
- One of 9 picked from 540 ELP4 applicants for a visit to SKKU, Korea

Tools: Teensy 4.x, ESP32, STM32, Arduino · C, C++, Python, JS · ROS 2`,
};

// Genres Q listens to. To show artists or songs, add them to `picks` (e.g. ['Artist – Song']);
// a genre with an empty list just shows the genre.
export const MUSIC = [
  { genre: { th: 'ป๊อปไทย / T-pop', en: 'Thai pop / T-pop' }, level: 0.9, picks: [] },
  { genre: { th: 'ร็อก / อินดี้', en: 'Rock / indie' }, level: 0.8, picks: ['Linkin Park', 'Three Days Grace', 'Polyphia'] },
  { genre: { th: 'J-pop / เพลงอนิเมะ', en: 'J-pop / anime OST' }, level: 0.85, picks: [] },
  { genre: { th: 'R&B / แจ๊ส', en: 'R&B / jazz' }, level: 0.75, picks: ['Giveon', 'Joji', 'keshi', 'RINI'] },
];
export const MUSIC_ERA = { th: 'ฟังยุค 2000s–2010s เป็นหลัก', en: 'Mostly the 2000s and 2010s' };

// Same idea: put game titles or projects in `picks` to list them.
export const GAMES = [
  { kind: { th: 'เกม PC / คอนโซล', en: 'PC / console games' }, picks: ['League of Legends', 'Monster Hunter (World: Iceborne, Rise: Sunbreak, Generations Ultimate, Wilds)', 'Dark Souls III', 'Elden Ring', 'Sekiro', 'Clair Obscur: Expedition 33', 'Sifu', 'Hyper Light Drifter', 'NieR:Automata'] },
  { kind: { th: 'เกมมือถือ', en: 'Mobile games' }, picks: ['RoV (Arena of Valor)', 'Granblue Fantasy'] },
  { kind: { th: 'อนิเมะ', en: 'Anime' }, picks: ['Attack on Titan (favourite)', 'That Time I Got Reincarnated as a Slime (watching lately)', 'The Eminence in Shadow', 'Saint Seiya', 'Berserk'] },
  { kind: { th: 'สร้างของเล่น ๆ: หุ่น บอร์ด พิมพ์ 3 มิติ', en: 'Building things for fun: robots, boards, 3D prints' }, picks: [] },
];

export const PROJECTS = [
  { file: 'abu-robocon-2026.md', href: '#j-abu',
    th: 'ABU Robocon 2026 (พ.ค.–มิ.ย. 2026)\nเขียนซอฟต์แวร์ทั้งหมดของหุ่นและรีโมต เดินสายไฟเกือบทั้งหมด\nTeensy 4.1 + 4.0 · โปรโตคอลวิทยุของตัวเองผ่าน XBee · CRC-8 · failsafe 1.5 วินาที\nได้ที่ 8 ของมหาวิทยาลัย และที่ 13 ระดับประเทศ\n→ ลองพิมพ์ robot3d ดูบอร์ดรีโมตตัวจริง',
    en: 'ABU Robocon 2026 (May–Jun 2026)\nAll the software for the robot and its controller, most of the wiring.\nTeensy 4.1 + 4.0 · own radio protocol over XBee · CRC-8 · 1.5 s failsafe\n8th among universities, 13th nationally.\n→ run robot3d to see the real controller board' },
  { file: 'mionex.md', href: '#work',
    th: 'MIONEX\nแขนเทียมไฟฟ้ากล้ามเนื้อสำหรับผู้พิการแขนใต้ศอก มีคนใส่ใช้งานจริง 6 คน\nที่ 1 Pitch Your IP 2025 · พาไปจนถึง ELP4 และ SKKU',
    en: 'MIONEX\nA myoelectric arm for below-elbow amputees, worn by 6 people.\n1st at Pitch Your IP 2025 · took it through ELP4 to SKKU' },
  { file: 'tmirc-2025.md', href: '#j-tmirc',
    th: 'TMIRC 2025 ไต้หวัน (ส.ค. 2025)\nRobotrace ในนามประเทศไทยกับรุ่นพี่\nESP32 · IR 16 ช่อง · PID · รอบแรกจำเส้น รอบสองวิ่งทำเวลา',
    en: 'TMIRC 2025, Taiwan (Aug 2025)\nRobotrace for Thailand, with a senior.\nESP32 · 16-ch IR · PID · learn the course on one run, race it on the next' },
  { file: 'batly-r1.md', href: '#j-ros',
    th: 'BATLY R1 (มิ.ย. 2026)\nROS 2 Jazzy · SLAM, Nav2, AMCL · RPLIDAR C1\nเขียน loop_navigator ส่งเส้นทาง A → B → C ผ่าน FollowWaypoints\n→ ลองพิมพ์ drive แล้วทำแผนที่เอง',
    en: 'BATLY R1 (Jun 2026)\nROS 2 Jazzy · SLAM, Nav2, AMCL · RPLIDAR C1\nWrote loop_navigator to send A → B → C through FollowWaypoints.\n→ run drive and map the factory yourself' },
  { file: 'nano-board.md', href: '#j-nano',
    th: 'บอร์ด Arduino Nano ของตัวเอง (ก.พ. 2026)\nEasyEDA · ATmega328P · CH340G · USB-C · 2 ชั้น',
    en: 'My own Arduino Nano (Feb 2026)\nEasyEDA · ATmega328P · CH340G · USB-C · two layers' },
  { file: 'lidar-skku.md', href: '#j-lidar',
    th: 'แคมปัส SKKU ในสายตา LiDAR (ต.ค. 2026)\nLiDAR 64 เส้น (จำลอง) จากข้อมูล OpenStreetMap · three.js',
    en: "SKKU's campus through a LiDAR (Oct 2026)\nA simulated 64-channel LiDAR over OpenStreetMap data · three.js" },
];

export const CONTACT = { email: 'apipath.san@gmail.com', github: 'https://github.com/Qil159753' };

// The virtual Teensy underneath one sketch: clock, timers, pins, both serial ports.
#include "Arduino.h"
#include "Wire.h"

UsbSerial Serial;
HwSerial Serial1;
TwoWire Wire;

static uint32_t clk = 0;
static bool in_isr = false;

static IntervalTimer *timers[4];
static int ntimers = 0;

static uint8_t level[64], pwm[64], mode[64];
static uint16_t adc[64];

static uint8_t rx[512];
static int rx_head = 0, rx_tail = 0;

extern "C" uint32_t q_micros(void) { return clk; }

// An ISR's own delayMicroseconds() only costs time; nothing preempts it.
extern "C" void q_advance(uint32_t us) {
  if (in_isr) { clk += us; return; }
  const uint32_t end = clk + us;
  for (;;) {
    IntervalTimer *due = nullptr;
    for (int i = 0; i < ntimers; i++) {
      IntervalTimer *t = timers[i];
      if (t->on && (int32_t)(t->next - end) <= 0 && (!due || (int32_t)(t->next - due->next) < 0)) due = t;
    }
    if (!due) break;
    if ((int32_t)(due->next - clk) > 0) clk = due->next;
    in_isr = true;
    due->fn();
    in_isr = false;
    due->next += due->period;   // update() inside the ISR takes effect from the next period, as on Teensy
  }
  if ((int32_t)(end - clk) > 0) clk = end;
}

bool IntervalTimer::begin(void (*f)(), unsigned long us) {
  fn = f; period = us ? us : 1; next = clk + period; on = true;
  int i = 0;
  while (i < ntimers && timers[i] != this) i++;
  if (i == ntimers && ntimers < 4) timers[ntimers++] = this;
  return true;
}
void IntervalTimer::update(unsigned long us) { period = us ? us : 1; }
void IntervalTimer::end() { on = false; }

void pinMode(int p, int m) {
  if (p < 0 || p >= 64) return;
  mode[p] = (uint8_t)m;
  if (m == INPUT_PULLUP && !level[p]) level[p] = HIGH;
}
void digitalWrite(int p, int v) { if (p >= 0 && p < 64) level[p] = v ? HIGH : LOW; }
int digitalRead(int p) { return (p >= 0 && p < 64) ? level[p] : LOW; }
int analogRead(int p) { q_advance(17); return (p >= 0 && p < 64) ? adc[p] : 0; }
void analogWrite(int p, int v) { if (p >= 0 && p < 64) pwm[p] = (uint8_t)constrain(v, 0, 255); }

void UsbSerial::printf(const char *fmt, ...) {
  char buf[320];
  va_list ap;
  va_start(ap, fmt);
  int n = vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  if (n > (int)sizeof buf - 1) n = sizeof buf - 1;
  if (n > 0) js_serial(buf, n);
}

void HwSerial::write(const uint8_t *b, int n) {
  js_radio_tx(b, n, clk);
  q_advance((uint32_t)n * 87);   // 10 bits per byte at 115200 baud
}
int HwSerial::available() { return (rx_head - rx_tail + (int)sizeof rx) % (int)sizeof rx; }
int HwSerial::read() {
  if (rx_head == rx_tail) return -1;
  uint8_t b = rx[rx_tail];
  rx_tail = (rx_tail + 1) % (int)sizeof rx;
  return b;
}

void setup();
void loop();

extern "C" {
__attribute__((export_name("fw_setup"))) void fw_setup(void) { setup(); }
__attribute__((export_name("fw_loop"))) void fw_loop(void) { q_advance(5); loop(); }
__attribute__((export_name("fw_now"))) uint32_t fw_now(void) { return clk; }
__attribute__((export_name("fw_rx"))) void fw_rx(int b) {
  int nx = (rx_head + 1) % (int)sizeof rx;
  if (nx == rx_tail) return;   // the UART FIFO overflowed; the byte is lost, as on the real part
  rx[rx_head] = (uint8_t)b; rx_head = nx;
}
__attribute__((export_name("fw_pin"))) int fw_pin(int p) { return digitalRead(p); }
__attribute__((export_name("fw_pwm"))) int fw_pwm(int p) { return (p >= 0 && p < 64) ? pwm[p] : 0; }
__attribute__((export_name("fw_set_in"))) void fw_set_in(int p, int v) { if (p >= 0 && p < 64) level[p] = v ? HIGH : LOW; }
__attribute__((export_name("fw_set_adc"))) void fw_set_adc(int p, int v) { if (p >= 0 && p < 64) adc[p] = (uint16_t)v; }
}

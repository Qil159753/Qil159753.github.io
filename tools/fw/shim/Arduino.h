// Just enough of the Teensy 4.x core for the ABU sketches to compile unchanged to WebAssembly.
// Time is virtual: delay() and the I2C read advance a microsecond clock, and IntervalTimer
// callbacks fire as that clock passes them, so the ISR code paths run as written.
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdlib.h>
#include <algorithm>

typedef uint8_t byte;
typedef bool boolean;

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2

// Teensy 4.x analog pin numbers
#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A4 18
#define A5 19
#define A6 20
#define A7 21
#define A8 22

template <class T> static inline T q_abs(T x) { return x > 0 ? x : -x; }
#define abs(x) q_abs(x)
#define constrain(x, lo, hi) ((x) < (lo) ? (lo) : ((x) > (hi) ? (hi) : (x)))
static inline long map(long x, long a, long b, long c, long d) { return (x - a) * (d - c) / (b - a) + c; }

extern "C" {
void q_advance(uint32_t us);   // moves the clock, running timer callbacks that fall due
uint32_t q_micros(void);
// imported from the page
void js_serial(const char *s, int n);
void js_radio_tx(const uint8_t *b, int n, uint32_t t_us);
float js_gyro_z(void);
float js_angle_z(void);
}

static inline unsigned long millis() { return q_micros() / 1000; }
static inline unsigned long micros() { return q_micros(); }
static inline void delay(unsigned long ms) { q_advance(ms * 1000); }
static inline void delayMicroseconds(unsigned int us) { q_advance(us); }

void pinMode(int pin, int mode);
void digitalWrite(int pin, int v);
int digitalRead(int pin);
static inline void digitalWriteFast(int pin, int v) { digitalWrite(pin, v); }
int analogRead(int pin);
void analogWrite(int pin, int v);
static inline void analogReadResolution(int) {}

class UsbSerial {
 public:
  void begin(long) {}
  void print(const char *s) { js_serial(s, (int)strlen(s)); }
  void print(int v) { printf("%d", v); }
  void print(float v) { printf("%.2f", v); }
  void println() { print("\n"); }
  void println(const char *s) { print(s); print("\n"); }
  void println(int v) { print(v); print("\n"); }
  void printf(const char *fmt, ...) __attribute__((format(printf, 2, 3)));
};

class HwSerial {
 public:
  void begin(long) {}
  void write(const uint8_t *b, int n);
  int available();
  int read();
  void flush() {}
};

extern UsbSerial Serial;
extern HwSerial Serial1;

class IntervalTimer {
 public:
  bool begin(void (*fn)(), unsigned long us);
  void update(unsigned long us);
  void end();
  void (*fn)() = nullptr;
  uint32_t period = 0, next = 0;
  bool on = false;
};

// MPU6050_light's surface as the robot firmware uses it, fed by the page's physics.
#pragma once
#include "Arduino.h"
#include "Wire.h"

class MPU6050 {
 public:
  explicit MPU6050(TwoWire &) {}
  byte begin() { return 0; }
  void calcOffsets() { q_advance(500000); }   // ~500 samples while the robot sits still
  void update() { q_advance(350); }           // one 14-byte burst read at 400 kHz I2C
  float getAngleZ() { return js_angle_z(); }
  float getGyroZ() { return js_gyro_z(); }
};

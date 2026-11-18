#pragma once
class TwoWire {
 public:
  void begin() {}
  void setClock(long) {}
};
extern TwoWire Wire;

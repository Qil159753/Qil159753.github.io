// robot_firmware_v7.ino compiled as is, plus read-only accessors the page uses to draw its state.
#include SKETCH

extern "C" {
__attribute__((export_name("st_state"))) int st_state(void) { return sysState; }
__attribute__((export_name("st_channel"))) int st_channel(void) { return currentChannelHex; }
__attribute__((export_name("st_blacklist"))) int st_blacklist(void) { return mergedBlacklist; }
__attribute__((export_name("st_local"))) int st_local(void) { return localBlacklist; }
__attribute__((export_name("st_steps1"))) int st_steps1(void) { return (int)s1_steps; }
__attribute__((export_name("st_steps2"))) int st_steps2(void) { return (int)s2_steps; }
__attribute__((export_name("st_locked"))) int st_locked(void) { return isHeadingLocked; }
__attribute__((export_name("st_target"))) float st_target(void) { return targetAngle; }
__attribute__((export_name("st_failsafe"))) int st_failsafe(void) { return linkLostTime != 0; }
__attribute__((export_name("st_ir"))) int st_ir(void) { return isSendingIR; }
}

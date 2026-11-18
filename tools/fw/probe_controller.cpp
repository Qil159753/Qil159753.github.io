// Controller_v7.ino compiled as is, plus read-only accessors the page uses to draw its state.
#include SKETCH

extern "C" {
__attribute__((export_name("st_state"))) int st_state(void) { return sysState; }
__attribute__((export_name("st_phase"))) int st_phase(void) { return gamePhase; }
__attribute__((export_name("st_channel"))) int st_channel(void) { return currentChannelHex; }
__attribute__((export_name("st_speed"))) int st_speed(void) { return currentSpeedMode; }
__attribute__((export_name("st_creep"))) int st_creep(void) { return swRStatus; }
__attribute__((export_name("st_blacklist"))) int st_blacklist(void) { return mergedBlacklist; }
__attribute__((export_name("st_local"))) int st_local(void) { return localBlacklist; }
__attribute__((export_name("st_btn"))) int st_btn(void) { return currentBtnState; }
__attribute__((export_name("st_aux"))) int st_aux(void) { return currentAuxState; }
}

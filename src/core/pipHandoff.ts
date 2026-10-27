// Android can send AppState and PiP callbacks in either order. Preserve the
// stream across expansion in both cases; native activity onStop owns dismissal.
export class PipHandoff {
  inPip = false;
  requested = false;
  private returning = false;

  request() {
    this.requested = true;
    this.returning = true;
  }

  cancelRequest() {
    this.requested = false;
    this.returning = false;
  }

  enter() {
    this.inPip = true;
    this.requested = false;
    this.returning = true;
  }

  stop() {
    this.inPip = false;
    this.requested = false;
  }

  background(autoEnter: boolean) {
    this.returning = this.inPip || this.requested || autoEnter;
    return this.returning;
  }

  foreground() {
    const preserve = this.returning || this.inPip || this.requested;
    this.returning = false;
    this.requested = false;
    return preserve;
  }
}

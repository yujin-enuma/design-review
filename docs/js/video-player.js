class DualVideoPlayer {
  constructor(container1Id, container2Id) {
    this.video1 = document.getElementById(container1Id);
    this.video2 = document.getElementById(container2Id);
    this.syncLock = true;
    this.seeking = false;
    this._setupSync();
  }

  _setupSync() {
    if (!this.video1 || !this.video2) return;
    this.video1.addEventListener('play', () => {
      if (this.syncLock && this.video2.src) this.video2.play();
    });
    this.video1.addEventListener('pause', () => {
      if (this.syncLock && this.video2.src) this.video2.pause();
    });
    this.video1.addEventListener('seeked', () => {
      if (this.syncLock && !this.seeking && this.video2.src) {
        this.seeking = true;
        this.video2.currentTime = this.video1.currentTime;
        this.seeking = false;
      }
    });
    this.video2.addEventListener('seeked', () => {
      if (this.syncLock && !this.seeking && this.video1.src) {
        this.seeking = true;
        this.video1.currentTime = this.video2.currentTime;
        this.seeking = false;
      }
    });
  }

  setSource(videoNum, url) {
    const video = videoNum === 1 ? this.video1 : this.video2;
    if (video) video.src = url;
  }

  seekTo(seconds) {
    this.seeking = true;
    if (this.video1 && this.video1.src) this.video1.currentTime = seconds;
    if (this.syncLock && this.video2 && this.video2.src) this.video2.currentTime = seconds;
    setTimeout(() => { this.seeking = false; }, 100);
  }

  playPause() {
    if (!this.video1) return;
    if (this.video1.paused) this.video1.play();
    else this.video1.pause();
  }

  getCurrentTime() {
    return this.video1 ? this.video1.currentTime : 0;
  }

  getDuration() {
    return this.video1 ? this.video1.duration : 0;
  }
}

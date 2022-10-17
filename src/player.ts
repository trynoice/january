export class Player {
  private static readonly CROSS_FADE_BUFFER = 0.5;
  private static readonly CROSS_FADE_DURATION = 1.0;

  private playlist: string[] = [];
  private audioQueue: HTMLAudioElement[] = [];
  private playWhenReady = false;
  private volume = 1.0;
  private isCrossFading = false;

  public play() {
    this.playWhenReady = true;
    if (this.audioQueue.length > 0) {
      this.playAudio(this.audioQueue[0]);
    } else if (this.audioQueue.length < 1) {
      this.queueNextItem();
    }
  }

  public pause() {
    this.playWhenReady = false;
    if (this.audioQueue.length < 1) {
      return;
    }

    this.audioQueue[0].pause();
    if (this.isCrossFading) {
      // if the player is cross fading, audio queue must have at least two
      // elements.
      this.audioQueue.shift();
      this.isCrossFading = false;
      this.audioQueue[0].pause(); // pause cross fading item.
      this.audioQueue[0].volume = this.volume; // restore volume
    }
  }

  public stop() {
    this.pause();
    this.audioQueue = [];
  }

  public setVolume(volume: number) {
    this.volume = volume;
    if (this.isCrossFading) {
      return;
    }

    this.audioQueue.forEach((a) => (a.volume = volume));
  }

  public addMediaItem(src: string) {
    this.playlist.push(src);
    if (this.audioQueue.length < 1) {
      this.queueNextItem();
    }
  }

  private queueNextItem() {
    const url = this.playlist.shift();
    if (url == null) {
      console.log('playlist is empty');
      return;
    }

    console.log('queuing', url);
    const audio = new Audio(url);
    audio.volume = this.volume;
    audio.preload = 'auto';
    audio.addEventListener('ended', () => {
      this.audioQueue.shift();
      if (this.audioQueue[0]?.paused) {
        this.audioQueue[0].volume = this.volume;
        this.playAudio(this.audioQueue[0]);
      }
    });

    const itemTransitioner = () => {
      const remaining = audio.duration - audio.currentTime;
      if (remaining > Player.CROSS_FADE_DURATION + Player.CROSS_FADE_BUFFER) {
        return;
      }

      if (this.audioQueue.length > 1) {
        this.crossFadeNextItem();
        audio.removeEventListener('timeupdate', itemTransitioner);
      }
    };

    audio.addEventListener('timeupdate', itemTransitioner);
    const nextItemQueuer = () => {
      const remaining = audio.duration - audio.currentTime;
      if (remaining < 15 && this.audioQueue.length < 2) {
        this.queueNextItem();
        audio.removeEventListener('timeupdate', nextItemQueuer);
      }
    };

    audio.addEventListener('timeupdate', nextItemQueuer);
    this.audioQueue.push(audio);
    if (this.playWhenReady && this.audioQueue.length === 1) {
      this.playAudio(audio);
    }
  }

  private async crossFadeNextItem() {
    this.isCrossFading = true;
    const first = this.audioQueue[0];
    const second = this.audioQueue[1];
    first.volume = this.volume;
    second.volume = 0;
    try {
      await second.play();
    } catch (e) {
      console.warn('failed to play audio', second.src, e);
      first.pause();
      this.audioQueue = this.audioQueue.slice(2);
      this.queueNextItem();
      return;
    }

    const crossFader = () => {
      if (!this.isCrossFading) {
        return;
      }

      const remaining =
        first.duration - first.currentTime - Player.CROSS_FADE_BUFFER;
      if (remaining <= 0) {
        first.volume = 0;
        second.volume = this.volume;
        this.isCrossFading = false;
      } else {
        const fraction = remaining / Player.CROSS_FADE_DURATION;
        first.volume = this.volume * Math.sqrt(fraction);
        second.volume = this.volume * Math.sqrt(1 - fraction);
        setTimeout(crossFader, 25);
      }

      console.log(
        'cross fade volumes:',
        'out:',
        first.volume,
        'in:',
        second.volume
      );
    };

    setTimeout(crossFader, 0);
  }

  private async playAudio(audio: HTMLAudioElement) {
    try {
      return await audio.play();
    } catch (e) {
      console.warn('failed to play audio', audio.src, e);
      this.audioQueue.shift();
      this.queueNextItem();
    }
  }
}

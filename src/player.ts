import MediaItem from './media-item';

const AudioContextImpl: typeof AudioContext =
  window.AudioContext || window.webkitAudioContext;

export class Player {
  private readonly context: AudioContext = new AudioContextImpl();
  private readonly gainNode = this.context.createGain();

  private playlist: MediaItem[] = [];
  private buffering = false;
  private nextChunkStartTime = this.context.currentTime;
  private playWhenReady = false;
  private bufferTicker?: number;
  private bufferSizeSeconds: number;

  constructor(bufferSizeSeconds: number) {
    this.bufferSizeSeconds = bufferSizeSeconds;
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(this.context.destination);
  }

  public async play() {
    if (this.context.state === 'closed') {
      throw new Error('attempted to restarted stopped player');
    }

    this.playWhenReady = true;
    if (!this.buffering) {
      this.scheduleBufferTicker();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  public async pause() {
    this.playWhenReady = false;
    if (this.context.state === 'running') {
      await this.context.suspend();
    }
  }

  public async stop() {
    clearTimeout(this.bufferTicker);
    await this.pause();
    if (this.context.state !== 'closed') {
      await this.context.close();
    }
  }

  public setVolume(volume: number): void {
    this.gainNode.gain.value = volume;
  }

  public addMediaItem(src: string): void {
    this.playlist.push(new MediaItem(src));
    if (this.playWhenReady && !this.buffering) {
      this.scheduleBufferTicker();
    }
  }

  private async buffer() {
    this.buffering = true;
    if (this.playlist.length < 1) {
      this.buffering = false;
      console.log('all media items in the playlist have finished buffering');
      return;
    }

    const remaining = this.nextChunkStartTime - this.context.currentTime;
    if (remaining > this.bufferSizeSeconds) {
      console.log('buffered duration exceeds the requested buffer size');
      this.scheduleBufferTicker();
      return;
    }

    if (!this.playlist[0].isInitialized()) {
      console.log('init media item');
      await this.playlist[0].initialize();
    }

    if (!this.playlist[0].hasNextChunk()) {
      console.log('finished media item');
      this.playlist.shift();
      this.scheduleBufferTicker();
      return;
    }

    const chunk = await this.playlist[0].getNextChunk();
    await this.appendToAudioContext(chunk);
    console.log('appended to audio context');

    if (this.playWhenReady && this.context.state === 'suspended') {
      this.context.resume();
    }

    this.scheduleBufferTicker();
  }

  private scheduleBufferTicker() {
    this.bufferTicker = setTimeout(() => this.buffer(), 500);
  }

  private async appendToAudioContext(chunk: ArrayBuffer) {
    const buffer = await this.context.decodeAudioData(chunk);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.onended = () => {
      source.disconnect();
      console.log('finished chunk');
    };

    if (this.nextChunkStartTime < this.context.currentTime) {
      this.nextChunkStartTime = this.context.currentTime;
    }

    source.connect(this.gainNode);
    source.start(this.nextChunkStartTime);
    this.nextChunkStartTime += buffer.duration;
    console.log(buffer.duration);
  }
}

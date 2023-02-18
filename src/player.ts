import type Logger from './logger';

const AudioContextImpl: typeof AudioContext =
  window.AudioContext || window.webkitAudioContext;

export interface PlayerDataSource {
  load(url: string): Promise<ArrayBuffer> | never;
}

export class Player {
  private readonly textDecoder = new TextDecoder();
  private readonly context: AudioContext = new AudioContextImpl();
  private readonly gainNode = this.context.createGain();
  private readonly playlist: string[] = [];
  private readonly chunkList: string[] = [];

  private buffering = false;
  private nextChunkStartTime = this.context.currentTime;
  private playWhenReady = false;
  private bufferTicker?: number;

  private readonly bufferSizeSeconds: number;
  private readonly dataSource: PlayerDataSource;
  private readonly logger?: Logger;

  constructor(
    bufferSizeSeconds: number,
    dataSource: PlayerDataSource,
    logger?: Logger
  ) {
    this.bufferSizeSeconds = bufferSizeSeconds;
    this.dataSource = dataSource;
    this.logger = logger;
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
    this.buffering = false;
    clearTimeout(this.bufferTicker);
    await this.pause();
    if (this.context.state !== 'closed') {
      await this.context.close();
    }
  }

  public setVolume(volume: number): void {
    this.gainNode.gain.value = volume;
  }

  public fadeTo(volume: number, duration: number): void {
    if (this.context.state !== 'running') {
      this.setVolume(volume);
      return;
    }

    // value must always be positive for whatever reasons.
    // https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/exponentialRampToValueAtTime
    const toVolume = Math.max(Number.EPSILON, volume);
    const fromVolume = this.gainNode.gain.value;
    this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
    this.gainNode.gain.setValueAtTime(fromVolume, this.context.currentTime);
    this.gainNode.gain.linearRampToValueAtTime(
      toVolume,
      this.context.currentTime + duration
    );
  }

  public addMediaItem(src: string): void {
    this.playlist.push(src);
    if (this.playWhenReady && !this.buffering) {
      this.scheduleBufferTicker();
    }
  }

  private async buffer() {
    this.buffering = true;
    if (this.playlist.length < 1 && this.chunkList.length < 1) {
      this.buffering = false;
      this.logger?.info('all items in the playlist have finished buffering');
      return;
    }

    const remaining = this.nextChunkStartTime - this.context.currentTime;
    if (remaining > this.bufferSizeSeconds) {
      this.logger?.debug('buffered duration exceeds the requested buffer size');
      this.scheduleBufferTicker();
      return;
    }

    if (this.chunkList.length < 1) {
      this.logger?.info('loading chunk list for the next media item');
      const mediaItemUrl = this.playlist.shift() ?? '';

      try {
        this.chunkList.push(...(await this.loadChunkList(mediaItemUrl)));
      } catch (error) {
        this.logger?.warn('failed to load chunk list for media item', error);
      }
    }

    const nextChunkUrl = this.chunkList.shift();
    if (nextChunkUrl == null) {
      return;
    }

    const chunk = await this.dataSource.load(nextChunkUrl);
    await this.appendToAudioContext(chunk);
    this.logger?.debug('appended chunk to audio context');

    if (this.playWhenReady && this.context.state === 'suspended') {
      this.context.resume();
    }

    this.scheduleBufferTicker();
  }

  private scheduleBufferTicker() {
    this.bufferTicker = setTimeout(() => this.buffer(), 1000);
  }

  private async loadChunkList(url: string): Promise<string[]> {
    const baseUrl = url.substring(0, url.lastIndexOf('/'));
    return this.textDecoder
      .decode(await this.dataSource.load(url))
      .trim()
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v != null && v.length > 0)
      .map((v) => `${baseUrl}/${v}`);
  }

  private async appendToAudioContext(chunk: ArrayBuffer) {
    const buffer = await this.context.decodeAudioData(chunk);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.onended = () => {
      source.disconnect();
      this.logger?.debug('finished playing chunk');
    };

    if (this.nextChunkStartTime < this.context.currentTime) {
      this.nextChunkStartTime = this.context.currentTime;
    }

    source.connect(this.gainNode);
    source.start(this.nextChunkStartTime);
    this.nextChunkStartTime += buffer.duration;
  }
}

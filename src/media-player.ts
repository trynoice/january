import type Logger from './logger';

const AudioContextImpl: typeof AudioContext =
  window.AudioContext || window.webkitAudioContext;

export interface MediaPlayerDataSource {
  load(url: string): Promise<ArrayBuffer> | never;
}

export class MediaPlayer extends EventTarget {
  public static readonly EVENT_MEDIA_ITEM_TRANSITION = 'mediaitemtransition';

  private readonly textDecoder = new TextDecoder();
  private readonly context: AudioContext = new AudioContextImpl();
  private readonly gainNode = this.context.createGain();
  private readonly playlist: string[] = [];
  private readonly chunkList: string[] = [];

  private buffering = false;
  private nextChunkStartTime = this.context.currentTime;
  private playWhenReady = false;
  private volume = 1.0;
  private bufferTicker?: ReturnType<typeof setTimeout>;
  private fadeCallbackTimeout?: ReturnType<typeof setTimeout>;

  private readonly bufferSizeSeconds: number;
  private readonly dataSource: MediaPlayerDataSource;
  private readonly logger?: Logger;

  constructor(
    bufferSizeSeconds: number,
    dataSource: MediaPlayerDataSource,
    logger?: Logger
  ) {
    super();
    this.bufferSizeSeconds = bufferSizeSeconds;
    this.dataSource = dataSource;
    this.logger = logger;
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
      this.setGain(this.volume);
      await this.context.resume();
      if (this.chunkList.length === 0) {
        this.dispatchEvent(new Event(MediaPlayer.EVENT_MEDIA_ITEM_TRANSITION));
      }
    }
  }

  public async pause() {
    this.playWhenReady = false;
    clearTimeout(this.fadeCallbackTimeout);
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

  private setGain(gain: number) {
    this.gainNode.gain
      .cancelScheduledValues(this.context.currentTime)
      .setValueAtTime(gain, this.context.currentTime);
  }

  public fadeTo(
    volume: number,
    durationSeconds: number,
    callback?: () => void
  ): void {
    this.volume = volume;
    clearTimeout(this.fadeCallbackTimeout);
    if (this.context.state !== 'running') {
      this.setGain(volume);
      callback?.apply(undefined);
      return;
    }

    // value must always be positive for whatever reasons.
    // https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/exponentialRampToValueAtTime
    const toVolume = Math.max(Number.EPSILON, volume);
    this.gainNode.gain
      .cancelScheduledValues(this.context.currentTime)
      .linearRampToValueAtTime(
        toVolume,
        this.context.currentTime + durationSeconds
      );

    if (callback != null) {
      this.fadeCallbackTimeout = setTimeout(callback, durationSeconds * 1000);
    }
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

    // do not return without scheduling buffer ticker if the next chunk url is
    // absent. Otherwise, it might be possible that there were media items in
    // the playlist, but the buffering stopped because the player failed to load
    // chunk list for a previous media item and the buffer ticker stopped since
    // it didn't have more chunks to load.
    if (nextChunkUrl != null) {
      try {
        const chunk = await this.dataSource.load(nextChunkUrl);
        await this.appendToAudioContext(chunk, this.chunkList.length === 0);
        this.logger?.debug('appended chunk to audio context');
      } catch (error) {
        this.logger?.warn('failed to load a chunk for the media item', error);
      }
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

  private async appendToAudioContext(chunk: ArrayBuffer, isLastChunk: boolean) {
    const buffer = await this.context.decodeAudioData(chunk);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.addEventListener('ended', () => {
      this.logger?.debug('finished playing chunk');
      if (isLastChunk) {
        this.dispatchEvent(new Event(MediaPlayer.EVENT_MEDIA_ITEM_TRANSITION));
      }

      source.disconnect();
    });

    if (this.nextChunkStartTime < this.context.currentTime) {
      this.nextChunkStartTime = this.context.currentTime;
    }

    source.connect(this.gainNode);
    source.start(this.nextChunkStartTime);
    this.nextChunkStartTime += buffer.duration;
  }
}

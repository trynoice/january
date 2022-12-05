export default class MediaItem {
  private static readonly fetchOptions: RequestInit = {
    credentials: 'include',
  };

  private hasLoadedChunksList = false;
  private chunks: string[] = [];
  private currentChunkIndex = -1;
  private src: string;
  private basePath: string;

  constructor(src: string) {
    this.src = src;
    this.basePath = src.substring(0, src.lastIndexOf('/'));
  }

  public isInitialized(): boolean {
    return this.hasLoadedChunksList;
  }

  public async initialize() {
    const response = await fetch(this.src, MediaItem.fetchOptions);

    if (!response.ok) {
      throw new Error('failed to load the list of chunks for media item');
    }

    this.chunks = (await response.text())
      .trim()
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v != null && v.length > 0)
      .map((v) => `${this.basePath}/${v}`);

    this.hasLoadedChunksList = true;
  }

  public hasNextChunk(): boolean {
    return this.currentChunkIndex + 1 < this.chunks.length;
  }

  public async getNextChunk(): Promise<ArrayBuffer> {
    if (!this.hasLoadedChunksList) {
      throw new Error('media item is not initialized');
    }

    if (this.currentChunkIndex + 1 >= this.chunks.length) {
      throw new Error('media item has served all of its chunks');
    }

    const response = await fetch(
      this.chunks[this.currentChunkIndex + 1],
      MediaItem.fetchOptions
    );

    if (!response.ok) {
      throw new Error('failed to load the next chunk for media item');
    }

    try {
      return await response.arrayBuffer();
    } finally {
      this.currentChunkIndex++;
    }
  }
}

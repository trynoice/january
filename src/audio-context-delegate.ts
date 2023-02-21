export default class AudioContextDelegate {
  private readonly audioContext = new (AudioContext || webkitAudioContext)();

  public close(): Promise<void> {
    return this.audioContext.close();
  }

  public createGain(): GainNode {
    return this.audioContext.createGain();
  }

  public createBufferSource(): AudioBufferSourceNode {
    return this.audioContext.createBufferSource();
  }

  public currentTime(): number {
    return this.audioContext.currentTime;
  }

  public decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    return this.audioContext.decodeAudioData(audioData);
  }

  public destination(): AudioDestinationNode {
    return this.audioContext.destination;
  }

  public resume(): Promise<void> {
    return this.audioContext.resume();
  }

  public state(): AudioContextState {
    return this.audioContext.state;
  }

  public suspend(): Promise<void> {
    return this.audioContext.suspend();
  }
}

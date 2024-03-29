import { MediaPlayer, MediaPlayerState } from './media-player';

const mockGainNode = {
  connect: jest.fn(),
  gain: {
    value: 0,
    cancelScheduledValues: function () {
      return this;
    },
    setValueAtTime: function (value: number) {
      this.value = value;
      return this;
    },
    linearRampToValueAtTime: function (value: number) {
      this.value = value;
      return this;
    },
  },
};

const mockBufferSource = {
  buffer: undefined,
  addEventListener: jest.fn(),
  disconnect: jest.fn(),
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};

const mockAudioContextDelegate = {
  close: jest.fn(),
  createBufferSource: () => mockBufferSource,
  createGain: () => mockGainNode,
  currentTime: jest.fn(),
  decodeAudioData: jest.fn(),
  destination: jest.fn(),
  resume: jest.fn(),
  state: jest.fn(),
  suspend: jest.fn(),
};

const mockCdnClient = {
  getResource: jest.fn(),
};

jest.mock('./audio-context-delegate', () => {
  return function () {
    return mockAudioContextDelegate;
  };
});

test('MediaPlayer', async () => {
  const firstChunk = new Uint8Array([0, 0, 0]).buffer;
  const nextChunk = new Uint8Array([1, 1, 1]).buffer;
  const firstAudioBuffer = { duration: 0 };
  const nextAudioBuffer = { duration: 1 };

  mockAudioContextDelegate.state.mockReturnValue('suspended');
  mockAudioContextDelegate.currentTime.mockReturnValue(0.0);
  mockAudioContextDelegate.decodeAudioData
    .mockResolvedValueOnce(firstAudioBuffer)
    .mockResolvedValue(nextAudioBuffer);

  mockCdnClient.getResource
    .mockResolvedValueOnce(buildMockResponse('0000.mp3\n0001.mp3\n0002.mp3'))
    .mockResolvedValueOnce(buildMockResponse(firstChunk))
    .mockResolvedValue(buildMockResponse(nextChunk));

  const itemTransitionCb = jest.fn();
  const stateChangeCb = jest.fn();
  const player = new MediaPlayer(20, mockCdnClient);
  player.addEventListener(MediaPlayer.EVENT_ITEM_TRANSITION, itemTransitionCb);
  player.addEventListener(MediaPlayer.EVENT_STATE_CHANGE, stateChangeCb);

  expect(player.getState()).toBe(MediaPlayerState.Paused);
  await player.play();
  expect(mockAudioContextDelegate.resume).toBeCalled();
  expect(mockGainNode.gain.value).toEqual(1);
  expect(player.getState()).toBe(MediaPlayerState.Idle);
  expect(stateChangeCb).toBeCalled();

  mockAudioContextDelegate.state.mockReturnValue('running');
  player.addToPlaylist('test/index.jan');

  // not using fake timers because they're not working. Instead, exploit the
  // fact that play function enqueues the buffer loop with zero delay. So,
  // ensure that it runs before making assertions.
  await flushPromises();

  expect(mockBufferSource.buffer).toEqual(firstAudioBuffer);
  expect(mockBufferSource.start).toBeCalledWith(0.0);
  expect(player.getState()).toBe(MediaPlayerState.Playing);

  // check buffer ticker
  await waitFor(2010); // just a little more than the 2x buffer ticker
  expect(mockCdnClient.getResource).toBeCalledWith('test/0001.mp3');
  expect(mockCdnClient.getResource).toBeCalledWith('test/0002.mp3');

  mockCdnClient.getResource.mockClear();
  player.addToPlaylist('test-0/index.jan');
  player.clearPlaylist();
  await waitFor(1010); // wait for the buffer ticker to tick, if it was running
  expect(mockBufferSource.stop).toBeCalledTimes(3);
  expect(player.getMediaItemCount()).toBe(0);
  expect(mockCdnClient.getResource).not.toBeCalled();

  // check media player state and item transition event.
  // invoke ended listener all items.
  mockBufferSource.addEventListener.mock.calls.forEach((call) => call[1]());
  expect(player.getState()).toBe(MediaPlayerState.Idle);
  expect(itemTransitionCb).toBeCalledTimes(2); // start and end of the track

  // check fade callback
  const fadeCallback = jest.fn();
  player.fadeTo(0, 0.1, fadeCallback);
  mockAudioContextDelegate.currentTime.mockReturnValue(1.5);
  await flushPromises();
  expect(fadeCallback).toBeCalled();

  // check pause
  await player.pause();
  expect(mockAudioContextDelegate.suspend).toBeCalled();
  expect(player.getState()).toBe(MediaPlayerState.Paused);

  // check stop
  await player.stop();
  expect(mockAudioContextDelegate.close).toBeCalled();
  expect(player.getState()).toBe(MediaPlayerState.Stopped);
});

async function waitFor(durationMillis: number) {
  await new Promise((resolve) => setTimeout(resolve, durationMillis));
}

async function flushPromises() {
  await waitFor(0);
}

function buildMockResponse(body: unknown) {
  return {
    ok: true,
    arrayBuffer: () => body,
    text: () => body,
  };
}

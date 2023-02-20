import { MediaPlayer } from './media-player';

const mockGainNode = {
  connect: jest.fn(),
  gain: {
    value: 0,
    cancelScheduledValues: jest.fn(function () {
      return this;
    }),
    setValueAtTime: jest.fn(function (value) {
      this.value = value;
      return this;
    }),
    linearRampToValueAtTime: jest.fn(function (value) {
      this.value = value;
      return this;
    }),
  },
};

const mockBufferSource = {
  buffer: undefined,
  addEventListener: jest.fn(),
  disconnect: jest.fn(),
  connect: jest.fn(),
  start: jest.fn(),
};

const mockAudioContextDelegate = {
  close: jest.fn(),
  createBufferSource: jest.fn(() => mockBufferSource),
  createGain: jest.fn(() => mockGainNode),
  currentTime: jest.fn(),
  decodeAudioData: jest.fn(),
  destination: jest.fn(),
  resume: jest.fn(),
  state: jest.fn(),
  suspend: jest.fn(),
};

const mockDataSource = {
  load: jest.fn(),
};

const mockTextDecoder = {
  decode: jest.fn(),
};

global.TextDecoder = function () {
  return mockTextDecoder;
} as unknown as typeof TextDecoder;

jest.mock('./audio-context-delegate', () => {
  return function () {
    return mockAudioContextDelegate;
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
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

  mockTextDecoder.decode.mockReturnValueOnce('0000.mp3\n0001.mp3');
  mockDataSource.load
    .mockReturnValueOnce(new ArrayBuffer(0))
    .mockReturnValueOnce(firstChunk)
    .mockReturnValue(nextChunk);

  const mediaItemTransitionCallback = jest.fn();
  const player = new MediaPlayer(20, mockDataSource);
  player.addEventListener(
    MediaPlayer.EVENT_MEDIA_ITEM_TRANSITION,
    mediaItemTransitionCallback
  );

  player.addMediaItem('test/index.jan');
  await player.play();

  // not using fake timers because they're not working. Instead, exploit the
  // fact that play function enqueues the buffer loop as a promise without
  // a timeout. So, ensure that it runs before making assertions.
  await flushPromises();

  expect(mockAudioContextDelegate.resume).toBeCalled();
  expect(mockGainNode.gain.value).toEqual(1);
  expect(mockBufferSource.buffer).toEqual(firstAudioBuffer);
  expect(mockBufferSource.start).toBeCalledWith(0.0);

  mockAudioContextDelegate.state.mockReturnValue('running');

  // check buffer ticker
  await waitFor(1010); // just a little more than the buffer ticker
  expect(mockDataSource.load).toBeCalledWith('test/0001.mp3');

  // check media item transition event.
  const last = mockBufferSource.addEventListener.mock.lastCall;
  if (last != null) last[1]();
  expect(mediaItemTransitionCallback).toBeCalledTimes(2); // start and end of the track

  // check fade callback
  const fadeCallback = jest.fn();
  player.fadeTo(0, 0.1, fadeCallback);
  await waitFor(150);
  expect(fadeCallback).toBeCalled();

  // check pause
  await player.pause();
  expect(mockAudioContextDelegate.suspend).toBeCalled();

  // check stop
  await player.stop();
  expect(mockAudioContextDelegate.close).toBeCalled();
});

async function waitFor(durationMillis: number) {
  await new Promise((resolve) => setTimeout(resolve, durationMillis));
}

async function flushPromises() {
  await waitFor(0);
}

<p align="center">
  <a href="https://trynoice.com">
    <img alt="Noice Logo" src="https://raw.githubusercontent.com/trynoice/.github/main/graphics/icon-round.png" width="92" />
  </a>
</p>
<h1 align="center">Noice January</h1>

Common APIs used by Noice Web applications for gapless audio playback.

## How it works?

We use Web Audio APIs to support gapless playback. Since
[`BaseAudioContext.decodeAudioData()`](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
method doesn't allow decoding small chunks of an audio file individually, we
serve them from the server side as split segments alongside an index file. The
index file holds references to all chunks corresponding to an audio file. On the
client side, we read the index file first. We then read and decode individual
chunks and precisely queue them to an audio context for playback.

The following is an example of an index file.

```plain
0000.mp3
0001.mp3
0002.mp3
```

## Browser Support

- **Firefox 107**: Sometimes, a slight jitter is audible during playback
  when one chunk finishes and the next starts.
- **Google Chrome 108**: Works flawlessly.
- **Microsoft Edge 107**: Works flawlessly.

## Gapless Audio Encoding Caveats

Using FFMPEG's [`segment` or `stream_segment`
muxers](https://ffmpeg.org/ffmpeg-formats.html#segment_002c-stream_005fsegment_002c-ssegment)
to split and encode the audio files causes gaps during playback. Instead, we use
`-ss` and `-to` flags to encode individual segments of an audio file one by one.

```console
ffmpeg -y -i source.wav -c mp3 -ab 320k -ac 2 -ar 44100 -ss 0 -to 10 0000.mp3
```

## License

[GNU GPL v3](LICENSE)

<a href="https://thenounproject.com/icon/white-noise-1287855/">
  <small>White Noise icon by Juraj Sedlák</small>
</a>

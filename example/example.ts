import type CdnClient from '../src/cdn-client';
import { SoundPlayer } from '../src/sound-player';

class SimpleCdnClient implements CdnClient {
  private static readonly CDN_BASE_URL =
    process.env.NODE_ENV === 'production'
      ? 'https://cdn.trynoice.com'
      : 'https://cdn.staging.trynoice.com';

  getResource(path: string): Promise<Response> {
    return fetch(`${SimpleCdnClient.CDN_BASE_URL}/${path}`, {
      credentials: 'include',
    });
  }
}

function main() {
  const cdnClient = new SimpleCdnClient();
  ['rain', 'thunder'].forEach((soundId) => {
    const player = new SoundPlayer(cdnClient, soundId, console);
    player.addEventListener(SoundPlayer.EVENT_STATE_CHANGE, () =>
      console.info(soundId, 'state change:', player.getState())
    );

    document
      .querySelector(`#${soundId}Play`)
      ?.addEventListener('click', () => player.play());

    document
      .querySelector(`#${soundId}Pause`)
      ?.addEventListener('click', () => player.pause(false));

    document
      .querySelector(`#${soundId}Stop`)
      ?.addEventListener('click', () => player.stop(false));

    const slider: HTMLInputElement | null = document.querySelector(
      `#${soundId}Volume`
    );

    slider?.addEventListener('input', () =>
      player.setVolume(Number.parseInt(slider.value) / 25)
    );
  });
}

document.addEventListener('DOMContentLoaded', () => main());

import type CdnClient from '../src/cdn-client';
import type { Logger } from '../src/logger';
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

class SimpleLogger implements Logger {
  private static readonly LOG_LEVEL_DEBUG = 0;
  private static readonly LOG_LEVEL_INFO = 1;
  private static readonly LOG_LEVEL_WARN = 2;
  private static readonly MIN_LOG_LEVEL =
    process.env.NODE_ENV === 'production'
      ? this.LOG_LEVEL_INFO
      : this.LOG_LEVEL_DEBUG;

  public debug(message: string) {
    if (SimpleLogger.MIN_LOG_LEVEL <= SimpleLogger.LOG_LEVEL_DEBUG) {
      console.debug(message);
    }
  }

  public info(message: string) {
    if (SimpleLogger.MIN_LOG_LEVEL <= SimpleLogger.LOG_LEVEL_INFO) {
      console.info(message);
    }
  }

  public warn(message: string) {
    if (SimpleLogger.MIN_LOG_LEVEL <= SimpleLogger.LOG_LEVEL_WARN) {
      console.warn(message);
    }
  }
}

function main() {
  const cdnClient = new SimpleCdnClient();
  const logger = new SimpleLogger();
  ['rain', 'thunder'].forEach((soundId) => {
    const player = new SoundPlayer(cdnClient, soundId, logger);
    player.setFadeInSeconds(5);
    player.setFadeOutSeconds(5);
    player.addEventListener(SoundPlayer.EVENT_STATE_CHANGE, () =>
      console.info(`${soundId} state change: ${player.getState()}`)
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

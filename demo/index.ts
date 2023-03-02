import type CdnClient from '../src/cdn-client';
import type { Logger } from '../src/logger';
import { SoundPlayerManager } from '../src/sound-player-manager';

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
  const manager = new SoundPlayerManager(
    new SimpleCdnClient(),
    new SimpleLogger()
  );

  manager.setFadeInSeconds(5);
  manager.setFadeOutSeconds(5);
  manager.addEventListener(SoundPlayerManager.EVENT_STATE_CHANGE, () =>
    console.info(`manager state change: ${manager.getState()}`)
  );

  document
    .querySelector('#managerResume')
    ?.addEventListener('click', () => manager.resume());

  document
    .querySelector('#managerPause')
    ?.addEventListener('click', () => manager.pause());

  document
    .querySelector('#managerStop')
    ?.addEventListener('click', () => manager.stopAll());

  document
    .querySelector('#managerVolume')
    ?.addEventListener('input', (event) => {
      if (event.target instanceof HTMLInputElement) {
        manager.setMasterVolume(event.target.valueAsNumber);
      }
    });

  ['rain', 'thunder'].forEach((soundId) => {
    let playerState = manager.getPlayerState(soundId);
    manager.addEventListener(SoundPlayerManager.EVENT_STATE_CHANGE, () => {
      if (playerState !== manager.getPlayerState(soundId)) {
        playerState = manager.getPlayerState(soundId);
        console.info(`${soundId} state change: ${playerState}`);
      }
    });

    document
      .querySelector(`#${soundId}Play`)
      ?.addEventListener('click', () => manager.play(soundId));

    document
      .querySelector(`#${soundId}Stop`)
      ?.addEventListener('click', () => manager.stop(soundId));

    document
      .querySelector(`#${soundId}Volume`)
      ?.addEventListener('input', (event) => {
        if (event.target instanceof HTMLInputElement) {
          manager.setVolume(soundId, event.target.valueAsNumber);
        }
      });
  });
}

document.addEventListener('DOMContentLoaded', () => main());

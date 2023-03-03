import type CdnClient from '../src/cdn-client';
import { ConsoleLogger, ConsoleLogLevel } from '../src/logger';
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

function main() {
  const manager = new SoundPlayerManager(
    new SimpleCdnClient(),
    new ConsoleLogger(
      process.env.NODE_ENV === 'production'
        ? ConsoleLogLevel.Info
        : ConsoleLogLevel.Debug
    )
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
    ?.addEventListener('click', () => manager.stopAll(false));

  document
    .querySelector('#managerVolume')
    ?.addEventListener('input', (event) => {
      if (event.target instanceof HTMLInputElement) {
        manager.setMasterVolume(event.target.valueAsNumber);
      }
    });

  ['rain', 'thunder'].forEach((soundId) => {
    manager.addPlayerStateChangeListener(soundId, () =>
      console.log(`${soundId} state change: ${manager.getPlayerState(soundId)}`)
    );

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

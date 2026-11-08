import { XRDevice, metaQuest3 } from 'iwer';
import { SyntheticEnvironmentModule } from '@iwer/sem';

/**
 * Installs Meta's IWER Quest 3 emulator in place of navigator.xr, plus a
 * synthetic room that plays the role of passthrough. Dev/test only (?emu).
 * Optional ?room=<id> picks the room (default music_studio).
 */
export async function installEmulator(): Promise<XRDevice> {
  const device = new XRDevice(metaQuest3);
  device.installRuntime({ forceInstall: true });
  device.installSEM(SyntheticEnvironmentModule);
  device.primaryInputMode = 'hand';
  device.stereoEnabled = false;
  const room = new URLSearchParams(location.search).get('room') ?? 'music_studio';
  try {
    await device.sem?.loadDefaultEnvironment(room);
  } catch (err) {
    console.warn('SEM room failed to load', err);
  }
  (window as unknown as { xrdevice: XRDevice }).xrdevice = device;
  return device;
}

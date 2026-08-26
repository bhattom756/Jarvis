import type { DeviceIdentity } from "@jarvis/shared-types";

export function createDeviceIdentity(label: string, platform: DeviceIdentity["platform"]): DeviceIdentity {
  return {
    deviceId: crypto.randomUUID(),
    publicKey: "unpaired",
    label,
    platform,
    createdAt: new Date().toISOString(),
  };
}

export function isTrustedDevice(identity: DeviceIdentity | null | undefined): identity is DeviceIdentity {
  return Boolean(identity?.deviceId && identity.publicKey && identity.publicKey !== "unpaired");
}

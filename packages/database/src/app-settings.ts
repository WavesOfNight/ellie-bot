import { prisma } from "./client.js";

const SINGLETON_ID = 1;
export const COMMUNITY_NAME_MAX_LENGTH = 60;

export interface AppSettingsData {
  communityName: string;
}

export async function getAppSettings(): Promise<AppSettingsData> {
  const settings = await prisma.appSettings.findUnique({ where: { id: SINGLETON_ID } });
  return { communityName: settings?.communityName ?? "" };
}

export async function saveCommunityName(communityName: string): Promise<void> {
  const value = communityName.trim().slice(0, COMMUNITY_NAME_MAX_LENGTH);
  await prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, communityName: value },
    update: { communityName: value },
  });
}

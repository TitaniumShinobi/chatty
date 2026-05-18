import doorContract from "../../config/chatty-vvault-doors.json";

type DoorName = "private" | "public";

type DoorContract = {
  version: number;
  doors: Record<
    DoorName,
    {
      name: DoorName;
      chattyPublicOrigin: string;
      chattyApiOrigin: string;
      vvaultOrigin: string;
      authApiOrigin: string;
      authPublicOrigin: string;
      authCookieName: string;
      sessionBridgePath: string;
      allowedBrowserOrigins: string[];
      allowLegacyExchange: boolean;
    }
  >;
};

const contract = doorContract as DoorContract;

export function resolveClientDoorName(): DoorName {
  const explicit = String(import.meta.env.VITE_CHATTY_VVAULT_DOOR || "").trim();
  if (explicit === "private" || explicit === "public") return explicit;
  return import.meta.env.PROD ? "public" : "private";
}

export function resolveClientDoorContract() {
  return contract.doors[resolveClientDoorName()];
}

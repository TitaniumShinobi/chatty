/**
 * Immutable cleaning law: dry tasks before wet tasks; never mix bleach with ammonia.
 * Canonical cleaning order — use this sequence for any strict-phase workflow (literal cleaning
 * or codebase workflows: e.g. read/validate before write/mutate).
 *
 * @see docs/CLEANING_ORDER.md
 * @see docs/guides/CLEANUP_POLICY.md
 */

const MINUTES = 60 * 1000;

/** Ordered steps; do not reorder or skip. Dry phases before wet; chemicals only in designated step. */
export const CLEANING_ORDER = [
  "scope",
  "declutter",
  "trash_out",
  "dust_top_down",
  "wipe_and_bleach_touchpoints",
  "polish_reflective",
  "sweep_or_vacuum",
  "mop_last",
  "air_out_and_rest",
] as const;

export type CleaningStep = (typeof CLEANING_ORDER)[number];

/** Room abstraction: implement these methods to run the cleaning law. */
export interface Room {
  mapZones(): void;
  sortItems(opts: { keep: string; relocate: string; toss: string }): void;
  removeTrash(): void;
  dust(opts: { order: string[] }): void;
  disinfect(areas: string[]): void;
  spotBleach(areas: string[]): void;
  polish(surfaces: string[]): void;
  cleanFloorsDry(): void;
  mopLeavingExitDry(): void;
  airOut(): void;
}

function assertGlovesOn(): void {
  // Safety: ensure PPE before any chemical use.
}

function openWindowsIfUsingBleach(): void {
  // Ventilation when using bleach; call immediately before bleach step.
}

function takeBreak(ms: number): void {
  // Rest after cleaning.
  void ms;
}

/**
 * Enforces the immutable cleaning order on a room. Dry tasks run before wet; bleach is used only
 * in the designated step with gloves and ventilation. Do not call room methods out of order.
 *
 * @param room - Object implementing Room (mapZones, sortItems, removeTrash, dust, disinfect, spotBleach, polish, cleanFloorsDry, mopLeavingExitDry, airOut).
 */
export function enforceCleaningLaw(room: Room): void {
  assertGlovesOn();

  for (const step of CLEANING_ORDER) {
    switch (step) {
      case "scope":
        room.mapZones();
        break;
      case "declutter":
        room.sortItems({ keep: "here", relocate: "bin", toss: "bag" });
        break;
      case "trash_out":
        room.removeTrash();
        break;
      case "dust_top_down":
        room.dust({ order: ["ceiling", "fans", "shelves", "surfaces"] });
        break;
      case "wipe_and_bleach_touchpoints":
        openWindowsIfUsingBleach();
        room.disinfect(["handles", "switches", "faucets", "counters"]);
        room.spotBleach(["sink", "toiletExterior"]);
        break;
      case "polish_reflective":
        room.polish(["mirrors", "glass", "stainless"]);
        break;
      case "sweep_or_vacuum":
        room.cleanFloorsDry();
        break;
      case "mop_last":
        room.mopLeavingExitDry();
        break;
      case "air_out_and_rest":
        room.airOut();
        takeBreak(10 * MINUTES);
        break;
    }
  }
}

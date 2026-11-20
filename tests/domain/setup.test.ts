import { describe, expect, it } from "vitest";
import { isSetupComplete, nextSetupStep } from "@/domain/setup";

/**
 * The basics a performer saves before the dashboard treats the account as set
 * up. The dashboard card, the wizard's resume point and the routing after
 * sign-in all read this one rule, so each boundary is pinned here.
 */
const today = new Date("2026-11-19T12:00:00Z");
const adult = new Date("1995-04-02T00:00:00Z");
const done = { stageName: "Maya Okafor", birthDate: adult, specialtiesCount: 1 };

describe("nextSetupStep", () => {
  it("starts at identity when nothing was saved", () => {
    expect(nextSetupStep(null, today)).toBe("identity");
    expect(nextSetupStep(undefined, today)).toBe("identity");
    // ensureArtistProfile creates the row with an empty stage name.
    expect(nextSetupStep({ stageName: "", birthDate: null, specialtiesCount: 0 }, today)).toBe(
      "identity"
    );
  });

  it("keeps identity open until there is a stage name and an adult date of birth", () => {
    expect(nextSetupStep({ ...done, stageName: " M " }, today)).toBe("identity");
    expect(nextSetupStep({ ...done, birthDate: null }, today)).toBe("identity");
    // 17 today, 18 tomorrow.
    const almost = new Date("2008-11-20T00:00:00Z");
    expect(nextSetupStep({ ...done, birthDate: almost }, today)).toBe("identity");
    expect(nextSetupStep({ ...done, birthDate: new Date("2008-11-19T00:00:00Z") }, today)).toBe(null);
  });

  it("then asks for at least one specialty", () => {
    expect(nextSetupStep({ ...done, specialtiesCount: 0 }, today)).toBe("profile");
  });

  it("is finished with the two steps: no agreement is part of it", () => {
    expect(nextSetupStep(done, today)).toBeNull();
    expect(isSetupComplete(done, today)).toBe(true);
    expect(isSetupComplete({ ...done, specialtiesCount: 0 }, today)).toBe(false);
  });

  it("reports identity first when both steps are missing", () => {
    expect(nextSetupStep({ stageName: "", birthDate: null, specialtiesCount: 0 }, today)).toBe(
      "identity"
    );
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isOfficialMarketingHost } from "./public-host";

describe("isOfficialMarketingHost", () => {
  it.each(["morechat.co", "www.morechat.co", "MULTICA.AI", "morechat.co."])(
    "recognizes %s as an official marketing host",
    (host) => {
      expect(isOfficialMarketingHost(host)).toBe(true);
    },
  );

  it.each(["app.morechat.co", "api.morechat.co", "localhost", "multica.test"])(
    "does not treat %s as the public marketing host",
    (host) => {
      expect(isOfficialMarketingHost(host)).toBe(false);
    },
  );
});

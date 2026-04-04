import { describe, expect, it } from "vitest";
import rolesPlugin, {
  canModifyRole,
  checkSenderRole,
  getEntityRole,
  normalizeRole,
  resolveWorldForMessage,
  ROLE_RANK,
  rolesProvider,
  setEntityRole,
  updateRoleAction,
} from "../src/index";
import type {
  ConnectorAdminWhitelist,
  RoleCheckResult,
  RoleName,
  RolesPluginConfig,
  RolesWorldMetadata,
} from "../src/index";

describe("exports", () => {
  it("default export is the plugin object", () => {
    expect(rolesPlugin).toBeDefined();
    expect(rolesPlugin.name).toBe("@miladyai/plugin-roles");
    expect(typeof rolesPlugin.init).toBe("function");
    expect(Array.isArray(rolesPlugin.providers)).toBe(true);
    expect(Array.isArray(rolesPlugin.actions)).toBe(true);
  });

  it("named exports are functions", () => {
    expect(typeof canModifyRole).toBe("function");
    expect(typeof checkSenderRole).toBe("function");
    expect(typeof getEntityRole).toBe("function");
    expect(typeof normalizeRole).toBe("function");
    expect(typeof resolveWorldForMessage).toBe("function");
    expect(typeof setEntityRole).toBe("function");
  });

  it("exports provider and action", () => {
    expect(rolesProvider.name).toBe("roles");
    expect(updateRoleAction.name).toBe("UPDATE_ROLE");
  });

  it("exports ROLE_RANK with 4-level hierarchy", () => {
    expect(ROLE_RANK.OWNER).toBe(3);
    expect(ROLE_RANK.ADMIN).toBe(2);
    expect(ROLE_RANK.USER).toBe(1);
    expect(ROLE_RANK.GUEST).toBe(0);
  });

  it("type exports compile", () => {
    const _role: RoleName = "USER";
    const _meta: RolesWorldMetadata = { roles: {} };
    const _config: RolesPluginConfig = { connectorAdmins: { discord: [] } };
    const _whitelist: ConnectorAdminWhitelist = { telegram: ["123"] };
    expect(true).toBe(true);
  });
});

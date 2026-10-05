import { hasPermission, type AccessPrincipal } from "@airmech/contracts";
import { ROLE_PERMISSION_BASELINE, type PermissionCode } from "./permission-baseline.js";

/** These facts must come from trusted repository relationships, never request bodies. */
export interface RecordFacts {
  readonly resource:
    | "profile"
    | "customer"
    | "contact"
    | "site"
    | "enquiry"
    | "quotation"
    | "project"
    | "asset"
    | "warranty"
    | "complaint"
    | "schedule"
    | "workorder"
    | "service_report"
    | "amc"
    | "pm"
    | "document"
    | "report";
  readonly ownerUserId?: string;
  readonly assignedUserIds?: readonly string[];
  readonly projectUserIds?: readonly string[];
  readonly serviceRelated?: boolean;
  readonly commercialRelated?: boolean;
  readonly inventoryRelated?: boolean;
  readonly fieldUseAllowed?: boolean;
  readonly limitedCustomerFieldsAllowed?: boolean;
}

export function canAccessRecord(
  principal: AccessPrincipal | null,
  permission: PermissionCode,
  facts: RecordFacts,
): boolean {
  if (!hasPermission(principal, permission) || principal === null) return false;
  if (permission.split(".")[0] !== facts.resource) return false;
  const userId = principal.user.id;
  const own = facts.ownerUserId === userId;
  const assigned = facts.assignedUserIds?.includes(userId) === true;
  for (const role of principal.roles) {
    if (!ROLE_PERMISSION_BASELINE[role]?.includes(permission)) continue;
    if (!principal.rolePermissions?.[role]?.includes(permission)) continue;
    if (role === "super_admin" || role === "management") return true;
    if (facts.resource === "profile") {
      if (own) return true;
      continue;
    }
    if (role === "engineer") {
      if (["schedule", "report"].includes(facts.resource)) {
        if (own) return true;
        continue;
      }
      if (["enquiry", "quotation", "project"].includes(facts.resource)) continue;
      if (facts.resource === "document" && !facts.fieldUseAllowed) continue;
      if (assigned && (facts.resource !== "service_report" || own)) return true;
      continue;
    }
    if (role === "project_manager") {
      if (facts.projectUserIds?.includes(userId)) return true;
      continue;
    }
    if (role === "store") {
      if (facts.inventoryRelated) return true;
      continue;
    }
    if (role === "service_manager") {
      if (facts.resource === "quotation" && !facts.serviceRelated) continue;
      if (facts.resource === "project" && !facts.serviceRelated) continue;
      if (permission === "customer.write" && !facts.limitedCustomerFieldsAllowed) continue;
      if (["document", "report"].includes(facts.resource) && !facts.serviceRelated) continue;
      return true;
    }
    if (role === "sales_admin" || role === "accounts") {
      if (["document", "report"].includes(facts.resource) && !facts.commercialRelated) continue;
      return true;
    }
  }
  return false;
}

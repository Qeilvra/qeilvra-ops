export interface CustomerProfile {
  readonly id: string;
  readonly customerCode: string;
  readonly companyName: string;
  readonly primaryContactId: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly status: "active" | "inactive";
  readonly archivedAt: string | null;
}

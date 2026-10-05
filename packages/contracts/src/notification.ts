export interface NotificationRecord {
  readonly id: string;
  readonly recipientId: string;
  readonly channel: "in_app" | "email";
  readonly title: string;
  readonly message: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
}

import type { AuthService } from "../auth/auth.service.js";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { requireUserId } from "../users/user-admin.service.js";

export class NotificationService {
  constructor(private readonly auth: AuthService) {}

  async list(userId: string, page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new BadRequestException();
    const rows = await this.auth.databaseClient.query<{
      id: string;
      title: string;
      message: string;
      read_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id,title,message,read_at,created_at FROM airmech.notifications
       WHERE recipient_id=$1 AND channel='in_app'
       ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET $2`,
      [userId, (page - 1) * 25],
    );
    return { items: rows.slice(0, 25), page, hasMore: rows.length > 25 };
  }

  async markRead(userId: string, id: string): Promise<void> {
    requireUserId(id);
    const rows = await this.auth.databaseClient.query(
      `UPDATE airmech.notifications SET read_at=COALESCE(read_at,now())
       WHERE id=$1 AND recipient_id=$2 AND channel='in_app' RETURNING id`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException();
  }
}

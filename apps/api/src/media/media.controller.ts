import { Controller, HttpCode, Param, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { StorageService } from "../common/storage.service.js";

/**
 * Where the browser sends a photo, at the signed address the back office got for it. No sign-in: the signed
 * address is the permission, for one file, for a few minutes (as a cloud bucket's signed upload works).
 */
@Controller("media")
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Put("upload/:token")
  @HttpCode(200)
  upload(@Param("token") token: string, @Req() req: Request) {
    const length = Number(req.headers["content-length"]);
    return this.storage.receive(token, req.headers["content-type"] ?? "", req, Number.isFinite(length) ? length : undefined);
  }
}

import { Module } from "@nestjs/common";
import { StorageService } from "../common/storage.service.js";
import { MediaController } from "./media.controller.js";

@Module({ controllers: [MediaController], providers: [StorageService] })
export class MediaModule {}

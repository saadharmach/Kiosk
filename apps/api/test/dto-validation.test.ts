import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { CreateRestaurantDto } from "../src/admin/dto/create-restaurant.dto.js";
import { UpdateRestaurantDto } from "../src/admin/dto/update-restaurant.dto.js";
import { CreateRestaurantUserDto, UpdateRestaurantUserDto } from "../src/admin/dto/restaurant-user.dto.js";
import { UpsertTpapiDto } from "../src/admin/dto/upsert-tpapi.dto.js";

/** The API's own validation (main.ts): a property with no validator is refused, not ignored. */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const check = (metatype: new () => object, value: unknown) => pipe.transform(value, { type: "body", metatype });
const refused = async (metatype: new () => object, value: unknown) => {
  await assert.rejects(check(metatype, value));
};

describe("the bodies the platform screens send are accepted by the API's validation", () => {
  it("a restaurant can be created", async () => {
    await check(CreateRestaurantDto, { slug: "chez-sam", name: "Chez Sam", currency: "MAD", locale: "fr", country: "MA", primaryColor: "#f59e0b", contactEmail: "a@b.co" });
  });

  it("every editable field of a restaurant can be changed, including its status", async () => {
    await check(UpdateRestaurantDto, {
      name: "New name", currency: "EUR", timezone: "Europe/Paris", locale: "en", contactEmail: "a@b.co", contactPhone: "+212 600",
      addressLine: "1 rue X", city: "Rabat", country: "MA", primaryColor: "#112233", status: "SUSPENDED",
    });
    await check(UpdateRestaurantDto, { status: "ACTIVE" });
    await check(UpdateRestaurantDto, {});
  });

  it("but not the slug, an unknown status, or a field that does not exist", async () => {
    await refused(UpdateRestaurantDto, { slug: "other" });
    await refused(UpdateRestaurantDto, { status: "DELETED" });
    await refused(UpdateRestaurantDto, { colour: "#fff" });
    await refused(UpdateRestaurantDto, { name: "x" });
  });

  it("a restaurant user can be added and changed", async () => {
    await check(CreateRestaurantUserDto, { email: "a@b.co", role: "MANAGER", fullName: "Sam" });
    await check(UpdateRestaurantUserDto, { isActive: false });
    await check(UpdateRestaurantUserDto, { role: "STAFF", fullName: "Sam B" });
    await refused(CreateRestaurantUserDto, { email: "a@b.co", role: "ROOT" });
    await refused(UpdateRestaurantUserDto, { email: "new@b.co" });
    await refused(UpdateRestaurantUserDto, { passwordHash: "x" });
  });

  it("the unTill connection form is accepted, with or without new credentials", async () => {
    await check(UpsertTpapiDto, { host: "pos.example.com", port: 443, useTls: true, isEnabled: true });
    await check(UpsertTpapiDto, { host: "10.0.0.5", port: 8080, appName: "Kiosk", userName: "u", password: "p", appToken: "t" });
    await refused(UpsertTpapiDto, { host: "bad host!", port: 443 });
  });
});

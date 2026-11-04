import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { CreateRestaurantDto } from "../src/admin/dto/create-restaurant.dto.js";
import { UpdateRestaurantDto } from "../src/admin/dto/update-restaurant.dto.js";
import { CreateRestaurantUserDto, UpdateRestaurantUserDto } from "../src/admin/dto/restaurant-user.dto.js";
import { UpsertTpapiDto } from "../src/admin/dto/upsert-tpapi.dto.js";
import { CreateTeamMemberDto, UpdateTeamMemberDto } from "../src/admin/dto/team.dto.js";
import { ChangePasswordDto } from "../src/auth/dto/change-password.dto.js";
import { RestaurantLoginDto } from "../src/restaurant-auth/dto/restaurant-login.dto.js";
import { RestaurantForgotPasswordDto } from "../src/auth/dto/forgot-password.dto.js";
import { AcceptInviteDto } from "../src/auth/dto/accept-invite.dto.js";

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

  it("the address can be sent, but only in the shape a public URL needs", async () => {
    await check(UpdateRestaurantDto, { slug: "chez-sam-2" });
    for (const bad of ["Chez Sam", "UPPER", "-x", "x-", "a/b", "é", ""]) await refused(UpdateRestaurantDto, { slug: bad });
  });

  it("but not an unknown status, or a field that does not exist", async () => {
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

  it("a team member can be added and changed, and a new password must be at least 12 characters", async () => {
    await check(CreateTeamMemberDto, { email: "a@b.co", role: "SUPPORT", fullName: "Sam" });
    await check(UpdateTeamMemberDto, { isActive: false });
    await check(UpdateTeamMemberDto, { role: "SUPER_ADMIN", fullName: "Sam B" });
    await refused(CreateTeamMemberDto, { email: "a@b.co", role: "OWNER" });
    await refused(UpdateTeamMemberDto, { email: "new@b.co" });
    await refused(UpdateTeamMemberDto, { passwordHash: "x" });
    await check(ChangePasswordDto, { currentPassword: "x", newPassword: "twelve-chars!" });
    await refused(ChangePasswordDto, { currentPassword: "x", newPassword: "eleven-char" });
  });

  it("choosing a password from an invitation link needs 12+ characters and nothing extra", async () => {
    await check(AcceptInviteDto, { token: "t".repeat(43), password: "twelve-chars!" });
    await refused(AcceptInviteDto, { token: "t".repeat(43), password: "eleven-char" });
    await refused(AcceptInviteDto, { token: "t".repeat(43), password: "twelve-chars!", userId: "someone-else" });
  });
});

describe("the restaurant address typed at sign-in is not case sensitive", () => {
  it("a capitalised or padded address still signs in, as the lowercase one", async () => {
    const got = (await check(RestaurantLoginDto, { slug: " Resto-A ", email: "a@b.co", password: "long-enough-1" })) as { slug: string };
    assert.equal(got.slug, "resto-a");
  });
  it("the same for Forgot password", async () => {
    const got = (await check(RestaurantForgotPasswordDto, { slug: "Resto-A", email: "a@b.co" })) as { slug: string };
    assert.equal(got.slug, "resto-a");
  });
  it("a really invalid address is still refused", async () => {
    await refused(RestaurantLoginDto, { slug: "resto a!", email: "a@b.co", password: "long-enough-1" });
    await refused(RestaurantLoginDto, { slug: 12, email: "a@b.co", password: "long-enough-1" });
  });
});

import { IsEnum, IsOptional } from "class-validator";
import { CreateRestaurantDto } from "./create-restaurant.dto.js";

/** Everything optional, and the slug can never change: it is a public URL. */
export class UpdateRestaurantDto implements Partial<Omit<CreateRestaurantDto, "slug">> {
  name?: string;
  currency?: string;
  timezone?: string;
  locale?: string;
  contactEmail?: string;
  contactPhone?: string;
  addressLine?: string;
  city?: string;
  country?: string;
  primaryColor?: string;

  @IsOptional()
  @IsEnum(["ACTIVE", "SUSPENDED", "ARCHIVED"])
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}
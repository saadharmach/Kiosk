import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";
import { CatalogAdminService } from "./catalog-admin.service.js";
import {
  SetAllergensDto,
  UpdateCategoryPresentationDto,
  UpdateProductPresentationDto,
  SignImageUploadDto,
} from "./dto/presentation.dto.js";

interface TenantCtx { restaurantId: string; slug: string }

@Controller("restaurant/:slug/catalog")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogAdminService) {}

  @Get("products")
  listProducts(
    @Tenant() tenant: TenantCtx,
    @Query("categoryId") categoryId?: string,
    @Query("search") search?: string,
    @Query("missing") missing?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.catalog.listProducts(tenant.restaurantId, { categoryId, search, missing, page, pageSize });
  }

  @Patch("products/:articleId")
  updateProduct(
    @Tenant() tenant: TenantCtx,
    @Param("articleId") articleId: string,
    @Body() dto: UpdateProductPresentationDto,
  ) {
    return this.catalog.upsertProduct(tenant.restaurantId, articleId, dto);
  }

  @Get("categories")
  listCategories(@Tenant() tenant: TenantCtx) {
    return this.catalog.listCategories(tenant.restaurantId);
  }

  @Patch("categories/:scope/:untillId")
  updateCategory(
    @Tenant() tenant: TenantCtx,
    @Param("scope") scope: string,
    @Param("untillId") untillId: string,
    @Body() dto: UpdateCategoryPresentationDto,
  ) {
    const s = scope.toUpperCase();
    if (s !== "GROUP" && s !== "DEPARTMENT") {
      throw new BadRequestException("scope must be GROUP or DEPARTMENT");
    }
    return this.catalog.upsertCategory(tenant.restaurantId, s, untillId, dto);
  }

  @Get("allergens")
  listAllergens(@Tenant() tenant: TenantCtx) {
    return this.catalog.listAllergens(tenant.restaurantId);
  }

  @Put("products/:articleId/allergens")
  setAllergens(
    @Tenant() tenant: TenantCtx,
    @Param("articleId") articleId: string,
    @Body() dto: SetAllergensDto,
  ) {
    return this.catalog.setAllergens(tenant.restaurantId, articleId, dto.allergenIds);
  }
    @Post("products/:articleId/image/sign")
  @HttpCode(200)
  signProductImage(
    @Tenant() tenant: TenantCtx,
    @Param("articleId") articleId: string,
    @Body() dto: SignImageUploadDto,
  ) {
    return this.catalog.signProductImage(tenant.restaurantId, articleId, dto.contentType);
  }

  @Delete("products/:articleId/image")
  clearProductImage(@Tenant() tenant: TenantCtx, @Param("articleId") articleId: string) {
    return this.catalog.clearProductImage(tenant.restaurantId, articleId);
  }
}
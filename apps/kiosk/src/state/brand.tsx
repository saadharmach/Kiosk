"use client";

import { createContext, useContext } from "react";

/** The restaurant's own artwork, available to every screen without prop-drilling. */
export interface Brand {
  logoUrl: string | null;
}

export const BrandContext = createContext<Brand>({ logoUrl: null });
export const useBrand = () => useContext(BrandContext);

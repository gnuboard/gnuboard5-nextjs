import { cache } from "react";
import { getShopCategories } from "@/services/shop";

export const getCachedShopCategories = cache((revalidate = 300) =>
  getShopCategories(revalidate)
);

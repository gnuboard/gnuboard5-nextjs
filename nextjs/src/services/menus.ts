import { apiUrl } from "@/lib/config";
import { fetchApiData } from "@/lib/api-response";
import { menuItemListSchema } from "@/lib/schemas";
import type { MenuItem } from "@/components/layout/menu";

export function getMenuItems(): Promise<MenuItem[]> {
  return fetchApiData(apiUrl("/menus"), menuItemListSchema, [], {
    next: { revalidate: 300 },
  });
}

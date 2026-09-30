import {
  Archive,
  Bed,
  Bike,
  Bookmark,
  Box,
  Camera,
  CircleDot,
  Coffee,
  Gem,
  Gift,
  Globe,
  Heart,
  Home,
  LayoutGrid,
  Leaf,
  Lightbulb,
  MessagesSquare,
  Monitor,
  Music,
  Paperclip,
  PawPrint,
  Pencil,
  Puzzle,
  ShoppingBag,
  Shuffle,
  Star,
  Sun,
  Tag,
  Target,
  TreePine,
  Utensils,
  Wand2,
  type LucideIcon,
} from "lucide-react";

/*
 * 분류 칩의 아이콘. 레퍼런스 theme_functions.php 의 solune_shop_category_icon()
 * 을 옮긴 것이다 — 분류 코드 앞 두 자리로 고르고, 그 아이콘을 이미 썼으면
 * 코드의 해시에서 출발해 남은 것 중 하나를 고른다. 한 줄 안에서 같은 그림이
 * 두 번 나오지 않는다.
 */
const PRIMARY_ICONS: Record<string, LucideIcon> = {
  "10": Monitor,
  "20": Utensils,
  "30": Pencil,
  "40": Home,
  "50": Coffee,
  "60": Bed,
  "70": ShoppingBag,
  "80": Gift,
  "90": Heart,
  a0: PawPrint,
  b0: Lightbulb,
  c0: Star,
};

const FALLBACK_ICONS: LucideIcon[] = [
  Tag,
  Box,
  Leaf,
  Bookmark,
  Target,
  Wand2,
  Globe,
  Puzzle,
  LayoutGrid,
  CircleDot,
  Gem,
  Shuffle,
  Sun,
  Paperclip,
  MessagesSquare,
  Archive,
  Camera,
  Music,
  TreePine,
  Bike,
];

function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) >>> 0;
  }
  return value;
}

/** 분류 목록 순서대로 아이콘을 배정한다. 반환 배열은 입력과 같은 길이다. */
export function assignCategoryIcons(categoryIds: string[]): LucideIcon[] {
  const used = new Set<LucideIcon>();

  return categoryIds.map((caId) => {
    const key = caId.replace(/[^0-9a-z]/gi, "").slice(0, 2).toLowerCase();
    const primary = PRIMARY_ICONS[key];
    let icon: LucideIcon | undefined = primary && !used.has(primary) ? primary : undefined;

    if (!icon) {
      const start = hash(key) % FALLBACK_ICONS.length;
      for (let offset = 0; offset < FALLBACK_ICONS.length; offset += 1) {
        const candidate = FALLBACK_ICONS[(start + offset) % FALLBACK_ICONS.length];
        if (!used.has(candidate)) {
          icon = candidate;
          break;
        }
      }
      icon = icon ?? FALLBACK_ICONS[start];
    }

    used.add(icon);
    return icon;
  });
}

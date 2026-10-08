import { expect, test } from "@playwright/test";
import type { ShopProductOption } from "../src/lib/shop-types";
import {
  OPTION_SEPARATOR,
  baseOptionLabel,
  optionPriceSuffix,
  reviewImageUrls,
  supplyOptionGroups,
  supplyOptionLabel,
} from "../src/components/shop/productDetailHelpers";
import { formatCartOption } from "../src/lib/utils";

/*
 * 상품 옵션 고르기의 글자 · 묶음 — 영카트 lib/shop.lib.php(get_item_options · get_item_supply)와
 * js/shop.js(sel_option_process · sel_supply_process)가 만드는 것과 같아야 한다.
 */

function supply(subject: string, value: string, price = 0, stock = 10): ShopProductOption {
  return {
    io_no: 0,
    it_id: "P1",
    io_id: `${subject}${OPTION_SEPARATOR}${value}`,
    io_type: "1",
    io_value: "",
    io_price: price,
    io_stock_qty: stock,
    io_use: 1,
  };
}

test("추가옵션은 항목마다 묶고, 항목 순서는 it_supply_subject 를 따른다", () => {
  const options = [supply("포장", "선물", 3000), supply("보증", "1년"), supply("포장", "기본"), supply("보증", "3년", 12000)];
  const groups = supplyOptionGroups("보증,포장", options);
  expect(groups.map((group) => group.subject)).toEqual(["보증", "포장"]);
  expect(groups[0].options.map((option) => option.io_id)).toEqual([`보증${OPTION_SEPARATOR}1년`, `보증${OPTION_SEPARATOR}3년`]);
  expect(groups[1].options).toHaveLength(2);
});

test("항목 이름에 없는 추가옵션 · 값이 빈 추가옵션은 영카트처럼 보이지 않는다", () => {
  const stray = { ...supply("x", "y"), io_id: "다른항목" + OPTION_SEPARATOR + "값" } as ShopProductOption;
  const empty = { ...supply("보증", ""), io_id: "보증" + OPTION_SEPARATOR } as ShopProductOption;
  const groups = supplyOptionGroups("보증,없는항목", [supply("보증", "1년"), stray, empty]);
  expect(groups.map((group) => group.subject)).toEqual(["보증"]);
  expect(groups[0].options).toHaveLength(1);
  expect(supplyOptionGroups("", [supply("보증", "1년")])).toEqual([]);
});

test("옵션 값 뒤 금액 글자는 영카트와 같다 — 0원도 '+ 0원'", () => {
  expect(optionPriceSuffix(0)).toBe("  + 0원");
  expect(optionPriceSuffix(5900)).toBe("  + 5,900원");
  expect(optionPriceSuffix(-1000)).toBe("  -1,000원");
});

test("장바구니 · 주문 줄의 옵션 글자 — 옵션 없는 줄(ct_option = 상품명)은 빈 글자, 예전 io_id 원문은 ' / '", () => {
  expect(formatCartOption("색상:실버 / 높이:1단", "스탠드")).toBe("색상:실버 / 높이:1단");
  expect(formatCartOption("스탠드", "스탠드")).toBe("");
  expect(formatCartOption(" 스탠드 ", "스탠드")).toBe("");
  expect(formatCartOption("스탠드")).toBe("스탠드");
  expect(formatCartOption(`실버${OPTION_SEPARATOR}1단`, "스탠드")).toBe("실버 / 1단");
  expect(formatCartOption("", "스탠드")).toBe("");
});

test("고른 옵션 줄 이름은 영카트 io_value 와 같다", () => {
  expect(baseOptionLabel(["색상", "높이"], `실버${OPTION_SEPARATOR}1단`)).toBe("색상:실버 / 높이:1단");
  expect(baseOptionLabel(["색상"], "실버")).toBe("색상:실버");
  expect(supplyOptionLabel(`전용 액세서리${OPTION_SEPARATOR}노트북 파우치`)).toBe("전용 액세서리:노트북 파우치");
});

test("후기 본문의 사진 주소는 올린 차례로 한 번씩, data: 와 빈 주소는 뺀다", () => {
  const html = [
    '<p>좋아요</p><p><img src="/data/editor/a.jpg" alt=""></p>',
    "<img alt='' src='https://example.com/b.png?w=1&amp;h=2'>",
    '<img src="/data/editor/a.jpg">',
    '<img src="data:image/png;base64,AAAA">',
    '<img src="">',
    '<IMG SRC="/data/editor/c.webp" />',
  ].join("");
  expect(reviewImageUrls(html)).toEqual([
    "/data/editor/a.jpg",
    "https://example.com/b.png?w=1&h=2",
    "/data/editor/c.webp",
  ]);
  expect(reviewImageUrls("<p>사진 없는 후기</p>")).toEqual([]);
});

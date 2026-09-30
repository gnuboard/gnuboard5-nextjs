import {
  calculateCouponDiscount,
  type MyCoupon,
} from "./orderPricingHelpers";

type BuildCouponPreviewInput = {
  myCoupons: MyCoupon[];
  selectedCouponId: string;
  selectedSendCouponId: string;
  orderCouponBase: number;
  shippingCost: number;
};

export function buildCouponPreview({
  myCoupons,
  selectedCouponId,
  selectedSendCouponId,
  orderCouponBase,
  shippingCost,
}: BuildCouponPreviewInput) {
  const orderCoupons = myCoupons.filter((coupon) => coupon.cp_method === 2);
  const sendCoupons = myCoupons.filter((coupon) => coupon.cp_method === 3);
  const selectedCoupon = orderCoupons.find(
    (coupon) => coupon.cp_id === selectedCouponId
  );
  const selectedSendCoupon = sendCoupons.find(
    (coupon) => coupon.cp_id === selectedSendCouponId
  );
  const couponDiscount = calculateCouponDiscount(
    selectedCoupon,
    orderCouponBase
  );
  const orderAmountAfterCoupons = Math.max(
    0,
    orderCouponBase - couponDiscount
  );
  const sendCouponDiscount = calculateCouponDiscount(
    selectedSendCoupon,
    orderAmountAfterCoupons,
    shippingCost
  );

  return {
    orderCoupons,
    sendCoupons,
    selectedCoupon,
    selectedSendCoupon,
    couponDiscount,
    orderAmountAfterCoupons,
    sendCouponDiscount,
  };
}

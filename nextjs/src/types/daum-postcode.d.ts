/**
 * Daum Postcode (kakao) global type declarations.
 *
 * Loaded via <Script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" />
 */

export interface DaumPostcodeData {
  zonecode: string;
  address: string;
  jibunAddress: string;
  addressType: string; // "R" (도로명) or "J" (지번)
  buildingName: string;
  apartment: string;
}

export interface DaumPostcode {
  open: () => void;
}

export interface DaumPostcodeConstructor {
  new (options: {
    oncomplete: (data: DaumPostcodeData) => void;
  }): DaumPostcode;
}

declare global {
  interface Window {
    daum?: {
      Postcode: DaumPostcodeConstructor;
    };
  }
}

export {};

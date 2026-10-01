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
  /** 새 창으로 띄운다. */
  open: () => void;
  /** 넘긴 요소 안에 iframe 으로 끼워 넣는다 — 새 창을 띄우지 않는다. */
  embed: (element: HTMLElement) => void;
}

export interface DaumPostcodeOptions {
  oncomplete: (data: DaumPostcodeData) => void;
  /** 위젯이 스스로 높이를 바꿀 때 알려 준다. 끼워 넣은 자리의 높이를 맞추는 데 쓴다. */
  onresize?: (size: { width: number; height: number }) => void;
  /** 끼워 넣은 자리를 꽉 채우려면 '100%'. */
  width?: string | number;
  height?: string | number;
  /** 입력 중 보여 줄 제안 개수. 좁은 화면에서는 줄여 잡는다. */
  maxSuggestItems?: number;
}

export interface DaumPostcodeConstructor {
  new (options: DaumPostcodeOptions): DaumPostcode;
}

declare global {
  interface Window {
    daum?: {
      Postcode: DaumPostcodeConstructor;
    };
  }
}

export {};

import { expect, test } from '@playwright/test';
import {
  canMoveChapter,
  chapterOrderPayload,
  chapterParts,
  formAfterPartialSave,
  formFromState,
  isFormDirty,
  moveChapter,
  payloadFromForm,
  type EditorChapter,
  type EditorState,
} from '../../../themes/handbook/settings-editor/editor-model';

// 화면 편집 창(themes/handbook/settings-editor)의 값 변환 — 서버 값 ↔ 입력 칸 ↔ 저장 요청, 장 옮기기.
// 실행: npx playwright test tests/themes/handbook/settings-editor.spec.ts

const state: EditorState = {
  theme: 'handbook',
  revision: 7,
  settings: {
    docs: { group: 'manual', hints: { start: '1권', gone: '예전 그룹' } },
    sidebar: { home: 'hidden', docs: 'auto', board: 'auto', other: 'hidden' },
    site: {
      name: '매뉴얼',
      logoText: 'G5',
      description: '',
      homeTitle: '',
      homeDescription: '',
      footerDescription: '바닥글',
      customerCenterTitle: '',
      copyrightName: 'SIR Soft',
      customerCenterLines: ['첫 줄', '둘째 줄'],
    },
  },
  groups: [{ gr_id: 'manual', gr_subject: '매뉴얼' }],
  boards: [
    { bo_table: 'start', bo_subject: '1권 · 시작하기', bo_order: 1, bo_count_write: 6 },
    { bo_table: 'apps', bo_subject: '4권 · 앱 만들기', bo_order: 4, bo_count_write: 10 },
  ],
};

test('form keeps the saved values and lists only the group boards', () => {
  const form = formFromState(state);
  expect(form.site.logoText).toBe('G5');
  expect(form.customerCenterLines).toBe('첫 줄\n둘째 줄');
  expect(form.sidebar).toEqual({ home: 'hidden', docs: 'auto', board: 'auto', other: 'hidden' });
  // 지금 그룹에 없는 게시판(gone)의 안내 문구는 칸이 없다.
  expect(form.hints).toEqual({ start: '1권', apps: '' });
  expect(form.boards.apps).toEqual({ order: '4', subject: '4권 · 앱 만들기' });
});

test('an untouched form saves the same values', () => {
  const form = formFromState(state);
  const payload = payloadFromForm(form, state.revision);
  expect(payload.revision).toBe(7);
  expect(payload.site.customerCenterLines).toEqual(['첫 줄', '둘째 줄']);
  expect(payload.docs).toEqual({ group: 'manual', hints: { start: '1권' } });
  expect(payload.boards).toEqual({ start: { order: 1, subject: '1권 · 시작하기' }, apps: { order: 4, subject: '4권 · 앱 만들기' } });
  expect(isFormDirty(form, formFromState(state))).toBe(false);
});

test('payload trims lines, caps five help lines and clamps the order', () => {
  const form = formFromState(state);
  const edited = {
    ...form,
    customerCenterLines: ' 1 \n\n2\n3\n4\n5\n6 ',
    boards: { ...form.boards, start: { order: '12345', subject: '  새 이름 ' }, apps: { order: 'abc', subject: '' } },
    hints: { start: '  ', apps: ' 4권 ' },
  };
  const payload = payloadFromForm(edited, 7);
  expect(payload.site.customerCenterLines).toEqual(['1', '2', '3', '4', '5']);
  expect(payload.boards.start).toEqual({ order: 9999, subject: '새 이름' });
  // 빈 이름은 서버가 고치지 않는다(게시판 제목을 지우지 않게) — 그대로 빈 값으로 보낸다.
  expect(payload.boards.apps).toEqual({ order: 0, subject: '' });
  expect(payload.docs.hints).toEqual({ apps: '4권' });
  expect(isFormDirty(edited, form)).toBe(true);
});

test('with a baseline only the boards changed in the editor are sent, with their original values', () => {
  const saved = formFromState(state);
  // 사이트 문구만 고친 저장 — 게시판은 하나도 보내지 않는다(그사이 다른 곳에서 고친 제목을 되돌리지 않게).
  const textOnly = { ...saved, site: { ...saved.site, footerDescription: '새 바닥글' } };
  expect(payloadFromForm(textOnly, 7, saved).boards).toEqual({});
  // 한 게시판의 이름만 고쳤으면 그 게시판만, 처음 값과 함께.
  const renamed = { ...saved, boards: { ...saved.boards, apps: { order: '4', subject: ' 4권 · 앱 ' } } };
  expect(payloadFromForm(renamed, 7, saved).boards).toEqual({
    apps: { order: 4, subject: '4권 · 앱', orig_order: 4, orig_subject: '4권 · 앱 만들기' },
  });
  // 공백만 바꾼 것은 바꾼 것이 아니다.
  const spaced = { ...saved, boards: { ...saved.boards, start: { order: ' 1 ', subject: '1권 · 시작하기 ' } } };
  expect(payloadFromForm(spaced, 7, saved).boards).toEqual({});
});

test('after a partial save only the failed boards keep the typed values', () => {
  const server = formFromState(state);
  const attempted = {
    ...server,
    site: { ...server.site, logoText: '새 로고' },
    boards: {
      start: { order: '9', subject: '실패한 이름' },
      apps: { order: '5', subject: '저장된 이름' },
    },
  };
  // 서버는 apps 만 고쳤다고 하자 — start 는 입력한 값 그대로 남아 "저장하지 않은 변경"이 된다.
  const savedOnServer = { ...server, boards: { ...server.boards, apps: { order: '5', subject: '저장된 이름' } } };
  const next = formAfterPartialSave(savedOnServer, attempted, server, ['start', 'gone']);
  expect(next.boards.start).toEqual({ order: '9', subject: '실패한 이름' });
  expect(next.boards.apps).toEqual({ order: '5', subject: '저장된 이름' });
  expect(next.site.logoText).toBe(server.site.logoText);
  expect(isFormDirty(next, savedOnServer)).toBe(true);
  expect(payloadFromForm(next, 8, savedOnServer).boards).toEqual({
    start: { order: 9, subject: '실패한 이름', orig_order: 1, orig_subject: '1권 · 시작하기' },
  });
  // 실패한 게시판이 없으면 서버 값 그대로.
  expect(formAfterPartialSave(savedOnServer, attempted, server, [])).toBe(savedOnServer);
});

test('whitespace-only edits are not unsaved changes', () => {
  const form = formFromState(state);
  expect(isFormDirty({ ...form, site: { ...form.site, logoText: ' G5 ' } }, form)).toBe(false);
  expect(isFormDirty({ ...form, customerCenterLines: '첫 줄\n둘째 줄\n\n' }, form)).toBe(false);
  expect(isFormDirty({ ...form, site: { ...form.site, logoText: 'G5 매뉴얼' } }, form)).toBe(true);
});

const chapters: EditorChapter[] = [
  { wr_id: 1, wr_subject: '가', part: '개요' },
  { wr_id: 2, wr_subject: '나', part: '개요' },
  { wr_id: 3, wr_subject: '다', part: '운영' },
  { wr_id: 4, wr_subject: '라', part: '운영' },
];

test('chapters move only inside their part', () => {
  expect(moveChapter(chapters, 1, -1).map((chapter) => chapter.wr_id)).toEqual([2, 1, 3, 4]);
  // 부 경계(나 → 다)는 넘지 않는다.
  expect(moveChapter(chapters, 1, 1).map((chapter) => chapter.wr_id)).toEqual([1, 2, 3, 4]);
  expect(canMoveChapter(chapters, 1, 1)).toBe(false);
  expect(canMoveChapter(chapters, 0, -1)).toBe(false);
  expect(canMoveChapter(chapters, 3, -1)).toBe(true);
  // 받은 목록은 바꾸지 않는다.
  expect(chapters.map((chapter) => chapter.wr_id)).toEqual([1, 2, 3, 4]);
});

test('chapter order payload numbers the shown order and parts group neighbours', () => {
  const moved = moveChapter(chapters, 3, -1);
  expect(chapterOrderPayload(moved)).toEqual({ '1': 1, '2': 2, '4': 3, '3': 4 });
  expect(chapterParts(moved).map((part) => [part.part, part.items.map((item) => item.index)])).toEqual([
    ['개요', [0, 1]],
    ['운영', [2, 3]],
  ]);
});

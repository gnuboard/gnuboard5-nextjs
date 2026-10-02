import * as z from "zod";
import type {
  FaqPageData,
  Memo,
  Poll,
  PollComment,
  PollSummary,
  QaConfig,
  QaItem,
  Scrap,
} from "@/lib/types";
import {
  booleanValue,
  numberValue,
  optionalString,
  paginationMetaSchema,
  stringValue,
} from "@/lib/schemas/primitives";

export const notificationItemSchema = z
  .object({
    nt_id: numberValue,
    mb_id: stringValue,
    nt_type: stringValue,
    nt_event: optionalString,
    nt_title: stringValue,
    nt_body: stringValue,
    nt_data: z.unknown().nullable().optional(),
    dday_id: optionalString.nullable().optional(),
    nt_sent_at: stringValue,
    nt_read_at: optionalString.nullable().optional(),
    is_read: booleanValue,
  })
  .passthrough();

export const notificationListSchema = z.array(notificationItemSchema);

export const notificationResponseSchema = z
  .object({
    count: numberValue,
    items: z.array(notificationItemSchema).default([]),
  })
  .passthrough();

export const notificationReadSchema = z
  .object({
    read_at: optionalString,
    message: optionalString,
  })
  .passthrough();

export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const authAvailabilitySchema = z
  .object({
    available: booleanValue,
    message: stringValue,
  })
  .passthrough();

export const passwordResetRequestSchema = z
  .object({
    reset_token: stringValue,
  })
  .passthrough();

export type AuthAvailability = z.infer<typeof authAvailabilitySchema>;

export const memoSchema = z
  .object({
    me_id: numberValue,
    me_recv_mb_id: stringValue,
    me_send_mb_id: stringValue,
    me_send_datetime: stringValue,
    me_read_datetime: stringValue,
    me_memo: stringValue,
    me_send_id: numberValue,
    me_type: z.enum(["send", "recv"]).catch("recv"),
    me_send_ip: stringValue,
  })
  .passthrough() as unknown as z.ZodType<Memo>;

export const memoListSchema = z.array(memoSchema);

export const scrapSchema = z
  .object({
    ms_id: numberValue,
    mb_id: stringValue,
    bo_table: stringValue,
    wr_id: numberValue,
    ms_datetime: stringValue,
    bo_subject: stringValue,
    wr_subject: stringValue,
    wr_datetime: stringValue,
    wr_name: stringValue,
    post_mb_id: stringValue,
    href: stringValue,
  })
  .passthrough() as unknown as z.ZodType<Scrap>;

export const scrapListSchema = z.array(scrapSchema);

export const faqMasterSchema = z
  .object({
    fm_id: numberValue,
    fm_subject: stringValue,
    fm_head_html: stringValue,
    fm_tail_html: stringValue,
    fm_mobile_head_html: stringValue,
    fm_mobile_tail_html: stringValue,
    fm_order: numberValue,
  })
  .passthrough();

export const faqItemSchema = z
  .object({
    fa_id: numberValue,
    fm_id: numberValue,
    fa_subject: stringValue,
    fa_content: stringValue,
    fa_order: numberValue,
  })
  .passthrough();

export const faqPageDataSchema = z
  .object({
    masters: z.array(faqMasterSchema).default([]),
    current: faqMasterSchema.nullable(),
    items: z.array(faqItemSchema).default([]),
    meta: paginationMetaSchema.extend({
      from: numberValue.nullable().optional(),
      to: numberValue.nullable().optional(),
    }),
  })
  .passthrough() as unknown as z.ZodType<FaqPageData>;

export const pollOptionSchema = z
  .object({
    num: numberValue,
    content: stringValue,
    count: numberValue,
    rate: numberValue,
    bar: numberValue,
  })
  .passthrough();

export const pollCommentSchema = z
  .object({
    pc_id: numberValue,
    po_id: numberValue,
    mb_id: stringValue,
    pc_name: stringValue,
    pc_idea: stringValue,
    pc_datetime: stringValue,
    can_delete: booleanValue,
  })
  .passthrough() as unknown as z.ZodType<PollComment>;

export const pollSummarySchema = z
  .object({
    po_id: numberValue,
    po_subject: stringValue,
    po_date: stringValue,
    po_use: numberValue,
    is_current: booleanValue.optional(),
  })
  .passthrough() as unknown as z.ZodType<PollSummary>;

export const pollSchema = z
  .object({
    po_id: numberValue,
    po_subject: stringValue,
    po_etc: stringValue,
    po_level: numberValue,
    po_point: numberValue,
    po_date: stringValue,
    po_use: numberValue,
    is_active: booleanValue,
    options: z.array(pollOptionSchema).default([]),
    total_count: numberValue,
    has_voted: booleanValue,
    can_vote: booleanValue,
    can_view_result: booleanValue,
    can_comment: booleanValue,
    etc_comments: z.array(pollCommentSchema).default([]),
    other_polls: z.array(pollSummarySchema).default([]),
  })
  .passthrough() as unknown as z.ZodType<Poll>;

export const qaConfigSchema = z
  .object({
    qa_title: stringValue,
    qa_category: stringValue,
    categories: z.array(stringValue).default([]),
    qa_use_email: numberValue,
    qa_req_email: numberValue,
    qa_use_hp: numberValue,
    qa_req_hp: numberValue,
    qa_use_sms: numberValue,
    qa_use_editor: numberValue,
    qa_subject_len: numberValue,
    qa_page_rows: numberValue,
    qa_mobile_page_rows: numberValue,
    qa_insert_content: stringValue,
    qa_content_head: stringValue,
    qa_content_tail: stringValue,
    qa_mobile_content_head: stringValue,
    qa_mobile_content_tail: stringValue,
  })
  .passthrough() as unknown as z.ZodType<QaConfig>;

const qaNeighborSchema = z.object({ qa_id: numberValue, qa_subject: stringValue });

export const qaItemSchema: z.ZodType<QaItem> = z.lazy(() =>
  z
    .object({
      qa_id: numberValue,
      qa_num: numberValue,
      qa_parent: numberValue,
      qa_related: numberValue,
      mb_id: stringValue,
      qa_name: stringValue,
      qa_email: stringValue,
      qa_hp: stringValue,
      qa_type: numberValue,
      qa_category: stringValue,
      qa_email_recv: numberValue,
      qa_sms_recv: numberValue,
      qa_html: numberValue,
      qa_subject: stringValue,
      qa_content: stringValue,
      qa_status: numberValue,
      qa_file1: stringValue,
      qa_source1: stringValue,
      qa_file2: stringValue,
      qa_source2: stringValue,
      qa_file1_url: stringValue,
      qa_file2_url: stringValue,
      qa_datetime: stringValue,
      can_edit: booleanValue,
      can_delete: booleanValue,
      answer: qaItemSchema.nullable(),
      related_questions: z.array(qaItemSchema).default([]),
      prev: qaNeighborSchema.nullable().optional(),
      next: qaNeighborSchema.nullable().optional(),
    })
    .passthrough()
) as z.ZodType<QaItem>;

export const qaItemListSchema = z.array(qaItemSchema);

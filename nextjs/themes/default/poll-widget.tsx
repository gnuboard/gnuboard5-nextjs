"use client";

import { useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { ApiError } from "@/lib/api";
import { votePoll } from "@/services/polls";
import type { Poll } from "@/lib/types";

/**
 * 사이드바 설문 위젯. 레퍼런스는 poll_update.php 로 폼 전송하지만 여기서는
 * /v1/polls 투표 API 를 그대로 쓴다. 결과 보기는 앱의 설문 페이지로 넘긴다.
 */
export function SolunePollWidget({ initialPoll }: { initialPoll: Poll }) {
  const [poll, setPoll] = useState(initialPoll);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /* 레퍼런스 poll 스킨처럼 아직 투표하지 않은 사람에게는 늘 폼을 보인다.
     투표 자격이 없으면(비회원·레벨 부족) 누른 뒤에 안내한다 — 폼을 감추고
     결과만 내면 설문이 있는지조차 알기 어렵다. */
  const showResult = poll.has_voted;

  async function submitVote() {
    if (selected === null) {
      setError("투표하실 설문항목을 선택하세요.");
      return;
    }
    if (!poll.can_vote) {
      setError("로그인 후 투표할 수 있습니다.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      setPoll(await votePoll(poll.po_id, selected));
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message || "투표를 처리하지 못했습니다."
          : "투표를 처리하지 못했습니다."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="solune-sidebar-widget solune-poll-widget" aria-labelledby="solune-poll-title">
      <header className="solune-sidebar-widget-head">
        <h2 id="solune-poll-title">설문조사</h2>
        {/* 설문 페이지는 /polls?po_id= 로 연다. /polls/{id} 경로는 없어 글 보기 경로로 넘어가 "게시글을 찾을 수 없습니다"가 떴다. */}
        <Link href={`/polls?po_id=${poll.po_id}`} className="solune-sidebar-head-link">
          결과보기
        </Link>
      </header>
      <div className="solune-sidebar-widget-body">
        <p className="solune-poll-question">{poll.po_subject}</p>

        {showResult ? (
          <ul className="solune-poll-result">
            {poll.options.map((option) => (
              <li key={option.num}>
                <span className="solune-poll-result-head">
                  <span>{option.content}</span>
                  <span>{option.count}표</span>
                </span>
                <span className="solune-poll-bar" aria-hidden>
                  <span style={{ width: `${Math.max(0, Math.min(100, option.rate))}%` }} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="solune-poll-options">
              {poll.options.map((option) => (
                <li key={option.num}>
                  <label className="solune-poll-option">
                    <input
                      type="radio"
                      name="solune-poll"
                      value={option.num}
                      checked={selected === option.num}
                      onChange={() => {
                        setSelected(option.num);
                        setError(null);
                      }}
                    />
                    <span>{option.content}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="solune-poll-submit"
              onClick={() => void submitVote()}
              disabled={pending}
            >
              {pending ? "처리 중…" : "투표하기"}
            </button>
          </>
        )}

        {error ? (
          <p className="solune-poll-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

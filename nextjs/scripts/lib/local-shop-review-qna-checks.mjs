export function createLocalShopReviewQnaChecks(context) {
  const {
    smokeMemberName,
    smokeReviewSubject,
    smokeReviewUpdatedSubject,
    smokeQaSubject,
    smokeQaUpdatedSubject,
    smokeQaUpdatedQuestion,
    fail,
    runSeed,
    apiJson,
    apiOk,
    fetchApi,
    authHeaders,
    cleanupSmokeReviews,
    cleanupSmokeQnas,
  } = context;

  async function publicReviewRows(productId) {
    const payload = await apiJson(
      `/shop/reviews?it_id=${encodeURIComponent(productId)}&per_page=100`
    );
    return payload.data?.items || payload.data || [];
  }

  async function publicQnaRows(productId, headers = {}) {
    const payload = await apiJson(
      `/shop/reviews/qna?it_id=${encodeURIComponent(productId)}&per_page=100`,
      { headers }
    );
    return payload.data?.items || payload.data || [];
  }

  async function verifyReviewWriteCompatibility(token, product) {
    const previous = runSeed('set_nextjs_smoke_review_policy.php', {}, [
      '--write=0',
      '--moderate=0',
    ]);

    try {
      await cleanupSmokeReviews(token, product.it_id);

      const create = await fetchApi('/shop/reviews', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          it_id: product.it_id,
          is_subject: smokeReviewSubject,
          is_content:
            'Next.js API-created YoungCart review compatibility smoke.<script>alert("x")</script>',
          is_score: 9,
        }),
      });
      if (create.response.status !== 201 || create.payload?.success !== true) {
        fail('review create returned unexpected response', {
          status: create.response.status,
          payload: create.payload,
        });
      }

      const review = create.payload.data || {};
      if (!review.is_id) {
        fail('review create did not return an id', create.payload);
      }
      if (String(review.is_name || '') !== smokeMemberName) {
        fail('review create did not store the YoungCart member name', {
          expected: smokeMemberName,
          actual: review.is_name,
        });
      }
      if (Object.prototype.hasOwnProperty.call(review, 'is_password')) {
        fail('review create response exposed is_password', review);
      }
      if (String(review.is_confirm ?? '') !== '1') {
        fail('review create did not follow immediate-display policy', review);
      }
      if (Number(review.is_score) !== 1) {
        fail('review create did not normalize an out-of-range score like YoungCart', review);
      }
      if (
        String(review.is_content || '').includes('<script') ||
        !String(review.is_content || '').includes('Next.js API-created YoungCart review compatibility smoke.')
      ) {
        fail('review create did not strip script tags from content like YoungCart', review);
      }

      let publicRows = await publicReviewRows(product.it_id);
      if (
        !publicRows.find(
          (row) =>
            String(row.is_id) === String(review.is_id) &&
            Number(row.is_score) === 1 &&
            !String(row.is_content || '').includes('<script')
        )
      ) {
        fail('created confirmed review was not visible in the public review list', publicRows);
      }

      const update = await apiJson(`/shop/reviews/${encodeURIComponent(review.is_id)}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({
          is_subject: smokeReviewUpdatedSubject,
          is_content: 'Next.js updated YoungCart review compatibility smoke.',
          is_score: 5,
        }),
      });
      if (
        String(update.data?.is_subject || '') !== smokeReviewUpdatedSubject ||
        Number(update.data?.is_score) !== 5
      ) {
        fail('review update did not return the updated review payload', update);
      }

      publicRows = await publicReviewRows(product.it_id);
      if (
        !publicRows.find(
          (row) =>
            String(row.is_id) === String(review.is_id) &&
            String(row.is_subject) === smokeReviewUpdatedSubject &&
            Number(row.is_score) === 5
        )
      ) {
        fail('updated confirmed review was not reflected in the public review list', publicRows);
      }

      await apiOk(`/shop/reviews/${encodeURIComponent(review.is_id)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });

      publicRows = await publicReviewRows(product.it_id);
      if (publicRows.find((row) => String(row.is_id) === String(review.is_id))) {
        fail('deleted review remained in the public review list', publicRows);
      }

      return {
        reviewCreateFormatted: true,
        reviewAuthorName: review.is_name,
        reviewScoreNormalized: true,
        reviewScriptStripped: true,
        reviewImmediateVisible: true,
        reviewUpdated: true,
        reviewDeleted: true,
      };
    } finally {
      try {
        await cleanupSmokeReviews(token, product.it_id);
      } finally {
        runSeed('set_nextjs_smoke_review_policy.php', {}, [
          `--write=${previous.previous_write}`,
          `--moderate=${previous.previous_moderate}`,
        ]);
      }
    }
  }

  async function verifyQnaWriteCompatibility(token, product) {
    try {
      await cleanupSmokeQnas(token, product.it_id);

      const create = await fetchApi('/shop/reviews/qna', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          it_id: product.it_id,
          iq_subject: smokeQaSubject,
          iq_question:
            'Next.js API-created YoungCart Q&A compatibility smoke.<script>alert("x")</script>',
          iq_email: 'nextjs_qna@example.test',
          iq_hp: '010-8888-7777',
          iq_secret: 1,
        }),
      });
      if (create.response.status !== 201 || create.payload?.success !== true) {
        fail('Q&A create returned unexpected response', {
          status: create.response.status,
          payload: create.payload,
        });
      }

      const qna = create.payload.data || {};
      if (!qna.iq_id) {
        fail('Q&A create did not return an id', create.payload);
      }
      if (String(qna.iq_name || '') !== smokeMemberName) {
        fail('Q&A create did not store the YoungCart member name', {
          expected: smokeMemberName,
          actual: qna.iq_name,
        });
      }
      if (Object.prototype.hasOwnProperty.call(qna, 'iq_password')) {
        fail('Q&A create response exposed iq_password', qna);
      }
      if (Number(qna.iq_secret) !== 1) {
        fail('Q&A create did not persist the secret flag', qna);
      }
      if (
        String(qna.iq_question || '').includes('<script') ||
        !String(qna.iq_question || '').includes('Next.js API-created YoungCart Q&A compatibility smoke.')
      ) {
        fail('Q&A create did not strip script tags from question content like YoungCart', qna);
      }

      const guestRows = await publicQnaRows(product.it_id);
      const guestRow = guestRows.find((row) => String(row.iq_id) === String(qna.iq_id));
      if (
        !guestRow ||
        guestRow.can_view !== false ||
        String(guestRow.iq_subject || '') !== '비밀글입니다.' ||
        String(guestRow.iq_question || '') !== '' ||
        String(guestRow.iq_email || '') !== '' ||
        String(guestRow.iq_hp || '') !== ''
      ) {
        fail('secret Q&A was not hidden from a guest public list like YoungCart', {
          guestRow,
          guestRows,
        });
      }

      const ownerRows = await publicQnaRows(product.it_id, authHeaders(token));
      const ownerRow = ownerRows.find((row) => String(row.iq_id) === String(qna.iq_id));
      if (
        !ownerRow ||
        ownerRow.can_view !== true ||
        String(ownerRow.iq_subject || '') !== smokeQaSubject ||
        !String(ownerRow.iq_question || '').includes('Next.js API-created YoungCart Q&A compatibility smoke.')
      ) {
        fail('secret Q&A was not visible to its owner in the public list', {
          ownerRow,
          ownerRows,
        });
      }

      const update = await apiJson(`/shop/reviews/qna/${encodeURIComponent(qna.iq_id)}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({
          iq_subject: smokeQaUpdatedSubject,
          iq_question: smokeQaUpdatedQuestion,
          iq_secret: 0,
          iq_email: '',
          iq_hp: '',
        }),
      });
      if (
        String(update.data?.iq_subject || '') !== smokeQaUpdatedSubject ||
        String(update.data?.iq_question || '') !== smokeQaUpdatedQuestion ||
        Number(update.data?.iq_secret || 0) !== 0
      ) {
        fail('Q&A update did not follow YoungCart non-empty-only validation', update);
      }

      await apiOk(`/shop/reviews/qna/${encodeURIComponent(qna.iq_id)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });

      const afterDeleteRows = await publicQnaRows(product.it_id, authHeaders(token));
      if (afterDeleteRows.find((row) => String(row.iq_id) === String(qna.iq_id))) {
        fail('deleted Q&A remained in the public Q&A list', afterDeleteRows);
      }

      return {
        qnaCreateFormatted: true,
        qnaAuthorName: qna.iq_name,
        qnaSecretHiddenFromGuest: true,
        qnaOwnerCanViewSecret: true,
        qnaShortUpdateAllowed: true,
        qnaDeleted: true,
      };
    } finally {
      await cleanupSmokeQnas(token, product.it_id);
    }
  }
  

  return {
    verifyReviewWriteCompatibility,
    verifyQnaWriteCompatibility,
  };
}

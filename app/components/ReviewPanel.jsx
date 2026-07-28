'use client';

// Khối "đánh giá đối tác" — hiện khi deal đã COMPLETED.
// Bản hackathon: ghi thẳng vào Firestore từ client (giống cách chat đang làm),
// KHÔNG qua server + chữ ký ví + Firebase Admin key nữa — đơn giản hoá theo
// yêu cầu của bạn vì đây là hackathon, không cần mức bảo mật đó.
// Việc chặn "chưa hoàn tất thì không đánh giá được" vẫn còn: component này chỉ
// được page.jsx render khi state hợp đồng đã COMPLETED (xem page.jsx).
import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckIcon } from './Icons';

const short = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';

function Stars({ value, onChange, readOnly }) {
  return (
    <div className="star-row">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={() => !readOnly && onChange && onChange(n)}
          style={{
            cursor: readOnly ? 'default' : 'pointer',
            fontSize: '1.3rem',
            color: n <= value ? 'var(--gold, #9A7B1F)' : 'var(--muted, #7A776D)',
            lineHeight: 1,
          }}
        >
          {n <= value ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
}

export default function ReviewPanel({ dealAddress, myAddress, counterpartAddress }) {
  const [myReview, setMyReview] = useState(null);       // review mình đã gửi cho deal này (nếu có)
  const [reputation, setReputation] = useState(null);    // { count, average } của đối tác
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const dealLc = dealAddress?.toLowerCase();
  const myLc = myAddress?.toLowerCase();
  const counterpartLc = counterpartAddress?.toLowerCase();

  const load = useCallback(async () => {
    if (!dealLc || !myLc || !counterpartLc) return;
    setLoading(true);
    try {
      const reviewSnap = await getDoc(doc(db, 'reviews', `${dealLc}_${myLc}`));
      setMyReview(reviewSnap.exists() ? reviewSnap.data() : null);

      const repSnap = await getDoc(doc(db, 'reputations', counterpartLc));
      setReputation(repSnap.exists() ? repSnap.data() : null);
    } catch {
      // im lặng — chỉ là hiển thị phụ, không chặn tính năng chính
    } finally {
      setLoading(false);
    }
  }, [dealLc, myLc, counterpartLc]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    setError('');
    if (rating < 1 || rating > 5) {
      setError('Chọn số sao từ 1 đến 5');
      return;
    }
    setSubmitting(true);
    try {
      const reviewId = `${dealLc}_${myLc}`;
      const reviewRef = doc(db, 'reviews', reviewId);
      const repRef = doc(db, 'reputations', counterpartLc);

      await runTransaction(db, async (tx) => {
        const existing = await tx.get(reviewRef);
        if (existing.exists()) {
          throw new Error('ALREADY_REVIEWED');
        }
        const repSnap = await tx.get(repRef);
        const prevCount = repSnap.exists() ? (repSnap.data().count || 0) : 0;
        const prevSum = repSnap.exists() ? (repSnap.data().sum || 0) : 0;
        const newCount = prevCount + 1;
        const newSum = prevSum + rating;

        tx.set(reviewRef, {
          dealAddress: dealLc,
          reviewerAddress: myLc,
          revieweeAddress: counterpartLc,
          rating,
          comment: comment.trim(),
          createdAt: serverTimestamp(),
        });
        tx.set(repRef, {
          address: counterpartLc,
          count: newCount,
          sum: newSum,
          average: newSum / newCount,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });

      setSuccess(true);
      await load();
    } catch (e) {
      if (e?.message === 'ALREADY_REVIEWED') {
        setError('Bạn đã đánh giá giao dịch này rồi');
      } else {
        setError(e?.message || 'Gửi đánh giá thất bại — kiểm tra lại Firestore rules cho collection reviews/reputations');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="card review-panel">
      <div className="card-title">Rate your counterpart</div>

      <p className="review-rep">
        {reputation ? (
          <>
            {short(counterpartAddress)} holds{' '}
            <Stars value={Math.round(reputation.average)} readOnly />{' '}
            <span className="mono">{reputation.average.toFixed(1)} / 5</span> across{' '}
            {reputation.count} {reputation.count === 1 ? 'review' : 'reviews'}.
          </>
        ) : (
          <>{short(counterpartAddress)} has no reviews yet.</>
        )}
      </p>

      {myReview ? (
        <div className="review-mine">
          <span className="review-mine-label">You rated this deal</span>
          <Stars value={myReview.rating} readOnly />
          {myReview.comment && <p className="review-mine-comment">{myReview.comment}</p>}
        </div>
      ) : success ? (
        <p className="review-done"><CheckIcon size={14} /> Review submitted. Thank you.</p>
      ) : (
        <>
          <Stars value={rating} onChange={setRating} />

          <textarea
            className="input review-comment"
            placeholder="Anything worth telling the next person? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={3}
          />

          {error && <p className="review-error mono">{error}</p>}

          <button
            className="btn btn-primary review-submit"
            onClick={handleSubmit}
            disabled={submitting || rating < 1}
          >
            <span className="btn-label">
              {submitting && <span className="spinner" />}
              {submitting ? 'Sending' : 'Submit review'}
            </span>
          </button>
        </>
      )}
    </div>
  );
}

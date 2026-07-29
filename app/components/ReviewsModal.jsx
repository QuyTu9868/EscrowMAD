'use client';

// Xem danh gia mot dia chi da nhan duoc, mo tu the Participants tren trang hop
// dong. Dat o day de xem duoc TRUOC khi bo tien vao, khac ReviewPanel von chi
// hien sau khi deal da COMPLETED va chi cho nguoi trong cuoc.
import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Stars } from './ReviewPanel';
import { CloseIcon } from './Icons';

const short = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '');

export default function ReviewsModal({ isOpen, address, onClose }) {
  const [loading, setLoading] = useState(true);
  const [reputation, setReputation] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !address) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      const key = address.toLowerCase();
      try {
        const repSnap = await getDoc(doc(db, 'reputations', key));

        // Khong kem orderBy: ghep voi where se doi hoi composite index tren
        // Firestore. Moi nguoi chi co vai danh gia nen sap xep o day la du.
        const listSnap = await getDocs(
          query(collection(db, 'reviews'), where('revieweeAddress', '==', key)),
        );

        if (cancelled) return;
        setReputation(repSnap.exists() ? repSnap.data() : null);
        setReviews(
          listSnap.docs
            .map((d) => d.data())
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
        );
      } catch (err) {
        if (!cancelled) setError(err.code === 'permission-denied'
          ? 'Reviews are not readable yet. Firestore rules need to allow listing.'
          : 'Could not load reviews.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, address]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Reviews</h2>
          <button onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </div>

        <p className="modal-lead mono">{short(address)}</p>

        {loading && <p className="reviews-empty">Loading</p>}

        {!loading && error && <p className="reviews-empty">{error}</p>}

        {!loading && !error && (
          <>
            {reputation ? (
              <div className="reviews-score">
                <Stars value={Math.round(reputation.average)} readOnly />
                <span className="mono">{reputation.average.toFixed(1)} / 5</span>
                <span className="reviews-count">
                  {reputation.count} {reputation.count === 1 ? 'review' : 'reviews'}
                </span>
              </div>
            ) : (
              // Noi ro la chua ai danh gia, khong de trong keo nguoi dung tuong hong.
              <p className="reviews-empty">Nobody has rated this address yet.</p>
            )}

            {reviews.map((r, i) => (
              <div className="reviews-item" key={`${r.dealAddress}-${r.reviewerAddress}-${i}`}>
                <div className="reviews-item-head">
                  <Stars value={r.rating} readOnly />
                  <span className="mono reviews-by">{short(r.reviewerAddress)}</span>
                </div>
                {r.comment && <p className="reviews-comment">{r.comment}</p>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

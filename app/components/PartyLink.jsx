'use client';

// Dia chi buyer/seller tren the Participants, bam vao mo popup danh gia.
//
// Kem chip sao vi mot chuoi hex tran khong he trong giong cho bam duoc, ma diem
// danh gia lai dung la thu nguoi ta muon thay truoc khi quyet dinh giao dich.
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const short = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '');

export default function PartyLink({ address, isYou, onOpen }) {
  const [rep, setRep] = useState(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getDoc(doc(db, 'reputations', address.toLowerCase()))
      .then((snap) => { if (!cancelled && snap.exists()) setRep(snap.data()); })
      .catch(() => {}); // khong co diem thi thoi, khong lam hong the Participants
    return () => { cancelled = true; };
  }, [address]);

  return (
    <button type="button" className="party-link" onClick={() => onOpen(address)}>
      <span className="mono">{short(address)}</span>
      {isYou && <span className="you-badge">YOU</span>}
      {rep && (
        <span className="party-rating" title={`${rep.count} review(s)`}>
          <span className="party-star">★</span>
          {rep.average.toFixed(1)}
        </span>
      )}
    </button>
  );
}

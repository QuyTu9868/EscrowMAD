'use client';

import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useState, useEffect } from 'react';

// const GHN_DISTRICT_URL = 'https://dev-online-gateway.ghn.vn/shiip/public-api/master-data/district';
// const GHN_WARD_URL     = 'https://dev-online-gateway.ghn.vn/shiip/public-api/master-data/ward';
const GHN_TOKEN        = process.env.NEXT_PUBLIC_GHN_TOKEN_PUBLIC; // chỉ dùng để gọi master-data (public)

// ─── Helper ────────────────────────────────────────────────────────────────
const PROVINCE_ID_DEFAULT = 202; // TP.HCM — buyer có thể chọn tỉnh khác nếu cần

export default function ShipModal({ isOpen, onClose, onConfirm, itemDescription, isLoading, contractAddress }) {
  const [step, setStep]               = useState(1); // 1 = nhập info, 2 = đang tạo đơn, 3 = thành công
  const [toName,      setToName]      = useState('');
  const [toPhone,     setToPhone]     = useState('');
  const [toAddress,   setToAddress]   = useState('');
  const [weight,      setWeight]      = useState('500');
  const [length,      setLength]      = useState('20');
  const [width,       setWidth]       = useState('15');
  const [height,      setHeight]      = useState('10');
  const [provinces,   setProvinces]   = useState([]);
  const [districts,   setDistricts]   = useState([]);
  const [wards,       setWards]       = useState([]);
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedWard,     setSelectedWard]     = useState('');
  const [error,   setError]   = useState('');
  const [orderCode, setOrderCode] = useState('');
  const SAVE_KEY = 'escrowmad_ship_form';
  const [buyerDistrictId, setBuyerDistrictId] = useState('');
  const [buyerWardCode,   setBuyerWardCode]   = useState('');
  const [buyerAddress,    setBuyerAddress]    = useState('');
  const [buyerStreet, setBuyerStreet] = useState('');

  useEffect(() => {
    if (!isOpen || !contractAddress) return;
    getDocs(collection(db, 'contracts', contractAddress.toLowerCase(), 'buyerAddress'))
      .then(snap => {
        const doc = snap.docs[0]?.data();
        if (doc) {
          setBuyerDistrictId(doc.district_id);
          setBuyerWardCode(doc.ward_code);
          setBuyerAddress(doc.address);
          setBuyerStreet(doc.street || '');
        }
      }).catch(() => {});
  }, [isOpen, contractAddress]);

  // Load dữ liệu đã lưu khi mở modal
  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      if (saved.toName)    setToName(saved.toName);
      if (saved.toPhone)   setToPhone(saved.toPhone);
      if (saved.toAddress) setToAddress(saved.toAddress);
      if (saved.weight)    setWeight(saved.weight);
      if (saved.length)    setLength(saved.length);
      if (saved.width)     setWidth(saved.width);
      if (saved.height)    setHeight(saved.height);
    } catch {}
  }, [isOpen]);
  
  // Load tỉnh/thành
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/ghn-master?type=province')
      .then(r => r.json())
      .then(d => { if (d.code === 200) setProvinces(d.data || []); })
      .catch(() => {});
  }, [isOpen]);

  // Load quận/huyện khi chọn tỉnh
  useEffect(() => {
    if (!selectedProvince) { setDistricts([]); setWards([]); return; }
    fetch(`/api/ghn-master?type=district&province_id=${selectedProvince}`)
      .then(r => r.json())
      .then(d => { if (d.code === 200) setDistricts(d.data || []); })
      .catch(() => {});
    setSelectedDistrict('');
    setSelectedWard('');
    setWards([]);
  }, [selectedProvince]);

  // Load phường/xã khi chọn quận
  useEffect(() => {
    if (!selectedDistrict) { setWards([]); return; }
    fetch(`/api/ghn-master?type=ward&district_id=${selectedDistrict}`)
      .then(r => r.json())
      .then(d => { if (d.code === 200) setWards(d.data || []); })
      .catch(() => {});
    setSelectedWard('');
  }, [selectedDistrict]);

  const reset = () => {
    setStep(1); setToName(''); setToPhone(''); setToAddress('');
    setWeight('500'); setLength('20'); setWidth('15'); setHeight('10');
    setSelectedProvince(''); setSelectedDistrict(''); setSelectedWard('');
    setError(''); setOrderCode('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    setError('');
    if (!toName.trim())          return setError('Please enter recipient name.');
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ toName, toPhone, toAddress, weight, length, width, height }));
    } catch {}

    if (!toPhone.trim())         return setError('Please enter recipient phone.');
    if (!buyerDistrictId)        return setError('Buyer address not found. Please wait.');
    if (!weight || Number(weight) <= 0) return setError('Weight must be > 0.');

    setStep(2);
    try {
      const res = await fetch('/api/ghn-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_name:       toName.trim(),
          to_phone:      toPhone.trim(),
          to_address:    buyerStreet || buyerAddress.split(',')[0].trim(),
          to_ward_code:  buyerWardCode,
          to_district_id: Number(buyerDistrictId),
          weight:         Number(weight),
          length:         Number(length),
          width:          Number(width),
          height:         Number(height),
          content:       itemDescription || 'EscrowMAD item',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setStep(1);
        return setError(JSON.stringify(data));
      }

      setOrderCode(data.order_code);
      setStep(3);
      onConfirm(data.order_code); // callback về page.jsx để lưu Firestore + mark shipped
    } catch (e) {
      setStep(1);
      setError('Network error. Please try again.');
    }
  };

  if (!isOpen) return null;

  const inputStyle = {
    width: '100%', background: 'var(--input-bg, #0a0a0f)', border: '1px solid var(--border, #1e1e2e)',
    borderRadius: '8px', padding: '0.6rem 0.85rem', color: 'var(--text, #e2e2f0)',
    fontFamily: 'var(--font-mono, monospace)', fontSize: '0.82rem', outline: 'none',
    marginBottom: '0.6rem', boxSizing: 'border-box',
  };
  const selectStyle = { ...inputStyle, cursor: 'pointer' };
  const labelStyle  = { fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--muted, #5a5a7a)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--surface, #111118)', border: '1px solid var(--border, #1e1e2e)',
        borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '480px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              GHN Shipping
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
              {step === 3 ? '✅ Order Created' : 'Create Delivery Order'}
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close modal"
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '1.25rem', cursor: 'pointer', lineHeight: 1, padding: '0.25rem' }}
          >✕</button>
        </div>

        {/* Step 1 — Form */}
        {step === 1 && (
          <>
            <div style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)', borderRadius: '8px', padding: '0.6rem 0.75rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent2, #06b6d4)' }}>
              📦 Item: <strong>{itemDescription || '—'}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 0.75rem' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Recipient Name *</label>
                <input style={inputStyle} placeholder="Nguyen Van A" value={toName} onChange={e => setToName(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Recipient Phone *</label>
                <input style={inputStyle} placeholder="0987654321" value={toPhone} onChange={e => setToPhone(e.target.value)} />
              </div>
            </div>

            <label style={labelStyle}>Delivery Address</label>
              <div style={{...inputStyle, color:'var(--accent2)', cursor:'default', opacity: buyerAddress ? 1 : 0.5}}>
                   {buyerAddress || 'Loading buyer address...'}
              </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 0.5rem' }}>
              {[
                { label: 'Weight (g)', val: weight, set: setWeight },
                { label: 'Length (cm)', val: length, set: setLength },
                { label: 'Width (cm)',  val: width,  set: setWidth  },
                { label: 'Height (cm)', val: height, set: setHeight },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label style={labelStyle}>{label}</label>
                  <input style={inputStyle} type="number" min="1" value={val} onChange={e => set(e.target.value)} />
                </div>
              ))}
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#f87171', marginBottom: '0.75rem' }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={handleClose}
                style={{ padding: '0.7rem', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}
              >Cancel</button>
              <button
                onClick={handleSubmit}
                style={{ padding: '0.7rem', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', background: 'var(--accent, #7c3aed)', border: '1px solid var(--accent)', color: '#fff' }}
              >📦 Create &amp; Mark Shipped</button>
            </div>
          </>
        )}

        {/* Step 2 — Loading */}
        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid rgba(124,58,237,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--muted)' }}>Creating GHN order...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Step 3 — Success */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎉</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Order code</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent2)', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>
              {orderCode}
            </div>
            <a
              href={`https://donhang.ghn.vn/?order_code=${orderCode}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.7rem 1.4rem', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, background: 'var(--accent)', color: '#fff', textDecoration: 'none', marginBottom: '1rem' }}
            >
              🔍 Track on GHN ↗
            </a>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.7 }}>
              The order code and tracking link have been saved to the contract chat. Both buyer and seller can track this shipment.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

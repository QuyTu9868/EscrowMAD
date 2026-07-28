'use client';

import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { CheckIcon, CloseIcon, PackageIcon, AlertIcon, CelebrateIcon, SearchIcon, ExternalLinkIcon , CameraIcon } from './Icons';

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
  const [proofFile,   setProofFile]   = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [uploading,   setUploading]   = useState(false);
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
    // Anh nay la bang chung cua seller ve tinh trang hang luc gui di.
    if (!proofFile) return setError('Please attach a photo of the item you are shipping.');

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

      let proofHash = '';
      try {
        setUploading(true);
        const form = new FormData();
        form.append('file', proofFile);
        const up = await fetch('/api/upload-ipfs', { method: 'POST', body: form });
        if (up.ok) proofHash = (await up.json()).hash;
      } catch { /* khong chan viec gui hang neu upload loi */ }
      finally { setUploading(false); }

      setOrderCode(data.order_code);
      setStep(3);
      onConfirm(data.order_code, proofHash); // callback về page.jsx để lưu Firestore + mark shipped
    } catch (e) {
      setStep(1);
      setError('Network error. Please try again.');
    }
  };

  if (!isOpen) return null;

  const inputStyle = {
    width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '0.6rem 0.85rem', color: 'var(--text)',
    fontFamily: 'var(--font-mono, monospace)', fontSize: '0.82rem', outline: 'none',
    marginBottom: '0.6rem', boxSizing: 'border-box',
  };
  const selectStyle = { ...inputStyle, cursor: 'pointer' };
  const labelStyle  = { fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel ship-panel">
        {/* Header */}
        <div className="ship-head">
          <div>
            <div className="ship-eyebrow">
              GHN Shipping
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {step === 3 ? <><CheckIcon size={16}/> Order Created</> : 'Create Delivery Order'}
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close modal"
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', lineHeight: 1, padding: '0.25rem', display: 'flex' }}
          ><CloseIcon size={18}/></button>
        </div>

        {/* Step 1 — Form */}
        {step === 1 && (
          <>
            <div style={{ background: 'var(--accent2-bg)', border: '1px solid var(--accent2)', borderRadius: '8px', padding: '0.6rem 0.75rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent2)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <PackageIcon size={14}/> Item: <strong>{itemDescription || '—'}</strong>
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
              <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--danger)', marginBottom: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <AlertIcon size={14}/> <span>{error}</span>
              </div>
            )}

            {/* Ảnh hàng thực tế lúc gửi — bằng chứng của seller, và là thứ
                AI agent đối chiếu nếu sau này có tranh chấp. */}
            <div style={{ marginTop: '0.9rem' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.66rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                Photo of the item being shipped
              </label>

              {proofPreview ? (
                <div style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofPreview} alt="Item being shipped" style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)', display: 'block' }} />
                  <button
                    type="button"
                    onClick={() => { setProofFile(null); setProofPreview(''); }}
                    style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.3rem 0.55rem', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}
                  >Change</button>
                </div>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', height: '86px', border: '1px dashed var(--border)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted)' }}>
                  <CameraIcon size={14} />
                  Attach photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setProofFile(f);
                      setProofPreview(URL.createObjectURL(f));
                    }}
                  />
                </label>
              )}

              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '0.5rem' }}>
                Kept as proof of condition at dispatch. If a dispute is raised later,
                this is what the agent compares against.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={handleClose}
                style={{ padding: '0.7rem', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}
              >Cancel</button>
              <button
                onClick={handleSubmit}
                style={{ padding: '0.7rem', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', background: 'var(--accent)', border: '1px solid var(--accent)', color: 'var(--accent-contrast)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
               disabled={uploading}><PackageIcon size={14}/> {uploading ? 'Uploading photo...' : 'Create & Mark Shipped'}</button>
            </div>
          </>
        )}

        {/* Step 2 — Loading */}
        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid var(--border)', borderTopColor: 'var(--text)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--muted)' }}>Creating GHN order...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Step 3 — Success */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--success)' }}><CelebrateIcon size={32}/></div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Order code</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent2)', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>
              {orderCode}
            </div>
            <a
              href={`https://donhang.ghn.vn/?order_code=${orderCode}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.7rem 1.4rem', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, background: 'var(--accent)', color: 'var(--accent-contrast)', textDecoration: 'none', marginBottom: '1rem' }}
            >
              <SearchIcon size={14}/> Track on GHN <ExternalLinkIcon size={12}/>
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
